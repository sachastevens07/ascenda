import AsyncStorage from '@react-native-async-storage/async-storage';

import { showDialog } from '@/components/Dialog';
import {
  fetchFinishedSessionMeta,
  fetchStreakGoal,
  getWeeklyStreak,
  nextStreakGoal,
  normalizeWeeklyTarget,
  saveStreakGoal,
  type StreakGoal,
  type WeeklyStreak,
} from '@/lib/activityStats';
import { track, trackOnce } from '@/lib/analytics';
import { fillCopy, streakCopy } from '@/lib/copy';
import { supabase } from '@/lib/supabase';

const HIDE_STREAK_KEY = 'hide_streak';
const LOCAL_REST_KEY = 'streak_rest_weeks';

function restPromptKey(monday: string): string {
  return `streak_missed_prompt:${monday}`;
}

function goalCelebratedKey(goal: StreakGoal): string {
  return `streak_goal_celebrated:${goal}`;
}

function isMissingStreakSql(error: { message?: string; code?: string } | null | undefined): boolean {
  const detail = `${error?.code ?? ''} ${error?.message ?? ''}`;
  return /streak_weeks|rest_weeks_banked|hide_streak/i.test(detail);
}

async function readLocalRestWeeks(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_REST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item));
  } catch {
    return [];
  }
}

async function writeLocalRestWeeks(mondays: string[]): Promise<void> {
  const unique = [...new Set(mondays)].sort();
  await AsyncStorage.setItem(LOCAL_REST_KEY, JSON.stringify(unique));
}

async function migrateLocalRestWeeks(userId: string): Promise<void> {
  const local = await readLocalRestWeeks();
  if (local.length === 0) return;
  const { error } = await supabase.from('streak_weeks').upsert(
    local.map((week_start) => ({
      user_id: userId,
      week_start,
      status: 'rest',
    })),
    { onConflict: 'user_id,week_start' }
  );
  if (error) return;
  await AsyncStorage.removeItem(LOCAL_REST_KEY);
}

export async function fetchRestWeekStarts(): Promise<Set<string>> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Set(await readLocalRestWeeks());
    const { data, error } = await supabase
      .from('streak_weeks')
      .select('week_start')
      .eq('user_id', user.id)
      .eq('status', 'rest');
    if (error) {
      if (isMissingStreakSql(error)) return new Set(await readLocalRestWeeks());
      return new Set(await readLocalRestWeeks());
    }
    await migrateLocalRestWeeks(user.id);
    return new Set((data ?? []).map((row) => String((row as { week_start: string }).week_start)));
  } catch {
    return new Set(await readLocalRestWeeks());
  }
}

export async function setRestWeek(monday: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  const { error } = await supabase.from('streak_weeks').upsert(
    { user_id: user.id, week_start: monday, status: 'rest' },
    { onConflict: 'user_id,week_start' }
  );
  if (error) {
    if (!isMissingStreakSql(error)) throw new Error(error.message);
    const local = await readLocalRestWeeks();
    if (!local.includes(monday)) local.push(monday);
    await writeLocalRestWeeks(local);
    track('rest_week_used');
    return;
  }
  const local = await readLocalRestWeeks();
  if (local.length > 0) await writeLocalRestWeeks(local.filter((item) => item !== monday));
  track('rest_week_used');
}

export async function clearRestWeek(monday: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  const { error } = await supabase
    .from('streak_weeks')
    .delete()
    .eq('user_id', user.id)
    .eq('week_start', monday)
    .eq('status', 'rest');
  if (error && !isMissingStreakSql(error)) throw new Error(error.message);
  const local = await readLocalRestWeeks();
  if (local.includes(monday)) await writeLocalRestWeeks(local.filter((item) => item !== monday));
}

export async function syncRestWeeksBanked(value: number): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const clamped = Math.max(0, Math.min(2, Math.round(value)));
    const { error } = await supabase
      .from('profiles')
      .update({ rest_weeks_banked: clamped })
      .eq('user_id', user.id);
    if (error && !isMissingStreakSql(error)) return;
  } catch {
    /* Column is a cache of the computed value. Safe to skip. */
  }
}

async function fetchWeeklyTargetFromProfile(): Promise<number> {
  try {
    const { data, error } = await supabase.from('profiles').select('days_per_week').maybeSingle();
    if (error) return 3;
    return normalizeWeeklyTarget((data as { days_per_week?: number } | null)?.days_per_week);
  } catch {
    return 3;
  }
}

export async function loadStreakSnapshot(): Promise<WeeklyStreak> {
  const [sessions, goal, rest, weeklyTarget] = await Promise.all([
    fetchFinishedSessionMeta(),
    fetchStreakGoal(),
    fetchRestWeekStarts(),
    fetchWeeklyTargetFromProfile(),
  ]);
  const streak = getWeeklyStreak(sessions, weeklyTarget, goal, rest);
  void syncRestWeeksBanked(streak.restWeeksBanked);
  void maybeTrackStreakRepair(streak);
  return streak;
}

export async function fetchHideStreak(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(HIDE_STREAK_KEY);
    const local = stored === '1';
    const { data, error } = await supabase.from('profiles').select('hide_streak').maybeSingle();
    if (error) {
      if (isMissingStreakSql(error)) return local;
      return local;
    }
    const value = (data as { hide_streak?: boolean | null } | null)?.hide_streak;
    if (typeof value === 'boolean') {
      if (local && !value) {
        await saveHideStreak(true);
        return true;
      }
      return value;
    }
    return local;
  } catch {
    return false;
  }
}

export async function saveHideStreak(hidden: boolean): Promise<void> {
  await AsyncStorage.setItem(HIDE_STREAK_KEY, hidden ? '1' : '0');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('profiles').update({ hide_streak: hidden }).eq('user_id', user.id);
  if (error && !isMissingStreakSql(error)) throw new Error(error.message);
}

export async function maybePromptMissedWeek(
  streak: WeeklyStreak,
  onApplied?: () => void
): Promise<void> {
  const last = streak.lastWeek;
  if (!last || last.status !== 'missed') return;
  try {
    if (await AsyncStorage.getItem(restPromptKey(last.monday))) return;
    await AsyncStorage.setItem(restPromptKey(last.monday), '1');
  } catch {
    return;
  }
  track('planned_week_missed', { week_start: last.monday });

  if (streak.restWeeksBanked > 0) {
    showDialog(streakCopy.rest_week_prompt_title, streakCopy.rest_week_prompt_body, [
      {
        text: streakCopy.rest_week_prompt_yes,
        onPress: () => {
          void setRestWeek(last.monday)
            .then(() => {
              onApplied?.();
              showDialog(streakCopy.rest_week_used);
            })
            .catch((error) =>
              showDialog(
                'Couldn’t save that rest week',
                error instanceof Error ? error.message : 'Check your connection and try again.'
              )
            );
        },
      },
      { text: streakCopy.rest_week_prompt_no, style: 'cancel' },
    ]);
    return;
  }

  showDialog(streakCopy.rest_week_prompt_title, streakCopy.repair_offer);
}

export async function maybeTrackStreakRepair(streak: WeeklyStreak): Promise<void> {
  const seen = new Set<string>();
  const weeks = [...streak.recent];
  if (streak.lastWeek) weeks.push(streak.lastWeek);
  for (const week of weeks) {
    if (week.status !== 'repaired' || seen.has(week.monday)) continue;
    seen.add(week.monday);
    await trackOnce(`streak_repaired:${week.monday}`, 'streak_repaired', { week_start: week.monday });
  }
}

export async function maybeCelebrateStreakGoal(streak: WeeklyStreak): Promise<void> {
  if (streak.current < streak.goal) return;
  try {
    if (await AsyncStorage.getItem(goalCelebratedKey(streak.goal))) return;
    await AsyncStorage.setItem(goalCelebratedKey(streak.goal), '1');
  } catch {
    return;
  }

  const next = nextStreakGoal(streak.goal);
  if (!next) {
    showDialog(fillCopy(streakCopy.goal_reached_title, { goal: streak.goal }));
    return;
  }

  showDialog(
    fillCopy(streakCopy.goal_reached_title, { goal: streak.goal }),
    fillCopy(streakCopy.goal_reached_body, { next_goal: next }),
    [
      {
        text: fillCopy(streakCopy.goal_reached_cta, { next_goal: next }),
        onPress: () => {
          void saveStreakGoal(next)
            .then(async () => {
              if (streak.current >= next) {
                await AsyncStorage.setItem(goalCelebratedKey(next), '1');
              }
            })
            .catch((error) =>
              showDialog(
                'Couldn’t save that goal',
                error instanceof Error ? error.message : 'Check your connection and try again.'
              )
            );
        },
      },
      { text: streakCopy.goal_reached_later, style: 'cancel' },
    ]
  );
}
