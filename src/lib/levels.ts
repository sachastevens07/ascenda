import type { Muscle, Zone } from '@/lib/exercises';
import type { EquipmentAccess, Level } from '@/lib/profile';
import {
  SLOT_EXERCISE_COLUMNS,
  toSlotExercise,
  type ProgrammeDay,
  type SlotExercise,
} from '@/lib/programmes';
import { supabase } from '@/lib/supabase';
import {
  applySwaps,
  eligibleSwaps,
  exerciseFits,
  pickReplacement,
  type DaySwaps,
  type RankedExercise,
} from '@/lib/swaps';

/**
 * Highest gym zone she may be given.
 * Quiet Mode keeps the whole session in zone 1 (Corner) so she never has to move around.
 */
export function sessionMaxZone(level: Level, quietMode: boolean): Zone {
  return quietMode ? 1 : level;
}

export async function fetchFillLibrary(): Promise<RankedExercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select(`${SLOT_EXERCISE_COLUMNS}, secondary_muscles`);
  if (error) throw error;
  return ((data ?? []) as (SlotExercise & { secondary_muscles: Muscle[] })[]).map((row) => ({
    ...toSlotExercise(row),
    secondary_muscles: row.secondary_muscles,
  }));
}

/**
 * Replaces any slot whose exercise is above `maxZone` with the slot's own lower-zone variant
 * (dumbbells, then home) or, failing that, a same-muscle alternative from the library.
 */
export function fillDayForLevel(
  day: ProgrammeDay,
  access: EquipmentAccess,
  maxZone: Zone,
  library: RankedExercise[]
): ProgrammeDay {
  const used = new Set<string>();
  const exercises = day.exercises.map((item) => {
    if (exerciseFits(item.exercise, access, maxZone)) {
      used.add(item.exercise.id);
      return item;
    }
    const fromSlot = (item.candidates ?? []).find(
      (exercise) =>
        exercise.id !== item.exercise.id &&
        !used.has(exercise.id) &&
        exerciseFits(exercise, access, maxZone)
    );
    const replacement =
      fromSlot ??
      pickReplacement(item.exercise, library, access, [...used], maxZone);
    if (!replacement) {
      used.add(item.exercise.id);
      return item;
    }
    used.add(replacement.id);
    return { ...item, exercise: replacement, original: item.exercise };
  });
  return { ...day, exercises };
}

/** Fills the day for her level, then applies only swaps that still fit. */
export function resolveDay(
  day: ProgrammeDay,
  swaps: DaySwaps,
  access: EquipmentAccess,
  level: Level,
  quietMode: boolean,
  library: RankedExercise[]
): ProgrammeDay {
  const maxZone = sessionMaxZone(level, quietMode);
  return applySwaps(fillDayForLevel(day, access, maxZone, library), eligibleSwaps(swaps, access, maxZone));
}
