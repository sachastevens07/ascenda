/**
 * AI2 Busy gym fix. Eligible swaps come from exercise-guide "if it's taken" lists
 * (plus catalogue alternatives). Rule-based fallback matches the Edge Function.
 */
import catalogueFile from '../../content/exercises/strength-catalogue.json';
import { preferredSwapIds, resolveExerciseSlug } from '@/lib/contentGuides';
import { EQUIPMENT, EQUIPMENT_LABELS, type Equipment } from '@/lib/exercises';
import type { ProgrammeDay, ProgrammeExercise, SlotExercise } from '@/lib/programmes';
import type { ExerciseRole } from '@/lib/routineStandard';
import { setKey, setNumbers, type SetEntry } from '@/lib/workoutLog';

export const BUSY_GYM_MINUTES = [15, 30, 45] as const;
export type BusyGymMinutes = (typeof BUSY_GYM_MINUTES)[number];

export const BUSY_GYM_ENERGY = ['low', 'normal', 'high'] as const;
export type BusyGymEnergy = (typeof BUSY_GYM_ENERGY)[number];

export const BUSY_GYM_TIMING = {
  seconds_per_set: 40,
  rest_by_role: {
    main: 150,
    secondary: 90,
    accessory: 75,
    core: 60,
    finisher: 45,
  } as Record<ExerciseRole, number>,
  slack_minutes: 3,
} as const;

export type BusyGymAlt = {
  exercise_id: string;
  name: string;
  equipment: Equipment;
  pattern: string;
};

export type BusyGymRemaining = {
  exercise_id: string;
  name: string;
  role: ExerciseRole;
  pattern: string;
  equipment: Equipment;
  sets: number;
  remaining_sets: number;
  rep_min: number;
  rep_max: number;
};

export type BusyGymPlanRow = {
  exercise_id: string;
  replaces: string;
  sets: number;
  rep_min: number;
  rep_max: number;
  order: number;
};

export type BusyGymPlan = {
  exercises: BusyGymPlanRow[];
  summary: string;
  fallback: boolean;
};

type Json = Record<string, unknown>;
type CatalogueRow = {
  id: string;
  name: string;
  equipment: Equipment;
  pattern: string;
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

function isEquipment(value: string): value is Equipment {
  return (EQUIPMENT as readonly string[]).includes(value);
}

const CATALOGUE = new Map<string, CatalogueRow>();
for (const item of asArray(asRecord(catalogueFile).exercises)) {
  const row = asRecord(item);
  const slug = resolveExerciseSlug(text(row.slug));
  const name = text(row.name);
  const equipment = text(row.equipment);
  if (!slug || !name || !isEquipment(equipment)) continue;
  const parsed: CatalogueRow = {
    id: slug,
    name,
    equipment,
    pattern: text(row.pattern) || 'other',
  };
  if (!CATALOGUE.has(slug)) CATALOGUE.set(slug, parsed);
  CATALOGUE.set(text(row.slug), parsed);
}

export function catalogueExercise(id: string): CatalogueRow | null {
  return CATALOGUE.get(id) ?? CATALOGUE.get(resolveExerciseSlug(id)) ?? null;
}

export function busyGymEquipmentLabel(equipment: Equipment): string {
  return EQUIPMENT_LABELS[equipment];
}

export function inferBusyGymRole(item: ProgrammeExercise, index: number): ExerciseRole {
  if (item.role) return item.role;
  const pattern = catalogueExercise(item.exercise.id)?.pattern ?? '';
  if (pattern === 'core' || pattern === 'carry') return 'core';
  if (index === 0) return 'main';
  return 'accessory';
}

export function completedWorkingSets(
  item: ProgrammeExercise,
  entries: Record<string, SetEntry>
): number {
  let done = 0;
  for (const setNumber of setNumbers(item)) {
    if (entries[setKey(item.exercise.id, setNumber)]?.completed) done += 1;
  }
  return done;
}

export function remainingBusyGymItems(
  day: ProgrammeDay,
  entries: Record<string, SetEntry>
): ProgrammeExercise[] {
  return day.exercises.filter((item) => completedWorkingSets(item, entries) < item.sets);
}

export function remainingSetCount(
  item: ProgrammeExercise,
  entries: Record<string, SetEntry>
): number {
  return Math.max(0, item.sets - completedWorkingSets(item, entries));
}

export function toBusyGymRemaining(
  day: ProgrammeDay,
  entries: Record<string, SetEntry>
): BusyGymRemaining[] {
  return day.exercises.flatMap((item, index) => {
    const remaining = remainingSetCount(item, entries);
    if (remaining <= 0) return [];
    const catalog = catalogueExercise(item.exercise.id);
    return [
      {
        exercise_id: item.exercise.id,
        name: item.exercise.name,
        role: inferBusyGymRole(item, index),
        pattern: catalog?.pattern ?? 'other',
        equipment: item.exercise.equipment,
        sets: item.sets,
        remaining_sets: remaining,
        rep_min: item.rep_min,
        rep_max: item.rep_max,
      },
    ];
  });
}

export function guideSwapIds(exerciseId: string): string[] {
  return preferredSwapIds(exerciseId);
}

export function filterGuideSwaps(
  exerciseId: string,
  unavailable: Equipment[],
  usedIds: Set<string>,
  byId: Map<string, SlotExercise>
): SlotExercise[] {
  const blocked = new Set(unavailable);
  const out: SlotExercise[] = [];
  for (const id of preferredSwapIds(exerciseId)) {
    if (usedIds.has(id) || id === exerciseId) continue;
    const row = byId.get(id) ?? byId.get(resolveExerciseSlug(id));
    if (!row) continue;
    if (blocked.has(row.equipment)) continue;
    out.push(row);
  }
  return out;
}

export function estimateBusyGymMinutes(
  rows: { role: ExerciseRole; sets: number }[]
): number {
  let seconds = 0;
  for (const row of rows) {
    const rest = BUSY_GYM_TIMING.rest_by_role[row.role] ?? BUSY_GYM_TIMING.rest_by_role.accessory;
    seconds += row.sets * (BUSY_GYM_TIMING.seconds_per_set + rest);
  }
  return Math.max(1, Math.ceil(seconds / 60));
}

function dropOrder(role: ExerciseRole): number {
  if (role === 'accessory') return 0;
  if (role === 'core') return 1;
  if (role === 'finisher') return 2;
  if (role === 'secondary') return 3;
  return 4;
}

function energySets(sets: number, energy: BusyGymEnergy): number {
  if (energy !== 'low') return Math.max(1, sets);
  return Math.max(1, Math.ceil(sets * (2 / 3)));
}

export function fallbackBusyGymPlan(
  remaining: BusyGymRemaining[],
  alternatives: Record<string, BusyGymAlt[]>,
  unavailable: Equipment[],
  minutesLeft: BusyGymMinutes,
  energy: BusyGymEnergy
): BusyGymPlan {
  const blocked = new Set(unavailable);
  const used = new Set<string>();
  const kept: (BusyGymRemaining & { exercise_id: string; replaces: string })[] = [];

  for (const item of remaining) {
    const taken = blocked.has(item.equipment);
    if (!taken) {
      used.add(item.exercise_id);
      kept.push({ ...item, replaces: item.exercise_id });
      continue;
    }
    const alt = (alternatives[item.exercise_id] ?? []).find((row) => !used.has(row.exercise_id));
    if (!alt) continue;
    used.add(alt.exercise_id);
    kept.push({
      ...item,
      exercise_id: alt.exercise_id,
      name: alt.name,
      equipment: alt.equipment,
      pattern: alt.pattern,
      replaces: item.exercise_id,
    });
  }

  const scaled = kept.map((item) => ({
    ...item,
    sets: energySets(item.remaining_sets || item.sets, energy),
  }));

  const cap = minutesLeft + BUSY_GYM_TIMING.slack_minutes;
  const fits = (rows: typeof scaled) =>
    estimateBusyGymMinutes(rows.map((row) => ({ role: row.role, sets: row.sets }))) <= cap;

  let next = scaled.slice();
  while (next.length > 0 && !fits(next)) {
    const dropIndex = [...next.keys()]
      .filter((index) => dropOrder(next[index].role) < 4)
      .sort((a, b) => dropOrder(next[a].role) - dropOrder(next[b].role) || b - a)[0];
    if (dropIndex == null) {
      const last = next.length - 1;
      if (next[last].sets > 1) {
        next = next.map((row, index) => (index === last ? { ...row, sets: row.sets - 1 } : row));
        continue;
      }
      break;
    }
    if (next[dropIndex].role === 'secondary' && next[dropIndex].sets > 1) {
      next = next.map((row, index) =>
        index === dropIndex ? { ...row, sets: row.sets - 1 } : row
      );
      continue;
    }
    if (next[dropIndex].role === 'main') {
      if (next[dropIndex].sets > 1) {
        next = next.map((row, index) =>
          index === dropIndex ? { ...row, sets: row.sets - 1 } : row
        );
        continue;
      }
      break;
    }
    next = next.filter((_, index) => index !== dropIndex);
  }

  const mains = remaining.filter((item) => item.role === 'main');
  const mainKept = mains.every((main) => {
    const taken = blocked.has(main.equipment);
    const alts = alternatives[main.exercise_id] ?? [];
    if (taken && alts.length === 0) return true;
    return next.some((row) => row.replaces === main.exercise_id);
  });
  if (!mainKept) {
    for (const main of mains) {
      if (next.some((row) => row.replaces === main.exercise_id)) continue;
      const taken = blocked.has(main.equipment);
      const alt = taken
        ? (alternatives[main.exercise_id] ?? []).find((row) => !next.some((item) => item.exercise_id === row.exercise_id))
        : null;
      const exerciseId = taken ? alt?.exercise_id : main.exercise_id;
      const name = taken ? alt?.name ?? main.name : main.name;
      if (!exerciseId) continue;
      next = [
        {
          ...main,
          exercise_id: exerciseId,
          name,
          replaces: main.exercise_id,
          sets: energySets(main.remaining_sets || main.sets, energy),
        },
        ...next,
      ];
    }
  }

  const ordered = [...next].sort((a, b) => {
    const rank = (role: ExerciseRole) =>
      role === 'main' ? 0 : role === 'secondary' ? 1 : role === 'accessory' ? 2 : role === 'core' ? 3 : 4;
    return rank(a.role) - rank(b.role);
  });

  const exercises: BusyGymPlanRow[] = ordered.map((row, index) => ({
    exercise_id: row.exercise_id,
    replaces: row.replaces,
    sets: row.sets,
    rep_min: row.rep_min,
    rep_max: row.rep_max,
    order: index + 1,
  }));

  return {
    exercises,
    summary:
      exercises.length === 0
        ? 'Nothing we can swap in from the list. Try marking less as taken, or swap one lift yourself.'
        : 'Swapped taken kit where we could, and trimmed the rest to fit the time you have.',
    fallback: true,
  };
}

export function clampBusyGymReps(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const ROLE_RANK: Record<ExerciseRole, number> = {
  main: 0,
  secondary: 1,
  accessory: 2,
  core: 3,
  finisher: 4,
};

export function sortBusyGymPreview(
  rows: { role: ExerciseRole }[]
): number[] {
  return rows
    .map((_, index) => index)
    .sort((a, b) => ROLE_RANK[rows[a].role] - ROLE_RANK[rows[b].role] || a - b);
}

export function equipmentInSession(items: ProgrammeExercise[]): Equipment[] {
  const seen = new Set<Equipment>();
  const out: Equipment[] = [];
  for (const item of items) {
    if (seen.has(item.exercise.equipment)) continue;
    seen.add(item.exercise.equipment);
    out.push(item.exercise.equipment);
  }
  return out;
}

export function busyGymAltFromSlot(slot: SlotExercise): BusyGymAlt {
  return {
    exercise_id: slot.id,
    name: slot.name,
    equipment: slot.equipment,
    pattern: catalogueExercise(slot.id)?.pattern ?? 'other',
  };
}

export function buildBusyGymAlternatives(
  remaining: BusyGymRemaining[],
  unavailable: Equipment[],
  byId: Map<string, SlotExercise>
): Record<string, BusyGymAlt[]> {
  const sessionIds = new Set(remaining.map((item) => item.exercise_id));
  const out: Record<string, BusyGymAlt[]> = {};
  for (const item of remaining) {
    out[item.exercise_id] = filterGuideSwaps(item.exercise_id, unavailable, sessionIds, byId).map(
      busyGymAltFromSlot
    );
  }
  return out;
}

export function applyBusyGymPlanToDay(
  day: ProgrammeDay,
  entries: Record<string, SetEntry>,
  plan: BusyGymPlan,
  byId: Map<string, SlotExercise>
): ProgrammeDay {
  const remaining = remainingBusyGymItems(day, entries);
  const remainingPositions = new Set(remaining.map((item) => item.position));
  const remainingById = new Map(remaining.map((item) => [item.exercise.id, item]));
  const kept: ProgrammeExercise[] = [];
  for (const item of day.exercises) {
    if (remainingPositions.has(item.position)) continue;
    kept.push(item);
  }
  // Partial work stays even if the rework drops the rest of that slot.
  const usedIds = new Set(kept.map((item) => item.exercise.id));
  const usedOriginal = new Set<string>();
  for (const row of [...plan.exercises].sort((a, b) => a.order - b.order)) {
    if (usedOriginal.has(row.replaces)) continue;
    const original = remainingById.get(row.replaces);
    if (!original) continue;
    usedOriginal.add(row.replaces);
    remainingById.delete(row.replaces);
    const done = completedWorkingSets(original, entries);
    const nextSets = Math.max(done, Math.min(original.sets, done + Math.max(1, row.sets)));
    const swap =
      row.exercise_id !== original.exercise.id
        ? byId.get(row.exercise_id) ?? byId.get(resolveExerciseSlug(row.exercise_id))
        : null;
    const nextExercise = swap && !usedIds.has(swap.id) ? swap : original.exercise;
    if (usedIds.has(nextExercise.id)) continue;
    usedIds.add(nextExercise.id);
    kept.push({
      ...original,
      exercise: nextExercise,
      original:
        nextExercise.id === original.exercise.id
          ? original.original
          : original.original ?? original.exercise,
      sets: nextSets,
      rep_min: clampBusyGymReps(row.rep_min, original.rep_min, original.rep_max),
      rep_max: clampBusyGymReps(row.rep_max, original.rep_min, original.rep_max),
    });
  }
  for (const leftover of remainingById.values()) {
    const done = completedWorkingSets(leftover, entries);
    if (done <= 0 || usedIds.has(leftover.exercise.id)) continue;
    usedIds.add(leftover.exercise.id);
    kept.push({ ...leftover, sets: done });
  }
  return {
    ...day,
    exercises: kept.map((item, index) => ({ ...item, position: index + 1 })),
  };
}
