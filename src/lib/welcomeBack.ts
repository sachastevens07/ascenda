import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FinishedSessionMeta } from '@/lib/activityStats';
import { track, trackOnce } from '@/lib/analytics';
import { FREE_STARTER_ROUTINE_ID } from '@/lib/onboarding';
import { parseIsoDate, startOfWeekMonday, toIso } from '@/lib/planner';
import {
  daysInWeek,
  findPlannedSession,
  firstDayOfRoutine,
  type Routine,
  type RoutineDay,
  type RoutineDifficulty,
  type RoutineEnrolment,
  type RoutineSummary,
} from '@/lib/routines';
import { supabase } from '@/lib/supabase';

const PREVIEW_KEY = 'welcome_back_preview';
const DISMISSED_KEY = 'welcome_back_dismissed_week';
const COMPLETED_KEY = 'welcome_back_completed';
const SESSION_KEY_PREFIX = 'welcome_back_session:';

const DIFFICULTY_RANK: Record<RoutineDifficulty, number> = {
  beginner: 0,
  intermediate: 1,
  experienced: 2,
};

export type WelcomeBackOffer = {
  weeksAway: number;
  body: string;
  restartWeek: number | null;
  restartDay: RoutineDay | null;
  lighterRoutine: RoutineSummary | null;
  nextDay: RoutineDay | null;
  starterRoutineId: string;
};

export function weeksAwayFromSessions(sessions: FinishedSessionMeta[], now = new Date()): number {
  const last = sessions[sessions.length - 1]?.date;
  if (!last) return 0;
  const thisMonday = startOfWeekMonday(now);
  const lastMonday = startOfWeekMonday(parseIsoDate(last));
  const gap = Math.round((thisMonday.getTime() - lastMonday.getTime()) / (7 * 86_400_000));
  return Math.max(0, gap - 1);
}

function isStartOfTerm(now: Date): boolean {
  const month = now.getMonth();
  const day = now.getDate();
  if (day > 14) return false;
  return month === 0 || month === 3 || month === 8;
}

export function welcomeBackBody(now = new Date()): string {
  if (isStartOfTerm(now)) {
    return 'New term, fresh start. Here’s a lighter session to ease back in.';
  }
  if (now.getDate() === 1) {
    return 'New month, fresh start. Here’s a lighter session to ease back in.';
  }
  if (now.getDay() === 1) {
    return 'New week, fresh start. Here’s a lighter session to ease back in.';
  }
  return 'Good to see you. Here’s a lighter session to ease back in.';
}

export function pickLighterRoutine(
  current: RoutineSummary | null,
  catalogue: RoutineSummary[]
): RoutineSummary | null {
  const strength = catalogue.filter((routine) => routine.type !== 'stretch' && routine.id !== current?.id);
  const accessible = strength;
  if (accessible.length === 0) return null;

  const starter = accessible.find((routine) => routine.id === FREE_STARTER_ROUTINE_ID);
  if (starter && current?.id !== FREE_STARTER_ROUTINE_ID) return starter;

  const ranked = [...accessible].sort((a, b) => {
    const difficulty = DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty];
    if (difficulty !== 0) return difficulty;
    if (a.days_per_week !== b.days_per_week) return a.days_per_week - b.days_per_week;
    return a.session_minutes - b.session_minutes;
  });
  const lightest = ranked[0];
  if (!current || !lightest) return lightest ?? null;
  const lighter =
    DIFFICULTY_RANK[lightest.difficulty] < DIFFICULTY_RANK[current.difficulty] ||
    lightest.days_per_week < current.days_per_week ||
    lightest.session_minutes < current.session_minutes;
  return lighter ? lightest : null;
}

export async function fetchWelcomeBackPreview(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREVIEW_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function saveWelcomeBackPreview(on: boolean): Promise<void> {
  if (on) await AsyncStorage.setItem(PREVIEW_KEY, '1');
  else await AsyncStorage.removeItem(PREVIEW_KEY);
}

async function dismissedThisWeek(now: Date): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(DISMISSED_KEY);
    return stored === toIso(startOfWeekMonday(now));
  } catch {
    return false;
  }
}

export async function dismissWelcomeBack(now = new Date()): Promise<void> {
  await AsyncStorage.setItem(DISMISSED_KEY, toIso(startOfWeekMonday(now)));
}

export async function resolveWelcomeBackOffer(input: {
  sessions: FinishedSessionMeta[];
  enrolment: RoutineEnrolment | null;
  routine: Routine | null;
  lastDayId: string | null;
  nextDay: RoutineDay | null;
  catalogue: RoutineSummary[];
  now?: Date;
}): Promise<WelcomeBackOffer | null> {
  const now = input.now ?? new Date();
  const preview = await fetchWelcomeBackPreview();
  const weeksAway = preview ? Math.max(3, weeksAwayFromSessions(input.sessions, now)) : weeksAwayFromSessions(input.sessions, now);
  if (!preview) {
    if (input.sessions.length === 0) return null;
    if (weeksAway < 1) return null;
    if (await dismissedThisWeek(now)) return null;
  }

  const restartWeek = input.enrolment
    ? input.routine && input.lastDayId
      ? findPlannedSession(input.routine, input.lastDayId)?.weekNumber ?? 1
      : 1
    : null;
  const restartDay =
    input.routine && restartWeek !== null ? (daysInWeek(input.routine, restartWeek)[0] ?? null) : null;

  const offer = {
    weeksAway,
    body: welcomeBackBody(now),
    restartWeek,
    restartDay,
    lighterRoutine:
      weeksAway >= 3 ? pickLighterRoutine(input.enrolment?.routine ?? null, input.catalogue) : null,
    nextDay: input.nextDay ?? (input.routine ? firstDayOfRoutine(input.routine) : null),
    starterRoutineId: FREE_STARTER_ROUTINE_ID,
  };
  void trackOnce(`welcome_back_shown:${toIso(startOfWeekMonday(now))}`, 'welcome_back_shown');
  return offer;
}

export async function markWelcomeBackSession(sessionId: string): Promise<void> {
  await AsyncStorage.setItem(`${SESSION_KEY_PREFIX}${sessionId}`, '1');
}

export async function consumeWelcomeBackSession(sessionId: string): Promise<boolean> {
  const key = `${SESSION_KEY_PREFIX}${sessionId}`;
  try {
    const value = await AsyncStorage.getItem(key);
    if (value !== '1') return false;
    await AsyncStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

async function readCompletedDates(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(COMPLETED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export async function fetchBackOnTrack(): Promise<{ unlocked: boolean; at: string | null }> {
  const local = await readCompletedDates();
  if (local.length > 0) return { unlocked: true, at: local[0] };
  try {
    const { data, error } = await supabase
      .from('milestones')
      .select('achieved_at')
      .eq('type', 'back-on-track')
      .maybeSingle();
    if (error) return { unlocked: false, at: null };
    const at = (data as { achieved_at?: string } | null)?.achieved_at ?? null;
    return { unlocked: Boolean(at), at };
  } catch {
    return { unlocked: false, at: null };
  }
}

export async function recordWelcomeBackCompleted(date: string): Promise<void> {
  track('welcome_back_completed');
  const local = await readCompletedDates();
  if (!local.includes(date)) {
    local.push(date);
    await AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify(local));
  }
  await AsyncStorage.removeItem(PREVIEW_KEY);
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('milestones').insert({
      user_id: user.id,
      type: 'back-on-track',
      metadata: { date },
    });
    if (error && !/duplicate|unique|23505/i.test(error.message ?? '')) return;
  } catch {
    /* First unlock only. Repeat returns still count locally. */
  }
}

