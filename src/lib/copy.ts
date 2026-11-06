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

/** Logger strings from content/microcopy. Bundled, not loaded by content:sync. */
export const loggerCopy = microcopy.strings.logger;

/** Shown when exercise media is missing, rate-limited or fails. */
export const mediaUnavailableCopy = microcopy.strings.errors.media_unavailable;

export function fillCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}
