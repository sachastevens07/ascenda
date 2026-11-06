import { createClient } from 'npm:@supabase/supabase-js@2';

import { userHasAscendaPro } from '../_shared/entitlement.ts';
import bundled from './ids.json' with { type: 'json' };

/**
 * Authenticated, rate-limited media for one of our exercises.
 * Calls WorkoutX from the server only. Never logs URLs or keys.
 * Does not use WorkoutX's workout generator.
 */

const WORKOUTX = 'https://api.workoutxapp.com/v2';
const USER_WINDOW_MS = 5 * 60 * 1000;
const USER_MAX = 40;
const CACHE_SKEW_MS = 60 * 60 * 1000;

type BundledFile = { matches?: { slug?: string; workoutx_id?: string }[] };
type View = { label: 'default' | 'front' | 'side'; url: string };
type MediaOk = {
  ok: true;
  exerciseId: string;
  thumbnailUrl: string | null;
  videos: View[];
  expiresAt: string | null;
};
type MediaFail = {
  ok: false;
  reason: 'unmatched' | 'unauthorized' | 'rate_limited' | 'quota' | 'unavailable' | 'error';
};
type Payload = MediaOk | MediaFail;
type WxMedia = {
  mp4?: string;
  poster?: string;
  expiresAt?: string;
  front?: { mp4?: string; poster?: string };
  side?: { mp4?: string; poster?: string };
};
type WxExercise = {
  id?: string;
  model?: string;
  counterpartId?: string;
  media?: WxMedia | null;
  mediaLimitReached?: boolean;
};

type Cached = { payload: MediaOk; expiresAtMs: number };
const mediaCache = new Map<string, Cached>();
const userHits = new Map<string, number[]>();

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Payload, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function fail(reason: MediaFail['reason'], status: number): Response {
  return json({ ok: false, reason }, status);
}

function slugOk(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function wxIdOk(value: string): boolean {
  return /^ex_[A-Za-z0-9]+$/.test(value);
}

function bundledId(slug: string): string | null {
  const matches = (bundled as BundledFile).matches ?? [];
  for (const row of matches) {
    if (row.slug === slug && typeof row.workoutx_id === 'string' && wxIdOk(row.workoutx_id)) {
      return row.workoutx_id;
    }
  }
  return null;
}

function pruneHits(userId: string, now: number): number[] {
  const next = (userHits.get(userId) ?? []).filter((at) => now - at < USER_WINDOW_MS);
  userHits.set(userId, next);
  return next;
}

function headerInt(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function view(label: View['label'], url: unknown): View | null {
  return typeof url === 'string' && url.startsWith('https://') ? { label, url } : null;
}

function fromWx(exerciseId: string, media: WxMedia | null | undefined): MediaOk | null {
  if (!media) return null;
  const videos = [
    view('front', media.front?.mp4),
    view('side', media.side?.mp4),
    view('default', media.mp4),
  ].filter((item): item is View => Boolean(item));
  const unique: View[] = [];
  const seen = new Set<string>();
  for (const item of videos) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    unique.push(item);
  }
  const thumbnail =
    (typeof media.front?.poster === 'string' && media.front.poster.startsWith('https://')
      ? media.front.poster
      : null) ??
    (typeof media.poster === 'string' && media.poster.startsWith('https://') ? media.poster : null);
  if (!thumbnail && unique.length === 0) return null;
  return {
    ok: true,
    exerciseId,
    thumbnailUrl: thumbnail,
    videos: unique,
    expiresAt: typeof media.expiresAt === 'string' ? media.expiresAt : null,
  };
}

function cacheGet(wxId: string, exerciseId: string): MediaOk | null {
  const hit = mediaCache.get(wxId);
  if (!hit) return null;
  if (hit.expiresAtMs <= Date.now() + CACHE_SKEW_MS) {
    mediaCache.delete(wxId);
    return null;
  }
  return { ...hit.payload, exerciseId };
}

function cacheSet(wxId: string, payload: MediaOk): void {
  const expiresAtMs = payload.expiresAt ? Date.parse(payload.expiresAt) : NaN;
  if (!Number.isFinite(expiresAtMs)) return;
  mediaCache.set(wxId, { payload, expiresAtMs });
}

async function wxGet(
  path: string,
  key: string
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const response = await fetch(`${WORKOUTX}${path}`, {
    headers: { 'X-WorkoutX-Key': key },
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body, headers: response.headers };
}

function pickExercise(body: unknown): WxExercise | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as WxExercise;
  if (typeof row.id === 'string') return row;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return fail('unauthorized', 401);
  }

  let exerciseId = '';
  try {
    if (req.method === 'GET') {
      exerciseId = new URL(req.url).searchParams.get('exerciseId') ?? '';
    } else {
      const body = (await req.json()) as { exerciseId?: unknown };
      exerciseId = typeof body.exerciseId === 'string' ? body.exerciseId : '';
    }
  } catch {
    return fail('error', 400);
  }
  exerciseId = exerciseId.trim();
  if (!slugOk(exerciseId)) {
    return fail('error', 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const wxKey = (Deno.env.get('WORKOUTX_API_KEY') ?? '').trim();
  if (!supabaseUrl || !anonKey) {
    console.log('exercise-media misconfigured');
    return fail('unavailable', 503);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (userError || !userId) {
    return fail('unauthorized', 401);
  }

  const entitled = await userHasAscendaPro(supabase);
  if (entitled === false) {
    return fail('unauthorized', 401);
  }

  const now = Date.now();
  if (pruneHits(userId, now).length >= USER_MAX) {
    return fail('rate_limited', 429);
  }

  let wxId = bundledId(exerciseId);
  const { data: row } = await supabase
    .from('exercises')
    .select('id, workoutx_id')
    .eq('id', exerciseId)
    .maybeSingle();
  const fromDb = typeof row?.workoutx_id === 'string' ? row.workoutx_id.trim() : '';
  if (wxIdOk(fromDb)) wxId = fromDb;
  if (!wxId) {
    return json({ ok: false, reason: 'unmatched' });
  }

  const cached = cacheGet(wxId, exerciseId);
  if (cached) {
    return json(cached);
  }

  if (!wxKey) {
    console.log('exercise-media missing provider secret');
    return fail('unavailable', 503);
  }

  userHits.set(userId, [...pruneHits(userId, now), now]);

  try {
    let fetched = await wxGet(`/exercises/${encodeURIComponent(wxId)}`, wxKey);
    if (fetched.status === 429) {
      return fail('rate_limited', 429);
    }
    if (fetched.status === 403) {
      return fail('quota', 429);
    }
    if (fetched.status === 404) {
      return json({ ok: false, reason: 'unmatched' });
    }
    if (fetched.status >= 500) {
      console.log('exercise-media provider', fetched.status);
      return fail('unavailable', 503);
    }
    if (fetched.status !== 200) {
      console.log('exercise-media provider', fetched.status);
      return fail('error', 502);
    }

    let exercise = pickExercise(fetched.body);
    if (exercise?.model && exercise.model !== 'female' && typeof exercise.counterpartId === 'string' && wxIdOk(exercise.counterpartId)) {
      wxId = exercise.counterpartId;
      const femaleCached = cacheGet(wxId, exerciseId);
      if (femaleCached) return json(femaleCached);
      fetched = await wxGet(`/exercises/${encodeURIComponent(wxId)}`, wxKey);
      exercise = pickExercise(fetched.body);
    }

    if (exercise?.mediaLimitReached) {
      return fail('quota', 429);
    }

    let media = exercise?.media ?? null;
    const expiresAtMs = media?.expiresAt ? Date.parse(media.expiresAt) : NaN;
    if (!media || (Number.isFinite(expiresAtMs) && expiresAtMs <= now + CACHE_SKEW_MS)) {
      const fresh = await wxGet(`/exercises/${encodeURIComponent(wxId)}/media`, wxKey);
      if (fresh.status === 429) return fail('rate_limited', 429);
      if (fresh.status === 200 && fresh.body && typeof fresh.body === 'object') {
        media = fresh.body as WxMedia;
      }
    }

    const payload = fromWx(exerciseId, media);
    if (!payload) {
      return fail('unavailable', 503);
    }
    cacheSet(wxId, payload);

    const used = headerInt(fetched.headers, 'X-Media-Exercises-Used');
    const remaining = headerInt(fetched.headers, 'X-Media-Exercises-Remaining');
    const limit = headerInt(fetched.headers, 'X-Media-Exercises-Limit');
    try {
      await supabase.from('media_usage').insert({
        user_id: userId,
        exercise_id: exerciseId,
        kind: 'fetch',
        wx_exercises_used: used,
        wx_exercises_remaining: remaining,
        wx_exercises_limit: limit,
      });
    } catch {
      /* Table may not exist until workoutx_m1.sql is pasted. Playback still works. */
    }

    return json(payload);
  } catch {
    console.log('exercise-media provider error');
    return fail('error', 502);
  }
});
