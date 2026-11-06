import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchFinishedSessionMeta, sessionDurationSeconds, type FinishedSessionMeta } from '@/lib/activityStats';
import {
  contentChallenge,
  contentChallenges,
  type ChallengeMission,
  type ChallengeRequirement,
  type ContentChallenge,
} from '@/lib/contentChallenges';
import { fillCopy, challengesCopy } from '@/lib/copy';
import { addDays, startOfWeekMonday, toIso } from '@/lib/planner';
import { fetchProgressSets, formatShortDate, type ProgressSet } from '@/lib/progress';
import { describeRoutineError } from '@/lib/routines';
import { supabase } from '@/lib/supabase';

export const MAX_CATCH_UPS = 2;

export type ChallengeStartOption = {
  kind: 'monday' | 'month';
  date: string;
};

export type ChallengeProgressStatus = 'open' | 'upcoming' | 'live' | 'complete' | 'ended';

export type ChallengeWeekProgress = {
  mission: ChallengeMission;
  done: number;
  target: number;
  met: boolean;
};

export type ChallengeProgress = {
  status: ChallengeProgressStatus;
  missionsDone: number;
  missionCount: number;
  catchUpsUsed: number;
  justCaughtUp: boolean;
  current: ChallengeWeekProgress | null;
};

export type Challenge = {
  id: string;
  name: string;
  summary: string;
  description: string;
  coverSlug: string;
  tags: string[];
  lengthWeeks: number;
  missions: ChallengeMission[];
  weeklyTargetRule: ContentChallenge['weekly_target_rule'];
  recommendedRoutines: string[];
  recommendedStretches: string[];
  completionTitle: string;
  completionBody: string;
  featuredFrom: string | null;
  featuredTo: string | null;
  fallbackAnyNewExercise: boolean;
  joined: boolean;
  joinedAt: string | null;
  completedAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  progress: ChallengeProgress;
};

type JoinRow = {
  challenge_id: string;
  user_id: string;
  joined_at: string;
  completed_at: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type LocalJoin = {
  challengeId: string;
  start: string;
  end: string;
  joinedAt: string;
  completedAt: string | null;
};

type SessionHint = {
  id: string;
  date: string;
  durationSeconds: number;
  source: string;
  type: string;
  routineDayId: string | null;
};

const JOINS_KEY = 'challenge-joins';

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
  return 'Challenges need supabase/challenges_h8.sql run in the Supabase SQL editor.';
}

export function describeChallengeError(error: unknown): string {
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  if (/challenges_h8|paths\.sql|challenges|challenge_participants/i.test(detail)) {
    return missingChallengesMessage();
  }
  return describeRoutineError(error) || detail || 'Check your connection and try again.';
}

function parseIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function todayIso(now = new Date()): string {
  return toIso(now);
}

export function endDateFromStart(startIso: string, weeks: number, catchUps = 0): string {
  return toIso(addDays(parseIso(startIso), (weeks + catchUps) * 7 - 1));
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
  const when = formatShortDate(parseIso(option.date), now);
  if (option.kind === 'monday') {
    return option.date === toIso(now) ? when : `${challengesCopy.start_next_monday} · ${when}`;
  }
  return fillCopy(challengesCopy.start_first_of_month, { date: when });
}

function monthDay(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isFeaturedNow(challenge: Pick<Challenge, 'featuredFrom' | 'featuredTo'>, now = new Date()): boolean {
  if (!challenge.featuredFrom || !challenge.featuredTo) return false;
  const md = monthDay(now);
  if (challenge.featuredFrom <= challenge.featuredTo) {
    return md >= challenge.featuredFrom && md <= challenge.featuredTo;
  }
  return md >= challenge.featuredFrom || md <= challenge.featuredTo;
}

function emptyProgress(status: ChallengeProgressStatus, missionCount: number): ChallengeProgress {
  return {
    status,
    missionsDone: 0,
    missionCount,
    catchUpsUsed: 0,
    justCaughtUp: false,
    current: null,
  };
}

function weeklyTarget(rule: ContentChallenge['weekly_target_rule'], daysPerWeek: number): number {
  if (rule === 'min_3_or_days') return Math.min(3, Math.max(1, daysPerWeek));
  return 3;
}

function requirementTarget(requirement: ChallengeRequirement, daysPerWeek: number): number {
  if (requirement.count === 'weekly_target') return weeklyTarget('min_3_or_days', daysPerWeek);
  return requirement.count;
}

function sessionKind(session: SessionHint): 'strength' | 'cardio' | 'stretch' | 'recovery' {
  if (session.source === 'stretch' || session.type === 'recovery') return 'stretch';
  if (session.type === 'cardio') return 'cardio';
  return 'strength';
}

function matchesSessionType(session: SessionHint, types: string[]): boolean {
  if (types.length === 0) return true;
  const kind = sessionKind(session);
  return types.some((type) => {
    if (type === 'stretch' || type === 'recovery') return kind === 'stretch';
    return kind === type;
  });
}

function stretchLongEnough(session: SessionHint, minMinutes: number | null): boolean {
  if (minMinutes == null) return true;
  if (sessionKind(session) !== 'stretch' && session.type !== 'recovery') return true;
  return session.durationSeconds >= minMinutes * 60;
}

function matchesStretchSlug(session: SessionHint, slugs: string[]): boolean {
  if (slugs.length === 0) return true;
  const dayId = (session.routineDayId ?? '').toLowerCase();
  return slugs.some((slug) => dayId === slug || dayId.startsWith(`${slug}-`) || dayId.includes(slug));
}

function setsBefore(sets: ProgressSet[], iso: string): ProgressSet[] {
  return sets.filter((set) => set.date < iso);
}

function setsInRange(sets: ProgressSet[], start: string, end: string): ProgressSet[] {
  return sets.filter((set) => set.date >= start && set.date <= end);
}

function sessionsInRange(sessions: SessionHint[], start: string, end: string): SessionHint[] {
  return sessions.filter((session) => session.date >= start && session.date <= end);
}

function evaluateRequirement(
  requirement: ChallengeRequirement,
  weekStart: string,
  weekEnd: string,
  sessions: SessionHint[],
  sets: ProgressSet[],
  daysPerWeek: number,
  allowFallback: boolean
): { done: number; target: number; met: boolean } {
  const target = requirementTarget(requirement, daysPerWeek);
  const weekSessions = sessionsInRange(sessions, weekStart, weekEnd);
  const weekSets = setsInRange(sets, weekStart, weekEnd);
  const priorSets = setsBefore(sets, weekStart);

  if (requirement.type === 'sessions') {
    const counted = weekSessions.filter(
      (session) =>
        matchesSessionType(session, requirement.session_types) &&
        stretchLongEnough(session, requirement.stretch_min_minutes ?? 10)
    );
    return { done: counted.length, target, met: counted.length >= target };
  }

  if (requirement.type === 'stretch_sessions') {
    const min = requirement.min_minutes ?? 10;
    const stretches = weekSessions.filter(
      (session) => sessionKind(session) === 'stretch' && session.durationSeconds >= min * 60
    );
    const includeOk =
      requirement.include_any_of.length === 0 ||
      stretches.some((session) => matchesStretchSlug(session, requirement.include_any_of));
    const trainingDates = new Set(
      weekSessions.filter((session) => sessionKind(session) !== 'stretch').map((session) => session.date)
    );
    const trainingOk =
      !requirement.one_on_training_day || stretches.some((session) => trainingDates.has(session.date));
    const done = stretches.length;
    return { done, target, met: done >= target && includeOk && trainingOk };
  }

  if (requirement.type === 'new_equipment') {
    const types = requirement.equipment_types;
    const known = new Set(priorSets.map((set) => set.equipment));
    const fresh = new Set(
      weekSets
        .filter((set) => (types.length === 0 || types.includes(set.equipment)) && !known.has(set.equipment))
        .map((set) => set.equipment)
    );
    let met = fresh.size >= target;
    if (!met && allowFallback) {
      const newExercises = newExerciseCount(priorSets, weekSets, []);
      met = newExercises >= 1;
    }
    return { done: fresh.size, target, met };
  }

  const types = requirement.equipment_types;
  const done = newExerciseCount(priorSets, weekSets, types);
  let met = done >= target;
  if (!met && allowFallback) {
    met = newExerciseCount(priorSets, weekSets, []) >= 1;
  }
  return { done, target, met };
}

function newExerciseCount(prior: ProgressSet[], week: ProgressSet[], equipmentTypes: string[]): number {
  const known = new Set(
    prior
      .filter((set) => equipmentTypes.length === 0 || equipmentTypes.includes(set.equipment))
      .map((set) => set.exerciseId)
  );
  const fresh = new Set(
    week
      .filter(
        (set) =>
          (equipmentTypes.length === 0 || equipmentTypes.includes(set.equipment)) && !known.has(set.exerciseId)
      )
      .map((set) => set.exerciseId)
  );
  return fresh.size;
}

export function evaluateChallengeProgress(input: {
  catalogue: ContentChallenge;
  windowStart: string | null;
  completedAt: string | null;
  sessions: SessionHint[];
  sets: ProgressSet[];
  daysPerWeek: number;
  now?: Date;
}): ChallengeProgress {
  const { catalogue } = input;
  const missionCount = catalogue.missions.length;
  if (input.completedAt) {
    return {
      status: 'complete',
      missionsDone: missionCount,
      missionCount,
      catchUpsUsed: 0,
      justCaughtUp: false,
      current: null,
    };
  }
  if (!input.windowStart) return emptyProgress('open', missionCount);
  const today = todayIso(input.now);
  if (today < input.windowStart) return emptyProgress('upcoming', missionCount);

  let missionIndex = 0;
  let catchUpsUsed = 0;
  let justCaughtUp = false;
  let weekIndex = 0;
  const maxWeeks = catalogue.length_weeks + MAX_CATCH_UPS;

  while (weekIndex < maxWeeks && missionIndex < missionCount) {
    const weekStart = toIso(addDays(parseIso(input.windowStart), weekIndex * 7));
    const weekEnd = toIso(addDays(parseIso(weekStart), 6));
    const mission = catalogue.missions[missionIndex];
    const current = evaluateRequirement(
      mission.requirement,
      weekStart,
      weekEnd,
      input.sessions,
      input.sets,
      input.daysPerWeek,
      catalogue.fallback_any_new_exercise
    );
    if (today <= weekEnd) {
      return {
        status: 'live',
        missionsDone: missionIndex,
        missionCount,
        catchUpsUsed,
        justCaughtUp,
        current: { mission, ...current },
      };
    }
    if (current.met) {
      missionIndex += 1;
      justCaughtUp = false;
    } else if (catchUpsUsed < MAX_CATCH_UPS) {
      catchUpsUsed += 1;
      justCaughtUp = true;
    } else {
      return {
        status: 'ended',
        missionsDone: missionIndex,
        missionCount,
        catchUpsUsed,
        justCaughtUp: false,
        current: null,
      };
    }
    weekIndex += 1;
  }

  if (missionIndex >= missionCount) {
    return {
      status: 'complete',
      missionsDone: missionCount,
      missionCount,
      catchUpsUsed,
      justCaughtUp: false,
      current: null,
    };
  }
  return emptyProgress('ended', missionCount);
}

export function challengeStatus(challenge: Challenge): ChallengeProgressStatus {
  return challenge.progress.status;
}

/** Date or this week's mission. Never a countdown. */
export function challengeTimingCopy(challenge: Challenge, now = new Date()): string {
  const status = challenge.progress.status;
  if (status === 'upcoming' && challenge.windowStart) {
    return fillCopy(challengesCopy.starts, { date: formatShortDate(parseIso(challenge.windowStart), now) });
  }
  if (status === 'live' && challenge.progress.current) {
    return fillCopy(challengesCopy.this_week_mission, { mission: challenge.progress.current.mission.title });
  }
  if (status === 'complete') return challengesCopy.complete_title;
  if (status === 'ended') return fillCopy(challengesCopy.ended_quietly, { challenge: challenge.name });
  return challenge.summary;
}

export function challengeRangeCopy(challenge: Challenge, now = new Date()): string {
  if (!challenge.windowStart || !challenge.windowEnd) return challenge.summary;
  return `${formatShortDate(parseIso(challenge.windowStart), now)} to ${formatShortDate(parseIso(challenge.windowEnd), now)}`;
}

export function challengeProgress(challenge: Challenge): { done: number; target: number } {
  const current = challenge.progress.current;
  if (current) return { done: current.done, target: current.target };
  return {
    done: challenge.progress.missionsDone,
    target: challenge.progress.missionCount,
  };
}

function hintsFromMeta(sessions: FinishedSessionMeta[], extra: Map<string, string>): SessionHint[] {
  return sessions.map((session) => ({
    id: session.id,
    date: session.date,
    durationSeconds: sessionDurationSeconds(session),
    source: session.source,
    type: session.type,
    routineDayId: extra.get(session.id) ?? null,
  }));
}

async function loadSessionDayIds(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, routine_day_id')
    .not('completed_at', 'is', null);
  if (error) return new Map();
  const map = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; routine_day_id: string | null }[]) {
    if (row.routine_day_id) map.set(row.id, row.routine_day_id);
  }
  return map;
}

async function readLocalJoins(): Promise<LocalJoin[]> {
  try {
    const raw = await AsyncStorage.getItem(JOINS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalJoin[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalJoins(rows: LocalJoin[]): Promise<void> {
  await AsyncStorage.setItem(JOINS_KEY, JSON.stringify(rows));
}

async function upsertLocalJoin(join: LocalJoin): Promise<void> {
  const rows = await readLocalJoins();
  await writeLocalJoins([...rows.filter((row) => row.challengeId !== join.challengeId), join]);
}

async function removeLocalJoin(challengeId: string): Promise<void> {
  const rows = await readLocalJoins();
  await writeLocalJoins(rows.filter((row) => row.challengeId !== challengeId));
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

function joinFor(
  id: string,
  userId: string | null,
  remote: JoinRow[],
  local: LocalJoin[]
): { start: string | null; joinedAt: string | null; completedAt: string | null } {
  const mine = remote.find((row) => row.challenge_id === id && row.user_id === userId);
  const saved = local.find((row) => row.challengeId === id);
  const start = mine?.start_date ?? saved?.start ?? null;
  return {
    start,
    joinedAt: mine?.joined_at ?? saved?.joinedAt ?? null,
    completedAt: mine?.completed_at ?? saved?.completedAt ?? null,
  };
}

function toChallenge(
  catalogue: ContentChallenge,
  join: { start: string | null; joinedAt: string | null; completedAt: string | null },
  progress: ChallengeProgress
): Challenge {
  const catchUps = progress.catchUpsUsed;
  return {
    id: catalogue.slug,
    name: catalogue.name,
    summary: catalogue.summary,
    description: catalogue.description,
    coverSlug: catalogue.cover_image_slug,
    tags: catalogue.tags,
    lengthWeeks: catalogue.length_weeks,
    missions: catalogue.missions,
    weeklyTargetRule: catalogue.weekly_target_rule,
    recommendedRoutines: catalogue.recommended_routines,
    recommendedStretches: catalogue.recommended_stretches,
    completionTitle: catalogue.completion_title,
    completionBody: catalogue.completion_body,
    featuredFrom: catalogue.featured_from,
    featuredTo: catalogue.featured_to,
    fallbackAnyNewExercise: catalogue.fallback_any_new_exercise,
    joined: Boolean(join.joinedAt),
    joinedAt: join.joinedAt,
    completedAt: progress.status === 'complete' ? join.completedAt ?? join.joinedAt : join.completedAt,
    windowStart: join.start,
    windowEnd: join.start ? endDateFromStart(join.start, catalogue.length_weeks, catchUps) : null,
    progress,
  };
}

export async function fetchChallenges(input?: {
  sessions?: FinishedSessionMeta[];
  sets?: ProgressSet[];
  daysPerWeek?: number;
}): Promise<Challenge[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [remote, local, dayIds, loadedSessions, loadedSets] = await Promise.all([
    participantRows().catch(() => [] as JoinRow[]),
    readLocalJoins(),
    loadSessionDayIds().catch(() => new Map<string, string>()),
    input?.sessions ? Promise.resolve(input.sessions) : fetchFinishedSessionMeta().catch(() => []),
    input?.sets ? Promise.resolve(input.sets) : fetchProgressSets().catch(() => []),
  ]);
  const sessions = hintsFromMeta(loadedSessions, dayIds);
  const sets = loadedSets;
  const daysPerWeek = input?.daysPerWeek ?? 3;
  const list = contentChallenges().map((catalogue) => {
    const join = joinFor(catalogue.slug, user?.id ?? null, remote, local);
    const progress = evaluateChallengeProgress({
      catalogue,
      windowStart: join.start,
      completedAt: join.completedAt,
      sessions,
      sets,
      daysPerWeek,
    });
    return toChallenge(catalogue, join, progress);
  });
  for (const challenge of list) {
    if (challenge.joined && challenge.progress.status === 'complete' && !challenge.completedAt) {
      await markChallengeComplete(challenge.id).catch(() => {});
      challenge.completedAt = new Date().toISOString();
    }
  }
  return list;
}

export async function fetchChallenge(
  id: string,
  input?: { sessions?: FinishedSessionMeta[]; sets?: ProgressSet[]; daysPerWeek?: number }
): Promise<Challenge | null> {
  const list = await fetchChallenges(input);
  return list.find((item) => item.id === id) ?? null;
}

/** Joined live first, then upcoming, then a featured window. Never a countdown. */
export function pickHomeChallenge(challenges: Challenge[], now = new Date()): Challenge | null {
  const joinedLive = challenges.filter((item) => item.joined && item.progress.status === 'live');
  if (joinedLive[0]) return joinedLive[0];
  const joinedUpcoming = challenges
    .filter((item) => item.joined && item.progress.status === 'upcoming')
    .sort((a, b) => (a.windowStart ?? '').localeCompare(b.windowStart ?? ''));
  if (joinedUpcoming[0]) return joinedUpcoming[0];
  return challenges.find((item) => !item.joined && isFeaturedNow(item, now)) ?? null;
}

export function activeJoinedChallenge(challenges: Challenge[]): Challenge | null {
  return (
    challenges.find((item) => item.joined && (item.progress.status === 'live' || item.progress.status === 'upcoming')) ??
    null
  );
}

async function markChallengeComplete(challengeId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const local = await readLocalJoins();
  const row = local.find((item) => item.challengeId === challengeId);
  if (row) {
    row.completedAt = new Date().toISOString();
    await writeLocalJoins(local);
  }
  if (!user) return;
  await supabase
    .from('challenge_participants')
    .update({ completed_at: new Date().toISOString() })
    .eq('challenge_id', challengeId)
    .eq('user_id', user.id);
}

export async function leaveChallenge(challengeId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await removeLocalJoin(challengeId);
  if (!user) return;
  const { error } = await supabase
    .from('challenge_participants')
    .delete()
    .eq('challenge_id', challengeId)
    .eq('user_id', user.id);
  if (error && !isMissingChallenges(error)) throw new Error(error.message);
}

export async function joinChallenge(
  challengeId: string,
  startDate: string,
  options?: { replaceId?: string }
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  if (options?.replaceId && options.replaceId !== challengeId) {
    await leaveChallenge(options.replaceId);
  }
  const catalogue = contentChallenge(challengeId);
  const weeks = catalogue?.length_weeks ?? 4;
  const endDate = endDateFromStart(startDate, weeks);
  await upsertLocalJoin({
    challengeId,
    start: startDate,
    end: endDate,
    joinedAt: new Date().toISOString(),
    completedAt: null,
  });
  const withWindow = await supabase.from('challenge_participants').upsert(
    {
      challenge_id: challengeId,
      user_id: user.id,
      start_date: startDate,
      end_date: endDate,
      completed_at: null,
      joined_at: new Date().toISOString(),
    },
    { onConflict: 'challenge_id,user_id' }
  );
  if (!withWindow.error) return;
  if (isMissingChallenges(withWindow.error) || withWindow.error.code === '23503') return;
  if (!isMissingWindowColumn(withWindow.error)) {
    if (withWindow.error.code === '23505') {
      await supabase
        .from('challenge_participants')
        .update({ start_date: startDate, end_date: endDate, completed_at: null })
        .eq('challenge_id', challengeId)
        .eq('user_id', user.id);
      return;
    }
    throw new Error(withWindow.error.message);
  }
  const fallback = await supabase.from('challenge_participants').insert({
    challenge_id: challengeId,
    user_id: user.id,
  });
  if (fallback.error) {
    if (fallback.error.code === '23505') return;
    if (isMissingChallenges(fallback.error)) return;
    throw new Error(fallback.error.message);
  }
}

export function challengeHours(challenge: Challenge, sessions: FinishedSessionMeta[]): number {
  if (!challenge.windowStart || !challenge.windowEnd) return 0;
  return sessions
    .filter((session) => session.date >= challenge.windowStart! && session.date <= challenge.windowEnd!)
    .reduce((sum, session) => sum + sessionDurationSeconds(session), 0);
}
