import type { ImageSourcePropType } from 'react-native';

import catalogue from '../../content/images/catalogue.json';
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
 * Local reference for routine and stretch covers. Add a row here when you add an `images` row.
 * To replace a photo: upload `{id}.jpg` to the `routine-covers` bucket and set `images.url`
 * to that public URL, or change `images.url` to any other licensed URL.
 */
export const IMAGE_CATALOGUE: Record<string, ImageCatalogueEntry> = {
  'cover-gym-confidence-6': entry(
    'cover-gym-confidence-6',
    'Woman tying her trainers before a gym session',
    'cottonbro studio',
    '4753986',
    require('../../assets/covers/cover-gym-confidence-6.jpg')
  ),
  'cover-full-body-3': entry(
    'cover-full-body-3',
    'Woman swinging a kettlebell in a gym',
    'Pixabay',
    '416809',
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
    'Woman lifting a barbell in a gym',
    'Ali Alcántara',
    '14591531',
    require('../../assets/covers/cover-lower-body-3.jpg')
  ),
  'cover-full-body-2': entry(
    'cover-full-body-2',
    'Woman training with suspension straps in a gym',
    'Pixabay',
    '414029',
    require('../../assets/covers/cover-full-body-2.jpg')
  ),
  'cover-home-strength-6': entry(
    'cover-home-strength-6',
    'Woman squatting in a living room',
    'MART PRODUCTION',
    '8846119',
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
    'Woman using a gym machine at an easy pace',
    'Andrea Piacquadio',
    '3768916',
    require('../../assets/covers/cover-joint-friendly-6.jpg')
  ),
  'cover-short-cycle-4': entry(
    'cover-short-cycle-4',
    'Woman holding a pair of dumbbells',
    'Karolina Grabowska',
    '4498294',
    require('../../assets/covers/cover-short-cycle-4.jpg')
  ),
  'cover-barbell-strength-8': entry(
    'cover-barbell-strength-8',
    'Woman lifting dumbbells in a gym, smiling',
    'Miguel González',
    '14623703',
    require('../../assets/covers/cover-barbell-strength-8.jpg')
  ),
  'cover-one-spot-2': entry(
    'cover-one-spot-2',
    'Woman at a dumbbell rack in the gym',
    'André Henrique',
    '11191187',
    require('../../assets/covers/cover-one-spot-2.jpg')
  ),
  'cover-stretch-morning': entry(
    'cover-stretch-morning',
    'Woman stretching on a mat beside a sofa',
    'Pexels',
    '9004756',
    require('../../assets/covers/cover-stretch-morning.jpg')
  ),
  'cover-stretch-desk': entry(
    'cover-stretch-desk',
    'Woman stretching her arm during a break at home',
    'Pexels',
    '7900045',
    require('../../assets/covers/cover-stretch-desk.jpg')
  ),
  'cover-stretch-post-leg': entry(
    'cover-stretch-post-leg',
    'Woman in a seated hamstring stretch on a yoga mat',
    'Pexels',
    '6246255',
    require('../../assets/covers/cover-stretch-post-leg.jpg')
  ),
  'cover-stretch-lower-back': entry(
    'cover-stretch-lower-back',
    'Woman in a child pose on a yoga mat',
    'Vlada Karpovich',
    '4534638',
    require('../../assets/covers/cover-stretch-lower-back.jpg')
  ),
  'cover-stretch-full-body': entry(
    'cover-stretch-full-body',
    'Woman in a low lunge stretch on a yoga mat',
    'Elina Fairytale',
    '3823039',
    require('../../assets/covers/cover-stretch-full-body.jpg')
  ),
  'cover-stretch-upper': entry(
    'cover-stretch-upper',
    'Two women stretching together on a yoga mat',
    'Elina Fairytale',
    '3822190',
    require('../../assets/covers/cover-stretch-upper.jpg')
  ),
  'cover-stretch-hips': entry(
    'cover-stretch-hips',
    'Woman in a pigeon stretch on a yoga mat',
    'Vlada Karpovich',
    '4534662',
    require('../../assets/covers/cover-stretch-hips.jpg')
  ),
  'hero-paywall': entry(
    'hero-paywall',
    'Woman lifting dumbbells in a gym, smiling',
    'Miguel González',
    '14623703',
    require('../../assets/covers/cover-barbell-strength-8.jpg')
  ),
};

export type ContentImageKind = (typeof catalogue.images)[number]['kind'];

export type ContentImage = {
  slug: string;
  kind: ContentImageKind;
  alt_text: string;
};

export const CONTENT_IMAGES: ContentImage[] = catalogue.images as ContentImage[];

const CONTENT_BY_SLUG = new Map(CONTENT_IMAGES.map((item) => [item.slug, item]));

export function contentImage(slug: string | null | undefined): ContentImage | undefined {
  return slug ? CONTENT_BY_SLUG.get(slug) : undefined;
}

export function contentSlugForTitle(title: string, kind?: ContentImageKind): string | null {
  const needle = title.trim().toLowerCase();
  if (!needle) return null;
  const match = CONTENT_IMAGES.find(
    (item) => (!kind || item.kind === kind) && item.alt_text.trim().toLowerCase() === needle
  );
  return match?.slug ?? null;
}

let imageRows = new Map<string, CoverImage>();
let imagesHydrated = false;

export async function hydrateImages(): Promise<void> {
  if (imagesHydrated) return;
  const { data, error } = await supabase
    .from('images')
    .select('id, url, storage_path, alt_text, licence_source');
  if (error || !data) return;
  imageRows = new Map(
    (data as CoverImage[]).flatMap((row) => (row.id ? [[row.id, row] as const] : []))
  );
  imagesHydrated = true;
}

function cachedImage(slug: string): CoverImage | null {
  return imageRows.get(slug) ?? null;
}

function coverFromSlug(slug: string, cover: CoverImage | null): CoverImage {
  const listed = IMAGE_CATALOGUE[slug];
  const content = CONTENT_BY_SLUG.get(slug);
  const cached = cachedImage(slug);
  return {
    id: slug,
    url: cover?.url ?? cached?.url ?? listed?.fallback_url ?? null,
    storage_path: cover?.storage_path ?? cached?.storage_path ?? listed?.storage_path ?? `${slug}.jpg`,
    alt_text: cover?.alt_text || cached?.alt_text || listed?.alt_text || content?.alt_text || '',
    licence_source: cover?.licence_source ?? cached?.licence_source ?? listed?.licence_source ?? null,
  };
}

export function coverForRoutine(routine: {
  id: string;
  slug?: string;
  name?: string;
  type?: 'strength' | 'stretch';
  cover: CoverImage | null;
}): CoverImage | null {
  const kind = routine.type === 'stretch' ? 'stretch' : 'routine';
  const fromDb = routine.cover?.id && CONTENT_BY_SLUG.has(routine.cover.id) ? routine.cover.id : null;
  const fromSlug = routine.slug
    ? CONTENT_BY_SLUG.has(`${routine.slug}-cover`)
      ? `${routine.slug}-cover`
      : CONTENT_BY_SLUG.has(routine.slug)
        ? routine.slug
        : null
    : null;
  const fromName = routine.name ? contentSlugForTitle(routine.name, kind) : null;
  return resolveCover(routine.cover, fromDb ?? fromSlug ?? fromName ?? routine.id);
}

export function coverForChallenge(challenge: {
  name: string;
  coverSlug?: string | null;
  cover?: CoverImage | null;
}): CoverImage | null {
  const slug = challenge.coverSlug || contentSlugForTitle(challenge.name, 'challenge');
  if (slug) return resolveCover(challenge.cover ?? null, slug);
  if (challenge.cover) return resolveCover(challenge.cover);
  return null;
}

export function resolveCover(cover: CoverImage | null, slugOrRoutineId?: string): CoverImage | null {
  if (slugOrRoutineId && CONTENT_BY_SLUG.has(slugOrRoutineId)) {
    const fromDb = cover?.id === slugOrRoutineId ? cover : cachedImage(slugOrRoutineId);
    return coverFromSlug(slugOrRoutineId, fromDb);
  }
  if (cover?.id && (CONTENT_BY_SLUG.has(cover.id) || IMAGE_CATALOGUE[cover.id])) {
    return coverFromSlug(cover.id, cover);
  }
  const byRoutine = slugOrRoutineId ? `cover-${slugOrRoutineId}` : null;
  const listedByRoutine = byRoutine ? IMAGE_CATALOGUE[byRoutine] : undefined;
  if (listedByRoutine) {
    const fromDb = cover?.id === listedByRoutine.id;
    return {
      id: listedByRoutine.id,
      url: fromDb ? cover?.url ?? listedByRoutine.fallback_url : listedByRoutine.fallback_url,
      storage_path: listedByRoutine.storage_path,
      alt_text: (fromDb && cover?.alt_text) || listedByRoutine.alt_text,
      licence_source: (fromDb && cover?.licence_source) || listedByRoutine.licence_source,
    };
  }
  const id = cover?.id ?? byRoutine ?? slugOrRoutineId ?? null;
  if (id && CONTENT_BY_SLUG.has(id)) return coverFromSlug(id, cover);
  const listed = id ? IMAGE_CATALOGUE[id] : undefined;
  if (!listed && !cover && !id) return null;
  if (id) return coverFromSlug(id, cover);
  return cover;
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
  if (listed && resolved.storage_path) {
    const stored = publicCoverUrl(resolved.storage_path);
    if (stored) sources.push({ uri: stored });
  }
  return sources;
}

export function imageSourceForSlug(slug: string | null | undefined): ImageSourcePropType | null {
  if (!slug) return null;
  return coverSources(coverFromSlug(slug, null))[0] ?? null;
}

export function takeSlugSource(
  slug: string | null | undefined,
  used: Set<string>
): ImageSourcePropType | null {
  if (!slug || used.has(slug)) return null;
  const source = imageSourceForSlug(slug);
  if (!source) return null;
  used.add(slug);
  return source;
}

/** First unused photo for this screen, or null so the caller can show a placeholder. */
export function takeCoverSource(cover: CoverImage | null, used: Set<string>): ImageSourcePropType | null {
  const resolved = resolveCover(cover);
  const sources = coverSources(resolved);
  if (!resolved?.id || sources.length === 0) return null;
  if (used.has(resolved.id)) return null;
  used.add(resolved.id);
  return sources[0];
}
