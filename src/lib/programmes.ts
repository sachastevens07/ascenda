import type { Equipment, Muscle } from '@/lib/exercises';
import type { EquipmentAccess } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

/** One exercise slot in a programme day, resolved for the user's equipment. */
export type ProgrammeExercise = {
  position: number;
  sets: number;
  rep_min: number;
  rep_max: number;
  exercise: {
    id: string;
    name: string;
    primary_muscle: Muscle;
    equipment: Equipment;
  };
};

export type ProgrammeDay = {
  id: string;
  day_number: number;
  name: string;
  exercises: ProgrammeExercise[];
};

export type Programme = {
  id: string;
  name: string;
  description: string;
  days_per_week: number;
  days: ProgrammeDay[];
};

type ProgrammeDayRow = Omit<ProgrammeDay, 'exercises'> & {
  programme_exercises: ProgrammeExercise[];
};

type ProgrammeRow = Omit<Programme, 'days'> & {
  programme_days: ProgrammeDayRow[];
};

/** Select string for a day and its exercises, picking each slot's exercise for `equipment`. */
function daySelect(equipment: EquipmentAccess): string {
  // Each slot links to three exercises; the named foreign key picks the one for this equipment.
  const exercise = `exercise:exercises!programme_exercises_${equipment}_fkey(id, name, primary_muscle, equipment)`;
  return `id, day_number, name, programme_exercises(position, sets, rep_min, rep_max, ${exercise})`;
}

function toProgrammeDay({ programme_exercises, ...day }: ProgrammeDayRow): ProgrammeDay {
  return {
    ...day,
    exercises: [...programme_exercises].sort((a, b) => a.position - b.position),
  };
}

/** Loads a programme with its days and exercises, picking each slot's exercise for `equipment`. */
export async function fetchProgramme(
  id: string,
  equipment: EquipmentAccess
): Promise<Programme | null> {
  const { data, error } = await supabase
    .from('programmes')
    .select(`id, name, description, days_per_week, programme_days(${daySelect(equipment)})`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { programme_days, ...programme } = data as unknown as ProgrammeRow;
  return {
    ...programme,
    days: programme_days.map(toProgrammeDay).sort((a, b) => a.day_number - b.day_number),
  };
}

/** Loads one programme day, even if it isn't part of the user's current programme. */
export async function fetchProgrammeDay(
  id: string,
  equipment: EquipmentAccess
): Promise<ProgrammeDay | null> {
  const { data, error } = await supabase
    .from('programme_days')
    .select(daySelect(equipment))
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toProgrammeDay(data as unknown as ProgrammeDayRow) : null;
}

export function formatSetsAndReps({ sets, rep_min, rep_max }: ProgrammeExercise): string {
  const reps = rep_min === rep_max ? `${rep_min}` : `${rep_min}–${rep_max}`;
  return `${sets} sets × ${reps} reps`;
}

/**
 * The day after the last finished session's day, wrapping round to day 1.
 * Day 1 if she hasn't finished a session from this programme yet.
 */
export function getNextDay(
  programme: Programme,
  lastFinishedDayId: string | null
): ProgrammeDay | null {
  const lastIndex = programme.days.findIndex((day) => day.id === lastFinishedDayId);
  return programme.days[(lastIndex + 1) % programme.days.length] ?? null;
}

/** Bodyweight and band exercises are logged without a weight. */
export function usesWeight(equipment: Equipment): boolean {
  return equipment !== 'bodyweight' && equipment !== 'band';
}

/** "20 kg", "12.5 kg". */
export function formatKg(kg: number): string {
  return `${Number(kg.toFixed(2))} kg`;
}

/** What the Today card suggests for the weight. */
export type WeightSuggestion =
  | { kind: 'last-weight'; kg: number }
  | { kind: 'find-starting-weight' }
  | { kind: 'bodyweight' }
  | { kind: 'band' };

/** `lastWeightKg` is the heaviest weight she used for this exercise last time, if any. */
export function getWeightSuggestion(
  item: ProgrammeExercise,
  lastWeightKg: number | null = null
): WeightSuggestion {
  switch (item.exercise.equipment) {
    case 'bodyweight':
      return { kind: 'bodyweight' };
    case 'band':
      return { kind: 'band' };
    default:
      return lastWeightKg === null
        ? { kind: 'find-starting-weight' }
        : { kind: 'last-weight', kg: lastWeightKg };
  }
}

export function describeWeightSuggestion(suggestion: WeightSuggestion): string {
  switch (suggestion.kind) {
    case 'last-weight':
      return `Last time: ${formatKg(suggestion.kg)}`;
    case 'bodyweight':
      return 'Bodyweight';
    case 'band':
      return 'Choose a band that feels challenging';
    case 'find-starting-weight':
      return 'Find your starting weight';
  }
}
