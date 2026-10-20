import type { Equipment, Muscle } from '@/lib/exercises';
import type { EquipmentAccess } from '@/lib/profile';
import { heaviestWeight, type LoggedSet } from '@/lib/sessions';
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

/** What to aim for next time on an exercise (double progression). */
export type WeightSuggestion =
  /** Every set hit the top of the rep range last time: go up a small step. */
  | { kind: 'increase'; kg: number; increaseKg: number }
  /** Keep last time's heaviest weight and aim for more reps. */
  | { kind: 'same-weight'; kg: number }
  | { kind: 'find-starting-weight' }
  /** Bodyweight or band, and every set hit the top of the rep range last time. */
  | { kind: 'harder-variation'; equipment: 'bodyweight' | 'band' }
  /** Bodyweight or band, done before but not yet at the top of the range. */
  | { kind: 'more-reps'; equipment: 'bodyweight' | 'band' }
  /** Bodyweight or band, never done before. */
  | { kind: 'first-time'; equipment: 'bodyweight' | 'band' };

/** Smallest sensible step up for each kind of equipment, in kg. */
function weightIncrease(equipment: Equipment, currentKg: number): number {
  switch (equipment) {
    case 'dumbbell':
      return currentKg < 10 ? 1 : 2;
    case 'machine':
      return 5;
    case 'kettlebell':
      return 2;
    default:
      return 2.5;
  }
}

/**
 * True if she completed every prescribed set last time, all at the same weight,
 * and each reached the top of the rep range.
 */
function hitTopOfRange(item: ProgrammeExercise, previousSets: LoggedSet[]): boolean {
  const prescribed = Array.from({ length: item.sets }, (_, index) =>
    previousSets.find((set) => set.set_number === index + 1)
  );
  if (prescribed.some((set) => !set || (set.reps ?? 0) < item.rep_max)) return false;
  return new Set(prescribed.map((set) => set?.weight_kg ?? null)).size === 1;
}

/** `previousSets` are the completed sets from the last session she did this exercise in. */
export function getWeightSuggestion(
  item: ProgrammeExercise,
  previousSets: LoggedSet[] = []
): WeightSuggestion {
  const { equipment } = item.exercise;
  const hitTop = previousSets.length > 0 && hitTopOfRange(item, previousSets);

  if (equipment === 'bodyweight' || equipment === 'band') {
    if (previousSets.length === 0) return { kind: 'first-time', equipment };
    return hitTop ? { kind: 'harder-variation', equipment } : { kind: 'more-reps', equipment };
  }

  const lastKg = heaviestWeight(previousSets);
  if (lastKg === null) return { kind: 'find-starting-weight' };
  if (!hitTop) return { kind: 'same-weight', kg: lastKg };
  const increaseKg = weightIncrease(equipment, lastKg);
  return { kind: 'increase', kg: Number((lastKg + increaseKg).toFixed(2)), increaseKg };
}

/** The suggestion line on the Today card. */
export function describeWeightSuggestion(suggestion: WeightSuggestion): string {
  switch (suggestion.kind) {
    case 'increase':
      return `Try ${formatKg(suggestion.kg)} (up ${formatKg(suggestion.increaseKg)}). You hit the top of the range last time`;
    case 'same-weight':
      return `Last time: ${formatKg(suggestion.kg)}. Stay here and aim for more reps`;
    case 'find-starting-weight':
      return 'Find your starting weight';
    case 'harder-variation':
    case 'more-reps':
      return describeProgressionGoal(suggestion) ?? '';
    case 'first-time':
      return suggestion.equipment === 'band' ? 'Choose a band that feels challenging' : 'Bodyweight';
  }
}

/** A short goal for the logger, shown under "Last time". Null when there's nothing to add. */
export function describeProgressionGoal(suggestion: WeightSuggestion): string | null {
  switch (suggestion.kind) {
    case 'increase':
      return `Go up to ${formatKg(suggestion.kg)} today. You hit the top of the range last time`;
    case 'same-weight':
      return 'Same weight, aim for more reps';
    case 'harder-variation':
      return suggestion.equipment === 'band'
        ? 'You hit the top of the range. Try a harder band, or add a slow lowering'
        : 'You hit the top of the range. Try a harder variation, or add a slow lowering';
    case 'more-reps':
      return suggestion.equipment === 'band'
        ? 'Same band, aim for more reps'
        : 'Bodyweight, aim for more reps';
    default:
      return null;
  }
}
