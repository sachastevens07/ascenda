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

export type ContentRoutineOverlay = {
  slug: string;
  who_its_for: string[];
  by_the_end: string[];
  why_this_split: string;
  how_it_works: string[];
  progression_explained: string;
  weekly_structure: string | null;
  phases: ContentPhase[];
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
  return {
    slug,
    who_its_for: asArray(routine.who_its_for).map(text).filter(Boolean),
    by_the_end: asArray(routine.by_the_end).map(text).filter(Boolean),
    why_this_split: text(routine.why_this_split),
    how_it_works: asArray(routine.how_it_works).map(text).filter(Boolean),
    progression_explained: text(routine.progression_explained),
    weekly_structure: text(fine.text) || text(asRecord(summary.avoid).text) || null,
    phases,
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

export function contentSlotFor(day: ContentDay, exerciseId: string, position: number): ContentSlot | null {
  const slug = resolveExerciseSlug(exerciseId);
  return (
    day.exercises.find((item) => item.slug === exerciseId || item.slug === slug) ??
    day.exercises[position - 1] ??
    null
  );
}
