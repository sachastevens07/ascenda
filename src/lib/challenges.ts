import { sessionCountsTowardStreak, sessionDurationSeconds, type FinishedSessionMeta } from '@/lib/activityStats';
import {
  describeRoutineError,
  toSummary,
  type RoutineSummary,
  type SummaryRow,
} from '@/lib/routines';
import { supabase } from '@/lib/supabase';

export type Challenge = {
  id: string;
  name: string;
  description: string;
  cover: RoutineSummary['cover'];
  routine: RoutineSummary;
  start_date: string;
  end_date: string;
  is_pro: boolean;
  joined: boolean;
  joinedAt: string | null;
  completedAt: string | null;
  participantCount: number;
};

export type ChallengeStatus = 'upcoming' | 'live' | 'ended';

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

function isMissingChallenges(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /challenges|challenge_participants/.test(detail)
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
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function oneCover<T>(cover: T | T[] | null): T | null {
  if (!cover) return null;
  return Array.isArray(cover) ? (cover[0] ?? null) : cover;
}

export function challengeStatus(challenge: Pick<Challenge, 'start_date' | 'end_date'>, now = new Date()): ChallengeStatus {
  const today = todayIso(now);
  if (today < challenge.start_date) return 'upcoming';
  if (today > challenge.end_date) return 'ended';
  return 'live';
}

export function daysUntil(iso: string, now = new Date()): number {
  const [year, month, day] = iso.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function challengeCountdown(challenge: Pick<Challenge, 'start_date' | 'end_date'>, now = new Date()): string {
  const status = challengeStatus(challenge, now);
  if (status === 'upcoming') {
    const days = daysUntil(challenge.start_date, now);
    if (days <= 0) return 'Starts today';
    return days === 1 ? 'Starts tomorrow' : `Starts in ${days} days`;
  }
  if (status === 'ended') return 'This challenge has ended';
  const left = daysUntil(challenge.end_date, now);
  if (left <= 0) return 'Last day';
  return left === 1 ? '1 day left' : `${left} days left`;
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

async function participantRows(): Promise<{ challenge_id: string; user_id: string; joined_at: string; completed_at: string | null }[]> {
  const { data, error } = await supabase
    .from('challenge_participants')
    .select('challenge_id, user_id, joined_at, completed_at');
  if (error) {
    if (isMissingChallenges(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as { challenge_id: string; user_id: string; joined_at: string; completed_at: string | null }[];
}

function toChallenge(
  row: ChallengeRow,
  userId: string | null,
  joins: { challenge_id: string; user_id: string; joined_at: string; completed_at: string | null }[]
): Challenge | null {
  if (!row.routine) return null;
  const mine = joins.find((join) => join.challenge_id === row.id && join.user_id === userId);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cover: oneCover(row.cover),
    routine: toSummary(row.routine),
    start_date: row.start_date,
    end_date: row.end_date,
    is_pro: row.is_pro,
    joined: Boolean(mine),
    joinedAt: mine?.joined_at ?? null,
    completedAt: mine?.completed_at ?? null,
    participantCount: joins.filter((join) => join.challenge_id === row.id).length,
  };
}

export async function fetchChallenges(): Promise<Challenge[]> {
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
  return ((data ?? []) as unknown as ChallengeRow[])
    .map((row) => toChallenge(row, user?.id ?? null, joins))
    .filter((item): item is Challenge => Boolean(item));
}

export async function fetchChallenge(id: string): Promise<Challenge | null> {
  const list = await fetchChallenges();
  return list.find((item) => item.id === id) ?? null;
}

/** Live first, then the next upcoming one. Ended challenges stay off Home. */
export function pickHomeChallenge(challenges: Challenge[], now = new Date()): Challenge | null {
  const live = challenges.filter((item) => challengeStatus(item, now) === 'live');
  if (live[0]) return live[0];
  const upcoming = challenges
    .filter((item) => challengeStatus(item, now) === 'upcoming')
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  return upcoming[0] ?? null;
}

export async function joinChallenge(challengeId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  const { error } = await supabase.from('challenge_participants').insert({
    challenge_id: challengeId,
    user_id: user.id,
  });
  if (error) {
    if (isMissingChallenges(error)) throw new Error(missingChallengesMessage());
    if (error.code === '23505') return;
    throw new Error(error.message);
  }
}

export function challengeSessionCount(
  challenge: Pick<Challenge, 'start_date' | 'end_date'>,
  sessions: FinishedSessionMeta[]
): number {
  return sessions.filter(
    (session) =>
      sessionCountsTowardStreak(session) &&
      session.date >= challenge.start_date &&
      session.date <= challenge.end_date
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
  const seconds = sessions
    .filter((session) => session.date >= challenge.start_date && session.date <= challenge.end_date)
    .reduce((sum, session) => sum + sessionDurationSeconds(session), 0);
  return seconds;
}
