import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getWeeklyStreak,
  sessionCountsTowardStreak,
  sessionDurationSeconds,
  type FinishedSessionMeta,
  type StreakGoal,
} from '@/lib/activityStats';
import type { AchievementBadge } from '@/lib/achievements';
import { trackAi } from '@/lib/analytics';
import { fetchCardioLogs } from '@/lib/cardio';
import { fillCopy, recapCopy } from '@/lib/copy';
import { machineGuide, machineGuideForExercise } from '@/lib/machineGuides';
import { addDays, startOfWeekMonday, toIso } from '@/lib/planner';
import { parseDate, type ProgressSet } from '@/lib/progress';
import { usesWeight } from '@/lib/programmes';
import { supabase } from '@/lib/supabase';

const FEATURE = 'monthly_recap' as const;
const PREVIEW_KEY = 'monthly_recap_preview';
const DISMISS_KEY = 'monthly_recap_dismissed';
const CACHE_PREFIX = 'monthly_recap_cache:';
const MIN_SESSIONS = 2;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const RECAP_HIGHLIGHT_KEYS = [
  'sessions',
  'minutes',
  'strength_sessions',
  'cardio_sessions',
  'recovery_sessions',
  'personal_bests',
  'new_exercises',
  'new_machines',
  'weeks_trained',
  'current_run',
  'longest_run',
  'gold_weeks',
  'awards',
] as const;

export type RecapHighlightKey = (typeof RECAP_HIGHLIGHT_KEYS)[number];

export type RecapStats = {
  month: string;
  year: number;
  sessions: number;
  minutes: number;
  strength_sessions: number;
  cardio_sessions: number;
  recovery_sessions: number;
  personal_bests: number;
  pb_names: string[];
  new_exercises: number;
  new_exercise_names: string[];
  new_machines: number;
  new_machine_names: string[];
  weeks_trained: number;
  current_run: number;
  longest_run: number;
  gold_weeks: number;
  awards: number;
  award_names: string[];
};

export type RecapPersonalBest = {
  name: string;
  weightKg: number | null;
};

export type MonthlyRecap = {
  monthKey: string;
  stats: RecapStats;
  headline: string;
  story: string;
  highlight: RecapHighlightKey;
  usedFallback: boolean;
  personalBests: RecapPersonalBest[];
};

type FunctionOk = {
  ok: true;
  month?: string;
  headline?: string;
  story?: string;
  highlight?: string;
  used_fallback?: boolean;
};

type FunctionFail = {
  ok?: false;
  reason?: string;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function monthKeyFromDate(year: number, monthIndex: number): string {
  return `${year}-${pad(monthIndex + 1)}-01`;
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return recapCopy.card_title.replace('{month}', 'month');
  return MONTH_NAMES[month - 1] ?? 'this month';
}

function monthBounds(monthKey: string): { start: string; end: string; lastDay: Date } {
  const [year, month] = monthKey.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  return { start: toIso(startDate), end: toIso(lastDay), lastDay };
}

function previousMonthKey(now: Date): string {
  const cursor = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return monthKeyFromDate(cursor.getFullYear(), cursor.getMonth());
}

function inMonth(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function isAssisted(set: ProgressSet): boolean {
  return (set.weightIncreaseKg ?? 0) < 0;
}

function hasWeight(set: ProgressSet): set is ProgressSet & { weightKg: number } {
  return usesWeight(set.equipment) && set.weightKg !== null;
}

function pbKind(sets: ProgressSet[]): 'weight' | 'assisted' | 'reps' {
  const weighted = sets.filter(hasWeight);
  if (weighted.length === 0) return 'reps';
  return isAssisted(sets[0]) ? 'assisted' : 'weight';
}

function isBetter(kind: 'weight' | 'assisted' | 'reps', set: ProgressSet, best: ProgressSet): boolean {
  if (kind === 'reps') return set.reps > best.reps;
  if (!hasWeight(set) || !hasWeight(best)) return false;
  if (kind === 'weight') {
    return set.weightKg > best.weightKg || (set.weightKg === best.weightKg && set.reps > best.reps);
  }
  return set.weightKg < best.weightKg || (set.weightKg === best.weightKg && set.reps > best.reps);
}

function personalBestsInRange(sets: ProgressSet[], start: string, end: string): RecapPersonalBest[] {
  const byExercise = new Map<string, ProgressSet[]>();
  for (const set of sets) {
    const group = byExercise.get(set.exerciseId) ?? [];
    group.push(set);
    byExercise.set(set.exerciseId, group);
  }
  const hits: RecapPersonalBest[] = [];
  for (const group of byExercise.values()) {
    const kind = pbKind(group);
    const candidates = kind === 'reps' ? group : group.filter(hasWeight);
    let best: ProgressSet | null = null;
    for (const set of candidates) {
      if (!best || isBetter(kind, set, best)) {
        if (inMonth(set.date, start, end)) {
          hits.push({
            name: set.exerciseName,
            weightKg: kind === 'reps' ? null : set.weightKg,
          });
        }
        best = set;
      }
    }
  }
  return hits;
}

function firstDatesById(entries: { id: string; name: string; date: string }[]): { id: string; name: string; date: string }[] {
  const seen = new Map<string, { id: string; name: string; date: string }>();
  for (const entry of entries) {
    const current = seen.get(entry.id);
    if (!current || entry.date < current.date) seen.set(entry.id, entry);
  }
  return [...seen.values()];
}

function weeksInMonth(
  sessions: FinishedSessionMeta[],
  start: string,
  end: string,
  weeklyTarget: number
): { trained: number; gold: number } {
  const counted = sessions.filter(sessionCountsTowardStreak);
  let cursor = startOfWeekMonday(parseDate(start));
  const last = parseDate(end);
  let trained = 0;
  let gold = 0;
  while (cursor.getTime() <= last.getTime()) {
    const weekStart = toIso(cursor);
    const weekEnd = toIso(addDays(cursor, 6));
    const overlaps = weekEnd >= start && weekStart <= end;
    cursor = addDays(cursor, 7);
    if (!overlaps) continue;
    const done = counted.filter((session) => session.date >= weekStart && session.date <= weekEnd).length;
    if (done > 0) trained += 1;
    if (weeklyTarget > 0 && done >= weeklyTarget) gold += 1;
  }
  return { trained, gold };
}

export function buildRecapStats(input: {
  monthKey: string;
  sessions: FinishedSessionMeta[];
  sets: ProgressSet[];
  badges: AchievementBadge[];
  weeklyTarget: number;
  streakGoal: StreakGoal;
  cardio: { sessionId: string; machineId: string; createdAt: string }[];
}): { stats: RecapStats; personalBests: RecapPersonalBest[] } {
  const { start, end, lastDay } = monthBounds(input.monthKey);
  const monthSessions = input.sessions.filter((session) => inMonth(session.date, start, end));
  const minutes = Math.max(
    0,
    Math.round(monthSessions.reduce((sum, session) => sum + sessionDurationSeconds(session), 0) / 60)
  );
  let strength = 0;
  let cardio = 0;
  let recovery = 0;
  for (const session of monthSessions) {
    if (session.type === 'cardio') cardio += 1;
    else if (session.type === 'recovery') recovery += 1;
    else strength += 1;
  }

  const pbs = personalBestsInRange(input.sets, start, end);
  const pbNames = [...new Set(pbs.map((item) => item.name))];

  const firstExercise = firstDatesById(
    input.sets.map((set) => ({ id: set.exerciseId, name: set.exerciseName, date: set.date }))
  );
  const newExercises = firstExercise.filter((item) => inMonth(item.date, start, end));

  const machineEntries: { id: string; name: string; date: string }[] = [];
  for (const set of input.sets) {
    const guide = machineGuideForExercise(set.exerciseId);
    if (guide) machineEntries.push({ id: guide.id, name: guide.name, date: set.date });
  }
  const sessionDate = new Map(input.sessions.map((session) => [session.id, session.date]));
  for (const log of input.cardio) {
    const guide = machineGuide(log.machineId);
    const date = sessionDate.get(log.sessionId) ?? log.createdAt.slice(0, 10);
    if (!date) continue;
    machineEntries.push({
      id: log.machineId,
      name: guide?.name ?? log.machineId.replace(/_/g, ' '),
      date,
    });
  }
  const newMachines = firstDatesById(machineEntries).filter((item) => inMonth(item.date, start, end));

  const weeks = weeksInMonth(input.sessions, start, end, input.weeklyTarget);
  const streak = getWeeklyStreak(input.sessions, input.weeklyTarget, input.streakGoal, lastDay);
  const awards = input.badges.filter(
    (item) => item.unlocked && item.unlockedOn && inMonth(item.unlockedOn, start, end)
  );

  return {
    stats: {
      month: monthLabel(input.monthKey),
      year: Number(input.monthKey.slice(0, 4)),
      sessions: monthSessions.length,
      minutes,
      strength_sessions: strength,
      cardio_sessions: cardio,
      recovery_sessions: recovery,
      personal_bests: pbNames.length,
      pb_names: pbNames,
      new_exercises: newExercises.length,
      new_exercise_names: newExercises.map((item) => item.name),
      new_machines: newMachines.length,
      new_machine_names: newMachines.map((item) => item.name),
      weeks_trained: weeks.trained,
      current_run: streak.current,
      longest_run: streak.best,
      gold_weeks: weeks.gold,
      awards: awards.length,
      award_names: awards.map((item) => item.title),
    },
    personalBests: pbs,
  };
}

export function fallbackRecap(stats: RecapStats): Pick<MonthlyRecap, 'headline' | 'story' | 'highlight'> {
  return {
    headline: `Your ${stats.month} in the gym`,
    story: fillCopy(recapCopy.fallback_story, {
      sessions: stats.sessions,
      minutes: stats.minutes,
      month: stats.month,
    }),
    highlight: 'sessions',
  };
}

function parseHighlight(value: unknown): RecapHighlightKey {
  return RECAP_HIGHLIGHT_KEYS.includes(value as RecapHighlightKey)
    ? (value as RecapHighlightKey)
    : 'sessions';
}

export function highlightLabel(key: RecapHighlightKey): string {
  switch (key) {
    case 'sessions':
      return recapCopy.page_sessions;
    case 'minutes':
      return recapCopy.page_minutes;
    case 'strength_sessions':
      return recapCopy.page_strength;
    case 'cardio_sessions':
      return recapCopy.page_cardio;
    case 'recovery_sessions':
      return recapCopy.page_recovery;
    case 'personal_bests':
      return recapCopy.page_pbs;
    case 'new_exercises':
      return recapCopy.page_new_exercises;
    case 'new_machines':
      return recapCopy.page_new_machines;
    case 'weeks_trained':
      return recapCopy.page_weeks;
    case 'current_run':
    case 'longest_run':
      return recapCopy.page_run;
    case 'gold_weeks':
      return recapCopy.page_gold;
    case 'awards':
      return recapCopy.page_awards;
  }
}

export function highlightValue(stats: RecapStats, key: RecapHighlightKey): string {
  const value = stats[key];
  return String(value);
}

export async function fetchRecapPreview(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREVIEW_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function saveRecapPreview(on: boolean): Promise<void> {
  if (on) await AsyncStorage.setItem(PREVIEW_KEY, '1');
  else await AsyncStorage.removeItem(PREVIEW_KEY);
}

export async function dismissRecap(monthKey: string): Promise<void> {
  await AsyncStorage.setItem(DISMISS_KEY, monthKey);
}

async function isDismissed(monthKey: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DISMISS_KEY)) === monthKey;
  } catch {
    return false;
  }
}

function cacheKey(userId: string, monthKey: string): string {
  return `${CACHE_PREFIX}${userId}:${monthKey}`;
}

async function readCache(userId: string, monthKey: string): Promise<MonthlyRecap | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId, monthKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MonthlyRecap;
    if (!parsed?.story || parsed.monthKey !== monthKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(userId: string, recap: MonthlyRecap): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(userId, recap.monthKey), JSON.stringify(recap));
  } catch {
    /* Cache is optional. */
  }
}

function pickMonth(sessions: FinishedSessionMeta[], now: Date, preview: boolean): string | null {
  const last = previousMonthKey(now);
  const { start, end } = monthBounds(last);
  const lastCount = sessions.filter((session) => inMonth(session.date, start, end)).length;
  if (lastCount >= MIN_SESSIONS) return last;
  if (!preview) return null;
  const months = new Set(sessions.map((session) => session.date.slice(0, 7) + '-01'));
  const sorted = [...months].sort().reverse();
  for (const key of sorted) {
    if (key >= monthKeyFromDate(now.getFullYear(), now.getMonth())) continue;
    const bounds = monthBounds(key);
    const count = sessions.filter((session) => inMonth(session.date, bounds.start, bounds.end)).length;
    if (count >= MIN_SESSIONS) return key;
  }
  return null;
}

function shouldShow(monthKey: string, now: Date, preview: boolean): boolean {
  if (preview) return true;
  const current = monthKeyFromDate(now.getFullYear(), now.getMonth());
  return current > monthKey;
}

async function storyFromServer(
  monthKey: string,
  stats: RecapStats
): Promise<{ headline: string; story: string; highlight: RecapHighlightKey; usedFallback: boolean } | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('monthly-recap', {
      body: { month: monthKey, stats },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    if (error) return null;
    const body = (data ?? {}) as FunctionOk | FunctionFail;
    if (body.ok !== true || !body.story) return null;
    return {
      headline: body.headline?.trim() || `Your ${stats.month} in the gym`,
      story: body.story.trim(),
      highlight: parseHighlight(body.highlight),
      usedFallback: body.used_fallback === true,
    };
  } catch {
    return null;
  }
}

async function storyFromTable(
  userId: string,
  monthKey: string,
  stats: RecapStats
): Promise<{ headline: string; story: string; highlight: RecapHighlightKey; usedFallback: boolean } | null> {
  const { data, error } = await supabase
    .from('monthly_recaps')
    .select('headline, story_text, highlight, used_fallback')
    .eq('user_id', userId)
    .eq('month', monthKey)
    .maybeSingle();
  if (error || !data || !String(data.story_text ?? '').trim()) return null;
  return {
    headline: String(data.headline ?? '').trim() || `Your ${stats.month} in the gym`,
    story: String(data.story_text).trim(),
    highlight: parseHighlight(data.highlight),
    usedFallback: data.used_fallback === true,
  };
}

export async function loadMonthlyRecap(input: {
  sessions: FinishedSessionMeta[];
  sets: ProgressSet[];
  badges: AchievementBadge[];
  weeklyTarget: number;
  streakGoal: StreakGoal;
  now?: Date;
  monthKey?: string;
  ignoreDismissed?: boolean;
}): Promise<MonthlyRecap | null> {
  const now = input.now ?? new Date();
  const preview = await fetchRecapPreview();
  const month = input.monthKey ?? pickMonth(input.sessions, now, preview);
  if (!month || (!input.monthKey && !shouldShow(month, now, preview))) return null;
  if (!preview && !input.ignoreDismissed && (await isDismissed(month))) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? 'local';
  const cached = await readCache(userId, month);
  if (cached) return cached;

  const logs = await fetchCardioLogs().catch(() => []);
  const built = buildRecapStats({
    monthKey: month,
    sessions: input.sessions,
    sets: input.sets,
    badges: input.badges,
    weeklyTarget: input.weeklyTarget,
    streakGoal: input.streakGoal,
    cardio: logs.map((log) => ({
      sessionId: log.sessionId,
      machineId: log.machineId,
      createdAt: log.createdAt,
    })),
  });
  if (built.stats.sessions < MIN_SESSIONS) return null;

  const stored = userId !== 'local' ? await storyFromTable(userId, month, built.stats) : null;
  const remote = stored ?? (await storyFromServer(month, built.stats));
  const copy = remote ?? fallbackRecap(built.stats);
  if (remote?.usedFallback) trackAi('ai_fallback_used', FEATURE);
  else if (remote) trackAi('ai_feature_used', FEATURE);
  else trackAi('ai_fallback_used', FEATURE);

  const recap: MonthlyRecap = {
    monthKey: month,
    stats: built.stats,
    headline: copy.headline,
    story: copy.story,
    highlight: copy.highlight,
    usedFallback: remote ? remote.usedFallback : true,
    personalBests: built.personalBests,
  };
  await writeCache(userId, recap);
  return recap;
}

export function recapShareMessage(
  recap: MonthlyRecap,
  includePb: boolean
): string {
  const lines = [
    `Your ${recap.stats.month} in the gym`,
    recap.headline,
    recap.story,
    `${highlightLabel(recap.highlight)}: ${highlightValue(recap.stats, recap.highlight)}`,
  ];
  if (includePb && recap.personalBests[0]) {
    const pb = recap.personalBests[0];
    lines.push(
      pb.weightKg != null
        ? `Personal best: ${pb.name}, ${pb.weightKg} kg`
        : `Personal best: ${pb.name}`
    );
  }
  lines.push('Ascenda');
  return lines.filter(Boolean).join('\n');
}
