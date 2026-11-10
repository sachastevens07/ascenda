import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import type { PurchasesPackage } from 'react-native-purchases';

import { track } from '@/lib/analytics';
import { paywallScreenCopy } from '@/lib/copy';
import { getSubscriptionAccess, useSubscription } from '@/lib/subscription';

export const PAYWALL_REASONS = [
  'onboarding',
  'routine',
  'stretch',
  'custom-limit',
  'charts',
  'roadmap',
  'review',
  'photos',
  'path',
  'challenge',
  'learn',
  'general',
] as const;

export type PaywallReason = (typeof PAYWALL_REASONS)[number];

export type PaywallCopy = {
  eyebrow: string;
  title: string;
  body: string;
};

const HARD_PAYWALL: PaywallCopy = {
  eyebrow: 'Your plan is ready',
  title: paywallScreenCopy.title,
  body: paywallScreenCopy.body,
};

const COPY: Record<PaywallReason, PaywallCopy> = {
  onboarding: HARD_PAYWALL,
  routine: HARD_PAYWALL,
  stretch: HARD_PAYWALL,
  'custom-limit': HARD_PAYWALL,
  charts: HARD_PAYWALL,
  roadmap: HARD_PAYWALL,
  review: HARD_PAYWALL,
  photos: HARD_PAYWALL,
  path: HARD_PAYWALL,
  challenge: HARD_PAYWALL,
  learn: HARD_PAYWALL,
  general: HARD_PAYWALL,
};

const BENEFIT_ICONS = [
  'map-outline',
  'barbell-outline',
  'stats-chart-outline',
  'leaf-outline',
] as const;

type BenefitIcon = (typeof BENEFIT_ICONS)[number] | 'checkmark-circle-outline';

export const PRO_FEATURES: { icon: BenefitIcon; text: string }[] = paywallScreenCopy.benefits.map(
  (text, index) => ({
    icon: BENEFIT_ICONS[index] ?? 'checkmark-circle-outline',
    text,
  })
);

export function isPaywallReason(value: string | undefined): value is PaywallReason {
  return PAYWALL_REASONS.includes(value as PaywallReason);
}

export function paywallCopy(reason: PaywallReason): PaywallCopy {
  return COPY[reason];
}

export function openPaywall(reason: PaywallReason = 'general'): void {
  track('paywall_viewed', { reason });
  router.push({ pathname: '/paywall', params: { reason } } as Href);
}

/** False while status is loading or she has no trial, paid plan or billing grace. Opens the paywall. */
export function ensureSubscribed(): boolean {
  const { isPro, isLoading } = getSubscriptionAccess();
  if (isLoading) return false;
  if (isPro) return true;
  openPaywall('onboarding');
  return false;
}

const UNLOCKED_WITHOUT_SUB = new Set([
  '/',
  '/programmes',
  '/food',
  '/planner',
  '/activity',
  '/paywall',
  '/profile',
  '/history',
  '/safety',
  '/terms',
  '/privacy',
  '/onboarding',
  '/accept-disclaimer',
  '/sign-in',
  '/check-inbox',
  '/auth',
  '/refer',
]);

export function isReferralPath(pathname: string): boolean {
  return pathname === '/refer' || pathname === '/r' || pathname.startsWith('/r/');
}

/** Account, legal, paywall, refer and locked home stay reachable without a subscription. */
export function isUnlockedWithoutSubscription(pathname: string): boolean {
  return UNLOCKED_WITHOUT_SUB.has(pathname) || isReferralPath(pathname);
}

/** Logger and stretch player: send her to locked home if she has no access. */
export function useSubscriptionGate(): boolean {
  const { isPro, isLoading } = useSubscription();
  useEffect(() => {
    if (isLoading || isPro) return;
    router.replace('/');
  }, [isLoading, isPro]);
  return isPro;
}

export function defaultPackageId(packages: PurchasesPackage[]): string | null {
  return (
    packages.find((item) => item.packageType === 'ANNUAL')?.identifier ??
    packages[0]?.identifier ??
    null
  );
}
