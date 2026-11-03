import { fetchCustomWorkouts } from '@/lib/customWorkouts';
import {
  currentEnrolmentWeek,
  daysInWeek,
  fetchActiveEnrolment,
  fetchRoutine,
  type Routine,
  type RoutineEnrolment,
} from '@/lib/routines';
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
};

export type PlannerDayOption = {
  iso: string;
  label: string;
  isToday: boolean;
};

export type PlannerDayKind = 'empty' | 'rest' | 'routine' | 'custom';

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
};

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

let planSelect = PLAN_COLUMNS_REMINDERS;

function isMissingPlanner(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return error.code === '42P01' || error.code === 'PGRST205' || /planned_sessions/.test(detail);
}

function isMissingReminderTimeColumn(error: { message?: string; code?: string }): boolean {
  return /reminder_time/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
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

function toPlannedSession(row: PlannedSession): PlannedSession {
  return {
    ...row,
    reminder_time: parsePlanTime(row.reminder_time),
  };
}

function isUniqueConflict(error: { message?: string; code?: string }): boolean {
  return error.code === '23505' || /duplicate|unique/i.test(error.message ?? '');
}

export function missingPlannerMessage(): string {
  return 'Adding to the planner needs supabase/planned_sessions.sql run in the Supabase SQL editor.';
}

export function describePlannerError(error: unknown): string {
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
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

async function insertPlan(row: {
  user_id: string;
  date: string;
  routine_day_id: string | null;
  custom_workout_id: string | null;
  status: PlannedSessionStatus;
}): Promise<PlannedSession> {
  const { data, error } = await supabase
    .from('planned_sessions')
    .insert(row)
    .select(PLAN_COLUMNS)
    .single();
  if (error) throwPlanner(error);
  return toPlannedSession(data as PlannedSession);
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

export async function movePlannedSession(id: string, toDate: string): Promise<void> {
  const userId = await requireUserId();
  const { data: source, error: sourceError } = await supabase
    .from('planned_sessions')
    .select(PLAN_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (sourceError) throwPlanner(sourceError);
  if (!source) throw new Error('That session is no longer on your planner.');

  const from = toPlannedSession(source as PlannedSession);
  if (from.date === toDate) return;

  const { data: destRows, error: destError } = await supabase
    .from('planned_sessions')
    .select(PLAN_COLUMNS)
    .eq('user_id', userId)
    .eq('date', toDate)
    .in('status', ['planned', 'rest']);
  if (destError) throwPlanner(destError);

  const dest = destRows?.[0] ? toPlannedSession(destRows[0] as PlannedSession) : null;
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
    if (planSelect !== PLAN_COLUMNS && isMissingReminderTimeColumn(error)) {
      planSelect = PLAN_COLUMNS;
      return fetchPlansInRange(userId, from, to);
    }
    throwPlanner(error);
  }
  return (data ?? []).map((row) => toPlannedSession(row as unknown as PlannedSession));
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
      .filter((row) => row.status === 'planned' || row.status === 'rest' || row.status === 'done')
      .map((row) => row.date)
  );
}

function placedRoutineDayIds(rows: PlannedSession[]): Set<string> {
  return new Set(rows.map((row) => row.routine_day_id).filter((id): id is string => Boolean(id)));
}

type WeekInsert = {
  user_id: string;
  date: string;
  routine_day_id: string;
  custom_workout_id: null;
  status: 'planned';
};

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

function buildWeekInserts(
  userId: string,
  monday: Date,
  enrolment: RoutineEnrolment,
  routine: Routine,
  existing: PlannedSession[]
): WeekInsert[] {
  const weekStart = toIso(monday);
  const weekEnd = toIso(addDays(monday, 6));
  const endDate = toIso(addDays(parseIsoDate(enrolment.start_date), enrolment.routine.length_weeks * 7 - 1));
  if (weekEnd < enrolment.start_date || weekStart > endDate) return [];

  const weekRows = rowsForWeek(existing, monday);
  const taken = occupiedDates(weekRows);
  const alreadyPlaced = placedRoutineDayIds(weekRows);
  const weekNumber = currentEnrolmentWeek(enrolment, monday);
  const routineDays = daysForPlannerWeek(routine, weekNumber).filter((day) => !alreadyPlaced.has(day.id));
  if (routineDays.length === 0) return [];

  const offsets = defaultTrainingOffsets(enrolment.routine.days_per_week);
  const inserts: WeekInsert[] = [];
  let dayIndex = 0;
  for (const offset of offsets) {
    if (dayIndex >= routineDays.length) break;
    const iso = toIso(addDays(monday, offset));
    if (iso > endDate || taken.has(iso)) continue;
    inserts.push({
      user_id: userId,
      date: iso,
      routine_day_id: routineDays[dayIndex].id,
      custom_workout_id: null,
      status: 'planned',
    });
    taken.add(iso);
    dayIndex += 1;
  }

  if (dayIndex < routineDays.length) {
    for (let offset = 0; offset < 7 && dayIndex < routineDays.length; offset += 1) {
      const iso = toIso(addDays(monday, offset));
      if (iso > endDate || taken.has(iso)) continue;
      inserts.push({
        user_id: userId,
        date: iso,
        routine_day_id: routineDays[dayIndex].id,
        custom_workout_id: null,
        status: 'planned',
      });
      taken.add(iso);
      dayIndex += 1;
    }
  }

  return inserts;
}

async function insertWeekPlans(inserts: WeekInsert[]): Promise<void> {
  if (inserts.length === 0) return;
  const { error } = await supabase.from('planned_sessions').insert(inserts);
  if (error && !isUniqueConflict(error)) throwPlanner(error);
}

async function ensureWeekFromRoutine(
  userId: string,
  monday: Date,
  enrolment: RoutineEnrolment
): Promise<void> {
  const weekStart = toIso(monday);
  const weekEnd = toIso(addDays(monday, 6));
  const existing = await fetchPlansInRange(userId, weekStart, weekEnd);
  const routine = await fetchRoutine(enrolment.routine_id);
  if (!routine) return;
  await insertWeekPlans(buildWeekInserts(userId, monday, enrolment, routine, existing));
}

async function ensureRangeFromRoutine(
  userId: string,
  from: Date,
  to: Date,
  enrolment: RoutineEnrolment,
  routine: Routine
): Promise<void> {
  const existing = await fetchPlansInRange(userId, toIso(from), toIso(to));
  const inserts = mondaysInRange(from, to).flatMap((monday) =>
    buildWeekInserts(userId, monday, enrolment, routine, existing)
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
  const completed = Boolean(done) || (Boolean(live) && live?.status !== 'rest' && finishedToday);
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
  } else if (plan?.routine_day_id) {
    kind = 'routine';
    const day = routineDays.find((item) => item.id === plan.routine_day_id);
    title = day?.name ?? 'Routine session';
    const weekNumber = routineWeekByDay.get(plan.routine_day_id);
    subtitle =
      lookups.enrolment && weekNumber
        ? `${lookups.enrolment.routine.name} · week ${weekNumber}`
        : (lookups.enrolment?.routine.name ?? 'Routine');
    exercises.push(...(day?.exercises.map((item) => item.exercise.name) ?? []));
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
  };
}

function buildDays(from: Date, to: Date, lookups: DayLookups): PlannerDayView[] {
  const days: PlannerDayView[] = [];
  for (let date = startOfDay(from); date.getTime() <= startOfDay(to).getTime(); date = addDays(date, 1)) {
    days.push(toDayView(date, lookups));
  }
  return days;
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

  const enrolment = await fetchActiveEnrolment();
  if (enrolment) {
    await ensureWeekFromRoutine(userId, monday, enrolment);
  }

  const routine = enrolment ? await fetchRoutine(enrolment.routine_id).catch(() => null) : null;
  const lookups = await loadLookups(userId, monday, addDays(monday, 6), enrolment, routine);
  const days = WEEKDAYS_MON.map((_, index) => toDayView(addDays(monday, index), lookups));
  const workoutDays = days.filter((day) => day.kind === 'routine' || day.kind === 'custom');
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
  const enrolment = await fetchActiveEnrolment();
  const routine = enrolment ? await fetchRoutine(enrolment.routine_id).catch(() => null) : null;
  if (enrolment && routine) {
    await ensureRangeFromRoutine(userId, from, to, enrolment, routine);
  }

  const lookups = await loadLookups(userId, from, to, enrolment, routine);
  return {
    from: toIso(from),
    to: toIso(to),
    days: buildDays(from, to, lookups),
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
