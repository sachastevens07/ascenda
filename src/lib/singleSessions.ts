/**
 * Standalone one-off sessions from content/single-sessions (AGENTS.md X3).
 * Bundled. content:sync reports the file and does not write a table.
 */
import file from '../../content/single-sessions/single-sessions.json';

import { resolveExerciseSlug } from '@/lib/contentGuides';
import { fetchExercisesForBuilder } from '@/lib/customWorkouts';
import {
  confirmFirstSessionSafety,
  isSessionStartCancelled,
  SessionStartCancelled,
} from '@/lib/firstSession';
import { exerciseNameFromSlug } from '@/lib/onboardingAnswers';
import { ensureSubscribed } from '@/lib/paywall';
import type { ProgrammeDay, ProgrammeExercise, SlotExercise } from '@/lib/programmes';
import type { ExerciseRole, ProgressionRule } from '@/lib/routineStandard';
import { fetchActiveSession, startStandaloneSession } from '@/lib/sessions';
import { openLogger, promptActiveSession } from '@/lib/startLogger';
import { saveSessionPlan, sessionPlanFromDay } from '@/lib/workoutLog';

type Json = Record<string, unknown>;

const ROLES = new Set(['main', 'secondary', 'accessory', 'core', 'finisher']);
const RULES = new Set(['load', 'reps', 'time']);

export type SingleSessionCategory =
  | 'start_here'
  | 'quick'
  | 'strength'
  | 'glutes'
  | 'posture'
  | 'arms'
  | 'machines'
  | 'busy_gym'
  | 'core'
  | 'cant_get_to_gym';

export type SingleSession = {
  slug: string;
  name: string;
  subtitle: string;
  type: 'strength' | 'cardio' | 'stretch';
  category: SingleSessionCategory;
  where: 'gym' | 'home';
  estimated_minutes: number;
  focus: string;
  tags: string[];
  display_tags: string[];
  short_description: string;
  coach_note: string;
  cover_image_slug: string;
  reviewed_by: string | null;
  exercises: {
    slug: string;
    role: ExerciseRole | null;
    sets: number;
    rep_min: number;
    rep_max: number;
    rest_seconds: number;
    target_rir: number | null;
    progression_rule: ProgressionRule | null;
    load_increment_kg: number | null;
    notes: string | null;
    tempo: string | null;
  }[];
};

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

function parseCategory(value: string): SingleSessionCategory | null {
  switch (value) {
    case 'start_here':
    case 'quick':
    case 'strength':
    case 'glutes':
    case 'posture':
    case 'arms':
    case 'machines':
    case 'busy_gym':
    case 'core':
    case 'cant_get_to_gym':
      return value;
    default:
      return null;
  }
}

function parseSession(raw: unknown): SingleSession | null {
  const row = asRecord(raw);
  const slug = text(row.slug);
  const name = text(row.name);
  const category = parseCategory(text(row.category));
  if (!slug || !name || !category) return null;
  const typeRaw = text(row.session_type) || text(row.type);
  const type = typeRaw === 'cardio' || typeRaw === 'stretch' ? typeRaw : 'strength';
  const where = text(row.where) === 'home' ? 'home' : 'gym';
  const exercises = asArray(row.exercises).flatMap((item) => {
    const slot = asRecord(item);
    const exerciseSlug = resolveExerciseSlug(text(slot.slug));
    if (!exerciseSlug) return [];
    const role = text(slot.role);
    const rule = text(slot.progression_rule);
    const sets = num(slot.sets) ?? 1;
    const repMin = num(slot.rep_min) ?? num(slot.duration_min_seconds) ?? 8;
    const repMax = num(slot.rep_max) ?? num(slot.duration_max_seconds) ?? repMin;
    return [
      {
        slug: exerciseSlug,
        role: ROLES.has(role) ? (role as ExerciseRole) : null,
        sets,
        rep_min: repMin,
        rep_max: Math.max(repMin, repMax),
        rest_seconds: num(slot.rest_seconds) ?? 90,
        target_rir: num(slot.target_rir),
        progression_rule: RULES.has(rule) ? (rule as ProgressionRule) : null,
        load_increment_kg: num(slot.load_increment_kg),
        notes: text(slot.notes) || null,
        tempo: text(slot.tempo) || null,
      },
    ];
  });
  if (exercises.length === 0) return null;
  return {
    slug,
    name,
    subtitle: text(row.subtitle),
    type,
    category,
    where,
    estimated_minutes: num(row.estimated_minutes) ?? 30,
    focus: text(row.focus),
    tags: asArray(row.display_tags).length > 0
      ? asArray(row.display_tags).map(text).filter(Boolean)
      : asArray(row.tags).map(text).filter(Boolean).slice(0, 2),
    display_tags: asArray(row.display_tags).map(text).filter(Boolean),
    short_description: text(row.short_description),
    coach_note: text(row.coach_note),
    cover_image_slug: text(row.cover_image_slug),
    reviewed_by: text(row.reviewed_by) || null,
    exercises,
  };
}

const SESSIONS = asArray(asRecord(file).single_sessions)
  .map(parseSession)
  .filter((item): item is SingleSession => Boolean(item));

export function listSingleSessions(): SingleSession[] {
  return SESSIONS;
}

export function singleSessionBySlug(slug: string): SingleSession | null {
  return SESSIONS.find((item) => item.slug === slug) ?? null;
}

/** Gym singles for the Programmes carousel. Home-only sessions stay in the backup style. */
export function featuredSingleSessions(): SingleSession[] {
  return SESSIONS.filter((item) => item.where !== 'home');
}

function matchExercise(list: SlotExercise[], slug: string): SlotExercise | null {
  const wanted = resolveExerciseSlug(slug);
  const name = exerciseNameFromSlug(wanted).toLowerCase();
  return (
    list.find((item) => item.id === wanted || item.id === slug) ??
    list.find((item) => item.name.trim().toLowerCase() === name) ??
    null
  );
}

export async function singleSessionToDay(session: SingleSession): Promise<ProgrammeDay> {
  const library = await fetchExercisesForBuilder();
  const exercises: ProgrammeExercise[] = [];
  let position = 1;
  for (const slot of session.exercises) {
    const exercise = matchExercise(library, slot.slug);
    if (!exercise) continue;
    exercises.push({
      position,
      sets: slot.sets,
      rep_min: slot.rep_min,
      rep_max: slot.rep_max,
      rest_seconds: slot.rest_seconds,
      exercise,
      role: slot.role ?? undefined,
      target_rir: slot.target_rir ?? undefined,
      tempo: slot.tempo ?? undefined,
      progression_rule: slot.progression_rule ?? undefined,
      load_increment_kg: slot.load_increment_kg ?? undefined,
      notes: slot.notes ?? undefined,
    });
    position += 1;
  }
  if (exercises.length === 0) {
    throw new Error('This session’s exercises are not in the library yet.');
  }
  return {
    id: session.slug,
    day_number: 1,
    name: session.name,
    exercises,
    focus: session.focus || null,
    coach_note: session.coach_note || null,
  };
}

export async function startSingleSession(slug: string): Promise<void> {
  if (!ensureSubscribed()) throw new SessionStartCancelled();
  const allowed = await confirmFirstSessionSafety();
  if (!allowed) throw new SessionStartCancelled();
  const active = await fetchActiveSession();
  if (active) {
    promptActiveSession(active.id);
    return;
  }
  const session = singleSessionBySlug(slug);
  if (!session) throw new Error('That session is not in the list.');
  const day = await singleSessionToDay(session);
  const row = await startStandaloneSession();
  await saveSessionPlan(row.id, sessionPlanFromDay(day));
  openLogger(row.id);
}

export function describeSingleSessionError(error: unknown): string {
  if (isSessionStartCancelled(error)) return '';
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  return detail || 'Check your connection and try again.';
}
