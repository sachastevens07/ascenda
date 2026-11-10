import { trackAi } from '@/lib/analytics';
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

export async function lookupCookIngredients(input: {
  text?: string;
  imageBase64?: string;
  mediaType?: 'image/jpeg' | 'image/png';
  extraKeys?: string[];
}): Promise<CookLookupOutcome> {
  const image = input.imageBase64 ? stripDataUri(input.imageBase64) : '';
  if (image && (image.length < 100 || image.length > 2_000_000)) return { kind: 'error' };
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const body: Record<string, unknown> = {
      extra_keys: input.extraKeys ?? [],
    };
    const typed = input.text?.trim() ?? '';
    if (typed) body.text = typed;
    if (image) {
      body.image_base64 = image;
      body.media_type = input.mediaType ?? 'image/jpeg';
    }
    const { data, error, response } = await supabase.functions.invoke('what-can-i-cook', {
      body,
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    const failBody = await readFailBody(data, response);
    if (__DEV__) {
      console.log('what-can-i-cook', {
        hasImage: Boolean(image),
        hasText: Boolean(typed),
        extra: (input.extraKeys ?? []).length,
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
