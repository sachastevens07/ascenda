import microcopy from '../../content/microcopy/en-GB.json';

const profile = microcopy.strings.profile;

/** Appearance picker labels from content/microcopy. Microcopy is bundled, not synced to Supabase. */
export const appearanceLabels = {
  light: profile.appearance.light,
  dark: profile.appearance.dark,
  system: profile.appearance.system,
} as const;

export const appearanceSectionTitle = profile.settings_rows.appearance;
