import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * AI5 Monthly recap. Stats in, story out.
 * The app calculates every number. This function never adds numbers.
 * Claude key: Edge Function secret ANTHROPIC_API_KEY.
 * Free for everyone with an account. No entitlement check.
 */

const FEATURE = 'monthly_recap';
const MODEL = 'claude-haiku-5-5';
const MAX_TOKENS = 300;
const TEMPERATURE = 0.5;
const CLAUDE_TIMEOUT_MS = 20000;
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const BANNED = /\b(missed|skipped|only|behind|weight|calories|body)\b/i;
const HIGHLIGHT_KEYS = new Set([
  'sessions',
  'minutes',
  'strength_sessions',
  'cardio_sessions',
  'recovery_sessions',
  'personal_bests',
  'new_exercises',
  'new_machines',
  'weeks_trained',
  'current_run',
  'longest_run',
  'gold_weeks',
  'awards',
]);

type RecapOk = {
  ok: true;
  month: string;
  headline: string;
  story: string;
  highlight: string;
  used_fallback: boolean;
};
type RecapFail = {
  ok: false;
  reason: 'unauthorized' | 'too_few' | 'unavailable' | 'error';
};
type Payload = RecapOk | RecapFail;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const systemPrompt = await Deno.readTextFile(new URL('./prompt.md', import.meta.url));

const toolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    story: { type: 'string' },
    highlight: { type: 'string' },
  },
  required: ['headline', 'story', 'highlight'],
};

function json(body: Payload, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function fail(reason: RecapFail['reason'], status: number): Response {
  return json({ ok: false, reason }, status);
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

function monthKey(value: unknown): string | null {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-(\d{2})(?:-01)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2020 || year > 2100 || month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}-01`;
}

function extractNumbers(value: string): string[] {
  return value.match(/\d+(?:\.\d+)?/g) ?? [];
}

function allowedNumbers(stats: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  function walk(item: unknown): void {
    if (typeof item === 'number' && Number.isFinite(item)) {
      out.add(String(item));
      if (Number.isInteger(item)) out.add(String(Math.trunc(item)));
      return;
    }
    if (typeof item === 'string') {
      for (const number of extractNumbers(item)) out.add(number);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (item && typeof item === 'object') {
      Object.values(item).forEach(walk);
    }
  }
  walk(stats);
  return out;
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function numbersOk(textValue: string, allowed: Set<string>): boolean {
  return extractNumbers(textValue).every((number) => allowed.has(number));
}

function compactStats(stats: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === 'number' && value === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value == null || value === '') continue;
    out[key] = value;
  }
  return out;
}

function validateStory(
  raw: unknown,
  stats: Record<string, unknown>
): { headline: string; story: string; highlight: string } | null {
  const row = asRecord(raw);
  const headline = text(row.headline).replace(/\u2014/g, ',');
  const story = text(row.story).replace(/\u2014/g, ',');
  const highlight = text(row.highlight);
  if (!headline || !story || !HIGHLIGHT_KEYS.has(highlight)) return null;
  if (!(highlight in stats)) return null;
  if (headline.includes('\u2014') || story.includes('\u2014')) return null;
  if (BANNED.test(headline) || BANNED.test(story)) return null;
  if ((headline.match(/!/g) ?? []).length + (story.match(/!/g) ?? []).length > 1) return null;
  if (wordCount(headline) > 8 || wordCount(story) > 70) return null;
  if (headline.length > 60 || story.length > 450) return null;
  const allowed = allowedNumbers(stats);
  if (!numbersOk(headline, allowed) || !numbersOk(story, allowed)) return null;
  return { headline, story, highlight };
}

function fallbackStory(stats: Record<string, unknown>): {
  headline: string;
  story: string;
  highlight: string;
} {
  const month = text(stats.month) || 'this month';
  const sessions = typeof stats.sessions === 'number' ? stats.sessions : 0;
  const minutes = typeof stats.minutes === 'number' ? stats.minutes : 0;
  return {
    headline: `Your ${month} in the gym`,
    story: `${sessions} sessions and ${minutes} minutes of training in ${month}. That's something to be proud of.`,
    highlight: 'sessions',
  };
}

function parseToolInput(body: unknown): unknown {
  const content = asRecord(body).content;
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    const row = asRecord(item);
    if (row.type === 'tool_use' && row.name === 'report_recap') return row.input;
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
  stats: Record<string, unknown>
): Promise<{ status: number; body: unknown; timedOut: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
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
            name: 'report_recap',
            description: 'Return the monthly recap headline, story and highlight. Always call this tool.',
            input_schema: toolSchema,
          },
        ],
        tool_choice: { type: 'auto' },
        messages: [
          {
            role: 'user',
            content: `<user_input>${JSON.stringify(compactStats(stats))}</user_input>`,
          },
        ],
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
  if (!supabaseUrl || !anonKey || !serviceKey) {
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

  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = asRecord(await req.json());
  } catch {
    return fail('error', 400);
  }

  const month = monthKey(parsedBody.month);
  const stats = asRecord(parsedBody.stats);
  const sessions = typeof stats.sessions === 'number' ? stats.sessions : 0;
  if (!month) return fail('error', 400);
  if (sessions < 2) return fail('too_few', 400);

  stats.month = text(stats.month) || stats.month;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: existing } = await admin
    .from('monthly_recaps')
    .select('headline, story_text, highlight, used_fallback, month')
    .eq('user_id', userId)
    .eq('month', month)
    .maybeSingle();
  if (existing && text(existing.story_text)) {
    return json({
      ok: true,
      month,
      headline: text(existing.headline),
      story: text(existing.story_text),
      highlight: text(existing.highlight) || 'sessions',
      used_fallback: existing.used_fallback === true,
    });
  }

  let lastUsage = { input: null as number | null, output: null as number | null };
  let story: { headline: string; story: string; highlight: string } | null = null;

  if (apiKey) {
    for (let attempt = 0; attempt < 2 && !story; attempt += 1) {
      const call = await callClaude(apiKey, stats);
      lastUsage = usageFrom(call.body);
      if (call.timedOut) break;
      if (call.status < 200 || call.status >= 300) {
        const err = asRecord(asRecord(call.body).error);
        console.log('monthly-recap claude', call.status, text(err.type), text(err.message).slice(0, 180));
        break;
      }
      story = validateStory(parseToolInput(call.body), stats);
    }
  }

  const usedFallback = !story;
  const result = story ?? fallbackStory(stats);

  const { error: usageError } = await admin.from('ai_usage').insert({
    user_id: userId,
    feature: FEATURE,
    model: MODEL,
    input_tokens: lastUsage.input,
    output_tokens: lastUsage.output,
  });
  if (usageError && !/ai_usage|schema cache/i.test(usageError.message)) {
    console.log('monthly-recap usage write failed');
  }

  const { error: recapError } = await admin.from('monthly_recaps').upsert(
    {
      user_id: userId,
      month,
      stats,
      headline: result.headline,
      story_text: result.story,
      highlight: result.highlight,
      used_fallback: usedFallback,
    },
    { onConflict: 'user_id,month' }
  );
  if (recapError && !/monthly_recaps|schema cache/i.test(recapError.message)) {
    console.log('monthly-recap store failed');
  }

  return json({
    ok: true,
    month,
    headline: result.headline,
    story: result.story,
    highlight: result.highlight,
    used_fallback: usedFallback,
  });
});
