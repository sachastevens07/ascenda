/**
 * Sign in with Apple (expo-apple-authentication + Supabase ID-token sign-in).
 *
 * Safe on builds made before the library was added: isAvailableAsync() then returns false and the
 * Apple button is never rendered. Needs a new dev build, the Sign in with Apple capability on the
 * App ID (EAS syncs it from app.json `usesAppleSignIn`), and the Apple provider switched on in
 * Supabase with the bundle ID `app.evoluma` as a Client ID. Linking Apple to the anonymous
 * onboarding user also needs "Allow manual linking" on in Supabase Auth settings.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type AppleResult =
  | { status: 'ok' }
  | { status: 'cancelled' }
  /** This Apple ID already belongs to another Evoluma account. */
  | { status: 'exists' }
  | { status: 'error'; message: string };

export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** True once we know the Apple button can be shown on this phone and build. */
export function useAppleSignInAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    void appleSignInAvailable().then((value) => {
      if (live) setAvailable(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return available;
}

async function appleIdentityToken(): Promise<{ token: string } | AppleResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!credential.identityToken) return { status: 'error', message: 'Apple did not return a sign-in token.' };
    return { token: credential.identityToken };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') return { status: 'cancelled' };
    return { status: 'error', message: (error as Error).message ?? 'Sign in with Apple failed.' };
  }
}

function isExistingIdentity(message: string): boolean {
  return /already|exists|linked to another/i.test(message);
}

/** Log in or create an account with Apple (welcome and log-in screens). */
export async function signInWithApple(): Promise<AppleResult> {
  const result = await appleIdentityToken();
  if (!('token' in result)) return result;
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: result.token });
  if (error) return { status: 'error', message: error.message };
  return { status: 'ok' };
}

/**
 * "Save your plan": turn the anonymous onboarding user into a real account with Apple.
 * Same user id, so her answers and any purchase stay with her.
 */
export async function linkAppleToCurrentUser(): Promise<AppleResult> {
  const result = await appleIdentityToken();
  if (!('token' in result)) return result;
  const { error } = await supabase.auth.linkIdentity({ provider: 'apple', token: result.token });
  if (error) {
    if (isExistingIdentity(error.message)) return { status: 'exists' };
    return { status: 'error', message: error.message };
  }
  return { status: 'ok' };
}

export { AppleAuthentication };
