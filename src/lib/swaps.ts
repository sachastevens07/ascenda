import { EQUIPMENT, type Equipment, type Muscle, type Zone } from '@/lib/exercises';
import type { EquipmentAccess } from '@/lib/profile';
import {
  SLOT_EXERCISE_COLUMNS,
  toSlotExercise,
  type ProgrammeDay,
  type SlotExercise,
} from '@/lib/programmes';
import type { Session } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

/** "Just today" (this session only) or "Every time" (replaces it in her programme). */
export type SwapScope = 'today' | 'always';

/** Swapped exercises for one day, by slot position. */
export type DaySwaps = Record<number, SlotExercise>;

/** Her "Every time" swaps, by programme day id. */
export type UserSwaps = Record<string, DaySwaps>;

const MAX_ALTERNATIVES = 3;
/** Keeps a mix of kit in the list, in case what she's on is busy. */
const MAX_ALTERNATIVES_PER_EQUIPMENT = 2;

export const EQUIPMENT_FOR_ACCESS: Record<EquipmentAccess, readonly Equipment[]> = {
  full_gym: EQUIPMENT,
  dumbbells: ['dumbbell', 'bodyweight'],
  home: ['bodyweight', 'band'],
};

/** Same muscle / kit rules as swaps, plus her zone cap (confidence level, or zone 1 in Quiet Mode). */
export function exerciseFits(
  exercise: SlotExercise,
  access: EquipmentAccess,
  maxZone: Zone
): boolean {
  return exercise.zone <= maxZone && EQUIPMENT_FOR_ACCESS[access].includes(exercise.equipment);
}

export type RankedExercise = SlotExercise & { secondary_muscles: Muscle[] };

/** Best same-muscle alternative at or below `maxZone`. Null if there isn't one. */
export function pickReplacement(
  current: SlotExercise,
  pool: RankedExercise[],
  access: EquipmentAccess,
  excludeIds: string[],
  maxZone: Zone
): SlotExercise | null {
  const currentSecondary = pool.find((row) => row.id === current.id)?.secondary_muscles ?? [];
  const score = (row: RankedExercise) =>
    row.secondary_muscles.filter((muscle) => currentSecondary.includes(muscle)).length * 2 +
    (row.equipment === current.equipment ? 1 : 0);
  const ranked = pool
    .filter(
      (row) =>
        row.id !== current.id &&
        !excludeIds.includes(row.id) &&
        row.primary_muscle === current.primary_muscle &&
        exerciseFits(row, access, maxZone)
    )
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  return ranked[0] ? toSlotExercise(ranked[0]) : null;
}

/** Sets and reps for a slot that isn't in the programme (a level-up try added to the session). */
export const EXTRA_SWAP_SETS = { sets: 3, rep_min: 8, rep_max: 12 } as const;

/** Replaces swapped slots, keeping the programme's exercise as `original`. */
export function applySwaps(day: ProgrammeDay, swaps: DaySwaps = {}): ProgrammeDay {
  const used = new Set(day.exercises.map((item) => item.position));
  const exercises = day.exercises.map((item) => {
    const swap = swaps[item.position];
    return swap && swap.id !== item.exercise.id
      ? { ...item, exercise: swap, original: item.exercise }
      : item;
  });
  const extras = Object.entries(swaps)
    .filter(([position]) => !used.has(Number(position)))
    .map(([position, exercise]) => ({
      position: Number(position),
      ...EXTRA_SWAP_SETS,
      exercise,
      added: true,
    }))
    .sort((a, b) => a.position - b.position);
  return { ...day, exercises: [...exercises, ...extras] };
}

/** The next gym zone above her cap, or null if she's already at the racks. */
export function nextZoneUp(maxZone: Zone): Zone | null {
  return maxZone < 4 ? ((maxZone + 1) as Zone) : null;
}

/**
 * Drops swaps that use kit she doesn't have, or that are more than one zone above her cap.
 * One zone up is allowed so "Try something new" (and an Every time swap from it) still shows.
 */
export function eligibleSwaps(
  swaps: DaySwaps,
  access: EquipmentAccess,
  maxZone: Zone
): DaySwaps {
  const tryZone = nextZoneUp(maxZone);
  return Object.fromEntries(
    Object.entries(swaps).filter(([, exercise]) => {
      if (!EQUIPMENT_FOR_ACCESS[access].includes(exercise.equipment)) return false;
      return exercise.zone <= maxZone || exercise.zone === tryZone;
    })
  );
}

/** Slot position → exercise id for every swapped or added slot in a day, as stored on a session. */
export function swapIds(day: ProgrammeDay): Record<string, string> {
  return Object.fromEntries(
    day.exercises
      .filter((item) => item.original || item.added)
      .map((item) => [item.position, item.exercise.id])
  );
}

/** Her "Every time" swaps, skipping any for equipment she no longer has. */
export async function fetchUserSwaps(access: EquipmentAccess): Promise<UserSwaps> {
  const { data, error } = await supabase
    .from('user_exercise_swaps')
    .select(`programme_day_id, position, exercise:exercises(${SLOT_EXERCISE_COLUMNS})`);
  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    programme_day_id: string;
    position: number;
    exercise: SlotExercise;
  }[];
  const swaps: UserSwaps = {};
  for (const row of rows) {
    if (!EQUIPMENT_FOR_ACCESS[access].includes(row.exercise.equipment)) continue;
    (swaps[row.programme_day_id] ??= {})[row.position] = toSlotExercise(row.exercise);
  }
  return swaps;
}

export async function saveUserSwap(
  programmeDayId: string,
  position: number,
  exerciseId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_exercise_swaps')
    .upsert(
      { programme_day_id: programmeDayId, position, exercise_id: exerciseId },
      { onConflict: 'user_id,programme_day_id,position' }
    );
  if (error) throw error;
}

export async function deleteUserSwap(programmeDayId: string, position: number): Promise<void> {
  const { error } = await supabase
    .from('user_exercise_swaps')
    .delete()
    .eq('programme_day_id', programmeDayId)
    .eq('position', position);
  if (error) throw error;
}

/** The exercises swapped in for a session, by slot position. */
export async function fetchSessionSwaps(session: Session): Promise<DaySwaps> {
  const entries = Object.entries(session.exercise_swaps ?? {});
  if (entries.length === 0) return {};
  const { data, error } = await supabase
    .from('exercises')
    .select(SLOT_EXERCISE_COLUMNS)
    .in(
      'id',
      entries.map(([, id]) => id)
    );
  if (error) throw error;

  const byId = new Map(
    ((data ?? []) as unknown as SlotExercise[]).map((row) => [row.id, toSlotExercise(row)])
  );
  const swaps: DaySwaps = {};
  for (const [position, id] of entries) {
    const exercise = byId.get(id);
    if (exercise) swaps[Number(position)] = exercise;
  }
  return swaps;
}

export type SwapOptions = {
  /** Up to 3 alternatives at or below her zone cap. */
  alternatives: SlotExercise[];
  /** One same-muscle exercise from the next zone up, if there is one. */
  trySomethingNew: SlotExercise | null;
};

/**
 * Alternatives for a swap: same primary muscle, equipment she has, ranked by shared secondary
 * muscles then the same equipment, at most 2 of any one kind. `excludeIds` are already in the day.
 * Default list is `zone` ≤ `maxZone`. `trySomethingNew` is exactly one from the next zone.
 */
export async function fetchAlternatives(
  current: SlotExercise,
  access: EquipmentAccess,
  excludeIds: string[],
  maxZone?: Zone
): Promise<SwapOptions> {
  const { data, error } = await supabase
    .from('exercises')
    .select(`${SLOT_EXERCISE_COLUMNS}, secondary_muscles`)
    .eq('primary_muscle', current.primary_muscle);
  if (error) throw error;

  const rows = (data ?? []) as unknown as RankedExercise[];
  const currentSecondary = rows.find((row) => row.id === current.id)?.secondary_muscles ?? [];
  const score = (row: RankedExercise) =>
    row.secondary_muscles.filter((muscle) => currentSecondary.includes(muscle)).length * 2 +
    (row.equipment === current.equipment ? 1 : 0);
  const rank = (list: RankedExercise[]) =>
    [...list].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));

  const ranked = rank(
    rows.filter(
      (row) =>
        row.id !== current.id &&
        !excludeIds.includes(row.id) &&
        EQUIPMENT_FOR_ACCESS[access].includes(row.equipment) &&
        (maxZone === undefined || row.zone <= maxZone)
    )
  );

  const alternatives: SlotExercise[] = [];
  for (const row of ranked) {
    if (alternatives.length === MAX_ALTERNATIVES) break;
    const sameKit = alternatives.filter((item) => item.equipment === row.equipment).length;
    if (sameKit >= MAX_ALTERNATIVES_PER_EQUIPMENT) continue;
    alternatives.push(toSlotExercise(row));
  }

  const tryZone = maxZone === undefined ? null : nextZoneUp(maxZone);
  const taken = new Set([current.id, ...excludeIds, ...alternatives.map((item) => item.id)]);
  const trySomethingNew =
    tryZone === null
      ? null
      : (rank(
          rows.filter(
            (row) =>
              !taken.has(row.id) &&
              row.zone === tryZone &&
              EQUIPMENT_FOR_ACCESS[access].includes(row.equipment)
          )
        )[0] ?? null);
  return {
    alternatives,
    trySomethingNew: trySomethingNew ? toSlotExercise(trySomethingNew) : null,
  };
}
