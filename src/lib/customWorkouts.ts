import { supabase } from '@/lib/supabase';
import {
  SLOT_EXERCISE_COLUMNS,
  toSlotExercise,
  type ProgrammeDay,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';

/** Shared beginner workout from supabase/custom_workouts.sql. */
export const STARTER_WORKOUT_ID = '11111111-1111-4111-8111-111111111111';

export const MIN_WORKOUT_NAME = 1;
export const MAX_WORKOUT_NAME = 60;
export const MAX_WORKOUT_EXERCISES = 12;
export const MIN_SETS = 1;
export const MAX_SETS = 6;
export const MIN_REPS = 1;
export const MAX_REPS = 30;

export const DEFAULT_SLOT = { sets: 3, rep_min: 8, rep_max: 12 } as const;

export type CustomWorkoutExercise = {
  id: string;
  position: number;
  sets: number;
  rep_min: number;
  rep_max: number;
  exercise: SlotExercise;
};

export type CustomWorkout = {
  id: string;
  user_id: string | null;
  name: string;
  is_starter: boolean;
  created_at: string;
  updated_at: string;
  exercises: CustomWorkoutExercise[];
};

function isMissingCustomWorkouts(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`;
  return /42P01|custom_workouts|custom_workout_exercises/i.test(detail);
}

export function missingCustomWorkoutsMessage(): string {
  return 'Custom workouts need supabase/custom_workouts.sql run in the Supabase SQL editor.';
}

type WorkoutRow = {
  id: string;
  user_id: string | null;
  name: string;
  is_starter: boolean;
  created_at: string;
  updated_at: string;
  custom_workout_exercises: {
    id: string;
    position: number;
    sets: number;
    rep_min: number;
    rep_max: number;
    exercise: SlotExercise;
  }[];
};

const WORKOUT_SELECT = `
  id, user_id, name, is_starter, created_at, updated_at,
  custom_workout_exercises (
    id, position, sets, rep_min, rep_max,
    exercise:exercises (${SLOT_EXERCISE_COLUMNS})
  )
`;

function toWorkout(row: WorkoutRow): CustomWorkout {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    is_starter: row.is_starter,
    created_at: row.created_at,
    updated_at: row.updated_at,
    exercises: [...(row.custom_workout_exercises ?? [])]
      .map((item) => ({
        id: item.id,
        position: item.position,
        sets: item.sets,
        rep_min: item.rep_min,
        rep_max: item.rep_max,
        exercise: toSlotExercise(item.exercise),
      }))
      .sort((a, b) => a.position - b.position),
  };
}

/** So Today and the logger can reuse the programme-day shape. */
export function customWorkoutToDay(workout: CustomWorkout): ProgrammeDay {
  return {
    id: workout.id,
    day_number: 1,
    name: workout.name,
    exercises: workout.exercises.map(
      (item): ProgrammeExercise => ({
        position: item.position,
        sets: item.sets,
        rep_min: item.rep_min,
        rep_max: item.rep_max,
        exercise: item.exercise,
      })
    ),
  };
}

export function trimWorkoutName(name: string): string {
  return name.trim().slice(0, MAX_WORKOUT_NAME);
}

/** Library rows for the builder. Includes zone so she can filter; any zone is allowed. */
export async function fetchExercisesForBuilder(): Promise<SlotExercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select(SLOT_EXERCISE_COLUMNS)
    .order('name');
  if (error) throw error;
  return ((data ?? []) as SlotExercise[]).map(toSlotExercise);
}

export async function fetchCustomWorkouts(): Promise<CustomWorkout[]> {
  try {
    const { data, error } = await supabase
      .from('custom_workouts')
      .select(WORKOUT_SELECT)
      .order('is_starter', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as WorkoutRow[]).map(toWorkout);
  } catch (error) {
    if (error && typeof error === 'object' && isMissingCustomWorkouts(error)) return [];
    throw error;
  }
}

export async function fetchCustomWorkout(id: string): Promise<CustomWorkout | null> {
  const { data, error } = await supabase
    .from('custom_workouts')
    .select(WORKOUT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (isMissingCustomWorkouts(error)) return null;
    throw error;
  }
  return data ? toWorkout(data as unknown as WorkoutRow) : null;
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('You need to be signed in.');
  return data.user.id;
}

async function replaceExercises(
  workoutId: string,
  exercises: { position: number; sets: number; rep_min: number; rep_max: number; exercise_id: string }[]
): Promise<void> {
  const { error: removeError } = await supabase
    .from('custom_workout_exercises')
    .delete()
    .eq('custom_workout_id', workoutId);
  if (removeError) throw removeError;
  if (exercises.length === 0) return;
  const { error } = await supabase.from('custom_workout_exercises').insert(
    exercises.map((item) => ({
      custom_workout_id: workoutId,
      exercise_id: item.exercise_id,
      position: item.position,
      sets: item.sets,
      rep_min: item.rep_min,
      rep_max: item.rep_max,
    }))
  );
  if (error) throw error;
}

export type WorkoutDraftSlot = {
  exercise: SlotExercise;
  sets: number;
  rep_min: number;
  rep_max: number;
};

export async function saveCustomWorkout(
  id: string | null,
  name: string,
  slots: WorkoutDraftSlot[]
): Promise<CustomWorkout> {
  const trimmed = trimWorkoutName(name);
  if (trimmed.length < MIN_WORKOUT_NAME) throw new Error('Give this workout a name.');
  if (slots.length === 0) throw new Error('Add at least one exercise.');
  if (slots.length > MAX_WORKOUT_EXERCISES) {
    throw new Error(`Keep it to ${MAX_WORKOUT_EXERCISES} exercises.`);
  }

  const rows = slots.map((slot, index) => ({
    position: index + 1,
    sets: slot.sets,
    rep_min: slot.rep_min,
    rep_max: slot.rep_max,
    exercise_id: slot.exercise.id,
  }));

  if (id) {
    const { error } = await supabase
      .from('custom_workouts')
      .update({ name: trimmed })
      .eq('id', id)
      .eq('is_starter', false);
    if (error) throw error;
    await replaceExercises(id, rows);
    const saved = await fetchCustomWorkout(id);
    if (!saved) throw new Error('That workout didn’t save.');
    return saved;
  }

  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('custom_workouts')
    .insert({ user_id: userId, name: trimmed, is_starter: false })
    .select('id')
    .single();
  if (error) throw error;
  await replaceExercises(data.id as string, rows);
  const saved = await fetchCustomWorkout(data.id as string);
  if (!saved) throw new Error('That workout didn’t save.');
  return saved;
}

export async function deleteCustomWorkout(id: string): Promise<void> {
  const { error } = await supabase
    .from('custom_workouts')
    .delete()
    .eq('id', id)
    .eq('is_starter', false);
  if (error) throw error;
}

export async function duplicateCustomWorkout(workout: CustomWorkout): Promise<CustomWorkout> {
  const copyName = trimWorkoutName(
    workout.name.endsWith(' (copy)') ? workout.name : `${workout.name} (copy)`
  );
  return saveCustomWorkout(
    null,
    copyName,
    workout.exercises.map((item) => ({
      exercise: item.exercise,
      sets: item.sets,
      rep_min: item.rep_min,
      rep_max: item.rep_max,
    }))
  );
}

/** "Every time" on a saved workout: change that slot in the template. */
export async function replaceCustomWorkoutExercise(
  workoutId: string,
  position: number,
  exerciseId: string
): Promise<void> {
  const { error } = await supabase
    .from('custom_workout_exercises')
    .update({ exercise_id: exerciseId })
    .eq('custom_workout_id', workoutId)
    .eq('position', position);
  if (error) throw error;
}
