import { createClient } from 'npm:@supabase/supabase-js@2';

import { userHasAscendaPro } from '../_shared/entitlement.ts';
import machinesFile from './machines.json' with { type: 'json' };

/**
 * AI1 Scan a machine. Photo in, structured match out. The image is never stored.
 * Claude key: Edge Function secret ANTHROPIC_API_KEY.
 */

const FEATURE = 'scan_machine';
const MODEL = 'claude-sonnet-5-5';
const DAILY_LIMIT = 20;
const MAX_TOKENS = 4096;
const CLAUDE_TIMEOUT_MS = 25000;
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';

type MachineRow = { id: string; name: string; visual_features: string };
type ScanOk = {
  ok: true;
  machine_id: string | null;
  confidence: 'high' | 'medium' | 'low';
  alternatives: string[];
  is_gym_equipment: boolean;
  people_visible: boolean;
};
type ScanFail = {
  ok: false;
  reason: 'unauthorized' | 'limit' | 'timeout' | 'unavailable' | 'fallback' | 'error';
};
type Payload = ScanOk | ScanFail;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const machines: MachineRow[] = Array.isArray((machinesFile as { machines?: unknown }).machines)
  ? ((machinesFile as { machines: MachineRow[] }).machines ?? []).filter(
      (item) => typeof item?.id === 'string' && typeof item?.name === 'string'
    )
  : [];
const machineIds = new Set(machines.map((item) => item.id));

const promptTemplate = await Deno.readTextFile(new URL('./prompt.md', import.meta.url));
const systemPrompt = promptTemplate.replace(
  '{{MACHINES_JSON}}',
  JSON.stringify(
    machines.map((item) => ({
      id: item.id,
      name: item.name,
      visual_features: item.visual_features,
    }))
  )
);

const toolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    machine_id: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    alternatives: { type: 'array', items: { type: 'string' } },
    is_gym_equipment: { type: 'boolean' },
    people_visible: { type: 'boolean' },
  },
  required: ['machine_id', 'confidence', 'alternatives', 'is_gym_equipment', 'people_visible'],
};

function json(body: Payload, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function fail(reason: ScanFail['reason'], status: number): Response {
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

function knownId(value: unknown): string | null {
  const id = text(value);
  return machineIds.has(id) ? id : null;
}

function machineIdFromTool(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const id = knownId(value);
  return id ?? undefined;
}

function validateScan(raw: unknown): ScanOk | null {
  const row = asRecord(raw);
  if (typeof row.is_gym_equipment !== 'boolean') return null;
  if (typeof row.people_visible !== 'boolean') return null;
  const confidence = row.confidence;
  if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') return null;
  const machineId = machineIdFromTool(row.machine_id);
  if (machineId === undefined) return null;
  const alternatives = Array.isArray(row.alternatives)
    ? row.alternatives.map(knownId).filter((id): id is string => Boolean(id) && id !== machineId)
    : [];
  const unique = [...new Set(alternatives)].slice(0, 3);
  return {
    ok: true,
    machine_id: machineId,
    confidence,
    alternatives: unique,
    is_gym_equipment: row.is_gym_equipment,
    people_visible: row.people_visible,
  };
}

function parseToolInput(body: unknown): unknown {
  const content = asRecord(body).content;
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    const row = asRecord(item);
    if (row.type === 'tool_use' && row.name === 'report_machine') return row.input;
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
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png'
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
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools: [
          {
            name: 'report_machine',
            description: 'Identify the gym machine in the photo. Always call this tool.',
            input_schema: toolSchema,
          },
        ],
        tool_choice: { type: 'auto' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: imageBase64 },
              },
              {
                type: 'text',
                text: 'Identify the machine in the photo.',
              },
            ],
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
    console.log('scan-machine misconfigured', {
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
    console.log('scan-machine not entitled');
    return fail('unauthorized', 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = asRecord(await req.json());
  } catch {
    return fail('error', 400);
  }

  const action = text(parsedBody.action) || 'scan';
  if (action === 'miss') {
    const guess = knownId(parsedBody.model_guess);
    const { error } = await admin.from('machine_scan_misses').insert({ model_guess: guess });
    if (error && !/machine_scan_misses|schema cache/i.test(error.message)) {
      console.log('scan-machine miss insert failed');
    }
    return json({
      ok: true,
      machine_id: null,
      confidence: 'low',
      alternatives: [],
      is_gym_equipment: true,
      people_visible: false,
    });
  }

  const image = stripDataUri(text(parsedBody.image_base64));
  const mediaRaw = text(parsedBody.media_type);
  const mediaType = isJpegOrPng(mediaRaw) ? mediaRaw : 'image/jpeg';
  if (image.length < 100 || image.length > 5_000_000) {
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
    console.log('scan-machine quota write failed');
  }

  let lastUsage = { input: null as number | null, output: null as number | null };
  let timedOut = false;
  let result: ScanOk | null = null;

  for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
    const call = await callClaude(apiKey, image, mediaType);
    lastUsage = usageFrom(call.body);
    if (call.timedOut) {
      timedOut = true;
      break;
    }
    if (call.status < 200 || call.status >= 300) {
      const err = asRecord(asRecord(call.body).error);
      console.log(
        'scan-machine claude',
        call.status,
        text(err.type),
        text(err.message).slice(0, 180)
      );
      break;
    }
    result = validateScan(parseToolInput(call.body));
  }

  const { error: usageError } = await admin.from('ai_usage').insert({
    user_id: userId,
    feature: FEATURE,
    model: MODEL,
    input_tokens: lastUsage.input,
    output_tokens: lastUsage.output,
  });
  if (usageError && !/ai_usage|schema cache/i.test(usageError.message)) {
    console.log('scan-machine usage write failed');
  }

  if (result) return json(result);
  if (timedOut) return fail('timeout', 504);
  return fail('fallback', 200);
});
