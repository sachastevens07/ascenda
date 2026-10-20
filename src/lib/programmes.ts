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

type ProgrammeRow = Omit<Programme, 'days'> & {
  programme_days: (Omit<ProgrammeDay, 'exercises'> & {
    programme_exercises: ProgrammeExercise[];
  })[];
};

/** Loads a programme with its days and exercises, picking each slot's exercise for `equipment`. */
export async function fetchProgramme(
  id: string,
  equipment: EquipmentAccess
): Promise<Programme | null> {
  // Each slot links to three exercises; the named foreign key picks the one for this equipment.
  const exercise = `exercise:exercises!programme_exercises_${equipment}_fkey(id, name, primary_muscle, equipment)`;
  const { data, error } = await supabase
    .from('programmes')
    .select(
      `id, name, description, days_per_week, programme_days(id, day_number, name, programme_exercises(position, sets, rep_min, rep_max, ${exercise}))`
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { programme_days, ...programme } = data as unknown as ProgrammeRow;
  return {
    ...programme,
    days: programme_days
      .map(({ programme_exercises, ...day }) => ({
        ...day,
        exercises: [...programme_exercises].sort((a, b) => a.position - b.position),
      }))
      .sort((a, b) => a.day_number - b.day_number),
  };
}

export function formatSetsAndReps({ sets, rep_min, rep_max }: ProgrammeExercise): string {
  const reps = rep_min === rep_max ? `${rep_min}` : `${rep_min}–${rep_max}`;
  return `${sets} sets × ${reps} reps`;
}
