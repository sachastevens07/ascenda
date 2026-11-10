import { cardioSession } from '@/lib/cardio';
import {
  fetchWeekPlanPrefs,
  isOverlayPlanId,
  overlayForRoutine,
  overlayPlanId,
  slotsForWeek,
  stretchMeta,
  type PlacedSlot,
  type WeekPlanPrefs,
} from '@/lib/completeWeek';
import { fetchCustomWorkouts } from '@/lib/customWorkouts';
import { WEEKDAYS as WEEKDAY_KEYS, type Weekday } from '@/lib/onboardingAnswers';
import {
  currentEnrolmentWeek,
  daysInWeek,
  fetchActiveEnrolment,
  fetchRoutine,
  type Routine,
  type RoutineDay,
  type RoutineEnrolment,
} from '@/lib/routines';
import type { SessionType } from '@/lib/sessionTypes';
import { supabase } from '@/lib/supabase';

export type PlannedSessionStatus = 'planned' | 'done' | 'skipped' | 'rest';

export type PlannedSession = {
  id: string;
  date: string;
  routine_day_id: string | null;
  custom_workout_id: string | null;
  status: PlannedSessionStatus;
  /** HH:MM. Null means use her default reminder time. */
  reminder_time: string | null;
  session_kind: SessionType | null;
  cardio_slug: string | null;
  stretch_slug: string | null;
  is_optional: boolean;
};

export type PlannerDayOption = {
  iso: string;
  label: string;
  isToday: boolean;
};

export type PlannerDayKind = 'empty' | 'rest' | 'routine' | 'custom' | 'cardio' | 'recovery';

export type PlannerDayView = {
  iso: string;
  weekday: string;
  dayNumber: number;
  month: string;
  isToday: boolean;
  isPast: boolean;
  plan: PlannedSession | null;
  title: string | null;
  subtitle: string | null;
  exercises: string[];
  completed: boolean;
  kind: PlannerDayKind;
  /** Estimate for reminder copy. Null on empty days. */
  sessionMinutes: number | null;
  isStretch: boolean;
  isOptional: boolean;
};

export function isPlannedSessionKind(kind: PlannerDayKind): boolean {
  return kind === 'routine' || kind === 'custom' || kind === 'cardio' || kind === 'recovery';
}

export type PlannerWeek = {
  weekStart: string;
  weekEnd: string;
  days: PlannerDayView[];
  plannedCount: number;
  completedCount: number;
  enrolment: RoutineEnrolment | null;
};

export type WeekPlanProgress = {
  completed: number;
  planned: number;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const WEEKDAYS_CALENDAR = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = [
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

/** Current month plus the next two: the agenda and month grid share this window. */
export const PLANNER_MONTHS = 3;

/** Mon = 0. Common gym patterns for each days-per-week count. */
const DEFAULT_TRAINING_DAYS: Record<number, number[]> = {
  1: [2],
  2: [1, 4],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

const PLAN_COLUMNS = 'id, date, routine_day_id, custom_workout_id, status';
const PLAN_COLUMNS_REMINDERS = `${PLAN_COLUMNS}, reminder_time`;
const PLAN_COLUMNS_W5 = `${PLAN_COLUMNS_REMINDERS}, session_kind, cardio_slug, stretch_slug, is_optional`;

let planSelect = PLAN_COLUMNS_W5;
let supportColumnsReady: boolean | null = null;

function isMissingPlanner(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return error.code === '42P01' || error.code === 'PGRST205' || /planned_sessions/.test(detail);
}

function isMissingReminderTimeColumn(error: { message?: string; code?: string }): boolean {
  return /reminder_time/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingSupportColumn(error: { message?: string; code?: string }): boolean {
  return /session_kind|cardio_slug|stretch_slug|is_optional|planned_sessions_source_check/i.test(
    `${error.code ?? ''} ${error.message ?? ''}`
  );
}

function parseSessionKind(value: unknown): SessionType | null {
  return value === 'strength' || value === 'cardio' || value === 'recovery' ? value : null;
}

function parsePlanTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asPlanRow(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toPlannedSession(row: Record<string, unknown>): PlannedSession {
  const cardio = asString(row.cardio_slug);
  const stretch = asString(row.stretch_slug);
  const routineDayId = asString(row.routine_day_id);
  const kind =
    parseSessionKind(row.session_kind) ??
    (cardio ? 'cardio' : stretch ? 'recovery' : routineDayId ? 'strength' : null);
  const status =
    row.status === 'done' || row.status === 'skipped' || row.status === 'rest' ? row.status : 'planned';
  return {
    id: asString(row.id) ?? '',
    date: asString(row.date) ?? '',
    routine_day_id: routineDayId,
    custom_workout_id: asString(row.custom_workout_id),
    status,
    reminder_time: parsePlanTime(row.reminder_time),
    session_kind: kind,
    cardio_slug: cardio,
    stretch_slug: stretch,
    is_optional: row.is_optional === true,
  };
}

function isUniqueConflict(error: { message?: string; code?: string }): boolean {
  return error.code === '23505' || /duplicate|unique/i.test(error.message ?? '');
}

export function missingPlannerMessage(): string {
  return 'Adding to the planner needs supabase/planned_sessions.sql run in the Supabase SQL editor.';
}

export function missingCompleteWeekMessage(): string {
  return 'Cardio and recovery on the planner need supabase/complete_week_w5.sql run in the Supabase SQL editor.';
}

export function describePlannerError(error: unknown): string {
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  if (/session_kind|cardio_slug|stretch_slug|planned_sessions_source_check/i.test(detail)) {
    return missingCompleteWeekMessage();
  }
  if (/42P01|PGRST205|planned_sessions/i.test(detail)) {
    return missingPlannerMessage();
  }
  return detail || 'Check your connection and try again.';
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfWeekMonday(date: Date): Date {
  const day = startOfDay(date);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** First day of this month through the last day of the month two months from now. */
export function plannerHorizon(now = new Date()): { from: Date; to: Date } {
  const from = startOfMonth(now);
  const to = endOfMonth(new Date(now.getFullYear(), now.getMonth() + (PLANNER_MONTHS - 1), 1));
  return { from, to };
}

export function monthsInHorizon(from: Date, to: Date): { year: number; month: number; label: string }[] {
  const months: { year: number; month: number; label: string }[] = [];
  let cursor = startOfMonth(from);
  const last = startOfMonth(to);
  while (cursor.getTime() <= last.getTime()) {
    months.push({
      year: cursor.getFullYear(),
      month: cursor.getMonth(),
      label: `${MONTHS_FULL[cursor.getMonth()]} ${cursor.getFullYear()}`,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}

export const CALENDAR_WEEKDAYS = WEEKDAYS_CALENDAR;

function ordinal(value: number): string {
  const teens = value % 100;
  if (teens >= 11 && teens <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export function formatAgendaHeading(day: PlannerDayView): string {
  const date = parseIsoDate(day.iso);
  const label = `${WEEKDAYS_FULL[date.getDay()]}, ${ordinal(day.dayNumber)} ${MONTHS_FULL[date.getMonth()]}`;
  return day.isToday ? `Today · ${label}` : label;
}

/** Compact sticky header: “Wed 4 Nov”. Eyebrow style uppercases it. */
export function formatStickyDayHeading(day: PlannerDayView): string {
  const date = parseIsoDate(day.iso);
  return `${WEEKDAYS[date.getDay()]} ${day.dayNumber} ${MONTHS[date.getMonth()]}`;
}

export function formatWeekRange(weekStart: Date): string {
  const sunday = addDays(weekStart, 6);
  const sameMonth =
    weekStart.getMonth() === sunday.getMonth() && weekStart.getFullYear() === sunday.getFullYear();
  if (sameMonth) {
    return `${weekStart.getDate()}–${sunday.getDate()} ${MONTHS[weekStart.getMonth()]}`;
  }
  if (weekStart.getFullYear() === sunday.getFullYear()) {
    return `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]}–${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
  }
  return `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}–${sunday.getDate()} ${MONTHS[sunday.getMonth()]} ${sunday.getFullYear()}`;
}

function defaultTrainingOffsets(daysPerWeek: number): number[] {
  const clamped = Math.min(7, Math.max(1, Math.round(daysPerWeek)));
  return DEFAULT_TRAINING_DAYS[clamped] ?? DEFAULT_TRAINING_DAYS[3];
}

function throwPlanner(error: { message?: string; code?: string }): never {
  if (isMissingPlanner(error)) throw new Error(missingPlannerMessage());
  throw new Error(error.message || 'Check your connection and try again.');
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  return user.id;
}

async function clearLivePlan(userId: string, date: string): Promise<void> {
  const { error } = await supabase
    .from('planned_sessions')
    .delete()
    .eq('user_id', userId)
    .eq('date', date)
    .in('status', ['planned', 'rest']);
  if (error) throwPlanner(error);
}

type PlanInsert = {
  user_id: string;
  date: string;
  routine_day_id: string | null;
  custom_workout_id: string | null;
  status: PlannedSessionStatus;
  session_kind?: SessionType | null;
  cardio_slug?: string | null;
  stretch_slug?: string | null;
  is_optional?: boolean;
};

function withoutSupportColumns(row: PlanInsert): PlanInsert {
  const { session_kind: _kind, cardio_slug: _cardio, stretch_slug: _stretch, is_optional: _optional, ...rest } =
    row;
  return rest;
}

async function insertPlan(row: PlanInsert): Promise<PlannedSession> {
  const payload = supportColumnsReady === false ? withoutSupportColumns(row) : row;
  const { data, error } = await supabase.from('planned_sessions').insert(payload).select(planSelect).single();
  if (error) {
    if (supportColumnsReady !== false && isMissingSupportColumn(error)) {
      supportColumnsReady = false;
      if (planSelect === PLAN_COLUMNS_W5) planSelect = PLAN_COLUMNS_REMINDERS;
      return insertPlan(row);
    }
    throwPlanner(error);
  }
  supportColumnsReady = supportColumnsReady ?? true;
  return toPlannedSession(asPlanRow(data));
}

/** Next 14 days, starting today, so My workouts can pin a date without opening the week view. */
export function upcomingPlannerDays(now = new Date()): PlannerDayOption[] {
  const today = startOfDay(now);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return {
      iso: toIso(date),
      label: `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`,
      isToday: index === 0,
    };
  });
}

/** Put this custom workout on a date. Replaces any live plan already on that day. */
export async function addCustomWorkoutToPlanner(
  customWorkoutId: string,
  date: string
): Promise<PlannedSession> {
  const userId = await requireUserId();
  await clearLivePlan(userId, date);
  return insertPlan({
    user_id: userId,
    date,
    custom_workout_id: customWorkoutId,
    routine_day_id: null,
    status: 'planned',
  });
}

export async function addRoutineDayToPlanner(
  routineDayId: string,
  date: string
): Promise<PlannedSession> {
  const userId = await requireUserId();
  await clearLivePlan(userId, date);
  return insertPlan({
    user_id: userId,
    date,
    custom_workout_id: null,
    routine_day_id: routineDayId,
    status: 'planned',
  });
}

export async function setRestDay(date: string): Promise<PlannedSession> {
  const userId = await requireUserId();
  await clearLivePlan(userId, date);
  return insertPlan({
    user_id: userId,
    date,
    custom_workout_id: null,
    routine_day_id: null,
    status: 'rest',
  });
}

export async function clearPlannerDay(date: string): Promise<void> {
  const userId = await requireUserId();
  await clearLivePlan(userId, date);
}

export async function skipPlannedSession(plan: PlannedSession): Promise<void> {
  const persisted = isOverlayPlanId(plan.id) ? await persistOverlayPlan(plan) : plan;
  const { error } = await supabase.from('planned_sessions').update({ status: 'skipped' }).eq('id', persisted.id);
  if (error) throwPlanner(error);
}

export async function persistOverlayPlan(plan: PlannedSession): Promise<PlannedSession> {
  if (!isOverlayPlanId(plan.id)) return plan;
  const userId = await requireUserId();
  await clearLivePlan(userId, plan.date);
  return insertPlan({
    user_id: userId,
    date: plan.date,
    routine_day_id: plan.routine_day_id,
    custom_workout_id: plan.custom_workout_id,
    status: plan.status === 'rest' ? 'rest' : 'planned',
    session_kind: plan.session_kind,
    cardio_slug: plan.cardio_slug,
    stretch_slug: plan.stretch_slug,
    is_optional: plan.is_optional,
  });
}

export async function movePlannedSession(
  id: string,
  toDate: string,
  overlayPlan?: PlannedSession | null
): Promise<void> {
  const persisted =
    isOverlayPlanId(id) && overlayPlan ? await persistOverlayPlan(overlayPlan) : null;
  const fromId = persisted?.id ?? id;
  const userId = await requireUserId();
  const { data: source, error: sourceError } = await supabase
    .from('planned_sessions')
    .select(planSelect)
    .eq('id', fromId)
    .maybeSingle();
  if (sourceError) throwPlanner(sourceError);
  if (!source) throw new Error('That session is no longer on your planner.');

  const from = toPlannedSession(asPlanRow(source));
  if (from.date === toDate) return;

  const { data: destRows, error: destError } = await supabase
    .from('planned_sessions')
    .select(planSelect)
    .eq('user_id', userId)
    .eq('date', toDate)
    .in('status', ['planned', 'rest']);
  if (destError) throwPlanner(destError);

  const dest = destRows?.[0] ? toPlannedSession(asPlanRow(destRows[0])) : null;
  if (!dest) {
    const { error } = await supabase.from('planned_sessions').update({ date: toDate }).eq('id', from.id);
    if (error) throwPlanner(error);
    return;
  }

  const { error: parkError } = await supabase
    .from('planned_sessions')
    .update({ status: 'skipped' })
    .eq('id', dest.id);
  if (parkError) throwPlanner(parkError);

  const { error: moveError } = await supabase
    .from('planned_sessions')
    .update({ date: toDate })
    .eq('id', from.id);
  if (moveError) throwPlanner(moveError);

  const { error: restoreError } = await supabase
    .from('planned_sessions')
    .update({ date: from.date, status: dest.status })
    .eq('id', dest.id);
  if (restoreError) throwPlanner(restoreError);
}

/** Marks today’s planned workout done after she finishes a session. Rest days stay put. */
export async function markPlannerDateDone(date: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('planned_sessions')
    .update({ status: 'done' })
    .eq('user_id', userId)
    .eq('date', date)
    .eq('status', 'planned');
  if (error) {
    if (isMissingPlanner(error)) return;
    throw new Error(error.message);
  }
}

/** Saves a reminder clock for one planned day. No-op if the column is not in the database yet. */
export async function updatePlannerReminderTime(id: string, time: string): Promise<void> {
  const { error } = await supabase.from('planned_sessions').update({ reminder_time: time }).eq('id', id);
  if (error) {
    if (isMissingPlanner(error) || isMissingReminderTimeColumn(error)) {
      planSelect = PLAN_COLUMNS;
      return;
    }
    throwPlanner(error);
  }
}

async function fetchPlansInRange(userId: string, from: string, to: string): Promise<PlannedSession[]> {
  const { data, error } = await supabase
    .from('planned_sessions')
    .select(planSelect)
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to)
    .order('date');
  if (error) {
    if (planSelect === PLAN_COLUMNS_W5 && isMissingSupportColumn(error)) {
      planSelect = PLAN_COLUMNS_REMINDERS;
      supportColumnsReady = false;
      return fetchPlansInRange(userId, from, to);
    }
    if (planSelect !== PLAN_COLUMNS && isMissingReminderTimeColumn(error)) {
      planSelect = PLAN_COLUMNS;
      return fetchPlansInRange(userId, from, to);
    }
    throwPlanner(error);
  }
  return (data ?? []).map((row) => toPlannedSession(asPlanRow(row)));
}

async function fetchFinishedDatesInRange(from: string, to: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('sessions')
    .select('date')
    .not('completed_at', 'is', null)
    .gte('date', from)
    .lte('date', to);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.date as string));
}

function livePlanForDate(rows: PlannedSession[], date: string): PlannedSession | null {
  return rows.find((row) => row.date === date && (row.status === 'planned' || row.status === 'rest')) ?? null;
}

function donePlanForDate(rows: PlannedSession[], date: string): PlannedSession | null {
  return rows.find((row) => row.date === date && row.status === 'done') ?? null;
}

function daysForPlannerWeek(routine: Routine, weekNumber: number) {
  const exact = daysInWeek(routine, weekNumber);
  if (exact.length > 0) return exact;
  const prior = [...routine.weeks]
    .filter((week) => week.week_number < weekNumber && week.days.length > 0)
    .sort((a, b) => b.week_number - a.week_number)[0];
  return prior?.days ?? routine.weeks.find((week) => week.days.length > 0)?.days ?? [];
}

function occupiedDates(rows: PlannedSession[]): Set<string> {
  return new Set(
    rows
      .filter(
        (row) =>
          row.status === 'planned' ||
          row.status === 'rest' ||
          row.status === 'done' ||
          row.status === 'skipped'
      )
      .map((row) => row.date)
  );
}

function placedRoutineDayIds(rows: PlannedSession[]): Set<string> {
  return new Set(rows.map((row) => row.routine_day_id).filter((id): id is string => Boolean(id)));
}

function weekSlots(
  enrolment: RoutineEnrolment,
  monday: Date,
  prefs: WeekPlanPrefs
): PlacedSlot[] {
  const overlay = overlayForRoutine(enrolment.routine.slug, enrolment.routine.id);
  if (!overlay) return [];
  return slotsForWeek({
    overlay,
    weekNumber: currentEnrolmentWeek(enrolment, monday),
    preferredDays: prefs.preferredDays,
    cardioPreference: prefs.cardioPreference,
  });
}

async function syncSupportOptional(
  existing: PlannedSession[],
  slots: PlacedSlot[],
  monday: Date
): Promise<PlannedSession[]> {
  if (slots.length === 0) return existing;
  const optionalDates = new Set(
    slots
      .filter((slot) => (slot.type === 'cardio' || slot.type === 'recovery') && slot.optional)
      .map((slot) => toIso(addDays(monday, WEEKDAY_KEYS.indexOf(slot.weekday))))
  );
  const weekStart = toIso(monday);
  const weekEnd = toIso(addDays(monday, 6));
  const updates = existing.filter(
    (row) =>
      row.date >= weekStart &&
      row.date <= weekEnd &&
      optionalDates.has(row.date) &&
      !row.is_optional &&
      !isOverlayPlanId(row.id) &&
      (row.session_kind === 'cardio' ||
        row.session_kind === 'recovery' ||
        Boolean(row.cardio_slug) ||
        Boolean(row.stretch_slug))
  );
  if (updates.length === 0) return existing;
  const { error } = await supabase
    .from('planned_sessions')
    .update({ is_optional: true })
    .in(
      'id',
      updates.map((row) => row.id)
    );
  if (error && !isMissingSupportColumn(error)) throwPlanner(error);
  const mark = new Set(updates.map((row) => row.id));
  return existing.map((row) => (mark.has(row.id) ? { ...row, is_optional: true } : row));
}

type WeekInsert = PlanInsert;

function mondaysInRange(from: Date, to: Date): Date[] {
  const mondays: Date[] = [];
  let monday = startOfWeekMonday(from);
  const last = startOfWeekMonday(to);
  while (monday.getTime() <= last.getTime()) {
    mondays.push(monday);
    monday = addDays(monday, 7);
  }
  return mondays;
}

function rowsForWeek(rows: PlannedSession[], monday: Date): PlannedSession[] {
  const weekStart = toIso(monday);
  const weekEnd = toIso(addDays(monday, 6));
  return rows.filter((row) => row.date >= weekStart && row.date <= weekEnd);
}

function weekdayFromDate(date: Date): Weekday {
  return WEEKDAY_KEYS[(date.getDay() + 6) % 7];
}

function dayByKey(days: RoutineDay[], key: string | null): RoutineDay | undefined {
  if (!key) return undefined;
  const exact = days.find((day) => (day.day_key ?? '').trim() === key);
  if (exact) return exact;
  const needle = ` ${key.toLowerCase()}`;
  const byName = days.find((day) => {
    const name = ` ${day.name.toLowerCase()} `;
    return name.includes(`${needle} `) || day.name.toLowerCase().endsWith(needle.trim());
  });
  if (byName) return byName;
  const index = key.toUpperCase().charCodeAt(0) - 65;
  return index >= 0 && index < days.length ? days[index] : undefined;
}

function strengthInsert(
  userId: string,
  iso: string,
  day: RoutineDay
): WeekInsert {
  return {
    user_id: userId,
    date: iso,
    routine_day_id: day.id,
    custom_workout_id: null,
    status: 'planned',
    session_kind: 'strength',
  };
}

function supportInsert(userId: string, iso: string, slot: PlacedSlot): WeekInsert | null {
  if (slot.type === 'cardio' && slot.cardio_slug) {
    return {
      user_id: userId,
      date: iso,
      routine_day_id: null,
      custom_workout_id: null,
      status: 'planned',
      session_kind: 'cardio',
      cardio_slug: slot.cardio_slug,
      stretch_slug: null,
      is_optional: slot.optional,
    };
  }
  if (slot.type === 'recovery' && slot.stretch_slug) {
    return {
      user_id: userId,
      date: iso,
      routine_day_id: null,
      custom_workout_id: null,
      status: 'planned',
      session_kind: 'recovery',
      cardio_slug: null,
      stretch_slug: slot.stretch_slug,
      is_optional: slot.optional,
    };
  }
  return null;
}

function buildWeekInserts(
  userId: string,
  monday: Date,
  enrolment: RoutineEnrolment,
  routine: Routine,
  existing: PlannedSession[],
  prefs: WeekPlanPrefs
): WeekInsert[] {
  const weekStart = toIso(monday);
  const weekEnd = toIso(addDays(monday, 6));
  const endDate = toIso(addDays(parseIsoDate(enrolment.start_date), enrolment.routine.length_weeks * 7 - 1));
  if (weekEnd < enrolment.start_date || weekStart > endDate) return [];

  const weekRows = rowsForWeek(existing, monday);
  const taken = occupiedDates(weekRows);
  const alreadyPlaced = placedRoutineDayIds(weekRows);
  const weekNumber = currentEnrolmentWeek(enrolment, monday);
  const routineDays = daysForPlannerWeek(routine, weekNumber);
  const overlay = overlayForRoutine(enrolment.routine.slug, enrolment.routine.id);
  const slots = overlay
    ? slotsForWeek({
        overlay,
        weekNumber,
        preferredDays: prefs.preferredDays,
        cardioPreference: prefs.cardioPreference,
      })
    : [];
  const inserts: WeekInsert[] = [];

  function takeEmptyIso(preferredIso: string | null): string | null {
    if (preferredIso && preferredIso <= endDate && !taken.has(preferredIso)) return preferredIso;
    for (let offset = 0; offset < 7; offset += 1) {
      const iso = toIso(addDays(monday, offset));
      if (iso <= endDate && !taken.has(iso)) return iso;
    }
    return null;
  }

  if (slots.length > 0) {
    for (const slot of slots) {
      if (slot.type !== 'strength' || !slot.day_key) continue;
      const day = dayByKey(routineDays, slot.day_key);
      if (!day || alreadyPlaced.has(day.id)) continue;
      const preferredIso = toIso(addDays(monday, WEEKDAY_KEYS.indexOf(slot.weekday)));
      const iso = takeEmptyIso(preferredIso);
      if (!iso) continue;
      inserts.push(strengthInsert(userId, iso, day));
      taken.add(iso);
      alreadyPlaced.add(day.id);
    }
    for (const slot of slots) {
      if (slot.type !== 'cardio' && slot.type !== 'recovery') continue;
      const preferredIso = toIso(addDays(monday, WEEKDAY_KEYS.indexOf(slot.weekday)));
      if (preferredIso > endDate || taken.has(preferredIso)) continue;
      const row = supportInsert(userId, preferredIso, slot);
      if (!row) continue;
      inserts.push(row);
      taken.add(preferredIso);
    }
  }

  const leftoverDays = routineDays.filter((day) => !alreadyPlaced.has(day.id));
  if (leftoverDays.length === 0) return inserts;

  const offsets = defaultTrainingOffsets(enrolment.routine.days_per_week);
  let dayIndex = 0;
  for (const offset of offsets) {
    if (dayIndex >= leftoverDays.length) break;
    const iso = toIso(addDays(monday, offset));
    if (iso > endDate || taken.has(iso)) continue;
    inserts.push(strengthInsert(userId, iso, leftoverDays[dayIndex]));
    taken.add(iso);
    dayIndex += 1;
  }

  if (dayIndex < leftoverDays.length) {
    for (let offset = 0; offset < 7 && dayIndex < leftoverDays.length; offset += 1) {
      const iso = toIso(addDays(monday, offset));
      if (iso > endDate || taken.has(iso)) continue;
      inserts.push(strengthInsert(userId, iso, leftoverDays[dayIndex]));
      taken.add(iso);
      dayIndex += 1;
    }
  }

  return inserts;
}

async function insertWeekPlans(inserts: WeekInsert[]): Promise<void> {
  if (inserts.length === 0) return;
  const payload = supportColumnsReady === false ? inserts.map(withoutSupportColumns) : inserts;
  const { error } = await supabase.from('planned_sessions').insert(payload);
  if (error && !isUniqueConflict(error)) {
    if (supportColumnsReady !== false && isMissingSupportColumn(error)) {
      supportColumnsReady = false;
      const strengthOnly = inserts.filter((row) => row.routine_day_id);
      if (strengthOnly.length === 0) return;
      await insertWeekPlans(strengthOnly);
      return;
    }
    throwPlanner(error);
  }
  if (!error) supportColumnsReady = supportColumnsReady ?? true;
}

async function ensureWeekFromRoutine(
  userId: string,
  monday: Date,
  enrolment: RoutineEnrolment,
  prefs: WeekPlanPrefs
): Promise<void> {
  const weekStart = toIso(monday);
  const weekEnd = toIso(addDays(monday, 6));
  const existing = await fetchPlansInRange(userId, weekStart, weekEnd);
  const routine = await fetchRoutine(enrolment.routine_id);
  if (!routine) return;
  const remaining = await syncSupportOptional(existing, weekSlots(enrolment, monday, prefs), monday);
  await insertWeekPlans(buildWeekInserts(userId, monday, enrolment, routine, remaining, prefs));
}

async function ensureRangeFromRoutine(
  userId: string,
  from: Date,
  to: Date,
  enrolment: RoutineEnrolment,
  routine: Routine,
  prefs: WeekPlanPrefs
): Promise<void> {
  let existing = await fetchPlansInRange(userId, toIso(from), toIso(to));
  const mondays = mondaysInRange(from, to);
  for (const monday of mondays) {
    existing = await syncSupportOptional(existing, weekSlots(enrolment, monday, prefs), monday);
  }
  const inserts = mondays.flatMap((monday) =>
    buildWeekInserts(userId, monday, enrolment, routine, existing, prefs)
  );
  await insertWeekPlans(inserts);
}

type DayLookups = {
  plans: PlannedSession[];
  finished: Set<string>;
  workouts: { id: string; name: string; exercises: { exercise: { name: string } }[] }[];
  routine: Routine | null;
  enrolment: RoutineEnrolment | null;
  todayIso: string;
};

function toDayView(date: Date, lookups: DayLookups): PlannerDayView {
  const iso = toIso(date);
  const live = livePlanForDate(lookups.plans, iso);
  const done = donePlanForDate(lookups.plans, iso);
  const plan = live ?? done;
  const finishedToday = lookups.finished.has(iso);
  const completed = Boolean(done) || (plan?.status !== 'rest' && finishedToday) || (!plan && finishedToday);
  const workoutNames = new Map(lookups.workouts.map((workout) => [workout.id, workout.name]));
  const routineDays = lookups.routine?.weeks.flatMap((week) => week.days) ?? [];
  const routineWeekByDay = new Map<string, number>();
  if (lookups.routine) {
    for (const week of lookups.routine.weeks) {
      for (const day of week.days) {
        routineWeekByDay.set(day.id, week.week_number);
      }
    }
  }

  let kind: PlannerDayKind = 'empty';
  let title: string | null = null;
  let subtitle: string | null = null;
  const exercises: string[] = [];
  let sessionMinutes: number | null = null;
  let isStretch = false;
  const isOptional = plan?.is_optional === true;
  const enrolmentWeek = lookups.enrolment ? currentEnrolmentWeek(lookups.enrolment, date) : null;
  const weekLabel = (routineDayId: string | null) => {
    const weekNumber = (routineDayId ? routineWeekByDay.get(routineDayId) : null) ?? enrolmentWeek;
    return lookups.enrolment && weekNumber
      ? `${lookups.enrolment.routine.name} · week ${weekNumber}`
      : (lookups.enrolment?.routine.name ?? null);
  };

  if (plan?.status === 'rest') {
    kind = 'rest';
    title = 'Rest';
    subtitle = 'A planned rest day';
  } else if (plan?.custom_workout_id) {
    kind = 'custom';
    const workout = lookups.workouts.find((item) => item.id === plan.custom_workout_id);
    title = workout?.name ?? workoutNames.get(plan.custom_workout_id) ?? 'Custom workout';
    subtitle = 'Your workout';
    exercises.push(...(workout?.exercises.map((item) => item.exercise.name) ?? []));
    sessionMinutes = exercises.length > 0 ? Math.max(20, exercises.length * 8) : null;
  } else if (plan?.routine_day_id) {
    kind = 'routine';
    const day = routineDays.find((item) => item.id === plan.routine_day_id);
    title = day?.name ?? 'Routine session';
    subtitle = weekLabel(plan.routine_day_id) ?? 'Routine';
    exercises.push(...(day?.exercises.map((item) => item.exercise.name) ?? []));
    sessionMinutes = lookups.enrolment?.routine.session_minutes ?? null;
    isStretch = lookups.routine?.type === 'stretch' || day?.sessionType === 'recovery';
    if (isStretch) kind = 'recovery';
  } else if (plan?.cardio_slug || plan?.session_kind === 'cardio') {
    kind = 'cardio';
    const def = cardioSession(plan.cardio_slug);
    title = def?.name ?? 'Cardio';
    subtitle = weekLabel(null) ?? 'Cardio';
    sessionMinutes = def?.durationMinutes ?? 20;
  } else if (plan?.stretch_slug || plan?.session_kind === 'recovery') {
    kind = 'recovery';
    const stretch = stretchMeta(plan.stretch_slug);
    title = stretch?.name ?? 'Recovery';
    subtitle = weekLabel(null) ?? 'Recovery';
    sessionMinutes = stretch?.minutes ?? 12;
    isStretch = true;
  }

  return {
    iso,
    weekday: WEEKDAYS_MON[(date.getDay() + 6) % 7],
    dayNumber: date.getDate(),
    month: MONTHS[date.getMonth()],
    isToday: iso === lookups.todayIso,
    isPast: iso < lookups.todayIso,
    plan,
    title,
    subtitle,
    exercises,
    completed,
    kind,
    sessionMinutes,
    isStretch,
    isOptional,
  };
}

function buildDays(from: Date, to: Date, lookups: DayLookups): PlannerDayView[] {
  const days: PlannerDayView[] = [];
  for (let date = startOfDay(from); date.getTime() <= startOfDay(to).getTime(); date = addDays(date, 1)) {
    days.push(toDayView(date, lookups));
  }
  return days;
}

function overlayDayFromSlot(
  day: PlannerDayView,
  slot: PlacedSlot,
  enrolment: RoutineEnrolment
): PlannerDayView {
  const date = parseIsoDate(day.iso);
  const weekNumber = currentEnrolmentWeek(enrolment, date);
  const subtitle = `${enrolment.routine.name} · week ${weekNumber}`;
  if (slot.type === 'cardio' && slot.cardio_slug) {
    const def = cardioSession(slot.cardio_slug);
    return {
      ...day,
      kind: 'cardio',
      title: def?.name ?? slot.name ?? 'Cardio',
      subtitle,
      sessionMinutes: def?.durationMinutes ?? slot.minutes ?? 20,
      isOptional: slot.optional,
      plan: {
        id: overlayPlanId(day.iso, 'cardio'),
        date: day.iso,
        routine_day_id: null,
        custom_workout_id: null,
        status: 'planned',
        reminder_time: null,
        session_kind: 'cardio',
        cardio_slug: slot.cardio_slug,
        stretch_slug: null,
        is_optional: slot.optional,
      },
    };
  }
  if (slot.type === 'recovery' && slot.stretch_slug) {
    const stretch = stretchMeta(slot.stretch_slug);
    return {
      ...day,
      kind: 'recovery',
      title: stretch?.name ?? slot.name ?? 'Recovery',
      subtitle,
      sessionMinutes: stretch?.minutes ?? slot.minutes ?? 12,
      isStretch: true,
      isOptional: slot.optional,
      plan: {
        id: overlayPlanId(day.iso, 'recovery'),
        date: day.iso,
        routine_day_id: null,
        custom_workout_id: null,
        status: 'planned',
        reminder_time: null,
        session_kind: 'recovery',
        cardio_slug: null,
        stretch_slug: slot.stretch_slug,
        is_optional: slot.optional,
      },
    };
  }
  return day;
}

function applySupportOverlay(
  days: PlannerDayView[],
  enrolment: RoutineEnrolment | null,
  prefs: WeekPlanPrefs,
  plans: PlannedSession[] = []
): PlannerDayView[] {
  if (!enrolment) return days;
  const overlay = overlayForRoutine(enrolment.routine.slug, enrolment.routine.id);
  if (!overlay) return days;
  const skipped = new Set(plans.filter((row) => row.status === 'skipped').map((row) => row.date));
  const endDate = toIso(addDays(parseIsoDate(enrolment.start_date), enrolment.routine.length_weeks * 7 - 1));
  const byWeek = new Map<number, PlacedSlot[]>();
  return days.map((day) => {
    if (day.kind !== 'empty') return day;
    if (skipped.has(day.iso)) return day;
    if (day.iso < enrolment.start_date || day.iso > endDate) return day;
    const date = parseIsoDate(day.iso);
    const weekNumber = currentEnrolmentWeek(enrolment, date);
    let slots = byWeek.get(weekNumber);
    if (!slots) {
      slots = slotsForWeek({
        overlay,
        weekNumber,
        preferredDays: prefs.preferredDays,
        cardioPreference: prefs.cardioPreference,
      });
      byWeek.set(weekNumber, slots);
    }
    const slot = slots.find((item) => item.weekday === weekdayFromDate(date));
    if (!slot) return day;
    return overlayDayFromSlot(day, slot, enrolment);
  });
}

async function loadLookups(
  userId: string,
  from: Date,
  to: Date,
  enrolment: RoutineEnrolment | null,
  routine: Routine | null
): Promise<DayLookups> {
  const [plans, finished, workouts] = await Promise.all([
    fetchPlansInRange(userId, toIso(from), toIso(to)),
    fetchFinishedDatesInRange(toIso(from), toIso(to)),
    fetchCustomWorkouts().catch(() => []),
  ]);
  return {
    plans,
    finished,
    workouts,
    routine,
    enrolment,
    todayIso: toIso(startOfDay(new Date())),
  };
}

export async function loadPlannerWeek(weekStart: Date = startOfWeekMonday(new Date())): Promise<PlannerWeek> {
  const userId = await requireUserId();
  const monday = startOfWeekMonday(weekStart);
  const weekStartIso = toIso(monday);
  const weekEndIso = toIso(addDays(monday, 6));
  const prefs = await fetchWeekPlanPrefs().catch(
    (): WeekPlanPrefs => ({ preferredDays: ['mon', 'wed', 'fri'], cardioPreference: 'fine' })
  );

  const enrolment = await fetchActiveEnrolment();
  if (enrolment) {
    await ensureWeekFromRoutine(userId, monday, enrolment, prefs);
  }

  const routine = enrolment ? await fetchRoutine(enrolment.routine_id).catch(() => null) : null;
  const lookups = await loadLookups(userId, monday, addDays(monday, 6), enrolment, routine);
  const days = applySupportOverlay(
    WEEKDAYS_MON.map((_, index) => toDayView(addDays(monday, index), lookups)),
    enrolment,
    prefs,
    lookups.plans
  );
  const workoutDays = days.filter((day) => isPlannedSessionKind(day.kind) && !day.isOptional);
  return {
    weekStart: weekStartIso,
    weekEnd: weekEndIso,
    days,
    plannedCount: workoutDays.length,
    completedCount: workoutDays.filter((day) => day.completed).length,
    enrolment,
  };
}

export type PlannerRange = {
  from: string;
  to: string;
  days: PlannerDayView[];
  enrolment: RoutineEnrolment | null;
};

export async function loadPlannerRange(from: Date, to: Date): Promise<PlannerRange> {
  const userId = await requireUserId();
  const prefs = await fetchWeekPlanPrefs().catch(
    (): WeekPlanPrefs => ({ preferredDays: ['mon', 'wed', 'fri'], cardioPreference: 'fine' })
  );
  const enrolment = await fetchActiveEnrolment();
  const routine = enrolment ? await fetchRoutine(enrolment.routine_id).catch(() => null) : null;
  if (enrolment && routine) {
    await ensureRangeFromRoutine(userId, from, to, enrolment, routine, prefs);
  }

  const lookups = await loadLookups(userId, from, to, enrolment, routine);
  return {
    from: toIso(from),
    to: toIso(to),
    days: applySupportOverlay(buildDays(from, to, lookups), enrolment, prefs, lookups.plans),
    enrolment,
  };
}

/** Planned workout days (not rest) grouped by Monday, for weekly streak targets. */
export async function fetchPlannedCountsByWeek(
  from: string,
  to: string
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return counts;
    const { data, error } = await supabase
      .from('planned_sessions')
      .select('date, status')
      .eq('user_id', user.id)
      .gte('date', from)
      .lte('date', to)
      .in('status', ['planned', 'done']);
    if (error) {
      if (isMissingPlanner(error)) return counts;
      throw new Error(error.message);
    }
    for (const row of data ?? []) {
      const monday = toIso(startOfWeekMonday(parseIsoDate(row.date as string)));
      counts.set(monday, (counts.get(monday) ?? 0) + 1);
    }
  } catch (error) {
    if (error instanceof Error && /planned_sessions/i.test(error.message)) return counts;
    throw error;
  }
  return counts;
}

export async function fetchThisWeekProgress(now = new Date()): Promise<WeekPlanProgress> {
  try {
    const week = await loadPlannerWeek(startOfWeekMonday(now));
    return { completed: week.completedCount, planned: week.plannedCount };
  } catch (error) {
    if (error instanceof Error && /planned_sessions/i.test(error.message)) {
      return { completed: 0, planned: 0 };
    }
    throw error;
  }
}
