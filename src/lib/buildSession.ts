/**
 * AI3 Build me a session. Eligible lists, time check and single-session fallback.
 * Never invents exercises. Suggested weights still come from the progression rule.
 */
import catalogueFile from '../../content/exercises/strength-catalogue.json';
import cardioFile from '../../content/cardio/cardio-sessions.json';
import stretchFile from '../../content/stretches/stretch-routines.json';
import warmupFile from '../../content/warmups-cooldowns/warmups-cooldowns.json';

import { allCardioSessions, type CardioSessionDef } from '@/lib/cardio';
import { resolveExerciseSlug } from '@/lib/contentGuides';
import { fetchExercisesForBuilder } from '@/lib/customWorkouts';
import {
  confirmFirstSessionSafety,
  isSessionStartCancelled,
  SessionStartCancelled,
} from '@/lib/firstSession';
import { ensureSubscribed } from '@/lib/paywall';
import { EQUIPMENT, type Equipment } from '@/lib/exercises';
import { exerciseNameFromSlug } from '@/lib/onboardingAnswers';
import type { ProgrammeDay, ProgrammeExercise, SlotExercise } from '@/lib/programmes';
import type { ExerciseRole } from '@/lib/routineStandard';
import { fetchActiveSession, startStandaloneSession } from '@/lib/sessions';
import { listSingleSessions, type SingleSession } from '@/lib/singleSessions';
import { openLogger, promptActiveSession } from '@/lib/startLogger';
import { saveSessionPlan, sessionPlanFromDay } from '@/lib/workoutLog';

export const BUILD_SESSION_MINUTES = [20, 30, 45, 60] as const;
export type BuildSessionMinutes = (typeof BUILD_SESSION_MINUTES)[number];

export const BUILD_SESSION_FOCUSES = [
  'full_body',
  'upper',
  'lower',
  'glutes_and_legs',
  'cardio',
  'recovery',
] as const;
export type BuildSessionFocus = (typeof BUILD_SESSION_FOCUSES)[number];

export const BUILD_SESSION_KIT = ['full_gym', 'dumbbells', 'busy_gym', 'bodyweight'] as const;
export type BuildSessionKit = (typeof BUILD_SESSION_KIT)[number];

export const BUILD_SESSION_ENERGY = ['low', 'normal', 'high'] as const;
export type BuildSessionEnergy = (typeof BUILD_SESSION_ENERGY)[number];

export const BUILD_SESSION_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type BuildSessionLevel = (typeof BUILD_SESSION_LEVELS)[number];

export const BUILD_SESSION_TIMING = {
  seconds_per_set: 40,
  rest_by_role: {
    main: 150,
    secondary: 90,
    accessory: 75,
    core: 60,
    finisher: 45,
  } as Record<ExerciseRole, number>,
  slack_minutes: 5,
} as const;

export const BUILD_SESSION_FEATURE = 'build_session' as const;

const ROLES: ExerciseRole[] = ['main', 'secondary', 'accessory', 'core', 'finisher'];
const PATTERNS_BY_FOCUS: Record<Exclude<BuildSessionFocus, 'cardio' | 'recovery'>, string[]> = {
  full_body: ['squat', 'hinge', 'push', 'pull', 'single_leg', 'core'],
  upper: ['push', 'pull', 'core'],
  lower: ['squat', 'hinge', 'single_leg', 'glutes', 'calves'],
  glutes_and_legs: ['squat', 'hinge', 'glutes', 'single_leg', 'calves'],
};

type Json = Record<string, unknown>;

export type EligibleExercise = {
  exercise_id: string;
  name: string;
  pattern: string;
  equipment: string;
  zone: number;
  roles: ExerciseRole[];
  rep_min: number;
  rep_max: number;
};

export type CatalogTemplate = { id: string; kind: 'warmup' | 'cooldown'; estimated_minutes: number };
export type CatalogCardio = { id: string; name: string; duration_minutes: number; beginner_ok: boolean };
export type CatalogStretch = { id: string; name: string; duration_minutes: number };

export type BuildSessionExercise = {
  exercise_id: string;
  role: ExerciseRole;
  sets: number;
  rep_min: number;
  rep_max: number;
  duration_seconds: number | null;
  target_rir: number;
};

export type BuildSessionBlock = {
  block_type: 'warmup' | 'strength' | 'cardio' | 'cooldown' | 'stretch';
  template_id: string | null;
  cardio_session_id: string | null;
  stretch_routine_id: string | null;
  exercises: BuildSessionExercise[];
};

export type BuiltSession = {
  name: string;
  why: string;
  estimated_minutes: number;
  blocks: BuildSessionBlock[];
  fallback: boolean;
};

export type BuildSessionRequest = {
  minutes: BuildSessionMinutes;
  focus: BuildSessionFocus;
  kit: BuildSessionKit;
  energy: BuildSessionEnergy;
  level: BuildSessionLevel;
  recent_patterns: string[];
  logged_barbell_ids: string[];
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

type CatalogueRow = {
  slug: string;
  name: string;
  equipment: Equipment;
  pattern: string;
  zone: number;
};

const CATALOGUE: CatalogueRow[] = asArray(asRecord(catalogueFile).exercises).flatMap((item) => {
  const row = asRecord(item);
  const slug = resolveExerciseSlug(text(row.slug));
  const name = text(row.name);
  const equipment = text(row.equipment);
  if (!slug || !name || !(EQUIPMENT as readonly string[]).includes(equipment)) return [];
  return [
    {
      slug,
      name,
      equipment: equipment as Equipment,
      pattern: text(row.pattern) || 'accessory',
      zone: num(row.zone) ?? 2,
    },
  ];
});

const TEMPLATES: CatalogTemplate[] = asArray(asRecord(warmupFile).templates).flatMap((item) => {
  const row = asRecord(item);
  const id = text(row.id);
  const kind = text(row.kind);
  if (!id || (kind !== 'warmup' && kind !== 'cooldown')) return [];
  return [{ id, kind, estimated_minutes: num(row.estimated_minutes) ?? 5 }];
});

const CARDIO: CatalogCardio[] = asArray(asRecord(cardioFile).cardio_sessions).flatMap((item) => {
  const row = asRecord(item);
  const id = text(row.slug);
  if (!id) return [];
  return [
    {
      id,
      name: text(row.name) || id,
      duration_minutes: num(row.duration_minutes) ?? 20,
      beginner_ok: row.beginner_ok !== false,
    },
  ];
});

const STRETCHES: CatalogStretch[] = asArray(asRecord(stretchFile).stretch_routines).flatMap((item) => {
  const row = asRecord(item);
  const id = text(row.slug);
  if (!id) return [];
  return [{ id, name: text(row.name) || id, duration_minutes: num(row.duration_minutes) ?? 10 }];
});

function rolesForPattern(pattern: string): ExerciseRole[] {
  if (pattern === 'core') return ['core'];
  if (pattern === 'calves') return ['accessory'];
  if (pattern === 'glutes' || pattern === 'single_leg') return ['secondary', 'accessory'];
  if (pattern === 'squat' || pattern === 'hinge' || pattern === 'push' || pattern === 'pull') {
    return ['main', 'secondary'];
  }
  return ['accessory'];
}

function defaultReps(role: ExerciseRole): { rep_min: number; rep_max: number } {
  if (role === 'main') return { rep_min: 6, rep_max: 10 };
  if (role === 'core' || role === 'accessory' || role === 'finisher') return { rep_min: 10, rep_max: 15 };
  return { rep_min: 8, rep_max: 12 };
}

function kitEquipment(kit: BuildSessionKit): Equipment[] {
  if (kit === 'dumbbells') return ['dumbbell', 'kettlebell', 'bodyweight', 'band'];
  if (kit === 'bodyweight') return ['bodyweight', 'band'];
  if (kit === 'busy_gym') return ['dumbbell', 'bodyweight'];
  return [...EQUIPMENT];
}

export function warmupTemplates(): CatalogTemplate[] {
  return TEMPLATES.filter((item) => item.kind === 'warmup');
}

export function cooldownTemplates(): CatalogTemplate[] {
  return TEMPLATES.filter((item) => item.kind === 'cooldown');
}

export function cardioCatalog(): CatalogCardio[] {
  return CARDIO;
}

export function patternsForExerciseIds(ids: string[]): string[] {
  const found = new Set<string>();
  for (const id of ids) {
    const slug = resolveExerciseSlug(id);
    const row = CATALOGUE.find((item) => item.slug === slug);
    if (row) found.add(row.pattern);
  }
  return [...found];
}

export function isBarbellExercise(id: string): boolean {
  const slug = resolveExerciseSlug(id);
  return CATALOGUE.some((item) => item.slug === slug && item.equipment === 'barbell');
}

export function stretchCatalog(): CatalogStretch[] {
  return STRETCHES;
}

export function singleSessionsPayload(): {
  id: string;
  name: string;
  focus: string;
  estimated_minutes: number;
  exercises: { exercise_id: string; role: ExerciseRole; sets: number; rep_min: number; rep_max: number; target_rir: number | null }[];
}[] {
  return listSingleSessions()
    .filter((item) => item.where !== 'home')
    .map((item) => ({
      id: item.slug,
      name: item.name,
      focus: item.focus,
      estimated_minutes: item.estimated_minutes,
      exercises: item.exercises.map((slot) => ({
        exercise_id: slot.slug,
        role: slot.role ?? 'secondary',
        sets: slot.sets,
        rep_min: slot.rep_min,
        rep_max: slot.rep_max,
        target_rir: slot.target_rir,
      })),
    }));
}

export function pickTemplate(kind: 'warmup' | 'cooldown', focus: BuildSessionFocus, minutes: number): string {
  if (minutes <= 30) return `${kind}-quick`;
  if (focus === 'upper') return `${kind}-upper-body`;
  if (focus === 'lower' || focus === 'glutes_and_legs') return `${kind}-lower-body`;
  return `${kind}-full-body`;
}

export function eligibleExercisesFor(input: {
  focus: BuildSessionFocus;
  kit: BuildSessionKit;
  level: BuildSessionLevel;
  loggedBarbellIds: string[];
}): EligibleExercise[] {
  if (input.focus === 'cardio' || input.focus === 'recovery') return [];
  const patterns = PATTERNS_BY_FOCUS[input.focus];
  const allowed = new Set(kitEquipment(input.kit));
  const logged = new Set(input.loggedBarbellIds.map(resolveExerciseSlug));
  const rows = CATALOGUE.filter((item) => {
    if (!patterns.includes(item.pattern)) return false;
    if (!allowed.has(item.equipment)) return false;
    if (input.kit === 'busy_gym' && item.zone > 1) return false;
    if (input.level === 'beginner' && item.equipment === 'barbell' && !logged.has(item.slug)) return false;
    if (input.level === 'beginner' && item.zone >= 4 && !logged.has(item.slug)) return false;
    return true;
  });
  const byPattern = new Map<string, CatalogueRow[]>();
  for (const item of rows) {
    const list = byPattern.get(item.pattern) ?? [];
    list.push(item);
    byPattern.set(item.pattern, list);
  }
  const picked: CatalogueRow[] = [];
  for (const pattern of patterns) {
    const list = (byPattern.get(pattern) ?? []).slice().sort((a, b) => a.zone - b.zone);
    picked.push(...list.slice(0, 6));
  }
  const unique = new Map(picked.map((item) => [item.slug, item]));
  return [...unique.values()].slice(0, 48).map((item) => {
    const roles = rolesForPattern(item.pattern);
    const reps = defaultReps(roles[0] ?? 'accessory');
    return {
      exercise_id: item.slug,
      name: item.name,
      pattern: item.pattern,
      equipment: item.equipment,
      zone: item.zone,
      roles,
      rep_min: reps.rep_min,
      rep_max: reps.rep_max,
    };
  });
}

export function emptyBlock(
  type: BuildSessionBlock['block_type'],
  extra?: Partial<BuildSessionBlock>
): BuildSessionBlock {
  return {
    block_type: type,
    template_id: extra?.template_id ?? null,
    cardio_session_id: extra?.cardio_session_id ?? null,
    stretch_routine_id: extra?.stretch_routine_id ?? null,
    exercises: extra?.exercises ?? [],
  };
}

export function estimateBuiltMinutes(blocks: BuildSessionBlock[]): number {
  let seconds = 0;
  for (const block of blocks) {
    if (block.block_type === 'warmup' || block.block_type === 'cooldown') {
      const template = TEMPLATES.find((item) => item.id === block.template_id);
      seconds += (template?.estimated_minutes ?? 5) * 60;
    } else if (block.block_type === 'cardio') {
      const session = CARDIO.find((item) => item.id === block.cardio_session_id);
      seconds += (session?.duration_minutes ?? 10) * 60;
    } else if (block.block_type === 'stretch') {
      const session = STRETCHES.find((item) => item.id === block.stretch_routine_id);
      seconds += (session?.duration_minutes ?? 10) * 60;
    } else {
      for (const item of block.exercises) {
        const rest = BUILD_SESSION_TIMING.rest_by_role[item.role] ?? 90;
        seconds += item.sets * (BUILD_SESSION_TIMING.seconds_per_set + rest);
      }
    }
  }
  return Math.max(1, Math.round(seconds / 60));
}

function clipName(value: string, fallback: string): string {
  const trimmed = value.trim() || fallback;
  return trimmed.length <= 30 ? trimmed : `${trimmed.slice(0, 29).trim()}`;
}

function clipWhy(value: string, fallback: string): string {
  const trimmed = value.trim() || fallback;
  return trimmed.length <= 220 ? trimmed : `${trimmed.slice(0, 219).trim()}`;
}

function focusToSingleFocus(focus: BuildSessionFocus): string[] {
  if (focus === 'upper') return ['upper_body', 'arms', 'full_body'];
  if (focus === 'lower') return ['lower_body', 'glutes', 'full_body'];
  if (focus === 'glutes_and_legs') return ['glutes', 'lower_body', 'full_body'];
  if (focus === 'recovery') return ['core', 'full_body'];
  return ['full_body', 'glutes', 'upper_body'];
}

function closestByMinutes<T extends { duration_minutes?: number; estimated_minutes?: number }>(
  list: T[],
  minutes: number
): T | null {
  if (list.length === 0) return null;
  return list.slice().sort((a, b) => {
    const aMin = a.duration_minutes ?? a.estimated_minutes ?? 30;
    const bMin = b.duration_minutes ?? b.estimated_minutes ?? 30;
    return Math.abs(aMin - minutes) - Math.abs(bMin - minutes);
  })[0];
}

function closestSingle(focus: BuildSessionFocus, minutes: number): SingleSession | null {
  const order = focusToSingleFocus(focus);
  const list = listSingleSessions().filter((item) => item.where !== 'home');
  const ranked = list.slice().sort((a, b) => {
    const aFocus = order.indexOf(a.focus);
    const bFocus = order.indexOf(b.focus);
    const focusScore = (aFocus < 0 ? 8 : aFocus) - (bFocus < 0 ? 8 : bFocus);
    if (focusScore !== 0) return focusScore;
    return Math.abs(a.estimated_minutes - minutes) - Math.abs(b.estimated_minutes - minutes);
  });
  return ranked[0] ?? null;
}

function rirFor(level: BuildSessionLevel, energy: BuildSessionEnergy): number {
  if (level === 'beginner') return energy === 'high' ? 2 : 3;
  return energy === 'low' ? 2 : 1;
}

function setsFor(level: BuildSessionLevel, energy: BuildSessionEnergy, role: ExerciseRole): number {
  let sets = level === 'beginner' ? 2 : 3;
  if (role === 'main' && level !== 'beginner') sets = 3;
  if (energy === 'low') sets = Math.max(2, sets - 1);
  if (energy === 'high' && role === 'main') sets = Math.min(4, sets + 1);
  return sets;
}

function strengthFromSingle(
  session: SingleSession,
  level: BuildSessionLevel,
  energy: BuildSessionEnergy
): BuildSessionExercise[] {
  return session.exercises.slice(0, 6).map((slot) => {
    const role = slot.role ?? 'secondary';
    return {
      exercise_id: slot.slug,
      role,
      sets: energy === 'low' ? Math.max(2, slot.sets - 1) : slot.sets,
      rep_min: slot.rep_min,
      rep_max: slot.rep_max,
      duration_seconds: null,
      target_rir: slot.target_rir ?? rirFor(level, energy),
    };
  });
}

function pickCardio(minutes: number, level: BuildSessionLevel): CatalogCardio | null {
  const list = CARDIO.filter((item) => (level === 'beginner' ? item.beginner_ok : true));
  return closestByMinutes(list, minutes);
}

function pickStretch(minutes: number): CatalogStretch | null {
  return closestByMinutes(STRETCHES, Math.min(minutes, 20));
}

export function fallbackBuiltSession(input: BuildSessionRequest): BuiltSession {
  const whyFallback =
    'This uses a session from our library that matches the time and focus you picked.';
  if (input.focus === 'cardio') {
    const cardio = pickCardio(input.minutes, input.level);
    if (cardio) {
      const blocks = [emptyBlock('cardio', { cardio_session_id: cardio.id })];
      return {
        name: clipName(cardio.name, 'Cardio session'),
        why: clipWhy(whyFallback, whyFallback),
        estimated_minutes: estimateBuiltMinutes(blocks),
        blocks,
        fallback: true,
      };
    }
  }
  if (input.focus === 'recovery') {
    const stretch = pickStretch(input.minutes);
    if (stretch) {
      const blocks = [emptyBlock('stretch', { stretch_routine_id: stretch.id })];
      return {
        name: clipName(stretch.name, 'Recovery stretch'),
        why: clipWhy(whyFallback, whyFallback),
        estimated_minutes: estimateBuiltMinutes(blocks),
        blocks,
        fallback: true,
      };
    }
  }
  const single = closestSingle(input.focus, input.minutes);
  const warmupId = pickTemplate('warmup', input.focus, input.minutes);
  const cooldownId = pickTemplate('cooldown', input.focus, input.minutes);
  const exercises = single
    ? strengthFromSingle(single, input.level, input.energy)
    : eligibleExercisesFor({
        focus: input.focus === 'cardio' || input.focus === 'recovery' ? 'full_body' : input.focus,
        kit: input.kit,
        level: input.level,
        loggedBarbellIds: input.logged_barbell_ids,
      })
        .slice(0, 5)
        .map((item) => {
          const role = item.roles[0] ?? 'secondary';
          const reps = defaultReps(role);
          return {
            exercise_id: item.exercise_id,
            role,
            sets: setsFor(input.level, input.energy, role),
            rep_min: reps.rep_min,
            rep_max: reps.rep_max,
            duration_seconds: null,
            target_rir: rirFor(input.level, input.energy),
          };
        });
  const blocks: BuildSessionBlock[] = [
    emptyBlock('warmup', { template_id: warmupId }),
    emptyBlock('strength', { exercises }),
    emptyBlock('cooldown', { template_id: cooldownId }),
  ];
  const name = single ? single.name : `${labelForFocus(input.focus)}, ${input.minutes} min`;
  return {
    name: clipName(name, 'Your session'),
    why: clipWhy(single?.short_description || whyFallback, whyFallback),
    estimated_minutes: estimateBuiltMinutes(blocks),
    blocks,
    fallback: true,
  };
}

export function labelForFocus(focus: BuildSessionFocus): string {
  if (focus === 'upper') return 'Upper body';
  if (focus === 'lower') return 'Lower body';
  if (focus === 'glutes_and_legs') return 'Glutes and legs';
  if (focus === 'cardio') return 'Cardio';
  if (focus === 'recovery') return 'Recovery';
  return 'Full body';
}

export function parseBuiltSession(raw: unknown, fallback: boolean): BuiltSession | null {
  const body = asRecord(raw);
  if (!Array.isArray(body.blocks) && body.ok !== true) return null;
  const source = Array.isArray(body.blocks) ? body.blocks : [];
  const blocks = source
    .map((item) => parseBlock(item))
    .filter((item): item is BuildSessionBlock => item !== null);
  if (blocks.length === 0) return null;
  return {
    name: clipName(text(body.name), 'Your session'),
    why: clipWhy(text(body.why), 'A session from our library for the time you have.'),
    estimated_minutes: num(body.estimated_minutes) ?? estimateBuiltMinutes(blocks),
    blocks,
    fallback,
  };
}

function parseBlock(raw: unknown): BuildSessionBlock | null {
  const row = asRecord(raw);
  const type = text(row.block_type);
  if (
    type !== 'warmup' &&
    type !== 'strength' &&
    type !== 'cardio' &&
    type !== 'cooldown' &&
    type !== 'stretch'
  ) {
    return null;
  }
  const exercises = asArray(row.exercises)
    .map((item) => parseExercise(item))
    .filter((item): item is BuildSessionExercise => item !== null);
  return {
    block_type: type,
    template_id: text(row.template_id) || null,
    cardio_session_id: text(row.cardio_session_id) || null,
    stretch_routine_id: text(row.stretch_routine_id) || null,
    exercises,
  };
}

function parseExercise(raw: unknown): BuildSessionExercise | null {
  const row = asRecord(raw);
  const id = resolveExerciseSlug(text(row.exercise_id));
  const role = text(row.role);
  if (!id || !ROLES.includes(role as ExerciseRole)) return null;
  const reps = defaultReps(role as ExerciseRole);
  return {
    exercise_id: id,
    role: role as ExerciseRole,
    sets: Math.min(5, Math.max(1, num(row.sets) ?? 3)),
    rep_min: Math.max(1, num(row.rep_min) ?? reps.rep_min),
    rep_max: Math.max(1, num(row.rep_max) ?? reps.rep_max),
    duration_seconds: num(row.duration_seconds),
    target_rir: Math.min(4, Math.max(0, num(row.target_rir) ?? 2)),
  };
}

export function validateBuiltSession(
  plan: BuiltSession,
  input: BuildSessionRequest,
  eligible: EligibleExercise[]
): BuiltSession | null {
  const eligibleIds = new Set(eligible.map((item) => item.exercise_id));
  const barbellLogged = new Set(input.logged_barbell_ids.map(resolveExerciseSlug));
  const used = new Set<string>();
  const nextBlocks: BuildSessionBlock[] = [];
  for (const block of plan.blocks) {
    if (block.block_type === 'warmup' || block.block_type === 'cooldown') {
      const id = block.template_id;
      const ok = TEMPLATES.some((item) => item.id === id && item.kind === block.block_type);
      if (!ok) return null;
      nextBlocks.push(block);
      continue;
    }
    if (block.block_type === 'cardio') {
      const id = block.cardio_session_id;
      const ok = CARDIO.some(
        (item) => item.id === id && (input.level !== 'beginner' || item.beginner_ok)
      );
      if (!ok) return null;
      nextBlocks.push(block);
      continue;
    }
    if (block.block_type === 'stretch') {
      const id = block.stretch_routine_id;
      if (!STRETCHES.some((item) => item.id === id)) return null;
      nextBlocks.push(block);
      continue;
    }
    if (eligible.length === 0) return null;
    if (block.exercises.length < 3 || block.exercises.length > 6) return null;
    if (!block.exercises.some((item) => item.role === 'main')) return null;
    const exercises: BuildSessionExercise[] = [];
    for (const item of block.exercises) {
      const row = eligible.find((entry) => entry.exercise_id === item.exercise_id);
      if (!row || !eligibleIds.has(item.exercise_id)) return null;
      if (used.has(item.exercise_id)) return null;
      if (!row.roles.includes(item.role)) return null;
      const cat = CATALOGUE.find((entry) => entry.slug === item.exercise_id);
      if (
        input.level === 'beginner' &&
        item.role === 'main' &&
        cat?.equipment === 'barbell' &&
        !barbellLogged.has(item.exercise_id)
      ) {
        return null;
      }
      used.add(item.exercise_id);
      exercises.push({
        ...item,
        rep_min: row.rep_min,
        rep_max: Math.max(row.rep_min, item.rep_max || row.rep_max),
      });
    }
    nextBlocks.push({ ...block, exercises });
  }
  if (input.focus === 'cardio' && !nextBlocks.some((item) => item.block_type === 'cardio')) return null;
  if (input.focus === 'recovery' && !nextBlocks.some((item) => item.block_type === 'stretch')) return null;
  if (
    input.focus !== 'cardio' &&
    input.focus !== 'recovery' &&
    !nextBlocks.some((item) => item.block_type === 'strength')
  ) {
    return null;
  }
  const minutes = estimateBuiltMinutes(nextBlocks);
  if (Math.abs(minutes - input.minutes) > BUILD_SESSION_TIMING.slack_minutes) return null;
  return {
    ...plan,
    estimated_minutes: minutes,
    blocks: nextBlocks,
  };
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

export async function builtSessionToDay(plan: BuiltSession): Promise<ProgrammeDay | null> {
  const strength = plan.blocks.find((item) => item.block_type === 'strength');
  if (!strength || strength.exercises.length === 0) return null;
  const library = await fetchExercisesForBuilder();
  const exercises: ProgrammeExercise[] = [];
  let position = 1;
  for (const slot of strength.exercises) {
    const exercise = matchExercise(library, slot.exercise_id);
    if (!exercise) continue;
    exercises.push({
      position,
      sets: slot.sets,
      rep_min: slot.rep_min,
      rep_max: Math.max(slot.rep_min, slot.rep_max),
      rest_seconds: BUILD_SESSION_TIMING.rest_by_role[slot.role] ?? 90,
      exercise,
      role: slot.role,
      target_rir: slot.target_rir,
    });
    position += 1;
  }
  if (exercises.length === 0) return null;
  return {
    id: `ai3-${Date.now()}`,
    day_number: 1,
    name: plan.name,
    exercises,
    focus: plan.name,
    coach_note: plan.why,
  };
}

export function planTemplateIds(plan: BuiltSession): {
  warmupTemplateId: string | null;
  cooldownTemplateId: string | null;
} {
  return {
    warmupTemplateId: plan.blocks.find((item) => item.block_type === 'warmup')?.template_id ?? null,
    cooldownTemplateId: plan.blocks.find((item) => item.block_type === 'cooldown')?.template_id ?? null,
  };
}

export function cardioIdFromPlan(plan: BuiltSession): string | null {
  return plan.blocks.find((item) => item.block_type === 'cardio')?.cardio_session_id ?? null;
}

export function stretchIdFromPlan(plan: BuiltSession): string | null {
  return plan.blocks.find((item) => item.block_type === 'stretch')?.stretch_routine_id ?? null;
}

export function cardioDefFromPlan(plan: BuiltSession): CardioSessionDef | null {
  const id = cardioIdFromPlan(plan);
  return allCardioSessions().find((item) => item.slug === id) ?? null;
}

export async function startBuiltStrengthSession(plan: BuiltSession): Promise<void> {
  if (!ensureSubscribed()) throw new SessionStartCancelled();
  const allowed = await confirmFirstSessionSafety();
  if (!allowed) throw new SessionStartCancelled();
  const active = await fetchActiveSession();
  if (active) {
    promptActiveSession(active.id);
    return;
  }
  const day = await builtSessionToDay(plan);
  if (!day) throw new Error('This session’s exercises are not in the library yet.');
  const templates = planTemplateIds(plan);
  const row = await startStandaloneSession();
  await saveSessionPlan(
    row.id,
    sessionPlanFromDay(day, undefined, null, {
      warmupTemplateId: templates.warmupTemplateId,
      cooldownTemplateId: templates.cooldownTemplateId,
    })
  );
  openLogger(row.id);
}

export function openBuildSession(): '/build-session' {
  return '/build-session';
}

export function describeBuildSessionError(error: unknown): string {
  if (isSessionStartCancelled(error)) return '';
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  return detail || 'Check your connection and try again.';
}

export function strengthLines(plan: BuiltSession): string[] {
  const strength = plan.blocks.find((item) => item.block_type === 'strength');
  if (!strength) return [];
  return strength.exercises.map((item) => {
    const name = CATALOGUE.find((row) => row.slug === item.exercise_id)?.name ?? item.exercise_id;
    return `${name} · ${item.sets} × ${item.rep_min} to ${item.rep_max}`;
  });
}
