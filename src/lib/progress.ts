import { ZONES, type Equipment, type Zone } from '@/lib/exercises';
import type { ConfidenceHistory } from '@/lib/levelUp';
import type { Level } from '@/lib/profile';
import { usesWeight } from '@/lib/programmes';
import { supabase } from '@/lib/supabase';

/** Supabase returns at most 1000 rows per request. */
const PAGE_SIZE = 1000;

/** Estimates from sets with more reps than this are too unreliable to show. */
const MAX_REPS_FOR_ESTIMATE = 12;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One ticked set from a finished session. */
export type ProgressSet = {
  sessionId: string;
  /** The session's local date, YYYY-MM-DD. */
  date: string;
  exerciseId: string;
  exerciseName: string;
  equipment: Equipment;
  zone: Zone;
  /** Negative for assisted machines, where less weight means less help. */
  weightIncreaseKg: number | null;
  /** Null for bodyweight and band. */
  weightKg: number | null;
  reps: number;
};

export type PersonalBest = {
  exerciseId: string;
  exerciseName: string;
  /** `weight`: heaviest. `assisted`: least help. `reps`: most reps (bodyweight and band). */
  kind: 'weight' | 'assisted' | 'reps';
  weightKg: number | null;
  reps: number;
  /** When she first did it. */
  date: string;
  /** Epley estimate from her best set of 1–12 reps; weighted lifts only. */
  estimatedMaxKg: number | null;
};

export type LiftOption = {
  exerciseId: string;
  exerciseName: string;
  assisted: boolean;
  sessionCount: number;
};

export type LiftPoint = { date: string; kg: number };

export type WeekCount = { weekStart: Date; count: number };

type SetRow = {
  session_id: string;
  exercise_id: string;
  weight_kg: number | string | null;
  reps: number | null;
  exercise: {
    name: string;
    equipment: Equipment;
    zone: Zone;
    weight_increase_kg: number | string | null;
  };
  session: { date: string };
};

/** Every ticked set from her finished sessions. */
export async function fetchProgressSets(): Promise<ProgressSet[]> {
  const rows: SetRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('sets')
      .select(
        'id, session_id, exercise_id, weight_kg, reps, exercise:exercises(name, equipment, zone, weight_increase_kg), session:sessions!inner(date, completed_at)'
      )
      .eq('completed', true)
      .not('session.completed_at', 'is', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as SetRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows
    .filter((row) => (row.reps ?? 0) > 0)
    .map((row) => ({
      sessionId: row.session_id,
      date: row.session.date,
      exerciseId: row.exercise_id,
      exerciseName: row.exercise.name,
      equipment: row.exercise.equipment,
      zone: Number(row.exercise.zone) as Zone,
      weightIncreaseKg:
        row.exercise.weight_increase_kg === null ? null : Number(row.exercise.weight_increase_kg),
      weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
      reps: row.reps ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The dates of all her finished sessions, oldest first. */
export async function fetchFinishedSessionDates(): Promise<string[]> {
  const dates: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, date')
      .not('completed_at', 'is', null)
      .order('date')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    dates.push(...(data ?? []).map((row) => row.date as string));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return dates;
}

/** Her all-time bests on one exercise, from finished sessions. */
export type ExerciseBests = {
  weightKg: number;
  /** 0 if no set had 1–12 reps. */
  estimatedMaxKg: number;
  /** Heaviest single set's weight × reps. */
  volumeKg: number;
};

/** Bests for each exercise she has weighted history for, leaving out `excludeSessionId`. */
export async function fetchExerciseBests(
  exerciseIds: string[],
  excludeSessionId: string
): Promise<Record<string, ExerciseBests>> {
  const bests: Record<string, ExerciseBests> = {};
  if (exerciseIds.length === 0) return bests;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('sets')
      .select('id, exercise_id, weight_kg, reps, session:sessions!inner(completed_at)')
      .in('exercise_id', exerciseIds)
      .eq('completed', true)
      .neq('session_id', excludeSessionId)
      .not('weight_kg', 'is', null)
      .not('session.completed_at', 'is', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const weightKg = Number(row.weight_kg);
      const reps = (row.reps as number | null) ?? 0;
      if (weightKg <= 0 || reps < 1) continue;
      const current = (bests[row.exercise_id as string] ??= {
        weightKg: 0,
        estimatedMaxKg: 0,
        volumeKg: 0,
      });
      current.weightKg = Math.max(current.weightKg, weightKg);
      current.estimatedMaxKg = Math.max(current.estimatedMaxKg, estimateOneRepMax(weightKg, reps) ?? 0);
      current.volumeKg = Math.max(current.volumeKg, weightKg * reps);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return bests;
}

function isAssisted(set: ProgressSet): boolean {
  return (set.weightIncreaseKg ?? 0) < 0;
}

function hasWeight(set: ProgressSet): set is ProgressSet & { weightKg: number } {
  return usesWeight(set.equipment) && set.weightKg !== null;
}

/** Epley formula, rounded to the nearest 0.5 kg. */
export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps < 1 || reps > MAX_REPS_FOR_ESTIMATE) return null;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 2) / 2;
}

function groupByExercise(sets: ProgressSet[]): Map<string, ProgressSet[]> {
  const groups = new Map<string, ProgressSet[]>();
  for (const set of sets) {
    const group = groups.get(set.exerciseId) ?? [];
    group.push(set);
    groups.set(set.exerciseId, group);
  }
  return groups;
}

/** One personal best per exercise, most recent first. `sets` must be oldest first. */
export function getPersonalBests(sets: ProgressSet[]): PersonalBest[] {
  const bests: PersonalBest[] = [];
  for (const [exerciseId, group] of groupByExercise(sets)) {
    const weighted = group.filter(hasWeight);
    const kind: PersonalBest['kind'] =
      weighted.length === 0 ? 'reps' : isAssisted(group[0]) ? 'assisted' : 'weight';
    const candidates = kind === 'reps' ? group : weighted;

    let best = candidates[0];
    for (const set of candidates) {
      const isBetter =
        kind === 'reps'
          ? set.reps > best.reps
          : kind === 'weight'
            ? set.weightKg! > best.weightKg! || (set.weightKg === best.weightKg && set.reps > best.reps)
            : set.weightKg! < best.weightKg! || (set.weightKg === best.weightKg && set.reps > best.reps);
      if (isBetter) best = set;
    }

    const estimates =
      kind === 'weight'
        ? weighted.flatMap((set) => estimateOneRepMax(set.weightKg, set.reps) ?? [])
        : [];
    bests.push({
      exerciseId,
      exerciseName: best.exerciseName,
      kind,
      weightKg: kind === 'reps' ? null : best.weightKg,
      reps: best.reps,
      date: best.date,
      estimatedMaxKg: estimates.length > 0 ? Math.max(...estimates) : null,
    });
  }
  return bests.sort(
    (a, b) => b.date.localeCompare(a.date) || a.exerciseName.localeCompare(b.exerciseName)
  );
}

/** Lifts with a weight she can chart, most-trained first. */
export function getLiftOptions(sets: ProgressSet[]): LiftOption[] {
  const options: LiftOption[] = [];
  for (const [exerciseId, group] of groupByExercise(sets)) {
    const weighted = group.filter(hasWeight);
    if (weighted.length === 0) continue;
    options.push({
      exerciseId,
      exerciseName: group[0].exerciseName,
      assisted: isAssisted(group[0]),
      sessionCount: new Set(weighted.map((set) => set.sessionId)).size,
    });
  }
  return options.sort(
    (a, b) => b.sessionCount - a.sessionCount || a.exerciseName.localeCompare(b.exerciseName)
  );
}

/** Her heaviest weight on each training day (least help for assisted machines), oldest first. */
export function getLiftHistory(sets: ProgressSet[], exerciseId: string): LiftPoint[] {
  const byDate = new Map<string, number>();
  for (const set of sets) {
    if (set.exerciseId !== exerciseId || !hasWeight(set)) continue;
    const current = byDate.get(set.date);
    const pick = isAssisted(set) ? Math.min : Math.max;
    byDate.set(set.date, current === undefined ? set.weightKg : pick(current, set.weightKg));
  }
  return [...byDate].map(([date, kg]) => ({ date, kg })).sort((a, b) => a.date.localeCompare(b.date));
}

/** "2026-10-20" as a local date. */
export function parseDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Monday of the date's week. */
function startOfWeek(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
}

/** Sessions in every week from her first session's week to this week. */
export function getWeeklyCounts(dates: string[], today = new Date()): WeekCount[] {
  if (dates.length === 0) return [];
  const counts = new Map<number, number>();
  for (const date of dates) {
    const week = startOfWeek(parseDate(date)).getTime();
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  const weeks: WeekCount[] = [];
  const last = startOfWeek(today).getTime();
  for (
    let week = startOfWeek(parseDate(dates[0]));
    week.getTime() <= last;
    week = new Date(week.getFullYear(), week.getMonth(), week.getDate() + 7)
  ) {
    weeks.push({ weekStart: week, count: counts.get(week.getTime()) ?? 0 });
  }
  return weeks;
}

/** "6 Oct", with the year if it isn't this year. */
export function formatShortDate(date: Date, today = new Date()): string {
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === today.getFullYear() ? label : `${label} ${date.getFullYear()}`;
}

/** Zones she has ticked a set in, from finished sessions, lowest first. */
export function getTrainedZones(sets: ProgressSet[]): Zone[] {
  const seen = new Set(sets.map((set) => set.zone));
  return ZONES.filter((zone) => seen.has(zone));
}

export type ConfidenceEvent = {
  /** YYYY-MM-DD, or an ISO timestamp from onboarding. Null if we don't have a date. */
  date: string | null;
  level: Level;
  kind: 'started' | 'up' | 'down';
};

/** Start plus each later change, oldest first. */
export function getConfidenceTimeline(
  history: ConfidenceHistory[],
  currentLevel: Level,
  startedAt: string | null
): ConfidenceEvent[] {
  const startLevel = history[0]?.from_level ?? currentLevel;
  const events: ConfidenceEvent[] = [{ date: startedAt, level: startLevel, kind: 'started' }];
  for (const row of history) {
    events.push({
      date: row.date,
      level: row.to_level,
      kind: row.to_level > row.from_level ? 'up' : 'down',
    });
  }
  return events;
}
