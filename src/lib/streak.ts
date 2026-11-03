import AsyncStorage from '@react-native-async-storage/async-storage';

import { showDialog } from '@/components/Dialog';
import {
  fetchFinishedSessionMeta,
  fetchStreakGoal,
  getWeeklyStreak,
  nextStreakGoal,
  saveStreakGoal,
  type StreakGoal,
  type WeeklyStreak,
} from '@/lib/activityStats';
import { fetchPlannedCountsByWeek, toIso } from '@/lib/planner';
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
    return;
  }
  const local = await readLocalRestWeeks();
  if (local.length > 0) await writeLocalRestWeeks(local.filter((item) => item !== monday));
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

export async function loadStreakSnapshot(fallbackTarget: number): Promise<WeeklyStreak> {
  const [sessions, goal, rest] = await Promise.all([
    fetchFinishedSessionMeta(),
    fetchStreakGoal(),
    fetchRestWeekStarts(),
  ]);
  const from = sessions[0]?.date ?? toIso(new Date());
  const planned = await fetchPlannedCountsByWeek(from, toIso(new Date())).catch(
    () => new Map<string, number>()
  );
  const streak = getWeeklyStreak(sessions, planned, fallbackTarget, goal, rest);
  void syncRestWeeksBanked(streak.restWeeksBanked);
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

  if (streak.restWeeksBanked > 0) {
    showDialog(
      'New week, fresh start',
      'Last week was quiet. You have a rest week ready, which keeps this run going. You can also just train this week when you are ready.',
      [
        {
          text: 'Use a rest week',
          onPress: () => {
            void setRestWeek(last.monday)
              .then(() => onApplied?.())
              .catch((error) =>
                showDialog(
                  'Couldn’t save that rest week',
                  error instanceof Error ? error.message : 'Check your connection and try again.'
                )
              );
          },
        },
        { text: 'Not now', style: 'cancel' },
      ]
    );
    return;
  }

  showDialog(
    'New week, fresh start',
    'Do one extra session this week and last week still counts towards your run.'
  );
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
    showDialog(
      'You reached your streak goal',
      `Your current run is ${streak.current} weeks. Keep showing up if it feels good.`
    );
    return;
  }

  showDialog(
    'You reached your streak goal',
    `Your current run is ${streak.current} weeks. Want to aim for ${next} weeks next?`,
    [
      {
        text: `Aim for ${next} weeks`,
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
      { text: 'Keep this goal', style: 'cancel' },
    ]
  );
}
