/**
 * Launch feature flags. Flip one constant and rebuild; do not delete the hidden
 * content, screens or database rows. Stretch sessions already logged still count.
 */
export const STRETCHES_ENABLED = false;

export const FEATURES = {
  stretches: STRETCHES_ENABLED,
} as const;

export type FeatureName = keyof typeof FEATURES;

export function isFeatureEnabled(name: FeatureName): boolean {
  return FEATURES[name];
}

/** React helper. Flags are compile-time constants, so this does not subscribe. */
export function useFeature(name: FeatureName): boolean {
  return isFeatureEnabled(name);
}
