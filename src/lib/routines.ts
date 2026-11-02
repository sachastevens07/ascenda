import type { QuizAnswers } from '@/lib/profile';
import {
  SLOT_EXERCISE_COLUMNS,
  toSlotExercise,
  type ProgrammeDay,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';
import { supabase } from '@/lib/supabase';

export const LAUNCH_ROUTINE_IDS = [
  'gym-confidence-6',
  'full-body-3',
  'one-spot-6',
  'busy-gym-6',
  'upper-lower-4',
  'lower-body-3',
] as const;

export type RoutineGoal = 'strength' | 'glutes_legs' | 'general' | 'confidence';
export type RoutineDifficulty = 'beginner' | 'intermediate' | 'experienced';
export type RoutineEquipment = 'full_gym' | 'dumbbells' | 'home';
export type EnrolmentStatus = 'active' | 'complete' | 'abandoned';

export type CoverImage = {
  id: string;
  url: string | null;
  storage_path: string | null;
  alt_text: string;
  licence_source: string | null;
};

export type RoutineSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  cover: CoverImage | null;
  goal: RoutineGoal;
  length_weeks: number;
  days_per_week: number;
  session_minutes: number;
  difficulty: RoutineDifficulty;
  equipment: RoutineEquipment;
  is_pro: boolean;
  is_featured_eligible: boolean;
  sort_order: number;
  source_programme_id: string | null;
  tags: string[];
};

export type RoutineDayExercise = {
  position: number;
  sets: number;
  rep_min: number;
  rep_max: number;
  rest_seconds: number;
  exercise: SlotExercise;
};

export type RoutineDay = {
  id: string;
  day_number: number;
  name: string;
  source_programme_day_id: string | null;
  exercises: RoutineDayExercise[];
};

export type RoutineWeek = {
  id: string;
  week_number: number;
  days: RoutineDay[];
};

export type Routine = RoutineSummary & {
  weeks: RoutineWeek[];
};

export type RoutineEnrolment = {
  id: string;
  user_id: string;
  routine_id: string;
  start_date: string;
  status: EnrolmentStatus;
  completed_at: string | null;
  routine: RoutineSummary;
};

export const DIFFICULTY_LABELS: Record<RoutineDifficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  experienced: 'Experienced',
};

export const ROUTINE_GOAL_LABELS: Record<RoutineGoal, string> = {
  strength: 'Build strength',
  glutes_legs: 'Glutes and legs',
  general: 'Feel stronger',
  confidence: 'Gym confidence',
};

export const ROUTINE_EQUIPMENT_LABELS: Record<RoutineEquipment, string> = {
  full_gym: 'Full gym',
  dumbbells: 'Dumbbells',
  home: 'Home',
};

function isMissingRoutines(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    /could not find the table['\s].*(routines|routine_|images)/.test(detail) ||
    /relation ['"]?public\.(routines|routine_|images)/.test(detail) ||
    /column .*routine_/.test(detail)
  );
}

export function missingRoutinesMessage(): string {
  return 'Routines need supabase/routines.sql run in the Supabase SQL editor.';
}

export function describeRoutineError(error: unknown): string {
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  if (/42P01|PGRST205|routines|routine_|images/i.test(detail)) {
    return missingRoutinesMessage();
  }
  return detail || 'Check your connection and try again.';
}

const COVER_SELECT = 'id, url, storage_path, alt_text, licence_source';
const SUMMARY_SELECT = `
  id, name, slug, description, goal, length_weeks, days_per_week, session_minutes,
  difficulty, equipment, is_pro, is_featured_eligible, sort_order, source_programme_id,
  cover:images (${COVER_SELECT}),
  routine_tags (tag)
`;
const DAY_EXERCISE_SELECT = `
  position, sets, rep_min, rep_max, rest_seconds,
  exercise:exercises (${SLOT_EXERCISE_COLUMNS})
`;
const DETAIL_SELECT = `
  ${SUMMARY_SELECT},
  routine_weeks (
    id, week_number,
    routine_days (
      id, day_number, name, source_programme_day_id,
      routine_day_exercises (${DAY_EXERCISE_SELECT})
    )
  )
`;

type TagRow = { tag: string };
type CoverRow = CoverImage | CoverImage[] | null;

type SummaryRow = Omit<RoutineSummary, 'cover' | 'tags'> & {
  cover: CoverRow;
  routine_tags: TagRow[] | null;
};

type DayRow = Omit<RoutineDay, 'exercises'> & {
  routine_day_exercises: (Omit<RoutineDayExercise, 'exercise'> & { exercise: SlotExercise })[] | null;
};

type WeekRow = Omit<RoutineWeek, 'days'> & {
  routine_days: DayRow[] | null;
};

type DetailRow = SummaryRow & {
  routine_weeks: WeekRow[] | null;
};

type EnrolmentRow = {
  id: string;
  user_id: string;
  routine_id: string;
  start_date: string;
  status: EnrolmentStatus;
  completed_at: string | null;
  routine: SummaryRow;
};

function oneCover(cover: CoverRow): CoverImage | null {
  if (!cover) return null;
  return Array.isArray(cover) ? (cover[0] ?? null) : cover;
}

function toSummary(row: SummaryRow): RoutineSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    cover: oneCover(row.cover),
    goal: row.goal,
    length_weeks: row.length_weeks,
    days_per_week: row.days_per_week,
    session_minutes: row.session_minutes,
    difficulty: row.difficulty,
    equipment: row.equipment,
    is_pro: row.is_pro,
    is_featured_eligible: row.is_featured_eligible,
    sort_order: row.sort_order,
    source_programme_id: row.source_programme_id,
    tags: (row.routine_tags ?? []).map((item) => item.tag),
  };
}

function toDay(row: DayRow): RoutineDay {
  return {
    id: row.id,
    day_number: row.day_number,
    name: row.name,
    source_programme_day_id: row.source_programme_day_id,
    exercises: [...(row.routine_day_exercises ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        position: item.position,
        sets: item.sets,
        rep_min: item.rep_min,
        rep_max: item.rep_max,
        rest_seconds: item.rest_seconds,
        exercise: toSlotExercise(item.exercise),
      })),
  };
}

function toRoutine(row: DetailRow): Routine {
  return {
    ...toSummary(row),
    weeks: [...(row.routine_weeks ?? [])]
      .sort((a, b) => a.week_number - b.week_number)
      .map((week) => ({
        id: week.id,
        week_number: week.week_number,
        days: [...(week.routine_days ?? [])]
          .sort((a, b) => a.day_number - b.day_number)
          .map(toDay),
      })),
  };
}

function todayDate(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

/** Week she is on (1-based), capped at the routine length. */
export function currentEnrolmentWeek(enrolment: RoutineEnrolment, now = new Date()): number {
  const elapsed = Math.max(0, daysBetween(enrolment.start_date, todayDate(now)));
  return Math.min(enrolment.routine.length_weeks, Math.floor(elapsed / 7) + 1);
}

export type RoutinePhase = {
  fromWeek: number;
  toWeek: number;
  days: RoutineDay[];
};

function weekFingerprint(days: RoutineDay[]): string {
  return days
    .map((day) =>
      [
        day.name,
        ...day.exercises.map(
          (item) =>
            `${item.position}:${item.exercise.id}:${item.sets}:${item.rep_min}:${item.rep_max}:${item.rest_seconds}`
        ),
      ].join('|')
    )
    .join('//');
}

/** Collapse consecutive weeks that use the same workouts (e.g. weeks 1–2). */
export function groupRoutinePhases(weeks: RoutineWeek[]): RoutinePhase[] {
  const phases: RoutinePhase[] = [];
  for (const week of weeks) {
    const last = phases[phases.length - 1];
    if (last && weekFingerprint(last.days) === weekFingerprint(week.days)) {
      last.toWeek = week.week_number;
    } else {
      phases.push({ fromWeek: week.week_number, toWeek: week.week_number, days: week.days });
    }
  }
  return phases;
}

export function formatWeekRange(fromWeek: number, toWeek: number): string {
  return fromWeek === toWeek ? `Week ${fromWeek}` : `Weeks ${fromWeek}–${toWeek}`;
}

export function formatRestSeconds(seconds: number): string {
  if (seconds <= 0) return 'No rest';
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return minutes === 1 ? '1 min rest' : `${minutes} min rest`;
  }
  return `${seconds} s rest`;
}

export type PlannedSession = {
  weekNumber: number;
  day: RoutineDay;
};

export function flattenRoutineDays(routine: Routine): PlannedSession[] {
  return routine.weeks.flatMap((week) =>
    week.days.map((day) => ({ weekNumber: week.week_number, day }))
  );
}

export function findPlannedSession(routine: Routine, dayId: string): PlannedSession | null {
  return (
    flattenRoutineDays(routine).find(
      (item) => item.day.id === dayId || item.day.source_programme_day_id === dayId
    ) ?? null
  );
}

/** Next session in the routine: current calendar week, then the day after the last finished one. */
export function getNextRoutineDay(
  routine: Routine,
  enrolment: RoutineEnrolment,
  lastDayId: string | null
): PlannedSession | null {
  const days = flattenRoutineDays(routine);
  if (days.length === 0) return null;
  const calendarWeek = currentEnrolmentWeek(enrolment);
  const weekDays = days.filter((item) => item.weekNumber === calendarWeek);

  if (!lastDayId) return weekDays[0] ?? days[0];

  const lastIndex = days.findIndex(
    (item) => item.day.id === lastDayId || item.day.source_programme_day_id === lastDayId
  );
  if (lastIndex === -1) return weekDays[0] ?? days[0];

  const last = days[lastIndex];
  if (last.weekNumber < calendarWeek && weekDays[0]) return weekDays[0];
  return days[lastIndex + 1] ?? days[0];
}

export function daysInWeek(routine: Routine, weekNumber: number): RoutineDay[] {
  return routine.weeks.find((week) => week.week_number === weekNumber)?.days ?? [];
}

/** Week 1, day 1 (or the earliest week/day if week 1 is missing). */
export function firstDayOfRoutine(routine: Routine): RoutineDay | null {
  const weeks = [...routine.weeks].sort((a, b) => a.week_number - b.week_number);
  const week = weeks.find((item) => item.week_number === 1) ?? weeks[0];
  if (!week) return null;
  const days = [...week.days].sort((a, b) => a.day_number - b.day_number);
  return days[0] ?? null;
}

function scoreRoutine(routine: RoutineSummary, answers: QuizAnswers): number {
  let score = 0;
  if (routine.equipment === answers.equipment) score += 5;
  else if (answers.equipment === 'full_gym') score += 2;
  else if (answers.equipment === 'dumbbells' && routine.equipment === 'full_gym') score += 1;

  const dayGap = Math.abs(routine.days_per_week - answers.days_per_week);
  if (dayGap === 0) score += 3;
  else if (dayGap === 1) score += 2;

  if (routine.goal === answers.goal) score += 3;
  if (routine.goal === 'confidence' && answers.confidence <= 2) score += 4;
  if (routine.goal === 'glutes_legs' && answers.goal === 'glutes_legs') score += 2;

  if (answers.experience === 'new' && routine.difficulty === 'beginner') score += 3;
  if (answers.experience === 'some' && routine.difficulty !== 'experienced') score += 2;
  if (answers.experience === 'confident' && routine.difficulty !== 'beginner') score += 2;

  if (answers.confidence <= 2 && routine.tags.includes('one spot')) {
    score += 2;
  }
  if (answers.equipment === 'full_gym' && routine.tags.includes('busy gym friendly')) score += 1;
  if (routine.id === 'gym-confidence-6' && (answers.experience === 'new' || answers.confidence <= 2)) {
    score += 3;
  }
  if (!routine.is_pro) score += 1;
  return score;
}

/** 3–5 featured cards, tailored to her quiz. Always tries to include one free routine. */
export function pickFeaturedRoutines(
  routines: RoutineSummary[],
  answers: QuizAnswers,
  count = 4,
  options?: { freeOnly?: boolean }
): RoutineSummary[] {
  const pool = options?.freeOnly ? routines.filter((routine) => !routine.is_pro) : routines;
  const eligible = pool.filter((routine) => routine.is_featured_eligible);
  const rankedSource = eligible.length > 0 ? eligible : pool;
  const ranked = [...rankedSource].sort((a, b) => {
    const gap = scoreRoutine(b, answers) - scoreRoutine(a, answers);
    return gap !== 0 ? gap : a.sort_order - b.sort_order;
  });
  const size = options?.freeOnly
    ? Math.min(count, ranked.length)
    : Math.min(5, Math.max(3, Math.min(count, ranked.length)));
  const picked = ranked.slice(0, size);
  if (picked.length > 0 && !picked.some((routine) => !routine.is_pro)) {
    const free = ranked.find((routine) => !routine.is_pro);
    if (free) picked[picked.length - 1] = free;
  }
  return picked;
}

export function collectRoutineTags(routines: RoutineSummary[]): string[] {
  return [...new Set(routines.flatMap((routine) => routine.tags))].sort((a, b) => a.localeCompare(b));
}

/** So R4 can reuse getWeightSuggestion() without a second progression path. */
export function routineDayToProgrammeDay(day: RoutineDay): ProgrammeDay {
  return {
    id: day.id,
    day_number: day.day_number,
    name: day.name,
    exercises: day.exercises.map(
      (item): ProgrammeExercise => ({
        position: item.position,
        sets: item.sets,
        rep_min: item.rep_min,
        rep_max: item.rep_max,
        exercise: item.exercise,
      })
    ),
  };
}

export async function fetchRoutines(): Promise<RoutineSummary[]> {
  const { data, error } = await supabase
    .from('routines')
    .select(SUMMARY_SELECT)
    .order('sort_order', { ascending: true });
  if (error) {
    if (isMissingRoutines(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as unknown as SummaryRow[]).map(toSummary);
}

export async function fetchRoutine(id: string): Promise<Routine | null> {
  const { data, error } = await supabase.from('routines').select(DETAIL_SELECT).eq('id', id).maybeSingle();
  if (error) {
    if (isMissingRoutines(error)) throw new Error(missingRoutinesMessage());
    throw new Error(error.message);
  }
  return data ? toRoutine(data as unknown as DetailRow) : null;
}

export async function fetchRoutineDay(id: string): Promise<RoutineDay | null> {
  const { data, error } = await supabase
    .from('routine_days')
    .select(`id, day_number, name, source_programme_day_id, routine_day_exercises (${DAY_EXERCISE_SELECT})`)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (isMissingRoutines(error)) return null;
    throw new Error(error.message);
  }
  return data ? toDay(data as unknown as DayRow) : null;
}

export async function fetchActiveEnrolment(): Promise<RoutineEnrolment | null> {
  const { data, error } = await supabase
    .from('routine_enrolments')
    .select(`id, user_id, routine_id, start_date, status, completed_at, routine:routines (${SUMMARY_SELECT})`)
    .eq('status', 'active')
    .maybeSingle();
  if (error) {
    if (isMissingRoutines(error)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  const row = data as unknown as EnrolmentRow;
  return {
    id: row.id,
    user_id: row.user_id,
    routine_id: row.routine_id,
    start_date: row.start_date,
    status: row.status,
    completed_at: row.completed_at,
    routine: toSummary(row.routine),
  };
}

export async function startRoutine(routineId: string): Promise<RoutineEnrolment> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');

  const { error: abandonError } = await supabase
    .from('routine_enrolments')
    .update({ status: 'abandoned' })
    .eq('user_id', user.id)
    .eq('status', 'active');
  if (abandonError) {
    if (isMissingRoutines(abandonError)) throw new Error(missingRoutinesMessage());
    throw new Error(abandonError.message);
  }

  const { data, error } = await supabase
    .from('routine_enrolments')
    .insert({
      user_id: user.id,
      routine_id: routineId,
      start_date: todayDate(),
      status: 'active',
    })
    .select(`id, user_id, routine_id, start_date, status, completed_at, routine:routines (${SUMMARY_SELECT})`)
    .single();
  if (error) {
    if (isMissingRoutines(error)) throw new Error(missingRoutinesMessage());
    throw new Error(error.message);
  }
  const row = data as unknown as EnrolmentRow;
  return {
    id: row.id,
    user_id: row.user_id,
    routine_id: row.routine_id,
    start_date: row.start_date,
    status: row.status,
    completed_at: row.completed_at,
    routine: toSummary(row.routine),
  };
}

export async function completeActiveEnrolment(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');

  const { error } = await supabase
    .from('routine_enrolments')
    .update({ status: 'complete', completed_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'active');
  if (error) {
    if (isMissingRoutines(error)) throw new Error(missingRoutinesMessage());
    throw new Error(error.message);
  }
}

export async function fetchCompletedEnrolmentCount(): Promise<number> {
  const { count, error } = await supabase
    .from('routine_enrolments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'complete');
  if (error) {
    if (isMissingRoutines(error)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

function toEnrolment(row: EnrolmentRow): RoutineEnrolment {
  return {
    id: row.id,
    user_id: row.user_id,
    routine_id: row.routine_id,
    start_date: row.start_date,
    status: row.status,
    completed_at: row.completed_at,
    routine: toSummary(row.routine),
  };
}

export async function fetchLatestCompletedEnrolment(): Promise<RoutineEnrolment | null> {
  const { data, error } = await supabase
    .from('routine_enrolments')
    .select(`id, user_id, routine_id, start_date, status, completed_at, routine:routines (${SUMMARY_SELECT})`)
    .eq('status', 'complete')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingRoutines(error)) return null;
    throw new Error(error.message);
  }
  return data ? toEnrolment(data as unknown as EnrolmentRow) : null;
}

export async function countEnrolmentSessions(enrolmentId: string): Promise<number> {
  const { count, error } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('routine_enrolment_id', enrolmentId)
    .not('completed_at', 'is', null);
  if (error) {
    if (isMissingRoutines(error) || /routine_enrolment_id/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

export type RoadmapDay = {
  id: string;
  name: string;
  done: boolean;
};

export type RoadmapWeek = {
  weekNumber: number;
  current: boolean;
  days: RoadmapDay[];
};

export async function fetchRoutineRoadmap(enrolment: RoutineEnrolment): Promise<RoadmapWeek[]> {
  const routine = await fetchRoutine(enrolment.routine_id);
  if (!routine) return [];
  const { data, error } = await supabase
    .from('sessions')
    .select('routine_day_id')
    .eq('routine_enrolment_id', enrolment.id)
    .not('completed_at', 'is', null);
  if (error) {
    if (isMissingRoutines(error) || /routine_enrolment_id|routine_day_id/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }
  const done = new Set(
    (data ?? [])
      .map((row) => (row as { routine_day_id: string | null }).routine_day_id)
      .filter((id): id is string => Boolean(id))
  );
  const currentWeek = currentEnrolmentWeek(enrolment);
  return routine.weeks.map((week) => ({
    weekNumber: week.week_number,
    current: week.week_number === currentWeek,
    days: week.days.map((day) => ({
      id: day.id,
      name: day.name,
      done: done.has(day.id),
    })),
  }));
}

/** Marks the active enrolment complete once every planned session is logged. */
export async function maybeCompleteEnrolment(enrolmentId: string): Promise<boolean> {
  const enrolment = await fetchActiveEnrolment();
  if (!enrolment || enrolment.id !== enrolmentId) return false;
  const done = await countEnrolmentSessions(enrolmentId);
  const target = enrolment.routine.length_weeks * enrolment.routine.days_per_week;
  if (done < target) return false;
  await completeActiveEnrolment();
  return true;
}

export async function abandonActiveEnrolment(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');

  const { error } = await supabase
    .from('routine_enrolments')
    .update({ status: 'abandoned' })
    .eq('user_id', user.id)
    .eq('status', 'active');
  if (error) {
    if (isMissingRoutines(error)) throw new Error(missingRoutinesMessage());
    throw new Error(error.message);
  }
}
