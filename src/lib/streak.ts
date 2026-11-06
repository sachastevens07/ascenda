import AsyncStorage from '@react-native-async-storage/async-storage';

import { showDialog } from '@/components/Dialog';
import {
  nextStreakGoal,
  saveStreakGoal,
  type StreakGoal,
  type WeeklyStreak,
} from '@/lib/activityStats';
import { track, trackOnce } from '@/lib/analytics';
import { fillCopy, streakCopy } from '@/lib/copy';
import { supabase } from '@/lib/supabase';

const HIDE_STREAK_KEY = 'hide_streak';

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

export async function maybePromptMissedWeek(streak: WeeklyStreak): Promise<void> {
  const last = streak.lastWeek;
  if (!last || last.status !== 'missed') return;
  try {
    if (await AsyncStorage.getItem(restPromptKey(last.monday))) return;
    await AsyncStorage.setItem(restPromptKey(last.monday), '1');
  } catch {
    return;
  }
  track('planned_week_missed', { week_start: last.monday });
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
