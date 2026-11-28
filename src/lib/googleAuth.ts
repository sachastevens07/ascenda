/**
 * Sign in with Google (@react-native-google-signin/google-signin + Supabase ID-token sign-in).
 *
 * The Google button shows only when the client IDs are filled in (app.json, extra.google) and the
 * build includes the native module. Builds made before the library was added, or without the IDs,
 * simply don't show it. Supabase: Auth → Providers → Google on, Client IDs "<web id>,<ios id>",
 * "Skip nonce checks" on (the iOS SDK adds its own nonce).
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { AppleResult } from '@/lib/appleAuth';
import { supabase } from '@/lib/supabase';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let mod: GoogleModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('@react-native-google-signin/google-signin') as GoogleModule;
} catch {
  // Native module missing in this build.
  mod = null;
}

type GoogleConfig = { iosClientId?: string; webClientId?: string };

function googleConfig(): GoogleConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as { google?: GoogleConfig };
  return extra.google ?? {};
}

let configured = false;

/** iOS only for now (Android needs its own client and SHA-1 set up in Google Cloud). */
export function googleSignInAvailable(): boolean {
  const { iosClientId, webClientId } = googleConfig();
  return Platform.OS === 'ios' && mod !== null && Boolean(iosClientId) && Boolean(webClientId);
}

function ensureConfigured(google: GoogleModule): void {
  if (configured) return;
  const { iosClientId, webClientId } = googleConfig();
  google.GoogleSignin.configure({ iosClientId, webClientId });
  configured = true;
}

async function googleIdToken(): Promise<{ token: string } | AppleResult> {
  if (!mod || !googleSignInAvailable()) return { status: 'error', message: 'Google sign-in is not set up.' };
  try {
    ensureConfigured(mod);
    // Always show the account picker, so she can choose which Google account to use.
    await mod.GoogleSignin.signOut().catch(() => {});
    const response = await mod.GoogleSignin.signIn();
    if (!mod.isSuccessResponse(response)) return { status: 'cancelled' };
    const token = response.data.idToken;
    if (!token) return { status: 'error', message: 'Google did not return a sign-in token.' };
    return { token };
  } catch (error) {
    if (mod.isErrorWithCode(error) && error.code === mod.statusCodes.IN_PROGRESS) return { status: 'cancelled' };
    return { status: 'error', message: (error as Error).message ?? 'Sign in with Google failed.' };
  }
}

/** Log in or create an account with Google (log-in screen). */
export async function signInWithGoogle(): Promise<AppleResult> {
  const result = await googleIdToken();
  if (!('token' in result)) return result;
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: result.token });
  if (error) return { status: 'error', message: error.message };
  return { status: 'ok' };
}

/** "Save your plan": add Google to the anonymous onboarding user. Same user id, nothing lost. */
export async function linkGoogleToCurrentUser(): Promise<AppleResult> {
  const result = await googleIdToken();
  if (!('token' in result)) return result;
  const { error } = await supabase.auth.linkIdentity({ provider: 'google', token: result.token });
  if (error) {
    if (/already|exists|linked to another/i.test(error.message)) return { status: 'exists' };
    return { status: 'error', message: error.message };
  }
  return { status: 'ok' };
}
