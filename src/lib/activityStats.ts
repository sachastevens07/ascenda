import type { Equipment } from '@/lib/exercises';
import { startOfWeekMonday, toIso } from '@/lib/planner';
import type { ExerciseBests, ProgressSet } from '@/lib/progress';
import { parseDate } from '@/lib/progress';
import { usesWeight } from '@/lib/programmes';
import type { LoggedSet } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export const STREAK_GOALS = [4, 8, 12] as const;
export type StreakGoal = (typeof STREAK_GOALS)[number];
export const DEFAULT_STREAK_GOAL: StreakGoal = 8;

export type FinishedSessionMeta = {
  id: string;
  date: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number | null;
  routine_enrolment_id: string | null;
};

export type ActivityTotals = {
  sessions: number;
  /** Ticked sets of weighted exercises (not bodyweight or band). */
  liftsTracked: number;
  durationSeconds: number;
};

export type WeeklyStreak = {
  current: number;
  goal: StreakGoal;
  /** Weeks in the current streak that used a rest-week pass. */
  restPassesUsed: number;
  hitThisWeek: boolean;
  targetThisWeek: number;
  doneThisWeek: number;
};

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

export async function fetchFinishedSessionMeta(): Promise<FinishedSessionMeta[]> {
  const rows: FinishedSessionMeta[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, date, started_at, completed_at, duration_seconds, routine_enrolment_id')
      .not('completed_at', 'is', null)
      .order('date')
      .order('id')
      .range(from, from + 999);
    if (error) {
      if (/duration_seconds|routine_enrolment_id/i.test(error.message)) {
        const fallback = await supabase
          .from('sessions')
          .select('id, date, started_at, completed_at')
          .not('completed_at', 'is', null)
          .order('date')
          .order('id')
          .range(from, from + 999);
        if (fallback.error) throw fallback.error;
        rows.push(
          ...((fallback.data ?? []) as Omit<FinishedSessionMeta, 'duration_seconds' | 'routine_enrolment_id'>[]).map(
            (row) => ({
              ...row,
              duration_seconds: null,
              routine_enrolment_id: null,
            })
          )
        );
        if (!fallback.data || fallback.data.length < 1000) break;
        continue;
      }
      throw error;
    }
    rows.push(...((data ?? []) as FinishedSessionMeta[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export function getActivityTotals(sessions: FinishedSessionMeta[], sets: ProgressSet[]): ActivityTotals {
  return {
    sessions: sessions.length,
    liftsTracked: sets.filter((set) => usesWeight(set.equipment)).length,
    durationSeconds: sessions.reduce((sum, session) => sum + sessionDurationSeconds(session), 0),
  };
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function getWeeklyStreak(
  sessions: FinishedSessionMeta[],
  plannedByWeek: Map<string, number>,
  fallbackTarget: number,
  goal: StreakGoal,
  now = new Date()
): WeeklyStreak {
  const thisMonday = startOfWeekMonday(now);
  const thisMondayIso = toIso(thisMonday);
  const firstDate = sessions[0]?.date;
  if (!firstDate) {
    return {
      current: 0,
      goal,
      restPassesUsed: 0,
      hitThisWeek: false,
      targetThisWeek: plannedByWeek.get(thisMondayIso) ?? fallbackTarget,
      doneThisWeek: 0,
    };
  }

  const doneByWeek = new Map<string, number>();
  for (const session of sessions) {
    const monday = toIso(startOfWeekMonday(parseDate(session.date)));
    doneByWeek.set(monday, (doneByWeek.get(monday) ?? 0) + 1);
  }

  const weeks: { monday: string; done: number; target: number; hit: boolean }[] = [];
  for (
    let cursor = startOfWeekMonday(parseDate(firstDate));
    cursor.getTime() <= thisMonday.getTime();
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7)
  ) {
    const monday = toIso(cursor);
    const planned = plannedByWeek.get(monday) ?? 0;
    const target = planned > 0 ? planned : fallbackTarget;
    const done = doneByWeek.get(monday) ?? 0;
    weeks.push({ monday, done, target, hit: target > 0 && done >= target });
  }

  const thisWeek = weeks[weeks.length - 1];
  const targetThisWeek = thisWeek?.target ?? fallbackTarget;
  const doneThisWeek = thisWeek?.done ?? 0;
  const hitThisWeek = Boolean(thisWeek?.hit);

  const passesUsed = new Set<string>();
  let current = 0;
  for (let index = weeks.length - 1; index >= 0; index -= 1) {
    const week = weeks[index];
    if (week.monday === thisMondayIso && !week.hit) continue;
    if (week.target <= 0) continue;
    if (week.hit) {
      current += 1;
      continue;
    }
    const month = monthKey(week.monday);
    if (!passesUsed.has(month)) {
      passesUsed.add(month);
      current += 1;
      continue;
    }
    break;
  }

  return {
    current,
    goal,
    restPassesUsed: passesUsed.size,
    hitThisWeek,
    targetThisWeek,
    doneThisWeek,
  };
}

export function describeStreak(streak: WeeklyStreak): string {
  if (streak.current === 0) {
    return 'Hit your week to start a streak. One rest week a month keeps it going — no guilt if you need it.';
  }
  if (streak.current >= streak.goal) {
    return `You’ve hit ${streak.current} weeks. That’s the goal you set. Keep going if it feels good.`;
  }
  if (streak.restPassesUsed > 0) {
    return 'A rest week this month counted so your streak could stay. Gentle pause, not a failure.';
  }
  return 'A week counts when you hit the planner target. One rest week a month is allowed.';
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
