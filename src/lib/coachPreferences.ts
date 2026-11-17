import { supabase } from '@/lib/supabase';

export type CoachPreferenceKind = 'avoid_exercise' | 'no_equipment_at_my_gym';
export type CoachPreferenceReason = 'dislike' | 'not_available' | 'other';

export type CoachPreference = {
  id: string;
  kind: CoachPreferenceKind;
  exercise_id: string | null;
  equipment: string | null;
  reason: CoachPreferenceReason;
  created_at: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isMissing(error: { message?: string; code?: string } | null | undefined): boolean {
  return /coach_preferences|schema cache/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

export async function fetchCoachPreferences(): Promise<CoachPreference[]> {
  const { data, error } = await supabase
    .from('coach_preferences')
    .select('id, kind, exercise_id, equipment, reason, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return (data ?? []).flatMap((row) => {
    const item = asRecord(row);
    const kind = text(item.kind);
    const reason = text(item.reason);
    if (kind !== 'avoid_exercise' && kind !== 'no_equipment_at_my_gym') return [];
    return [
      {
        id: text(item.id),
        kind,
        exercise_id: text(item.exercise_id) || null,
        equipment: text(item.equipment) || null,
        reason: reason === 'not_available' || reason === 'other' ? reason : 'dislike',
        created_at: text(item.created_at),
      },
    ];
  });
}

/** Periods, menopause, symptoms and other health reasons must never be stored as a preference. */
export function isHealthPreferenceText(value: string): boolean {
  return /period|menopause|perimenopause|hot flush|hrt|symptom|cycle phase|follicular|luteal|ovulat|cramp|pms|health|injur|pain|medication|supplement/.test(
    value.toLowerCase()
  );
}

export async function saveCoachPreference(input: {
  kind: CoachPreferenceKind;
  exercise_id: string | null;
  equipment: string | null;
  reason: CoachPreferenceReason;
}): Promise<void> {
  const blob = `${input.kind} ${input.exercise_id ?? ''} ${input.equipment ?? ''} ${input.reason}`;
  if (isHealthPreferenceText(blob)) {
    throw new Error('Do not save a preference for a health or medical reason.');
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  const { error } = await supabase.from('coach_preferences').insert({
    user_id: user.id,
    kind: input.kind,
    exercise_id: input.exercise_id,
    equipment: input.equipment,
    reason: input.reason,
  });
  if (error && !isMissing(error)) throw error;
}

export async function deleteCoachPreference(id: string): Promise<void> {
  const { error } = await supabase.from('coach_preferences').delete().eq('id', id);
  if (error && !isMissing(error)) throw error;
}

export function preferenceLabel(item: CoachPreference, exerciseName?: string): string {
  if (item.kind === 'avoid_exercise') {
    return `Never give ${exerciseName || item.exercise_id || 'that exercise'}`;
  }
  return `My gym has no ${item.equipment?.replace(/_/g, ' ') || 'that equipment'}`;
}

export function preferenceAvoidIds(prefs: CoachPreference[]): string[] {
  return prefs.filter((item) => item.kind === 'avoid_exercise' && item.exercise_id).map((item) => item.exercise_id as string);
}

export function preferenceBlockedEquipment(prefs: CoachPreference[]): string[] {
  return prefs
    .filter((item) => item.kind === 'no_equipment_at_my_gym' && item.equipment)
    .map((item) => item.equipment as string);
}
