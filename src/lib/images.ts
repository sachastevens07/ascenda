import type { ImageSourcePropType } from 'react-native';

import type { CoverImage } from '@/lib/routines';
import { supabase } from '@/lib/supabase';

/** Public bucket for routine covers. Swap a file here, or change `images.url`, without editing screens. */
export const ROUTINE_COVERS_BUCKET = 'routine-covers';

export type ImageCatalogueEntry = {
  id: string;
  alt_text: string;
  photographer: string;
  page_url: string;
  licence_source: string;
  storage_path: string;
  /** Original compressed Pexels URL. Used only if the local file is missing. */
  fallback_url: string;
  asset: ImageSourcePropType;
};

function entry(
  id: string,
  alt_text: string,
  photographer: string,
  photoId: string,
  asset: ImageSourcePropType
): ImageCatalogueEntry {
  const page_url = `https://www.pexels.com/photo/${photoId}/`;
  return {
    id,
    alt_text,
    photographer,
    page_url,
    licence_source: `Photo by ${photographer} on Pexels. Pexels Licence (commercial use). ${page_url}`,
    storage_path: `${id}.jpg`,
    fallback_url: `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.jpeg?auto=compress&cs=tinysrgb&w=1400`,
    asset,
  };
}

/**
 * Local reference for routine covers. Add a row here when you add an `images` row.
 * To replace a photo: upload `{id}.jpg` to the `routine-covers` bucket and set `images.url`
 * to that public URL, or change `images.url` to any other licensed URL.
 */
export const IMAGE_CATALOGUE: Record<string, ImageCatalogueEntry> = {
  'cover-gym-confidence-6': entry(
    'cover-gym-confidence-6',
    'Woman holding a dumbbell in a bright gym',
    'Andrea Piacquadio',
    '3757376',
    require('../../assets/covers/cover-gym-confidence-6.jpg')
  ),
  'cover-full-body-3': entry(
    'cover-full-body-3',
    'Women lifting dumbbells together in a bright studio',
    'Andrea Piacquadio',
    '3768868',
    require('../../assets/covers/cover-full-body-3.jpg')
  ),
  'cover-one-spot-6': entry(
    'cover-one-spot-6',
    'Woman training with two dumbbells in one gym spot',
    'Andrea Piacquadio',
    '3757370',
    require('../../assets/covers/cover-one-spot-6.jpg')
  ),
  'cover-busy-gym-6': entry(
    'cover-busy-gym-6',
    'Woman using a lat pulldown machine',
    'Andrea Piacquadio',
    '3854187',
    require('../../assets/covers/cover-busy-gym-6.jpg')
  ),
  'cover-upper-lower-4': entry(
    'cover-upper-lower-4',
    'Woman using an upper-body machine',
    'Andrea Piacquadio',
    '3768183',
    require('../../assets/covers/cover-upper-lower-4.jpg')
  ),
  'cover-lower-body-3': entry(
    'cover-lower-body-3',
    'Women doing squats in a bright studio',
    'Andrea Piacquadio',
    '3775566',
    require('../../assets/covers/cover-lower-body-3.jpg')
  ),
  'cover-full-body-2': entry(
    'cover-full-body-2',
    'Women training with dumbbells in a bright gym',
    'Andrea Piacquadio',
    '3768696',
    require('../../assets/covers/cover-full-body-2.jpg')
  ),
  'cover-home-strength-6': entry(
    'cover-home-strength-6',
    'Woman training on a stability ball',
    'Andrea Piacquadio',
    '3757377',
    require('../../assets/covers/cover-home-strength-6.jpg')
  ),
  'cover-upper-body-6': entry(
    'cover-upper-body-6',
    'Woman doing a shoulder press on a gym machine',
    'Andrea Piacquadio',
    '3775576',
    require('../../assets/covers/cover-upper-body-6.jpg')
  ),
  'cover-glute-builder-6': entry(
    'cover-glute-builder-6',
    'Woman using gym equipment for lower-body work',
    'Andrea Piacquadio',
    '3775567',
    require('../../assets/covers/cover-glute-builder-6.jpg')
  ),
  'cover-joint-friendly-6': entry(
    'cover-joint-friendly-6',
    'Woman sitting with a fit ball in a gym',
    'Andrea Piacquadio',
    '3768593',
    require('../../assets/covers/cover-joint-friendly-6.jpg')
  ),
  'cover-short-cycle-4': entry(
    'cover-short-cycle-4',
    'Women in a group dumbbell session',
    'Andrea Piacquadio',
    '863926',
    require('../../assets/covers/cover-short-cycle-4.jpg')
  ),
  'cover-barbell-strength-8': entry(
    'cover-barbell-strength-8',
    'Woman lifting weights in a gym',
    'Andrea Piacquadio',
    '3768162',
    require('../../assets/covers/cover-barbell-strength-8.jpg')
  ),
  'cover-one-spot-2': entry(
    'cover-one-spot-2',
    'Women training with dumbbells in a bright studio',
    'Andrea Piacquadio',
    '3768690',
    require('../../assets/covers/cover-one-spot-2.jpg')
  ),
};

export function coverForRoutine(routine: {
  id: string;
  cover: CoverImage | null;
}): CoverImage | null {
  return resolveCover(routine.cover, routine.id);
}

export function resolveCover(cover: CoverImage | null, routineId?: string): CoverImage | null {
  const id = cover?.id ?? (routineId ? `cover-${routineId}` : null);
  const listed = id ? IMAGE_CATALOGUE[id] : undefined;
  if (!listed && !cover) return null;
  return {
    id: id ?? cover?.id ?? '',
    url: cover?.url ?? null,
    storage_path: cover?.storage_path ?? listed?.storage_path ?? null,
    alt_text: cover?.alt_text || listed?.alt_text || '',
    licence_source: cover?.licence_source ?? listed?.licence_source ?? null,
  };
}

export function publicCoverUrl(storagePath: string): string | null {
  const { data } = supabase.storage.from(ROUTINE_COVERS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl || null;
}

/** Prefer a swapped database URL, then the bundled file, then storage. */
export function coverSources(cover: CoverImage | null): ImageSourcePropType[] {
  const resolved = resolveCover(cover);
  if (!resolved) return [];
  const listed = IMAGE_CATALOGUE[resolved.id];
  const swapped = Boolean(resolved.url && resolved.url !== listed?.fallback_url);
  const sources: ImageSourcePropType[] = [];
  if (swapped && resolved.url) sources.push({ uri: resolved.url });
  if (listed?.asset) sources.push(listed.asset);
  if (!swapped && resolved.url) sources.push({ uri: resolved.url });
  if (resolved.storage_path) {
    const stored = publicCoverUrl(resolved.storage_path);
    if (stored) sources.push({ uri: stored });
  }
  return sources;
}
