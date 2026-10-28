import type { ImageSourcePropType } from 'react-native';

import { EXERCISE_MEDIA_BUCKET, getMediaUrl } from '@/lib/exercises';
import { supabase } from '@/lib/supabase';

export type ExerciseMediaEntry = {
  id: string;
  alt_text: string;
  photographer: string;
  page_url: string;
  licence_source: string;
  fallback_url: string;
  asset: ImageSourcePropType;
};

function entry(
  id: string,
  alt_text: string,
  photographer: string,
  photoId: string,
  asset: ImageSourcePropType
): ExerciseMediaEntry {
  const page_url = `https://www.pexels.com/photo/${photoId}/`;
  return {
    id,
    alt_text,
    photographer,
    page_url,
    licence_source: `Photo by ${photographer} on Pexels. Pexels Licence (commercial use). ${page_url}`,
    fallback_url: `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.jpeg?auto=compress&cs=tinysrgb&w=1200`,
    asset,
  };
}

/**
 * Only exercises with a clearly matching stock photo. Add a row here when you
 * find an accurate licensed image. Swap by changing `exercises.media_url`.
 */
export const EXERCISE_MEDIA: Record<string, ExerciseMediaEntry> = {
  'barbell-deadlift': entry(
    'barbell-deadlift',
    'Woman setting up a conventional barbell deadlift',
    'Jonathan',
    '13822300',
    require('../../assets/exercises/barbell-deadlift.jpg')
  ),
  'barbell-overhead-press': entry(
    'barbell-overhead-press',
    'Woman pressing a barbell overhead',
    'Alejandro Aznar',
    '32317373',
    require('../../assets/exercises/barbell-overhead-press.jpg')
  ),
  'bodyweight-squat': entry(
    'bodyweight-squat',
    'Woman in the bottom of a bodyweight squat',
    'MART PRODUCTION',
    '8032754',
    require('../../assets/exercises/bodyweight-squat.jpg')
  ),
  'dumbbell-biceps-curl': entry(
    'dumbbell-biceps-curl',
    'Woman curling a pair of dumbbells',
    'MART PRODUCTION',
    '8846565',
    require('../../assets/exercises/dumbbell-biceps-curl.jpg')
  ),
  'dumbbell-reverse-lunge': entry(
    'dumbbell-reverse-lunge',
    'Woman in a reverse lunge holding a dumbbell',
    'MART PRODUCTION',
    '8846122',
    require('../../assets/exercises/dumbbell-reverse-lunge.jpg')
  ),
  'kettlebell-deadlift': entry(
    'kettlebell-deadlift',
    'Woman picking up a kettlebell from the floor',
    'Miguel González',
    '14623711',
    require('../../assets/exercises/kettlebell-deadlift.jpg')
  ),
  'kettlebell-swing': entry(
    'kettlebell-swing',
    'Woman at the top of a kettlebell swing',
    'Edgar Santos T.',
    '14252286',
    require('../../assets/exercises/kettlebell-swing.jpg')
  ),
  'lat-pulldown': entry(
    'lat-pulldown',
    'Woman using a lat pulldown machine',
    'Andrea Piacquadio',
    '3854187',
    require('../../assets/exercises/lat-pulldown.jpg')
  ),
  'machine-shoulder-press': entry(
    'machine-shoulder-press',
    'Woman pressing on a shoulder machine',
    'Andrea Piacquadio',
    '3768183',
    require('../../assets/exercises/machine-shoulder-press.jpg')
  ),
  plank: entry(
    'plank',
    'Woman holding a forearm plank',
    'Pavel Danilyuk',
    '7801525',
    require('../../assets/exercises/plank.jpg')
  ),
  'pull-up': entry(
    'pull-up',
    'Woman performing a pull-up',
    'César Pérez',
    '14148334',
    require('../../assets/exercises/pull-up.jpg')
  ),
  'push-up': entry(
    'push-up',
    'Woman in a high plank, the top of a push-up',
    'Polina Tankilevitch',
    '6739040',
    require('../../assets/exercises/push-up.jpg')
  ),
  'renegade-row': entry(
    'renegade-row',
    'Woman rowing a dumbbell from a plank',
    'The Lazy Artist Gallery',
    '2247179',
    require('../../assets/exercises/renegade-row.jpg')
  ),
  'side-plank': entry(
    'side-plank',
    'Woman holding a side plank',
    'John Tekeridis',
    '14843543',
    require('../../assets/exercises/side-plank.jpg')
  ),
};

export function getExerciseImageSource(exercise: {
  id: string;
  media_url?: string | null;
}): ImageSourcePropType | null {
  const listed = EXERCISE_MEDIA[exercise.id];
  const mediaUrl = exercise.media_url ?? null;
  const swapped = Boolean(mediaUrl && mediaUrl !== listed?.fallback_url);
  if (swapped && mediaUrl) {
    if (/^https?:\/\//.test(mediaUrl)) return { uri: mediaUrl };
    return { uri: supabase.storage.from(EXERCISE_MEDIA_BUCKET).getPublicUrl(mediaUrl).data.publicUrl };
  }
  if (listed?.asset) return listed.asset;
  const remote = getMediaUrl({ media_url: mediaUrl });
  return remote ? { uri: remote } : null;
}
