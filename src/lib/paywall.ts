import { router, type Href } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';

import { track } from '@/lib/analytics';

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
  'general',
] as const;

export type PaywallReason = (typeof PAYWALL_REASONS)[number];

export type PaywallCopy = {
  eyebrow: string;
  title: string;
  body: string;
};

const COPY: Record<PaywallReason, PaywallCopy> = {
  onboarding: {
    eyebrow: 'Your plan is ready',
    title: 'Unlock the full routine library',
    body: 'Pro opens every routine, the pick we made for you, charts, a roadmap and private photos. Logging stays free either way.',
  },
  routine: {
    eyebrow: 'Pro routine',
    title: 'This plan is part of Pro',
    body: 'Start it with Pro, or keep the two free starter routines. Logging and your history stay free.',
  },
  stretch: {
    eyebrow: 'Pro stretch',
    title: 'Unlock every stretch session',
    body: 'Three timed sessions stay free. Pro opens the rest. Logging stays free either way.',
  },
  'custom-limit': {
    eyebrow: 'Free includes 4 workouts',
    title: 'Save as many as you like',
    body: 'You’ve used the four free custom workouts. Duplicates count towards that. The shared starter does not. Pro is unlimited. The ones you already have stay.',
  },
  charts: {
    eyebrow: 'Progress charts',
    title: 'See your lifts over time',
    body: 'Pro adds weekly session charts and weight over time on each lift. Personal bests stay free.',
  },
  roadmap: {
    eyebrow: 'Routine roadmap',
    title: 'See the weeks ahead',
    body: 'Pro shows each week of your routine and which days you’ve finished.',
  },
  review: {
    eyebrow: 'End-of-routine review',
    title: 'See how the plan went',
    body: 'When a routine finishes, Pro unlocks a short review of the weeks you logged.',
  },
  photos: {
    eyebrow: 'Progress photos',
    title: 'Keep private photos',
    body: 'Pro stores them in a private folder on your account. Hidden until you tap Show photos, and never sent to AI.',
  },
  path: {
    eyebrow: 'Programme path',
    title: 'See the map ahead',
    body: 'Pro shows the full path from Gym Confidence onwards. The first routine on the path can stay free.',
  },
  challenge: {
    eyebrow: 'Challenge',
    title: 'Join with Pro',
    body: 'This challenge is part of Pro. Logging stays free. Join when you are ready.',
  },
  general: {
    eyebrow: 'Ascenda Pro',
    title: 'Everything in one plan',
    body: 'All routines, unlimited custom workouts, charts, a roadmap and private photos. Logging stays free forever.',
  },
};

export const PRO_FEATURES = [
  { icon: 'map-outline' as const, text: 'Every routine, stretch and programme path' },
  { icon: 'add-circle-outline' as const, text: 'Unlimited custom workouts' },
  { icon: 'stats-chart-outline' as const, text: 'Progress charts and a week-by-week roadmap' },
  { icon: 'flag-outline' as const, text: 'End-of-routine review and every achievement' },
  { icon: 'camera-outline' as const, text: 'Private progress photos, never sent to AI' },
];

export const FREE_ALWAYS =
  'Always free: logging, full history, export, the exercise library, two starter routines, a few stretch sessions, the planner, your week and streak, basic achievements and post-session wins.';

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

export function defaultPackageId(packages: PurchasesPackage[]): string | null {
  return (
    packages.find((item) => item.packageType === 'ANNUAL')?.identifier ??
    packages[0]?.identifier ??
    null
  );
}
