/**
 * Extra developer controls (plan override, restart block, SQL hints).
 * Expo Go is always `__DEV__`, so testers would see these without a second flag.
 * Set EXPO_PUBLIC_SHOW_DEV_TOOLS=true in `.env` and restart the bundler.
 */
export const SHOW_DEV_TOOLS = __DEV__ && process.env.EXPO_PUBLIC_SHOW_DEV_TOOLS === 'true';
