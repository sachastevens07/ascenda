import microcopy from '../../content/microcopy/en-GB.json';

const profile = microcopy.strings.profile;

/** Appearance picker labels from content/microcopy. Microcopy is bundled, not synced to Supabase. */
export const appearanceLabels = {
  light: profile.appearance.light,
  dark: profile.appearance.dark,
  system: profile.appearance.system,
} as const;

export const appearanceSectionTitle = profile.settings_rows.appearance;

/** Logger strings from content/microcopy. Bundled, not loaded by content:sync. */
export const loggerCopy = microcopy.strings.logger;

export function fillCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}
