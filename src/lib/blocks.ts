import type { Zone } from '@/lib/exercises';
import type { EquipmentAccess, Level } from '@/lib/profile';
import {
  SLOT_EXERCISE_COLUMNS,
  formatKg,
  toSlotExercise,
  usesWeight,
  type Programme,
  type SlotExercise,
} from '@/lib/programmes';
import { fetchPreviousSets, heaviestWeight, type LoggedSet } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export const BLOCK_LENGTH_WEEKS = 8;
export const MIN_KEY_LIFTS = 3;
export const MAX_KEY_LIFTS = 5;

export type BlockStatus = 'active' | 'complete';

export type BlockTarget = {
  id: string;
  block_id: string;
  exercise: SlotExercise;
  start_weight_kg: number | null;
  start_reps: number | null;
  target_weight_kg: number | null;
  target_reps: number | null;
  current_weight_kg: number | null;
  current_reps: number | null;
  /** 0–1. 0 when we don't have a start yet. */
  progress: number;
};

export type TrainingBlock = {
  id: string;
  user_id: string;
  programme_id: string;
  start_date: string;
  length_weeks: number;
  status: BlockStatus;
  completed_at: string | null;
  week: number;
  sessionOfWeek: number;
  sessionsPerWeek: number;
  sessionsDone: number;
  sessionsTotal: number;
  sessionsToGo: number;
  targets: BlockTarget[];
};

type BlockRow = {
  id: string;
  user_id: string;
  programme_id: string;
  start_date: string;
  length_weeks: number;
  status: BlockStatus;
  completed_at: string | null;
};

type TargetRow = {
  id: string;
  block_id: string;
  start_weight_kg: number | null;
  start_reps: number | null;
  target_weight_kg: number | null;
  target_reps: number | null;
  exercise: SlotExercise;
};

const TARGET_SELECT = `
  id, block_id, start_weight_kg, start_reps, target_weight_kg, target_reps,
  exercise:exercises (${SLOT_EXERCISE_COLUMNS})
`;

function isMissingBlocks(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    /could not find the table['\s].*(blocks|block_targets)/.test(detail) ||
    /relation ['"]?public\.(blocks|block_targets)/.test(detail) ||
    /column .*block_id/.test(detail)
  );
}

function isUniqueViolation(error: { message?: string; code?: string }): boolean {
  return error.code === '23505' || /duplicate key/i.test(`${error.message ?? ''}`);
}

export function missingBlocksMessage(): string {
  return '8-week blocks need supabase/blocks.sql run in the Supabase SQL editor.';
}

function todayDate(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

function addDays(iso: string, days: number): string {
  const date = parseDate(iso);
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('You need to be signed in.');
  return data.user.id;
}

function toTargetRow(row: TargetRow): Omit<BlockTarget, 'current_weight_kg' | 'current_reps' | 'progress'> {
  return {
    id: row.id,
    block_id: row.block_id,
    exercise: toSlotExercise(row.exercise),
    start_weight_kg: toNumber(row.start_weight_kg),
    start_reps: toNumber(row.start_reps),
    target_weight_kg: toNumber(row.target_weight_kg),
    target_reps: toNumber(row.target_reps),
  };
}

export function blockWeek(startDate: string, lengthWeeks: number, today = todayDate()): number {
  return Math.min(lengthWeeks, Math.max(1, Math.floor(daysBetween(startDate, today) / 7) + 1));
}

export function describeBlockPosition(block: TrainingBlock): string {
  const week = `Week ${block.week} of ${block.length_weeks}`;
  const left =
    block.sessionsToGo === 1 ? '1 session to go' : `${block.sessionsToGo} sessions to go`;
  if (block.sessionOfWeek > block.sessionsPerWeek) return `${week} · ${left}`;
  return `${week} · session ${block.sessionOfWeek} of ${block.sessionsPerWeek} · ${left}`;
}

export function describeTargetRange(target: BlockTarget): string {
  if (target.start_weight_kg === null || target.target_weight_kg === null) {
    return 'Target after your first session';
  }
  const from = `${formatKg(target.start_weight_kg)} × ${target.start_reps ?? ''}`;
  const to = `${formatKg(target.target_weight_kg)} × ${target.target_reps ?? ''}`;
  return `${from} → ${to}`.replace(/\s+/g, ' ').trim();
}

function targetProgress(
  startKg: number | null,
  targetKg: number | null,
  currentKg: number | null
): number {
  if (startKg === null || targetKg === null || currentKg === null) return 0;
  if (targetKg <= startKg) return currentKg >= targetKg ? 1 : 0;
  return Math.min(1, Math.max(0, (currentKg - startKg) / (targetKg - startKg)));
}

type KeyCandidate = {
  exercise: SlotExercise;
  appearancesPerWeek: number;
  rep_min: number;
  rep_max: number;
};

/** Unique weighted lifts in the programme at or below her level, busiest first. */
export function pickKeyExercises(
  programme: Programme,
  maxZone: Zone,
  already: Set<string> = new Set(),
  limit = MAX_KEY_LIFTS
): KeyCandidate[] {
  const byId = new Map<string, KeyCandidate>();
  for (const day of programme.days) {
    for (const item of day.exercises) {
      const { exercise } = item;
      if (already.has(exercise.id) || exercise.zone > maxZone || !usesWeight(exercise.equipment)) {
        continue;
      }
      const existing = byId.get(exercise.id);
      if (existing) {
        existing.appearancesPerWeek += 1;
        existing.rep_min = Math.min(existing.rep_min, item.rep_min);
        existing.rep_max = Math.max(existing.rep_max, item.rep_max);
      } else {
        byId.set(exercise.id, {
          exercise,
          appearancesPerWeek: 1,
          rep_min: item.rep_min,
          rep_max: item.rep_max,
        });
      }
    }
  }

  const ranked = [...byId.values()].sort((a, b) => {
    if (b.appearancesPerWeek !== a.appearancesPerWeek) return b.appearancesPerWeek - a.appearancesPerWeek;
    return a.exercise.name.localeCompare(b.exercise.name);
  });

  const chosen: KeyCandidate[] = [];
  const muscles = new Set<string>();
  for (const candidate of ranked) {
    if (chosen.length >= limit) break;
    if (muscles.has(candidate.exercise.primary_muscle) && chosen.length < MIN_KEY_LIFTS) continue;
    chosen.push(candidate);
    muscles.add(candidate.exercise.primary_muscle);
  }
  for (const candidate of ranked) {
    if (chosen.length >= Math.max(MIN_KEY_LIFTS, Math.min(limit, ranked.length))) break;
    if (chosen.some((item) => item.exercise.id === candidate.exercise.id)) continue;
    chosen.push(candidate);
  }
  return chosen.slice(0, limit);
}

/**
 * Conservative double progression: an increase every 4 planned sessions of that lift,
 * at least one if she'll see it at all, at most four in the block.
 */
export function projectTarget(options: {
  startKg: number;
  startReps: number;
  stepKg: number | null;
  appearances: number;
}): { targetKg: number; targetReps: number } {
  const step = options.stepKg && options.stepKg > 0 ? options.stepKg : 0;
  const increases = step
    ? Math.min(4, Math.max(1, Math.floor(options.appearances / 4)))
    : 0;
  return {
    targetKg: Number((options.startKg + increases * step).toFixed(2)),
    targetReps: options.startReps,
  };
}

function startFromSets(sets: LoggedSet[], fallbackReps: number): { kg: number; reps: number } | null {
  const kg = sets.find((set) => set.set_number === 1)?.weight_kg ?? heaviestWeight(sets);
  if (kg === null) return null;
  const reps = sets.find((set) => set.set_number === 1)?.reps ?? fallbackReps;
  return { kg, reps };
}

async function fetchActiveBlockRow(): Promise<BlockRow | null> {
  const { data, error } = await supabase
    .from('blocks')
    .select('id, user_id, programme_id, start_date, length_weeks, status, completed_at')
    .eq('status', 'active')
    .maybeSingle();
  if (error) {
    if (isMissingBlocks(error)) return null;
    throw error;
  }
  return data as BlockRow | null;
}

async function fetchTargets(blockId: string): Promise<TargetRow[]> {
  const { data, error } = await supabase
    .from('block_targets')
    .select(TARGET_SELECT)
    .eq('block_id', blockId);
  if (error) throw error;
  return (data ?? []) as unknown as TargetRow[];
}

async function firstProgrammeSessionDate(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('date')
    .eq('user_id', userId)
    .not('programme_day_id', 'is', null)
    .not('completed_at', 'is', null)
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.date as string | undefined) ?? null;
}

async function createActiveBlock(programmeId: string): Promise<BlockRow> {
  const userId = await currentUserId();
  const { count, error: countError } = await supabase
    .from('blocks')
    .select('id', { count: 'exact', head: true });
  if (countError) throw countError;
  // First-ever block migrates from her first programme session; later blocks start today.
  const startDate =
    (count ?? 0) > 0 ? todayDate() : (await firstProgrammeSessionDate(userId)) ?? todayDate();
  const { data, error } = await supabase
    .from('blocks')
    .insert({
      user_id: userId,
      programme_id: programmeId,
      start_date: startDate,
      length_weeks: BLOCK_LENGTH_WEEKS,
      status: 'active',
    })
    .select('id, user_id, programme_id, start_date, length_weeks, status, completed_at')
    .single();
  if (error) throw error;

  await supabase
    .from('sessions')
    .update({ block_id: data.id })
    .eq('user_id', userId)
    .is('block_id', null)
    .not('programme_day_id', 'is', null)
    .gte('date', startDate);

  return data as BlockRow;
}

async function insertTargets(
  blockId: string,
  candidates: KeyCandidate[],
  previous: Record<string, LoggedSet[]>,
  weeksLeft: number
): Promise<void> {
  if (candidates.length === 0) return;
  const rows = candidates.map((candidate) => {
    const start = startFromSets(previous[candidate.exercise.id] ?? [], candidate.rep_min);
    const appearances = candidate.appearancesPerWeek * weeksLeft;
    const projected = start
      ? projectTarget({
          startKg: start.kg,
          startReps: start.reps,
          stepKg: candidate.exercise.weight_increase_kg,
          appearances,
        })
      : null;
    return {
      block_id: blockId,
      exercise_id: candidate.exercise.id,
      start_weight_kg: projected ? start!.kg : null,
      start_reps: projected ? start!.reps : null,
      target_weight_kg: projected?.targetKg ?? null,
      target_reps: projected?.targetReps ?? null,
    };
  });
  const { error } = await supabase.from('block_targets').insert(rows);
  if (error && !isUniqueViolation(error)) throw error;
}

async function countFinishedProgrammeSessions(
  blockId: string,
  fromDate?: string,
  toDate?: string
): Promise<number> {
  let query = supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('block_id', blockId)
    .not('completed_at', 'is', null)
    .not('programme_day_id', 'is', null);
  if (fromDate) query = query.gte('date', fromDate);
  if (toDate) query = query.lt('date', toDate);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function fetchCurrentLifts(
  blockId: string,
  exerciseIds: string[]
): Promise<Record<string, { kg: number; reps: number }>> {
  if (exerciseIds.length === 0) return {};
  const { data, error } = await supabase
    .from('sets')
    .select('exercise_id, weight_kg, reps, sessions!inner(block_id, completed_at)')
    .eq('completed', true)
    .in('exercise_id', exerciseIds)
    .eq('sessions.block_id', blockId)
    .not('sessions.completed_at', 'is', null);
  if (error) throw error;

  const best: Record<string, { kg: number; reps: number }> = {};
  for (const row of data ?? []) {
    const kg = toNumber(row.weight_kg as number | string | null);
    const reps = toNumber(row.reps as number | string | null) ?? 0;
    if (kg === null) continue;
    const current = best[row.exercise_id as string];
    if (!current || kg > current.kg || (kg === current.kg && reps > current.reps)) {
      best[row.exercise_id as string] = { kg, reps };
    }
  }
  return best;
}

async function hydrateBlock(
  row: BlockRow,
  programme: Programme
): Promise<TrainingBlock> {
  const today = todayDate();
  const week = blockWeek(row.start_date, row.length_weeks, today);
  const weekStart = addDays(row.start_date, (week - 1) * 7);
  const weekEnd = addDays(weekStart, 7);
  const targets = await fetchTargets(row.id);
  const [sessionsDone, sessionsThisWeek, current] = await Promise.all([
    countFinishedProgrammeSessions(row.id),
    countFinishedProgrammeSessions(row.id, weekStart, weekEnd),
    fetchCurrentLifts(
      row.id,
      targets.map((item) => toSlotExercise(item.exercise).id)
    ),
  ]);

  const sessionsPerWeek = programme.days_per_week;
  const sessionsTotal = sessionsPerWeek * row.length_weeks;
  return {
    ...row,
    week,
    sessionOfWeek: sessionsThisWeek + 1,
    sessionsPerWeek,
    sessionsDone,
    sessionsTotal,
    sessionsToGo: Math.max(0, sessionsTotal - sessionsDone),
    targets: targets.map((item) => {
      const base = toTargetRow(item);
      const lift = current[base.exercise.id];
      return {
        ...base,
        current_weight_kg: lift?.kg ?? null,
        current_reps: lift?.reps ?? null,
        progress: targetProgress(base.start_weight_kg, base.target_weight_kg, lift?.kg ?? null),
      };
    }),
  };
}

/**
 * Makes sure she has an active 8-week block, key-lift targets, and any new-zone
 * lift if she has moved up. Safe to call when blocks.sql hasn't been run.
 */
export async function ensureActiveBlock(
  programme: Programme,
  level: Level,
  equipment: EquipmentAccess
): Promise<TrainingBlock | null> {
  void equipment;
  try {
    let row = await fetchActiveBlockRow();
    if (!row) {
      try {
        row = await createActiveBlock(programme.id);
      } catch (error) {
        if (error && typeof error === 'object' && isUniqueViolation(error)) {
          row = await fetchActiveBlockRow();
        } else {
          throw error;
        }
      }
    }
    if (!row) return null;
    if (row.programme_id !== programme.id) {
      await supabase
        .from('blocks')
        .update({ status: 'complete', completed_at: new Date().toISOString() })
        .eq('id', row.id);
      row = await createActiveBlock(programme.id);
    }

    const week = blockWeek(row.start_date, row.length_weeks);
    const weeksLeft = row.length_weeks - week + 1;
    let targets = await fetchTargets(row.id);
    const already = new Set(targets.map((item) => toSlotExercise(item.exercise).id));

    if (targets.length === 0) {
      const previous = await fetchPreviousSets(
        pickKeyExercises(programme, level).map((item) => item.exercise.id)
      );
      await insertTargets(row.id, pickKeyExercises(programme, level), previous, weeksLeft);
      targets = await fetchTargets(row.id);
      for (const item of targets) already.add(toSlotExercise(item.exercise).id);
    }

    if (targets.length < MAX_KEY_LIFTS) {
      const extras = pickKeyExercises(programme, level, already, MAX_KEY_LIFTS - targets.length);
      const fromNewZone = extras.filter((item) => item.exercise.zone === level);
      const toAdd = fromNewZone.length > 0 ? fromNewZone.slice(0, 1) : [];
      if (toAdd.length > 0) {
        const previous = await fetchPreviousSets(toAdd.map((item) => item.exercise.id));
        await insertTargets(row.id, toAdd, previous, weeksLeft);
      }
    }

    return hydrateBlock(row, programme);
  } catch (error) {
    if (error && typeof error === 'object' && isMissingBlocks(error)) return null;
    throw error;
  }
}

/** After a finished programme session, fill any key-lift targets that were waiting on a first log. */
export async function fillBlockTargetsFromSession(sessionId: string): Promise<void> {
  try {
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, block_id, completed_at')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) {
      if (isMissingBlocks(sessionError)) return;
      throw sessionError;
    }
    const blockId = session?.block_id as string | null;
    if (!blockId || !session?.completed_at) return;

    const { data: sets, error: setError } = await supabase
      .from('sets')
      .select('exercise_id, weight_kg, reps, set_number')
      .eq('session_id', sessionId)
      .eq('completed', true);
    if (setError) throw setError;

    const byExercise: Record<string, LoggedSet[]> = {};
    for (const row of sets ?? []) {
      const set: LoggedSet = {
        session_id: sessionId,
        exercise_id: row.exercise_id as string,
        set_number: Number(row.set_number),
        weight_kg: toNumber(row.weight_kg as number | string | null),
        reps: toNumber(row.reps as number | string | null),
        completed: true,
      };
      (byExercise[set.exercise_id] ??= []).push(set);
    }

    const targets = await fetchTargets(blockId);
    const waiting = targets.filter((item) => toNumber(item.start_weight_kg) === null);
    if (waiting.length === 0) return;

    const { data: block, error: blockError } = await supabase
      .from('blocks')
      .select('start_date, length_weeks')
      .eq('id', blockId)
      .single();
    if (blockError) throw blockError;
    const weeksLeft =
      (block.length_weeks as number) - blockWeek(block.start_date as string, block.length_weeks as number) + 1;

    for (const target of waiting) {
      const exercise = toSlotExercise(target.exercise);
      const logged = byExercise[exercise.id];
      if (!logged) continue;
      const start = startFromSets(logged, 8);
      if (!start) continue;
      const projected = projectTarget({
        startKg: start.kg,
        startReps: start.reps,
        stepKg: exercise.weight_increase_kg,
        appearances: Math.max(1, weeksLeft),
      });
      const { error } = await supabase
        .from('block_targets')
        .update({
          start_weight_kg: start.kg,
          start_reps: start.reps,
          target_weight_kg: projected.targetKg,
          target_reps: projected.targetReps,
        })
        .eq('id', target.id);
      if (error) throw error;
    }
  } catch (error) {
    if (error && typeof error === 'object' && isMissingBlocks(error)) return;
    throw error;
  }
}

/** Development only: close the current block so the next Today load starts a fresh one. */
export async function debugRestartBlock(): Promise<void> {
  const row = await fetchActiveBlockRow();
  if (!row) return;
  const { error } = await supabase
    .from('blocks')
    .update({ status: 'complete', completed_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) throw error;
}
