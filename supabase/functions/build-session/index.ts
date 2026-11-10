import { createClient } from 'npm:@supabase/supabase-js@2';

import { bypassAiLimit } from '../_shared/aiQuota.ts';
import { userHasAscendaPro } from '../_shared/entitlement.ts';

/**
 * AI3 Build me a session. Model returns W1 blocks from a pre-filtered library.
 * Server checks ids, time (±5 min) and beginner barbell rules, then falls back
 * to the closest single session. Claude key: Edge Function secret ANTHROPIC_API_KEY.
 */

const FEATURE = 'build_session';
const MODEL = 'claude-haiku-5-5';
const DAILY_LIMIT = 5;
const MAX_TOKENS = 900;
const CLAUDE_TIMEOUT_MS = 25000;
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const SLACK = 5;
const SECONDS_PER_SET = 40;
const REST: Record<string, number> = {
  main: 150,
  secondary: 90,
  accessory: 75,
  core: 60,
  finisher: 45,
};

type Role = 'main' | 'secondary' | 'accessory' | 'core' | 'finisher';
type Focus = 'full_body' | 'upper' | 'lower' | 'glutes_and_legs' | 'cardio' | 'recovery';
type Energy = 'low' | 'normal' | 'high';
type Level = 'beginner' | 'intermediate' | 'advanced';
type Eligible = {
  exercise_id: string;
  name: string;
  pattern: string;
  equipment: string;
  roles: Role[];
  rep_min: number;
  rep_max: number;
};
type Template = { id: string; kind: string; estimated_minutes: number };
type Cardio = { id: string; name: string; duration_minutes: number; beginner_ok: boolean };
type Stretch = { id: string; name: string; duration_minutes: number };
type Single = {
  id: string;
  name: string;
  focus: string;
  estimated_minutes: number;
  exercises: {
    exercise_id: string;
    role: Role;
    sets: number;
    rep_min: number;
    rep_max: number;
    target_rir: number | null;
  }[];
};
type BlockExercise = {
  exercise_id: string;
  role: Role;
  sets: number;
  rep_min: number;
  rep_max: number;
  duration_seconds: number | null;
  target_rir: number;
};
type Block = {
  block_type: 'warmup' | 'strength' | 'cardio' | 'cooldown' | 'stretch';
  template_id: string | null;
  cardio_session_id: string | null;
  stretch_routine_id: string | null;
  exercises: BlockExercise[];
};
type Plan = { name: string; why: string; estimated_minutes: number; blocks: Block[] };
type Ok = Plan & { ok: true; fallback: boolean };
type Fail = {
  ok: false;
  reason: 'unauthorized' | 'limit' | 'timeout' | 'unavailable' | 'fallback' | 'error';
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const promptTemplate = await Deno.readTextFile(new URL('./prompt.md', import.meta.url));

const toolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    why: { type: 'string' },
    estimated_minutes: { type: 'integer' },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          block_type: { enum: ['warmup', 'strength', 'cardio', 'cooldown', 'stretch'] },
          template_id: { type: ['string', 'null'] },
          cardio_session_id: { type: ['string', 'null'] },
          stretch_routine_id: { type: ['string', 'null'] },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                exercise_id: { type: 'string' },
                role: { enum: ['main', 'secondary', 'accessory', 'core', 'finisher'] },
                sets: { type: 'integer' },
                rep_min: { type: 'integer' },
                rep_max: { type: 'integer' },
                duration_seconds: { type: ['integer', 'null'] },
                target_rir: { type: 'integer' },
              },
              required: [
                'exercise_id',
                'role',
                'sets',
                'rep_min',
                'rep_max',
                'duration_seconds',
                'target_rir',
              ],
            },
          },
        },
        required: ['block_type', 'template_id', 'cardio_session_id', 'stretch_routine_id', 'exercises'],
      },
    },
  },
  required: ['name', 'why', 'estimated_minutes', 'blocks'],
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

function int(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
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

function asFocus(value: unknown): Focus {
  const raw = text(value);
  if (
    raw === 'upper' ||
    raw === 'lower' ||
    raw === 'glutes_and_legs' ||
    raw === 'cardio' ||
    raw === 'recovery'
  ) {
    return raw;
  }
  return 'full_body';
}

function asEnergy(value: unknown): Energy {
  const raw = text(value);
  return raw === 'low' || raw === 'high' ? raw : 'normal';
}

function asLevel(value: unknown): Level {
  const raw = text(value);
  return raw === 'intermediate' || raw === 'advanced' ? raw : 'beginner';
}

function asMinutes(value: unknown): 20 | 30 | 45 | 60 {
  const n = int(value, 30);
  if (n <= 20) return 20;
  if (n <= 30) return 30;
  if (n <= 45) return 45;
  return 60;
}

function parseEligible(raw: unknown): Eligible[] {
  return asArray(raw).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.exercise_id);
    if (!id) return [];
    const roles = asArray(row.roles).map((role) => text(role)).filter((role): role is Role =>
      role === 'main' || role === 'secondary' || role === 'accessory' || role === 'core' || role === 'finisher'
    );
    return [
      {
        exercise_id: id,
        name: text(row.name) || id,
        pattern: text(row.pattern),
        equipment: text(row.equipment),
        roles: roles.length ? roles : ['secondary'],
        rep_min: Math.max(1, int(row.rep_min, 8)),
        rep_max: Math.max(1, int(row.rep_max, 12)),
      },
    ];
  });
}

function parseTemplates(raw: unknown, kind: string): Template[] {
  return asArray(raw).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.id);
    if (!id) return [];
    return [{ id, kind: text(row.kind) || kind, estimated_minutes: int(row.estimated_minutes, 5) }];
  });
}

function parseCardio(raw: unknown): Cardio[] {
  return asArray(raw).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.id);
    if (!id) return [];
    return [
      {
        id,
        name: text(row.name) || id,
        duration_minutes: int(row.duration_minutes, 20),
        beginner_ok: row.beginner_ok !== false,
      },
    ];
  });
}

function parseStretch(raw: unknown): Stretch[] {
  return asArray(raw).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.id);
    if (!id) return [];
    return [{ id, name: text(row.name) || id, duration_minutes: int(row.duration_minutes, 10) }];
  });
}

function parseSingles(raw: unknown): Single[] {
  return asArray(raw).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.id);
    if (!id) return [];
    const exercises = asArray(row.exercises).flatMap((slot) => {
      const s = asRecord(slot);
      const exerciseId = text(s.exercise_id);
      const role = text(s.role);
      if (!exerciseId) return [];
      const safeRole: Role =
        role === 'main' || role === 'accessory' || role === 'core' || role === 'finisher' ? role : 'secondary';
      return [
        {
          exercise_id: exerciseId,
          role: safeRole,
          sets: Math.max(1, int(s.sets, 3)),
          rep_min: Math.max(1, int(s.rep_min, 8)),
          rep_max: Math.max(1, int(s.rep_max, 12)),
          target_rir: typeof s.target_rir === 'number' ? s.target_rir : null,
        },
      ];
    });
    return [
      {
        id,
        name: text(row.name) || id,
        focus: text(row.focus) || 'full_body',
        estimated_minutes: int(row.estimated_minutes, 30),
        exercises,
      },
    ];
  });
}

function emptyBlock(type: Block['block_type'], extra?: Partial<Block>): Block {
  return {
    block_type: type,
    template_id: extra?.template_id ?? null,
    cardio_session_id: extra?.cardio_session_id ?? null,
    stretch_routine_id: extra?.stretch_routine_id ?? null,
    exercises: extra?.exercises ?? [],
  };
}

function estimateMinutes(blocks: Block[], templates: Template[], cardio: Cardio[], stretches: Stretch[]): number {
  let seconds = 0;
  for (const block of blocks) {
    if (block.block_type === 'warmup' || block.block_type === 'cooldown') {
      const template = templates.find((item) => item.id === block.template_id);
      seconds += (template?.estimated_minutes ?? 5) * 60;
    } else if (block.block_type === 'cardio') {
      const session = cardio.find((item) => item.id === block.cardio_session_id);
      seconds += (session?.duration_minutes ?? 10) * 60;
    } else if (block.block_type === 'stretch') {
      const session = stretches.find((item) => item.id === block.stretch_routine_id);
      seconds += (session?.duration_minutes ?? 10) * 60;
    } else {
      for (const item of block.exercises) {
        seconds += item.sets * (SECONDS_PER_SET + (REST[item.role] ?? 90));
      }
    }
  }
  return Math.max(1, Math.round(seconds / 60));
}

function clip(value: string, max: number, fallback: string): string {
  const trimmed = value.trim() || fallback;
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trim();
}

function parsePlan(raw: unknown): Plan | null {
  const body = asRecord(raw);
  const blocks = asArray(body.blocks)
    .map((item) => {
      const row = asRecord(item);
      const type = text(row.block_type);
      if (
        type !== 'warmup' &&
        type !== 'strength' &&
        type !== 'cardio' &&
        type !== 'cooldown' &&
        type !== 'stretch'
      ) {
        return null;
      }
      const exercises = asArray(row.exercises).flatMap((slot) => {
        const s = asRecord(slot);
        const id = text(s.exercise_id);
        const role = text(s.role);
        if (
          !id ||
          (role !== 'main' &&
            role !== 'secondary' &&
            role !== 'accessory' &&
            role !== 'core' &&
            role !== 'finisher')
        ) {
          return [];
        }
        return [
          {
            exercise_id: id,
            role,
            sets: Math.min(5, Math.max(1, int(s.sets, 3))),
            rep_min: Math.max(1, int(s.rep_min, 8)),
            rep_max: Math.max(1, int(s.rep_max, 12)),
            duration_seconds: s.duration_seconds == null ? null : int(s.duration_seconds, 0),
            target_rir: Math.min(4, Math.max(0, int(s.target_rir, 2))),
          },
        ];
      });
      return {
        block_type: type,
        template_id: text(row.template_id) || null,
        cardio_session_id: text(row.cardio_session_id) || null,
        stretch_routine_id: text(row.stretch_routine_id) || null,
        exercises,
      } as Block;
    })
    .filter((item): item is Block => item !== null);
  if (blocks.length === 0) return null;
  return {
    name: clip(text(body.name), 30, 'Your session'),
    why: clip(text(body.why), 220, 'A session from our library for the time you have.'),
    estimated_minutes: int(body.estimated_minutes, 30),
    blocks,
  };
}

function validatePlan(
  plan: Plan | null,
  input: {
    minutes: number;
    focus: Focus;
    level: Level;
    eligible: Eligible[];
    templates: Template[];
    cardio: Cardio[];
    stretches: Stretch[];
    loggedBarbell: string[];
  }
): Plan | null {
  if (!plan) return null;
  const eligibleIds = new Set(input.eligible.map((item) => item.exercise_id));
  const used = new Set<string>();
  const next: Block[] = [];
  for (const block of plan.blocks) {
    if (block.block_type === 'warmup' || block.block_type === 'cooldown') {
      if (!input.templates.some((item) => item.id === block.template_id && item.kind === block.block_type)) {
        return null;
      }
      next.push(block);
      continue;
    }
    if (block.block_type === 'cardio') {
      if (
        !input.cardio.some(
          (item) => item.id === block.cardio_session_id && (input.level !== 'beginner' || item.beginner_ok)
        )
      ) {
        return null;
      }
      next.push(block);
      continue;
    }
    if (block.block_type === 'stretch') {
      if (!input.stretches.some((item) => item.id === block.stretch_routine_id)) return null;
      next.push(block);
      continue;
    }
    if (block.exercises.length < 3 || block.exercises.length > 6) return null;
    if (!block.exercises.some((item) => item.role === 'main')) return null;
    const exercises: BlockExercise[] = [];
    for (const item of block.exercises) {
      const row = input.eligible.find((entry) => entry.exercise_id === item.exercise_id);
      if (!row || !eligibleIds.has(item.exercise_id) || used.has(item.exercise_id)) return null;
      if (!row.roles.includes(item.role)) return null;
      if (
        input.level === 'beginner' &&
        item.role === 'main' &&
        row.equipment === 'barbell' &&
        !input.loggedBarbell.includes(item.exercise_id)
      ) {
        return null;
      }
      used.add(item.exercise_id);
      exercises.push({
        ...item,
        rep_min: row.rep_min,
        rep_max: Math.max(row.rep_min, item.rep_max || row.rep_max),
      });
    }
    next.push({ ...block, exercises });
  }
  if (input.focus === 'cardio' && !next.some((item) => item.block_type === 'cardio')) return null;
  if (input.focus === 'recovery' && !next.some((item) => item.block_type === 'stretch')) return null;
  if (
    input.focus !== 'cardio' &&
    input.focus !== 'recovery' &&
    !next.some((item) => item.block_type === 'strength')
  ) {
    return null;
  }
  const minutes = estimateMinutes(next, input.templates, input.cardio, input.stretches);
  if (Math.abs(minutes - input.minutes) > SLACK) return null;
  return { ...plan, estimated_minutes: minutes, blocks: next };
}

function pickTemplate(templates: Template[], kind: string, focus: Focus, minutes: number): string | null {
  if (minutes <= 30) {
    const quick = templates.find((item) => item.id === `${kind}-quick`);
    if (quick) return quick.id;
  }
  const wanted =
    focus === 'upper'
      ? `${kind}-upper-body`
      : focus === 'lower' || focus === 'glutes_and_legs'
        ? `${kind}-lower-body`
        : `${kind}-full-body`;
  return templates.find((item) => item.id === wanted)?.id ?? templates.find((item) => item.kind === kind)?.id ?? null;
}

function fallbackPlan(input: {
  minutes: number;
  focus: Focus;
  energy: Energy;
  level: Level;
  eligible: Eligible[];
  templates: Template[];
  cardio: Cardio[];
  stretches: Stretch[];
  singles: Single[];
}): Plan {
  const why = 'This uses a session from our library that matches the time and focus you picked.';
  if (input.focus === 'cardio') {
    const list = input.cardio.filter((item) => (input.level === 'beginner' ? item.beginner_ok : true));
    const cardio = list.slice().sort((a, b) => Math.abs(a.duration_minutes - input.minutes) - Math.abs(b.duration_minutes - input.minutes))[0];
    if (cardio) {
      const blocks = [emptyBlock('cardio', { cardio_session_id: cardio.id })];
      return {
        name: clip(cardio.name, 30, 'Cardio session'),
        why,
        estimated_minutes: estimateMinutes(blocks, input.templates, input.cardio, input.stretches),
        blocks,
      };
    }
  }
  if (input.focus === 'recovery') {
    const stretch = input.stretches
      .slice()
      .sort((a, b) => Math.abs(a.duration_minutes - Math.min(input.minutes, 20)) - Math.abs(b.duration_minutes - Math.min(input.minutes, 20)))[0];
    if (stretch) {
      const blocks = [emptyBlock('stretch', { stretch_routine_id: stretch.id })];
      return {
        name: clip(stretch.name, 30, 'Recovery stretch'),
        why,
        estimated_minutes: estimateMinutes(blocks, input.templates, input.cardio, input.stretches),
        blocks,
      };
    }
  }
  const order =
    input.focus === 'upper'
      ? ['upper_body', 'arms', 'full_body']
      : input.focus === 'lower'
        ? ['lower_body', 'glutes', 'full_body']
        : input.focus === 'glutes_and_legs'
          ? ['glutes', 'lower_body', 'full_body']
          : ['full_body', 'glutes', 'upper_body'];
  const single = input.singles.slice().sort((a, b) => {
    const aFocus = order.indexOf(a.focus);
    const bFocus = order.indexOf(b.focus);
    const focusScore = (aFocus < 0 ? 8 : aFocus) - (bFocus < 0 ? 8 : bFocus);
    if (focusScore !== 0) return focusScore;
    return Math.abs(a.estimated_minutes - input.minutes) - Math.abs(b.estimated_minutes - input.minutes);
  })[0];
  const rir = input.level === 'beginner' ? 3 : 2;
  const exercises: BlockExercise[] = (single?.exercises.length
    ? single.exercises
    : input.eligible.slice(0, 5).map((item) => ({
        exercise_id: item.exercise_id,
        role: item.roles[0] ?? 'secondary',
        sets: input.energy === 'low' ? 2 : 3,
        rep_min: item.rep_min,
        rep_max: item.rep_max,
        target_rir: rir,
      }))
  ).slice(0, 6).map((item) => ({
    exercise_id: item.exercise_id,
    role: item.role,
    sets: input.energy === 'low' ? Math.max(2, item.sets - 1) : item.sets,
    rep_min: item.rep_min,
    rep_max: item.rep_max,
    duration_seconds: null,
    target_rir: item.target_rir ?? rir,
  }));
  const blocks = [
    emptyBlock('warmup', { template_id: pickTemplate(input.templates, 'warmup', input.focus, input.minutes) }),
    emptyBlock('strength', { exercises }),
    emptyBlock('cooldown', { template_id: pickTemplate(input.templates, 'cooldown', input.focus, input.minutes) }),
  ];
  return {
    name: clip(single?.name ?? 'Your session', 30, 'Your session'),
    why,
    estimated_minutes: estimateMinutes(blocks, input.templates, input.cardio, input.stretches),
    blocks,
  };
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
        system: [{ type: 'text', text: promptTemplate, cache_control: { type: 'ephemeral' } }],
        tools: [
          {
            name: 'report_built_session',
            description: 'Return the built session as blocks. Always call this tool.',
            input_schema: toolSchema,
          },
        ],
        tool_choice: { type: 'auto' },
        messages: [
          {
            role: 'user',
            content: `Build a one-off session.\n\n<user_input>\n${JSON.stringify(userPayload)}\n</user_input>`,
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
    console.log('build-session misconfigured', {
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
    console.log('build-session not entitled');
    return fail('unauthorized', 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = asRecord(await req.json());
  } catch {
    return fail('error', 400);
  }

  const minutes = asMinutes(parsedBody.minutes);
  const focus = asFocus(parsedBody.focus);
  const energy = asEnergy(parsedBody.energy);
  const level = asLevel(parsedBody.level);
  const eligible = parseEligible(parsedBody.eligible_exercises);
  const templates = [
    ...parseTemplates(parsedBody.warmup_templates, 'warmup'),
    ...parseTemplates(parsedBody.cooldown_templates, 'cooldown'),
  ];
  const cardio = parseCardio(parsedBody.cardio_sessions);
  const stretches = parseStretch(parsedBody.stretch_routines);
  const singles = parseSingles(parsedBody.single_sessions);
  const loggedBarbell = asArray(parsedBody.logged_barbell_ids).map((item) => text(item)).filter(Boolean);
  if (focus !== 'cardio' && focus !== 'recovery' && eligible.length === 0) {
    return fail('error', 400);
  }

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
      console.log('build-session quota write failed');
    }
  }

  const userPayload = {
    minutes,
    focus,
    equipment: text(parsedBody.equipment) || 'full_gym',
    energy,
    level,
    recent_training: parsedBody.recent_training ?? { patterns: [] },
    eligible_exercises: eligible,
    warmup_templates: templates.filter((item) => item.kind === 'warmup'),
    cooldown_templates: templates.filter((item) => item.kind === 'cooldown'),
    cardio_sessions: cardio,
    stretch_routines: stretches,
    timing: { seconds_per_set: SECONDS_PER_SET, rest_by_role: REST, slack_minutes: SLACK },
  };

  let lastUsage = { input: null as number | null, output: null as number | null };
  let result: Plan | null = null;

  for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
    const call = await callClaude(apiKey, userPayload, attempt > 0);
    lastUsage = usageFrom(call.body);
    if (call.timedOut) break;
    if (call.status < 200 || call.status >= 300) {
      const err = asRecord(asRecord(call.body).error);
      console.log('build-session claude', call.status, text(err.type), text(err.message).slice(0, 180));
      continue;
    }
    result = validatePlan(parsePlan(parseToolInput(call.body)), {
      minutes,
      focus,
      level,
      eligible,
      templates,
      cardio,
      stretches,
      loggedBarbell,
    });
  }

  const { error: usageError } = await admin.from('ai_usage').insert({
    user_id: userId,
    feature: FEATURE,
    model: MODEL,
    input_tokens: lastUsage.input,
    output_tokens: lastUsage.output,
  });
  if (usageError && !/ai_usage|schema cache/i.test(usageError.message)) {
    console.log('build-session usage write failed');
  }

  if (result) {
    return json({ ok: true, ...result, fallback: false });
  }
  const fallback = fallbackPlan({
    minutes,
    focus,
    energy,
    level,
    eligible,
    templates,
    cardio,
    stretches,
    singles,
  });
  return json({ ok: true, ...fallback, fallback: true });
});
