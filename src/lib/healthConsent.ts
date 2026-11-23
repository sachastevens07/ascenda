/**
 * Explicit health consents (B3). life_stage is special-category data:
 * save it only after she ticks the consent screen, and never send it to
 * Coach, PostHog, RevenueCat, notifications, share cards or recaps.
 * Period dates use the same table with purpose period_log (see periodLog.ts).
 */
import { LIFE_STAGE_CONSENT_SCREEN } from '@/lib/onboardingContent';
import {
  parseLifeStageChoice,
  type LifeStageChoice,
} from '@/lib/onboardingAnswers';
import { LIFE_STAGES, type HealthConsent, type LifeStage } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

export const LIFE_STAGE_PURPOSE =
  LIFE_STAGE_CONSENT_SCREEN?.consent_purpose || 'life_stage_personalisation';
export const LIFE_STAGE_CONSENT_VERSION = LIFE_STAGE_CONSENT_SCREEN?.consent_version ?? 1;

function isMissingHealthConsents(error: { message?: string; code?: string }): boolean {
  return /health_consents|life_stage/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function asConsent(row: Record<string, unknown>): HealthConsent | null {
  const id = typeof row.id === 'string' ? row.id : '';
  const user_id = typeof row.user_id === 'string' ? row.user_id : '';
  const purpose = typeof row.purpose === 'string' ? row.purpose : '';
  const consent_version = Number(row.consent_version);
  const granted_at = typeof row.granted_at === 'string' ? row.granted_at : '';
  if (!id || !user_id || !purpose || !granted_at || !Number.isInteger(consent_version)) return null;
  return {
    id,
    user_id,
    purpose,
    consent_version,
    granted_at,
    withdrawn_at: typeof row.withdrawn_at === 'string' ? row.withdrawn_at : null,
  };
}

export function isSavableLifeStage(value: string | null | undefined): value is LifeStage {
  return (LIFE_STAGES as readonly string[]).includes(String(value));
}

export function lifeStageNeedsConsent(choice: LifeStageChoice): boolean {
  return isSavableLifeStage(choice);
}

/** Active row for life_stage_personalisation, or null if none / withdrawn / SQL missing. */
export async function fetchActiveLifeStageConsent(): Promise<HealthConsent | null> {
  const { data, error } = await supabase
    .from('health_consents')
    .select('id, user_id, purpose, consent_version, granted_at, withdrawn_at')
    .eq('purpose', LIFE_STAGE_PURPOSE)
    .is('withdrawn_at', null)
    .maybeSingle();
  if (error) {
    if (isMissingHealthConsents(error)) return null;
    throw error;
  }
  if (!data || typeof data !== 'object') return null;
  return asConsent(data as Record<string, unknown>);
}

export async function grantLifeStageConsent(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in.');
  const now = new Date().toISOString();
  const { data: existing, error: readError } = await supabase
    .from('health_consents')
    .select('id, withdrawn_at')
    .eq('user_id', user.id)
    .eq('purpose', LIFE_STAGE_PURPOSE)
    .maybeSingle();
  if (readError) throw readError;
  if (existing && typeof existing === 'object' && 'id' in existing) {
    const { error } = await supabase
      .from('health_consents')
      .update({
        consent_version: LIFE_STAGE_CONSENT_VERSION,
        granted_at: now,
        withdrawn_at: null,
      })
      .eq('id', (existing as { id: string }).id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('health_consents').insert({
    user_id: user.id,
    purpose: LIFE_STAGE_PURPOSE,
    consent_version: LIFE_STAGE_CONSENT_VERSION,
    granted_at: now,
    withdrawn_at: null,
  });
  if (error) throw error;
}

/** Clears profiles.life_stage and sets withdrawn_at on the consent row. */
export async function withdrawLifeStageConsent(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in.');
  const now = new Date().toISOString();
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ life_stage: null })
    .eq('user_id', user.id);
  if (profileError && !isMissingHealthConsents(profileError)) throw profileError;
  const { error } = await supabase
    .from('health_consents')
    .update({ withdrawn_at: now })
    .eq('user_id', user.id)
    .eq('purpose', LIFE_STAGE_PURPOSE)
    .is('withdrawn_at', null);
  if (error && !isMissingHealthConsents(error)) throw error;
}

/**
 * Writes profiles.life_stage after consent, or clears it for none / prefer_not.
 * Does not write when she picked a stage and declined consent.
 */
export async function persistLifeStageChoice(input: {
  choice: LifeStageChoice;
  consented: boolean;
  saveLifeStage: (value: LifeStage | null) => Promise<void>;
}): Promise<void> {
  const choice = parseLifeStageChoice(input.choice) ?? 'prefer_not';
  if (choice === 'none' || choice === 'prefer_not') {
    await input.saveLifeStage(null);
    return;
  }
  if (!input.consented || !isSavableLifeStage(choice)) return;
  await grantLifeStageConsent();
  await input.saveLifeStage(choice);
}
