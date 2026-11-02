import { supabase } from '@/lib/supabase';

export const MUSCLES = [
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'core',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<Muscle, string> = {
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  adductors: 'Inner thighs',
  calves: 'Calves',
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  core: 'Core',
};

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'kettlebell',
  'band',
  'bodyweight',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  kettlebell: 'Kettlebell',
  band: 'Band',
  bodyweight: 'Bodyweight',
};

/** Where in the gym an exercise is done. Keep in step with supabase/zones.sql. */
export const ZONES = [1, 2, 3, 4] as const;
export type Zone = (typeof ZONES)[number];

export const ZONE_LABELS: Record<Zone, string> = {
  1: 'Corner',
  2: 'Dumbbell area',
  3: 'Machines',
  4: 'Barbell and squat rack',
};

/** Filters in the custom workout builder (R5). Honest gym-anxiety tags, not medical. */
export const BUILDER_TAGS = ['one-spot', 'busy-gym', 'minimal-equipment'] as const;
export type BuilderTag = (typeof BUILDER_TAGS)[number];

export const BUILDER_TAG_LABELS: Record<BuilderTag, string> = {
  'one-spot': 'One Spot',
  'busy-gym': 'Busy Gym Friendly',
  'minimal-equipment': 'Minimal Equipment',
};

export function exerciseMatchesBuilderTag(
  exercise: { zone: Zone; equipment: Equipment },
  tag: BuilderTag
): boolean {
  if (tag === 'one-spot') return exercise.zone === 1;
  if (tag === 'busy-gym') return exercise.equipment === 'machine' || exercise.equipment === 'cable';
  return (
    exercise.equipment === 'dumbbell' ||
    exercise.equipment === 'bodyweight' ||
    exercise.equipment === 'band'
  );
}

/** Supabase Storage bucket for exercise photos. Files named `<exercise id>.<ext>` link themselves. */
export const EXERCISE_MEDIA_BUCKET = 'exercise-media';

/** One row of the `exercises` table in Supabase. */
export type Exercise = {
  id: string;
  name: string;
  primary_muscle: Muscle;
  secondary_muscles: Muscle[];
  equipment: Equipment;
  zone: Zone;
  /** A path in the exercise-media bucket, or a full https URL. Use `getMediaUrl` to display it. */
  media_url: string | null;
  cues: string[];
  location_hint: string;
};

export function getMediaUrl(exercise: Pick<Exercise, 'media_url'>): string | null {
  const { media_url } = exercise;
  if (!media_url) return null;
  if (/^https?:\/\//.test(media_url)) return media_url;
  return supabase.storage.from(EXERCISE_MEDIA_BUCKET).getPublicUrl(media_url).data.publicUrl;
}

const EXERCISE_COLUMNS =
  'id, name, primary_muscle, secondary_muscles, equipment, zone, media_url, cues, location_hint';

export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select(EXERCISE_COLUMNS)
    .order('name');
  if (error) throw error;
  return (data ?? []) as Exercise[];
}

export async function fetchExercise(id: string): Promise<Exercise | null> {
  const { data, error } = await supabase
    .from('exercises')
    .select(EXERCISE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Exercise | null;
}
