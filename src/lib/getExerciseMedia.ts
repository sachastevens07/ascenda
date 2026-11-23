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
const CACHE_VERSION = 'wx-fills-1';
const FETCH_CONCURRENCY = 4;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ExerciseMedia | null>>();
const MATCHES = (bundled as { matches?: { slug?: string; workoutx_id?: string }[] }).matches ?? [];

/**
 * Catalogue or library slugs that share a WorkoutX clip already stored under
 * another id. Resolve before calling the Edge Function so those animations play
 * without a redeploy. Only aliases whose target has a match.
 */
const MEDIA_SLUG_ALIASES: Record<string, string> = {
  'cable-triceps-pushdown': 'triceps-pushdown',
  'chest-press-machine': 'machine-chest-press',
  'dumbbell-chest-fly': 'dumbbell-fly',
  'kettlebell-farmers-carry': 'farmer-carry',
  plank: 'forearm-plank',
  'rear-delt-fly': 'dumbbell-reverse-fly',
  'seated-dumbbell-shoulder-press': 'dumbbell-shoulder-press',
  'shoulder-press-machine': 'machine-shoulder-press',
  'standing-calf-raise': 'calf-raise-machine',
  'standing-dumbbell-shoulder-press': 'dumbbell-shoulder-press',
  'walking-lunge': 'dumbbell-walking-lunge',
  'bodyweight-glute-bridge': 'glute-bridge',
};

/** WorkoutX clips are 600×720. Keep logger / sheet frames at this ratio. */
export const EXERCISE_DEMO_ASPECT = 5 / 6;

/** Compact exercise-screen player: about 40% of the window height. */
export const EXERCISE_DEMO_SCREEN_RATIO = 0.4;

export function exerciseDemoHeight(width: number): number {
  return Math.round((width * 6) / 5);
}

export function exerciseDemoHeightForScreen(windowHeight: number): number {
  return Math.round(windowHeight * EXERCISE_DEMO_SCREEN_RATIO);
}

export function canonicalExerciseMediaSlug(exerciseId: string): string {
  const id = exerciseId.trim();
  return MEDIA_SLUG_ALIASES[id] ?? id;
}

let fetchActive = 0;
const fetchWaiters: Array<() => void> = [];

function acquireFetchSlot(): Promise<void> {
  if (fetchActive < FETCH_CONCURRENCY) {
    fetchActive += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    fetchWaiters.push(() => {
      fetchActive += 1;
      resolve();
    });
  });
}

function releaseFetchSlot(): void {
  fetchActive = Math.max(0, fetchActive - 1);
  const next = fetchWaiters.shift();
  if (next) next();
}

function isMatchedSlug(slug: string): boolean {
  return MATCHES.some(
    (row) => row.slug === slug && typeof row.workoutx_id === 'string' && /^ex_[A-Za-z0-9]+$/.test(row.workoutx_id)
  );
}

export function hasExerciseMediaMatch(exerciseId: string): boolean {
  return isMatchedSlug(canonicalExerciseMediaSlug(exerciseId));
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

function cacheKey(exerciseId: string): string {
  return `${CACHE_VERSION}:${exerciseId}`;
}

function cacheGet(exerciseId: string): ExerciseMedia | null {
  const key = cacheKey(exerciseId);
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAtMs <= Date.now() + CACHE_SKEW_MS) {
    cache.delete(key);
    return null;
  }
  return hit.media;
}

function cacheSet(exerciseId: string, media: ExerciseMedia): void {
  const expiresAtMs = media.expiresAt ? Date.parse(media.expiresAt) : Date.now() + 12 * 60 * 60 * 1000;
  if (!Number.isFinite(expiresAtMs)) return;
  cache.set(cacheKey(exerciseId), { media, expiresAtMs });
}

async function fetchMedia(exerciseId: string): Promise<ExerciseMedia | null> {
  const cached = cacheGet(exerciseId);
  if (cached) return cached;
  const pending = inflight.get(exerciseId);
  if (pending) return pending;

  const request = (async () => {
    await acquireFetchSlot();
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
    } finally {
      releaseFetchSlot();
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
  const id = canonicalExerciseMediaSlug(exerciseId);
  if (!id || !isMatchedSlug(id)) return null;
  return fetchMedia(id);
}

/** Cached poster only. Does not call the Edge Function. Safe for long lists. */
export function peekExerciseMedia(exerciseId: string): ExerciseMedia | null {
  const id = canonicalExerciseMediaSlug(exerciseId);
  if (!id) return null;
  return cacheGet(id);
}
