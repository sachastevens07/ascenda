import bundled from '../../content/exercises/workoutx-ids.json';
import { supabase } from '@/lib/supabase';

/**
 * Provider-agnostic exercise demo media. Screens must call this instead of
 * WorkoutX (or any other provider) directly.
 *
 * Never log the returned URLs. Signed links are reused in memory until they
 * expire; they are not written to disk.
 */

export type ExerciseMediaView = {
  label: 'default' | 'front' | 'side';
  url: string;
};

export type ExerciseMedia = {
  thumbnailUrl: string | null;
  videos: ExerciseMediaView[];
  expiresAt: string | null;
};

type FunctionOk = {
  ok: true;
  thumbnailUrl?: string | null;
  videos?: { label?: string; url?: string }[];
  expiresAt?: string | null;
};

type FunctionFail = {
  ok?: false;
  reason?: string;
};

type CacheEntry = { media: ExerciseMedia; expiresAtMs: number };

const CACHE_SKEW_MS = 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ExerciseMedia | null>>();
const MATCHES = (bundled as { matches?: { slug?: string; workoutx_id?: string }[] }).matches ?? [];

function hasMatch(exerciseId: string): boolean {
  return MATCHES.some(
    (row) => row.slug === exerciseId && typeof row.workoutx_id === 'string' && /^ex_[A-Za-z0-9]+$/.test(row.workoutx_id)
  );
}

function asView(item: { label?: string; url?: string } | undefined): ExerciseMediaView | null {
  if (!item || typeof item.url !== 'string' || !item.url.startsWith('https://')) return null;
  const label = item.label === 'front' || item.label === 'side' ? item.label : 'default';
  return { label, url: item.url };
}

function fromPayload(body: FunctionOk): ExerciseMedia | null {
  const videos = (body.videos ?? []).map(asView).filter((item): item is ExerciseMediaView => Boolean(item));
  const thumbnail =
    typeof body.thumbnailUrl === 'string' && body.thumbnailUrl.startsWith('https://')
      ? body.thumbnailUrl
      : null;
  if (!thumbnail && videos.length === 0) return null;
  return {
    thumbnailUrl: thumbnail,
    videos,
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
  };
}

function cacheGet(exerciseId: string): ExerciseMedia | null {
  const hit = cache.get(exerciseId);
  if (!hit) return null;
  if (hit.expiresAtMs <= Date.now() + CACHE_SKEW_MS) {
    cache.delete(exerciseId);
    return null;
  }
  return hit.media;
}

function cacheSet(exerciseId: string, media: ExerciseMedia): void {
  const expiresAtMs = media.expiresAt ? Date.parse(media.expiresAt) : Date.now() + 12 * 60 * 60 * 1000;
  if (!Number.isFinite(expiresAtMs)) return;
  cache.set(exerciseId, { media, expiresAtMs });
}

async function fetchMedia(exerciseId: string): Promise<ExerciseMedia | null> {
  const cached = cacheGet(exerciseId);
  if (cached) return cached;
  const pending = inflight.get(exerciseId);
  if (pending) return pending;

  const request = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('exercise-media', {
        body: { exerciseId },
      });
      if (error || !data || typeof data !== 'object') return null;
      const body = data as FunctionOk | FunctionFail;
      if (body.ok !== true) return null;
      const media = fromPayload(body);
      if (media) cacheSet(exerciseId, media);
      return media;
    } catch {
      return null;
    }
  })();

  inflight.set(exerciseId, request);
  try {
    return await request;
  } finally {
    inflight.delete(exerciseId);
  }
}

export async function getExerciseMedia(exerciseId: string): Promise<ExerciseMedia | null> {
  const id = exerciseId.trim();
  if (!id || !hasMatch(id)) return null;
  return fetchMedia(id);
}

/** Cached poster only. Does not call the Edge Function. Safe for long lists. */
export function peekExerciseMedia(exerciseId: string): ExerciseMedia | null {
  const id = exerciseId.trim();
  if (!id) return null;
  return cacheGet(id);
}
