import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * False when the build has no Supabase keys (e.g. an EAS build made before the
 * EXPO_PUBLIC_ variables were added on expo.dev). The root layout then shows a
 * "setup problem" screen instead of the app crashing on launch.
 */
export const SUPABASE_CONFIGURED = Boolean(supabaseUrl && supabasePublishableKey);

if (!SUPABASE_CONFIGURED) {
  console.error(
    'Missing Supabase keys. Locally: copy .env.example to .env and restart `npx expo start`. EAS builds: add the EXPO_PUBLIC_ variables on expo.dev, then build again.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://missing-config.supabase.co',
  supabasePublishableKey || 'missing-key',
  {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  }
);

// Only refresh the session token while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
