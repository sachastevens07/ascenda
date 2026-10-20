import { EQUIPMENT, type Equipment, type Muscle } from '@/lib/exercises';
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

const EQUIPMENT_FOR_ACCESS: Record<EquipmentAccess, readonly Equipment[]> = {
  full_gym: EQUIPMENT,
  dumbbells: ['dumbbell', 'bodyweight'],
  home: ['bodyweight', 'band'],
};

/** Replaces swapped slots, keeping the programme's exercise as `original`. */
export function applySwaps(day: ProgrammeDay, swaps: DaySwaps = {}): ProgrammeDay {
  return {
    ...day,
    exercises: day.exercises.map((item) => {
      const swap = swaps[item.position];
      return swap && swap.id !== item.exercise.id
        ? { ...item, exercise: swap, original: item.exercise }
        : item;
    }),
  };
}

/** Slot position → exercise id for every swapped slot in a day, as stored on a session. */
export function swapIds(day: ProgrammeDay): Record<string, string> {
  return Object.fromEntries(
    day.exercises.filter((item) => item.original).map((item) => [item.position, item.exercise.id])
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

/**
 * Up to 3 exercises for the same primary muscle with equipment she has. Most shared secondary
 * muscles first, then the same equipment, with at most 2 of any one kind of equipment.
 * `excludeIds` are the exercises already in the day.
 */
export async function fetchAlternatives(
  current: SlotExercise,
  access: EquipmentAccess,
  excludeIds: string[]
): Promise<SlotExercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select(`${SLOT_EXERCISE_COLUMNS}, secondary_muscles`)
    .eq('primary_muscle', current.primary_muscle);
  if (error) throw error;

  const rows = (data ?? []) as unknown as (SlotExercise & { secondary_muscles: Muscle[] })[];
  const currentSecondary = rows.find((row) => row.id === current.id)?.secondary_muscles ?? [];
  const score = (row: (typeof rows)[number]) =>
    row.secondary_muscles.filter((muscle) => currentSecondary.includes(muscle)).length * 2 +
    (row.equipment === current.equipment ? 1 : 0);

  const ranked = rows
    .filter(
      (row) =>
        row.id !== current.id &&
        !excludeIds.includes(row.id) &&
        EQUIPMENT_FOR_ACCESS[access].includes(row.equipment)
    )
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));

  const chosen: SlotExercise[] = [];
  for (const row of ranked) {
    if (chosen.length === MAX_ALTERNATIVES) break;
    const sameKit = chosen.filter((item) => item.equipment === row.equipment).length;
    if (sameKit >= MAX_ALTERNATIVES_PER_EQUIPMENT) continue;
    chosen.push(toSlotExercise(row));
  }
  return chosen;
}
