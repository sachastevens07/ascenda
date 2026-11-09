import catalogueFile from '../../content/cardio/cardio-sessions.json';

import { cardioCopy, fillCopy } from '@/lib/copy';
import type { GymExperience } from '@/lib/profile';
import { CARDIO_SLUG_KEY, isCardioSession, parseCardioStyle, type CardioStyle } from '@/lib/sessionTypes';
import { describeRoutineError } from '@/lib/routines';
import {
  fetchActiveSession,
  finishSession,
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

export const BEGINNER_CARDIO_DAYS = 28;

export type CardioSettings = {
  speed_kmh?: [number, number] | number;
  incline_percent?: [number, number] | number;
  cadence_rpm?: [number, number] | number;
  resistance?: string;
  level?: [number, number] | number;
  note?: string;
  machine_id?: string;
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
  machineId: CardioMachineId;
  minutes: number;
  settingsUsed: Record<string, number | string>;
  effort: number | null;
  distanceKm: number | null;
  calories: number | null;
  createdAt: string;
};

export type CardioFinishInput = {
  minutes: number;
  effort: number | null;
  settingsUsed: Record<string, number | string>;
  distanceKm: number | null;
  calories: number | null;
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

function parseSettings(raw: unknown): CardioSettings {
  const row = asRecord(raw);
  return {
    speed_kmh: pair(row.speed_kmh),
    incline_percent: pair(row.incline_percent),
    cadence_rpm: pair(row.cadence_rpm),
    resistance: text(row.resistance) || undefined,
    level: pair(row.level),
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

export function cardioSlugFromSession(session: Session): string | null {
  const fromSwaps = session.exercise_swaps[CARDIO_SLUG_KEY]?.trim();
  return fromSwaps || null;
}

export function machineLabel(id: CardioMachineId): string {
  if (id === 'treadmill') return cardioCopy.machine_treadmill;
  if (id === 'bike') return cardioCopy.machine_bike;
  if (id === 'cross_trainer') return cardioCopy.machine_cross_trainer;
  if (id === 'rower') return cardioCopy.machine_rower;
  if (id === 'stair_climber') return cardioCopy.machine_stair_climber;
  return cardioCopy.machine_mixed;
}

export function styleLabel(style: CardioStyle): string {
  if (style === 'intervals') return cardioCopy.style_intervals;
  if (style === 'finisher') return cardioCopy.style_finisher;
  return cardioCopy.style_steady;
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
    formatRange(settings.level, '') ? `level ${formatRange(settings.level, '')}` : null,
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

/** Keys used by Gym unlocked cardio badges (H6). */
export function badgeMachineKeys(machineId: CardioMachineId, extra: CardioMachineId[] = []): string[] {
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
  if (/cardio_w2\.sql|cardio_logs|source.*cardio/i.test(detail)) return cardioCopy.missing_sql;
  return describeRoutineError(error) || detail || 'Check your connection and try again.';
}

function isMissingCardioTable(error: { message?: string; code?: string } | null): boolean {
  return /cardio_logs|schema cache/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

export async function beginCardioSession(slug: string): Promise<Session> {
  const def = cardioSession(slug);
  if (!def) throw new Error(cardioCopy.not_found);
  const active = await fetchActiveSession();
  if (active) {
    const error = new Error('You already have a session going');
    (error as Error & { code?: string }).code = 'SESSION_IN_PROGRESS';
    (error as Error & { activeId?: string }).activeId = active.id;
    (error as Error & { activeSource?: string }).activeSource = isCardioSession(active)
      ? 'cardio'
      : active.source;
    throw error;
  }
  return startCardioSession(slug);
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

function toLog(row: Json): CardioLog | null {
  const sessionId = text(row.session_id);
  const slug = text(row.cardio_session_slug);
  const machineId = parseMachine(row.machine_id);
  const minutes = num(row.minutes);
  if (!sessionId || !slug || !machineId || minutes == null) return null;
  const settings = asRecord(row.settings_used);
  const used: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'number' || typeof value === 'string') used[key] = value;
  }
  return {
    sessionId,
    slug,
    machineId,
    minutes,
    settingsUsed: used,
    effort: num(row.effort),
    distanceKm: num(row.distance_km),
    calories: num(row.calories),
    createdAt: text(row.created_at) || text(row.session_id),
  };
}

export async function fetchCardioLogs(): Promise<CardioLog[]> {
  const { data, error } = await supabase
    .from('cardio_logs')
    .select('session_id, cardio_session_slug, machine_id, minutes, settings_used, effort, distance_km, calories, created_at')
    .order('created_at', { ascending: true });
  if (error) {
    if (isMissingCardioTable(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => toLog(asRecord(row))).filter((item): item is CardioLog => item != null);
}

export function cardioMachinesFromLogs(logs: CardioLog[]): Set<string> {
  const keys = new Set<string>();
  for (const log of logs) {
    const extra = text(log.settingsUsed.machines)
      .split(',')
      .map((item) => parseMachine(item.trim()))
      .filter((item): item is CardioMachineId => item != null);
    for (const key of badgeMachineKeys(log.machineId, extra)) keys.add(key);
  }
  return keys;
}

export function cardioWeekMinutes(logs: CardioLog[], weekStartIso: string): number {
  return logs
    .filter((log) => (log.createdAt.slice(0, 10) || '') >= weekStartIso)
    .reduce((sum, log) => sum + log.minutes, 0);
}

export function longestCardioMinutes(logs: CardioLog[]): number {
  return logs.reduce((max, log) => Math.max(max, log.minutes), 0);
}
