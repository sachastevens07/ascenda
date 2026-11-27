/**
 * Light haptics (expo-haptics). Loaded defensively: a dev build made before the
 * library was added has no native module, so every call quietly does nothing there.
 */
type HapticsModule = typeof import('expo-haptics');

let mod: HapticsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-haptics') as HapticsModule;
} catch {
  mod = null;
}

function safe(run: (haptics: HapticsModule) => Promise<void>): void {
  if (!mod) return;
  try {
    run(mod).catch(() => {});
  } catch {
    // Native module missing in this build.
  }
}

/** A choice was picked (chips, cards, pills). */
export function selectionTap(): void {
  safe((haptics) => haptics.selectionAsync());
}

/** A main button was pressed. */
export function lightTap(): void {
  safe((haptics) => haptics.impactAsync(haptics.ImpactFeedbackStyle.Light));
}

/** Something finished well: the plan is ready, she committed. */
export function successTap(): void {
  safe((haptics) => haptics.notificationAsync(haptics.NotificationFeedbackType.Success));
}

/** Older names, used by the onboarding inputs. */
export const hapticSelection = selectionTap;
export const hapticLight = lightTap;
