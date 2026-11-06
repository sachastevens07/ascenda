import { track } from '@/lib/analytics';
import { parseSessionType, sessionTypeFromSource, type SessionType } from '@/lib/sessionTypes';
import { supabase } from '@/lib/supabase';

export type SessionSource = 'programme' | 'custom' | 'ai' | 'routine' | 'stretch';

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
  source: SessionSource;
  custom_workout_id: string | null;
  block_id: string | null;
  routine_enrolment_id: string | null;
  routine_day_id: string | null;
  /** Strength, cardio or recovery. Defaults from source until W1 SQL is pasted. */
  type: SessionType;
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

const SESSION_COLUMNS_ROUTINES =
  'id, date, programme_day_id, started_at, completed_at, exercise_swaps, source, custom_workout_id, block_id, routine_enrolment_id, routine_day_id';
const SESSION_COLUMNS =
  'id, date, programme_day_id, started_at, completed_at, exercise_swaps, source, custom_workout_id, block_id';
const SESSION_COLUMNS_CUSTOM =
  'id, date, programme_day_id, started_at, completed_at, exercise_swaps, source, custom_workout_id';
const SESSION_COLUMNS_LEGACY = 'id, date, programme_day_id, started_at, completed_at, exercise_swaps';
const SET_COLUMNS = 'session_id, exercise_id, set_number, weight_kg, reps, completed';

function isMissingRoutineSessionColumns(error: { message?: string; code?: string }): boolean {
  return /routine_enrolment_id|routine_day_id/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingBlockColumn(error: { message?: string; code?: string }): boolean {
  return /block_id/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingCustomSessionColumns(error: { message?: string; code?: string }): boolean {
  return /source|custom_workout_id/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingSessionTypeColumn(error: { message?: string; code?: string }): boolean {
  return /Could not find the 'type' column of 'sessions'|column sessions\.type/i.test(
    `${error.code ?? ''} ${error.message ?? ''}`
  );
}

const SESSION_COLUMNS_ROUTINES_W1 = `${SESSION_COLUMNS_ROUTINES}, type`;

function toSession(row: Session | null): Session | null {
  if (!row) return null;
  return {
    ...row,
    source: row.source ?? 'programme',
    custom_workout_id: row.custom_workout_id ?? null,
    block_id: row.block_id ?? null,
    routine_enrolment_id: row.routine_enrolment_id ?? null,
    routine_day_id: row.routine_day_id ?? null,
    exercise_swaps: row.exercise_swaps ?? {},
    type: parseSessionType(row.type, sessionTypeFromSource(row.source ?? 'programme')),
  };
}

type SessionWriteResult = {
  data: unknown;
  error: { message?: string; code?: string } | null;
};

async function insertSessionRow(
  payload: Record<string, unknown>,
  columns: string
): Promise<SessionWriteResult> {
  const type = parseSessionType(payload.type, sessionTypeFromSource(payload.source as string));
  const withType = { ...payload, type };
  const typedColumns = columns.includes(' type') || columns.endsWith('type') ? columns : `${columns}, type`;
  const first = await supabase.from('sessions').insert(withType).select(typedColumns).single();
  if (!first.error || !isMissingSessionTypeColumn(first.error)) return first;
  const { type: _ignored, ...withoutType } = withType;
  return supabase.from('sessions').insert(withoutType).select(columns).single();
}

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

type SessionQueryResult = {
  data: unknown;
  error: { message?: string; code?: string } | null;
};

async function selectSession(
  run: (columns: string) => PromiseLike<SessionQueryResult>
): Promise<Session | null> {
  const withType = await run(SESSION_COLUMNS_ROUTINES_W1);
  if (!withType.error) return toSession(withType.data as Session | null);
  if (!isMissingSessionTypeColumn(withType.error)) {
    if (!isMissingRoutineSessionColumns(withType.error) && !isMissingBlockColumn(withType.error)) {
      if (!isMissingCustomSessionColumns(withType.error)) throw withType.error;
    }
  }
  const routines = await run(SESSION_COLUMNS_ROUTINES);
  if (!routines.error) return toSession(routines.data as Session | null);
  if (!isMissingRoutineSessionColumns(routines.error) && !isMissingBlockColumn(routines.error)) {
    if (!isMissingCustomSessionColumns(routines.error)) throw routines.error;
  }
  const full = await run(SESSION_COLUMNS);
  if (!full.error) return toSession(full.data as Session | null);
  if (isMissingBlockColumn(full.error)) {
    const custom = await run(SESSION_COLUMNS_CUSTOM);
    if (!custom.error) return toSession(custom.data as Session | null);
    if (!isMissingCustomSessionColumns(custom.error)) throw custom.error;
  } else if (!isMissingCustomSessionColumns(full.error)) {
    throw full.error;
  }
  const legacy = await run(SESSION_COLUMNS_LEGACY);
  if (legacy.error) throw legacy.error;
  return toSession(legacy.data as Session | null);
}

export async function fetchSession(id: string): Promise<Session | null> {
  return selectSession((columns) =>
    supabase.from('sessions').select(columns).eq('id', id).maybeSingle()
  );
}

/** The most recent session that hasn't been finished, if any. */
export async function fetchActiveSession(): Promise<Session | null> {
  return selectSession((columns) =>
    supabase
      .from('sessions')
      .select(columns)
      .is('completed_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  );
}

/** The most recently finished session, if any. */
export async function fetchLastFinishedSession(): Promise<Session | null> {
  return selectSession((columns) =>
    supabase
      .from('sessions')
      .select(columns)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  );
}

/** Last finished session for this enrolment — used to pick the next routine day. */
export async function fetchLastFinishedRoutineSession(
  enrolmentId: string
): Promise<Session | null> {
  try {
    return await selectSession((columns) =>
      supabase
        .from('sessions')
        .select(columns)
        .eq('routine_enrolment_id', enrolmentId)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );
  } catch (error) {
    if (error && typeof error === 'object' && isMissingRoutineSessionColumns(error)) {
      return null;
    }
    throw error;
  }
}

/** Last finished programme day — custom workouts don't move her programme along. */
export async function fetchLastFinishedProgrammeSession(): Promise<Session | null> {
  return selectSession((columns) =>
    supabase
      .from('sessions')
      .select(columns)
      .not('completed_at', 'is', null)
      .not('programme_day_id', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  );
}

export async function startSession(
  programmeDayId: string,
  exerciseSwaps: Record<string, string> = {},
  blockId: string | null = null
): Promise<Session> {
  const payload = {
    programme_day_id: programmeDayId,
    date: localDate(),
    exercise_swaps: exerciseSwaps,
    source: 'programme' as const,
    ...(blockId ? { block_id: blockId } : {}),
  };
  const { data, error } = await insertSessionRow(payload, SESSION_COLUMNS);
  if (!error) {
    const session = toSession(data as Session)!;
    track('session_started', { source: session.source });
    return session;
  }
  if (isMissingBlockColumn(error)) {
    const { block_id: _ignored, ...withoutBlock } = payload;
    const custom = await supabase
      .from('sessions')
      .insert(withoutBlock)
      .select(SESSION_COLUMNS_CUSTOM)
      .single();
    if (!custom.error) {
      const session = toSession(custom.data as Session)!;
      track('session_started', { source: session.source });
      return session;
    }
    if (!isMissingCustomSessionColumns(custom.error)) throw custom.error;
  } else if (!isMissingCustomSessionColumns(error)) {
    throw error;
  }
  const legacy = await supabase
    .from('sessions')
    .insert({
      programme_day_id: programmeDayId,
      date: localDate(),
      exercise_swaps: exerciseSwaps,
    })
    .select(SESSION_COLUMNS_LEGACY)
    .single();
  if (legacy.error) throw legacy.error;
  const session = toSession(legacy.data as Session)!;
  track('session_started', { source: session.source });
  return session;
}

export async function startRoutineSession(input: {
  enrolmentId: string;
  routineDayId: string;
  sourceProgrammeDayId?: string | null;
  exerciseSwaps?: Record<string, string>;
  sessionType?: SessionType;
}): Promise<Session> {
  const exerciseSwaps = input.exerciseSwaps ?? {};
  const payload = {
    programme_day_id: input.sourceProgrammeDayId ?? null,
    date: localDate(),
    exercise_swaps: exerciseSwaps,
    source: 'routine' as const,
    routine_enrolment_id: input.enrolmentId,
    routine_day_id: input.routineDayId,
    type: input.sessionType ?? 'strength',
  };
  const { data, error } = await insertSessionRow(payload, SESSION_COLUMNS_ROUTINES);
  if (!error) {
    track('session_started', { source: 'routine' });
    return toSession(data as Session)!;
  }
  if (isMissingRoutineSessionColumns(error) || /source/i.test(error.message ?? '')) {
    if (input.sourceProgrammeDayId) {
      return startSession(input.sourceProgrammeDayId, exerciseSwaps);
    }
    throw new Error('Routines need supabase/routines.sql run in the Supabase SQL editor.');
  }
  throw error;
}

export async function startStretchSession(routineDayId: string): Promise<Session> {
  const payload = {
    programme_day_id: null as string | null,
    date: localDate(),
    exercise_swaps: {} as Record<string, string>,
    source: 'stretch' as const,
    routine_day_id: routineDayId,
    type: 'recovery' as const,
  };
  const { data, error } = await insertSessionRow(payload, SESSION_COLUMNS_ROUTINES);
  if (!error) {
    track('session_started', { source: 'stretch' });
    return toSession(data as Session)!;
  }
  if (isMissingRoutineSessionColumns(error) || /source/i.test(error.message ?? '')) {
    throw new Error('Stretch sessions need supabase/stretches.sql run in the Supabase SQL editor.');
  }
  throw error;
}

/** One-off session with no saved custom workout (X3 single sessions). Plan lives on the device. */
export async function startStandaloneSession(): Promise<Session> {
  const payload = {
    programme_day_id: null as string | null,
    source: 'custom' as const,
    date: localDate(),
    exercise_swaps: {} as Record<string, string>,
    type: 'strength' as const,
  };
  const { data, error } = await insertSessionRow(payload, SESSION_COLUMNS);
  if (!error) {
    track('session_started', { source: 'custom' });
    return toSession(data as Session)!;
  }
  if (isMissingBlockColumn(error)) {
    const { type: _ignored, ...withoutType } = payload;
    const custom = await supabase.from('sessions').insert(withoutType).select(SESSION_COLUMNS_CUSTOM).single();
    if (!custom.error) {
      track('session_started', { source: 'custom' });
      return toSession(custom.data as Session)!;
    }
    if (isMissingCustomSessionColumns(custom.error)) {
      throw new Error(
        'Custom workouts need supabase/custom_workouts.sql run in the Supabase SQL editor.'
      );
    }
    throw custom.error;
  }
  if (isMissingCustomSessionColumns(error)) {
    throw new Error(
      'Custom workouts need supabase/custom_workouts.sql run in the Supabase SQL editor.'
    );
  }
  throw error;
}

export async function startCustomSession(
  customWorkoutId: string,
  exerciseSwaps: Record<string, string> = {}
): Promise<Session> {
  const payload = {
    programme_day_id: null as string | null,
    custom_workout_id: customWorkoutId,
    source: 'custom' as const,
    date: localDate(),
    exercise_swaps: exerciseSwaps,
    type: 'strength' as const,
  };
  const { data, error } = await insertSessionRow(payload, SESSION_COLUMNS);
  if (!error) {
    track('session_started', { source: 'custom' });
    return toSession(data as Session)!;
  }
  if (isMissingBlockColumn(error)) {
    const { type: _ignored, ...withoutType } = payload;
    const custom = await supabase
      .from('sessions')
      .insert(withoutType)
      .select(SESSION_COLUMNS_CUSTOM)
      .single();
    if (!custom.error) {
      track('session_started', { source: 'custom' });
      return toSession(custom.data as Session)!;
    }
    if (isMissingCustomSessionColumns(custom.error)) {
      throw new Error(
        'Custom workouts need supabase/custom_workouts.sql run in the Supabase SQL editor.'
      );
    }
    throw custom.error;
  }
  if (isMissingCustomSessionColumns(error)) {
    throw new Error(
      'Custom workouts need supabase/custom_workouts.sql run in the Supabase SQL editor.'
    );
  }
  throw error;
}

/** Points this in-progress session at another day of the current week. */
export async function updateSessionRoutineDay(
  id: string,
  input: { routineDayId: string; sourceProgrammeDayId?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({
      routine_day_id: input.routineDayId,
      programme_day_id: input.sourceProgrammeDayId ?? null,
      exercise_swaps: {},
    })
    .eq('id', id);
  if (error) throw error;
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

export async function finishSession(id: string, durationSeconds?: number): Promise<void> {
  const completedAt = new Date().toISOString();
  const payload: { completed_at: string; duration_seconds?: number } = {
    completed_at: completedAt,
  };
  if (durationSeconds !== undefined && Number.isFinite(durationSeconds) && durationSeconds >= 0) {
    payload.duration_seconds = Math.round(durationSeconds);
  }
  const { error } = await supabase.from('sessions').update(payload).eq('id', id);
  if (error && payload.duration_seconds !== undefined && /duration_seconds/i.test(error.message)) {
    const retry = await supabase.from('sessions').update({ completed_at: completedAt }).eq('id', id);
    if (retry.error) throw retry.error;
    track('session_completed');
    return;
  }
  if (error) throw error;
  track('session_completed');
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
  if (set.completed) track('set_ticked');
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
