import { fillCopy, streakCopy } from '@/lib/copy';
import type { Equipment } from '@/lib/exercises';
import { addDays, startOfWeekMonday, toIso } from '@/lib/planner';
import type { ExerciseBests, ProgressSet } from '@/lib/progress';
import { parseDate } from '@/lib/progress';
import { usesWeight } from '@/lib/programmes';
import { parseSessionType, sessionTypeFromSource, type SessionType } from '@/lib/sessionTypes';
import type { LoggedSet, SessionSource } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

/** Stretch sessions this long count toward the weekly target and streak. */
export const STREAK_STRETCH_MIN_SECONDS = 10 * 60;

export const STREAK_GOALS = [4, 8, 12] as const;
export type StreakGoal = (typeof STREAK_GOALS)[number];
export const DEFAULT_STREAK_GOAL: StreakGoal = 8;
export const RECENT_STREAK_WEEKS = 8;

export type StreakWeekStatus = 'counted' | 'gold' | 'repaired' | 'missed' | 'pending';

export type StreakWeek = {
  monday: string;
  status: StreakWeekStatus;
  done: number;
  target: number;
};

export type FinishedSessionMeta = {
  id: string;
  date: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number | null;
  routine_enrolment_id: string | null;
  source: SessionSource;
  type: SessionType;
};

export type ActivityTotals = {
  sessions: number;
  /** Ticked sets of weighted exercises (not bodyweight or band). */
  liftsTracked: number;
  durationSeconds: number;
};

export type WeeklyStreak = {
  /** Consecutive weeks that keep the run alive (counted, gold or repaired). */
  current: number;
  /** Longest run, from the same history as `current`. */
  best: number;
  /** Lifetime weeks with at least one qualifying session. Never resets. */
  weeksTrained: number;
  goldWeeks: number;
  sessionWeeks: number;
  goal: StreakGoal;
  /** True when this week already has at least one qualifying session. */
  hitThisWeek: boolean;
  goldThisWeek: boolean;
  targetThisWeek: number;
  doneThisWeek: number;
  recent: StreakWeek[];
  lastWeek: StreakWeek | null;
  thisWeekStatus: StreakWeekStatus;
  goalReached: boolean;
  /** Monday of the first gold week, if any. */
  firstGoldMonday: string | null;
};

export function nextStreakGoal(goal: StreakGoal): StreakGoal | null {
  if (goal === 4) return 8;
  if (goal === 8) return 12;
  return null;
}

export function formatTrainingHours(seconds: number): string {
  const hours = Math.max(0, seconds) / 3600;
  if (hours < 10) return `${hours.toFixed(2)} h`;
  if (hours < 100) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours)} h`;
}

export function sessionDurationSeconds(session: FinishedSessionMeta): number {
  if (session.duration_seconds !== null && session.duration_seconds > 0) {
    return session.duration_seconds;
  }
  const start = Date.parse(session.started_at);
  const end = Date.parse(session.completed_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 1000);
}

export function normalizeWeeklyTarget(daysPerWeek: number | null | undefined): number {
  const value = Number(daysPerWeek);
  if (Number.isFinite(value) && value >= 1 && value <= 7) return Math.round(value);
  return 3;
}

/** Extra sessions needed this week to repair a missed week. */
export function repairSessionsNeeded(weeklyTarget: number): number {
  return Math.max(normalizeWeeklyTarget(weeklyTarget), 1) + 1;
}

function streakSessionKind(session: FinishedSessionMeta): SessionType {
  if (session.type === 'strength' || session.type === 'cardio' || session.type === 'recovery') {
    return session.type;
  }
  return sessionTypeFromSource(session.source);
}

export type WeekTypeCounts = {
  strength: number;
  cardio: number;
  recovery: number;
};

/** Qualifying sessions this week, split by type. Recovery still needs 10 minutes. */
export function thisWeekTypeCounts(
  sessions: FinishedSessionMeta[],
  now = new Date()
): WeekTypeCounts {
  const monday = toIso(startOfWeekMonday(now));
  const sunday = toIso(addDays(startOfWeekMonday(now), 6));
  const counts: WeekTypeCounts = { strength: 0, cardio: 0, recovery: 0 };
  for (const session of sessions) {
    if (session.date < monday || session.date > sunday) continue;
    if (!sessionCountsTowardStreak(session)) continue;
    counts[streakSessionKind(session)] += 1;
  }
  return counts;
}

/** Strength and cardio always count. Stretch and recovery count from 10 minutes. */
export function sessionCountsTowardStreak(session: FinishedSessionMeta): boolean {
  if (streakSessionKind(session) === 'recovery') {
    return sessionDurationSeconds(session) >= STREAK_STRETCH_MIN_SECONDS;
  }
  return true;
}

export async function fetchFinishedSessionMeta(): Promise<FinishedSessionMeta[]> {
  const rows: FinishedSessionMeta[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, date, started_at, completed_at, duration_seconds, routine_enrolment_id, source, type')
      .not('completed_at', 'is', null)
      .order('date')
      .order('id')
      .range(from, from + 999);
    if (error) {
      if (/duration_seconds|routine_enrolment_id|source|sessions\.type|'type' column/i.test(error.message)) {
        const fallback = await supabase
          .from('sessions')
          .select('id, date, started_at, completed_at, duration_seconds, routine_enrolment_id, source')
          .not('completed_at', 'is', null)
          .order('date')
          .order('id')
          .range(from, from + 999);
        if (fallback.error) {
          const legacy = await supabase
            .from('sessions')
            .select('id, date, started_at, completed_at')
            .not('completed_at', 'is', null)
            .order('date')
            .order('id')
            .range(from, from + 999);
          if (legacy.error) throw legacy.error;
          rows.push(
            ...((legacy.data ?? []) as Omit<
              FinishedSessionMeta,
              'duration_seconds' | 'routine_enrolment_id' | 'source' | 'type'
            >[]).map((row) => ({
              ...row,
              duration_seconds: null,
              routine_enrolment_id: null,
              source: 'programme' as const,
              type: 'strength' as const,
            }))
          );
          if (!legacy.data || legacy.data.length < 1000) break;
          continue;
        }
        rows.push(
          ...((fallback.data ?? []) as Omit<FinishedSessionMeta, 'type'>[]).map((row) => {
            const source = row.source ?? 'programme';
            return {
              ...row,
              source,
              type: parseSessionType(undefined, sessionTypeFromSource(source)),
            };
          })
        );
        if (!fallback.data || fallback.data.length < 1000) break;
        continue;
      }
      throw error;
    }
    rows.push(
      ...((data ?? []) as FinishedSessionMeta[]).map((row) => {
        const source = row.source ?? 'programme';
        return {
          ...row,
          source,
          type: parseSessionType(row.type, sessionTypeFromSource(source)),
        };
      })
    );
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export function getActivityTotals(sessions: FinishedSessionMeta[], sets: ProgressSet[]): ActivityTotals {
  const counted = sessions.filter(sessionCountsTowardStreak);
  return {
    sessions: counted.length,
    liftsTracked: sets.filter((set) => usesWeight(set.equipment)).length,
    durationSeconds: sessions.reduce((sum, session) => sum + sessionDurationSeconds(session), 0),
  };
}

function addWeeks(date: Date, weeks: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + weeks * 7);
}

function statusForWeek(
  week: { monday: string; done: number; target: number },
  next: { done: number; target: number } | undefined,
  thisMondayIso: string,
  firstMondayIso: string | null
): StreakWeekStatus {
  if (week.done > 0) {
    return week.target > 0 && week.done >= week.target ? 'gold' : 'counted';
  }
  if (week.monday >= thisMondayIso) return 'pending';
  if (firstMondayIso && week.monday < firstMondayIso) return 'pending';
  const extraNeeded = repairSessionsNeeded(next?.target ?? 1);
  if (next && next.done >= extraNeeded) return 'repaired';
  return 'missed';
}

function keepsRunAlive(status: StreakWeekStatus): boolean {
  return status === 'counted' || status === 'gold' || status === 'repaired';
}

function runHasASession(status: StreakWeekStatus): boolean {
  return status === 'counted' || status === 'gold' || status === 'repaired';
}

function countCurrentRun(weeks: StreakWeek[], thisMondayIso: string): number {
  let current = 0;
  let sawSession = false;
  for (let index = weeks.length - 1; index >= 0; index -= 1) {
    const week = weeks[index];
    if (week.monday === thisMondayIso && week.status === 'pending') continue;
    if (!keepsRunAlive(week.status)) break;
    current += 1;
    if (runHasASession(week.status)) sawSession = true;
  }
  return sawSession ? current : 0;
}

function countBestRun(weeks: StreakWeek[], thisMondayIso: string): number {
  let best = 0;
  let run = 0;
  let sawSession = false;
  for (const week of weeks) {
    if (week.monday === thisMondayIso && week.status === 'pending') continue;
    if (keepsRunAlive(week.status)) {
      run += 1;
      if (runHasASession(week.status)) sawSession = true;
      if (sawSession && run > best) best = run;
    } else {
      run = 0;
      sawSession = false;
    }
  }
  return best;
}

export function getWeeklyStreak(
  sessions: FinishedSessionMeta[],
  weeklyTarget: number,
  goal: StreakGoal,
  now = new Date()
): WeeklyStreak {
  const thisMonday = startOfWeekMonday(now);
  const thisMondayIso = toIso(thisMonday);
  const target = normalizeWeeklyTarget(weeklyTarget);
  const counted = sessions.filter(sessionCountsTowardStreak);
  const firstDate = counted[0]?.date ?? null;
  const firstMondayIso = firstDate ? toIso(startOfWeekMonday(parseDate(firstDate))) : null;
  const targetThisWeek = target;

  const doneByWeek = new Map<string, number>();
  for (const session of counted) {
    const monday = toIso(startOfWeekMonday(parseDate(session.date)));
    doneByWeek.set(monday, (doneByWeek.get(monday) ?? 0) + 1);
  }

  const historyStart = firstMondayIso
    ? startOfWeekMonday(parseDate(firstMondayIso))
    : thisMonday;
  const raw: { monday: string; done: number; target: number }[] = [];
  for (let cursor = historyStart; cursor.getTime() <= thisMonday.getTime(); cursor = addWeeks(cursor, 1)) {
    const monday = toIso(cursor);
    const done = doneByWeek.get(monday) ?? 0;
    raw.push({
      monday,
      done,
      target,
    });
  }

  const history: StreakWeek[] = raw.map((week, index) => ({
    monday: week.monday,
    done: week.done,
    target: week.target,
    status: statusForWeek(week, raw[index + 1], thisMondayIso, firstMondayIso),
  }));

  const recent: StreakWeek[] = [];
  for (let offset = RECENT_STREAK_WEEKS - 1; offset >= 0; offset -= 1) {
    const monday = toIso(addWeeks(thisMonday, -offset));
    const existing = history.find((week) => week.monday === monday);
    if (existing) {
      recent.push(existing);
      continue;
    }
    const done = doneByWeek.get(monday) ?? 0;
    const draft = {
      monday,
      done,
      target,
    };
    recent.push({
      monday,
      done,
      target: draft.target,
      status: statusForWeek(draft, undefined, thisMondayIso, firstMondayIso),
    });
  }

  const thisWeek = history[history.length - 1] ?? recent[recent.length - 1];
  const lastWeek = history.length >= 2 ? history[history.length - 2] : recent[recent.length - 2] ?? null;
  const doneThisWeek = thisWeek?.done ?? 0;
  const thisWeekStatus = thisWeek?.status ?? 'pending';
  const sessionWeeks = history.filter((week) => week.done > 0).length;

  return {
    current: countCurrentRun(history, thisMondayIso),
    best: countBestRun(history, thisMondayIso),
    weeksTrained: sessionWeeks,
    goldWeeks: history.filter((week) => week.status === 'gold').length,
    sessionWeeks,
    goal,
    hitThisWeek: doneThisWeek > 0,
    goldThisWeek: thisWeekStatus === 'gold',
    targetThisWeek,
    doneThisWeek,
    recent,
    lastWeek,
    thisWeekStatus,
    goalReached: countCurrentRun(history, thisMondayIso) >= goal,
    firstGoldMonday: history.find((week) => week.status === 'gold')?.monday ?? null,
  };
}

export function describeThisWeekTarget(streak: WeeklyStreak): string {
  if (streak.goldThisWeek) return streakCopy.this_week_gold;
  const remaining = Math.max(0, streak.targetThisWeek - streak.doneThisWeek);
  if (streak.hitThisWeek) {
    return fillCopy(streakCopy.this_week_counted, {
      done: streak.doneThisWeek,
      target: streak.targetThisWeek,
      remaining,
    });
  }
  return fillCopy(streakCopy.this_week_none_yet, { target: streak.targetThisWeek });
}

export function describeStreak(streak: WeeklyStreak): string {
  if (streak.lastWeek?.status === 'missed') {
    return fillCopy(streakCopy.repair_progress, {
      done: streak.doneThisWeek,
      needed: repairSessionsNeeded(streak.targetThisWeek),
    });
  }
  if (streak.current === 0 && streak.weeksTrained > 0) {
    return fillCopy(streakCopy.new_run, { total: streak.weeksTrained });
  }
  return describeThisWeekTarget(streak);
}

export async function fetchStreakGoal(): Promise<StreakGoal> {
  const { data, error } = await supabase.from('profiles').select('streak_goal_weeks').maybeSingle();
  if (error) {
    if (/streak_goal_weeks/i.test(error.message)) return DEFAULT_STREAK_GOAL;
    throw new Error(error.message);
  }
  const value = Number((data as { streak_goal_weeks?: number } | null)?.streak_goal_weeks);
  return (STREAK_GOALS as readonly number[]).includes(value) ? (value as StreakGoal) : DEFAULT_STREAK_GOAL;
}

export async function saveStreakGoal(goal: StreakGoal): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  const { error } = await supabase
    .from('profiles')
    .update({ streak_goal_weeks: goal })
    .eq('user_id', user.id);
  if (error) {
    if (/streak_goal_weeks/i.test(error.message)) {
      throw new Error('Streak goals need supabase/activity.sql run in the Supabase SQL editor.');
    }
    throw new Error(error.message);
  }
}

export function collectSessionWins(input: {
  exercises: { id: string; name: string; equipment: Equipment }[];
  ticked: Record<string, { weightKg: number | null; reps: number }[]>;
  previous: Record<string, LoggedSet[]>;
  bests: Record<string, ExerciseBests>;
}): string[] {
  const wins: string[] = [];
  for (const exercise of input.exercises) {
    const sets = input.ticked[exercise.id] ?? [];
    if (sets.length === 0) continue;
    const last = input.previous[exercise.id] ?? [];
    const best = input.bests[exercise.id];
    const heaviest = sets.reduce((max, set) => {
      if (set.weightKg === null) return max;
      return max === null ? set.weightKg : Math.max(max, set.weightKg);
    }, null as number | null);

    if (last.length === 0 && !best) {
      wins.push(`First time on ${exercise.name}!`);
      continue;
    }

    if (heaviest !== null && best && heaviest > best.weightKg) {
      wins.push(`New personal best on ${exercise.name}`);
    }

    const lastWeight = last.find((set) => set.weight_kg !== null)?.weight_kg ?? null;
    if (heaviest !== null && lastWeight !== null && heaviest > lastWeight) {
      const bump = Math.round((heaviest - lastWeight) * 100) / 100;
      wins.push(`+${bump} kg on ${exercise.name} since last time`);
    }
  }
  return wins.slice(0, 3);
}
