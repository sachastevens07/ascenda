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
  'full-body-2',
  'home-strength-6',
  'upper-body-6',
  'glute-builder-6',
  'joint-friendly-6',
  'short-cycle-4',
  'barbell-strength-8',
  'one-spot-2',
] as const;

export type RoutineGoal = 'strength' | 'glutes_legs' | 'general' | 'confidence';
export type RoutineDifficulty = 'beginner' | 'intermediate' | 'experienced';
export type RoutineEquipment = 'full_gym' | 'dumbbells' | 'home';
export type RoutineType = 'strength' | 'stretch';
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
  type: RoutineType;
  tags: string[];
};

export type RoutineDayExercise = {
  position: number;
  sets: number;
  rep_min: number;
  rep_max: number;
  rest_seconds: number;
  /** Timed hold for stretch steps. Null on strength slots. */
  duration_seconds: number | null;
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
  is_checkpoint: boolean;
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
const SUMMARY_SELECT_BASE = `
  id, name, slug, description, goal, length_weeks, days_per_week, session_minutes,
  difficulty, equipment, is_pro, is_featured_eligible, sort_order, source_programme_id,
  cover:images (${COVER_SELECT}),
  routine_tags (tag)
`;
const SUMMARY_SELECT = `${SUMMARY_SELECT_BASE}, type`;
const DAY_EXERCISE_SELECT = `
  position, sets, rep_min, rep_max, rest_seconds, duration_seconds,
  exercise:exercises (${SLOT_EXERCISE_COLUMNS})
`;
const DAY_EXERCISE_SELECT_LEGACY = `
  position, sets, rep_min, rep_max, rest_seconds,
  exercise:exercises (${SLOT_EXERCISE_COLUMNS})
`;
const WEEK_NEST = `
    id, week_number, is_checkpoint,
    routine_days (
      id, day_number, name, source_programme_day_id
    )
`;
const WEEK_NEST_LEGACY = `
    id, week_number,
    routine_days (
      id, day_number, name, source_programme_day_id
    )
`;
const DETAIL_SELECT = `
  ${SUMMARY_SELECT},
  routine_weeks (
    ${WEEK_NEST}
  )
`;
const EXERCISE_QUERY_SELECT = `
  routine_day_id,
  position, sets, rep_min, rep_max, rest_seconds, duration_seconds,
  exercise:exercises (${SLOT_EXERCISE_COLUMNS})
`;
const EXERCISE_QUERY_SELECT_LEGACY = `
  routine_day_id,
  position, sets, rep_min, rep_max, rest_seconds,
  exercise:exercises (${SLOT_EXERCISE_COLUMNS})
`;

type TagRow = { tag: string };
type CoverRow = CoverImage | CoverImage[] | null;

export type SummaryRow = Omit<RoutineSummary, 'cover' | 'tags'> & {
  cover: CoverRow;
  routine_tags: TagRow[] | null;
};

type DayRow = Omit<RoutineDay, 'exercises'> & {
  routine_day_exercises?: (Omit<RoutineDayExercise, 'exercise'> & { exercise: SlotExercise })[] | null;
};

type ExerciseQueryRow = Omit<RoutineDayExercise, 'exercise'> & {
  routine_day_id: string;
  exercise: SlotExercise;
};

export type FetchRoutineOptions = {
  /** When false, Pro routines omit week 2+ exercise rows. Defaults to true. */
  includeLockedWeeks?: boolean;
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

export function toSummary(row: SummaryRow): RoutineSummary {
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
    type: row.type === 'stretch' ? 'stretch' : 'strength',
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
      .map(toDayExercise),
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
        is_checkpoint: Boolean(week.is_checkpoint),
        days: [...(week.routine_days ?? [])]
          .sort((a, b) => a.day_number - b.day_number)
          .map(toDay),
      })),
  };
}

export function isRoutineWeekLocked(
  routine: Pick<RoutineSummary, 'is_pro'>,
  weekNumber: number,
  isPro: boolean
): boolean {
  return routine.is_pro && !isPro && weekNumber > 1;
}

function dayIdsForPreview(routine: Routine, includeLockedWeeks: boolean): string[] {
  return routine.weeks
    .filter((week) => includeLockedWeeks || !routine.is_pro || week.week_number <= 1)
    .flatMap((week) => week.days.map((day) => day.id));
}

function toDayExercise(item: Omit<RoutineDayExercise, 'exercise'> & { exercise: SlotExercise }): RoutineDayExercise {
  return {
    position: item.position,
    sets: item.sets,
    rep_min: item.rep_min,
    rep_max: item.rep_max,
    rest_seconds: item.rest_seconds,
    duration_seconds: item.duration_seconds ?? null,
    exercise: toSlotExercise(item.exercise),
  };
}

function isMissingDurationColumn(error: { message?: string; code?: string }): boolean {
  return /duration_seconds/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingTypeColumn(error: { message?: string; code?: string }): boolean {
  return /routines\.type|\btype\b.*schema cache|column .*type/i.test(
    `${error.code ?? ''} ${error.message ?? ''}`
  );
}

function isMissingCheckpointColumn(error: { message?: string; code?: string }): boolean {
  return /is_checkpoint/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

async function fetchExercisesForDays(dayIds: string[]): Promise<Map<string, RoutineDayExercise[]>> {
  const byDay = new Map<string, RoutineDayExercise[]>();
  if (dayIds.length === 0) return byDay;
  let { data, error } = await supabase
    .from('routine_day_exercises')
    .select(EXERCISE_QUERY_SELECT)
    .in('routine_day_id', dayIds);
  if (error && isMissingDurationColumn(error)) {
    const retry = await supabase
      .from('routine_day_exercises')
      .select(EXERCISE_QUERY_SELECT_LEGACY)
      .in('routine_day_id', dayIds);
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error) {
    if (isMissingRoutines(error)) throw new Error(missingRoutinesMessage());
    throw new Error(error.message);
  }
  for (const row of (data ?? []) as unknown as ExerciseQueryRow[]) {
    const list = byDay.get(row.routine_day_id) ?? [];
    list.push(toDayExercise(row));
    byDay.set(row.routine_day_id, list);
  }
  for (const [dayId, list] of byDay) {
    byDay.set(
      dayId,
      [...list].sort((a, b) => a.position - b.position)
    );
  }
  return byDay;
}

function withDayExercises(routine: Routine, byDay: Map<string, RoutineDayExercise[]>): Routine {
  return {
    ...routine,
    weeks: routine.weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => ({
        ...day,
        exercises: byDay.get(day.id) ?? [],
      })),
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
  if (dayGap === 0) score += 6;
  else if (dayGap === 1) score += 1;

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
  if (
    routine.id === 'gym-confidence-6' &&
    dayGap === 0 &&
    (answers.experience === 'new' || answers.confidence <= 2)
  ) {
    score += 3;
  }
  if (!routine.is_pro) score += 1;
  return score;
}

/** Swap `candidate` into the row without dropping the only free card. */
function replaceFeaturedSlot(picked: RoutineSummary[], candidate: RoutineSummary | undefined): void {
  if (!candidate || picked.some((routine) => routine.id === candidate.id)) return;
  const freeCount = picked.filter((routine) => !routine.is_pro).length;
  let index = picked.length - 1;
  for (let i = picked.length - 1; i >= 0; i -= 1) {
    const soleFree = freeCount === 1 && !picked[i].is_pro;
    if (!soleFree) {
      index = i;
      break;
    }
  }
  picked[index] = candidate;
}

/** 3–5 featured cards, tailored to her quiz. Always tries to include one free routine. */
export function pickFeaturedRoutines(
  routines: RoutineSummary[],
  answers: QuizAnswers,
  count = 4,
  options?: { freeOnly?: boolean }
): RoutineSummary[] {
  const strength = routines.filter((routine) => routine.type !== 'stretch');
  const pool = options?.freeOnly ? strength.filter((routine) => !routine.is_pro) : strength;
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
    replaceFeaturedSlot(
      picked,
      ranked.find((routine) => !routine.is_pro)
    );
  }
  if (picked.length > 0 && !picked.some((routine) => routine.days_per_week === answers.days_per_week)) {
    replaceFeaturedSlot(
      picked,
      ranked.find((routine) => routine.days_per_week === answers.days_per_week)
    );
  }
  return picked;
}

export function collectRoutineTags(routines: RoutineSummary[]): string[] {
  return [...new Set(routines.flatMap((routine) => routine.tags))].sort((a, b) => a.localeCompare(b));
}

/** Sentence-case a stored tag such as "one spot" or "beginner-friendly". */
export function formatTagLabel(tag: string): string {
  const cleaned = tag.replace(/-/g, ' ').trim();
  if (!cleaned) return tag;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

function uniqueById(routines: RoutineSummary[]): RoutineSummary[] {
  const seen = new Set<string>();
  return routines.filter((routine) => {
    if (seen.has(routine.id)) return false;
    seen.add(routine.id);
    return true;
  });
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
        rest_seconds: item.rest_seconds,
        exercise: item.exercise,
      })
    ),
  };
}

export async function fetchRoutines(options?: { type?: RoutineType }): Promise<RoutineSummary[]> {
  const wanted = options?.type;
  const withType = await supabase
    .from('routines')
    .select(SUMMARY_SELECT)
    .order('sort_order', { ascending: true });
  if (withType.error && isMissingTypeColumn(withType.error)) {
    const fallback = await supabase
      .from('routines')
      .select(SUMMARY_SELECT_BASE)
      .order('sort_order', { ascending: true });
    if (fallback.error) {
      if (isMissingRoutines(fallback.error)) return [];
      throw new Error(fallback.error.message);
    }
    const list = uniqueById(((fallback.data ?? []) as unknown as SummaryRow[]).map(toSummary));
    if (wanted === 'stretch') return [];
    return list;
  }
  if (withType.error) {
    if (isMissingRoutines(withType.error)) return [];
    throw new Error(withType.error.message);
  }
  const list = uniqueById(((withType.data ?? []) as unknown as SummaryRow[]).map(toSummary));
  if (!wanted) return list.filter((routine) => routine.type !== 'stretch');
  return list.filter((routine) => routine.type === wanted);
}

export async function fetchRoutine(
  id: string,
  options?: FetchRoutineOptions
): Promise<Routine | null> {
  const includeLockedWeeks = options?.includeLockedWeeks ?? true;
  const attempts = [
    `${SUMMARY_SELECT}, routine_weeks (${WEEK_NEST})`,
    `${SUMMARY_SELECT_BASE}, routine_weeks (${WEEK_NEST})`,
    `${SUMMARY_SELECT}, routine_weeks (${WEEK_NEST_LEGACY})`,
    `${SUMMARY_SELECT_BASE}, routine_weeks (${WEEK_NEST_LEGACY})`,
  ];
  let data: unknown = null;
  let error: { message?: string; code?: string } | null = null;
  for (const select of attempts) {
    const result = await supabase.from('routines').select(select).eq('id', id).maybeSingle();
    data = result.data;
    error = result.error;
    if (!error) break;
    if (isMissingRoutines(error)) throw new Error(missingRoutinesMessage());
    if (!isMissingTypeColumn(error) && !isMissingCheckpointColumn(error)) {
      throw new Error(error.message);
    }
  }
  if (error) throw new Error(error.message);
  if (!data) return null;
  const routine = toRoutine(data as DetailRow);
  const byDay = await fetchExercisesForDays(dayIdsForPreview(routine, includeLockedWeeks));
  return withDayExercises(routine, byDay);
}

export async function fetchRoutineDay(id: string): Promise<RoutineDay | null> {
  let { data, error } = await supabase
    .from('routine_days')
    .select(`id, day_number, name, source_programme_day_id, routine_day_exercises (${DAY_EXERCISE_SELECT})`)
    .eq('id', id)
    .maybeSingle();
  if (error && isMissingDurationColumn(error)) {
    const retry = await supabase
      .from('routine_days')
      .select(
        `id, day_number, name, source_programme_day_id, routine_day_exercises (${DAY_EXERCISE_SELECT_LEGACY})`
      )
      .eq('id', id)
      .maybeSingle();
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error) {
    if (isMissingRoutines(error)) return null;
    throw new Error(error.message);
  }
  return data ? toDay(data as unknown as DayRow) : null;
}

const ENROLMENT_SELECT = `id, user_id, routine_id, start_date, status, completed_at, routine:routines (${SUMMARY_SELECT})`;
const ENROLMENT_SELECT_BASE = `id, user_id, routine_id, start_date, status, completed_at, routine:routines (${SUMMARY_SELECT_BASE})`;

async function selectEnrolment(
  run: (columns: string) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>
): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> {
  const withType = await run(ENROLMENT_SELECT);
  if (!withType.error || !isMissingTypeColumn(withType.error)) return withType;
  return run(ENROLMENT_SELECT_BASE);
}

export async function fetchActiveEnrolment(): Promise<RoutineEnrolment | null> {
  const { data, error } = await selectEnrolment((columns) =>
    supabase.from('routine_enrolments').select(columns).eq('status', 'active').maybeSingle()
  );
  if (error) {
    if (isMissingRoutines(error)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return toEnrolment(data as unknown as EnrolmentRow);
}

export async function fetchEnrolment(id: string): Promise<RoutineEnrolment | null> {
  const { data, error } = await selectEnrolment((columns) =>
    supabase.from('routine_enrolments').select(columns).eq('id', id).maybeSingle()
  );
  if (error) {
    if (isMissingRoutines(error)) return null;
    throw new Error(error.message);
  }
  return data ? toEnrolment(data as unknown as EnrolmentRow) : null;
}

export type RoutineProgress = {
  routineId: string;
  done: number;
  target: number;
  status: EnrolmentStatus;
};

/** Active or completed progress per routine, for card rings. */
export async function fetchRoutineProgressMap(): Promise<Record<string, RoutineProgress>> {
  const { data, error } = await selectEnrolment((columns) =>
    supabase
      .from('routine_enrolments')
      .select(columns)
      .in('status', ['active', 'complete'])
      .order('completed_at', { ascending: false })
  );
  if (error) {
    if (isMissingRoutines(error)) return {};
    throw new Error(error.message);
  }
  const rows = ((data ?? []) as EnrolmentRow[]).map(toEnrolment);
  const ids = rows.map((row) => row.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const sessions = await supabase
      .from('sessions')
      .select('routine_enrolment_id')
      .in('routine_enrolment_id', ids)
      .not('completed_at', 'is', null);
    if (!sessions.error) {
      for (const row of sessions.data ?? []) {
        const enrolmentId = (row as { routine_enrolment_id: string | null }).routine_enrolment_id;
        if (!enrolmentId) continue;
        counts.set(enrolmentId, (counts.get(enrolmentId) ?? 0) + 1);
      }
    }
  }
  const map: Record<string, RoutineProgress> = {};
  for (const row of rows) {
    const existing = map[row.routine_id];
    if (existing && existing.status === 'active') continue;
    if (existing && row.status !== 'active') continue;
    map[row.routine_id] = {
      routineId: row.routine_id,
      done: counts.get(row.id) ?? 0,
      target: Math.max(1, row.routine.length_weeks * row.routine.days_per_week),
      status: row.status,
    };
  }
  return map;
}

function isMissingPlannerTable(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return error.code === '42P01' || error.code === 'PGRST205' || /planned_sessions/.test(detail);
}

/** Drops upcoming routine days from the planner. Custom workouts and finished days stay. */
async function clearUpcomingRoutinePlans(userId: string): Promise<void> {
  const { error } = await supabase
    .from('planned_sessions')
    .delete()
    .eq('user_id', userId)
    .gte('date', todayDate())
    .eq('status', 'planned')
    .not('routine_day_id', 'is', null);
  if (error && !isMissingPlannerTable(error)) {
    throw new Error(error.message);
  }
}

export async function startRoutine(routineId: string): Promise<RoutineEnrolment> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');

  const catalogue = await fetchRoutine(routineId);
  if (catalogue?.type === 'stretch') {
    throw new Error('Stretch sessions start from Programmes, not as a training plan.');
  }

  const previous = await fetchActiveEnrolment();
  if (previous) {
    const done = await countEnrolmentSessions(previous.id);
    const target = previous.routine.length_weeks * previous.routine.days_per_week;
    if (target > 0 && done >= target) {
      await completeActiveEnrolment();
    } else {
      const { error: abandonError } = await supabase
        .from('routine_enrolments')
        .update({ status: 'abandoned' })
        .eq('user_id', user.id)
        .eq('status', 'active');
      if (abandonError) {
        if (isMissingRoutines(abandonError)) throw new Error(missingRoutinesMessage());
        throw new Error(abandonError.message);
      }
    }
    await clearUpcomingRoutinePlans(user.id);
  }

  const { error } = await supabase.from('routine_enrolments').insert({
    user_id: user.id,
    routine_id: routineId,
    start_date: todayDate(),
    status: 'active',
  });
  if (error) {
    if (isMissingRoutines(error)) throw new Error(missingRoutinesMessage());
    throw new Error(error.message);
  }
  const created = await fetchActiveEnrolment();
  if (!created) throw new Error('Couldn’t start that routine. Try again.');
  return created;
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
  const { data, error } = await selectEnrolment((columns) =>
    supabase
      .from('routine_enrolments')
      .select(columns)
      .eq('status', 'complete')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  );
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
  checkpoint: boolean;
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
    checkpoint: Boolean(week.is_checkpoint),
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

export type EndRoutineResult = 'complete' | 'abandoned';

/**
 * Ends the active routine. Marks it complete if every planned session is already logged,
 * otherwise abandoned. Upcoming planned sessions from that routine are cleared.
 */
export async function endActiveEnrolment(): Promise<EndRoutineResult | null> {
  const enrolment = await fetchActiveEnrolment();
  if (!enrolment) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');

  const done = await countEnrolmentSessions(enrolment.id);
  const target = enrolment.routine.length_weeks * enrolment.routine.days_per_week;
  const finished = target > 0 && done >= target;
  if (finished) {
    await completeActiveEnrolment();
  } else {
    await abandonActiveEnrolment();
  }
  await clearUpcomingRoutinePlans(user.id);
  return finished ? 'complete' : 'abandoned';
}
