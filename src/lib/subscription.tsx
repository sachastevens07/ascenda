import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Linking, Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesError,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from 'react-native-purchases';

import { useAuth } from '@/lib/auth';
import { useDevTools } from '@/lib/devFlags';
import { formatShortDate } from '@/lib/progress';
import { Notifications } from '@/lib/restTimer';

/** The entitlement identifier in the RevenueCat dashboard. */
export const PRO_ENTITLEMENT = 'ascenda_pro';
export const REMINDER_DAYS_BEFORE = 2;
export const STORE_NAME = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_ID = 'trial-ending';
const REMINDER_CHANNEL_ID = 'reminders';
const DEV_OVERRIDE_KEY = 'dev-pro-override';

// Expo Go only accepts a Test Store key (test_...): it can't reach the real stores.
const API_KEY =
  (__DEV__ ? process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY : undefined) ||
  Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  }) ||
  '';

export type ProStatus = {
  isPro: boolean;
  /** Set while she's in the free trial. */
  trialEndsAt: Date | null;
  /** When Pro renews or ends. Null for free (or lifetime). */
  expiresAt: Date | null;
  willRenew: boolean;
};

/** Development builds only: pretend to be free, Pro, or on a trial that ends in 2 days. */
export const DEV_OVERRIDES = ['off', 'free', 'pro', 'trial-ending'] as const;
export type DevOverride = (typeof DEV_OVERRIDES)[number];

export const DEV_OVERRIDE_LABELS: Record<DevOverride, string> = {
  off: 'Real status',
  free: 'Free',
  pro: 'Pro',
  'trial-ending': 'Trial ending in 2 days',
};

type SubscriptionState = ProStatus & {
  isLoading: boolean;
  /** False when no RevenueCat key is set for this platform. */
  isAvailable: boolean;
  managementUrl: string | null;
  devOverride: DevOverride;
  setDevOverride: (value: DevOverride) => void;
  /** Purchase or restore result; the listener also picks these up. */
  applyCustomerInfo: (info: CustomerInfo) => void;
};

const FREE: ProStatus = { isPro: false, trialEndsAt: null, expiresAt: null, willRenew: false };

const SubscriptionContext = createContext<SubscriptionState>({
  ...FREE,
  isLoading: true,
  isAvailable: false,
  managementUrl: null,
  devOverride: 'off',
  setDevOverride: () => {},
  applyCustomerInfo: () => {},
});

let configureResult: boolean | null = null;

/** Configures RevenueCat once. False if there's no usable key for this platform. */
function configureOnce(): boolean {
  if (configureResult === null) {
    try {
      if (API_KEY) Purchases.configure({ apiKey: API_KEY });
      configureResult = !!API_KEY;
    } catch {
      configureResult = false;
    }
  }
  return configureResult;
}

function toStatus(info: CustomerInfo | null): ProStatus {
  const entitlement = info?.entitlements.active[PRO_ENTITLEMENT];
  if (!entitlement) return FREE;
  const expiresAt = entitlement.expirationDate ? new Date(entitlement.expirationDate) : null;
  return {
    isPro: true,
    trialEndsAt: entitlement.periodType === 'TRIAL' ? expiresAt : null,
    expiresAt,
    willRenew: entitlement.willRenew,
  };
}

function overrideStatus(value: DevOverride): ProStatus | null {
  switch (value) {
    case 'off':
      return null;
    case 'free':
      return FREE;
    case 'pro':
      return { isPro: true, trialEndsAt: null, expiresAt: null, willRenew: true };
    case 'trial-ending': {
      const endsAt = new Date(Date.now() + REMINDER_DAYS_BEFORE * DAY_MS - 60_000);
      return { isPro: true, trialEndsAt: endsAt, expiresAt: endsAt, willRenew: true };
    }
  }
}

async function ensureReminderPermission(): Promise<boolean> {
  if (!Notifications) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Schedules the "trial ends in 2 days" notification, replacing any earlier one. Null cancels it. */
async function updateTrialReminder(trialEndsAt: Date | null): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  if (!trialEndsAt) return;
  const remindAt = trialEndsAt.getTime() - REMINDER_DAYS_BEFORE * DAY_MS;
  if (remindAt <= Date.now()) return;
  if (!(await ensureReminderPermission())) return;
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: `Your free trial ends in ${REMINDER_DAYS_BEFORE} days`,
      body: `Pro starts on ${formatShortDate(trialEndsAt)} unless you cancel. You can manage it from Profile.`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(remindAt),
      channelId: REMINDER_CHANNEL_ID,
    },
  });
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { showDevTools } = useDevTools();
  const userId = session?.user.id ?? null;
  const isAvailable = configureOnce();
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(isAvailable);
  const [devOverride, setDevOverrideState] = useState<DevOverride>('off');

  useEffect(() => {
    AsyncStorage.getItem(DEV_OVERRIDE_KEY)
      .then((value) => {
        const stored = DEV_OVERRIDES.find((option) => option === value);
        if (stored) setDevOverrideState(stored);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAvailable) return;
    const listener = (customerInfo: CustomerInfo) => setInfo(customerInfo);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [isAvailable]);

  // Ties purchases to her Supabase account, so Pro follows her to a new phone.
  useEffect(() => {
    if (!isAvailable) return;
    let isCurrent = true;
    setIsLoading(true);
    (async () => {
      try {
        if (userId) {
          const { customerInfo } = await Purchases.logIn(userId);
          if (isCurrent) setInfo(customerInfo);
        } else {
          if (isCurrent) setInfo(null);
          await Purchases.logOut().catch(() => {});
        }
      } catch {
        if (isCurrent) setInfo(null);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [isAvailable, userId]);

  const realStatus = useMemo(() => toStatus(info), [info]);
  const reminderAt = realStatus.willRenew ? (realStatus.trialEndsAt?.getTime() ?? null) : null;

  useEffect(() => {
    if (isLoading) return;
    updateTrialReminder(reminderAt === null ? null : new Date(reminderAt)).catch(() => {});
  }, [isLoading, reminderAt]);

  const setDevOverride = useCallback((value: DevOverride) => {
    setDevOverrideState(value);
    AsyncStorage.setItem(DEV_OVERRIDE_KEY, value).catch(() => {});
  }, []);

  const value = useMemo<SubscriptionState>(() => {
    const status = (showDevTools ? overrideStatus(devOverride) : null) ?? realStatus;
    return {
      ...status,
      isLoading,
      isAvailable,
      managementUrl: info?.managementURL ?? null,
      devOverride,
      setDevOverride,
      applyCustomerInfo: setInfo,
    };
  }, [realStatus, devOverride, showDevTools, isLoading, isAvailable, info, setDevOverride]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionState {
  return useContext(SubscriptionContext);
}

/** True in the last 2 days of a trial that will turn into a paid plan. */
export function isTrialEndingSoon({ trialEndsAt, willRenew }: ProStatus): boolean {
  return (
    trialEndsAt !== null &&
    willRenew &&
    trialEndsAt.getTime() - Date.now() <= REMINDER_DAYS_BEFORE * DAY_MS
  );
}

export function hasProEntitlement(info: CustomerInfo): boolean {
  return info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

/** The monthly and annual packages from the current offering, annual first. */
export async function fetchProPackages(): Promise<PurchasesPackage[]> {
  if (!configureOnce()) return [];
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  const order = ['ANNUAL', 'MONTHLY'];
  return packages
    .filter((item) => order.includes(item.packageType))
    .sort((a, b) => order.indexOf(a.packageType) - order.indexOf(b.packageType));
}

/** Null if she backed out of the store's purchase sheet. */
export async function purchasePackage(item: PurchasesPackage): Promise<CustomerInfo | null> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(item);
    return customerInfo;
  } catch (error) {
    if ((error as PurchasesError).userCancelled) return null;
    throw error;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

/** Opens the App Store / Google Play page where she can cancel or change her plan. */
export async function openManageSubscription(managementUrl: string | null): Promise<void> {
  if (managementUrl) {
    await Linking.openURL(managementUrl);
    return;
  }
  await Purchases.showManageSubscriptions();
}

/** Length of the product's free trial in days, or null if it doesn't have one. */
export function getFreeTrialDays(product: PurchasesStoreProduct): number | null {
  const freePeriod =
    product.defaultOption?.freePhase?.billingPeriod.iso8601 ??
    (product.introPrice?.price === 0 ? product.introPrice.period : null);
  const match = freePeriod?.match(/^P(\d+)([DWM])$/);
  if (!match) return null;
  const days = { D: 1, W: 7, M: 30 }[match[2] as 'D' | 'W' | 'M'];
  return Number(match[1]) * days;
}
