import { supabase } from '@/lib/supabase';

/** One row of the `sessions` table. */
export type Session = {
  id: string;
  date: string;
  programme_day_id: string | null;
  started_at: string;
  /** Null while the session is in progress. */
  completed_at: string | null;
  /** Swapped slots in this session: slot position (as text) → exercise id. */
  exercise_swaps: Record<string, string>;
};

/** One row of the `sets` table. */
export type LoggedSet = {
  session_id: string;
  exercise_id: string;
  set_number: number;
  /** Null for bodyweight and band exercises. */
  weight_kg: number | null;
  reps: number | null;
  completed: boolean;
};

const SESSION_COLUMNS = 'id, date, programme_day_id, started_at, completed_at, exercise_swaps';
const SET_COLUMNS = 'session_id, exercise_id, set_number, weight_kg, reps, completed';

/** Today's date on the phone, as YYYY-MM-DD. */
function localDate(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Postgres numerics arrive as strings; turn them back into numbers. */
function toLoggedSet(row: Record<string, unknown>): LoggedSet {
  return {
    ...(row as LoggedSet),
    weight_kg: row.weight_kg === null ? null : Number(row.weight_kg),
  };
}

export async function fetchSession(id: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Session | null;
}

/** The most recent session that hasn't been finished, if any. */
export async function fetchActiveSession(): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_COLUMNS)
    .is('completed_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Session | null;
}

/** The most recently finished session, if any. */
export async function fetchLastFinishedSession(): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_COLUMNS)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Session | null;
}

export async function startSession(
  programmeDayId: string,
  exerciseSwaps: Record<string, string> = {}
): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ programme_day_id: programmeDayId, date: localDate(), exercise_swaps: exerciseSwaps })
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw error;
  return data as Session;
}

export async function saveSessionSwaps(
  id: string,
  exerciseSwaps: Record<string, string>
): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ exercise_swaps: exerciseSwaps })
    .eq('id', id);
  if (error) throw error;
}

export async function finishSession(id: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Deletes the session and every set logged in it. */
export async function discardSession(id: string): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchSessionSets(sessionId: string): Promise<LoggedSet[]> {
  const { data, error } = await supabase
    .from('sets')
    .select(SET_COLUMNS)
    .eq('session_id', sessionId);
  if (error) throw error;
  return (data ?? []).map(toLoggedSet);
}

/** Saves one set, replacing anything already logged for that set in this session. */
export async function saveSet(set: LoggedSet): Promise<void> {
  const { error } = await supabase.from('sets').upsert(
    { ...set, completed_at: set.completed ? new Date().toISOString() : null },
    { onConflict: 'session_id,exercise_id,set_number' }
  );
  if (error) throw error;
}

/**
 * For each exercise, the completed sets from the most recent other session she did it in,
 * ordered by set number. Exercises she's never logged are left out.
 */
export async function fetchPreviousSets(
  exerciseIds: string[],
  excludeSessionId: string | null = null
): Promise<Record<string, LoggedSet[]>> {
  if (exerciseIds.length === 0) return {};
  let query = supabase
    .from('sets')
    .select(SET_COLUMNS)
    .in('exercise_id', exerciseIds)
    .eq('completed', true)
    .order('completed_at', { ascending: false })
    .limit(500);
  if (excludeSessionId) query = query.neq('session_id', excludeSessionId);
  const { data, error } = await query;
  if (error) throw error;

  const latestSession: Record<string, string> = {};
  const previous: Record<string, LoggedSet[]> = {};
  for (const set of (data ?? []).map(toLoggedSet)) {
    latestSession[set.exercise_id] ??= set.session_id;
    if (latestSession[set.exercise_id] !== set.session_id) continue;
    (previous[set.exercise_id] ??= []).push(set);
  }
  for (const sets of Object.values(previous)) {
    sets.sort((a, b) => a.set_number - b.set_number);
  }
  return previous;
}

/** The heaviest weight in a list of sets, or null if none had a weight. */
export function heaviestWeight(sets: LoggedSet[] | undefined): number | null {
  const weights = (sets ?? []).flatMap((set) => (set.weight_kg === null ? [] : [set.weight_kg]));
  return weights.length > 0 ? Math.max(...weights) : null;
}
