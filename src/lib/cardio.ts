import catalogueFile from '../../content/cardio/cardio-sessions.json';

import { cardioCopy, fillCopy } from '@/lib/copy';
import type { GymExperience } from '@/lib/profile';
import { parseDate, type WeekCount } from '@/lib/progress';
import {
  CARDIO_NOTES_KEY,
  CARDIO_PLAN_KEY,
  CARDIO_SLUG_KEY,
  isCardioSession,
  parseCardioStyle,
  type CardioStyle,
} from '@/lib/sessionTypes';
import { describeRoutineError } from '@/lib/routines';
import {
  discardSession,
  fetchActiveSession,
  finishSession,
  insertLoggedCardioSession,
  startCardioSession,
  type Session,
} from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { isSessionInProgressError } from '@/lib/stretches';

export { isSessionInProgressError };

export const CARDIO_MACHINES = [
  'treadmill',
  'bike',
  'cross_trainer',
  'rower',
  'stair_climber',
  'mixed',
] as const;
export type CardioMachineId = (typeof CARDIO_MACHINES)[number];
export type LoggedCardioMachineId = CardioMachineId | 'other';

export const BEGINNER_CARDIO_DAYS = 28;
/** W3 / W8 / L8: this long or more counts towards weekly cardio stats. */
export const CARDIO_COUNTS_MINUTES = 10;
/** L8: bar chart window. */
export const CARDIO_CHART_WEEKS = 8;

export type CardioSettings = {
  speed_kmh?: [number, number] | number;
  incline_percent?: [number, number] | number;
  cadence_rpm?: [number, number] | number;
  strides_per_minute?: [number, number] | number;
  damper?: [number, number] | number;
  strokes_per_minute?: [number, number] | number;
  steps_per_minute?: [number, number] | number;
  resistance?: string;
  level?: [number, number] | number;
  level_text?: string;
  note?: string;
  machine_id?: string;
};

/** JSON stored on custom_workouts.cardio_plan. Same shape as a cardio-sessions.json row. */
export type CardioPlanInterval = {
  label: string;
  seconds: number;
  effort: number;
  cue?: string | null;
  settings: CardioSettings;
};

export type CardioPlan = {
  slug: string;
  name: string;
  summary?: string;
  machine_id: CardioMachineId;
  style: CardioStyle;
  duration_minutes: number;
  max_minutes?: number;
  effort_target: [number, number] | number;
  settings_guidance?: CardioSettings;
  intervals: CardioPlanInterval[];
  beginner_ok?: boolean;
  counts_towards_weekly_target?: boolean;
};

export type CardioInterval = {
  label: string;
  seconds: number;
  effort: number;
  cue: string | null;
  settings: CardioSettings;
  machineId: CardioMachineId | null;
};

export type CardioSessionDef = {
  slug: string;
  name: string;
  summary: string;
  machineId: CardioMachineId;
  style: CardioStyle;
  level: string;
  beginnerOk: boolean;
  durationMinutes: number;
  maxMinutes: number;
  effortTarget: [number, number];
  settings: CardioSettings;
  intervals: CardioInterval[];
  progression: string;
  coachNote: string;
  coverImageSlug: string;
  countsTowardsWeeklyTarget: boolean;
};

export type CardioLog = {
  sessionId: string;
  slug: string;
  machineId: LoggedCardioMachineId;
  minutes: number;
  settingsUsed: Record<string, number | string>;
  effort: number | null;
  distanceKm: number | null;
  calories: number | null;
  createdAt: string;
  /** Session local date (YYYY-MM-DD). Falls back to created_at when the join is missing. */
  date: string;
};

export type CardioFinishInput = {
  minutes: number;
  effort: number | null;
  settingsUsed: Record<string, number | string>;
  distanceKm: number | null;
  calories: number | null;
  notes: string | null;
};

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pair(value: unknown): [number, number] | number | undefined {
  if (Array.isArray(value) && value.length >= 2) {
    const low = num(value[0]);
    const high = num(value[1]);
    if (low != null && high != null) return [low, high];
  }
  const single = num(value);
  return single == null ? undefined : single;
}

function parseMachine(value: unknown): CardioMachineId | null {
  const raw = text(value).replace(/-/g, '_').replace(/ /g, '_');
  return CARDIO_MACHINES.includes(raw as CardioMachineId) ? (raw as CardioMachineId) : null;
}

export function parseLoggedMachine(value: unknown): LoggedCardioMachineId | null {
  const raw = text(value).replace(/-/g, '_').replace(/ /g, '_');
  if (raw === 'other') return 'other';
  return parseMachine(raw);
}

function parseSettings(raw: unknown): CardioSettings {
  const row = asRecord(raw);
  const numericLevel = pair(row.level);
  const levelText = numericLevel == null ? text(row.level) || text(row.level_text) : text(row.level_text);
  return {
    speed_kmh: pair(row.speed_kmh),
    incline_percent: pair(row.incline_percent),
    cadence_rpm: pair(row.cadence_rpm),
    strides_per_minute: pair(row.strides_per_minute),
    damper: pair(row.damper),
    strokes_per_minute: pair(row.strokes_per_minute),
    steps_per_minute: pair(row.steps_per_minute),
    resistance: text(row.resistance) || undefined,
    level: numericLevel,
    level_text: levelText || undefined,
    note: text(row.note) || undefined,
    machine_id: text(row.machine_id) || undefined,
  };
}

function parseInterval(raw: unknown): CardioInterval | null {
  const row = asRecord(raw);
  const seconds = num(row.seconds);
  const label = text(row.label);
  if (!label || seconds == null || seconds < 1) return null;
  const settings = parseSettings(row.settings);
  return {
    label,
    seconds: Math.round(seconds),
    effort: Math.min(10, Math.max(1, Math.round(num(row.effort) ?? 5))),
    cue: text(row.cue) || null,
    settings,
    machineId: parseMachine(settings.machine_id),
  };
}

export function parseCardioPlan(raw: unknown): CardioPlan | null {
  const row = asRecord(raw);
  const slug = text(row.slug);
  const name = text(row.name);
  const machine_id = parseMachine(row.machine_id);
  const style = parseCardioStyle(row.style);
  const duration_minutes = num(row.duration_minutes);
  if (!slug || !name || !machine_id || !style || duration_minutes == null) return null;
  const intervals = asArray(row.intervals)
    .map(parseInterval)
    .filter((item): item is CardioInterval => item != null)
    .map(
      (item): CardioPlanInterval => ({
        label: item.label,
        seconds: item.seconds,
        effort: item.effort,
        cue: item.cue,
        settings: item.settings,
      })
    );
  if (intervals.length === 0) return null;
  const effortRaw = asArray(row.effort_target).map(num).filter((value): value is number => value != null);
  const effortSingle = num(row.effort_target);
  const maxMinutes = num(row.max_minutes);
  const plan: CardioPlan = {
    slug,
    name,
    machine_id,
    style,
    duration_minutes: Math.round(duration_minutes),
    effort_target:
      effortRaw.length >= 2
        ? [effortRaw[0], effortRaw[1]]
        : effortRaw.length === 1
          ? effortRaw[0]
          : effortSingle ?? 5,
    intervals,
  };
  const summary = text(row.summary);
  if (summary) plan.summary = summary;
  if (maxMinutes != null) plan.max_minutes = Math.round(maxMinutes);
  const guidance = parseSettings(row.settings_guidance);
  if (Object.values(guidance).some((value) => value != null && value !== '')) {
    plan.settings_guidance = guidance;
  }
  if (typeof row.beginner_ok === 'boolean') plan.beginner_ok = row.beginner_ok;
  if (typeof row.counts_towards_weekly_target === 'boolean') {
    plan.counts_towards_weekly_target = row.counts_towards_weekly_target;
  }
  return plan;
}

function parseSession(raw: unknown): CardioSessionDef | null {
  const row = asRecord(raw);
  const slug = text(row.slug);
  const name = text(row.name);
  const machineId = parseMachine(row.machine_id);
  const style = parseCardioStyle(row.style);
  const duration = num(row.duration_minutes);
  if (!slug || !name || !machineId || !style || duration == null) return null;
  if (row.is_active === false) return null;
  const effortRaw = asArray(row.effort_target).map(num).filter((value): value is number => value != null);
  const intervals = asArray(row.intervals).map(parseInterval).filter((item): item is CardioInterval => item != null);
  if (intervals.length === 0) return null;
  return {
    slug,
    name,
    summary: text(row.summary),
    machineId,
    style,
    level: text(row.level) || 'beginner',
    beginnerOk: row.beginner_ok !== false,
    durationMinutes: Math.round(duration),
    maxMinutes: Math.round(num(row.max_minutes) ?? duration),
    effortTarget: [effortRaw[0] ?? 4, effortRaw[1] ?? effortRaw[0] ?? 5],
    settings: parseSettings(row.settings_guidance),
    intervals,
    progression: text(row.progression),
    coachNote: text(row.coach_note),
    coverImageSlug: text(row.cover_image_slug) || `cardio-${slug}`,
    countsTowardsWeeklyTarget: row.counts_towards_weekly_target !== false,
  };
}

const file = asRecord(catalogueFile);
const effortScale = new Map<number, string>();
for (const [key, value] of Object.entries(asRecord(file.effort_scale))) {
  const n = Number(key);
  if (Number.isFinite(n)) effortScale.set(n, text(value));
}

const sessions = asArray(file.cardio_sessions)
  .map(parseSession)
  .filter((item): item is CardioSessionDef => item != null);

const bySlug = new Map(sessions.map((item) => [item.slug, item]));

export function allCardioSessions(): CardioSessionDef[] {
  return sessions;
}

export function cardioSession(slug: string | null | undefined): CardioSessionDef | null {
  if (!slug) return null;
  return bySlug.get(slug) ?? null;
}

/** B2: same machine, steady effort, same or shorter time. Falls back to the original slug. */
export function gentleCardioFinisher(slug: string | null | undefined): CardioSessionDef | null {
  const original = cardioSession(slug);
  if (!original) return null;
  const matches = sessions
    .filter(
      (item) =>
        item.machineId === original.machineId &&
        item.style === 'steady' &&
        item.durationMinutes <= original.durationMinutes
    )
    .sort((a, b) => b.durationMinutes - a.durationMinutes);
  return matches[0] ?? original;
}

export function cardioSlugFromSession(session: Session): string | null {
  const fromSwaps = session.exercise_swaps[CARDIO_SLUG_KEY]?.trim();
  return fromSwaps || null;
}

export function cardioPlanFromSession(session: Session): CardioPlan | null {
  const raw = session.exercise_swaps[CARDIO_PLAN_KEY];
  if (!raw) return null;
  try {
    return parseCardioPlan(JSON.parse(raw) as unknown);
  } catch {
    return parseCardioPlan(raw);
  }
}

export function cardioDefFromPlan(plan: CardioPlan): CardioSessionDef {
  const effort = Array.isArray(plan.effort_target)
    ? ([plan.effort_target[0], plan.effort_target[1]] as [number, number])
    : ([plan.effort_target, plan.effort_target] as [number, number]);
  return {
    slug: plan.slug,
    name: plan.name,
    summary: plan.summary ?? '',
    machineId: plan.machine_id,
    style: plan.style,
    level: 'custom',
    beginnerOk: plan.beginner_ok !== false,
    durationMinutes: plan.duration_minutes,
    maxMinutes: plan.max_minutes ?? plan.duration_minutes,
    effortTarget: effort,
    settings: plan.settings_guidance ?? {},
    intervals: plan.intervals.map((item) => ({
      label: item.label,
      seconds: item.seconds,
      effort: item.effort,
      cue: item.cue ?? null,
      settings: item.settings,
      machineId: parseMachine(item.settings.machine_id) ?? plan.machine_id,
    })),
    progression: '',
    coachNote: '',
    coverImageSlug: `machine-${plan.machine_id.replace(/_/g, '-')}`,
    countsTowardsWeeklyTarget: plan.counts_towards_weekly_target !== false,
  };
}

export function machineLabel(id: LoggedCardioMachineId): string {
  if (id === 'treadmill') return cardioCopy.machine_treadmill;
  if (id === 'bike') return cardioCopy.machine_bike;
  if (id === 'cross_trainer') return cardioCopy.machine_cross_trainer;
  if (id === 'rower') return cardioCopy.machine_rower;
  if (id === 'stair_climber') return cardioCopy.machine_stair_climber;
  if (id === 'other') return cardioCopy.machine_other;
  return cardioCopy.machine_mixed;
}

export function styleLabel(style: CardioStyle): string {
  if (style === 'intervals') return cardioCopy.style_intervals;
  if (style === 'finisher') return cardioCopy.style_finisher;
  if (style === 'mixed') return cardioCopy.style_mixed;
  return cardioCopy.style_steady;
}

export function allEffortLabels(): { value: number; label: string }[] {
  return [...effortScale.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, label]) => ({ value, label }));
}

export function cardioRowMeta(session: CardioSessionDef): string {
  return fillCopy(cardioCopy.row_meta, {
    minutes: session.durationMinutes,
    style: styleLabel(session.style),
    machine: machineLabel(session.machineId),
  });
}

export function effortLabel(value: number): string {
  return effortScale.get(value) || '';
}

export function formatEffortTarget(target: [number, number]): string {
  if (target[0] === target[1]) return String(target[0]);
  return cardioCopy.effort_range.replace('{low}', String(target[0])).replace('{high}', String(target[1]));
}

function formatRange(value: [number, number] | number | undefined, unit: string): string | null {
  if (value == null) return null;
  if (typeof value === 'number') return `${value}${unit}`;
  if (value[0] === value[1]) return `${value[0]}${unit}`;
  return `${value[0]} to ${value[1]}${unit}`;
}

export function formatSettings(settings: CardioSettings): string {
  const parts = [
    formatRange(settings.speed_kmh, ' km/h') ? `speed ${formatRange(settings.speed_kmh, ' km/h')}` : null,
    formatRange(settings.incline_percent, '%') ? `incline ${formatRange(settings.incline_percent, '%')}` : null,
    formatRange(settings.cadence_rpm, ' rpm') ? `cadence ${formatRange(settings.cadence_rpm, ' rpm')}` : null,
    formatRange(settings.strides_per_minute, '') ? `strides ${formatRange(settings.strides_per_minute, '')}` : null,
    formatRange(settings.damper, '') ? `damper ${formatRange(settings.damper, '')}` : null,
    formatRange(settings.strokes_per_minute, '')
      ? `strokes ${formatRange(settings.strokes_per_minute, '')}`
      : null,
    formatRange(settings.steps_per_minute, '') ? `steps ${formatRange(settings.steps_per_minute, '')}` : null,
    formatRange(settings.level, '') ? `level ${formatRange(settings.level, '')}` : null,
    settings.level_text ? settings.level_text : null,
    settings.resistance ? `resistance ${settings.resistance}` : null,
    settings.note && settings.note.toLowerCase() !== 'see each block' ? settings.note : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function formatSegmentSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (mins === 0) return `${rest}s`;
  if (rest === 0) return `${mins}:00`;
  return `${mins}:${String(rest).padStart(2, '0')}`;
}

export function sessionMachines(session: CardioSessionDef): CardioMachineId[] {
  if (session.machineId !== 'mixed') return [session.machineId];
  const found = session.intervals
    .map((item) => item.machineId)
    .filter((item): item is CardioMachineId => item != null && item !== 'mixed');
  return [...new Set(found)];
}

/** Keys used by Gym unlocked cardio badges (H6). Other cardio does not unlock a machine. */
export function badgeMachineKeys(
  machineId: LoggedCardioMachineId,
  extra: LoggedCardioMachineId[] = []
): string[] {
  const ids = machineId === 'mixed' ? extra : [machineId, ...extra];
  const keys = new Set<string>();
  for (const id of ids) {
    if (id === 'treadmill') keys.add('treadmill');
    if (id === 'bike') keys.add('bike');
    if (id === 'cross_trainer') keys.add('cross-trainer');
    if (id === 'rower') keys.add('rower');
    if (id === 'stair_climber') keys.add('stair climber');
  }
  return [...keys];
}

export function isBeginnerCardioWindow(input: {
  gymExperience: GymExperience | null | undefined;
  startedOn: string | null | undefined;
  now?: Date;
}): boolean {
  const gym = input.gymExperience;
  if (gym !== 'not_yet' && gym !== 'just_started') return false;
  const now = input.now ?? new Date();
  if (!input.startedOn) return true;
  const start = Date.parse(input.startedOn);
  if (!Number.isFinite(start)) return true;
  return now.getTime() - start < BEGINNER_CARDIO_DAYS * 24 * 60 * 60 * 1000;
}

export function visibleCardioSessions(input: {
  gymExperience: GymExperience | null | undefined;
  startedOn: string | null | undefined;
  machine?: CardioMachineId | 'all';
  style?: CardioStyle | 'all';
  now?: Date;
}): { sessions: CardioSessionDef[]; beginnerWindow: boolean } {
  const beginnerWindow = isBeginnerCardioWindow(input);
  const machine = input.machine ?? 'all';
  const style = input.style ?? 'all';
  const list = sessions.filter((item) => {
    if (beginnerWindow && !item.beginnerOk) return false;
    if (machine !== 'all' && item.machineId !== machine) return false;
    if (style !== 'all' && item.style !== style) return false;
    return true;
  });
  return { sessions: list, beginnerWindow };
}

export function describeCardioError(error: unknown): string {
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  if (/cardio_w8_other\.sql|Other cardio needs/i.test(detail)) return detail;
  if (/cardio_w2\.sql|cardio_logs|source.*cardio/i.test(detail)) return cardioCopy.missing_sql;
  return describeRoutineError(error) || detail || 'Check your connection and try again.';
}

function isMissingCardioTable(error: { message?: string; code?: string } | null): boolean {
  return /cardio_logs|schema cache/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

function throwIfSessionInProgress(active: Session | null): void {
  if (!active) return;
  const error = new Error('You already have a session going');
  (error as Error & { code?: string }).code = 'SESSION_IN_PROGRESS';
  (error as Error & { activeId?: string }).activeId = active.id;
  (error as Error & { activeSource?: string }).activeSource = isCardioSession(active)
    ? 'cardio'
    : active.source;
  throw error;
}

export async function beginCardioSession(slug: string): Promise<Session> {
  const def = cardioSession(slug);
  if (!def) throw new Error(cardioCopy.not_found);
  throwIfSessionInProgress(await fetchActiveSession());
  return startCardioSession(slug);
}

export async function beginCustomCardioSession(
  plan: CardioPlan,
  customWorkoutId?: string | null
): Promise<Session> {
  if (!plan.intervals.length) throw new Error(cardioCopy.not_found);
  throwIfSessionInProgress(await fetchActiveSession());
  return startCardioSession(plan.slug, {
    swaps: { [CARDIO_PLAN_KEY]: JSON.stringify(plan) },
    customWorkoutId,
  });
}

export async function finishCardioSession(
  session: Session,
  def: CardioSessionDef,
  input: CardioFinishInput
): Promise<void> {
  const minutes = Math.max(0, Math.min(180, Math.round(input.minutes * 10) / 10));
  const durationSeconds = Math.round(minutes * 60);
  const machines = sessionMachines(def);
  const settingsUsed = { ...input.settingsUsed };
  if (def.machineId === 'mixed') settingsUsed.machines = machines.join(',');
  const notes = input.notes?.trim();
  if (notes) settingsUsed[CARDIO_NOTES_KEY] = notes;
  else delete settingsUsed[CARDIO_NOTES_KEY];
  const { error } = await supabase.from('cardio_logs').upsert(
    {
      session_id: session.id,
      cardio_session_slug: def.slug,
      machine_id: def.machineId,
      minutes,
      settings_used: settingsUsed,
      effort: input.effort,
      distance_km: input.distanceKm,
      calories: input.calories,
    },
    { onConflict: 'session_id' }
  );
  if (error && !isMissingCardioTable(error)) throw error;
  await finishSession(session.id, durationSeconds);
}

function sessionDateFromRow(row: Json): string {
  const nested = asRecord(row.sessions);
  const fromJoin = text(nested.date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromJoin)) return fromJoin;
  const created = text(row.created_at);
  return created.slice(0, 10);
}

function toLog(row: Json): CardioLog | null {
  const sessionId = text(row.session_id);
  const slug = text(row.cardio_session_slug);
  const machineId = parseLoggedMachine(row.machine_id);
  const minutes = num(row.minutes);
  if (!sessionId || !slug || !machineId || minutes == null) return null;
  const settings = asRecord(row.settings_used);
  const used: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'number' || typeof value === 'string') used[key] = value;
  }
  const createdAt = text(row.created_at) || text(row.session_id);
  return {
    sessionId,
    slug,
    machineId,
    minutes,
    settingsUsed: used,
    effort: num(row.effort),
    distanceKm: num(row.distance_km),
    calories: num(row.calories),
    createdAt,
    date: sessionDateFromRow(row) || createdAt.slice(0, 10),
  };
}

export async function fetchCardioLogs(): Promise<CardioLog[]> {
  const withDate = await supabase
    .from('cardio_logs')
    .select(
      'session_id, cardio_session_slug, machine_id, minutes, settings_used, effort, distance_km, calories, created_at, sessions(date)'
    )
    .order('created_at', { ascending: true });
  if (withDate.error) {
    if (isMissingCardioTable(withDate.error)) return [];
    const fallback = await supabase
      .from('cardio_logs')
      .select(
        'session_id, cardio_session_slug, machine_id, minutes, settings_used, effort, distance_km, calories, created_at'
      )
      .order('created_at', { ascending: true });
    if (fallback.error) {
      if (isMissingCardioTable(fallback.error)) return [];
      throw fallback.error;
    }
    return (fallback.data ?? []).map((row) => toLog(asRecord(row))).filter((item): item is CardioLog => item != null);
  }
  return (withDate.data ?? []).map((row) => toLog(asRecord(row))).filter((item): item is CardioLog => item != null);
}

export function cardioMachinesFromLogs(logs: CardioLog[]): Set<string> {
  const keys = new Set<string>();
  for (const log of logs) {
    const extra = text(log.settingsUsed.machines)
      .split(',')
      .map((item) => parseLoggedMachine(item.trim()))
      .filter((item): item is LoggedCardioMachineId => item != null);
    for (const key of badgeMachineKeys(log.machineId, extra)) keys.add(key);
  }
  return keys;
}

export function cardioWeekMinutes(logs: CardioLog[], weekStartIso: string): number {
  return logs
    .filter((log) => (log.date || log.createdAt.slice(0, 10) || '') >= weekStartIso)
    .reduce((sum, log) => sum + log.minutes, 0);
}

export async function logManualCardioSession(input: {
  machineId: LoggedCardioMachineId;
  minutes: number;
  effort: number;
  date: string;
  distanceKm: number | null;
}): Promise<Session> {
  const minutes = Math.max(1, Math.min(180, Math.round(input.minutes * 10) / 10));
  const effort = Math.min(10, Math.max(1, Math.round(input.effort)));
  const slug = `logged-${input.machineId}`;
  const session = await insertLoggedCardioSession({ date: input.date, minutes, slug });
  const { error } = await supabase.from('cardio_logs').insert({
    session_id: session.id,
    cardio_session_slug: slug,
    machine_id: input.machineId,
    minutes,
    settings_used: {},
    effort,
    distance_km: input.distanceKm,
    calories: null,
  });
  if (error) {
    await discardSession(session.id).catch(() => {});
    if (/machine_id|cardio_logs_machine_check/i.test(error.message) && input.machineId === 'other') {
      throw new Error('Other cardio needs supabase/cardio_w8_other.sql run in the Supabase SQL editor.');
    }
    if (isMissingCardioTable(error)) {
      throw new Error(cardioCopy.missing_sql);
    }
    throw error;
  }
  return session;
}

export function longestCardioMinutes(logs: CardioLog[]): number {
  return logs.reduce((max, log) => Math.max(max, log.minutes), 0);
}

function mondayOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
}

function addDaysLocal(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function logMondayIso(log: CardioLog): string {
  const iso = log.date || log.createdAt.slice(0, 10);
  return isoDay(mondayOf(parseDate(iso)));
}

function countsForWeek(log: CardioLog): boolean {
  return log.minutes >= CARDIO_COUNTS_MINUTES;
}

/** Minutes of 10+ minute cardio sessions in each of the last 8 weeks, oldest first. */
export function cardioMinutesLastEightWeeks(logs: CardioLog[], today = new Date()): WeekCount[] {
  const totals = new Map<string, number>();
  for (const log of logs) {
    if (!countsForWeek(log)) continue;
    const monday = logMondayIso(log);
    totals.set(monday, (totals.get(monday) ?? 0) + log.minutes);
  }
  const thisMonday = mondayOf(today);
  const weeks: WeekCount[] = [];
  for (let i = CARDIO_CHART_WEEKS - 1; i >= 0; i -= 1) {
    const week = addDaysLocal(thisMonday, -i * 7);
    weeks.push({ weekStart: week, count: Math.round(totals.get(isoDay(week)) ?? 0) });
  }
  return weeks;
}

/** How many of the last 8 weeks have a 10+ minute cardio session. */
export function cardioWeeksLogged(logs: CardioLog[], today = new Date()): number {
  return cardioMinutesLastEightWeeks(logs, today).filter((week) => week.count > 0).length;
}

export type CardioSessionCompare = {
  name: string;
  firstLabel: string;
  latestLabel: string;
};

function isEasyOrRecover(label: string): boolean {
  return /easy|recover/.test(label.toLowerCase());
}

function isWarmOrCool(label: string): boolean {
  return /warm ?up|cool ?down/.test(label.toLowerCase());
}

function isWorkInterval(item: CardioInterval): boolean {
  if (isWarmOrCool(item.label) || isEasyOrRecover(item.label)) return false;
  if (item.effort >= 7) return true;
  return /sprint|strong|faster|hard|work/.test(item.label.toLowerCase());
}

function workRestCycleSeconds(def: CardioSessionDef): number {
  const work = def.intervals.find(isWorkInterval);
  const rest = def.intervals.find((item) => isEasyOrRecover(item.label));
  if (!work) return 0;
  return work.seconds + (rest?.seconds ?? 0);
}

function roundsCompleted(def: CardioSessionDef, minutes: number): number | null {
  if (def.style !== 'intervals' && def.style !== 'finisher') return null;
  if (!def.intervals.some(isWorkInterval)) return null;
  const seconds = Math.max(0, minutes) * 60;
  let elapsed = 0;
  let rounds = 0;
  for (const item of def.intervals) {
    if (elapsed >= seconds) break;
    if (isWorkInterval(item)) rounds += 1;
    elapsed += item.seconds;
  }
  const prescribed = def.intervals.reduce((sum, item) => sum + item.seconds, 0);
  if (seconds > prescribed + 15) {
    const cycle = workRestCycleSeconds(def);
    if (cycle > 0) rounds += Math.round((seconds - prescribed) / cycle);
  }
  return Math.max(0, rounds);
}

function shortCardioName(slug: string, machineId: LoggedCardioMachineId): string {
  const def = cardioSession(slug);
  if (def) {
    const cut = def.name.indexOf(':');
    return (cut > 0 ? def.name.slice(0, cut) : def.name).trim();
  }
  return machineLabel(machineId);
}

function formatMinutesLabel(minutes: number): string {
  const rounded = Math.round(minutes * 10) / 10;
  return `${rounded} min`;
}

function formatKmLabel(km: number): string {
  const rounded = Math.round(km * 100) / 100;
  return `${rounded} km`;
}

function formatRoundsLabel(rounds: number): string {
  return rounds === 1 ? '1 round' : `${rounds} rounds`;
}

function compareLabels(first: CardioLog, latest: CardioLog): { firstLabel: string; latestLabel: string } {
  const def = cardioSession(first.slug);
  if (def) {
    const firstRounds = roundsCompleted(def, first.minutes);
    const latestRounds = roundsCompleted(def, latest.minutes);
    if (firstRounds != null && latestRounds != null) {
      return {
        firstLabel: formatRoundsLabel(firstRounds),
        latestLabel: formatRoundsLabel(latestRounds),
      };
    }
  }
  if (
    first.distanceKm != null &&
    latest.distanceKm != null &&
    first.distanceKm > 0 &&
    latest.distanceKm > 0
  ) {
    return {
      firstLabel: formatKmLabel(first.distanceKm),
      latestLabel: formatKmLabel(latest.distanceKm),
    };
  }
  return {
    firstLabel: formatMinutesLabel(first.minutes),
    latestLabel: formatMinutesLabel(latest.minutes),
  };
}

function latestKey(log: CardioLog): string {
  return `${log.date} ${log.createdAt}`;
}

/** The cardio session she has repeated most, first vs latest. Null if nothing is repeated. */
export function mostRepeatedCardioCompare(logs: CardioLog[]): CardioSessionCompare | null {
  const groups = new Map<string, CardioLog[]>();
  for (const log of logs) {
    const list = groups.get(log.slug) ?? [];
    list.push(log);
    groups.set(log.slug, list);
  }
  let winner: CardioLog[] | null = null;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    if (
      !winner ||
      group.length > winner.length ||
      (group.length === winner.length && latestKey(group[group.length - 1]) > latestKey(winner[winner.length - 1]))
    ) {
      winner = group;
    }
  }
  if (!winner) return null;
  const first = winner[0];
  const latest = winner[winner.length - 1];
  return {
    name: shortCardioName(first.slug, first.machineId),
    ...compareLabels(first, latest),
  };
}
