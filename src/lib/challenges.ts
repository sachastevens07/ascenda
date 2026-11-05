import AsyncStorage from '@react-native-async-storage/async-storage';

import { sessionCountsTowardStreak, sessionDurationSeconds, type FinishedSessionMeta } from '@/lib/activityStats';
import { addDays, startOfWeekMonday, toIso } from '@/lib/planner';
import { formatShortDate } from '@/lib/progress';
import { hydrateImages } from '@/lib/images';
import {
  describeRoutineError,
  toSummary,
  type RoutineSummary,
  type SummaryRow,
} from '@/lib/routines';
import { supabase } from '@/lib/supabase';

/** Inclusive length of a challenge window. Monday 3 Nov to Sunday 30 Nov is 28 days. */
export const CHALLENGE_LENGTH_DAYS = 28;

export type Challenge = {
  id: string;
  name: string;
  description: string;
  cover: RoutineSummary['cover'];
  routine: RoutineSummary;
  /** Catalogue dates from the old fixed-window model. Status uses the personal window. */
  start_date: string;
  end_date: string;
  windowStart: string | null;
  windowEnd: string | null;
  is_pro: boolean;
  joined: boolean;
  joinedAt: string | null;
  completedAt: string | null;
  participantCount: number;
};

export type ChallengeStatus = 'open' | 'upcoming' | 'live' | 'ended';

export type ChallengeStartOption = {
  kind: 'monday' | 'month';
  date: string;
};

const CHALLENGE_SELECT = `
  id, name, description, start_date, end_date, is_pro,
  cover:images (id, url, storage_path, alt_text, licence_source),
  routine:routines (
    id, name, slug, description, goal, length_weeks, days_per_week, session_minutes,
    difficulty, equipment, is_pro, is_featured_eligible, sort_order, source_programme_id, type,
    cover:images (id, url, storage_path, alt_text, licence_source),
    routine_tags (tag)
  )
`;

type JoinRow = {
  challenge_id: string;
  user_id: string;
  joined_at: string;
  completed_at: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

function isMissingChallenges(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /challenges|challenge_participants/.test(detail)
  );
}

function isMissingWindowColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  const detail = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return (
    error?.code === 'PGRST204' ||
    error?.code === '42703' ||
    /challenge_participants.*start_date|column ["']?start_date|column ["']?end_date/.test(detail)
  );
}

export function missingChallengesMessage(): string {
  return 'Challenges need supabase/paths.sql run in the Supabase SQL editor.';
}

export function describeChallengeError(error: unknown): string {
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  if (/paths\.sql|challenges|challenge_participants/i.test(detail)) {
    return missingChallengesMessage();
  }
  return describeRoutineError(error) || detail || 'Check your connection and try again.';
}

function todayIso(now = new Date()): string {
  return toIso(now);
}

function oneCover<T>(cover: T | T[] | null): T | null {
  if (!cover) return null;
  return Array.isArray(cover) ? (cover[0] ?? null) : cover;
}

function windowKey(userId: string, challengeId: string): string {
  return `challenge-window:${userId}:${challengeId}`;
}

export function endDateFromStart(startIso: string): string {
  return toIso(addDays(parseIso(startIso), CHALLENGE_LENGTH_DAYS - 1));
}

function parseIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Next Monday, or today if today is Monday. */
export function nextMonday(now = new Date()): Date {
  const weekStart = startOfWeekMonday(now);
  if (toIso(weekStart) === toIso(now)) return weekStart;
  return addDays(weekStart, 7);
}

/** The 1st of this month if today is the 1st, otherwise the 1st of next month. */
export function nextMonthStart(now = new Date()): Date {
  if (now.getDate() === 1) return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

export function rollingStartOptions(now = new Date()): ChallengeStartOption[] {
  const monday = { kind: 'monday' as const, date: toIso(nextMonday(now)) };
  const month = { kind: 'month' as const, date: toIso(nextMonthStart(now)) };
  if (monday.date === month.date) return [monday];
  return monday.date < month.date ? [monday, month] : [month, monday];
}

export function formatStartOption(option: ChallengeStartOption, now = new Date()): string {
  const date = parseIso(option.date);
  const when = formatShortDate(date, now);
  const isToday = toIso(now) === option.date;
  if (option.kind === 'monday') {
    return isToday ? `Today, Monday ${when}` : `Monday ${when}`;
  }
  return isToday ? `Today, ${when}` : when;
}

export function challengeWindow(challenge: Pick<Challenge, 'windowStart' | 'windowEnd'>): {
  start: string;
  end: string;
} | null {
  if (!challenge.windowStart || !challenge.windowEnd) return null;
  return { start: challenge.windowStart, end: challenge.windowEnd };
}

export function challengeStatus(
  challenge: Pick<Challenge, 'windowStart' | 'windowEnd'>,
  now = new Date()
): ChallengeStatus {
  const window = challengeWindow(challenge);
  if (!window) return 'open';
  const today = todayIso(now);
  if (today < window.start) return 'upcoming';
  if (today > window.end) return 'ended';
  return 'live';
}

/** Date or open copy. Never a countdown. */
export function challengeTimingCopy(
  challenge: Pick<Challenge, 'windowStart' | 'windowEnd'>,
  now = new Date()
): string {
  const status = challengeStatus(challenge, now);
  const window = challengeWindow(challenge);
  if (status === 'open' || !window) return 'Four weeks. Start on a Monday or the 1st.';
  if (status === 'upcoming') return `Starts ${formatShortDate(parseIso(window.start), now)}`;
  if (status === 'ended') return 'Finished';
  return 'Your four weeks';
}

export function challengeRangeCopy(
  challenge: Pick<Challenge, 'windowStart' | 'windowEnd'>,
  now = new Date()
): string {
  const window = challengeWindow(challenge);
  if (!window) return 'Four weeks. Start on a Monday or the 1st of the month.';
  return `${formatShortDate(parseIso(window.start), now)} to ${formatShortDate(parseIso(window.end), now)}`;
}

export function challengeTargetSessions(routine: Pick<RoutineSummary, 'days_per_week'>): number {
  return routine.days_per_week * 4;
}

type ChallengeRow = {
  id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  is_pro: boolean;
  cover: RoutineSummary['cover'] | RoutineSummary['cover'][] | null;
  routine: SummaryRow | null;
};

async function readLocalWindow(
  userId: string,
  challengeId: string
): Promise<{ start: string; end: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(windowKey(userId, challengeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { start?: string; end?: string };
    if (typeof parsed.start === 'string' && typeof parsed.end === 'string') {
      return { start: parsed.start, end: parsed.end };
    }
    return null;
  } catch {
    return null;
  }
}

async function writeLocalWindow(userId: string, challengeId: string, start: string, end: string): Promise<void> {
  await AsyncStorage.setItem(windowKey(userId, challengeId), JSON.stringify({ start, end }));
}

function windowFromJoinDay(joinedAt: string): { start: string; end: string } {
  const day = joinedAt.slice(0, 10);
  const start = toIso(nextMonday(parseIso(day)));
  return { start, end: endDateFromStart(start) };
}

async function participantRows(): Promise<JoinRow[]> {
  const withWindow = await supabase
    .from('challenge_participants')
    .select('challenge_id, user_id, joined_at, completed_at, start_date, end_date');
  if (!withWindow.error) return (withWindow.data ?? []) as JoinRow[];
  if (!isMissingWindowColumn(withWindow.error) && !isMissingChallenges(withWindow.error)) {
    throw new Error(withWindow.error.message);
  }
  const fallback = await supabase
    .from('challenge_participants')
    .select('challenge_id, user_id, joined_at, completed_at');
  if (fallback.error) {
    if (isMissingChallenges(fallback.error)) return [];
    throw new Error(fallback.error.message);
  }
  return (fallback.data ?? []) as JoinRow[];
}

async function resolveWindow(
  userId: string | null,
  row: ChallengeRow,
  mine: JoinRow | undefined
): Promise<{ start: string; end: string } | null> {
  if (!mine || !userId) return null;
  if (mine.start_date && mine.end_date) return { start: mine.start_date, end: mine.end_date };
  const local = await readLocalWindow(userId, row.id);
  if (local) return local;
  return windowFromJoinDay(mine.joined_at);
}

async function toChallenge(row: ChallengeRow, userId: string | null, joins: JoinRow[]): Promise<Challenge | null> {
  if (!row.routine) return null;
  const mine = joins.find((join) => join.challenge_id === row.id && join.user_id === userId);
  const window = await resolveWindow(userId, row, mine);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cover: oneCover(row.cover),
    routine: toSummary(row.routine),
    start_date: row.start_date,
    end_date: row.end_date,
    windowStart: window?.start ?? null,
    windowEnd: window?.end ?? null,
    is_pro: row.is_pro,
    joined: Boolean(mine),
    joinedAt: mine?.joined_at ?? null,
    completedAt: mine?.completed_at ?? null,
    participantCount: joins.filter((join) => join.challenge_id === row.id).length,
  };
}

export async function fetchChallenges(): Promise<Challenge[]> {
  await hydrateImages();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let { data, error } = await supabase.from('challenges').select(CHALLENGE_SELECT).order('start_date');
  if (error && /type/i.test(error.message ?? '') && !isMissingChallenges(error)) {
    const retry = await supabase
      .from('challenges')
      .select(CHALLENGE_SELECT.replace(', type', ''))
      .order('start_date');
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error) {
    if (isMissingChallenges(error)) return [];
    throw new Error(error.message);
  }
  const joins = await participantRows();
  const mapped = await Promise.all(
    ((data ?? []) as unknown as ChallengeRow[]).map((row) => toChallenge(row, user?.id ?? null, joins))
  );
  return mapped.filter((item): item is Challenge => Boolean(item));
}

export async function fetchChallenge(id: string): Promise<Challenge | null> {
  const list = await fetchChallenges();
  return list.find((item) => item.id === id) ?? null;
}

/** Joined and live first, then a joined start that has not begun, then any open challenge. */
export function pickHomeChallenge(challenges: Challenge[], now = new Date()): Challenge | null {
  const joinedLive = challenges.filter((item) => item.joined && challengeStatus(item, now) === 'live');
  if (joinedLive[0]) return joinedLive[0];
  const joinedUpcoming = challenges
    .filter((item) => item.joined && challengeStatus(item, now) === 'upcoming')
    .sort((a, b) => (a.windowStart ?? '').localeCompare(b.windowStart ?? ''));
  if (joinedUpcoming[0]) return joinedUpcoming[0];
  const open = challenges.filter((item) => challengeStatus(item, now) === 'open');
  return open[0] ?? null;
}

export async function joinChallenge(challengeId: string, startDate: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  const endDate = endDateFromStart(startDate);
  await writeLocalWindow(user.id, challengeId, startDate, endDate);
  const withWindow = await supabase.from('challenge_participants').insert({
    challenge_id: challengeId,
    user_id: user.id,
    start_date: startDate,
    end_date: endDate,
  });
  if (!withWindow.error) return;
  if (withWindow.error.code === '23505') return;
  if (isMissingChallenges(withWindow.error)) throw new Error(missingChallengesMessage());
  if (!isMissingWindowColumn(withWindow.error)) throw new Error(withWindow.error.message);
  const fallback = await supabase.from('challenge_participants').insert({
    challenge_id: challengeId,
    user_id: user.id,
  });
  if (fallback.error) {
    if (fallback.error.code === '23505') return;
    if (isMissingChallenges(fallback.error)) throw new Error(missingChallengesMessage());
    throw new Error(fallback.error.message);
  }
}

export function challengeSessionCount(
  challenge: Pick<Challenge, 'windowStart' | 'windowEnd'>,
  sessions: FinishedSessionMeta[]
): number {
  const window = challengeWindow(challenge);
  if (!window) return 0;
  return sessions.filter(
    (session) =>
      sessionCountsTowardStreak(session) && session.date >= window.start && session.date <= window.end
  ).length;
}

export function challengeProgress(
  challenge: Challenge,
  sessions: FinishedSessionMeta[]
): { done: number; target: number } {
  return {
    done: challengeSessionCount(challenge, sessions),
    target: challengeTargetSessions(challenge.routine),
  };
}

export function challengeHours(challenge: Challenge, sessions: FinishedSessionMeta[]): number {
  const window = challengeWindow(challenge);
  if (!window) return 0;
  return sessions
    .filter((session) => session.date >= window.start && session.date <= window.end)
    .reduce((sum, session) => sum + sessionDurationSeconds(session), 0);
}
