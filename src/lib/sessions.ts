import { track } from '@/lib/analytics';
import { parseSessionFeel, type SessionFeel } from '@/lib/checkin';
import {
  CARDIO_SLUG_KEY,
  parseSessionType,
  sessionTypeFromSource,
  type SessionType,
} from '@/lib/sessionTypes';
import { supabase } from '@/lib/supabase';

export type SessionSource = 'programme' | 'custom' | 'ai' | 'routine' | 'stretch' | 'cardio';

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
  /** True when she chose a lighter session for today. Never stores the reason. */
  lighter_session: boolean;
  /** Optional post-session feel. Never the check-in option. */
  session_feel: SessionFeel | null;
  /** True when she logged cardio after the fact (W8 Just log it). */
  logged_after: boolean;
};

export const SET_TYPES = ['normal', 'warmup', 'drop'] as const;
export type SetType = (typeof SET_TYPES)[number];

export function parseSetType(value: unknown): SetType {
  return value === 'warmup' || value === 'drop' ? value : 'normal';
}

/** Warm-up and drop sets never drive suggested weights or personal bests. */
export function setTypeCountsForProgression(type: SetType): boolean {
  return type === 'normal';
}

export function workingSetsForProgression(sets: LoggedSet[] | undefined): LoggedSet[] {
  return (sets ?? []).filter((set) => setTypeCountsForProgression(parseSetType(set.set_type)));
}

/** One row of the `sets` table. */
export type LoggedSet = {
  session_id: string;
  exercise_id: string;
  set_number: number;
  /** Null for bodyweight and band exercises. */
  weight_kg: number | null;
  reps: number | null;
  completed: boolean;
  set_type: SetType;
};

const SESSION_COLUMNS_ROUTINES =
  'id, date, programme_day_id, started_at, completed_at, exercise_swaps, source, custom_workout_id, block_id, routine_enrolment_id, routine_day_id';
const SESSION_COLUMNS =
  'id, date, programme_day_id, started_at, completed_at, exercise_swaps, source, custom_workout_id, block_id';
const SESSION_COLUMNS_CUSTOM =
  'id, date, programme_day_id, started_at, completed_at, exercise_swaps, source, custom_workout_id';
const SESSION_COLUMNS_LEGACY = 'id, date, programme_day_id, started_at, completed_at, exercise_swaps';
const SET_COLUMNS = 'session_id, exercise_id, set_number, weight_kg, reps, completed';
const SET_COLUMNS_L5 = `${SET_COLUMNS}, set_type`;

function isMissingSetTypeColumn(error: { message?: string; code?: string }): boolean {
  return /set_type/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

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

function isMissingLighterSessionColumn(error: { message?: string; code?: string }): boolean {
  return /lighter_session/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingSessionFeelColumn(error: { message?: string; code?: string }): boolean {
  return /session_feel/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingLoggedAfterColumn(error: { message?: string; code?: string }): boolean {
  return /logged_after/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isRejectedCardioSource(error: { message?: string; code?: string }): boolean {
  return /sessions_source_check|source.*cardio/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

const SESSION_COLUMNS_ROUTINES_W1 = `${SESSION_COLUMNS_ROUTINES}, type`;
const SESSION_COLUMNS_GROUP8 = `${SESSION_COLUMNS_ROUTINES_W1}, lighter_session`;
const SESSION_COLUMNS_W8 = `${SESSION_COLUMNS_GROUP8}, logged_after`;

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
    lighter_session: row.lighter_session === true,
    session_feel: parseSessionFeel(row.session_feel),
    logged_after: row.logged_after === true,
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
  return formatLocalDate(new Date());
}

function formatLocalDate(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function localNoonIso(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

/** Postgres numerics arrive as strings; turn them back into numbers. */
function toLoggedSet(row: Record<string, unknown>): LoggedSet {
  return {
    session_id: String(row.session_id ?? ''),
    exercise_id: String(row.exercise_id ?? ''),
    set_number: Number(row.set_number),
    weight_kg: row.weight_kg === null || row.weight_kg === undefined ? null : Number(row.weight_kg),
    reps: row.reps === null || row.reps === undefined ? null : Number(row.reps),
    completed: row.completed === true,
    set_type: parseSetType(row.set_type),
  };
}

type SessionQueryResult = {
  data: unknown;
  error: { message?: string; code?: string } | null;
};

async function selectSession(
  run: (columns: string) => PromiseLike<SessionQueryResult>
): Promise<Session | null> {
  const withW8 = await run(SESSION_COLUMNS_W8);
  if (!withW8.error) return toSession(withW8.data as Session | null);
  if (
    !isMissingLoggedAfterColumn(withW8.error) &&
    !isMissingLighterSessionColumn(withW8.error) &&
    !isMissingSessionTypeColumn(withW8.error)
  ) {
    if (!isMissingRoutineSessionColumns(withW8.error) && !isMissingBlockColumn(withW8.error)) {
      if (!isMissingCustomSessionColumns(withW8.error)) throw withW8.error;
    }
  }
  const withGroup8 = await run(SESSION_COLUMNS_GROUP8);
  if (!withGroup8.error) return toSession(withGroup8.data as Session | null);
  if (
    !isMissingLighterSessionColumn(withGroup8.error) &&
    !isMissingSessionTypeColumn(withGroup8.error)
  ) {
    if (!isMissingRoutineSessionColumns(withGroup8.error) && !isMissingBlockColumn(withGroup8.error)) {
      if (!isMissingCustomSessionColumns(withGroup8.error)) throw withGroup8.error;
    }
  }
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

export async function startCardioSession(
  slug: string,
  extra?: { swaps?: Record<string, string>; customWorkoutId?: string | null }
): Promise<Session> {
  const swaps = { [CARDIO_SLUG_KEY]: slug, ...(extra?.swaps ?? {}) };
  const payload = {
    programme_day_id: null as string | null,
    date: localDate(),
    exercise_swaps: swaps,
    source: 'cardio' as const,
    type: 'cardio' as const,
    ...(extra?.customWorkoutId ? { custom_workout_id: extra.customWorkoutId } : {}),
  };
  const first = await insertSessionRow(payload, SESSION_COLUMNS_ROUTINES);
  if (!first.error) {
    track('session_started', { source: 'cardio', type: 'cardio' });
    return toSession(first.data as Session)!;
  }
  const fallback = await insertSessionRow({ ...payload, source: 'custom' as const }, SESSION_COLUMNS);
  if (!fallback.error) {
    track('session_started', { source: 'cardio', type: 'cardio' });
    return toSession(fallback.data as Session)!;
  }
  if (isRejectedCardioSource(first.error) || isRejectedCardioSource(fallback.error)) {
    throw new Error('Cardio sessions need supabase/cardio_w2.sql run in the Supabase SQL editor.');
  }
  throw fallback.error;
}

/** Finished cardio logged after the fact. Does not open the player or start a timer. */
export async function insertLoggedCardioSession(input: {
  date: string;
  minutes: number;
  slug: string;
}): Promise<Session> {
  const minutes = Math.max(1, Math.min(180, Math.round(input.minutes * 10) / 10));
  const durationSeconds = Math.round(minutes * 60);
  const startedAt = localNoonIso(input.date);
  const completedAt = new Date(Date.parse(startedAt) + durationSeconds * 1000).toISOString();
  const payload: Record<string, unknown> = {
    programme_day_id: null,
    date: input.date,
    started_at: startedAt,
    completed_at: completedAt,
    duration_seconds: durationSeconds,
    exercise_swaps: { [CARDIO_SLUG_KEY]: input.slug },
    source: 'cardio' as const,
    type: 'cardio' as const,
    logged_after: true,
  };

  async function attempt(body: Record<string, unknown>, columns: string): Promise<SessionWriteResult> {
    const cardio = await insertSessionRow(body, columns);
    if (!cardio.error) return cardio;
    if (isRejectedCardioSource(cardio.error)) {
      return insertSessionRow({ ...body, source: 'custom' as const }, columns);
    }
    return cardio;
  }

  let result = await attempt(payload, SESSION_COLUMNS_W8);
  if (result.error && isMissingLoggedAfterColumn(result.error)) {
    const { logged_after: _ignored, ...withoutFlag } = payload;
    result = await attempt(withoutFlag, SESSION_COLUMNS_GROUP8);
  }
  if (result.error && /duration_seconds/i.test(result.error.message ?? '')) {
    const { duration_seconds: _ignored, ...withoutDuration } = payload;
    result = await attempt(withoutDuration, SESSION_COLUMNS_W8);
  }
  if (result.error && isRejectedCardioSource(result.error)) {
    throw new Error('Cardio sessions need supabase/cardio_w2.sql run in the Supabase SQL editor.');
  }
  if (result.error) throw result.error;
  track('session_completed');
  return toSession(result.data as Session)!;
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
  const withType = await supabase.from('sets').select(SET_COLUMNS_L5).eq('session_id', sessionId);
  if (!withType.error) return (withType.data ?? []).map(toLoggedSet);
  if (!isMissingSetTypeColumn(withType.error)) throw withType.error;
  const { data, error } = await supabase.from('sets').select(SET_COLUMNS).eq('session_id', sessionId);
  if (error) throw error;
  return (data ?? []).map(toLoggedSet);
}

export function describeSetSaveError(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (/set_number/i.test(message)) {
    return 'Warm-up ticks stay on this phone. Working sets still save to your account.';
  }
  if (/foreign key|exercises/i.test(message)) {
    return 'That exercise isn’t in your library. Swap it and try again.';
  }
  if (/invalid input syntax|uuid/i.test(message)) {
    return 'This session did not start properly. Close it and start again.';
  }
  return 'Check your connection and try again.';
}

/** Saves one set, replacing anything already logged for that set in this session. */
export async function saveSet(set: LoggedSet): Promise<void> {
  const row = {
    session_id: set.session_id,
    exercise_id: set.exercise_id,
    set_number: set.set_number,
    weight_kg: set.weight_kg,
    reps: set.reps,
    completed: set.completed,
    set_type: parseSetType(set.set_type),
    completed_at: set.completed ? new Date().toISOString() : null,
  };
  const first = await supabase.from('sets').upsert(row, { onConflict: 'session_id,exercise_id,set_number' });
  if (!first.error) {
    if (set.completed) track('set_ticked');
    return;
  }
  if (isMissingSetTypeColumn(first.error)) {
    if (set.set_number < 1) return;
    const { set_type: _ignored, ...legacy } = row;
    const retry = await supabase.from('sets').upsert(legacy, { onConflict: 'session_id,exercise_id,set_number' });
    if (retry.error) throw retry.error;
    if (set.completed) track('set_ticked');
    return;
  }
  if (set.set_number < 1) return;
  throw first.error;
}

export async function deleteSet(sessionId: string, exerciseId: string, setNumber: number): Promise<void> {
  const { error } = await supabase
    .from('sets')
    .delete()
    .eq('session_id', sessionId)
    .eq('exercise_id', exerciseId)
    .eq('set_number', setNumber);
  if (error) throw error;
}

/**
 * Latest completed sets per exercise, skipping lighter sessions so they never lower the next suggestion.
 * `rows` must already be newest-first.
 */
export function pickLatestNormalSets(
  rows: Array<LoggedSet & { lighter?: boolean }>
): Record<string, LoggedSet[]> {
  const latestSession: Record<string, string> = {};
  const previous: Record<string, LoggedSet[]> = {};
  for (const set of rows) {
    if (set.lighter) continue;
    if (!setTypeCountsForProgression(parseSetType(set.set_type))) continue;
    latestSession[set.exercise_id] ??= set.session_id;
    if (latestSession[set.exercise_id] !== set.session_id) continue;
    (previous[set.exercise_id] ??= []).push(set);
  }
  for (const sets of Object.values(previous)) {
    sets.sort((a, b) => a.set_number - b.set_number);
  }
  return previous;
}

async function lighterSessionIds(sessionIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(sessionIds.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const { data, error } = await supabase.from('sessions').select('id, lighter_session').in('id', unique);
  if (error) {
    if (isMissingLighterSessionColumn(error)) return new Set();
    throw error;
  }
  const ids = new Set<string>();
  for (const row of data ?? []) {
    if ((row as { lighter_session?: boolean }).lighter_session === true) {
      ids.add((row as { id: string }).id);
    }
  }
  return ids;
}

/**
 * For each exercise, the completed sets from the most recent other session she did it in,
 * ordered by set number. Exercises she's never logged are left out.
 * Sessions with lighter_session = true are skipped so a lighter day never lowers the next suggestion.
 */
export async function fetchPreviousSets(
  exerciseIds: string[],
  excludeSessionId: string | null = null
): Promise<Record<string, LoggedSet[]>> {
  if (exerciseIds.length === 0) return {};
  const run = (columns: string) => {
    let query = supabase
      .from('sets')
      .select(columns)
      .in('exercise_id', exerciseIds)
      .eq('completed', true)
      .order('completed_at', { ascending: false })
      .limit(500);
    if (excludeSessionId) query = query.neq('session_id', excludeSessionId);
    return query;
  };
  let result = await run(SET_COLUMNS_L5);
  if (result.error && isMissingSetTypeColumn(result.error)) result = await run(SET_COLUMNS);
  if (result.error) throw result.error;
  const sets = ((result.data ?? []) as unknown as Record<string, unknown>[]).map(toLoggedSet);
  const lighter = await lighterSessionIds(sets.map((set) => set.session_id));
  return pickLatestNormalSets(sets.map((set) => ({ ...set, lighter: lighter.has(set.session_id) })));
}

/** Marks this session as a today-only lighter day. Never stores the reason. */
export async function markSessionLighter(id: string): Promise<void> {
  const { error } = await supabase.from('sessions').update({ lighter_session: true }).eq('id', id);
  if (error && isMissingLighterSessionColumn(error)) return;
  if (error) throw error;
}

/** Optional post-session feel. Never stores the check-in option. */
export async function saveSessionFeel(id: string, feel: SessionFeel): Promise<void> {
  const { error } = await supabase.from('sessions').update({ session_feel: feel }).eq('id', id);
  if (error && isMissingSessionFeelColumn(error)) return;
  if (error) throw error;
}

/**
 * Two completed sessions in a row for this routine day both marked Harder.
 * Used to hold the next weight increase on those lifts.
 */
export async function consecutiveHarderOnRoutineDay(
  routineDayId: string | null | undefined,
  excludeSessionId: string | null
): Promise<boolean> {
  if (!routineDayId) return false;
  let query = supabase
    .from('sessions')
    .select('id, session_feel, completed_at')
    .eq('routine_day_id', routineDayId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(2);
  if (excludeSessionId) query = query.neq('id', excludeSessionId);
  const { data, error } = await query;
  if (error) {
    if (isMissingSessionFeelColumn(error)) return false;
    throw error;
  }
  const rows = data ?? [];
  if (rows.length < 2) return false;
  return rows.every((row) => parseSessionFeel((row as { session_feel?: unknown }).session_feel) === 'harder');
}

/** The heaviest weight in a list of sets, or null if none had a weight. */
export function heaviestWeight(sets: LoggedSet[] | undefined): number | null {
  const weights = (sets ?? []).flatMap((set) => (set.weight_kg === null ? [] : [set.weight_kg]));
  return weights.length > 0 ? Math.max(...weights) : null;
}
