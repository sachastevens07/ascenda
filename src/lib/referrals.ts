/**
 * Refer a friend (AGENTS.md X6).
 * Personal Ascenda codes track who invited whom. The friend's 14-day trial is
 * Apple Offer Code FRIEND14 on the annual plan. Rewards are applied by the
 * RevenueCat webhook, not from the app.
 */
import * as Linking from 'expo-linking';
import { router, type Href } from 'expo-router';
import { Platform, Share } from 'react-native';

import file from '../../content/referrals/offers.json';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { showDialog } from '@/components/Dialog';
import { fillCopy, referCopy } from '@/lib/copy';
import { presentOfferCodeSheet } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOCAL_CODE_KEY = 'referral_code';
const PENDING_CODE_KEY = 'pending_referral_code';

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const offers = asRecord(file);

export const FRIEND_TRIAL_DAYS = num(offers.friend_trial_days, 14);
export const MAX_REWARDS_PER_YEAR = num(offers.max_rewards_per_year, 2);
export const APPLE_OFFER_CODE = text(offers.apple_offer_code, 'FRIEND14').toUpperCase();
export const EXTEND_DAYS = num(offers.extend_days, 30);
export const INVITE_PATH = text(offers.invite_path, 'r');

export type ReferralStatus = 'invited' | 'trial' | 'subscribed' | 'rewarded';

export type ReferralInvite = {
  id: string;
  status: ReferralStatus;
  createdAt: string;
};

const STATUSES = new Set<ReferralStatus>(['invited', 'trial', 'subscribed', 'rewarded']);

function isMissingReferralSchema(error: { message?: string; code?: string } | null | undefined): boolean {
  const haystack = `${error?.code ?? ''} ${error?.message ?? ''}`;
  return /referral_code|referrals|claim_referral|PGRST202|42P01|42703/i.test(haystack);
}

function randomCode(): string {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function parseReferralCode(raw: string | string[] | undefined | null): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const trimmed = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (trimmed.length < 4 || trimmed.length > 12) return null;
  return trimmed;
}

export function inviteLinkForCode(code: string): string {
  return Linking.createURL(`${INVITE_PATH}/${code}`);
}

export function openRefer(): void {
  router.push('/refer' as Href);
}

export async function captureInviteCode(code: string): Promise<void> {
  const parsed = parseReferralCode(code);
  if (!parsed) return;
  await AsyncStorage.setItem(PENDING_CODE_KEY, parsed);
}

export async function hasReferralOffer(): Promise<boolean> {
  const pending = parseReferralCode((await AsyncStorage.getItem(PENDING_CODE_KEY)) ?? undefined);
  if (pending) return true;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase
      .from('referrals')
      .select('status')
      .eq('invitee_id', user.id)
      .maybeSingle();
    if (error || !data) return false;
    const status = (data as { status?: string }).status;
    return status === 'invited' || status === 'trial';
  } catch {
    return false;
  }
}

export async function ensureMyReferralCode(): Promise<string | null> {
  const stored = parseReferralCode((await AsyncStorage.getItem(LOCAL_CODE_KEY)) ?? undefined);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return stored;

  const { data, error } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!error) {
    const remote = parseReferralCode((data as { referral_code?: string | null } | null)?.referral_code);
    if (remote) {
      await AsyncStorage.setItem(LOCAL_CODE_KEY, remote);
      return remote;
    }
  } else if (!isMissingReferralSchema(error) && !stored) {
    return null;
  }

  let candidate = stored ?? randomCode();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) candidate = randomCode();
    await AsyncStorage.setItem(LOCAL_CODE_KEY, candidate);
    const { error: writeError } = await supabase
      .from('profiles')
      .update({ referral_code: candidate })
      .eq('user_id', user.id)
      .is('referral_code', null);
    if (!writeError) {
      const { data: again } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('user_id', user.id)
        .maybeSingle();
      const saved = parseReferralCode((again as { referral_code?: string | null } | null)?.referral_code);
      if (saved) {
        await AsyncStorage.setItem(LOCAL_CODE_KEY, saved);
        return saved;
      }
      return candidate;
    }
    if (isMissingReferralSchema(writeError)) return candidate;
    if (writeError.code === '23505') continue;
    const { data: existing } = await supabase
      .from('profiles')
      .select('referral_code')
      .eq('user_id', user.id)
      .maybeSingle();
    const saved = parseReferralCode((existing as { referral_code?: string | null } | null)?.referral_code);
    if (saved) {
      await AsyncStorage.setItem(LOCAL_CODE_KEY, saved);
      return saved;
    }
  }
  return candidate;
}

export async function claimPendingReferral(): Promise<ReferralStatus | null> {
  const pending = parseReferralCode((await AsyncStorage.getItem(PENDING_CODE_KEY)) ?? undefined);
  if (!pending) return fetchMyClaimedStatus();

  const own = await ensureMyReferralCode();
  if (own && own === pending) {
    await AsyncStorage.removeItem(PENDING_CODE_KEY);
    return null;
  }

  const { data, error } = await supabase.rpc('claim_referral', { p_code: pending });
  if (error) {
    if (isMissingReferralSchema(error)) return null;
    const message = `${error.message ?? ''} ${error.code ?? ''}`;
    if (/own_code|P0001/i.test(message)) {
      await AsyncStorage.removeItem(PENDING_CODE_KEY);
      return null;
    }
    if (/unknown_code|P0002/i.test(message)) {
      await AsyncStorage.removeItem(PENDING_CODE_KEY);
      return null;
    }
    return fetchMyClaimedStatus();
  }

  await AsyncStorage.removeItem(PENDING_CODE_KEY);
  const row = Array.isArray(data) ? data[0] : data;
  const status = (row as { status?: string } | null)?.status;
  return status && STATUSES.has(status as ReferralStatus) ? (status as ReferralStatus) : 'invited';
}

async function fetchMyClaimedStatus(): Promise<ReferralStatus | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('referrals')
      .select('status')
      .eq('invitee_id', user.id)
      .maybeSingle();
    if (error || !data) return null;
    const status = (data as { status?: string }).status;
    return status && STATUSES.has(status as ReferralStatus) ? (status as ReferralStatus) : null;
  } catch {
    return null;
  }
}

export async function fetchMyInvites(): Promise<ReferralInvite[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('referrals')
    .select('id, status, created_at')
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as { id: string; status: string; created_at: string }[])
    .filter((row) => STATUSES.has(row.status as ReferralStatus))
    .map((row) => ({
      id: row.id,
      status: row.status as ReferralStatus,
      createdAt: row.created_at,
    }));
}

export async function shareInvite(code: string): Promise<void> {
  const message = fillCopy(referCopy.share_message, {
    code,
    link: inviteLinkForCode(code),
    friend_trial_days: FRIEND_TRIAL_DAYS,
  });
  await Share.share({ message, title: referCopy.screen_title });
}

/** No clipboard library: the share sheet is how she copies the code. */
export async function shareReferralCode(code: string): Promise<void> {
  await Share.share({ message: code, title: referCopy.code_label });
}

export async function redeemFriendOffer(): Promise<'opened' | 'skipped' | 'unavailable'> {
  if (Platform.OS !== 'ios') return 'unavailable';
  return new Promise((resolve) => {
    showDialog(
      fillCopy(referCopy.redeem_title, { friend_trial_days: FRIEND_TRIAL_DAYS }),
      fillCopy(referCopy.redeem_body, {
        apple_offer_code: APPLE_OFFER_CODE,
        friend_trial_days: FRIEND_TRIAL_DAYS,
      }),
      [
        {
          text: referCopy.redeem_cta,
          onPress: () => {
            void presentOfferCodeSheet().then((opened) => resolve(opened ? 'opened' : 'unavailable'));
          },
        },
        {
          text: referCopy.redeem_later,
          style: 'cancel',
          onPress: () => resolve('skipped'),
        },
      ]
    );
  });
}
