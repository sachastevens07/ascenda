import { createClient } from 'npm:@supabase/supabase-js@2';

import { bypassAiLimit } from '../_shared/aiQuota.ts';
import { userHasAscendaPro } from '../_shared/entitlement.ts';

/**
 * AI2 Busy gym fix. Model returns a revised remaining list.
 * Server validates against the eligible swap lists, then falls back to
 * first eligible swap and dropping accessories until the time fits.
 * Claude key: Edge Function secret ANTHROPIC_API_KEY.
 */

const FEATURE = 'busy_gym';
const MODEL = 'claude-haiku-5-5';
const DAILY_LIMIT = 10;
const MAX_TOKENS = 2048;
const CLAUDE_TIMEOUT_MS = 25000;
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const TIMING = {
  seconds_per_set: 40,
  rest_by_role: { main: 150, secondary: 90, accessory: 75, core: 60, finisher: 45 },
  slack_minutes: 3,
};

type Role = 'main' | 'secondary' | 'accessory' | 'core' | 'finisher';
type Energy = 'low' | 'normal' | 'high';
type Remaining = {
  exercise_id: string;
  name: string;
  role: Role;
  pattern: string;
  equipment: string;
  sets: number;
  remaining_sets: number;
  rep_min: number;
  rep_max: number;
};
type Alt = { exercise_id: string; name: string; equipment: string; pattern: string };
type PlanRow = {
  exercise_id: string;
  replaces: string;
  sets: number;
  rep_min: number;
  rep_max: number;
  order: number;
};
type BusyOk = { ok: true; exercises: PlanRow[]; summary: string; fallback: boolean };
type BusyFail = {
  ok: false;
  reason: 'unauthorized' | 'limit' | 'timeout' | 'unavailable' | 'fallback' | 'error';
};
type Payload = BusyOk | BusyFail;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const promptTemplate = await Deno.readTextFile(new URL('./prompt.md', import.meta.url));
const systemPrompt = `${promptTemplate}\n\n<timing>\n${JSON.stringify(TIMING)}\n</timing>`;

const toolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          exercise_id: { type: 'string' },
          replaces: { type: ['string', 'null'] },
          sets: { type: 'integer' },
          rep_min: { type: 'integer' },
          rep_max: { type: 'integer' },
          order: { type: 'integer' },
        },
        required: ['exercise_id', 'replaces', 'sets', 'rep_min', 'rep_max', 'order'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['exercises', 'summary'],
};

function json(body: Payload, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function fail(reason: BusyFail['reason'], status: number): Response {
  return json({ ok: false, reason }, status);
}

function ukToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
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

function int(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function asRole(value: unknown): Role {
  return value === 'main' || value === 'secondary' || value === 'accessory' || value === 'core' || value === 'finisher'
    ? value
    : 'accessory';
}

function asEnergy(value: unknown): Energy {
  return value === 'low' || value === 'high' ? value : 'normal';
}

function asMinutes(value: unknown): 15 | 30 | 45 {
  const n = int(value, 30);
  return n <= 15 ? 15 : n <= 30 ? 30 : 45;
}

function parseRemaining(value: unknown): Remaining[] {
  if (!Array.isArray(value)) return [];
  const out: Remaining[] = [];
  for (const item of value) {
    const row = asRecord(item);
    const id = text(row.exercise_id);
    if (!id) continue;
    const sets = Math.max(1, Math.min(5, int(row.sets, 3)));
    const remainingSets = Math.max(1, Math.min(sets, int(row.remaining_sets, sets)));
    const repMin = Math.max(1, int(row.rep_min, 8));
    const repMax = Math.max(repMin, int(row.rep_max, 12));
    out.push({
      exercise_id: id,
      name: text(row.name) || id,
      role: asRole(row.role),
      pattern: text(row.pattern) || 'other',
      equipment: text(row.equipment) || 'dumbbell',
      sets,
      remaining_sets: remainingSets,
      rep_min: repMin,
      rep_max: repMax,
    });
  }
  return out.slice(0, 12);
}

function parseAlts(value: unknown, remaining: Remaining[]): Record<string, Alt[]> {
  const row = asRecord(value);
  const out: Record<string, Alt[]> = {};
  for (const item of remaining) {
    const list = Array.isArray(row[item.exercise_id]) ? row[item.exercise_id] : [];
    const alts: Alt[] = [];
    const seen = new Set<string>([item.exercise_id]);
    for (const alt of list) {
      const entry = asRecord(alt);
      const id = text(entry.exercise_id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      alts.push({
        exercise_id: id,
        name: text(entry.name) || id,
        equipment: text(entry.equipment) || 'dumbbell',
        pattern: text(entry.pattern) || item.pattern,
      });
    }
    out[item.exercise_id] = alts.slice(0, 6);
  }
  return out;
}

function estimateMinutes(rows: { role: Role; sets: number }[]): number {
  let seconds = 0;
  for (const row of rows) {
    const rest = TIMING.rest_by_role[row.role] ?? TIMING.rest_by_role.accessory;
    seconds += row.sets * (TIMING.seconds_per_set + rest);
  }
  return Math.max(1, Math.ceil(seconds / 60));
}

function energySets(sets: number, energy: Energy): number {
  if (energy !== 'low') return Math.max(1, sets);
  return Math.max(1, Math.ceil(sets * (2 / 3)));
}

function dropOrder(role: Role): number {
  if (role === 'accessory') return 0;
  if (role === 'core') return 1;
  if (role === 'finisher') return 2;
  if (role === 'secondary') return 3;
  return 4;
}

function fallbackPlan(
  remaining: Remaining[],
  alternatives: Record<string, Alt[]>,
  unavailable: string[],
  minutesLeft: 15 | 30 | 45,
  energy: Energy
): { exercises: PlanRow[]; summary: string } {
  const blocked = new Set(unavailable);
  const used = new Set<string>();
  type Kept = Remaining & { replaces: string };
  const kept: Kept[] = [];
  for (const item of remaining) {
    if (!blocked.has(item.equipment)) {
      used.add(item.exercise_id);
      kept.push({ ...item, replaces: item.exercise_id });
      continue;
    }
    const alt = (alternatives[item.exercise_id] ?? []).find((row) => !used.has(row.exercise_id));
    if (!alt) continue;
    used.add(alt.exercise_id);
    kept.push({
      ...item,
      exercise_id: alt.exercise_id,
      name: alt.name,
      equipment: alt.equipment,
      pattern: alt.pattern,
      replaces: item.exercise_id,
    });
  }
  let next = kept.map((item) => ({
    ...item,
    sets: energySets(item.remaining_sets || item.sets, energy),
  }));
  const cap = minutesLeft + TIMING.slack_minutes;
  const fits = (rows: typeof next) =>
    estimateMinutes(rows.map((row) => ({ role: row.role, sets: row.sets }))) <= cap;
  while (next.length > 0 && !fits(next)) {
    const dropIndex = [...next.keys()]
      .filter((index) => dropOrder(next[index].role) < 4)
      .sort((a, b) => dropOrder(next[a].role) - dropOrder(next[b].role) || b - a)[0];
    if (dropIndex == null) {
      const last = next.length - 1;
      if (next[last].sets > 1) {
        next = next.map((row, index) => (index === last ? { ...row, sets: row.sets - 1 } : row));
        continue;
      }
      break;
    }
    if ((next[dropIndex].role === 'secondary' || next[dropIndex].role === 'main') && next[dropIndex].sets > 1) {
      next = next.map((row, index) => (index === dropIndex ? { ...row, sets: row.sets - 1 } : row));
      continue;
    }
    if (next[dropIndex].role === 'main') break;
    next = next.filter((_, index) => index !== dropIndex);
  }
  for (const main of remaining.filter((item) => item.role === 'main')) {
    if (next.some((row) => row.replaces === main.exercise_id)) continue;
    const taken = blocked.has(main.equipment);
    const alts = alternatives[main.exercise_id] ?? [];
    if (taken && alts.length === 0) continue;
    const alt = taken ? alts.find((row) => !next.some((item) => item.exercise_id === row.exercise_id)) : null;
    const exerciseId = taken ? alt?.exercise_id : main.exercise_id;
    if (!exerciseId) continue;
    next = [
      {
        ...main,
        exercise_id: exerciseId,
        name: taken ? alt?.name ?? main.name : main.name,
        replaces: main.exercise_id,
        sets: energySets(main.remaining_sets || main.sets, energy),
      },
      ...next,
    ];
  }
  const rank = (role: Role) =>
    role === 'main' ? 0 : role === 'secondary' ? 1 : role === 'accessory' ? 2 : role === 'core' ? 3 : 4;
  next.sort((a, b) => rank(a.role) - rank(b.role));
  return {
    exercises: next.map((row, index) => ({
      exercise_id: row.exercise_id,
      replaces: row.replaces,
      sets: row.sets,
      rep_min: row.rep_min,
      rep_max: row.rep_max,
      order: index + 1,
    })),
    summary:
      next.length === 0
        ? 'Nothing we can swap in from the list. Try marking less as taken, or swap one lift yourself.'
        : 'Swapped taken kit where we could, and trimmed the rest to fit the time you have.',
  };
}

function allowedIds(original: Remaining, alternatives: Record<string, Alt[]>): Set<string> {
  return new Set([original.exercise_id, ...(alternatives[original.exercise_id] ?? []).map((row) => row.exercise_id)]);
}

function validatePlan(
  raw: unknown,
  remaining: Remaining[],
  alternatives: Record<string, Alt[]>,
  minutesLeft: 15 | 30 | 45
): { exercises: PlanRow[]; summary: string } | null {
  const body = asRecord(raw);
  const summary = text(body.summary).slice(0, 160);
  if (!Array.isArray(body.exercises)) return null;
  const byId = new Map(remaining.map((item) => [item.exercise_id, item]));
  const usedOriginal = new Set<string>();
  const rows: PlanRow[] = [];
  for (const item of body.exercises) {
    const row = asRecord(item);
    const exerciseId = text(row.exercise_id);
    const replaces = text(row.replaces) || exerciseId;
    const original = byId.get(replaces);
    if (!original || usedOriginal.has(replaces)) return null;
    if (!allowedIds(original, alternatives).has(exerciseId)) return null;
    if (rows.some((existing) => existing.exercise_id === exerciseId)) return null;
    const sets = int(row.sets, original.remaining_sets);
    if (sets < 1 || sets > original.sets) return null;
    const repMin = int(row.rep_min, original.rep_min);
    const repMax = int(row.rep_max, original.rep_max);
    if (repMin < original.rep_min || repMax > original.rep_max || repMin > repMax) return null;
    usedOriginal.add(replaces);
    rows.push({
      exercise_id: exerciseId,
      replaces,
      sets: Math.min(original.remaining_sets, sets),
      rep_min: repMin,
      rep_max: repMax,
      order: rows.length + 1,
    });
  }
  const roleByReplace = new Map(remaining.map((item) => [item.exercise_id, item.role]));
  const estimated = estimateMinutes(
    rows.map((row) => ({ role: roleByReplace.get(row.replaces) ?? 'accessory', sets: row.sets }))
  );
  if (estimated > minutesLeft + TIMING.slack_minutes) return null;
  for (const main of remaining.filter((item) => item.role === 'main')) {
    const alts = alternatives[main.exercise_id] ?? [];
    if (alts.length === 0 && !rows.some((row) => row.replaces === main.exercise_id)) continue;
    if (!rows.some((row) => row.replaces === main.exercise_id)) return null;
  }
  return { exercises: rows.map((row, index) => ({ ...row, order: index + 1 })), summary: summary || 'Here is a shorter session that keeps today\'s main work.' };
}

function parseJsonBlob(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1]?.trim() || trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function parseToolInput(body: unknown): unknown {
  const content = asRecord(body).content;
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    const row = asRecord(item);
    if (row.type === 'tool_use' && row.name === 'report_busy_gym') {
      return typeof row.input === 'string' ? parseJsonBlob(row.input) : row.input;
    }
  }
  const textBlock = content.find((item) => asRecord(item).type === 'text');
  return parseJsonBlob(text(asRecord(textBlock).text));
}

function usageFrom(body: unknown): { input: number | null; output: number | null } {
  const usage = asRecord(asRecord(body).usage);
  const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : null;
  const output = typeof usage.output_tokens === 'number' ? usage.output_tokens : null;
  return { input, output };
}

async function callClaude(
  apiKey: string,
  userPayload: Record<string, unknown>,
  simple = false
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
        ...(simple ? {} : { output_config: { effort: 'low' } }),
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools: [
          {
            name: 'report_busy_gym',
            description: 'Return the reworked remaining session. Always call this tool.',
            input_schema: toolSchema,
          },
        ],
        tool_choice: { type: 'auto' },
        messages: [
          {
            role: 'user',
            content: `Rework the remaining session.\n\n<user_input>\n${JSON.stringify(userPayload)}\n</user_input>`,
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
  if (!supabaseUrl || !anonKey || !serviceKey || !apiKey) {
    console.log('busy-gym-fix misconfigured', {
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
    console.log('busy-gym-fix not entitled');
    return fail('unauthorized', 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = asRecord(await req.json());
  } catch {
    return fail('error', 400);
  }

  const remaining = parseRemaining(parsedBody.remaining_exercises);
  if (remaining.length === 0) return fail('error', 400);
  const alternatives = parseAlts(parsedBody.eligible_alternatives, remaining);
  const unavailable = Array.isArray(parsedBody.unavailable_equipment)
    ? parsedBody.unavailable_equipment.map((item) => text(item)).filter(Boolean).slice(0, 8)
    : [];
  const minutesLeft = asMinutes(parsedBody.minutes_left);
  const energy = asEnergy(parsedBody.energy);

  const periodStart = ukToday();
  if (!bypassAiLimit(parsedBody)) {
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
      console.log('busy-gym-fix quota write failed');
    }
  }

  const userPayload = {
    remaining_exercises: remaining,
    unavailable_equipment: unavailable,
    minutes_left: minutesLeft,
    energy,
    eligible_alternatives: alternatives,
    timing: TIMING,
  };

  let lastUsage = { input: null as number | null, output: null as number | null };
  let timedOut = false;
  let result: { exercises: PlanRow[]; summary: string } | null = null;

  for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
    const call = await callClaude(apiKey, userPayload, attempt > 0);
    lastUsage = usageFrom(call.body);
    if (call.timedOut) {
      timedOut = true;
      break;
    }
    if (call.status < 200 || call.status >= 300) {
      const err = asRecord(asRecord(call.body).error);
      console.log('busy-gym-fix claude', call.status, text(err.type), text(err.message).slice(0, 180));
      continue;
    }
    result = validatePlan(parseToolInput(call.body), remaining, alternatives, minutesLeft);
  }

  const { error: usageError } = await admin.from('ai_usage').insert({
    user_id: userId,
    feature: FEATURE,
    model: MODEL,
    input_tokens: lastUsage.input,
    output_tokens: lastUsage.output,
  });
  if (usageError && !/ai_usage|schema cache/i.test(usageError.message)) {
    console.log('busy-gym-fix usage write failed');
  }

  if (result) {
    return json({ ok: true, exercises: result.exercises, summary: result.summary, fallback: false });
  }
  const fallback = fallbackPlan(remaining, alternatives, unavailable, minutesLeft, energy);
  if (timedOut) {
    return json({ ok: true, exercises: fallback.exercises, summary: fallback.summary, fallback: true });
  }
  return json({ ok: true, exercises: fallback.exercises, summary: fallback.summary, fallback: true });
});
