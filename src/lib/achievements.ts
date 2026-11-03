import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FinishedSessionMeta, WeeklyStreak } from '@/lib/activityStats';
import type { GymBadge, GymUnlocked } from '@/lib/gymUnlocked';
import { getGymUnlocked } from '@/lib/gymUnlocked';
import { startOfWeekMonday, toIso } from '@/lib/planner';
import type { PersonalBest, ProgressSet } from '@/lib/progress';
import { getPersonalBests, parseDate } from '@/lib/progress';
import { usesWeight } from '@/lib/programmes';
import { supabase } from '@/lib/supabase';

export const SESSION_THRESHOLDS = [1, 5, 10, 25, 50, 100, 250] as const;
export const WEEKS_TRAINED_THRESHOLDS = [4, 12, 26, 52] as const;
export const PB_THRESHOLDS = [1, 10, 50] as const;
export const PROGRAMME_THRESHOLDS = [1, 3, 10] as const;
export const WEIGHT_THRESHOLDS = [1_000, 10_000, 50_000] as const;
export const CONSISTENT_WEEKS = 8;
export const STRETCH_HABIT_COUNT = 10;

const HIDE_KEY = 'hide_achievements';

export type AchievementFamily =
  | 'firsts'
  | 'sessions'
  | 'weeks'
  | 'pbs'
  | 'programmes'
  | 'weight'
  | 'gym';

export type AchievementBadge = GymBadge & {
  family: AchievementFamily;
  /** Target for this badge, when it is part of a numbered family. */
  threshold?: number;
  /** Current value towards `threshold`. */
  progress?: number;
};

export type AchievementGroup = {
  family: AchievementFamily;
  title: string;
  badges: AchievementBadge[];
};

function isMissingHideColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  return /hide_achievements/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

export async function fetchHideAchievements(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(HIDE_KEY);
    const local = stored === '1';
    const { data, error } = await supabase.from('profiles').select('hide_achievements').maybeSingle();
    if (error) return local;
    const value = (data as { hide_achievements?: boolean | null } | null)?.hide_achievements;
    if (typeof value === 'boolean') {
      if (local && !value) {
        await saveHideAchievements(true);
        return true;
      }
      return value;
    }
    return local;
  } catch {
    return false;
  }
}

export async function saveHideAchievements(hidden: boolean): Promise<void> {
  await AsyncStorage.setItem(HIDE_KEY, hidden ? '1' : '0');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('profiles')
    .update({ hide_achievements: hidden })
    .eq('user_id', user.id);
  if (error && !isMissingHideColumn(error)) throw new Error(error.message);
}

export function totalWeightLiftedKg(sets: ProgressSet[]): number {
  return sets.reduce((sum, set) => {
    if (!usesWeight(set.equipment) || set.weightKg === null) return sum;
    return sum + Math.abs(set.weightKg) * set.reps;
  }, 0);
}

function firstSessionDate(sessions: FinishedSessionMeta[]): string | null {
  return sessions[0]?.date ?? null;
}

function nthSessionDate(sessions: FinishedSessionMeta[], count: number): string | null {
  return sessions[count - 1]?.date ?? null;
}

function firstFullWeekDate(sessions: FinishedSessionMeta[]): string | null {
  const byWeek = new Map<string, Set<string>>();
  for (const session of sessions) {
    const monday = toIso(startOfWeekMonday(parseDate(session.date)));
    const days = byWeek.get(monday) ?? new Set<string>();
    days.add(session.date);
    byWeek.set(monday, days);
  }
  for (const session of sessions) {
    const monday = toIso(startOfWeekMonday(parseDate(session.date)));
    if ((byWeek.get(monday)?.size ?? 0) >= 2) return session.date;
  }
  return null;
}

function stretchSessions(sessions: FinishedSessionMeta[]): FinishedSessionMeta[] {
  return sessions.filter((session) => session.source === 'stretch');
}

function badge(
  family: AchievementFamily,
  partial: Omit<AchievementBadge, 'family'>
): AchievementBadge {
  return { family, ...partial };
}

function numbered(
  family: AchievementFamily,
  idPrefix: string,
  value: number,
  thresholds: readonly number[],
  copy: (threshold: number) => { title: string; detail: string },
  unlockedOn: (threshold: number) => string | null
): AchievementBadge[] {
  return thresholds.map((threshold) =>
    badge(family, {
      id: `${idPrefix}-${threshold}`,
      ...copy(threshold),
      unlocked: value >= threshold,
      unlockedOn: value >= threshold ? unlockedOn(threshold) : null,
      threshold,
      progress: value,
    })
  );
}

const SESSION_COPY: Record<number, { title: string; detail: string }> = {
  1: { title: 'First session', detail: 'You finished a workout.' },
  5: { title: '5 sessions', detail: 'Five finished workouts.' },
  10: { title: '10 sessions', detail: 'Ten finished workouts.' },
  25: { title: '25 sessions', detail: 'Twenty-five finished workouts.' },
  50: { title: '50 sessions', detail: 'Fifty finished workouts.' },
  100: { title: '100 sessions', detail: 'One hundred finished workouts.' },
  250: { title: '250 sessions', detail: 'Two hundred and fifty finished workouts.' },
};

const WEEK_COPY: Record<number, { title: string; detail: string }> = {
  4: { title: '4 weeks trained', detail: 'Four weeks with a session. This never resets.' },
  12: { title: '12 weeks trained', detail: 'Twelve weeks with a session.' },
  26: { title: '26 weeks trained', detail: 'Half a year of showing up, counted by week.' },
  52: { title: '52 weeks trained', detail: 'A year of weeks with a session.' },
};

const PB_COPY: Record<number, { title: string; detail: string }> = {
  1: { title: 'First personal best', detail: 'A new best on any lift.' },
  10: { title: '10 personal bests', detail: 'Ten lifts with a best on the board.' },
  50: { title: '50 personal bests', detail: 'Fifty lifts with a best on the board.' },
};

const PROGRAMME_COPY: Record<number, { title: string; detail: string }> = {
  1: { title: 'Routine completed', detail: 'You finished a full routine.' },
  3: { title: '3 routines', detail: 'Three routines completed.' },
  10: { title: '10 routines', detail: 'Ten routines completed.' },
};

const WEIGHT_COPY: Record<number, { title: string; detail: string }> = {
  1000: { title: '1,000 kg logged', detail: 'A thousand kilograms of ticked lifts.' },
  10_000: { title: '10,000 kg logged', detail: 'Ten thousand kilograms of ticked lifts.' },
  50_000: { title: '50,000 kg logged', detail: 'Fifty thousand kilograms of ticked lifts.' },
};

/** Session, week, lift and gym badges. Computed from history so earned awards are never lost. */
export function getAchievementBadges(input: {
  sessions: FinishedSessionMeta[];
  sets: ProgressSet[];
  streak: WeeklyStreak;
  completedRoutines: number;
  gym?: GymUnlocked;
  backOnTrack?: boolean;
  backOnTrackAt?: string | null;
}): AchievementBadge[] {
  return getAchievementGroups(input).flatMap((group) => group.badges);
}

export function getAchievementGroups(input: {
  sessions: FinishedSessionMeta[];
  sets: ProgressSet[];
  streak: WeeklyStreak;
  completedRoutines: number;
  gym?: GymUnlocked;
  backOnTrack?: boolean;
  backOnTrackAt?: string | null;
}): AchievementGroup[] {
  const gym = input.gym ?? getGymUnlocked(input.sets);
  const bests: PersonalBest[] = getPersonalBests(input.sets);
  const firstSession = firstSessionDate(input.sessions);
  const firstWeek = firstFullWeekDate(input.sessions);
  const firstBest = bests.length > 0 ? [...bests].sort((a, b) => a.date.localeCompare(b.date))[0] : null;
  const stretches = stretchSessions(input.sessions);
  const liftedKg = totalWeightLiftedKg(input.sets);

  const sessionBadges = numbered(
    'sessions',
    'session',
    input.sessions.length,
    SESSION_THRESHOLDS,
    (threshold) => SESSION_COPY[threshold],
    (threshold) => nthSessionDate(input.sessions, threshold)
  );
  const weekBadges = numbered(
    'weeks',
    'weeks',
    input.streak.weeksTrained,
    WEEKS_TRAINED_THRESHOLDS,
    (threshold) => WEEK_COPY[threshold],
    () => null
  );
  const pbBadges = numbered(
    'pbs',
    'pb',
    bests.length,
    PB_THRESHOLDS,
    (threshold) => PB_COPY[threshold],
    (threshold) =>
      threshold === 1
        ? (firstBest?.date ?? null)
        : bests.length >= threshold
          ? [...bests].sort((a, b) => a.date.localeCompare(b.date))[threshold - 1]?.date ?? null
          : null
  );
  const programmeBadges = numbered(
    'programmes',
    'routine',
    input.completedRoutines,
    PROGRAMME_THRESHOLDS,
    (threshold) => PROGRAMME_COPY[threshold],
    () => null
  );
  const weightBadges = numbered(
    'weight',
    'weight',
    Math.floor(liftedKg),
    WEIGHT_THRESHOLDS,
    (threshold) => WEIGHT_COPY[threshold],
    () => null
  );

  const firsts: AchievementBadge[] = [
    badge('firsts', {
      id: 'session-1',
      title: 'First session',
      detail: 'You finished a workout.',
      unlocked: input.sessions.length >= 1,
      unlockedOn: firstSession,
    }),
    badge('firsts', {
      id: 'pb-1',
      title: 'First personal best',
      detail: 'A new best on any lift.',
      unlocked: firstBest !== null,
      unlockedOn: firstBest?.date ?? null,
    }),
    badge('firsts', {
      id: 'week-1',
      title: 'First full week',
      detail: 'Two or more sessions in the same week.',
      unlocked: firstWeek !== null,
      unlockedOn: firstWeek,
    }),
    badge('firsts', {
      id: 'gold-week',
      title: 'Gold week',
      detail: 'You hit your weekly target.',
      unlocked: input.streak.goldWeeks >= 1,
      unlockedOn: input.streak.firstGoldMonday,
    }),
    badge('firsts', {
      id: 'back-on-track',
      title: 'Back on track',
      detail: 'You eased back in after time away.',
      unlocked: Boolean(input.backOnTrack),
      unlockedOn: input.backOnTrackAt ?? null,
    }),
    badge('firsts', {
      id: 'consistent',
      title: 'Consistent',
      detail: 'Eight weeks in a run. Rest weeks count.',
      unlocked: input.streak.best >= CONSISTENT_WEEKS,
      unlockedOn: null,
    }),
    badge('firsts', {
      id: 'stretch-habit',
      title: 'Stretch habit',
      detail: 'Ten stretch sessions.',
      unlocked: stretches.length >= STRETCH_HABIT_COUNT,
      unlockedOn: nthSessionDate(stretches, STRETCH_HABIT_COUNT),
    }),
  ];

  const gymBadges: AchievementBadge[] = gym.badges.map((item) => ({
    ...item,
    family: 'gym' as const,
    progress: item.id.startsWith('exercises-') ? gym.exerciseCount : undefined,
    threshold: item.id.startsWith('exercises-') ? Number(item.id.slice('exercises-'.length)) : undefined,
  }));

  return [
    { family: 'firsts', title: 'First times', badges: firsts },
    { family: 'sessions', title: 'Sessions', badges: sessionBadges },
    { family: 'weeks', title: 'Weeks trained', badges: weekBadges },
    { family: 'pbs', title: 'Personal bests', badges: pbBadges },
    { family: 'programmes', title: 'Programmes', badges: programmeBadges },
    { family: 'gym', title: 'Gym unlocked', badges: gymBadges },
    { family: 'weight', title: 'Weight lifted', badges: weightBadges },
  ];
}

export function countEarnedAwards(badges: AchievementBadge[]): number {
  return new Set(badges.filter((item) => item.unlocked).map((item) => item.id)).size;
}

export function nextBadgeInGroup(badges: AchievementBadge[]): AchievementBadge | null {
  return badges.find((item) => !item.unlocked) ?? null;
}

export function formatBadgeProgress(badge: AchievementBadge): string | null {
  if (badge.threshold === undefined || badge.progress === undefined) return null;
  const current = Math.min(badge.progress, badge.threshold);
  return `${Math.round(current).toLocaleString('en-GB')} / ${badge.threshold.toLocaleString('en-GB')}`;
}
