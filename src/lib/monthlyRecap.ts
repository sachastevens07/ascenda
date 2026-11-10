import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  sessionDurationSeconds,
  type FinishedSessionMeta,
} from '@/lib/activityStats';
import { fillCopy, recapCopy } from '@/lib/copy';
import { parseDate, type ProgressSet } from '@/lib/progress';
import { usesWeight } from '@/lib/programmes';

const PREVIEW_KEY = 'monthly_recap_preview';
const DISMISS_KEY = 'monthly_recap_dismissed';
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
const MONTH_SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;

export type ChartMetric = 'workouts' | 'duration' | 'volume' | 'sets';

export type MonthTotals = {
  workouts: number;
  durationSeconds: number;
  volumeKg: number;
  sets: number;
};

export type YearBar = {
  monthKey: string;
  label: string;
  workouts: number;
  durationSeconds: number;
  volumeKg: number;
  sets: number;
};

export type ExerciseMonthRow = {
  exerciseId: string;
  name: string;
  times: number;
};

export type RecapPersonalBest = {
  exerciseId: string;
  name: string;
  kind: 'weight' | 'assisted' | 'reps';
  weightKg: number | null;
  reps: number;
  detail: string;
};

export type MonthlyRecap = {
  monthKey: string;
  monthName: string;
  year: number;
  totals: MonthTotals;
  previous: MonthTotals;
  yearBars: YearBar[];
  exercises: ExerciseMonthRow[];
  personalBests: RecapPersonalBest[];
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function monthKeyFromDate(year: number, monthIndex: number): string {
  return `${year}-${pad(monthIndex + 1)}-01`;
}

export function monthLabel(monthKey: string): string {
  const [, month] = monthKey.split('-').map(Number);
  return MONTH_NAMES[(month ?? 1) - 1] ?? 'this month';
}

function monthBounds(monthKey: string): { start: string; end: string } {
  const [year, month] = monthKey.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`,
  };
}

function previousMonthKey(now: Date): string {
  const cursor = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return monthKeyFromDate(cursor.getFullYear(), cursor.getMonth());
}

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const cursor = new Date(year, month - 1 + delta, 1);
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

function emptyTotals(): MonthTotals {
  return { workouts: 0, durationSeconds: 0, volumeKg: 0, sets: 0 };
}

function totalsForMonth(
  monthKey: string,
  sessions: FinishedSessionMeta[],
  sets: ProgressSet[]
): MonthTotals {
  const { start, end } = monthBounds(monthKey);
  const monthSessions = sessions.filter((session) => inMonth(session.date, start, end));
  const monthSets = sets.filter((set) => inMonth(set.date, start, end));
  return {
    workouts: monthSessions.length,
    durationSeconds: monthSessions.reduce((sum, session) => sum + sessionDurationSeconds(session), 0),
    volumeKg: monthSets.reduce((sum, set) => {
      if (!hasWeight(set)) return sum;
      return sum + Math.abs(set.weightKg) * set.reps;
    }, 0),
    sets: monthSets.length,
  };
}

function isBetter(
  kind: 'weight' | 'assisted' | 'reps',
  set: ProgressSet,
  best: ProgressSet
): boolean {
  if (kind === 'reps') return set.reps > best.reps;
  if (!hasWeight(set) || !hasWeight(best)) return false;
  if (kind === 'weight') {
    return set.weightKg > best.weightKg || (set.weightKg === best.weightKg && set.reps > best.reps);
  }
  return set.weightKg < best.weightKg || (set.weightKg === best.weightKg && set.reps > best.reps);
}

function personalBestsInMonth(sets: ProgressSet[], start: string, end: string): RecapPersonalBest[] {
  const byExercise = new Map<string, ProgressSet[]>();
  for (const set of sets) {
    const group = byExercise.get(set.exerciseId) ?? [];
    group.push(set);
    byExercise.set(set.exerciseId, group);
  }
  const hits: RecapPersonalBest[] = [];
  for (const group of byExercise.values()) {
    const weighted = group.filter(hasWeight);
    const kind: RecapPersonalBest['kind'] =
      weighted.length === 0 ? 'reps' : isAssisted(group[0]) ? 'assisted' : 'weight';
    const candidates = kind === 'reps' ? group : weighted;
    let best: ProgressSet | null = null;
    let firstHit: ProgressSet | null = null;
    for (const set of candidates) {
      if (!best || isBetter(kind, set, best)) {
        if (inMonth(set.date, start, end)) firstHit = set;
        best = set;
      }
    }
    if (!firstHit || !best) continue;
    const detail =
      kind === 'reps'
        ? `${firstHit.reps} reps`
        : kind === 'assisted'
          ? `${firstHit.weightKg} kg assist`
          : `${firstHit.weightKg} kg`;
    hits.push({
      exerciseId: firstHit.exerciseId,
      name: firstHit.exerciseName,
      kind,
      weightKg: kind === 'reps' ? null : firstHit.weightKg,
      reps: firstHit.reps,
      detail,
    });
  }
  return hits.sort((a, b) => a.name.localeCompare(b.name));
}

function exercisesInMonth(sets: ProgressSet[], start: string, end: string): ExerciseMonthRow[] {
  const counts = new Map<string, { name: string; sessions: Set<string> }>();
  for (const set of sets) {
    if (!inMonth(set.date, start, end)) continue;
    const current = counts.get(set.exerciseId) ?? { name: set.exerciseName, sessions: new Set<string>() };
    current.sessions.add(set.date);
    current.name = set.exerciseName;
    counts.set(set.exerciseId, current);
  }
  return [...counts.entries()]
    .map(([exerciseId, value]) => ({
      exerciseId,
      name: value.name,
      times: value.sessions.size,
    }))
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
}

function yearBarsFor(
  monthKey: string,
  sessions: FinishedSessionMeta[],
  sets: ProgressSet[]
): YearBar[] {
  const year = Number(monthKey.slice(0, 4));
  return Array.from({ length: 12 }, (_, index) => {
    const key = monthKeyFromDate(year, index);
    const totals = totalsForMonth(key, sessions, sets);
    return {
      monthKey: key,
      label: MONTH_SHORT[index],
      ...totals,
    };
  });
}

export function buildMonthlyRecap(
  monthKey: string,
  sessions: FinishedSessionMeta[],
  sets: ProgressSet[]
): MonthlyRecap | null {
  const totals = totalsForMonth(monthKey, sessions, sets);
  if (totals.workouts < MIN_SESSIONS) return null;
  const { start, end } = monthBounds(monthKey);
  const [year] = monthKey.split('-').map(Number);
  return {
    monthKey,
    monthName: monthLabel(monthKey),
    year,
    totals,
    previous: totalsForMonth(shiftMonth(monthKey, -1), sessions, sets),
    yearBars: yearBarsFor(monthKey, sessions, sets),
    exercises: exercisesInMonth(sets, start, end),
    personalBests: personalBestsInMonth(sets, start, end),
  };
}

/** Last 3 days of a month, or the first 7 days of the next. */
export function isInRecapWindow(monthKey: string, now = new Date()): boolean {
  const current = monthKeyFromDate(now.getFullYear(), now.getMonth());
  const previous = previousMonthKey(now);
  const day = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (monthKey === current && day >= lastDay - 2) return true;
  if (monthKey === previous && day <= 7) return true;
  return false;
}

function monthHasEnoughSessions(sessions: FinishedSessionMeta[], monthKey: string): boolean {
  const { start, end } = monthBounds(monthKey);
  return sessions.filter((session) => inMonth(session.date, start, end)).length >= MIN_SESSIONS;
}

function pickMonth(sessions: FinishedSessionMeta[], now: Date, preview: boolean): string | null {
  const current = monthKeyFromDate(now.getFullYear(), now.getMonth());
  const previous = previousMonthKey(now);
  const day = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  if ((preview || day <= 7) && monthHasEnoughSessions(sessions, previous)) return previous;
  if ((preview || day >= lastDay - 2) && monthHasEnoughSessions(sessions, current)) return current;
  if (!preview) return null;
  const months = new Set(sessions.map((session) => `${session.date.slice(0, 7)}-01`));
  for (const key of [...months].sort().reverse()) {
    if (monthHasEnoughSessions(sessions, key)) return key;
  }
  return null;
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

export async function loadMonthlyRecap(input: {
  sessions: FinishedSessionMeta[];
  sets: ProgressSet[];
  now?: Date;
  monthKey?: string;
}): Promise<MonthlyRecap | null> {
  const now = input.now ?? new Date();
  const preview = await fetchRecapPreview();
  const month = input.monthKey ?? pickMonth(input.sessions, now, preview);
  if (!month) return null;
  if (!preview && !isInRecapWindow(month, now)) return null;
  if (!preview && (await isDismissed(month))) return null;
  return buildMonthlyRecap(month, input.sessions, input.sets);
}

export function formatRecapDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours <= 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

export function formatRecapVolume(kg: number): string {
  const value = Math.max(0, Math.round(kg));
  if (value >= 10_000) return `${Math.round(value / 1000)}k kg`;
  return `${value.toLocaleString('en-GB')} kg`;
}

export function formatDelta(
  current: number,
  previous: number,
  format: (value: number) => string = String
): { text: string; up: boolean; flat: boolean } {
  const diff = current - previous;
  if (diff === 0 || previous === 0 && current === 0) {
    return { text: '', up: false, flat: true };
  }
  const abs = Math.abs(diff);
  return {
    text: format(abs),
    up: diff > 0,
    flat: false,
  };
}

export function metricValue(totals: MonthTotals, metric: ChartMetric): number {
  switch (metric) {
    case 'workouts':
      return totals.workouts;
    case 'duration':
      return totals.durationSeconds;
    case 'volume':
      return totals.volumeKg;
    case 'sets':
      return totals.sets;
  }
}

export function formatMetricValue(totals: MonthTotals, metric: ChartMetric): string {
  switch (metric) {
    case 'workouts':
      return String(totals.workouts);
    case 'duration':
      return formatRecapDuration(totals.durationSeconds);
    case 'volume':
      return formatRecapVolume(totals.volumeKg);
    case 'sets':
      return String(totals.sets);
  }
}

export function recapShareMessage(recap: MonthlyRecap): string {
  const { totals, monthName, year, personalBests } = recap;
  const lines = [
    `${monthName} ${year}`,
    `${totals.workouts} workouts`,
    formatRecapDuration(totals.durationSeconds),
    formatRecapVolume(totals.volumeKg),
    `${totals.sets} sets`,
  ];
  if (personalBests[0]) {
    lines.push(`PR: ${personalBests[0].name} · ${personalBests[0].detail}`);
  }
  lines.push('Ascenda');
  return lines.join('\n');
}

export function reportTitle(recap: MonthlyRecap): string {
  return fillCopy(recapCopy.report_title, { month: recap.monthName });
}
