import { createClient } from 'npm:@supabase/supabase-js@2';

import { bypassAiLimit } from '../_shared/aiQuota.ts';
import { userHasAscendaPro } from '../_shared/entitlement.ts';

/**
 * AI4 Ask Ascenda. Coach chat grounded in her plan, last sessions and
 * matching guides. Never name, email, bodyweight or health info.
 * Claude key: Edge Function secret ANTHROPIC_API_KEY.
 */

const FEATURE = 'ask_ascenda';
const MODEL = 'claude-sonnet-5-5';
const DAILY_LIMIT = 30;
const MAX_TOKENS = 700;
const CLAUDE_TIMEOUT_MS = 25000;
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const HISTORY_LIMIT = 6;
const RETENTION_DAYS = 30;

type SafetyFlag =
  | 'none'
  | 'medical'
  | 'pregnancy'
  | 'body_or_diet'
  | 'off_topic'
  | 'emergency'
  | 'wellbeing';
type LinkType = 'exercise' | 'machine' | 'article' | 'routine' | 'recipe';
type Link = { type: LinkType; id: string };
type Action = { type: 'move_session'; planned_session_id: string; to_date: string } | null;
type Card = { id: string; name: string; summary: string };
type Planned = { id: string; date: string; name: string; kind: string };
type Answer = {
  reply: string;
  links: Link[];
  action: Action;
  safety_flag: SafetyFlag;
};
type Ok = Answer & { ok: true; fallback: boolean; conversation_id: string | null; message_id: string | null };
type Fail = {
  ok: false;
  reason: 'unauthorized' | 'limit' | 'timeout' | 'unavailable' | 'fallback' | 'error';
};

const APP_HELP = [
  {
    id: 'suggested_weight',
    text: 'Suggested weights come from the double-progression rule and her log. The logger shows a chip when it is time to go up. Never give a kg number.',
  },
  {
    id: 'rir',
    text: 'Reps in reserve means stop with that many reps still left. Beginners usually stop with 2 to 3 left.',
  },
  {
    id: 'swap',
    text: 'Swap from the exercise card in the logger, or use Something\'s taken when kit is busy. Changes apply to today only.',
  },
  {
    id: 'planner',
    text: 'She can move a planned session in the Planner. You may propose a move. Never say it is already done.',
  },
  {
    id: 'streak',
    text: 'A week counts if she does at least one session. Hitting her weekly target is a gold week. Rest weeks are not used.',
  },
  {
    id: 'fuel',
    text: 'Food is framed as fuel for training. No calorie targets or food logs.',
  },
];

const NEVER_SEND = [
  'name',
  'email',
  'bodyweight',
  'display_name',
  'progress_photos',
  'onboarding_answers',
  'health',
  'age_band',
];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const promptTemplate = await Deno.readTextFile(new URL('./prompt.md', import.meta.url));
const systemPrompt = `${promptTemplate}\n\n<app_help>\n${JSON.stringify(APP_HELP)}\n</app_help>`;

const toolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    links: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { enum: ['exercise', 'machine', 'article', 'routine', 'recipe'] },
          id: { type: 'string' },
        },
        required: ['type', 'id'],
      },
    },
    action: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        type: { enum: ['move_session'] },
        planned_session_id: { type: 'string' },
        to_date: { type: 'string' },
      },
      required: ['type', 'planned_session_id', 'to_date'],
    },
    safety_flag: {
      enum: ['none', 'medical', 'pregnancy', 'body_or_diet', 'off_topic', 'emergency', 'wellbeing'],
    },
  },
  required: ['reply', 'links', 'action', 'safety_flag'],
};

function json(body: Ok | Fail, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function fail(reason: Fail['reason'], status: number): Response {
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
  const raw = envString(envName);
  if (!raw) return '';
  if (!raw.startsWith('{')) return raw;
  try {
    const parsed = asRecord(JSON.parse(raw));
    for (const key of keys) {
      const value = text(parsed[key]);
      if (value) return value;
    }
  } catch {
    return '';
  }
  return '';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stripEmDashes(value: string): string {
  return value.replace(/\u2014/g, ',').replace(/\u2013/g, ' to ');
}

function stripNeverSend(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNeverSend);
  if (!value || typeof value !== 'object') return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (NEVER_SEND.includes(key)) continue;
    next[key] = stripNeverSend(item);
  }
  return next;
}

function detectSafetyFlag(question: string): SafetyFlag {
  const q = question.toLowerCase();
  if (
    /chest pain|tightness in (my )?chest|can'?t breathe|severe breath|faint|fainting|pass out|collapsed|call 999|heart attack/.test(
      q
    )
  ) {
    return 'emergency';
  }
  if (/pregnan|trying to conceive|postnatal|post-natal|given birth|after birth|breastfeed/.test(q)) {
    return 'pregnancy';
  }
  if (/skipping meals|guilty when i eat|hate my body|don'?t deserve to eat|purging|binge/.test(q)) {
    return 'wellbeing';
  }
  if (
    /calorie|lose weight|weight loss|diet plan|flat stomach|look (big|fat|skinny|thin)|arms look|body fat|bmi/.test(
      q
    )
  ) {
    return 'body_or_diet';
  }
  if (
    /hurt|pain|injur|physio|diagnos|medication|illness|condition|knee|shoulder pop|doctor/.test(q) &&
    !/how should this feel|where should i feel/.test(q)
  ) {
    return 'medical';
  }
  if (/poem|system prompt|ignore (your|these) rules|write me a joke/.test(q)) {
    return 'off_topic';
  }
  return 'none';
}

function mergeSafety(model: SafetyFlag, detected: SafetyFlag): SafetyFlag {
  const rank: Record<SafetyFlag, number> = {
    none: 0,
    off_topic: 1,
    body_or_diet: 2,
    medical: 3,
    pregnancy: 3,
    wellbeing: 3,
    emergency: 4,
  };
  return rank[detected] > rank[model] ? detected : model;
}

function parseCards(raw: unknown): Card[] {
  return asArray(raw).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.id);
    if (!id) return [];
    return [{ id, name: text(row.name) || id, summary: text(row.summary) }];
  });
}

function parsePlanned(raw: unknown): Planned[] {
  return asArray(raw).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.id);
    const date = text(row.date);
    if (!isUuid(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    return [{ id, date, name: text(row.name) || 'Session', kind: text(row.kind) || 'routine' }];
  });
}

function isoWithinDays(iso: string, days: number): boolean {
  const stamp = Date.parse(`${iso}T12:00:00Z`);
  if (!Number.isFinite(stamp)) return false;
  const today = ukToday();
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = start + days * 86400000;
  return stamp >= start && stamp <= end;
}

function parseJsonBlob(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseToolInput(body: unknown): unknown {
  const content = asArray(asRecord(body).content);
  for (const item of content) {
    const row = asRecord(item);
    if (text(row.type) === 'tool_use') return row.input;
    if (text(row.type) === 'text') {
      const parsed = parseJsonBlob(text(row.text));
      if (parsed) return parsed;
    }
  }
  return parseJsonBlob(text(asRecord(body).text));
}

function usageFrom(body: unknown): { input: number | null; output: number | null } {
  const usage = asRecord(asRecord(body).usage);
  const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : null;
  const output = typeof usage.output_tokens === 'number' ? usage.output_tokens : null;
  return { input, output };
}

function parseAnswer(
  raw: unknown,
  allowed: Set<string>,
  planned: Planned[],
  question: string
): Answer | null {
  const body = asRecord(raw);
  const reply = stripEmDashes(text(body.reply));
  if (!reply) return null;
  const links = asArray(body.links)
    .flatMap((item) => {
      const row = asRecord(item);
      const type = text(row.type);
      const id = text(row.id);
      if (
        type !== 'exercise' &&
        type !== 'machine' &&
        type !== 'article' &&
        type !== 'routine' &&
        type !== 'recipe'
      ) {
        return [];
      }
      if (!id || !allowed.has(`${type}:${id}`)) return [];
      return [{ type, id } as Link];
    })
    .slice(0, 3);
  const flagRaw = text(body.safety_flag);
  const modelFlag: SafetyFlag =
    flagRaw === 'medical' ||
    flagRaw === 'pregnancy' ||
    flagRaw === 'body_or_diet' ||
    flagRaw === 'off_topic' ||
    flagRaw === 'emergency' ||
    flagRaw === 'wellbeing'
      ? flagRaw
      : 'none';
  let action: Action = null;
  const actionRow = asRecord(body.action);
  if (text(actionRow.type) === 'move_session') {
    const id = text(actionRow.planned_session_id);
    const toDate = text(actionRow.to_date);
    const owned = planned.some((item) => item.id === id);
    if (isUuid(id) && owned && /^\d{4}-\d{2}-\d{2}$/.test(toDate) && isoWithinDays(toDate, 14)) {
      action = { type: 'move_session', planned_session_id: id, to_date: toDate };
    }
  }
  return {
    reply: reply.slice(0, 900),
    links,
    action,
    safety_flag: mergeSafety(modelFlag, detectSafetyFlag(question)),
  };
}

function fallbackAnswer(
  question: string,
  learn: Card[],
  exercises: Card[],
  machines: Card[]
): Answer {
  const detected = detectSafetyFlag(question);
  const links: Link[] = [
    ...learn.slice(0, 2).map((item) => ({ type: 'article' as const, id: item.id })),
    ...exercises.slice(0, 1).map((item) => ({ type: 'exercise' as const, id: item.id })),
    ...machines.slice(0, 1).map((item) => ({ type: 'machine' as const, id: item.id })),
  ].slice(0, 3);
  let reply =
    'I could not put a full answer together just now. These guides and articles are a good place to look, or try the question again in a moment.';
  if (detected === 'emergency') {
    reply = 'Please stop and get medical help now. If this is an emergency, call your local emergency number.';
  } else if (detected === 'medical') {
    reply =
      'I cannot advise on pain or injury. Stop anything that hurts and speak to a doctor or physiotherapist.';
  } else if (detected === 'pregnancy') {
    reply =
      'I cannot advise on pregnancy or postnatal training. Please speak to your doctor or midwife, and a qualified pre- and postnatal trainer.';
  } else if (detected === 'body_or_diet') {
    reply =
      'Ascenda focuses on strength and fuelling your training, not calorie targets or comments on bodies. A fuelling article may be more useful here.';
  } else if (detected === 'wellbeing') {
    reply =
      'Thank you for saying this. Please speak to a doctor about how you are feeling. If eating feels hard, Beat (beat.org.uk) can help.';
  } else if (detected === 'off_topic') {
    reply = 'I can only help with your training, the gym and using Ascenda.';
  }
  return { reply: stripEmDashes(reply), links, action: null, safety_flag: detected };
}

async function callClaude(
  apiKey: string,
  userPayload: Record<string, unknown>,
  history: { role: 'user' | 'assistant'; content: string }[],
  simple = false
): Promise<{ status: number; body: unknown; timedOut: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  const prior = history.slice(-HISTORY_LIMIT).flatMap((item) => {
    if (item.role !== 'user' && item.role !== 'assistant') return [];
    const content = item.content.trim().slice(0, 900);
    return content ? [{ role: item.role, content }] : [];
  });
  const messages = [
    ...prior,
    {
      role: 'user' as const,
      content: `Answer this question.\n\n<user_input>\n${JSON.stringify(userPayload)}\n</user_input>`,
    },
  ];
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
            name: 'report_ask_answer',
            description: 'Return the Ask Ascenda answer. Always call this tool.',
            input_schema: toolSchema,
          },
        ],
        tool_choice: { type: 'auto' },
        messages,
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
    console.log('ask-ascenda misconfigured', {
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
    console.log('ask-ascenda not entitled');
    return fail('unauthorized', 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = asRecord(stripNeverSend(await req.json()));
  } catch {
    return fail('error', 400);
  }

  const question = text(parsedBody.question);
  if (!question) return fail('error', 400);

  const exerciseGuides = parseCards(parsedBody.exercise_guides);
  const machineGuides = parseCards(parsedBody.machine_guides);
  const learn = parseCards(parsedBody.learn_summaries);
  const planned = parsePlanned(parsedBody.planned_sessions);
  const allowed = new Set<string>([
    ...exerciseGuides.map((item) => `exercise:${item.id}`),
    ...machineGuides.map((item) => `machine:${item.id}`),
    ...learn.map((item) => `article:${item.id}`),
  ]);
  const routineId = text(asRecord(parsedBody.routine).id);
  if (routineId) allowed.add(`routine:${routineId}`);

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
      console.log('ask-ascenda quota write failed');
    }
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  await admin.from('ai_conversations').delete().eq('user_id', userId).lt('updated_at', cutoff.toISOString());

  const ownedIds = new Set<string>();
  if (planned.length > 0) {
    const { data: owned } = await admin
      .from('planned_sessions')
      .select('id')
      .eq('user_id', userId)
      .in(
        'id',
        planned.map((item) => item.id)
      );
    for (const row of owned ?? []) {
      const id = text(asRecord(row).id);
      if (id) ownedIds.add(id);
    }
  }
  const ownedPlanned = planned.filter((item) => ownedIds.has(item.id));

  const history = asArray(parsedBody.history).flatMap((item) => {
    const row = asRecord(item);
    const role = text(row.role);
    const content = text(row.content).slice(0, 900);
    if ((role !== 'user' && role !== 'assistant') || !content) return [];
    return [{ role: role as 'user' | 'assistant', content }];
  });

  const userPayload = {
    question,
    screen: text(parsedBody.screen) || 'open',
    routine: parsedBody.routine ?? null,
    planned_sessions: ownedPlanned,
    last_sessions: parsedBody.last_sessions ?? [],
    exercise_guides: exerciseGuides,
    machine_guides: machineGuides,
    learn_summaries: learn,
  };

  let lastUsage = { input: null as number | null, output: null as number | null };
  let result: Answer | null = null;

  for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
    const call = await callClaude(apiKey, userPayload, history, attempt > 0);
    lastUsage = usageFrom(call.body);
    if (call.timedOut) break;
    if (call.status < 200 || call.status >= 300) {
      const err = asRecord(asRecord(call.body).error);
      console.log('ask-ascenda claude', call.status, text(err.type), text(err.message).slice(0, 180));
      continue;
    }
    result = parseAnswer(parseToolInput(call.body), allowed, ownedPlanned, question);
  }

  const { error: usageError } = await admin.from('ai_usage').insert({
    user_id: userId,
    feature: FEATURE,
    model: MODEL,
    input_tokens: lastUsage.input,
    output_tokens: lastUsage.output,
  });
  if (usageError && !/ai_usage|schema cache/i.test(usageError.message)) {
    console.log('ask-ascenda usage write failed');
  }

  const answer = result ?? fallbackAnswer(question, learn, exerciseGuides, machineGuides);
  const fallback = !result;

  let conversationId = text(parsedBody.conversation_id);
  if (conversationId && !isUuid(conversationId)) conversationId = '';
  if (conversationId) {
    const { data: existing } = await admin
      .from('ai_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existing) conversationId = '';
  }
  if (!conversationId) {
    const created = await admin
      .from('ai_conversations')
      .insert({ user_id: userId })
      .select('id')
      .single();
    conversationId = text(asRecord(created.data).id);
  } else {
    await admin
      .from('ai_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('user_id', userId);
  }

  let messageId: string | null = null;
  if (conversationId) {
    await admin.from('ai_messages').insert({
      conversation_id: conversationId,
      user_id: userId,
      role: 'user',
      content: question.slice(0, 900),
    });
    const saved = await admin
      .from('ai_messages')
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: 'assistant',
        content: answer.reply,
        safety_flag: answer.safety_flag,
        links: answer.links,
        action: answer.action,
      })
      .select('id')
      .single();
    messageId = text(asRecord(saved.data).id) || null;
  }

  return json({
    ok: true,
    ...answer,
    fallback,
    conversation_id: conversationId || null,
    message_id: messageId,
  });
});
