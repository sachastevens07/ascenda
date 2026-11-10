import { trackAi } from '@/lib/analytics';
import { aiLimitBypassPayload } from '@/lib/devFlags';
import { supabase } from '@/lib/supabase';

export type CookServerMatch = {
  slug: string;
  have: number;
  need: number;
  missingKeys: string[];
  score: number;
};

export type CookLookupOk = {
  kind: 'ok';
  ingredientKeys: string[];
  unrecognised: string[];
  peopleVisible: boolean;
  matches: CookServerMatch[];
};

export type CookLookupOutcome =
  | CookLookupOk
  | { kind: 'limit' }
  | { kind: 'timeout' }
  | { kind: 'fallback' }
  | { kind: 'error' };

export type CookImage = {
  base64: string;
  mediaType: 'image/jpeg' | 'image/png';
  uri?: string;
};

type FunctionOk = {
  ok: true;
  ingredient_keys?: unknown;
  unrecognised?: unknown;
  people_visible?: boolean;
  matches?: unknown;
};

type FunctionFail = {
  ok?: false;
  reason?: string;
};

const FEATURE = 'what_can_i_cook' as const;
const MAX_BASE64_CHARS = 2_000_000;
const MAX_PHOTOS = 4;

function stripDataUri(value: string): string {
  const match = value.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
  return (match?.[1] ?? value).replace(/\s/g, '');
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function asMatches(value: unknown): CookServerMatch[] {
  if (!Array.isArray(value)) return [];
  const out: CookServerMatch[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
    if (!slug) continue;
    const have = typeof row.have === 'number' && Number.isFinite(row.have) ? row.have : 0;
    const need = typeof row.need === 'number' && Number.isFinite(row.need) ? row.need : 0;
    const score = typeof row.score === 'number' && Number.isFinite(row.score) ? row.score : 0;
    out.push({
      slug,
      have,
      need,
      missingKeys: asStrings(row.missing_keys),
      score,
    });
  }
  return out;
}

async function readFailBody(data: unknown, response: Response | undefined): Promise<FunctionFail | null> {
  if (data && typeof data === 'object' && 'reason' in data) {
    return data as FunctionFail;
  }
  if (!response) return null;
  try {
    const parsed: unknown = await response.clone().json();
    if (parsed && typeof parsed === 'object' && 'reason' in parsed) {
      return parsed as FunctionFail;
    }
  } catch {
    /* Gateway errors are not JSON. */
  }
  return null;
}

export function sanitizeCookImages(images: CookImage[]): CookImage[] {
  const out: CookImage[] = [];
  for (const image of images) {
    const base64 = stripDataUri(image.base64);
    if (base64.length < 100 || base64.length > MAX_BASE64_CHARS) continue;
    out.push({ base64, mediaType: image.mediaType });
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}

export async function lookupCookIngredients(input: {
  text?: string;
  images?: CookImage[];
}): Promise<CookLookupOutcome> {
  const images = sanitizeCookImages(input.images ?? []);
  const typed = input.text?.trim() ?? '';
  if (!typed && images.length === 0) return { kind: 'error' };
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const body: Record<string, unknown> = {};
    if (typed) body.text = typed;
    if (images.length > 0) {
      body.images = images.map((image) => ({
        image_base64: image.base64,
        media_type: image.mediaType,
      }));
    }
    Object.assign(body, aiLimitBypassPayload());
    const { data, error, response } = await supabase.functions.invoke('what-can-i-cook', {
      body,
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    const failBody = await readFailBody(data, response);
    if (__DEV__) {
      console.log('what-can-i-cook', {
        photos: images.length,
        hasText: Boolean(typed),
        status: response?.status ?? null,
        error: error?.message ?? null,
        ok: failBody?.ok ?? (data as FunctionOk | null)?.ok ?? null,
        reason: failBody?.reason ?? null,
      });
    }
    if (error) {
      const status = response?.status;
      const reason = failBody?.reason;
      if (status === 429 || reason === 'limit') {
        trackAi('ai_limit_reached', FEATURE);
        return { kind: 'limit' };
      }
      if (status === 504 || reason === 'timeout') {
        trackAi('ai_fallback_used', FEATURE);
        return { kind: 'timeout' };
      }
      trackAi('ai_fallback_used', FEATURE);
      return { kind: 'fallback' };
    }
    const payload = (data ?? {}) as FunctionOk | FunctionFail;
    if (payload.ok === true) {
      trackAi('ai_feature_used', FEATURE);
      return {
        kind: 'ok',
        ingredientKeys: asStrings(payload.ingredient_keys),
        unrecognised: asStrings(payload.unrecognised).slice(0, 10),
        peopleVisible: payload.people_visible === true,
        matches: asMatches(payload.matches),
      };
    }
    if (payload.reason === 'limit') {
      trackAi('ai_limit_reached', FEATURE);
      return { kind: 'limit' };
    }
    if (payload.reason === 'timeout') {
      trackAi('ai_fallback_used', FEATURE);
      return { kind: 'timeout' };
    }
    if (payload.reason === 'fallback' || payload.reason === 'unavailable') {
      trackAi('ai_fallback_used', FEATURE);
      return { kind: 'fallback' };
    }
    return { kind: 'error' };
  } catch {
    trackAi('ai_fallback_used', FEATURE);
    return { kind: 'timeout' };
  }
}

export function openCook(): '/food/cook' {
  return '/food/cook';
}
