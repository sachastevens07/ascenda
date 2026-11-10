/**
 * Routine-standard copy from /content. Bundled so detail pages and the logger
 * can fill empty database fields without rewriting enrolments or history.
 */
import busyGym from '../../content/routines/busy-gym-no-problem.json';
import gluteChallenge from '../../content/routines/30-day-glute-challenge.json';
import glutesAndLegs from '../../content/routines/glutes-and-legs-in-8-weeks.json';
import higherGround from '../../content/routines/higher-ground.json';
import machinesMadeEasy from '../../content/routines/machines-made-easy.json';
import quickAscent from '../../content/routines/quick-ascent.json';
import strengthAndStamina from '../../content/routines/strength-and-stamina.json';
import strongAndFit from '../../content/routines/strong-and-fit-in-8-weeks.json';
import strongFoundations from '../../content/routines/strong-foundations-6-weeks.json';
import strongForLife from '../../content/routines/strong-for-life.json';
import summit from '../../content/routines/summit.json';
import theClimb from '../../content/routines/the-climb-in-8-weeks.json';
import theTwoDayStart from '../../content/routines/the-two-day-start.json';
import upperBodyStrong from '../../content/routines/upper-body-strong-in-6-weeks.json';
import welcomeBack from '../../content/routines/welcome-back-4-week-restart.json';

import { preferredSwapIds, resolveExerciseSlug } from '@/lib/contentGuides';
import {
  CARDIO_PREFERENCES,
  WEEKDAYS,
  type CardioPreference,
  type Weekday,
} from '@/lib/onboardingAnswers';

export type ContentSlot = {
  slug: string;
  role: 'main' | 'secondary' | 'accessory' | 'core' | 'finisher' | null;
  target_rir: number | null;
  tempo: string | null;
  progression_rule: 'load' | 'reps' | 'time' | null;
  load_increment_kg: number | null;
  notes: string | null;
  alternatives: string[];
};

export type ContentDay = {
  key: string;
  name: string;
  focus: string;
  coach_note: string;
  exercises: ContentSlot[];
};

export type ContentPhase = {
  number: number;
  name: string;
  goal: string;
  weeks: number[];
  days: ContentDay[];
};

export type ContentPlanMilestone = {
  week: number;
  title: string;
  description: string;
};

export type ContentSupportWeek = {
  weeks: number[];
  cardio_session: string | null;
  stretch_routine: string | null;
};

export type ContentSupportDay = {
  key: string;
  type: 'cardio' | 'recovery';
  name: string;
  by_week: ContentSupportWeek[];
};

export type ContentScheduleSlot = {
  weekday: Weekday;
  type: 'strength' | 'cardio' | 'recovery' | 'rest';
  day_key: string | null;
  support_key: string | null;
  optional: boolean;
  finisher: string | null;
  finisher_skip_weeks: number[];
};

export type ContentRoutineOverlay = {
  slug: string;
  name: string;
  subtitle: string;
  goal: string;
  secondary_goals: string[];
  length_weeks: number;
  days_per_week: number;
  session_minutes: number;
  cardio_balanced: boolean;
  schedule_label: string | null;
  plan_reveal_milestones: ContentPlanMilestone[];
  checkpoint_lifts: string[];
  lighter_weeks: number[];
  who_its_for: string[];
  by_the_end: string[];
  why_this_split: string;
  how_it_works: string[];
  progression_explained: string;
  weekly_structure: string | null;
  weekly_structure_by_preference: Partial<Record<CardioPreference, string>>;
  support_days: ContentSupportDay[];
  weekly_schedule: Partial<Record<CardioPreference, ContentScheduleSlot[]>>;
  phases: ContentPhase[];
  next_routine_suggestions: string[];
};

type Json = Record<string, unknown>;

const ROLES = new Set(['main', 'secondary', 'accessory', 'core', 'finisher']);
const RULES = new Set(['load', 'reps', 'time']);

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
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roleOf(value: unknown): ContentSlot['role'] {
  const role = text(value);
  return ROLES.has(role) ? (role as ContentSlot['role']) : null;
}

function ruleOf(value: unknown): ContentSlot['progression_rule'] {
  const rule = text(value);
  return RULES.has(rule) ? (rule as ContentSlot['progression_rule']) : null;
}

function parseSlot(raw: unknown): ContentSlot | null {
  const item = asRecord(raw);
  const slug = resolveExerciseSlug(text(item.slug));
  if (!slug) return null;
  const listed = asArray(item.alternatives).map((value) => resolveExerciseSlug(String(value)));
  return {
    slug,
    role: roleOf(item.role),
    target_rir: num(item.target_rir),
    tempo: text(item.tempo) || null,
    progression_rule: ruleOf(item.progression_rule),
    load_increment_kg: num(item.load_increment_kg),
    notes: text(item.notes) || null,
    alternatives: preferredSwapIds(slug, listed),
  };
}

function parseWeekday(value: unknown): Weekday | null {
  const day = text(value);
  return (WEEKDAYS as readonly string[]).includes(day) ? (day as Weekday) : null;
}

function parseScheduleType(value: unknown): ContentScheduleSlot['type'] | null {
  const type = text(value);
  if (type === 'strength' || type === 'cardio' || type === 'recovery' || type === 'rest') return type;
  return null;
}

function parseSupportDay(raw: unknown): ContentSupportDay | null {
  const item = asRecord(raw);
  const key = text(item.key);
  const type = text(item.type);
  if (!key || (type !== 'cardio' && type !== 'recovery')) return null;
  return {
    key,
    type,
    name: text(item.name) || key,
    by_week: asArray(item.by_week).flatMap((entry) => {
      const row = asRecord(entry);
      const weeks = asArray(row.weeks)
        .map((value) => num(value))
        .filter((value): value is number => value != null);
      if (weeks.length === 0) return [];
      return [
        {
          weeks,
          cardio_session: text(row.cardio_session) || null,
          stretch_routine: text(row.stretch_routine) || null,
        },
      ];
    }),
  };
}

function parseScheduleSlot(raw: unknown): ContentScheduleSlot | null {
  const item = asRecord(raw);
  const weekday = parseWeekday(item.weekday);
  const type = parseScheduleType(item.type);
  if (!weekday || !type) return null;
  return {
    weekday,
    type,
    day_key: text(item.day_key) || null,
    support_key: text(item.support_key) || null,
    optional: item.optional === true,
    finisher: text(item.finisher) || null,
    finisher_skip_weeks: asArray(item.finisher_skip_weeks)
      .map((value) => num(value))
      .filter((value): value is number => value != null),
  };
}

function parseWeeklySchedule(raw: unknown): Partial<Record<CardioPreference, ContentScheduleSlot[]>> {
  const body = asRecord(raw);
  const schedule: Partial<Record<CardioPreference, ContentScheduleSlot[]>> = {};
  for (const key of CARDIO_PREFERENCES) {
    const slots = asArray(body[key])
      .map(parseScheduleSlot)
      .filter((item): item is ContentScheduleSlot => Boolean(item));
    if (slots.length > 0) schedule[key] = slots;
  }
  return schedule;
}

function parseDay(raw: unknown): ContentDay | null {
  const day = asRecord(raw);
  const name = text(day.name);
  if (!name) return null;
  return {
    key: text(day.key),
    name,
    focus: text(day.focus),
    coach_note: text(day.coach_note),
    exercises: asArray(day.exercises).map(parseSlot).filter((item): item is ContentSlot => Boolean(item)),
  };
}

function parseOverlay(file: unknown): ContentRoutineOverlay | null {
  const body = asRecord(file);
  const routine = asRecord(body.routine);
  const slug = text(routine.slug);
  if (!slug) return null;
  const summary = asRecord(routine.weekly_structure_summary);
  const fine = asRecord(summary.fine);
  const weekly_structure_by_preference: Partial<Record<CardioPreference, string>> = {};
  for (const key of CARDIO_PREFERENCES) {
    const line = text(asRecord(summary[key]).text);
    if (line) weekly_structure_by_preference[key] = line;
  }
  const phases = asArray(body.phases).flatMap((raw) => {
    const phase = asRecord(raw);
    const name = text(phase.name);
    const weeks = asArray(phase.weeks)
      .map((value) => num(value))
      .filter((value): value is number => value != null);
    if (!name) return [];
    return [
      {
        number: num(phase.number) ?? 0,
        name,
        goal: text(phase.goal),
        weeks,
        days: asArray(phase.days).map(parseDay).filter((item): item is ContentDay => Boolean(item)),
      },
    ];
  });
  const milestones = asArray(routine.plan_reveal_milestones).flatMap((raw) => {
    const item = asRecord(raw);
    const week = num(item.week);
    const title = text(item.title);
    if (week == null || !title) return [];
    return [{ week, title, description: text(item.description) }];
  });
  const lighter_weeks = asArray(body.weeks).flatMap((raw) => {
    const item = asRecord(raw);
    if (item.is_lighter_week !== true) return [];
    const week = num(item.week);
    return week == null ? [] : [week];
  });
  return {
    slug,
    name: text(routine.name),
    subtitle: text(routine.subtitle),
    goal: text(routine.goal),
    secondary_goals: asArray(routine.secondary_goals).map(text).filter(Boolean),
    length_weeks: num(routine.length_weeks) ?? 0,
    days_per_week: num(routine.days_per_week) ?? 0,
    session_minutes: num(routine.session_minutes) ?? 0,
    cardio_balanced: routine.cardio_balanced === true,
    schedule_label: text(routine.schedule_label) || null,
    plan_reveal_milestones: milestones,
    checkpoint_lifts: asArray(routine.checkpoint_lifts).map((value) => resolveExerciseSlug(String(value))),
    lighter_weeks,
    who_its_for: asArray(routine.who_its_for).map(text).filter(Boolean),
    by_the_end: asArray(routine.by_the_end).map(text).filter(Boolean),
    why_this_split: text(routine.why_this_split),
    how_it_works: asArray(routine.how_it_works).map(text).filter(Boolean),
    progression_explained: text(routine.progression_explained),
    weekly_structure:
      text(fine.text) ||
      text(asRecord(summary.avoid).text) ||
      text(asRecord(summary.love).text) ||
      null,
    weekly_structure_by_preference,
    support_days: asArray(body.support_days)
      .map(parseSupportDay)
      .filter((item): item is ContentSupportDay => Boolean(item)),
    weekly_schedule: parseWeeklySchedule(body.weekly_schedule),
    phases,
    next_routine_suggestions: asArray(routine.next_routine_suggestions)
      .map((value) => text(value))
      .filter(Boolean),
  };
}

const BY_SLUG = new Map<string, ContentRoutineOverlay>();
for (const file of [
  strongFoundations,
  theTwoDayStart,
  busyGym,
  quickAscent,
  theClimb,
  glutesAndLegs,
  upperBodyStrong,
  machinesMadeEasy,
  strongAndFit,
  strengthAndStamina,
  strongForLife,
  higherGround,
  summit,
  welcomeBack,
  gluteChallenge,
]) {
  const overlay = parseOverlay(file);
  if (overlay) BY_SLUG.set(overlay.slug, overlay);
}

export function contentRoutine(slugOrId: string): ContentRoutineOverlay | null {
  return BY_SLUG.get(slugOrId) ?? null;
}

export function contentPhaseForWeek(overlay: ContentRoutineOverlay, weekNumber: number): ContentPhase | null {
  return overlay.phases.find((phase) => phase.weeks.includes(weekNumber)) ?? null;
}

export function contentDayFor(
  overlay: ContentRoutineOverlay,
  weekNumber: number,
  day: { name: string; day_key?: string | null }
): ContentDay | null {
  const phase = contentPhaseForWeek(overlay, weekNumber);
  const days = phase?.days ?? overlay.phases.flatMap((item) => item.days);
  const key = day.day_key?.trim() ?? '';
  if (key) {
    const byKey = days.find((item) => item.key === key);
    if (byKey) return byKey;
  }
  const name = day.name.trim().toLowerCase();
  return days.find((item) => item.name.toLowerCase() === name) ?? null;
}

/** Card tag: strength days, or the full required week on cardio-balanced routines. */
export function advertisedDaysPerWeek(
  overlay: ContentRoutineOverlay | null | undefined,
  fallback = 3
): number {
  if (!overlay) return fallback;
  if (!overlay.cardio_balanced) return overlay.days_per_week || fallback;
  const template =
    overlay.weekly_schedule.fine ?? overlay.weekly_schedule.love ?? overlay.weekly_schedule.avoid ?? [];
  const required = template.filter((slot) => slot.type !== 'rest' && !slot.optional).length;
  return required || overlay.days_per_week || fallback;
}

export function routineCardDays(routine: { slug: string; id?: string; days_per_week: number }): number {
  return advertisedDaysPerWeek(
    contentRoutine(routine.slug) ?? (routine.id ? contentRoutine(routine.id) : null),
    routine.days_per_week
  );
}

export function contentWeeklyStructure(
  overlay: ContentRoutineOverlay,
  preference: CardioPreference | null | undefined
): string | null {
  if (overlay.cardio_balanced) {
    return overlay.weekly_structure;
  }
  const key = preference && overlay.weekly_structure_by_preference[preference] ? preference : null;
  return (key ? overlay.weekly_structure_by_preference[key] : null) ?? overlay.weekly_structure;
}

export function contentSlotFor(day: ContentDay, exerciseId: string, position: number): ContentSlot | null {
  const slug = resolveExerciseSlug(exerciseId);
  return (
    day.exercises.find((item) => item.slug === exerciseId || item.slug === slug) ??
    day.exercises[position - 1] ??
    null
  );
}
