import { createClient } from 'npm:@supabase/supabase-js@2';

import { userHasAscendaPro } from '../_shared/entitlement.ts';
import ingredientsFile from './ingredients.json' with { type: 'json' };
import recipesFile from './recipes.json' with { type: 'json' };

/**
 * AI6 What can I cook. The model maps ingredients to keys only.
 * This function ranks recipes. Photos are never stored.
 * Claude key: Edge Function secret ANTHROPIC_API_KEY.
 */

const FEATURE = 'what_can_i_cook';
const MODEL = 'claude-haiku-5-5';
const DAILY_LIMIT = 10;
const MAX_TOKENS = 300;
const TEMPERATURE = 0;
const CLAUDE_TIMEOUT_MS = 25000;
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MAX_TEXT = 500;

type IngredientRow = { key: string; name: string };
type RecipeRow = { slug: string; required: string[]; optional: string[] };
type CookMatch = {
  slug: string;
  have: number;
  need: number;
  missing_keys: string[];
  score: number;
};
type CookOk = {
  ok: true;
  ingredient_keys: string[];
  unrecognised: string[];
  people_visible: boolean;
  matches: CookMatch[];
};
type CookFail = {
  ok: false;
  reason: 'unauthorized' | 'limit' | 'timeout' | 'unavailable' | 'fallback' | 'error';
};
type Payload = CookOk | CookFail;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ingredients: IngredientRow[] = Array.isArray((ingredientsFile as { ingredients?: unknown }).ingredients)
  ? ((ingredientsFile as { ingredients: IngredientRow[] }).ingredients ?? []).filter(
      (item) => typeof item?.key === 'string' && typeof item?.name === 'string'
    )
  : [];
const ingredientKeys = new Set(ingredients.map((item) => item.key));
const pantryKeys = new Set(
  Array.isArray((ingredientsFile as { pantry_keys?: unknown }).pantry_keys)
    ? ((ingredientsFile as { pantry_keys: unknown[] }).pantry_keys ?? []).filter(
        (item): item is string => typeof item === 'string' && ingredientKeys.has(item)
      )
    : []
);
const recipes: RecipeRow[] = Array.isArray((recipesFile as { recipes?: unknown }).recipes)
  ? ((recipesFile as { recipes: RecipeRow[] }).recipes ?? []).filter(
      (item) => typeof item?.slug === 'string' && Array.isArray(item?.required)
    )
  : [];

const promptTemplate = await Deno.readTextFile(new URL('./prompt.md', import.meta.url));
const systemPrompt = promptTemplate.replace(
  '{{INGREDIENTS_JSON}}',
  JSON.stringify(ingredients.map((item) => ({ key: item.key, name: item.name })))
);

const toolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ingredient_keys: { type: 'array', items: { type: 'string' } },
    unrecognised: { type: 'array', items: { type: 'string' } },
    people_visible: { type: 'boolean' },
  },
  required: ['ingredient_keys', 'unrecognised', 'people_visible'],
};

function json(body: Payload, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function fail(reason: CookFail['reason'], status: number): Response {
  return json({ ok: false, reason }, status);
}

function ukToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

function isJpegOrPng(value: string): value is 'image/jpeg' | 'image/png' {
  return value === 'image/jpeg' || value === 'image/png';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function envString(...names: string[]): string {
  for (const name of names) {
    const value = (Deno.env.get(name) ?? '').trim();
    if (value) return value;
  }
  return '';
}

function jsonSecret(envName: string, keys: string[]): string {
  const raw = (Deno.env.get(envName) ?? '').trim();
  if (!raw) return '';
  if (!raw.startsWith('{')) return raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of keys) {
      const value = parsed[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    const first = Object.values(parsed).find((value) => typeof value === 'string' && value.trim());
    return typeof first === 'string' ? first.trim() : '';
  } catch {
    return '';
  }
}

function stripDataUri(value: string): string {
  const match = value.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
  return (match?.[1] ?? value).replace(/\s/g, '');
}

function knownKey(value: unknown): string | null {
  const id = text(value);
  return ingredientKeys.has(id) ? id : null;
}

function uniqueKeys(value: unknown, limit = 40): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const key = knownKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

function uniqueNames(value: unknown, limit = 10): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const name = text(item).slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

function rankRecipes(haveKeys: string[]): CookMatch[] {
  const have = new Set(haveKeys);
  const matches: CookMatch[] = [];
  for (const recipe of recipes) {
    const required = recipe.required.filter((key) => ingredientKeys.has(key));
    const nonPantry = required.filter((key) => !pantryKeys.has(key));
    if (nonPantry.length === 0) continue;
    const matched = nonPantry.filter((key) => have.has(key));
    if (matched.length === 0) continue;
    matches.push({
      slug: recipe.slug,
      have: required.filter((key) => pantryKeys.has(key) || have.has(key)).length,
      need: required.length,
      missing_keys: nonPantry.filter((key) => !have.has(key)),
      score: matched.length / nonPantry.length,
    });
  }
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.missing_keys.length !== b.missing_keys.length) return a.missing_keys.length - b.missing_keys.length;
    return a.slug.localeCompare(b.slug);
  });
  return matches;
}

function validateCook(raw: unknown): { ingredient_keys: string[]; unrecognised: string[]; people_visible: boolean } | null {
  const row = asRecord(raw);
  if (typeof row.people_visible !== 'boolean') return null;
  if (!Array.isArray(row.ingredient_keys) || !Array.isArray(row.unrecognised)) return null;
  return {
    ingredient_keys: uniqueKeys(row.ingredient_keys),
    unrecognised: uniqueNames(row.unrecognised),
    people_visible: row.people_visible,
  };
}

function parseToolInput(body: unknown): unknown {
  const content = asRecord(body).content;
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    const row = asRecord(item);
    if (row.type === 'tool_use' && row.name === 'report_ingredients') return row.input;
  }
  const textBlock = content.find((item) => asRecord(item).type === 'text');
  const raw = text(asRecord(textBlock).text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function usageFrom(body: unknown): { input: number | null; output: number | null } {
  const usage = asRecord(asRecord(body).usage);
  const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : null;
  const output = typeof usage.output_tokens === 'number' ? usage.output_tokens : null;
  return { input, output };
}

async function callClaude(
  apiKey: string,
  typed: string,
  imageBase64: string | null,
  mediaType: 'image/jpeg' | 'image/png'
): Promise<{ status: number; body: unknown; timedOut: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  const userContent: unknown[] = [];
  if (imageBase64) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: imageBase64 },
    });
  }
  const instruction = imageBase64
    ? typed
      ? 'Map the ingredients in the photo and the typed list to keys from the list.'
      : 'Map the ingredients in the photo to keys from the list.'
    : 'Map the typed list to keys from the list.';
  userContent.push({
    type: 'text',
    text: `${instruction}\n\n<user_input>\n${typed}\n</user_input>`,
  });
  try {
    const response = await fetch(ANTHROPIC, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools: [
          {
            name: 'report_ingredients',
            description: 'Return ingredient keys from the list only. Always call this tool.',
            input_schema: toolSchema,
          },
        ],
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body, timedOut: false };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError';
    return { status: 0, body: null, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return fail('unauthorized', 401);
  }

  const supabaseUrl = envString('SUPABASE_URL');
  const anonKey =
    envString('SUPABASE_ANON_KEY') || jsonSecret('SUPABASE_PUBLISHABLE_KEYS', ['default', 'anon']);
  const serviceKey =
    envString('SUPABASE_SERVICE_ROLE_KEY') ||
    jsonSecret('SUPABASE_SECRET_KEYS', ['default', 'service_role']);
  const apiKey = envString('ANTHROPIC_API_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey || !apiKey) {
    console.log('what-can-i-cook misconfigured', {
      url: Boolean(supabaseUrl),
      anon: Boolean(anonKey),
      service: Boolean(serviceKey),
      anthropic: Boolean(apiKey),
    });
    return fail('unavailable', 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (userError || !userId) {
    return fail('unauthorized', 401);
  }

  const entitled = await userHasAscendaPro(userClient);
  if (entitled === false) {
    console.log('what-can-i-cook not entitled');
    return fail('unauthorized', 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = asRecord(await req.json());
  } catch {
    return fail('error', 400);
  }

  const typed = text(parsedBody.text).slice(0, MAX_TEXT);
  const image = stripDataUri(text(parsedBody.image_base64));
  const mediaRaw = text(parsedBody.media_type);
  const mediaType = isJpegOrPng(mediaRaw) ? mediaRaw : 'image/jpeg';
  const extraKeys = uniqueKeys(parsedBody.extra_keys);
  const hasImage = image.length >= 100;
  if (hasImage && image.length > 5_000_000) {
    return fail('error', 400);
  }
  if (!hasImage && !typed) {
    return fail('error', 400);
  }

  const periodStart = ukToday();
  const { data: quotaRow } = await admin
    .from('ai_quota')
    .select('count')
    .eq('user_id', userId)
    .eq('feature', FEATURE)
    .eq('period_start', periodStart)
    .maybeSingle();
  const used = typeof quotaRow?.count === 'number' ? quotaRow.count : 0;
  if (used >= DAILY_LIMIT) {
    return fail('limit', 429);
  }

  const { error: quotaError } = await admin.from('ai_quota').upsert(
    { user_id: userId, feature: FEATURE, period_start: periodStart, count: used + 1 },
    { onConflict: 'user_id,feature,period_start' }
  );
  if (quotaError && !/ai_quota|schema cache/i.test(quotaError.message)) {
    console.log('what-can-i-cook quota write failed');
  }

  let lastUsage = { input: null as number | null, output: null as number | null };
  let timedOut = false;
  let result: { ingredient_keys: string[]; unrecognised: string[]; people_visible: boolean } | null = null;

  for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
    const call = await callClaude(apiKey, typed, hasImage ? image : null, mediaType);
    lastUsage = usageFrom(call.body);
    if (call.timedOut) {
      timedOut = true;
      break;
    }
    if (call.status < 200 || call.status >= 300) {
      const err = asRecord(asRecord(call.body).error);
      console.log(
        'what-can-i-cook claude',
        call.status,
        text(err.type),
        text(err.message).slice(0, 180)
      );
      break;
    }
    result = validateCook(parseToolInput(call.body));
  }

  const { error: usageError } = await admin.from('ai_usage').insert({
    user_id: userId,
    feature: FEATURE,
    model: MODEL,
    input_tokens: lastUsage.input,
    output_tokens: lastUsage.output,
  });
  if (usageError && !/ai_usage|schema cache/i.test(usageError.message)) {
    console.log('what-can-i-cook usage write failed');
  }

  if (result) {
    const ingredientKeysFound = [...new Set([...result.ingredient_keys, ...extraKeys])];
    return json({
      ok: true,
      ingredient_keys: ingredientKeysFound,
      unrecognised: result.unrecognised,
      people_visible: result.people_visible,
      matches: rankRecipes(ingredientKeysFound),
    });
  }
  if (timedOut) return fail('timeout', 504);
  return fail('fallback', 200);
});
