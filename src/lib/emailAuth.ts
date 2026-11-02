import * as Linking from 'expo-linking';
import type { AuthError, EmailOtpType } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

const OTP_TYPES: EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

function firstString(value: string | string[] | undefined | null): string | undefined {
  if (Array.isArray(value)) return value[0] || undefined;
  return value || undefined;
}

function paramsFromUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parsed = Linking.parse(url);
  for (const [key, value] of Object.entries(parsed.queryParams ?? {})) {
    const text = firstString(value);
    if (text) out[key] = text;
  }
  const hashIndex = url.indexOf('#');
  if (hashIndex >= 0) {
    const hash = url.slice(hashIndex + 1);
    const queryStart = hash.indexOf('?');
    const hashQuery = queryStart >= 0 ? hash.slice(queryStart + 1) : hash;
    for (const [key, value] of new URLSearchParams(hashQuery)) {
      if (value) out[key] = value;
    }
  }
  return out;
}

function otpType(value: string | undefined): EmailOtpType {
  if (value && OTP_TYPES.includes(value as EmailOtpType)) return value as EmailOtpType;
  return 'signup';
}

export function authRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

export function isAuthCallbackUrl(url: string): boolean {
  const params = paramsFromUrl(url);
  return Boolean(
    params.code ||
      params.token_hash ||
      (params.access_token && params.refresh_token) ||
      params.error
  );
}

export function isEmailNotConfirmed(error: AuthError): boolean {
  return error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message);
}

export function describeAuthLinkError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/expired|invalid|otp/i.test(message)) {
    return 'This link has expired or already been used. Ask for a new email.';
  }
  return message || 'We couldn’t finish signing you in. Try the link again, or ask for a new email.';
}

let inFlight: Promise<boolean> | null = null;
let inFlightUrl: string | null = null;

/** Completes sign-in from a confirmation (or magic) link. No-ops on unrelated URLs. */
export function completeSessionFromUrl(url: string): Promise<boolean> {
  if (!isAuthCallbackUrl(url)) return Promise.resolve(false);
  if (inFlight && inFlightUrl === url) return inFlight;
  inFlightUrl = url;
  inFlight = (async () => {
    try {
      const params = paramsFromUrl(url);
      if (params.error) {
        throw new Error(
          (params.error_description || 'This link has expired. Ask for a new email.').replace(
            /\+/g,
            ' '
          )
        );
      }
      if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (error) throw error;
        return true;
      }
      if (params.token_hash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: params.token_hash,
          type: otpType(params.type),
        });
        if (error) throw error;
        return true;
      }
      if (params.access_token && params.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (error) throw error;
        return true;
      }
      return false;
    } catch (error) {
      if (inFlightUrl === url) {
        inFlight = null;
        inFlightUrl = null;
      }
      throw error;
    }
  })();
  return inFlight;
}

export async function resendSignupEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}
