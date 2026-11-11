/**
 * AI4 Ask Ascenda. Context, chips and local fallback.
 * Never sends name, email, bodyweight, photos, onboarding statements or health info.
 */
import { router, type Href } from 'expo-router';

import aiConfig from '../../content/ai/ai-config.json';

import { allExerciseGuides, guideForExercise, resolveExerciseSlug } from '@/lib/contentGuides';
import { contentRoutine } from '@/lib/contentRoutines';
import { RECIPES } from '@/lib/food';
import { LEARN_ARTICLES, canonicalLearnArticleId } from '@/lib/learnArticles';
import { allMachineGuides, machineGuide } from '@/lib/machineGuides';
import { exerciseNameFromSlug } from '@/lib/onboardingAnswers';
import { addDays, loadPlannerWeek, startOfWeekMonday, toIso, type PlannedSession } from '@/lib/planner';
import { currentEnrolmentWeek, fetchActiveEnrolment } from '@/lib/routines';
import { supabase } from '@/lib/supabase';

export const ASK_FEATURE = 'ask_ascenda' as const;
export const ASK_DAILY_LIMIT = 30;
export const ASK_HISTORY_LIMIT = 6;

export const ASK_SCREENS = ['open', 'exercise', 'machine', 'routine', 'logger'] as const;
export type AskScreen = (typeof ASK_SCREENS)[number];

export const ASK_SAFETY_FLAGS = [
  'none',
  'medical',
  'pregnancy',
  'body_or_diet',
  'off_topic',
  'emergency',
  'wellbeing',
] as const;
export type AskSafetyFlag = (typeof ASK_SAFETY_FLAGS)[number];

export const ASK_LINK_TYPES = ['exercise', 'machine', 'article', 'routine', 'recipe'] as const;
export type AskLinkType = (typeof ASK_LINK_TYPES)[number];

export type AskLink = { type: AskLinkType; id: string };

export type AskMoveAction = {
  type: 'move_session';
  planned_session_id: string;
  to_date: string;
};

export type AskAnswer = {
  reply: string;
  links: AskLink[];
  action: AskMoveAction | null;
  safety_flag: AskSafetyFlag;
  fallback: boolean;
};

export type AskMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  safety_flag: AskSafetyFlag | null;
  links: AskLink[];
  action: AskMoveAction | null;
  feedback: 'up' | 'down' | null;
  created_at: string;
};

export type AskHistoryTurn = { role: 'user' | 'assistant'; content: string };

export type AskGuideCard = {
  id: string;
  name: string;
  summary: string;
};

export type AskContext = {
  question: string;
  screen: AskScreen;
  screen_id: string | null;
  routine: {
    id: string;
    name: string;
    week: number;
    days_per_week: number;
    length_weeks: number;
  } | null;
  planned_sessions: {
    id: string;
    date: string;
    name: string;
    kind: string;
  }[];
  last_sessions: {
    date: string;
    exercises: { name: string; sets: number; reps: number | null; weight_kg: number | null }[];
  }[];
  exercise_guides: AskGuideCard[];
  machine_guides: AskGuideCard[];
  learn_summaries: AskGuideCard[];
  app_help: { id: string; text: string }[];
};

const CHIPS = aiConfig.ask_ascenda_chips;
export const ASK_UI = aiConfig.ui_copy;

export const APP_HELP: { id: string; text: string }[] = [
  {
    id: 'suggested_weight',
    text: 'Suggested weights come from the double-progression rule and her log. The logger shows a chip when it is time to go up. Ask Ascenda never gives a kg number.',
  },
  {
    id: 'rir',
    text: 'Reps in reserve means stop with that many reps still left. Beginners usually stop with 2 to 3 left. The logger shows this in plain English.',
  },
  {
    id: 'swap',
    text: 'Swap from the exercise card in the logger, or use Something\'s taken when kit is busy. Changes apply to today only.',
  },
  {
    id: 'planner',
    text: 'She can move a planned session in the Planner. Ask Ascenda can propose a move. The app always asks her to confirm first.',
  },
  {
    id: 'streak',
    text: 'A week counts if she does at least one session. Hitting her weekly target is a gold week. Rest weeks are not used.',
  },
  {
    id: 'fuel',
    text: 'Food is framed as fuel for training. There are no calorie targets or food logs. Recipes and Learn articles cover general fuelling only.',
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((item) => item.length > 2);
}

function scoreHay(hay: string, words: string[]): number {
  const lower = hay.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (lower.includes(word)) score += word.length > 5 ? 2 : 1;
  }
  return score;
}

export function chipsForScreen(screen: AskScreen): string[] {
  if (screen === 'exercise') return CHIPS.exercise_page;
  if (screen === 'machine') return CHIPS.machine_page;
  if (screen === 'routine') return CHIPS.routine_page;
  if (screen === 'logger') return CHIPS.logger;
  return CHIPS.on_open;
}

export function openAsk(params?: { screen?: AskScreen; id?: string; question?: string }): void {
  router.push({
    pathname: '/ask',
    params: {
      screen: params?.screen ?? 'open',
      id: params?.id ?? '',
      question: params?.question ?? '',
    },
  } as Href);
}

export function parseAskScreen(value: unknown): AskScreen {
  const raw = text(value);
  return (ASK_SCREENS as readonly string[]).includes(raw) ? (raw as AskScreen) : 'open';
}

export function stripEmDashes(value: string): string {
  return value.replace(/\u2014/g, ',').replace(/\u2013/g, ' to ');
}

export function detectSafetyFlag(question: string): AskSafetyFlag {
  const q = question.toLowerCase();
  if (
    /chest pain|tightness in (my )?chest|can'?t breathe|severe breath|faint|fainting|pass out|collapsed|call 999|heart attack/.test(
      q
    )
  ) {
    return 'emergency';
  }
  if (
    /pregnan|trying to conceive|postnatal|post-natal|given birth|after birth|breastfeed/.test(q)
  ) {
    return 'pregnancy';
  }
  if (
    /skipping meals|guilty when i eat|hate my body|don'?t deserve to eat|purging|binge/.test(q)
  ) {
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
  if (
    /poem|system prompt|ignore (your|these) rules|unrelated|cats$|write me a joke/.test(q)
  ) {
    return 'off_topic';
  }
  return 'none';
}

export function mergeSafetyFlag(model: AskSafetyFlag, detected: AskSafetyFlag): AskSafetyFlag {
  const rank: Record<AskSafetyFlag, number> = {
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

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isoWithinDays(iso: string, days: number): boolean {
  const stamp = Date.parse(`${iso}T12:00:00`);
  if (!Number.isFinite(stamp)) return false;
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const end = start + days * 86400000;
  return stamp >= start && stamp <= end;
}

function pickGuides(question: string, screen: AskScreen, screenId: string | null) {
  const words = tokens(question);
  const exerciseGuides = allExerciseGuides()
    .map((guide) => {
      const name = exerciseNameFromSlug(guide.slug);
      const hay = `${guide.slug} ${name} ${guide.where_to_find} ${guide.setup.join(' ')} ${guide.form_cues.join(' ')}`;
      let score = scoreHay(hay, words);
      if (screen === 'exercise' && screenId && resolveExerciseSlug(screenId) === guide.slug) score += 20;
      return {
        id: guide.slug,
        name,
        summary: [guide.setup[0], guide.form_cues[0], guide.if_its_taken.tip].filter(Boolean).join(' '),
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score: _score, ...item }) => item);

  const machineGuides = allMachineGuides()
    .map((guide) => {
      const hay = `${guide.id} ${guide.name} ${guide.whereToFind} ${guide.setup.join(' ')} ${guide.beginnerSettings}`;
      let score = scoreHay(hay, words);
      if (screen === 'machine' && screenId && (screenId === guide.id || screenId.replace(/-/g, '_') === guide.id)) {
        score += 20;
      }
      return {
        id: guide.id,
        name: guide.name,
        summary: [guide.setup[0], guide.beginnerSettings].filter(Boolean).join(' '),
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ score: _score, ...item }) => item);

  const learn = LEARN_ARTICLES.map((article) => {
    const hay = `${article.slug} ${article.title} ${article.summary} ${article.category}`;
    let score = scoreHay(hay, words);
    if (/calorie|eat|food|snack|protein|fuel/.test(question.toLowerCase()) && article.category === 'fuelling') {
      score += 4;
    }
    if (/creatine|supplement/.test(question.toLowerCase()) && article.slug.includes('supplement')) score += 8;
    if (/rest week|recovery|sore/.test(question.toLowerCase()) && article.category === 'recovery') score += 4;
    if (/rir|heavy|weight chip|starting weight/.test(question.toLowerCase()) && /reps-in-reserve|starting-weight|progressive/.test(article.slug)) {
      score += 6;
    }
    return {
      id: article.id,
      name: article.title,
      summary: article.summary,
      score,
    };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score: _score, ...item }) => item);

  if (screen === 'exercise' && screenId && exerciseGuides.length === 0) {
    const guide = guideForExercise(screenId);
    if (guide) {
      exerciseGuides.push({
        id: guide.slug,
        name: exerciseNameFromSlug(guide.slug),
        summary: [guide.setup[0], guide.form_cues[0]].filter(Boolean).join(' '),
      });
    }
  }
  if (screen === 'machine' && screenId && machineGuides.length === 0) {
    const guide = machineGuide(screenId);
    if (guide) {
      machineGuides.push({
        id: guide.id,
        name: guide.name,
        summary: [guide.setup[0], guide.beginnerSettings].filter(Boolean).join(' '),
      });
    }
  }

  return { exerciseGuides, machineGuides, learn };
}

async function lastSessionsPayload(): Promise<AskContext['last_sessions']> {
  try {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, date')
      .not('completed_at', 'is', null)
      .order('date', { ascending: false })
      .limit(5);
    const rows = sessions ?? [];
    const ids = rows.map((row) => text(asRecord(row).id)).filter(Boolean);
    if (ids.length === 0) return [];
    const { data: sets } = await supabase
      .from('sets')
      .select('session_id, exercise_id, set_number, weight_kg, reps, completed, exercise:exercises(name)')
      .in('session_id', ids)
      .eq('completed', true)
      .gt('set_number', 0);
    const bySession = new Map<string, AskContext['last_sessions'][number]['exercises']>();
    for (const raw of sets ?? []) {
      const row = asRecord(raw);
      const sessionId = text(row.session_id);
      const exerciseId = resolveExerciseSlug(text(row.exercise_id));
      const nested = asRecord(row.exercise);
      const name = text(nested.name) || exerciseNameFromSlug(exerciseId);
      if (!sessionId || !name) continue;
      const list = bySession.get(sessionId) ?? [];
      const existing = list.find((item) => item.name === name);
      const reps = typeof row.reps === 'number' ? row.reps : Number(row.reps);
      const weight = typeof row.weight_kg === 'number' ? row.weight_kg : Number(row.weight_kg);
      if (existing) {
        existing.sets += 1;
      } else {
        list.push({
          name,
          sets: 1,
          reps: Number.isFinite(reps) ? reps : null,
          weight_kg: Number.isFinite(weight) ? weight : null,
        });
      }
      bySession.set(sessionId, list);
    }
    return rows.map((row) => {
      const item = asRecord(row);
      return {
        date: text(item.date),
        exercises: (bySession.get(text(item.id)) ?? []).slice(0, 8),
      };
    });
  } catch {
    return [];
  }
}

export async function buildAskContext(input: {
  question: string;
  screen: AskScreen;
  screenId?: string | null;
}): Promise<AskContext> {
  const screenId = text(input.screenId) || null;
  const picked = pickGuides(input.question, input.screen, screenId);
  let routine: AskContext['routine'] = null;
  const planned: AskContext['planned_sessions'] = [];
  try {
    const enrolment = await fetchActiveEnrolment();
    if (enrolment) {
      const overlay = contentRoutine(enrolment.routine.slug) ?? contentRoutine(enrolment.routine.id);
      routine = {
        id: enrolment.routine.slug || enrolment.routine.id,
        name: enrolment.routine.name,
        week: currentEnrolmentWeek(enrolment),
        days_per_week: enrolment.routine.days_per_week,
        length_weeks: enrolment.routine.length_weeks,
      };
      if (input.screen === 'routine' && screenId && overlay) {
        routine.id = overlay.slug;
      }
    }
    const weekStart = startOfWeekMonday(new Date());
    const weeks = await Promise.all([
      loadPlannerWeek(weekStart),
      loadPlannerWeek(addDays(weekStart, 7)),
    ]);
    for (const week of weeks) {
      for (const day of week.days) {
        if (!day.plan || day.kind === 'empty' || day.kind === 'rest') continue;
        if (!isUuid(day.plan.id)) continue;
        planned.push({
          id: day.plan.id,
          date: day.iso,
          name: day.title || day.kind,
          kind: day.kind,
        });
      }
    }
  } catch {
    /* Planner and enrolment are optional context. */
  }

  return {
    question: input.question.trim(),
    screen: input.screen,
    screen_id: screenId,
    routine,
    planned_sessions: planned,
    last_sessions: await lastSessionsPayload(),
    exercise_guides: picked.exerciseGuides,
    machine_guides: picked.machineGuides,
    learn_summaries: picked.learn,
    app_help: APP_HELP,
  };
}

export function fallbackAskAnswer(context: AskContext): AskAnswer {
  const detected = detectSafetyFlag(context.question);
  const links: AskLink[] = [
    ...context.learn_summaries.slice(0, 2).map((item) => ({ type: 'article' as const, id: item.id })),
    ...context.exercise_guides.slice(0, 1).map((item) => ({ type: 'exercise' as const, id: item.id })),
    ...context.machine_guides.slice(0, 1).map((item) => ({ type: 'machine' as const, id: item.id })),
  ].slice(0, 3);
  let reply =
    'I could not put a full answer together just now. These guides and articles are a good place to look, or try the question again in a moment.';
  if (detected === 'emergency') {
    reply =
      'Please stop and get medical help now. If this is an emergency, call your local emergency number.';
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
  return {
    reply: stripEmDashes(reply),
    links,
    action: null,
    safety_flag: detected,
    fallback: true,
  };
}

function parseLink(raw: unknown, allowed: Set<string>): AskLink | null {
  const row = asRecord(raw);
  const type = text(row.type);
  const id = text(row.id);
  if (!(ASK_LINK_TYPES as readonly string[]).includes(type) || !id) return null;
  const key = `${type}:${id}`;
  if (!allowed.has(key) && !allowed.has(id)) return null;
  return { type: type as AskLinkType, id };
}

function parseAction(raw: unknown, plannedIds: Set<string>): AskMoveAction | null {
  const row = asRecord(raw);
  if (text(row.type) !== 'move_session') return null;
  const id = text(row.planned_session_id);
  const toDate = text(row.to_date);
  if (!isUuid(id) || !plannedIds.has(id) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return null;
  if (!isoWithinDays(toDate, 14)) return null;
  return { type: 'move_session', planned_session_id: id, to_date: toDate };
}

export function parseAskAnswer(
  raw: unknown,
  context: AskContext,
  fallback: boolean
): AskAnswer | null {
  const body = asRecord(raw);
  const reply = stripEmDashes(text(body.reply));
  if (!reply) return null;
  const allowed = new Set<string>([
    ...context.exercise_guides.map((item) => `exercise:${item.id}`),
    ...context.machine_guides.map((item) => `machine:${item.id}`),
    ...context.learn_summaries.map((item) => `article:${item.id}`),
    ...RECIPES.map((item) => `recipe:${item.slug}`),
    ...(context.routine ? [`routine:${context.routine.id}`] : []),
  ]);
  const links = (Array.isArray(body.links) ? body.links : [])
    .map((item) => parseLink(item, allowed))
    .filter((item): item is AskLink => item !== null)
    .slice(0, 3);
  const flagRaw = text(body.safety_flag);
  const modelFlag = (ASK_SAFETY_FLAGS as readonly string[]).includes(flagRaw)
    ? (flagRaw as AskSafetyFlag)
    : 'none';
  const plannedIds = new Set(context.planned_sessions.map((item) => item.id));
  return {
    reply: reply.slice(0, 900),
    links,
    action: parseAction(body.action, plannedIds),
    safety_flag: mergeSafetyFlag(modelFlag, detectSafetyFlag(context.question)),
    fallback,
  };
}

export function allowedLinkId(link: AskLink): boolean {
  if (link.type === 'exercise') return Boolean(guideForExercise(link.id) || exerciseNameFromSlug(link.id));
  if (link.type === 'machine') return Boolean(machineGuide(link.id));
  if (link.type === 'article') return LEARN_ARTICLES.some((item) => item.id === canonicalLearnArticleId(link.id));
  if (link.type === 'routine') return Boolean(contentRoutine(link.id));
  if (link.type === 'recipe') return RECIPES.some((item) => item.slug === link.id);
  return false;
}

export function openAskLink(link: AskLink): void {
  if (link.type === 'exercise') {
    router.push({ pathname: '/exercise/[id]', params: { id: link.id } } as Href);
    return;
  }
  if (link.type === 'machine') {
    router.push({ pathname: '/machines/[id]', params: { id: link.id } } as Href);
    return;
  }
  if (link.type === 'article') {
    const articleId = canonicalLearnArticleId(link.id) ?? link.id;
    router.push({ pathname: '/learn/[id]', params: { id: articleId } } as Href);
    return;
  }
  if (link.type === 'routine') {
    router.push({ pathname: '/routines/[id]', params: { id: link.id } } as Href);
    return;
  }
  router.push({ pathname: '/food/recipe/[slug]', params: { slug: link.id } } as Href);
}

export function stripNeverSend<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripNeverSend(item)) as T;
  if (!value || typeof value !== 'object') return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (NEVER_SEND.includes(key)) continue;
    next[key] = stripNeverSend(item);
  }
  return next as T;
}

export function isMissingAskTables(error: { message?: string; code?: string } | null | undefined): boolean {
  return /ai_conversations|ai_messages|schema cache/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

export async function loadAskThread(): Promise<{ conversationId: string | null; messages: AskMessage[] }> {
  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('id')
      .gte('updated_at', cutoff.toISOString())
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isMissingAskTables(error)) return { conversationId: null, messages: [] };
      throw error;
    }
    const conversationId = text(asRecord(data).id) || null;
    if (!conversationId) return { conversationId: null, messages: [] };
    const { data: rows, error: messageError } = await supabase
      .from('ai_messages')
      .select('id, role, content, safety_flag, links, action, feedback, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (messageError) {
      if (isMissingAskTables(messageError)) return { conversationId, messages: [] };
      throw messageError;
    }
    return {
      conversationId,
      messages: (rows ?? []).map(toAskMessage).filter((item): item is AskMessage => item !== null),
    };
  } catch (error) {
    if (isMissingAskTables(error as { message?: string })) return { conversationId: null, messages: [] };
    throw error;
  }
}

function toAskMessage(raw: unknown): AskMessage | null {
  const row = asRecord(raw);
  const role = text(row.role);
  const content = text(row.content);
  if ((role !== 'user' && role !== 'assistant') || !content) return null;
  const flag = text(row.safety_flag);
  const feedback = text(row.feedback);
  const action = parseAction(row.action, new Set([text(asRecord(row.action).planned_session_id)]));
  return {
    id: text(row.id) || `local-${Date.now()}`,
    role,
    content,
    safety_flag: (ASK_SAFETY_FLAGS as readonly string[]).includes(flag) ? (flag as AskSafetyFlag) : null,
    links: (Array.isArray(row.links) ? row.links : [])
      .map((item) => parseLink(item, new Set([`${text(asRecord(item).type)}:${text(asRecord(item).id)}`])))
      .filter((item): item is AskLink => item !== null),
    action,
    feedback: feedback === 'up' || feedback === 'down' ? feedback : null,
    created_at: text(row.created_at) || new Date().toISOString(),
  };
}

export async function saveAskFeedback(messageId: string, feedback: 'up' | 'down'): Promise<void> {
  const { error } = await supabase.from('ai_messages').update({ feedback }).eq('id', messageId);
  if (error && !isMissingAskTables(error)) throw error;
}

export async function deleteAskHistory(): Promise<void> {
  const { error } = await supabase.from('ai_conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error && !isMissingAskTables(error)) throw error;
}

export function historyTurns(messages: AskMessage[]): AskHistoryTurn[] {
  return messages
    .slice(-ASK_HISTORY_LIMIT)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 900) }));
}

export function plannedSessionLabel(plan: PlannedSession | AskContext['planned_sessions'][number], toDate: string): string {
  const name = 'name' in plan ? plan.name : toDate;
  return `${name} to ${toDate}`;
}

export function findPlannedName(context: AskContext, action: AskMoveAction): string {
  return context.planned_sessions.find((item) => item.id === action.planned_session_id)?.name ?? 'That session';
}
