import type { Equipment, Muscle, Zone } from '@/lib/exercises';
import type { EquipmentAccess } from '@/lib/profile';
import { heaviestWeight, type LoggedSet } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { formatWeight } from '@/lib/units';

/** The exercise in a programme slot. */
export type SlotExercise = {
  id: string;
  name: string;
  primary_muscle: Muscle;
  equipment: Equipment;
  zone: Zone;
  /** Step to add after an earned increase. Null for bodyweight and band; negative for assisted machines. */
  weight_increase_kg: number | null;
};

export const SLOT_EXERCISE_COLUMNS =
  'id, name, primary_muscle, equipment, zone, weight_increase_kg';

/** Postgres numerics arrive as strings; turn them back into numbers. */
export function toSlotExercise(row: SlotExercise): SlotExercise {
  return {
    ...row,
    weight_increase_kg: row.weight_increase_kg === null ? null : Number(row.weight_increase_kg),
  };
}

/** One exercise slot in a programme day, resolved for the user's equipment. */
export type ProgrammeExercise = {
  position: number;
  sets: number;
  rep_min: number;
  rep_max: number;
  /** Rest after a ticked set. Missing on older programme / custom rows. */
  rest_seconds?: number;
  exercise: SlotExercise;
  /** The programme's own exercise, when she has swapped it for `exercise`. */
  original?: SlotExercise;
  /**
   * This slot's full-gym / dumbbells / home exercises, in preference order for her equipment.
   * Used to fill a slot when the chosen exercise is above her confidence level.
   */
  candidates?: SlotExercise[];
  /** Extra slot that isn't in the programme (a level-up try added to the session). */
  added?: boolean;
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

type SlotVariant = 'full_gym' | 'dumbbells' | 'home';

/** Prefer the exercise for where she trains; the others are fallbacks when that one is above her level. */
const SLOT_VARIANT_ORDER: Record<EquipmentAccess, SlotVariant[]> = {
  full_gym: ['full_gym', 'dumbbells', 'home'],
  dumbbells: ['dumbbells', 'home'],
  home: ['home'],
};

type ProgrammeExerciseRow = {
  position: number;
  sets: number;
  rep_min: number;
  rep_max: number;
  full_gym: SlotExercise;
  dumbbells: SlotExercise;
  home: SlotExercise;
};

type ProgrammeDayRow = Omit<ProgrammeDay, 'exercises'> & {
  programme_exercises: ProgrammeExerciseRow[];
};

type ProgrammeRow = Omit<Programme, 'days'> & {
  programme_days: ProgrammeDayRow[];
};

/** Select string for a day and all three of each slot's exercises. */
function daySelect(): string {
  const cols = SLOT_EXERCISE_COLUMNS;
  return `id, day_number, name, programme_exercises(
    position, sets, rep_min, rep_max,
    full_gym:exercises!programme_exercises_full_gym_fkey(${cols}),
    dumbbells:exercises!programme_exercises_dumbbells_fkey(${cols}),
    home:exercises!programme_exercises_home_fkey(${cols})
  )`;
}

function uniqueCandidates(exercises: SlotExercise[]): SlotExercise[] {
  const seen = new Set<string>();
  const list: SlotExercise[] = [];
  for (const exercise of exercises) {
    if (seen.has(exercise.id)) continue;
    seen.add(exercise.id);
    list.push(toSlotExercise(exercise));
  }
  return list;
}

function toProgrammeDay(row: ProgrammeDayRow, equipment: EquipmentAccess): ProgrammeDay {
  return {
    id: row.id,
    day_number: row.day_number,
    name: row.name,
    exercises: [...row.programme_exercises]
      .map((item) => {
        const candidates = uniqueCandidates(
          SLOT_VARIANT_ORDER[equipment].map((variant) => item[variant])
        );
        return {
          position: item.position,
          sets: item.sets,
          rep_min: item.rep_min,
          rep_max: item.rep_max,
          exercise: candidates[0] ?? toSlotExercise(item.home),
          candidates,
        };
      })
      .sort((a, b) => a.position - b.position),
  };
}

/** Loads a programme with its days and exercises, picking each slot's exercise for `equipment`. */
export async function fetchProgramme(
  id: string,
  equipment: EquipmentAccess
): Promise<Programme | null> {
  const { data, error } = await supabase
    .from('programmes')
    .select(`id, name, description, days_per_week, programme_days(${daySelect()})`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { programme_days, ...programme } = data as unknown as ProgrammeRow;
  return {
    ...programme,
    days: programme_days
      .map((day) => toProgrammeDay(day, equipment))
      .sort((a, b) => a.day_number - b.day_number),
  };
}

/** Loads one programme day, even if it isn't part of the user's current programme. */
export async function fetchProgrammeDay(
  id: string,
  equipment: EquipmentAccess
): Promise<ProgrammeDay | null> {
  const { data, error } = await supabase
    .from('programme_days')
    .select(daySelect())
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toProgrammeDay(data as unknown as ProgrammeDayRow, equipment) : null;
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

/** "20 kg", "44.1 lbs". Storage stays in kilograms. */
export function formatKg(kg: number): string {
  return formatWeight(kg);
}

/** What to aim for next time on an exercise (double progression). */
export type WeightSuggestion =
  /**
   * Set 1 hit the top of the rep range last time: change the weight by the exercise's step.
   * `changeKg` is negative on assisted machines (less help).
   */
  | { kind: 'increase'; kg: number; changeKg: number }
  /** Keep last time's heaviest weight and aim for more reps. */
  | { kind: 'same-weight'; kg: number }
  | { kind: 'find-starting-weight' }
  /** Bodyweight or band, and set 1 hit the top of the rep range last time. */
  | { kind: 'harder-variation'; equipment: 'bodyweight' | 'band' }
  /** Bodyweight or band, done before but not yet at the top of the range. */
  | { kind: 'more-reps'; equipment: 'bodyweight' | 'band' }
  /** Bodyweight or band, never done before. */
  | { kind: 'first-time'; equipment: 'bodyweight' | 'band' };

/** `previousSets` are the completed sets from the last session she did this exercise in. */
export function getWeightSuggestion(
  item: ProgrammeExercise,
  previousSets: LoggedSet[] = []
): WeightSuggestion {
  const { equipment, weight_increase_kg } = item.exercise;
  const firstSet = previousSets.find((set) => set.set_number === 1);
  const hitTop = firstSet !== undefined && (firstSet.reps ?? 0) >= item.rep_max;

  if (equipment === 'bodyweight' || equipment === 'band') {
    if (previousSets.length === 0) return { kind: 'first-time', equipment };
    return hitTop ? { kind: 'harder-variation', equipment } : { kind: 'more-reps', equipment };
  }

  const lastKg = heaviestWeight(previousSets);
  if (lastKg === null) return { kind: 'find-starting-weight' };
  const baseKg = firstSet?.weight_kg ?? null;
  if (!hitTop || baseKg === null || !weight_increase_kg) return { kind: 'same-weight', kg: lastKg };
  const kg = Math.max(0, Number((baseKg + weight_increase_kg).toFixed(2)));
  if (kg === baseKg) return { kind: 'same-weight', kg: lastKg };
  return { kind: 'increase', kg, changeKg: kg - baseKg };
}

/** The suggestion line on the Today card. */
export function describeWeightSuggestion(suggestion: WeightSuggestion): string {
  switch (suggestion.kind) {
    case 'increase': {
      const change =
        suggestion.changeKg > 0
          ? `up ${formatKg(suggestion.changeKg)}`
          : `${formatKg(-suggestion.changeKg)} less help`;
      return `Try ${formatKg(suggestion.kg)} (${change}). You hit the top of the range last time`;
    }
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
      return suggestion.changeKg > 0
        ? `Go up to ${formatKg(suggestion.kg)} today. You hit the top of the range last time`
        : `Try ${formatKg(suggestion.kg)} today, a little less help. You hit the top of the range last time`;
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
