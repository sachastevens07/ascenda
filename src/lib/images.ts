import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImageSourcePropType } from 'react-native';

import manifestFile from '../../content/images/image-manifest.json';
import type { CoverImage } from '@/lib/routines';
import { supabase } from '@/lib/supabase';

/**
 * Every photo in the app is a slug in content/images/image-manifest.json.
 * A slug is shown only when the images row is status "ready" and has
 * licence_source, photographer and source_url. same_as slugs reuse that file.
 * Anything else resolves to null so the screen can show a placeholder.
 */

export const ROUTINE_COVERS_BUCKET = 'routine-covers';

const CACHE_KEY = 'ascenda.images.v2';

export type ImageKind = 'people' | 'equipment' | 'food';

export type ContentImage = {
  slug: string;
  alt_text: string;
  kind: ImageKind;
};

type ManifestEntry = {
  slug: string;
  used_in?: string[];
  kind?: string;
  brief?: string;
  same_as?: string | null;
};

type ImageRecord = {
  slug: string;
  kind: ImageKind | null;
  usedIn: string[];
  sameAs: string | null;
  status: 'needed' | 'ready';
  url: string | null;
  storagePath: string | null;
  altText: string;
  licenceSource: string | null;
  photographer: string | null;
  photographerUrl: string | null;
  sourceUrl: string | null;
  modelRelease: string | null;
};

type RemoteRow = {
  id?: string | null;
  slug?: string | null;
  kind?: string | null;
  same_as?: string | null;
  status?: string | null;
  url?: string | null;
  storage_path?: string | null;
  alt_text?: string | null;
  licence_source?: string | null;
  photographer?: string | null;
  photographer_url?: string | null;
  source_url?: string | null;
  model_release?: string | null;
};

const REMOTE_COLUMNS =
  'id, slug, kind, same_as, status, url, storage_path, alt_text, licence_source, photographer, photographer_url, source_url, model_release';
const REMOTE_COLUMNS_BASE =
  'id, slug, kind, same_as, status, url, storage_path, alt_text, licence_source, photographer, source_url, model_release';

const manifestImages = (manifestFile as { images: ManifestEntry[] }).images;
const bySlug = new Map<string, ImageRecord>();

function isKind(value: string | null | undefined): value is ImageKind {
  return value === 'people' || value === 'equipment' || value === 'food';
}

function seedManifest(): void {
  for (const item of manifestImages) {
    if (!item.slug) continue;
    bySlug.set(item.slug, {
      slug: item.slug,
      kind: isKind(item.kind) ? item.kind : null,
      usedIn: Array.isArray(item.used_in) ? item.used_in : [],
      sameAs: item.same_as || null,
      status: 'needed',
      url: null,
      storagePath: null,
      altText: item.brief?.trim() || item.slug,
      licenceSource: null,
      photographer: null,
      photographerUrl: null,
      sourceUrl: null,
      modelRelease: null,
    });
  }
}

seedManifest();

function applyRemote(row: RemoteRow): void {
  const slug = (row.slug || row.id || '').trim();
  if (!slug) return;
  const current = bySlug.get(slug);
  bySlug.set(slug, {
    slug,
    kind: isKind(row.kind) ? row.kind : current?.kind ?? null,
    usedIn: current?.usedIn ?? [],
    sameAs: row.same_as ?? current?.sameAs ?? null,
    status: row.status === 'ready' ? 'ready' : 'needed',
    url: row.url ?? null,
    storagePath: row.storage_path ?? null,
    altText: row.alt_text?.trim() || current?.altText || slug,
    licenceSource: row.licence_source ?? null,
    photographer: row.photographer ?? null,
    photographerUrl: row.photographer_url ?? current?.photographerUrl ?? null,
    sourceUrl: row.source_url ?? null,
    modelRelease: row.model_release ?? null,
  });
}

export const CONTENT_IMAGES: ContentImage[] = manifestImages
  .filter((item): item is ManifestEntry & { kind: ImageKind } => isKind(item.kind))
  .map((item) => ({
    slug: item.slug,
    alt_text: item.brief?.trim() || item.slug,
    kind: item.kind,
  }));

let cacheApplied = false;

/** Load ready rows from the device, then refresh from Supabase. Never throws. */
export async function hydrateImages(): Promise<void> {
  if (!cacheApplied) {
    cacheApplied = true;
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const rows = JSON.parse(cached) as RemoteRow[];
        if (Array.isArray(rows)) {
          for (const row of rows) applyRemote(row);
        }
      }
    } catch {
      // A bad cache must not block placeholders.
    }
  }

  let result = await supabase.from('images').select(REMOTE_COLUMNS);
  if (result.error) result = await supabase.from('images').select(REMOTE_COLUMNS_BASE);
  const { data, error } = result;
  if (error || !Array.isArray(data)) return;
  for (const row of data) applyRemote(row as RemoteRow);
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => {});
}

function canonical(slug: string | null | undefined, depth = 0): ImageRecord | null {
  if (!slug || depth > 4) return null;
  const row = bySlug.get(slug);
  if (!row) return null;
  if (row.sameAs && row.sameAs !== row.slug) {
    const target = canonical(row.sameAs, depth + 1);
    return target ?? row;
  }
  return row;
}

export function publicCoverUrl(storagePath: string): string | null {
  const { data } = supabase.storage.from(ROUTINE_COVERS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl || null;
}

export type PhotoCredit = {
  slug: string;
  altText: string;
  photographer: string;
  photographerUrl: string | null;
  sourceUrl: string;
};

/** Ready photos, one line each, for Profile, About, Photo credits. */
export function photoCredits(): PhotoCredit[] {
  const credits: PhotoCredit[] = [];
  for (const row of bySlug.values()) {
    if (row.sameAs && row.sameAs !== row.slug) continue;
    if (!isReady(row) || !row.photographer || !row.sourceUrl) continue;
    credits.push({
      slug: row.slug,
      altText: row.altText,
      photographer: row.photographer,
      photographerUrl: row.photographerUrl,
      sourceUrl: row.sourceUrl,
    });
  }
  credits.sort((a, b) => a.altText.localeCompare(b.altText));
  return credits;
}

function fileUrl(row: ImageRecord): string | null {
  if (row.url && /^https?:\/\//.test(row.url)) return row.url;
  if (row.storagePath) return publicCoverUrl(row.storagePath);
  return null;
}

function isReady(row: ImageRecord): boolean {
  return (
    row.status === 'ready' &&
    Boolean(row.licenceSource?.trim()) &&
    Boolean(row.photographer?.trim()) &&
    Boolean(row.sourceUrl?.trim()) &&
    Boolean(fileUrl(row))
  );
}

export function imageFileKey(slug: string | null | undefined): string {
  return canonical(slug)?.slug ?? slug ?? '';
}

export function imageKindForSlug(slug: string | null | undefined): ImageKind | null {
  return canonical(slug)?.kind ?? null;
}

export function contentImage(slug: string | null | undefined): ContentImage | undefined {
  const row = slug ? bySlug.get(slug) : undefined;
  if (!row?.kind) return undefined;
  return { slug: row.slug, alt_text: row.altText, kind: row.kind };
}

/** Match a title to a manifest slug. `scope` is learn, challenge, stretch or routine. */
export function contentSlugForTitle(title: string, scope?: string): string | null {
  const needle = title
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!needle) return null;
  for (const row of bySlug.values()) {
    if (scope === 'learn' && !row.slug.startsWith('learn-')) continue;
    if (scope === 'challenge' && !row.slug.startsWith('challenge-')) continue;
    if (scope === 'stretch' && !row.slug.startsWith('stretch-') && !row.slug.endsWith('-cover')) continue;
    if (scope === 'routine' && !row.slug.endsWith('-cover')) continue;
    if (
      row.slug === needle ||
      row.slug === `${needle}-cover` ||
      row.slug === `challenge-${needle}` ||
      row.slug === `learn-${needle}` ||
      row.slug.endsWith(`-${needle}`)
    ) {
      return row.slug;
    }
  }
  return null;
}

function slugFromUsedIn(name: string, scope: 'routine' | 'stretch' | 'challenge' | 'learn'): string | null {
  const needle = name.trim().toLowerCase();
  if (needle.length < 3) return null;
  let found: string | null = null;
  for (const row of bySlug.values()) {
    if (scope === 'routine' && !row.slug.endsWith('-cover')) continue;
    if (scope === 'stretch' && !row.slug.endsWith('-cover') && !row.slug.startsWith('stretch-')) continue;
    if (scope === 'challenge' && !row.slug.startsWith('challenge-')) continue;
    if (scope === 'learn' && !row.slug.startsWith('learn-')) continue;
    const hit = row.usedIn.some((place) => place.toLowerCase().includes(needle));
    if (!hit) continue;
    if (found && found !== row.slug) return null;
    found = row.slug;
  }
  return found;
}

function pickRoutineSlug(routine: {
  slug?: string;
  name?: string;
  type?: 'strength' | 'stretch';
  cover?: CoverImage | null;
}): string | null {
  const scope = routine.type === 'stretch' ? 'stretch' : 'routine';
  if (routine.slug && bySlug.has(`${routine.slug}-cover`)) return `${routine.slug}-cover`;
  if (routine.slug && bySlug.has(routine.slug)) return routine.slug;
  if (routine.cover?.id && bySlug.has(routine.cover.id)) return routine.cover.id;
  if (routine.name) return slugFromUsedIn(routine.name, scope) ?? contentSlugForTitle(routine.name, scope);
  return null;
}

export function routineCoverSlug(routine: {
  slug?: string;
  name?: string;
  type?: 'strength' | 'stretch';
}): string | null {
  return pickRoutineSlug(routine);
}

export function resolveCover(cover: CoverImage | null, slugOrRoutineId?: string): CoverImage | null {
  const requested = slugOrRoutineId || cover?.id || null;
  const row = canonical(requested);
  if (!row) return null;
  const ready = isReady(row);
  const url = ready ? fileUrl(row) : null;
  return {
    id: requested && bySlug.has(requested) ? requested : row.slug,
    url,
    storage_path: ready ? row.storagePath : null,
    alt_text: row.altText || cover?.alt_text || '',
    licence_source: ready ? row.licenceSource : null,
    kind: row.kind,
  };
}

export function coverForRoutine(routine: {
  id: string;
  slug?: string;
  name?: string;
  type?: 'strength' | 'stretch';
  cover: CoverImage | null;
}): CoverImage | null {
  const slug = pickRoutineSlug(routine);
  if (!slug) return null;
  return resolveCover(routine.cover, slug);
}

export function coverForChallenge(challenge: {
  name: string;
  coverSlug?: string | null;
  cover?: CoverImage | null;
}): CoverImage | null {
  const slug =
    (challenge.coverSlug && bySlug.has(challenge.coverSlug) ? challenge.coverSlug : null) ||
    contentSlugForTitle(challenge.name, 'challenge') ||
    slugFromUsedIn(challenge.name, 'challenge');
  if (!slug) return null;
  return resolveCover(challenge.cover ?? null, slug);
}

export function coverSources(cover: CoverImage | null): ImageSourcePropType[] {
  if (!cover?.url || !cover.licence_source) return [];
  return [{ uri: cover.url }];
}

export function imageSourceForSlug(slug: string | null | undefined): ImageSourcePropType | null {
  if (!slug) return null;
  return coverSources(resolveCover(null, slug))[0] ?? null;
}

export function presentationForSlug(slug: string | null | undefined): {
  source: ImageSourcePropType | null;
  kind: ImageKind | null;
} {
  return {
    source: imageSourceForSlug(slug),
    kind: imageKindForSlug(slug),
  };
}

/** Home hero changes with the day. All five slugs are in the manifest. */
export function homeHeroSlug(state: {
  welcomeBack?: boolean;
  rest?: boolean;
  doneToday?: boolean;
  evening?: boolean;
}): string {
  if (state.welcomeBack) return 'hero-welcome-back';
  if (state.rest) return 'hero-home-rest-day';
  if (state.doneToday) return 'hero-home-done';
  if (state.evening) return 'hero-home-evening';
  return 'hero-home-morning';
}

/** Keep a slug for this screen unless that file is already showing. */
export function takeSlug(slug: string | null | undefined, used: Set<string>): string | null {
  if (!slug) return null;
  const key = imageFileKey(slug);
  if (!key || used.has(key)) return null;
  if (imageSourceForSlug(slug)) used.add(key);
  return slug;
}

export function takeSlugSource(slug: string | null | undefined, used: Set<string>): ImageSourcePropType | null {
  const kept = takeSlug(slug, used);
  return kept ? imageSourceForSlug(kept) : null;
}

export function takeCoverSource(cover: CoverImage | null, used: Set<string>): ImageSourcePropType | null {
  if (!cover?.id) return null;
  const kept = takeSlug(cover.id, used);
  return kept ? coverSources(cover)[0] ?? null : null;
}
