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

import { trackPaidPlan, trackTrialStarted } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { billingReminderCopy, fillCopy } from '@/lib/copy';
import { useDevTools } from '@/lib/devFlags';
import { formatShortDate } from '@/lib/progress';
import { Notifications } from '@/lib/restTimer';

/** The entitlement identifier in the RevenueCat dashboard. */
export const PRO_ENTITLEMENT = 'ascenda_pro';
export const REMINDER_DAYS_BEFORE = 2;
/** Annual renewal push and Home banner. Not a countdown. */
export const RENEWAL_DAYS_BEFORE = 7;
export const STORE_NAME = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_REMINDER_ID = 'trial-ending';
const RENEWAL_REMINDER_ID = 'annual-renewal';
function testBillingReminderId(kind: 'trial' | 'renewal'): string {
  return kind === 'trial' ? 'dev-billing-reminder-test-trial' : 'dev-billing-reminder-test-renewal';
}
const REMINDER_CHANNEL_ID = 'reminders';
const DEV_OVERRIDE_KEY = 'dev-access-override';

// Expo Go only accepts a Test Store key (test_...): it can't reach the real stores.
const API_KEY =
  (__DEV__ ? process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY : undefined) ||
  Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  }) ||
  '';

/** Server and Profile use these. `isPro` is true for trial, active and grace. */
export type SubscriptionAccess = 'none' | 'trial' | 'active' | 'grace' | 'expired';

export type ProStatus = {
  /** True while the `ascenda_pro` entitlement is in trial, paid or billing grace. */
  isPro: boolean;
  status: SubscriptionAccess;
  /** Set while she's in the free trial. */
  trialEndsAt: Date | null;
  /** When the entitlement renews or ends. Null if there is no period. */
  expiresAt: Date | null;
  willRenew: boolean;
  /** Localised price of the current product, from RevenueCat. */
  priceString: string | null;
  /** True when the current product is the annual plan. */
  isAnnual: boolean;
};

/** Development builds only: pretend each subscription state for sandbox testing. */
export const DEV_OVERRIDES = ['off', 'free', 'pro', 'trial-ending', 'grace', 'expired', 'renewal-soon'] as const;
export type DevOverride = (typeof DEV_OVERRIDES)[number];

export const DEV_OVERRIDE_LABELS: Record<DevOverride, string> = {
  off: 'Real status',
  free: 'No subscription',
  pro: 'Subscribed',
  'trial-ending': 'Trial ending in 2 days',
  grace: 'Billing grace period',
  expired: 'Expired (lapsed)',
  'renewal-soon': 'Annual renews in 6 days',
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

const FREE: ProStatus = {
  isPro: false,
  status: 'none',
  trialEndsAt: null,
  expiresAt: null,
  willRenew: false,
  priceString: null,
  isAnnual: false,
};

const SubscriptionContext = createContext<SubscriptionState>({
  ...FREE,
  isLoading: true,
  isAvailable: false,
  managementUrl: null,
  devOverride: 'off',
  setDevOverride: () => {},
  applyCustomerInfo: () => {},
});

type AccessSnapshot = { isPro: boolean; isLoading: boolean };
let accessSnapshot: AccessSnapshot = { isPro: false, isLoading: true };

/** Latest entitlement, including the Dev tools override. Safe to call outside React. */
export function getSubscriptionAccess(): AccessSnapshot {
  return accessSnapshot;
}

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

function productIdFromInfo(info: CustomerInfo | null): string | null {
  return (
    info?.entitlements.active[PRO_ENTITLEMENT]?.productIdentifier ??
    info?.entitlements.all[PRO_ENTITLEMENT]?.productIdentifier ??
    null
  );
}

function isAnnualIdentifier(identifier: string | null): boolean {
  return Boolean(identifier && /annual/i.test(identifier));
}

async function catalogForProduct(
  identifier: string | null
): Promise<{ priceString: string; isAnnual: boolean } | null> {
  if (!identifier) return null;
  const packages = await fetchProPackages();
  const match =
    packages.find((item) => item.product.identifier === identifier) ??
    packages.find((item) =>
      identifier.toLowerCase().includes(item.packageType === 'ANNUAL' ? 'annual' : 'monthly')
    );
  if (!match) return null;
  return {
    priceString: match.product.priceString,
    isAnnual: match.packageType === 'ANNUAL',
  };
}

function toStatus(
  info: CustomerInfo | null,
  catalog: { priceString: string; isAnnual: boolean } | null
): ProStatus {
  const active = info?.entitlements.active[PRO_ENTITLEMENT];
  const known = active ?? info?.entitlements.all[PRO_ENTITLEMENT];
  const productId = productIdFromInfo(info);
  const priceString = catalog?.priceString ?? null;
  const isAnnual = catalog?.isAnnual ?? isAnnualIdentifier(productId);
  if (!known) return { ...FREE, priceString, isAnnual };
  const expiresAt = known.expirationDate ? new Date(known.expirationDate) : null;
  if (!active) {
    return {
      isPro: false,
      status: 'expired',
      trialEndsAt: null,
      expiresAt,
      willRenew: false,
      priceString,
      isAnnual,
    };
  }
  const billingIssue = Boolean(active.billingIssueDetectedAt);
  const trial = active.periodType === 'TRIAL';
  return {
    isPro: true,
    status: billingIssue ? 'grace' : trial ? 'trial' : 'active',
    trialEndsAt: trial ? expiresAt : null,
    expiresAt,
    willRenew: active.willRenew,
    priceString,
    isAnnual,
  };
}

function overrideStatus(value: DevOverride): ProStatus | null {
  switch (value) {
    case 'off':
      return null;
    case 'free':
      return FREE;
    case 'pro':
      return {
        isPro: true,
        status: 'active',
        trialEndsAt: null,
        expiresAt: null,
        willRenew: true,
        priceString: null,
        isAnnual: true,
      };
    case 'trial-ending': {
      const endsAt = new Date(Date.now() + REMINDER_DAYS_BEFORE * DAY_MS - 60_000);
      return {
        isPro: true,
        status: 'trial',
        trialEndsAt: endsAt,
        expiresAt: endsAt,
        willRenew: true,
        priceString: null,
        isAnnual: true,
      };
    }
    case 'grace': {
      const endsAt = new Date(Date.now() + 3 * DAY_MS);
      return {
        isPro: true,
        status: 'grace',
        trialEndsAt: null,
        expiresAt: endsAt,
        willRenew: true,
        priceString: null,
        isAnnual: true,
      };
    }
    case 'expired':
      return {
        isPro: false,
        status: 'expired',
        trialEndsAt: null,
        expiresAt: new Date(),
        willRenew: false,
        priceString: null,
        isAnnual: true,
      };
    case 'renewal-soon': {
      const endsAt = new Date(Date.now() + (RENEWAL_DAYS_BEFORE - 1) * DAY_MS);
      return {
        isPro: true,
        status: 'active',
        trialEndsAt: null,
        expiresAt: endsAt,
        willRenew: true,
        priceString: null,
        isAnnual: true,
      };
    }
  }
}

function fillDatePrice(template: { title: string; body: string }, date: Date, price: string | null) {
  const bodyTemplate = price ? template.body : template.body.replace(' at {price}', '');
  return {
    title: template.title,
    body: fillCopy(bodyTemplate, { date: formatShortDate(date), price: price ?? '' }),
  };
}

async function billingNotificationsAllowed(): Promise<boolean> {
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  return current.granted;
}

async function ensureBillingChannel(): Promise<void> {
  if (!Notifications || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function cancelBillingReminders(): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
  await Notifications.cancelScheduledNotificationAsync(RENEWAL_REMINDER_ID);
}

async function scheduleDatedReminder(id: string, fireAt: Date, title: string, body: string): Promise<void> {
  if (!Notifications) return;
  if (fireAt.getTime() <= Date.now()) return;
  if (!(await billingNotificationsAllowed())) return;
  await ensureBillingChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
}

/** Trial (2 days before) and annual renewal (7 days before). Push only if notifications are already allowed. */
async function updateBillingReminders(input: {
  trialEndsAt: Date | null;
  renewalAt: Date | null;
  priceString: string | null;
}): Promise<void> {
  await cancelBillingReminders();
  if (input.trialEndsAt) {
    const copy = fillDatePrice(billingReminderCopy.trial_ending, input.trialEndsAt, input.priceString);
    await scheduleDatedReminder(
      TRIAL_REMINDER_ID,
      new Date(input.trialEndsAt.getTime() - REMINDER_DAYS_BEFORE * DAY_MS),
      copy.title,
      copy.body
    );
  }
  if (input.renewalAt) {
    const copy = fillDatePrice(billingReminderCopy.renewal, input.renewalAt, input.priceString);
    await scheduleDatedReminder(
      RENEWAL_REMINDER_ID,
      new Date(input.renewalAt.getTime() - RENEWAL_DAYS_BEFORE * DAY_MS),
      copy.title,
      copy.body
    );
  }
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { showDevTools } = useDevTools();
  const userId = session?.user.id ?? null;
  const isAvailable = configureOnce();
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [catalog, setCatalog] = useState<{ priceString: string; isAnnual: boolean } | null>(null);
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

  const productId = productIdFromInfo(info);

  useEffect(() => {
    if (!isAvailable) {
      setCatalog(null);
      return;
    }
    let isCurrent = true;
    catalogForProduct(productId)
      .then((result) => {
        if (isCurrent) setCatalog(result);
      })
      .catch(() => {
        if (isCurrent) setCatalog(null);
      });
    return () => {
      isCurrent = false;
    };
  }, [isAvailable, productId]);

  const realStatus = useMemo(() => toStatus(info, catalog), [info, catalog]);
  const trialReminderAt = realStatus.willRenew ? (realStatus.trialEndsAt?.getTime() ?? null) : null;
  const renewalReminderAt =
    realStatus.status === 'active' && realStatus.willRenew && realStatus.isAnnual
      ? (realStatus.expiresAt?.getTime() ?? null)
      : null;

  useEffect(() => {
    if (isLoading) return;
    updateBillingReminders({
      trialEndsAt: trialReminderAt === null ? null : new Date(trialReminderAt),
      renewalAt: renewalReminderAt === null ? null : new Date(renewalReminderAt),
      priceString: realStatus.priceString,
    }).catch(() => {});
  }, [isLoading, trialReminderAt, renewalReminderAt, realStatus.priceString]);

  useEffect(() => {
    if (isLoading || !userId) return;
    const product = realStatus.isAnnual ? 'annual' : 'monthly';
    if (realStatus.status === 'trial' && realStatus.trialEndsAt) {
      void trackTrialStarted(userId, product, realStatus.trialEndsAt);
    }
    if (realStatus.status === 'active') {
      void trackPaidPlan(userId, product);
    }
  }, [isLoading, userId, realStatus.status, realStatus.trialEndsAt, realStatus.isAnnual]);

  const setDevOverride = useCallback((value: DevOverride) => {
    setDevOverrideState(value);
    AsyncStorage.setItem(DEV_OVERRIDE_KEY, value).catch(() => {});
  }, []);

  const value = useMemo<SubscriptionState>(() => {
    const overridden = showDevTools ? overrideStatus(devOverride) : null;
    const status = overridden
      ? {
          ...overridden,
          priceString: realStatus.priceString,
          isAnnual: overridden.isAnnual || realStatus.isAnnual,
        }
      : realStatus;
    accessSnapshot = { isPro: status.isPro, isLoading };
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

/** True in the last 7 days of an annual plan that will renew. */
export function isRenewalSoon({ status, expiresAt, willRenew, isAnnual }: ProStatus): boolean {
  return (
    status === 'active' &&
    isAnnual &&
    willRenew &&
    expiresAt !== null &&
    expiresAt.getTime() - Date.now() <= RENEWAL_DAYS_BEFORE * DAY_MS
  );
}

function billingCopyForTest(kind: 'trial' | 'renewal', date: Date, price: string | null) {
  return fillDatePrice(
    kind === 'trial' ? billingReminderCopy.trial_ending : billingReminderCopy.renewal,
    date,
    price
  );
}

/** Tester helper: trial-ending or annual-renewal copy in a few seconds. */
export async function scheduleTestBillingReminder(
  kind: 'trial' | 'renewal',
  priceString: string | null
): Promise<boolean> {
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted) {
    if (!current.canAskAgain) return false;
    const requested = await Notifications.requestPermissionsAsync();
    if (!requested.granted) return false;
  }
  await ensureBillingChannel();
  const date = new Date(Date.now() + (kind === 'trial' ? REMINDER_DAYS_BEFORE : RENEWAL_DAYS_BEFORE) * DAY_MS);
  const copy = billingCopyForTest(kind, date, priceString);
  const id = testBillingReminderId(kind);
  await Notifications.cancelScheduledNotificationAsync(id);
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title: copy.title, body: copy.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 8,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
  return true;
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

export async function fetchCustomerInfo(): Promise<CustomerInfo | null> {
  if (!configureOnce()) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

/** iOS Offer Code redeem sheet. False in Expo Go or when the store API is missing. */
export async function presentOfferCodeSheet(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const present = (
    Purchases as { presentCodeRedemptionSheet?: () => Promise<void> }
  ).presentCodeRedemptionSheet;
  if (typeof present !== 'function') return false;
  try {
    await present.call(Purchases);
    return true;
  } catch {
    return false;
  }
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
