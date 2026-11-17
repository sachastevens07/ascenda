import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { bypassAiLimit } from '../_shared/aiQuota.ts';
import { userHasAscendaPro } from '../_shared/entitlement.ts';
import {
  asArray,
  asRecord,
  compactIndex,
  contextRecord,
  fallbackLinks,
  findRecipesTool,
  lungeExerciseIds,
  mapEquipmentToken,
  num,
  recommendRoutineTool,
  retrieve,
  text,
  type CoachContext,
  type CoachPreference,
  type Indexes,
  type Json,
  type SessionExercise,
  adjustTodayTool,
  buildSessionTool,
  lookupTool,
} from './tools.ts';
import indexesFile from './indexes.json' with { type: 'json' };

/**
 * Ascenda Coach. One chat with tools. Claude key: ANTHROPIC_API_KEY.
 * The model chooses tools; this file and tools.ts produce the result.
 * Never read or send profiles.life_stage. It is special-category health data.
 */

const FEATURE = 'coach';
const MODEL = 'claude-haiku-5-5';
const DAILY_LIMIT = 40;
const MAX_TOKENS = 700;
const MAX_TOOL_CALLS = 3;
const TIMEOUT_MS = 20000;
const HISTORY_LIMIT = 12;
const RETENTION_DAYS = 30;
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';

type SafetyFlag =
  | 'none'
  | 'medical'
  | 'pregnancy'
  | 'body_or_diet'
  | 'off_topic'
  | 'emergency'
  | 'wellbeing';
type Link = { type: string; id: string };
type Answer = {
  reply: string;
  links: Link[];
  card_ids: string[];
  cards: Json[];
  safety_flag: SafetyFlag;
  retrieved_ids: { type: string; id: string }[];
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-coach-eval',
};

const promptTemplate = await Deno.readTextFile(new URL('./prompt.md', import.meta.url));
const indexes = indexesFile as Indexes;
const cachedSystem = `${promptTemplate}\n\n<app_help>\n${JSON.stringify(indexes.app_help ?? [])}\n</app_help>\n${compactIndex(indexes)}`;

const TOOLS = [
  {
    name: 'lookup',
    description:
      'Fetch an exercise guide, machine guide, Learn article, routine, stretch or cardio session by id, or search them by words. Use when <retrieved> does not have what you need.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { enum: ['exercise', 'machine', 'article', 'routine', 'stretch', 'cardio', 'any'] },
        id: { type: ['string', 'null'] },
        query: { type: ['string', 'null'] },
      },
      required: ['type', 'id', 'query'],
    },
  },
  {
    name: 'my_training',
    description:
      'Get more of her own training data than <her_training> includes: sessions in a date range, history for one exercise, personal bests or checkpoint results.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        what: { enum: ['sessions', 'exercise_history', 'personal_bests', 'checkpoints'] },
        exercise_id: { type: ['string', 'null'] },
        weeks: { type: 'integer', minimum: 1, maximum: 12 },
      },
      required: ['what', 'exercise_id', 'weeks'],
    },
  },
  {
    name: 'adjust_today',
    description:
      "Rework the rest of today's session when something's taken, she's short on time, her energy is low, or she wants to remove or swap an exercise. For low energy, set energy to low so the app can apply the same lighter-session rules as the check-in.",
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        unavailable_equipment: { type: 'array', items: { type: 'string' } },
        minutes_left: { type: ['integer', 'null'] },
        energy: { enum: ['low', 'normal', 'high'] },
        remove_exercise_ids: { type: 'array', items: { type: 'string' } },
        swap_exercise_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['unavailable_equipment', 'minutes_left', 'energy', 'remove_exercise_ids', 'swap_exercise_ids'],
    },
  },
  {
    name: 'build_session',
    description: "Build a one-off session from Ascenda's library.",
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        minutes: { enum: [20, 30, 45, 60] },
        focus: { enum: ['full_body', 'upper', 'lower', 'glutes_and_legs', 'cardio', 'recovery'] },
        equipment: { enum: ['full_gym', 'machines', 'dumbbells_and_bench', 'no_equipment'] },
        energy: { enum: ['low', 'normal', 'high'] },
        avoid_exercise_ids: { type: 'array', items: { type: 'string' } },
        include_finisher: { type: 'boolean' },
      },
      required: ['minutes', 'focus', 'equipment', 'energy', 'avoid_exercise_ids', 'include_finisher'],
    },
  },
  {
    name: 'recommend_routine',
    description: "Recommend routines using Ascenda's recommendation rules.",
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        days_per_week: { type: 'integer', minimum: 2, maximum: 6 },
        goals: { type: 'array', items: { type: 'string' } },
        gym_experience: { enum: ['not_yet', 'just_started', 'on_and_off', 'regularly'] },
        session_minutes: { type: 'integer' },
        cardio_preference: { enum: ['love', 'fine', 'avoid'] },
        gym_comfort: { type: 'integer', minimum: 1, maximum: 5 },
        equipment_focus: { enum: ['any', 'machines', 'dumbbells_and_bench', 'barbell'] },
      },
      required: [
        'days_per_week',
        'goals',
        'gym_experience',
        'session_minutes',
        'cardio_preference',
        'gym_comfort',
        'equipment_focus',
      ],
    },
  },
  {
    name: 'move_session',
    description: 'Move one of her planned sessions to another day.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        planned_session_id: { type: 'string' },
        to_date: { type: 'string' },
      },
      required: ['planned_session_id', 'to_date'],
    },
  },
  {
    name: 'save_preference',
    description:
      'Save a lasting preference when she asks to always avoid an exercise, or says her gym does not have some equipment. Never use this for pain, injury, periods, menopause, symptoms, HRT or other health reasons.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { enum: ['avoid_exercise', 'no_equipment_at_my_gym'] },
        exercise_id: { type: ['string', 'null'] },
        equipment: { type: ['string', 'null'] },
        reason: { enum: ['dislike', 'not_available', 'other'] },
      },
      required: ['kind', 'exercise_id', 'equipment', 'reason'],
    },
  },
  {
    name: 'find_recipes',
    description: "Find recipes from Ascenda's reviewed recipes that use ingredients she has.",
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ingredient_keys: { type: 'array', items: { type: 'string' } },
        dietary_tags: { type: 'array', items: { type: 'string' } },
        meal_type: { enum: ['any', 'breakfast', 'lunch', 'dinner', 'snack', 'smoothie'] },
      },
      required: ['ingredient_keys', 'dietary_tags', 'meal_type'],
    },
  },
  {
    name: 'report_coach_answer',
    description: 'Return the Coach reply. Always call this when you are ready to answer.',
    input_schema: {
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
              type: { enum: ['exercise', 'machine', 'article', 'routine', 'recipe', 'stretch', 'cardio'] },
              id: { type: 'string' },
            },
            required: ['type', 'id'],
          },
        },
        card_ids: { type: 'array', items: { type: 'string' } },
        safety_flag: {
          enum: ['none', 'medical', 'pregnancy', 'body_or_diet', 'off_topic', 'emergency', 'wellbeing'],
        },
      },
      required: ['reply', 'links', 'card_ids', 'safety_flag'],
    },
  },
];

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function fail(reason: string, status: number): Response {
  return json({ ok: false, reason }, status);
}

function ukToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

function nextWeekdayIso(weekday: number): string {
  const now = new Date(`${ukToday()}T12:00:00Z`);
  const day = now.getUTCDay();
  const add = (weekday - day + 7) % 7 || 7;
  now.setUTCDate(now.getUTCDate() + add);
  return now.toISOString().slice(0, 10);
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
  if (/\bhrt\b|hormone replacement/.test(q)) {
    return 'medical';
  }
  if (/skipping meals|guilty when i eat|hate my body|don'?t deserve to eat|purging|binge/.test(q)) {
    return 'wellbeing';
  }
  if (
    /calorie|lose weight|weight loss|diet plan|flat stomach|look (big|fat|skinny|thin)|arms look|body fat|bmi/.test(q)
  ) {
    return 'body_or_diet';
  }
  if (
    /hurt|pain|injur|physio|diagnos|medication|illness|condition|knee|shoulder pop|doctor/.test(q) &&
    !/how should this feel|where should i feel/.test(q)
  ) {
    return 'medical';
  }
  if (/poem|system prompt|ignore (your|these) (rules|instructions)|write me a joke/.test(q)) {
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

function asFlag(value: unknown): SafetyFlag {
  const raw = text(value);
  return raw === 'medical' ||
    raw === 'pregnancy' ||
    raw === 'body_or_diet' ||
    raw === 'off_topic' ||
    raw === 'emergency' ||
    raw === 'wellbeing'
    ? raw
    : 'none';
}

function parseContext(raw: unknown): CoachContext {
  const row = asRecord(raw);
  const type = text(row.type);
  const allowed = ['exercise', 'machine', 'session_today', 'routine', 'recipe', 'article', 'none'] as const;
  return {
    type: (allowed as readonly string[]).includes(type) ? (type as CoachContext['type']) : 'none',
    id: text(row.id),
    label: text(row.label),
  };
}

function parseSession(raw: unknown): SessionExercise[] {
  return asArray(raw).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.exercise_id) || text(row.id);
    if (!id) return [];
    return [
      {
        exercise_id: id,
        name: text(row.name) || id,
        role: text(row.role) || 'accessory',
        equipment: text(row.equipment),
        pattern: text(row.pattern),
        sets: num(row.sets) ?? 3,
        remaining_sets: num(row.remaining_sets) ?? num(row.sets) ?? 3,
        rep_min: num(row.rep_min) ?? 8,
        rep_max: num(row.rep_max) ?? 12,
      },
    ];
  });
}

function parsePrefs(raw: unknown): CoachPreference[] {
  return asArray(raw).flatMap((item) => {
    const row = asRecord(item);
    const kind = text(row.kind);
    if (kind !== 'avoid_exercise' && kind !== 'no_equipment_at_my_gym') return [];
    return [
      {
        kind,
        exercise_id: text(row.exercise_id) || null,
        equipment: text(row.equipment) || null,
      },
    ];
  });
}

function usageFrom(body: unknown): { input: number | null; output: number | null } {
  const usage = asRecord(asRecord(body).usage);
  return {
    input: typeof usage.input_tokens === 'number' ? usage.input_tokens : null,
    output: typeof usage.output_tokens === 'number' ? usage.output_tokens : null,
  };
}

function fallbackAnswer(question: string, retrieved: { type: string; id: string }[]): Answer {
  const detected = detectSafetyFlag(question);
  let reply =
    'I could not put a full answer together just now. These guides are a good place to look, or try the question again in a moment.';
  if (detected === 'emergency') {
    reply = 'Please stop and get medical help now. If this is an emergency, call 999.';
  } else if (detected === 'medical') {
    reply = 'I cannot advise on pain or injury. Stop anything that hurts and speak to a GP or physiotherapist.';
  } else if (detected === 'pregnancy') {
    reply =
      'I cannot advise on pregnancy or postnatal training. Please speak to your GP or midwife, and a qualified pre- and postnatal trainer.';
  } else if (detected === 'body_or_diet') {
    reply =
      'Ascenda focuses on strength and fuelling your training, not calorie targets or comments on bodies. A fuelling article may be more useful here.';
  } else if (detected === 'wellbeing') {
    reply =
      'Thank you for saying this. Please speak to a GP about how you are feeling. If eating feels hard, Beat (beat.org.uk) can help.';
  } else if (detected === 'off_topic') {
    reply = 'I can only help with your training, the gym, food for training and using Ascenda.';
  }
  return {
    reply: stripEmDashes(reply),
    links: retrieved.slice(0, 3),
    card_ids: [],
    cards: [],
    safety_flag: detected,
    retrieved_ids: retrieved,
  };
}

function parseAnswer(raw: unknown, allowed: Set<string>, cards: Json[], question: string, retrieved: { type: string; id: string }[]): Answer | null {
  const body = asRecord(raw);
  const reply = stripEmDashes(text(body.reply));
  if (!reply) return null;
  const links = asArray(body.links)
    .flatMap((item) => {
      const row = asRecord(item);
      const type = text(row.type);
      const id = text(row.id);
      if (!type || !id) return [];
      if (!allowed.has(`${type}:${id}`) && !allowed.has(`any:${id}`)) return [];
      return [{ type, id }];
    })
    .slice(0, 3);
  const cardIds = asArray(body.card_ids).map(text).filter((id) => cards.some((card) => text(card.id) === id));
  return {
    reply: reply.slice(0, 900),
    links,
    card_ids: cardIds,
    cards: cards.filter((card) => cardIds.includes(text(card.id))),
    safety_flag: mergeSafety(asFlag(body.safety_flag), detectSafetyFlag(question)),
    retrieved_ids: retrieved,
  };
}

type ClaudeMessage = { role: 'user' | 'assistant'; content: unknown };

async function callClaude(
  apiKey: string,
  messages: ClaudeMessage[],
  signal: AbortSignal,
  toolChoice: 'auto' | 'answer'
): Promise<{ status: number; body: unknown; timedOut: boolean }> {
  try {
    const response = await fetch(ANTHROPIC, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: cachedSystem, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        thinking: { type: 'disabled' },
        tool_choice: toolChoice === 'answer' ? { type: 'tool', name: 'report_coach_answer' } : { type: 'auto' },
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
    const name = error instanceof Error ? error.name : '';
    const timedOut = name === 'AbortError';
    return { status: 0, body: { error: { message: error instanceof Error ? error.message : String(error), type: name } }, timedOut };
  }
}

function claudeText(body: unknown): string {
  return asArray(asRecord(body).content)
    .map((item) => {
      const row = asRecord(item);
      return text(row.type) === 'text' ? text(row.text) : '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function parseJsonBlob(raw: string): Json | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return asRecord(JSON.parse(raw.slice(start, end + 1)));
  } catch {
    return null;
  }
}

function toolUses(body: unknown): { id: string; name: string; input: Json }[] {
  return asArray(asRecord(body).content).flatMap((item) => {
    const row = asRecord(item);
    if (text(row.type) !== 'tool_use') return [];
    return [{ id: text(row.id), name: text(row.name), input: asRecord(row.input) }];
  });
}

function isoWithinDays(iso: string, days: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const stamp = Date.parse(`${iso}T12:00:00Z`);
  if (!Number.isFinite(stamp)) return false;
  const start = Date.parse(`${ukToday()}T00:00:00Z`);
  return stamp >= start && stamp <= start + days * 86400000;
}

type TurnState = {
  remaining: SessionExercise[];
  prefs: CoachPreference[];
  planned: { id: string; date: string; name: string; kind: string }[];
  recentIds: string[];
  herTraining: Json;
  userId: string | null;
  admin: SupabaseClient | null;
  isEval: boolean;
  question: string;
};

/** Period, menopause, symptoms or other health reasons must never become a saved preference. */
function isHealthPreferenceText(value: string): boolean {
  const q = value.toLowerCase();
  return /period|menopause|perimenopause|hot flush|hrt|symptom|cycle phase|follicular|luteal|ovulat|cramp|pms|health|injur|pain|medication|supplement/.test(
    q
  );
}

/** Strip special-category fields. life_stage must never go to the model. */
function omitHealthFromPayload(value: Json): Json {
  const out: Json = {};
  for (const [key, item] of Object.entries(value)) {
    if (/life_stage|bodyweight|health|menopause|perimenopause/.test(key)) continue;
    out[key] = item;
  }
  return out;
}

async function runTool(name: string, input: Json, state: TurnState): Promise<Json> {
  if (name === 'lookup') {
    const result = lookupTool(indexes, input);
    return result.ok ? { items: result.items } : { error: result.error };
  }
  if (name === 'adjust_today') {
    const result = adjustTodayTool(indexes, input, state.remaining, state.prefs);
    return result.ok ? result.card : { error: result.error };
  }
  if (name === 'build_session') {
    const result = buildSessionTool(indexes, input, state.prefs, state.recentIds);
    return result.ok ? result.card : { error: result.error };
  }
  if (name === 'recommend_routine') {
    const result = recommendRoutineTool(indexes, input);
    return result.ok ? result.card : { error: result.error };
  }
  if (name === 'find_recipes') {
    const result = findRecipesTool(indexes, input);
    return result.ok ? result.card : { error: result.error };
  }
  if (name === 'save_preference') {
    const blob = `${JSON.stringify(input)} ${state.question}`;
    const detected = detectSafetyFlag(blob);
    if (
      detected === 'medical' ||
      detected === 'pregnancy' ||
      detected === 'emergency' ||
      isHealthPreferenceText(blob)
    ) {
      return { error: 'Do not save a preference for a health or medical reason. Redirect to a GP or physiotherapist.' };
    }
    const kind = text(input.kind);
    let exerciseId = text(input.exercise_id);
    if (kind === 'avoid_exercise' && /lunge/i.test(exerciseId)) {
      exerciseId = lungeExerciseIds(indexes).includes(exerciseId) ? exerciseId : lungeExerciseIds(indexes)[0] ?? exerciseId;
    }
    if (kind === 'avoid_exercise' && !exerciseId) {
      return { error: 'exercise_id is required' };
    }
    if (kind === 'no_equipment_at_my_gym' && !text(input.equipment)) {
      return { error: 'equipment is required' };
    }
    const label =
      kind === 'avoid_exercise'
        ? `Never give ${indexes.exercises.find((item) => item.id === exerciseId)?.name ?? exerciseId}`
        : `No ${text(input.equipment)} at my gym`;
    return {
      id: `pref-${exerciseId || text(input.equipment)}`,
      type: 'confirm',
      buttons: ['Save', 'Cancel'],
      kind,
      exercise_id: exerciseId || null,
      equipment: text(input.equipment) ? mapEquipmentToken(text(input.equipment)) : null,
      reason: text(input.reason) || 'dislike',
      label,
      note: 'You can remove this in Profile, Coach preferences.',
    };
  }
  if (name === 'move_session') {
    const id = text(input.planned_session_id);
    const toDate = text(input.to_date);
    const owned = state.planned.find((item) => item.id === id);
    if (!owned) return { error: 'That planned session is not hers or was not found' };
    if (!isoWithinDays(toDate, 14)) return { error: 'Date must be within the next 14 days' };
    return {
      id: `move-${id}`,
      type: 'confirm',
      buttons: ['Confirm', 'Cancel'],
      planned_session_id: id,
      from_date: owned.date,
      to_date: toDate,
      name: owned.name,
    };
  }
  if (name === 'my_training') {
    if (state.isEval) {
      return { note: 'Eval fixture only. Use <her_training>.', her_training: state.herTraining };
    }
    if (!state.admin || !state.userId) return { error: 'Training history is unavailable' };
    const what = text(input.what);
    const weeks = Math.min(12, Math.max(1, num(input.weeks) ?? 4));
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - weeks * 7);
    if (what === 'personal_bests') {
      const { data } = await state.admin
        .from('personal_bests')
        .select('exercise_id, weight_kg, reps, achieved_at')
        .eq('user_id', state.userId)
        .order('achieved_at', { ascending: false })
        .limit(20);
      return { personal_bests: data ?? [] };
    }
    if (what === 'checkpoints') {
      const { data } = await state.admin
        .from('checkpoint_results')
        .select('exercise_id, week, weight_kg, reps, recorded_at')
        .eq('user_id', state.userId)
        .order('recorded_at', { ascending: false })
        .limit(20);
      return { checkpoints: data ?? [] };
    }
    // Sessions only. Do not join profiles.life_stage into Coach context.
    const { data: sessions } = await state.admin
      .from('sessions')
      .select('id, started_at, completed_at, duration_seconds')
      .eq('user_id', state.userId)
      .gte('started_at', since.toISOString())
      .order('started_at', { ascending: false })
      .limit(20);
    return { sessions: sessions ?? [] };
  }
  return { error: `Unknown tool ${name}` };
}

function titleFromMessage(message: string): string {
  const clean = message.replace(/\s+/g, ' ').trim();
  return clean.slice(0, 40) || 'New chat';
}

function parseHistory(raw: unknown): { role: 'user' | 'assistant'; content: string }[] {
  return asArray(raw).flatMap((item) => {
    const row = asRecord(item);
    const role = text(row.role);
    const content = text(row.content).slice(0, 900);
    if ((role !== 'user' && role !== 'assistant') || !content) return [];
    return [{ role: role as 'user' | 'assistant', content }];
  });
}

Deno.serve(async (req) => {
  try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = envString('SUPABASE_URL');
  const anonKey = envString('SUPABASE_ANON_KEY') || jsonSecret('SUPABASE_PUBLISHABLE_KEYS', ['default', 'anon']);
  const serviceKey =
    envString('SUPABASE_SERVICE_ROLE_KEY') || jsonSecret('SUPABASE_SECRET_KEYS', ['default', 'service_role']);
  const apiKey = envString('ANTHROPIC_API_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey || !apiKey) {
    return fail('unavailable', 503);
  }

  let parsedBody: Json = {};
  try {
    parsedBody = asRecord(await req.json());
  } catch {
    return fail('error', 400);
  }

  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  const isEval = parsedBody.eval === true && bearer === serviceKey;
  let userId: string | null = null;
  let admin: SupabaseClient | null = createClient(supabaseUrl, serviceKey);

  if (!isEval) {
    if (!authHeader.toLowerCase().startsWith('bearer ')) return fail('unauthorized', 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    userId = userData.user?.id ?? null;
    if (userError || !userId) return fail('unauthorized', 401);
    const entitled = await userHasAscendaPro(userClient);
    if (entitled === false) return fail('unauthorized', 401);
  }

  const question = text(parsedBody.message) || text(parsedBody.question);
  if (!question) return fail('error', 400);

  const context = parseContext(parsedBody.context);
  const remaining = parseSession(parsedBody.session_today ?? asRecord(parsedBody.eval_fixtures).session_today);
  const fixturePrefs = parsePrefs(asRecord(parsedBody.eval_fixtures).coach_preferences ?? parsedBody.coach_preferences);
  const fixturePlanned = asArray(asRecord(parsedBody.eval_fixtures).planned_sessions ?? parsedBody.planned_sessions).flatMap(
    (item) => {
      const row = asRecord(item);
      const id = text(row.id);
      const date = text(row.date);
      if (!id || !date) return [];
      return [{ id, date, name: text(row.name) || 'Session', kind: text(row.kind) || 'routine' }];
    }
  );

  let prefs = fixturePrefs;
  let planned = fixturePlanned;
  let herTraining: Json = omitHealthFromPayload(
    asRecord(asRecord(parsedBody.eval_fixtures).her_training ?? parsedBody.her_training)
  );
  let recentIds: string[] = asArray(herTraining.recent_exercise_ids).map(text).filter(Boolean);

  if (!isEval && userId && admin) {
    const { data: prefRows } = await admin.from('coach_preferences').select('kind, exercise_id, equipment').eq('user_id', userId);
    prefs = parsePrefs(prefRows ?? []).concat(prefs);
    const weekStart = ukToday();
    const { data: planRows } = await admin
      .from('planned_sessions')
      .select('id, date, status')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .order('date');
    if (planned.length === 0) {
      planned = (planRows ?? []).map((row) => {
        const item = asRecord(row);
        return { id: text(item.id), date: text(item.date), name: 'Session', kind: 'routine' };
      }).filter((item) => item.id);
    }
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, started_at, duration_seconds')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(5);
    herTraining = {
      ...herTraining,
      last_sessions: sessions ?? [],
      planned_sessions: planned,
      coach_preferences: prefs,
    };
  }
  herTraining = omitHealthFromPayload({
    ...herTraining,
    today: ukToday(),
    next_saturday: nextWeekdayIso(6),
    next_monday: nextWeekdayIso(1),
  });

  const retrieved = retrieve(indexes, question, context);
  const retrievedIds = retrieved.map((item) => ({ type: item.type, id: item.id }));
  const allowed = new Set<string>([
    ...indexes.exercises.map((item) => `exercise:${item.id}`),
    ...indexes.machines.map((item) => `machine:${item.id}`),
    ...indexes.articles.map((item) => `article:${item.id}`),
    ...indexes.routines.map((item) => `routine:${item.slug}`),
    ...indexes.recipes.map((item) => `recipe:${item.slug}`),
    ...indexes.stretches.map((item) => `stretch:${item.id}`),
    ...indexes.cardio.map((item) => `cardio:${item.id}`),
  ]);

  if (!isEval && userId && admin && !bypassAiLimit(parsedBody)) {
    const periodStart = ukToday();
    const { data: quotaRow } = await admin
      .from('ai_quota')
      .select('count')
      .eq('user_id', userId)
      .eq('feature', FEATURE)
      .eq('period_start', periodStart)
      .maybeSingle();
    const used = typeof quotaRow?.count === 'number' ? quotaRow.count : 0;
    if (used >= DAILY_LIMIT) return fail('limit', 429);
    const { error: quotaError } = await admin.from('ai_quota').upsert(
      { user_id: userId, feature: FEATURE, period_start: periodStart, count: used + 1 },
      { onConflict: 'user_id,feature,period_start' }
    );
    if (quotaError && !/ai_quota|schema cache/i.test(quotaError.message)) {
      console.log('coach quota write failed');
    }
  }

  const history = parseHistory(parsedBody.history).slice(-HISTORY_LIMIT);
  const summary = text(parsedBody.summary) || text(asRecord(parsedBody.eval_fixtures).summary);
  const userTurn = [
    summary ? `<summary>\n${summary}\n</summary>` : '',
    `<context>\n${JSON.stringify(contextRecord(indexes, context, remaining))}\n</context>`,
    `<her_training>\n${JSON.stringify(herTraining)}\n</her_training>`,
    `<retrieved>\n${JSON.stringify(retrieved.map((item) => item.record))}\n</retrieved>`,
    `<user_input>\n${question}\n</user_input>`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const messages: ClaudeMessage[] = [
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: 'user', content: userTurn },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const cards: Json[] = [];
  const toolsCalled: { name: string; input: Json }[] = [];
  let lastUsage = { input: null as number | null, output: null as number | null };
  let result: Answer | null = null;
  let timedOut = false;
  let lastClaudeStatus = 0;
  let lastClaudeError = '';
  let lastStop = '';
  let lastContentTypes: string[] = [];
  let lastContentPreview = '';
  const state: TurnState = {
    remaining,
    prefs,
    planned,
    recentIds,
    herTraining,
    userId,
    admin,
    isEval,
    question,
  };

  try {
    let toolCount = 0;
    for (let step = 0; step < MAX_TOOL_CALLS + 2 && !result; step += 1) {
      const choice = toolCount >= MAX_TOOL_CALLS || step === MAX_TOOL_CALLS + 1 ? 'answer' : 'auto';
      const call = await callClaude(apiKey, messages, controller.signal, choice);
      lastClaudeStatus = call.status;
      lastClaudeError = text(asRecord(asRecord(call.body).error).message) || text(asRecord(asRecord(call.body).error).type);
      lastStop = text(asRecord(call.body).stop_reason);
      lastContentTypes = asArray(asRecord(call.body).content).map((item) => text(asRecord(item).type) || 'unknown');
      lastContentPreview = JSON.stringify(asArray(asRecord(call.body).content)[0] ?? asRecord(call.body)).slice(0, 280);
      lastUsage = {
        input: (lastUsage.input ?? 0) + (usageFrom(call.body).input ?? 0),
        output: (lastUsage.output ?? 0) + (usageFrom(call.body).output ?? 0),
      };
      if (call.timedOut) {
        timedOut = true;
        break;
      }
      if (call.status < 200 || call.status >= 300) {
        const err = asRecord(asRecord(call.body).error);
        console.log('coach claude', call.status, text(err.type), text(err.message).slice(0, 180));
        break;
      }
      const uses = toolUses(call.body);
      const answerUse = uses.find((item) => item.name === 'report_coach_answer');
      if (answerUse) {
        result = parseAnswer(answerUse.input, allowed, cards, question, retrievedIds);
        if (result) break;
      }
      const actionable = uses.filter((item) => item.name !== 'report_coach_answer').slice(0, MAX_TOOL_CALLS - toolCount);
      if (actionable.length === 0) {
        const fromTool = parseAnswer(asRecord(uses[0]?.input), allowed, cards, question, retrievedIds);
        const fromText = parseAnswer(parseJsonBlob(claudeText(call.body)), allowed, cards, question, retrievedIds);
        const rawText = claudeText(call.body);
        result =
          fromTool ??
          fromText ??
          (rawText
            ? {
                reply: stripEmDashes(rawText).slice(0, 900),
                links: retrievedIds.slice(0, 3),
                card_ids: cards.map((card) => text(card.id)).filter(Boolean),
                cards,
                safety_flag: detectSafetyFlag(question),
                retrieved_ids: retrievedIds,
              }
            : null);
        break;
      }
      const toolResults: Json[] = [];
      for (const use of actionable) {
        toolCount += 1;
        toolsCalled.push({ name: use.name, input: use.input });
        const output = await runTool(use.name, use.input, state);
        if (output && typeof output === 'object' && text(output.type) && text(output.id)) cards.push(output);
        else if (output && typeof output === 'object' && text(asRecord(output).id) && text(asRecord(output).type)) {
          cards.push(output);
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(output).slice(0, 4000),
        });
      }
      messages.push({ role: 'assistant', content: asRecord(call.body).content });
      messages.push({ role: 'user', content: toolResults });
    }
  } finally {
    clearTimeout(timer);
  }

  if (!isEval && userId && admin) {
    await admin.from('ai_usage').insert({
      user_id: userId,
      feature: FEATURE,
      model: MODEL,
      input_tokens: lastUsage.input,
      output_tokens: lastUsage.output,
    });
  }

  const answer =
    result ??
    fallbackAnswer(
      question,
      retrievedIds.length > 0 ? retrievedIds : fallbackLinks(indexes, question, context)
    );
  if (timedOut && !result) {
    answer.reply = stripEmDashes('That took too long. Please try again.');
  }
  if (cards.length > 0 && answer.card_ids.length === 0) {
    answer.cards = cards;
    answer.card_ids = cards.map((card) => text(card.id)).filter(Boolean);
  }
  if (answer.links.length === 0) {
    answer.links = retrievedIds.slice(0, 3);
  }

  let conversationId = text(parsedBody.conversation_id);
  let messageId: string | null = null;
  if (!isEval && userId && admin) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    await admin.from('ai_conversations').delete().eq('user_id', userId).lt('created_at', cutoff.toISOString());
    const newChat = parsedBody.new_chat === true || !isUuid(conversationId);
    if (!newChat) {
      const { data: existing } = await admin
        .from('ai_conversations')
        .select('id, summary')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!existing) conversationId = '';
    } else {
      conversationId = '';
    }
    const now = new Date().toISOString();
    if (!conversationId) {
      const created = await admin
        .from('ai_conversations')
        .insert({
          user_id: userId,
          context_type: context.type,
          context_id: context.id || null,
          title: titleFromMessage(question),
          last_message_at: now,
          context_payload: { context, session_today: remaining },
        })
        .select('id')
        .single();
      conversationId = text(asRecord(created.data).id);
    } else {
      await admin
        .from('ai_conversations')
        .update({ last_message_at: now, updated_at: now })
        .eq('id', conversationId)
        .eq('user_id', userId);
    }
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
          cards: answer.cards,
          retrieved_ids: answer.retrieved_ids,
        })
        .select('id')
        .single();
      messageId = text(asRecord(saved.data).id) || null;
    }
  }

  return json({
    ok: true,
    ...answer,
    fallback: !result,
    conversation_id: conversationId || null,
    message_id: messageId,
    tools_called: toolsCalled.map((item) => item.name),
    tool_calls: toolsCalled,
    ...(isEval
      ? {
          timed_out: timedOut,
          claude_status: lastClaudeStatus,
          claude_error: lastClaudeError || undefined,
          claude_stop: lastStop || undefined,
          claude_content_types: lastContentTypes,
          claude_preview: lastContentPreview || undefined,
        }
      : {}),
  });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log('coach crash', message);
    return json({ ok: false, reason: 'error', error: message }, 500);
  }
});
