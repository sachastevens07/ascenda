import type { ImageSourcePropType } from 'react-native';

import { EXERCISE_MEDIA_BUCKET } from '@/lib/exercises';
import { supabase } from '@/lib/supabase';

/**
 * Exercise demos come from WorkoutX (media_url on the exercise), not stock photos.
 * A Pexels or Unsplash URL left on an old row is ignored.
 */
export function getExerciseImageSource(exercise: {
  id: string;
  media_url?: string | null;
}): ImageSourcePropType | null {
  const mediaUrl = exercise.media_url?.trim() ?? '';
  if (!mediaUrl) return null;
  if (/pexels\.com|unsplash\.com/i.test(mediaUrl)) return null;
  if (/^https?:\/\//.test(mediaUrl)) return { uri: mediaUrl };
  const { data } = supabase.storage.from(EXERCISE_MEDIA_BUCKET).getPublicUrl(mediaUrl);
  return data.publicUrl ? { uri: data.publicUrl } : null;
}
