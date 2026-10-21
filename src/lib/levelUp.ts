import { type Muscle, type Zone } from '@/lib/exercises';
import type { EquipmentAccess, Level } from '@/lib/profile';
import {
  SLOT_EXERCISE_COLUMNS,
  toSlotExercise,
  type ProgrammeDay,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';
import { supabase } from '@/lib/supabase';
import { EQUIPMENT_FOR_ACCESS, EXTRA_SWAP_SETS, nextZoneUp } from '@/lib/swaps';

/** Finished sessions at her current level before we offer a next-zone try. */
export const SESSIONS_BEFORE_OFFER = 4;
/** Times she needs to log the try before we offer a level-up. */
export const COMPLETIONS_TO_LEVEL = 2;

export const LEVEL_CHALLENGE_STATUSES = [
  'offered',
  'accepted',
  'ready',
  'declined',
  'completed',
  'level_declined',
] as const;
export type LevelChallengeStatus = (typeof LEVEL_CHALLENGE_STATUSES)[number];

export type ChallengeExercise = SlotExercise & {
  cues: string[];
  location_hint: string;
};

export type LevelChallenge = {
  id: string;
  from_level: Level;
  exercise: ChallengeExercise;
  status: Extract<LevelChallengeStatus, 'offered' | 'accepted' | 'ready'>;
  accepted_at: string | null;
  /** Finished sessions since she accepted that have at least one ticked set of the try. */
  completions: number;
};

export type ConfidenceHistory = {
  id: string;
  date: string;
  from_level: Level;
  to_level: Level;
  created_at: string;
};

const CHALLENGE_EXERCISE_COLUMNS = `${SLOT_EXERCISE_COLUMNS}, cues, location_hint`;

const OPEN_STATUSES: LevelChallenge['status'][] = ['offered', 'accepted', 'ready'];

function isOpenStatus(status: string): status is LevelChallenge['status'] {
  return OPEN_STATUSES.includes(status as LevelChallenge['status']);
}

function isMissingLevelUpTable(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`;
  return /42P01|level_challenges|confidence_history/i.test(detail);
}

function localDate(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function toChallengeExercise(row: ChallengeExercise): ChallengeExercise {
  return {
    ...toSlotExercise(row),
    cues: row.cues,
    location_hint: row.location_hint,
  };
}

async function fetchExerciseById(id: string): Promise<ChallengeExercise | null> {
  const { data, error } = await supabase
    .from('exercises')
    .select(CHALLENGE_EXERCISE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toChallengeExercise(data as ChallengeExercise) : null;
}

/** Adds the try as an extra slot if it isn't already in the day. Never replaces a familiar lift. */
export function includeChallengeExercise(
  day: ProgrammeDay,
  exercise: SlotExercise
): ProgrammeDay {
  if (day.exercises.some((item) => item.exercise.id === exercise.id)) return day;
  const position = Math.max(0, ...day.exercises.map((item) => item.position)) + 1;
  const extra: ProgrammeExercise = { position, ...EXTRA_SWAP_SETS, exercise, added: true };
  return { ...day, exercises: [...day.exercises, extra] };
}

export async function pickNextZoneExercise(
  access: EquipmentAccess,
  level: Level,
  preferMuscles: Muscle[] = [],
  excludeIds: string[] = []
): Promise<ChallengeExercise | null> {
    const zone = nextZoneUp(level as Zone);
  if (zone === null) return null;
  const allowed = EQUIPMENT_FOR_ACCESS[access];
  const { data, error } = await supabase
    .from('exercises')
    .select(CHALLENGE_EXERCISE_COLUMNS)
    .eq('zone', zone);
  if (error) throw error;

  const rows = ((data ?? []) as ChallengeExercise[])
    .map(toChallengeExercise)
    .filter(
      (row) => allowed.includes(row.equipment) && !excludeIds.includes(row.id)
    );
  if (rows.length === 0) return null;

  const muscleRank = (muscle: Muscle) => {
    const index = preferMuscles.indexOf(muscle);
    return index === -1 ? preferMuscles.length : index;
  };
  rows.sort(
    (a, b) =>
      muscleRank(a.primary_muscle) - muscleRank(b.primary_muscle) ||
      a.name.localeCompare(b.name)
  );
  return rows[0] ?? null;
}

async function fetchOpenChallengeRow(): Promise<{
  id: string;
  from_level: Level;
  exercise_id: string;
  status: string;
  accepted_at: string | null;
} | null> {
  const { data, error } = await supabase
    .from('level_challenges')
    .select('id, from_level, exercise_id, status, accepted_at')
    .is('resolved_at', null)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    from_level: Level;
    exercise_id: string;
    status: string;
    accepted_at: string | null;
  } | null;
}

async function countFinishedSessionsSince(since: string | null): Promise<number> {
  let query = supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .not('completed_at', 'is', null);
  if (since) query = query.gt('completed_at', since);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function latestResetAt(): Promise<string | null> {
  const [history, resolved] = await Promise.all([
    supabase
      .from('confidence_history')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('level_challenges')
      .select('resolved_at')
      .not('resolved_at', 'is', null)
      .order('resolved_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (history.error) throw history.error;
  if (resolved.error) throw resolved.error;
  const times = [history.data?.created_at, resolved.data?.resolved_at].filter(
    (value): value is string => Boolean(value)
  );
  if (times.length === 0) return null;
  return times.sort().at(-1) ?? null;
}

export async function countChallengeCompletions(
  exerciseId: string,
  since: string
): Promise<number> {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, sets!inner(exercise_id, completed)')
    .not('completed_at', 'is', null)
    .gte('completed_at', since)
    .eq('sets.exercise_id', exerciseId)
    .eq('sets.completed', true);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.id)).size;
}

async function toOpenChallenge(
  row: {
    id: string;
    from_level: Level;
    exercise_id: string;
    status: string;
    accepted_at: string | null;
  }
): Promise<LevelChallenge | null> {
  if (!isOpenStatus(row.status)) return null;
  const exercise = await fetchExerciseById(row.exercise_id);
  if (!exercise) {
    await resolveChallenge(row.id, 'declined');
    return null;
  }
  let status = row.status;
  let completions = 0;
  if ((status === 'accepted' || status === 'ready') && row.accepted_at) {
    completions = await countChallengeCompletions(exercise.id, row.accepted_at);
    if (status === 'accepted' && completions >= COMPLETIONS_TO_LEVEL) {
      await supabase.from('level_challenges').update({ status: 'ready' }).eq('id', row.id);
      status = 'ready';
    }
  }
  return {
    id: row.id,
    from_level: row.from_level,
    exercise,
    status,
    accepted_at: row.accepted_at,
    completions,
  };
}

/**
 * The current try, creating one after four sessions at this level when there isn't one.
 * Returns null at Level 4, when there's nothing in the next zone for her kit, or if the
 * SQL hasn't been run yet (the rest of the app keeps working).
 */
export async function ensureLevelChallenge(
  level: Level,
  access: EquipmentAccess,
  day: ProgrammeDay | null
): Promise<LevelChallenge | null> {
  try {
    const open = await fetchOpenChallengeRow();
    if (open) {
      if (open.from_level !== level) {
        await resolveChallenge(open.id, open.from_level < level ? 'completed' : 'declined');
      } else {
        return toOpenChallenge(open);
      }
    }

    if (level === 4) return null;
    const since = await latestResetAt();
    const sessions = await countFinishedSessionsSince(since);
    if (sessions < SESSIONS_BEFORE_OFFER) return null;

    const preferMuscles = day?.exercises.map((item) => item.exercise.primary_muscle) ?? [];
    const excludeIds = day?.exercises.map((item) => item.exercise.id) ?? [];
    const exercise = await pickNextZoneExercise(access, level, preferMuscles, excludeIds);
    if (!exercise) return null;

    const { data, error } = await supabase
      .from('level_challenges')
      .insert({ from_level: level, exercise_id: exercise.id, status: 'offered' })
      .select('id, from_level, exercise_id, status, accepted_at')
      .single();
    if (error) {
      if (error.code === '23505') {
        const again = await fetchOpenChallengeRow();
        return again ? toOpenChallenge(again) : null;
      }
      throw error;
    }
    return toOpenChallenge(
      data as {
        id: string;
        from_level: Level;
        exercise_id: string;
        status: string;
        accepted_at: string | null;
      }
    );
  } catch (error) {
    if (error && typeof error === 'object' && isMissingLevelUpTable(error)) return null;
    throw error;
  }
}

export async function fetchOpenLevelChallenge(level: Level): Promise<LevelChallenge | null> {
  try {
    const open = await fetchOpenChallengeRow();
    if (!open || open.from_level !== level) return null;
    return toOpenChallenge(open);
  } catch (error) {
    if (error && typeof error === 'object' && isMissingLevelUpTable(error)) return null;
    throw error;
  }
}

export async function acceptLevelChallenge(id: string): Promise<void> {
  const { error } = await supabase
    .from('level_challenges')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', id)
    .is('resolved_at', null);
  if (error) throw error;
}

export async function declineLevelChallenge(id: string): Promise<void> {
  await resolveChallenge(id, 'declined');
}

export async function declineLevelUp(id: string): Promise<void> {
  await resolveChallenge(id, 'level_declined');
}

async function resolveChallenge(
  id: string,
  status: Extract<LevelChallengeStatus, 'declined' | 'completed' | 'level_declined'>
): Promise<void> {
  const { error } = await supabase
    .from('level_challenges')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Writes a history row and closes any open try. Safe to call if the SQL hasn't been run. */
export async function recordLevelChange(from: Level, to: Level): Promise<void> {
  if (from === to) return;
  try {
    const { error } = await supabase.from('confidence_history').insert({
      date: localDate(),
      from_level: from,
      to_level: to,
    });
    if (error) throw error;
    const open = await fetchOpenChallengeRow();
    if (open) {
      await resolveChallenge(open.id, to > from ? 'completed' : 'declined');
    }
  } catch (error) {
    if (error && typeof error === 'object' && isMissingLevelUpTable(error)) return;
    throw error;
  }
}

/** For testers: offer a try now, ignoring the four-session wait. */
export async function debugOfferLevelChallenge(
  level: Level,
  access: EquipmentAccess,
  day: ProgrammeDay | null
): Promise<LevelChallenge | null> {
  const open = await fetchOpenChallengeRow();
  if (open) await resolveChallenge(open.id, 'declined');
  const preferMuscles = day?.exercises.map((item) => item.exercise.primary_muscle) ?? [];
  const excludeIds = day?.exercises.map((item) => item.exercise.id) ?? [];
  const exercise = await pickNextZoneExercise(access, level, preferMuscles, excludeIds);
  if (!exercise) return null;
  const { data, error } = await supabase
    .from('level_challenges')
    .insert({ from_level: level, exercise_id: exercise.id, status: 'offered' })
    .select('id, from_level, exercise_id, status, accepted_at')
    .single();
  if (error) throw error;
  return toOpenChallenge(
    data as {
      id: string;
      from_level: Level;
      exercise_id: string;
      status: string;
      accepted_at: string | null;
    }
  );
}

export async function debugMarkChallengeReady(): Promise<void> {
  const open = await fetchOpenChallengeRow();
  if (!open) return;
  const acceptedAt = open.accepted_at ?? new Date().toISOString();
  const { error } = await supabase
    .from('level_challenges')
    .update({ status: 'ready', accepted_at: acceptedAt })
    .eq('id', open.id);
  if (error) throw error;
}

export async function debugResetLevelChallenge(): Promise<void> {
  const open = await fetchOpenChallengeRow();
  if (open) await resolveChallenge(open.id, 'declined');
}

export function nextLevel(level: Level): Level | null {
  return level < 4 ? ((level + 1) as Level) : null;
}

/** Oldest first. Empty if she hasn't changed level, or if level_up.sql hasn't been run. */
export async function fetchConfidenceHistory(): Promise<ConfidenceHistory[]> {
  try {
    const { data, error } = await supabase
      .from('confidence_history')
      .select('id, date, from_level, to_level, created_at')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ConfidenceHistory[];
  } catch (error) {
    if (error && typeof error === 'object' && isMissingLevelUpTable(error)) return [];
    throw error;
  }
}
