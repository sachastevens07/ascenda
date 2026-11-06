/**
 * Light selection feedback for onboarding (X5).
 * expo-haptics is not in the project yet. This is a no-op until Sacha confirms adding it.
 */
export function hapticSelection(): void {
  // Intentionally empty. Ask before adding expo-haptics.
}

export function hapticLight(): void {
  hapticSelection();
}
