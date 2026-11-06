import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FinishedSessionMeta } from '@/lib/activityStats';
import { track, trackOnce } from '@/lib/analytics';
import { contentRoutine } from '@/lib/contentRoutines';
import { fillCopy, welcomeBackCopy, welcomeBackFreshStartCopy } from '@/lib/copy';
import { parseIsoDate, startOfWeekMonday, toIso } from '@/lib/planner';
import {
  WELCOME_BACK_ROUTINE_ID,
  daysInWeek,
  findPlannedSession,
  firstDayOfRoutine,
  type Routine,
  type RoutineDay,
  type RoutineEnrolment,
  type RoutineSummary,
} from '@/lib/routines';
import { supabase } from '@/lib/supabase';

const PREVIEW_KEY = 'welcome_back_preview';
const DISMISSED_KEY = 'welcome_back_dismissed_week';
const COMPLETED_KEY = 'welcome_back_completed';
const SESSION_KEY_PREFIX = 'welcome_back_session:';

export type WelcomeBackOffer = {
  weeksAway: number;
  title: string;
  body: string;
  restartWeek: number | null;
  restartDay: RoutineDay | null;
  lighterRoutine: RoutineSummary | null;
  nextDay: RoutineDay | null;
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

function isFreshStartDay(now: Date): boolean {
  return now.getDay() === 1 || now.getDate() === 1 || isStartOfTerm(now);
}

export function welcomeBackTitle(name?: string | null): string {
  const first = name?.trim().split(/\s+/)[0] ?? '';
  if (!first) return welcomeBackCopy.title_no_name;
  return fillCopy(welcomeBackCopy.title, { name: first });
}

export function welcomeBackBody(now = new Date()): string {
  if (isFreshStartDay(now)) return welcomeBackFreshStartCopy.body;
  return welcomeBackCopy.body;
}

function summaryFromOverlay(): RoutineSummary | null {
  const overlay = contentRoutine(WELCOME_BACK_ROUTINE_ID);
  if (!overlay) return null;
  return {
    id: overlay.slug,
    slug: overlay.slug,
    name: overlay.name,
    description: overlay.subtitle,
    cover: null,
    goal: 'confidence',
    length_weeks: overlay.length_weeks,
    days_per_week: overlay.days_per_week,
    session_minutes: overlay.session_minutes,
    difficulty: 'beginner',
    equipment: 'full_gym',
    is_pro: false,
    is_featured_eligible: false,
    sort_order: 99,
    source_programme_id: null,
    type: 'strength',
    tags: [],
    audience: overlay.who_its_for,
    byTheEnd: overlay.by_the_end,
    splitNote: overlay.why_this_split,
    progressionNote: overlay.progression_explained,
    howItWorks: overlay.how_it_works,
    weeklyStructure: overlay.weekly_structure,
  };
}

/** Welcome Back: 4-week restart from /content, used after 3+ weeks away. */
export function pickWelcomeBackRoutine(catalogue: RoutineSummary[]): RoutineSummary | null {
  return (
    catalogue.find(
      (routine) => routine.id === WELCOME_BACK_ROUTINE_ID || routine.slug === WELCOME_BACK_ROUTINE_ID
    ) ?? summaryFromOverlay()
  );
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
  displayName?: string | null;
  now?: Date;
}): Promise<WelcomeBackOffer | null> {
  const now = input.now ?? new Date();
  const preview = await fetchWelcomeBackPreview();
  const weeksAway = preview
    ? Math.max(3, weeksAwayFromSessions(input.sessions, now))
    : weeksAwayFromSessions(input.sessions, now);
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
  const nextDay = input.nextDay ?? (input.routine ? firstDayOfRoutine(input.routine) : null);

  const offer: WelcomeBackOffer = {
    weeksAway,
    title: welcomeBackTitle(input.displayName),
    body: welcomeBackBody(now),
    restartWeek,
    restartDay,
    lighterRoutine: weeksAway >= 3 ? pickWelcomeBackRoutine(input.catalogue) : null,
    nextDay,
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

export async function fetchBackOnTrack(): Promise<{ unlocked: boolean; at: string | null; times: number }> {
  const local = await readCompletedDates();
  if (local.length > 0) return { unlocked: true, at: local[0], times: local.length };
  try {
    const { data, error } = await supabase
      .from('milestones')
      .select('achieved_at')
      .eq('type', 'back-on-track')
      .maybeSingle();
    if (error) return { unlocked: false, at: null, times: 0 };
    const at = (data as { achieved_at?: string } | null)?.achieved_at ?? null;
    return { unlocked: Boolean(at), at, times: at ? 1 : 0 };
  } catch {
    return { unlocked: false, at: null, times: 0 };
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
