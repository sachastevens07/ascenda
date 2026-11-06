import microcopy from '../../content/microcopy/en-GB.json';

const profile = microcopy.strings.profile;
const safety = microcopy.strings.safety;

/** Appearance picker labels from content/microcopy. Microcopy is bundled, not synced to Supabase. */
export const appearanceLabels = {
  light: profile.appearance.light,
  dark: profile.appearance.dark,
  system: profile.appearance.system,
} as const;

export const appearanceSectionTitle = profile.settings_rows.appearance;

/** Surrounding safety strings. The full disclaimer body stays in src/lib/disclaimer.ts. */
export const safetyCopy = {
  onboarding_title: safety.onboarding_title,
  onboarding_checkbox: safety.onboarding_checkbox,
  onboarding_cta: safety.onboarding_cta,
  updated_title: safety.updated_title,
  updated_body: safety.updated_body,
  updated_cta: safety.updated_cta,
  first_session_sheet_title: safety.first_session_sheet_title,
  first_session_link: safety.first_session_link,
  first_session_cta: safety.first_session_cta,
  footer_line: safety.footer_line,
} as const;

export const safetySettingsTitle = profile.settings_rows.safety;

const subscription = microcopy.strings.subscription_status;

/** Profile → Plan and subscription. Prices still come from RevenueCat. */
export const subscriptionStatusCopy = {
  title: subscription.title,
  chip_trial: subscription.chip_trial,
  chip_active: subscription.chip_active,
  chip_active_cancelled: subscription.chip_active_cancelled,
  chip_grace: subscription.chip_grace,
  chip_expired: subscription.chip_expired,
  manage: subscription.manage,
  manage_help: subscription.manage_help,
  restore: subscription.restore,
  how_to_cancel_title: subscription.how_to_cancel_title,
  how_to_cancel_body: subscription.how_to_cancel_body,
} as const;

export const planSettingsTitle = profile.settings_rows.plan;

const paywall = microcopy.strings.paywall;

export const restoreCopy = {
  restore: paywall.restore,
  none: paywall.restore_none,
  success: paywall.restore_success,
  error: paywall.error,
} as const;

export const paywallScreenCopy = {
  headline_with_plan: paywall.headline_with_plan,
  headline_fallback: paywall.headline_fallback,
  title: paywall.headline_fallback,
  body: paywall.subheadline,
  subheadline: paywall.subheadline,
  benefits: paywall.benefits,
  annual_title: paywall.annual_title,
  annual_trial_line: paywall.annual_trial_line,
  annual_monthly_equiv: paywall.annual_monthly_equiv,
  annual_tag: paywall.annual_tag,
  monthly_title: paywall.monthly_title,
  monthly_line: paywall.monthly_line,
  cta_trial: paywall.cta_trial,
  cta_subscribe: paywall.cta_subscribe,
  small_print_trial: paywall.small_print_trial,
  small_print_monthly: paywall.small_print_monthly,
  restore: paywall.restore,
  terms: paywall.terms,
  privacy: paywall.privacy,
  close_a11y: paywall.close_a11y,
  purchasing: paywall.purchasing,
  success_title: paywall.success_title,
  success_body: paywall.success_body,
  error: paywall.error,
} as const;

export const lockedHomeCopy = microcopy.strings.locked_home;

export const referCopy = microcopy.strings.refer;

export const subscriptionBanners = {
  trial_ending: subscription.banner_trial_ending,
  trial_ending_cta: subscription.banner_trial_ending_cta,
  grace: subscription.banner_grace,
  grace_cta: subscription.banner_grace_cta,
  dismiss_a11y: subscription.banner_dismiss_a11y,
} as const;

const notifications = microcopy.strings.notifications;

/** Trial-ending and annual-renewal pushes. {date} and {price} come from RevenueCat. */
export const billingReminderCopy = {
  trial_ending: notifications.trial_ending,
  renewal: notifications.renewal_reminder,
} as const;

/** Logger strings from content/microcopy. Bundled, not loaded by content:sync. */
export const loggerCopy = microcopy.strings.logger;

/** Shown when exercise media is missing, rate-limited or fails. */
export const mediaUnavailableCopy = microcopy.strings.errors.media_unavailable;

export function fillCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}
