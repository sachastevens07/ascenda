import { track } from '@/lib/analytics';
import { hydrateImages } from '@/lib/images';
import { userGoalsFromAnswers, type Goal, type QuizAnswers } from '@/lib/profile';
import {
  SLOT_EXERCISE_COLUMNS,
  toSlotExercise,
  type ProgrammeDay,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';
import { contentDayFor, contentRoutine, contentSlotFor } from '@/lib/contentRoutines';
import {
  briefForRoutine,
  coachNoteForDay,
  focusFromDayName,
  phaseForWeek,
  warmupForRoutine,
  withExerciseCoaching,
  type ExerciseRole,
  type ProgressionRule,
  type WarmupStep,
} from '@/lib/routineStandard';
import { parseSessionType, type SessionType } from '@/lib/sessionTypes';
import { supabase } from '@/lib/supabase';

export const WELCOME_BACK_ROUTINE_ID = 'welcome-back-4-week-restart';

export const LAUNCH_ROUTINE_IDS = [
  'strong-foundations-6-weeks',
  'the-two-day-start',
  'busy-gym-no-problem',
  'quick-ascent',
  'the-climb-in-8-weeks',
  'glutes-and-legs-in-8-weeks',
  'upper-body-strong-in-6-weeks',
  'machines-made-easy',
  'strong-and-fit-in-8-weeks',
  'strength-and-stamina',
  'strong-for-life',
  'higher-ground',
  'summit',
  WELCOME_BACK_ROUTINE_ID,
  '30-day-glute-challenge',
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
  audience: string[];
  byTheEnd: string[];
  splitNote: string | null;
  progressionNote: string | null;
  howItWorks: string[];
  weeklyStructure: string | null;
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
  role: ExerciseRole | null;
  target_rir: number | null;
  tempo: string | null;
  progression_rule: ProgressionRule | null;
  load_increment_kg: number | null;
  notes: string | null;
  alternative_exercise_ids: string[];
  superset_group: string | null;
};

export type RoutineDay = {
  id: string;
  day_number: number;
  name: string;
  source_programme_day_id: string | null;
  focus: string | null;
  warmup: WarmupStep[];
  coach_note: string | null;
  finisher: string | null;
  sessionType: SessionType;
  day_key: string | null;
  exercises: RoutineDayExercise[];
};

export type RoutineWeek = {
  id: string;
  week_number: number;
  is_checkpoint: boolean;
  phase_name: string | null;
  phase_goal: string | null;
  is_lighter_week: boolean;
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

/** Short goal word for eyebrows so they stay two tokens (e.g. "Intermediate · Strength"). */
export const ROUTINE_GOAL_EYEBROWS: Record<RoutineGoal, string> = {
  strength: 'Strength',
  glutes_legs: 'Glutes',
  general: 'Stronger',
  confidence: 'Confidence',
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
const N2_ROUTINE_COLUMNS =
  'audience_bullets, by_the_end_bullets, split_note, progression_note';
const SUMMARY_SELECT_BASE = `
  id, name, slug, description, goal, length_weeks, days_per_week, session_minutes,
  difficulty, equipment, is_pro, is_featured_eligible, sort_order, source_programme_id,
  cover:images (${COVER_SELECT}),
  routine_tags (tag)
`;
const SUMMARY_SELECT_N2 = `${SUMMARY_SELECT_BASE}, type, ${N2_ROUTINE_COLUMNS}`;
const SUMMARY_SELECT = `${SUMMARY_SELECT_BASE}, type`;
const DAY_EXERCISE_SELECT_N2 = `
  position, sets, rep_min, rep_max, rest_seconds, duration_seconds,
  role, target_rir, tempo, progression_rule, load_increment_kg, notes,
  alternative_exercise_ids, superset_group,
  exercise:exercises (${SLOT_EXERCISE_COLUMNS})
`;
const DAY_EXERCISE_SELECT = `
  position, sets, rep_min, rep_max, rest_seconds, duration_seconds,
  exercise:exercises (${SLOT_EXERCISE_COLUMNS})
`;
const DAY_EXERCISE_SELECT_LEGACY = `
  position, sets, rep_min, rep_max, rest_seconds,
  exercise:exercises (${SLOT_EXERCISE_COLUMNS})
`;
const WEEK_NEST_W1 = `
    id, week_number, is_checkpoint, phase_name, phase_goal, is_lighter_week,
    routine_days (
      id, day_number, name, source_programme_day_id, focus, warmup, coach_note, finisher, type, day_key
    )
`;
const WEEK_NEST_N2 = `
    id, week_number, is_checkpoint, phase_name, phase_goal, is_lighter_week,
    routine_days (
      id, day_number, name, source_programme_day_id, focus, warmup, coach_note, finisher
    )
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
const EXERCISE_QUERY_SELECT_N2 = `
  routine_day_id,
  position, sets, rep_min, rep_max, rest_seconds, duration_seconds,
  role, target_rir, tempo, progression_rule, load_increment_kg, notes,
  alternative_exercise_ids, superset_group,
  exercise:exercises (${SLOT_EXERCISE_COLUMNS})
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

export type SummaryRow = Omit<
  RoutineSummary,
  'cover' | 'tags' | 'audience' | 'byTheEnd' | 'splitNote' | 'progressionNote' | 'howItWorks' | 'weeklyStructure'
> & {
  cover: CoverRow;
  routine_tags: TagRow[] | null;
  audience_bullets?: string[] | null;
  by_the_end_bullets?: string[] | null;
  split_note?: string | null;
  progression_note?: string | null;
};

type DayRow = Omit<RoutineDay, 'exercises' | 'warmup' | 'sessionType' | 'day_key'> & {
  warmup?: unknown;
  type?: string | null;
  day_key?: string | null;
  routine_day_exercises?: (Omit<RoutineDayExercise, 'exercise'> & { exercise: SlotExercise })[] | null;
};

type ExerciseQueryRow = Omit<RoutineDayExercise, 'exercise'> & {
  routine_day_id: string;
  exercise: SlotExercise;
};

export type FetchRoutineOptions = {
  /** Kept so call sites compile. Weeks are no longer preview-locked. */
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
  const type = row.type === 'stretch' ? 'stretch' : 'strength';
  const overlay = type === 'strength' ? contentRoutine(row.slug) ?? contentRoutine(row.id) : null;
  const brief = type === 'strength' ? briefForRoutine(row.id, row.difficulty, row.slug) : null;
  const audience = (row.audience_bullets ?? []).filter(Boolean);
  const byTheEnd = (row.by_the_end_bullets ?? []).filter(Boolean);
  return {
    id: row.id,
    name: displayRoutineName(row.id, row.name, row.equipment),
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
    type,
    tags: (row.routine_tags ?? []).map((item) => item.tag),
    audience: audience.length > 0 ? audience : (overlay?.who_its_for ?? brief?.audience ?? []),
    byTheEnd: byTheEnd.length > 0 ? byTheEnd : (overlay?.by_the_end ?? brief?.byTheEnd ?? []),
    splitNote: row.split_note?.trim() || overlay?.why_this_split || brief?.splitNote || null,
    progressionNote: row.progression_note?.trim() || overlay?.progression_explained || brief?.progressionNote || null,
    howItWorks: overlay?.how_it_works ?? [],
    weeklyStructure: overlay?.weekly_structure ?? null,
  };
}

function parseWarmup(value: unknown): WarmupStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((step) => {
    if (!step || typeof step !== 'object' || typeof (step as WarmupStep).text !== 'string') return [];
    const text = (step as WarmupStep).text.trim();
    if (!text) return [];
    const seconds = typeof (step as WarmupStep).seconds === 'number' ? (step as WarmupStep).seconds : undefined;
    const reps = typeof (step as WarmupStep).reps === 'number' ? (step as WarmupStep).reps : undefined;
    return [{ text, seconds, reps }];
  });
}

function overlayExercises(
  exercises: RoutineDayExercise[],
  routine: Pick<RoutineSummary, 'id' | 'slug' | 'type'> | undefined,
  weekNumber: number,
  day: { name: string; day_key?: string | null }
): RoutineDayExercise[] {
  if (!routine || routine.type === 'stretch') return exercises;
  const overlay = contentRoutine(routine.slug) ?? contentRoutine(routine.id);
  if (!overlay) return exercises;
  const contentDay = contentDayFor(overlay, weekNumber, day);
  if (!contentDay) return exercises;
  return exercises.map((item) => {
    const slot = contentSlotFor(contentDay, item.exercise.id, item.position);
    if (!slot) return item;
    return {
      ...item,
      role: item.role ?? slot.role,
      target_rir: item.target_rir ?? slot.target_rir,
      tempo: item.tempo ?? slot.tempo,
      progression_rule: item.progression_rule ?? slot.progression_rule,
      load_increment_kg: item.load_increment_kg ?? slot.load_increment_kg,
      notes: item.notes ?? slot.notes,
      alternative_exercise_ids:
        item.alternative_exercise_ids.length > 0 ? item.alternative_exercise_ids : slot.alternatives,
    };
  });
}

function toDay(
  row: DayRow,
  routine?: Pick<RoutineSummary, 'id' | 'slug' | 'difficulty' | 'equipment' | 'type'>,
  weekNumber = 1
): RoutineDay {
  const strength = !routine || routine.type !== 'stretch';
  const difficulty = routine?.difficulty ?? 'beginner';
  const warmup = parseWarmup(row.warmup);
  const overlay = routine && strength ? contentRoutine(routine.slug) ?? contentRoutine(routine.id) : null;
  const contentDay = overlay ? contentDayFor(overlay, weekNumber, row) : null;
  const exercises = overlayExercises(
    [...(row.routine_day_exercises ?? [])].sort((a, b) => a.position - b.position).map((item) => toDayExercise(item)),
    routine,
    weekNumber,
    row
  );
  const coached =
    strength
      ? exercises.map((item) => withExerciseCoaching(item, exercises.length, difficulty))
      : exercises;
  return {
    id: row.id,
    day_number: row.day_number,
    name: row.name,
    source_programme_day_id: row.source_programme_day_id,
    focus: row.focus?.trim() || contentDay?.focus || (strength ? focusFromDayName(row.name) : null),
    warmup:
      warmup.length > 0 ? warmup : strength ? warmupForRoutine(routine?.id ?? '', routine?.equipment ?? 'full_gym') : [],
    coach_note:
      row.coach_note?.trim() || contentDay?.coach_note || (strength ? coachNoteForDay(row.name, difficulty) : null),
    finisher: row.finisher?.trim() || null,
    sessionType: parseSessionType(row.type, strength ? 'strength' : 'recovery'),
    day_key: row.day_key?.trim() || null,
    exercises: coached,
  };
}

function toRoutine(row: DetailRow): Routine {
  const summary = toSummary(row);
  return {
    ...summary,
    weeks: [...(row.routine_weeks ?? [])]
      .sort((a, b) => a.week_number - b.week_number)
      .map((week) => {
        const phase =
          summary.type === 'strength'
            ? phaseForWeek(summary.id, summary.length_weeks, week.week_number, summary.slug)
            : null;
        return {
          id: week.id,
          week_number: week.week_number,
          is_checkpoint: Boolean(week.is_checkpoint),
          phase_name: week.phase_name?.trim() || phase?.name || null,
          phase_goal: week.phase_goal?.trim() || phase?.goal || null,
          is_lighter_week: Boolean(week.is_lighter_week) || Boolean(phase?.lighter),
          days: [...(week.routine_days ?? [])]
            .sort((a, b) => a.day_number - b.day_number)
            .map((day) => toDay(day, summary, week.week_number)),
        };
      }),
  };
}

export function isRoutineWeekLocked(
  _routine: Pick<RoutineSummary, 'is_pro'>,
  _weekNumber: number,
  _isPro: boolean
): boolean {
  return false;
}

function dayIdsForPreview(routine: Routine): string[] {
  return routine.weeks.flatMap((week) => week.days.map((day) => day.id));
}

function toDayExercise(
  item: Omit<RoutineDayExercise, 'exercise'> & { exercise: SlotExercise }
): RoutineDayExercise {
  return {
    position: item.position,
    sets: item.sets,
    rep_min: item.rep_min,
    rep_max: item.rep_max,
    rest_seconds: item.rest_seconds,
    duration_seconds: item.duration_seconds ?? null,
    exercise: toSlotExercise(item.exercise),
    role: item.role ?? null,
    target_rir: item.target_rir ?? null,
    tempo: item.tempo ?? null,
    progression_rule: item.progression_rule ?? (item.duration_seconds ? 'time' : null),
    load_increment_kg: item.load_increment_kg ?? null,
    notes: item.notes ?? null,
    alternative_exercise_ids: item.alternative_exercise_ids ?? [],
    superset_group: item.superset_group ?? null,
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

function isMissingN2Column(error: { message?: string; code?: string }): boolean {
  return /audience_bullets|by_the_end_bullets|split_note|progression_note|phase_name|phase_goal|is_lighter_week|coach_note|warmup|target_rir|progression_rule|load_increment_kg|alternative_exercise_ids|superset_group|\brole\b|\btempo\b|\bfocus\b|\bfinisher\b|\bnotes\b/i.test(
    `${error.code ?? ''} ${error.message ?? ''}`
  );
}

function isMissingW1Column(error: { message?: string; code?: string }): boolean {
  return /day_key|routine_days\.type|Could not find the 'type' column of 'routine_days'/i.test(
    `${error.code ?? ''} ${error.message ?? ''}`
  );
}

async function fetchExercisesForDays(dayIds: string[]): Promise<Map<string, RoutineDayExercise[]>> {
  const byDay = new Map<string, RoutineDayExercise[]>();
  if (dayIds.length === 0) return byDay;
  let { data, error } = await supabase
    .from('routine_day_exercises')
    .select(EXERCISE_QUERY_SELECT_N2)
    .in('routine_day_id', dayIds);
  if (error && isMissingN2Column(error)) {
    const retry = await supabase
      .from('routine_day_exercises')
      .select(EXERCISE_QUERY_SELECT)
      .in('routine_day_id', dayIds);
    data = retry.data as typeof data;
    error = retry.error;
  }
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
      days: week.days.map((day) => {
        const exercises = overlayExercises(
          byDay.get(day.id) ?? day.exercises,
          routine,
          week.week_number,
          day
        );
        const coached =
          routine.type === 'strength'
            ? exercises.map((item) => withExerciseCoaching(item, exercises.length, routine.difficulty))
            : exercises;
        return { ...day, exercises: coached };
      }),
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
  phaseName?: string | null;
  phaseGoal?: string | null;
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

/** Collapse consecutive weeks that share a phase name, else the same workouts. */
export function groupRoutinePhases(weeks: RoutineWeek[]): RoutinePhase[] {
  const phases: RoutinePhase[] = [];
  for (const week of weeks) {
    const last = phases[phases.length - 1];
    const sameName = Boolean(week.phase_name) && last?.phaseName === week.phase_name;
    const sameWork = !week.phase_name && last && weekFingerprint(last.days) === weekFingerprint(week.days);
    if (last && (sameName || sameWork)) {
      last.toWeek = week.week_number;
    } else {
      phases.push({
        fromWeek: week.week_number,
        toWeek: week.week_number,
        days: week.days,
        phaseName: week.phase_name,
        phaseGoal: week.phase_goal,
      });
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

function routineGoalsForUserGoal(goal: Goal): RoutineGoal[] {
  switch (goal) {
    case 'glutes_and_legs':
      return ['glutes_legs'];
    case 'gym_confidence':
    case 'back_to_training':
      return ['confidence'];
    case 'build_strength':
    case 'build_muscle':
    case 'upper_body_strength':
    case 'strong_for_life':
    case 'feel_toned':
    case 'lose_body_fat':
      return ['strength'];
    default:
      return ['general'];
  }
}

function scoreUserGoals(routine: RoutineSummary, answers: QuizAnswers): number {
  const goals = userGoalsFromAnswers(answers);
  let score = 0;
  goals.forEach((goal, index) => {
    const weight = index === 0 ? 4 : index === 1 ? 2 : 1;
    if (routineGoalsForUserGoal(goal).includes(routine.goal)) score += weight;
  });
  return score;
}

export const GYM_BACKUP_ROUTINE_NAME = "Days you can't get to the gym";

function displayRoutineName(id: string, name: string, equipment?: RoutineEquipment): string {
  if (isGymBackupRoutine({ id, name, equipment: equipment ?? 'full_gym', type: 'strength' })) {
    return GYM_BACKUP_ROUTINE_NAME;
  }
  return name;
}

/** Backup plans for days she cannot get to the gym. Never featured on Home. */
export function isGymBackupRoutine(
  routine: Pick<RoutineSummary, 'id' | 'name' | 'equipment' | 'type'>
): boolean {
  if (routine.type === 'stretch') return false;
  if (routine.equipment === 'home') return true;
  if (routine.id === 'home-strength-6') return true;
  const name = routine.name.trim().toLowerCase();
  return name === 'home strength' || name === GYM_BACKUP_ROUTINE_NAME.toLowerCase();
}

/** Ease-back plan after time away. Offered from Home, never in Featured. */
export function isWelcomeBackRoutine(routine: Pick<RoutineSummary, 'id' | 'slug'>): boolean {
  return routine.id === WELCOME_BACK_ROUTINE_ID || routine.slug === WELCOME_BACK_ROUTINE_ID;
}

function scoreRoutine(routine: RoutineSummary, answers: QuizAnswers): number {
  let score = 0;
  if (isGymBackupRoutine(routine)) score -= 8;
  if (routine.equipment === answers.equipment && !isGymBackupRoutine(routine)) score += 5;
  else if (answers.equipment === 'full_gym') score += 2;
  else if (answers.equipment === 'dumbbells' && routine.equipment === 'full_gym') score += 1;

  const dayGap = Math.abs(routine.days_per_week - answers.days_per_week);
  if (dayGap === 0) score += 6;
  else if (dayGap === 1) score += 1;

  score += scoreUserGoals(routine, answers);
  if (routine.goal === 'confidence' && answers.confidence <= 2) score += 4;
  if (
    (answers.gym_experience === 'not_yet' || answers.gym_experience === 'just_started') &&
    routine.goal === 'confidence'
  ) {
    score += 4;
  }
  if (
    (answers.gym_experience === 'not_yet' || answers.gym_experience === 'just_started') &&
    routine.difficulty === 'beginner'
  ) {
    score += 3;
  }
  if (answers.gym_experience === 'on_and_off' && routine.difficulty !== 'experienced') score += 2;
  if (answers.gym_experience === 'regularly' && routine.difficulty !== 'beginner') score += 3;

  if (answers.experience === 'new' && routine.difficulty === 'beginner') score += 3;
  if (answers.experience === 'some' && routine.difficulty !== 'experienced') score += 2;
  if (answers.experience === 'confident' && routine.difficulty !== 'beginner') score += 2;

  if (answers.confidence <= 2 && routine.tags.includes('one spot')) {
    score += 2;
  }
  if (answers.equipment === 'full_gym' && routine.tags.includes('busy gym friendly')) score += 1;
  if (
    (routine.id === 'strong-foundations-6-weeks' || routine.id === 'gym-confidence-6') &&
    dayGap === 0 &&
    (answers.experience === 'new' || answers.confidence <= 2)
  ) {
    score += 3;
  }
  return score;
}

function replaceFeaturedSlot(picked: RoutineSummary[], candidate: RoutineSummary | undefined): void {
  if (!candidate || picked.some((routine) => routine.id === candidate.id)) return;
  picked[picked.length - 1] = candidate;
}

/** 3–5 featured cards, tailored to her quiz. */
export function pickFeaturedRoutines(
  routines: RoutineSummary[],
  answers: QuizAnswers,
  count = 4,
  options?: { excludeIds?: string[] }
): RoutineSummary[] {
  const excluded = new Set(options?.excludeIds ?? []);
  const strength = routines.filter(
    (routine) =>
      routine.type !== 'stretch' &&
      !excluded.has(routine.id) &&
      !isGymBackupRoutine(routine) &&
      !isWelcomeBackRoutine(routine)
  );
  const eligible = strength.filter((routine) => routine.is_featured_eligible);
  const rankedSource = eligible.length > 0 ? eligible : strength;
  const ranked = [...rankedSource].sort((a, b) => {
    const gap = scoreRoutine(b, answers) - scoreRoutine(a, answers);
    return gap !== 0 ? gap : a.sort_order - b.sort_order;
  });
  const size = Math.min(5, Math.max(3, Math.min(count, ranked.length)));
  const picked = ranked.slice(0, size);
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
    focus: day.focus,
    warmup: day.warmup,
    coach_note: day.coach_note,
    finisher: day.finisher,
    exercises: day.exercises.map(
      (item): ProgrammeExercise => ({
        position: item.position,
        sets: item.sets,
        rep_min: item.rep_min,
        rep_max: item.rep_max,
        rest_seconds: item.rest_seconds,
        exercise: item.exercise,
        role: item.role ?? undefined,
        target_rir: item.target_rir ?? undefined,
        tempo: item.tempo ?? undefined,
        progression_rule: item.progression_rule ?? undefined,
        load_increment_kg: item.load_increment_kg ?? undefined,
        notes: item.notes ?? undefined,
        alternative_exercise_ids: item.alternative_exercise_ids,
      })
    ),
  };
}

export async function fetchRoutines(options?: { type?: RoutineType }): Promise<RoutineSummary[]> {
  await hydrateImages();
  const wanted = options?.type;
  const attempts = [SUMMARY_SELECT_N2, SUMMARY_SELECT, SUMMARY_SELECT_BASE];
  let rows: SummaryRow[] | null = null;
  for (const select of attempts) {
    const result = await supabase.from('routines').select(select).order('sort_order', { ascending: true });
    if (!result.error) {
      rows = (result.data ?? []) as unknown as SummaryRow[];
      break;
    }
    if (isMissingRoutines(result.error)) return [];
    if (!isMissingTypeColumn(result.error) && !isMissingN2Column(result.error)) {
      throw new Error(result.error.message);
    }
  }
  if (!rows) return [];
  const list = uniqueById(rows.map(toSummary));
  if (wanted === 'stretch' && !rows.some((row) => row.type === 'stretch')) return [];
  if (!wanted) return list.filter((routine) => routine.type !== 'stretch');
  return list.filter((routine) => routine.type === wanted);
}

export async function fetchRoutine(
  id: string,
  _options?: FetchRoutineOptions
): Promise<Routine | null> {
  await hydrateImages();
  const attempts = [
    `${SUMMARY_SELECT_N2}, routine_weeks (${WEEK_NEST_W1})`,
    `${SUMMARY_SELECT_N2}, routine_weeks (${WEEK_NEST_N2})`,
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
    if (
      !isMissingTypeColumn(error) &&
      !isMissingCheckpointColumn(error) &&
      !isMissingN2Column(error) &&
      !isMissingW1Column(error)
    ) {
      throw new Error(error.message);
    }
  }
  if (error) throw new Error(error.message);
  if (!data) return null;
  const routine = toRoutine(data as DetailRow);
  const byDay = await fetchExercisesForDays(dayIdsForPreview(routine));
  return withDayExercises(routine, byDay);
}

type DayParentRoutine = Pick<RoutineSummary, 'id' | 'slug' | 'difficulty' | 'equipment' | 'type'> & {
  week_number: number;
};

type DayFetchRow = DayRow & {
  week?: {
    week_number?: number | null;
    routine?: {
      id: string;
      slug?: string | null;
      difficulty: RoutineDifficulty;
      equipment: RoutineEquipment;
      type?: RoutineType | null;
    } | null;
  } | null;
};

const DAY_PARENT_SELECT =
  'week:routine_weeks ( week_number, routine:routines (id, slug, difficulty, equipment, type) )';
const DAY_PARENT_SELECT_BASE =
  'week:routine_weeks ( week_number, routine:routines (id, slug, difficulty, equipment) )';

function parentFromDayRow(row: DayFetchRow): DayParentRoutine | undefined {
  const routine = row.week?.routine;
  if (!routine?.id) return undefined;
  return {
    id: routine.id,
    slug: routine.slug ?? routine.id,
    difficulty: routine.difficulty,
    equipment: routine.equipment,
    type: routine.type === 'stretch' ? 'stretch' : 'strength',
    week_number: row.week?.week_number ?? 1,
  };
}

export async function fetchRoutineDay(id: string): Promise<RoutineDay | null> {
  let { data, error } = await supabase
    .from('routine_days')
    .select(
      `id, day_number, name, source_programme_day_id, focus, warmup, coach_note, finisher, type, day_key, ${DAY_PARENT_SELECT}, routine_day_exercises (${DAY_EXERCISE_SELECT_N2})`
    )
    .eq('id', id)
    .maybeSingle();
  if (
    error &&
    (isMissingN2Column(error) ||
      isMissingDurationColumn(error) ||
      isMissingTypeColumn(error) ||
      isMissingW1Column(error))
  ) {
    const retry = await supabase
      .from('routine_days')
      .select(
        `id, day_number, name, source_programme_day_id, ${DAY_PARENT_SELECT_BASE}, routine_day_exercises (${DAY_EXERCISE_SELECT})`
      )
      .eq('id', id)
      .maybeSingle();
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error && isMissingDurationColumn(error)) {
    const retry = await supabase
      .from('routine_days')
      .select(
        `id, day_number, name, source_programme_day_id, ${DAY_PARENT_SELECT_BASE}, routine_day_exercises (${DAY_EXERCISE_SELECT_LEGACY})`
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
  if (!data) return null;
  const row = data as unknown as DayFetchRow;
  const parent = parentFromDayRow(row);
  return toDay(row, parent, parent?.week_number ?? 1);
}

const ENROLMENT_SELECT_N2 = `id, user_id, routine_id, start_date, status, completed_at, routine:routines (${SUMMARY_SELECT_N2})`;
const ENROLMENT_SELECT = `id, user_id, routine_id, start_date, status, completed_at, routine:routines (${SUMMARY_SELECT})`;
const ENROLMENT_SELECT_BASE = `id, user_id, routine_id, start_date, status, completed_at, routine:routines (${SUMMARY_SELECT_BASE})`;

async function selectEnrolment(
  run: (columns: string) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>
): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> {
  for (const columns of [ENROLMENT_SELECT_N2, ENROLMENT_SELECT, ENROLMENT_SELECT_BASE]) {
    const result = await run(columns);
    if (!result.error) return result;
    if (!isMissingTypeColumn(result.error) && !isMissingN2Column(result.error)) return result;
  }
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

export async function startRoutine(
  routineId: string,
  options?: { startDate?: string }
): Promise<RoutineEnrolment> {
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

  const today = todayDate();
  const requested = options?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(options.startDate) ? options.startDate : today;
  const startDate = requested >= today ? requested : today;

  const { error } = await supabase.from('routine_enrolments').insert({
    user_id: user.id,
    routine_id: routineId,
    start_date: startDate,
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

/** Most recently finished enrolment, for the week-6 hand-off when she has no active plan. */
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await clearUpcomingRoutinePlans(user.id);
  track('routine_completed', { routine_id: enrolment.routine_id });
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

/**
 * Moves the enrolment clock so she is on `weekNumber` this week.
 * Used by welcome-back to restart the week she left, instead of skipping ahead.
 * Upcoming planned sessions from this routine are cleared so the planner can refill.
 */
export async function resetEnrolmentToWeek(enrolmentId: string, weekNumber: number): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  const week = Math.max(1, Math.floor(weekNumber));
  const start = parseDate(todayDate());
  start.setDate(start.getDate() - (week - 1) * 7);
  const { error } = await supabase
    .from('routine_enrolments')
    .update({ start_date: todayDate(start) })
    .eq('id', enrolmentId)
    .eq('user_id', user.id)
    .eq('status', 'active');
  if (error) {
    if (isMissingRoutines(error)) throw new Error(missingRoutinesMessage());
    throw new Error(error.message);
  }
  await clearUpcomingRoutinePlans(user.id);
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
