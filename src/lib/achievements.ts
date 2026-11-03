import type { GymBadge, GymUnlocked } from '@/lib/gymUnlocked';
import { getGymUnlocked } from '@/lib/gymUnlocked';
import type { PersonalBest, ProgressSet } from '@/lib/progress';
import { getPersonalBests } from '@/lib/progress';
import type { FinishedSessionMeta, WeeklyStreak } from '@/lib/activityStats';
import { startOfWeekMonday, toIso } from '@/lib/planner';
import { parseDate } from '@/lib/progress';

export type AchievementBadge = GymBadge;

function firstSessionDate(sessions: FinishedSessionMeta[]): string | null {
  return sessions[0]?.date ?? null;
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

function nthSessionDate(sessions: FinishedSessionMeta[], count: number): string | null {
  return sessions[count - 1]?.date ?? null;
}

/** Session, streak and routine badges plus Gym unlocked from R7. */
export function getAchievementBadges(input: {
  sessions: FinishedSessionMeta[];
  sets: ProgressSet[];
  streak: WeeklyStreak;
  completedRoutines: number;
  gym?: GymUnlocked;
  backOnTrack?: boolean;
  backOnTrackAt?: string | null;
}): AchievementBadge[] {
  const gym = input.gym ?? getGymUnlocked(input.sets);
  const bests: PersonalBest[] = getPersonalBests(input.sets);
  const firstSession = firstSessionDate(input.sessions);
  const firstWeek = firstFullWeekDate(input.sessions);
  const firstBest = bests.length > 0 ? [...bests].sort((a, b) => a.date.localeCompare(b.date))[0] : null;

  const milestones: AchievementBadge[] = [
    {
      id: 'session-1',
      title: 'First session',
      detail: 'You finished a workout.',
      unlocked: input.sessions.length >= 1,
      unlockedOn: firstSession,
    },
    {
      id: 'week-1',
      title: 'First full week',
      detail: 'Two or more sessions in the same week.',
      unlocked: firstWeek !== null,
      unlockedOn: firstWeek,
    },
    {
      id: 'back-on-track',
      title: 'Back on track',
      detail: 'You eased back in after time away.',
      unlocked: Boolean(input.backOnTrack),
      unlockedOn: input.backOnTrackAt ?? null,
    },
    {
      id: 'session-5',
      title: '5 sessions',
      detail: 'Five finished workouts.',
      unlocked: input.sessions.length >= 5,
      unlockedOn: nthSessionDate(input.sessions, 5),
    },
    {
      id: 'session-10',
      title: '10 sessions',
      detail: 'Ten finished workouts.',
      unlocked: input.sessions.length >= 10,
      unlockedOn: nthSessionDate(input.sessions, 10),
    },
    {
      id: 'session-25',
      title: '25 sessions',
      detail: 'Twenty-five finished workouts.',
      unlocked: input.sessions.length >= 25,
      unlockedOn: nthSessionDate(input.sessions, 25),
    },
    {
      id: 'session-50',
      title: '50 sessions',
      detail: 'Fifty finished workouts.',
      unlocked: input.sessions.length >= 50,
      unlockedOn: nthSessionDate(input.sessions, 50),
    },
    {
      id: 'pb-1',
      title: 'First personal best',
      detail: 'A new best on any lift.',
      unlocked: firstBest !== null,
      unlockedOn: firstBest?.date ?? null,
    },
    {
      id: 'routine-1',
      title: 'Routine completed',
      detail: 'You finished a full routine.',
      unlocked: input.completedRoutines >= 1,
      unlockedOn: null,
    },
    {
      id: 'streak-4',
      title: '4-week streak',
      detail: 'Four weeks in a row of showing up.',
      unlocked: input.streak.current >= 4,
      unlockedOn: null,
    },
    {
      id: 'streak-8',
      title: '8-week streak',
      detail: 'Eight weeks in a row of showing up.',
      unlocked: input.streak.current >= 8,
      unlockedOn: null,
    },
    {
      id: 'streak-12',
      title: '12-week streak',
      detail: 'Twelve weeks in a row of showing up.',
      unlocked: input.streak.current >= 12,
      unlockedOn: null,
    },
  ];

  return [...milestones, ...gym.badges];
}
