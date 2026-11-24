/**
 * Strivella Coach. Context, chips, new-chat rules and card helpers.
 * Never sends name, email, bodyweight, photos, onboarding statements, life_stage, period dates or health info.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';

import aiConfig from '../../content/ai/ai-config.json';

import { isFeatureEnabled } from '@/config/features';
import { startBuiltStrengthSession, type BuiltSession } from '@/lib/buildSession';
import type { BusyGymPlan } from '@/lib/busyGym';
import { isHealthPreferenceText, saveCoachPreference } from '@/lib/coachPreferences';
import { recipeBySlug } from '@/lib/food';
import { movePlannedSession } from '@/lib/planner';
import { startRoutine } from '@/lib/routines';
import { addRecipeToShoppingList } from '@/lib/shoppingList';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

export const COACH_FEATURE = 'coach' as const;
export const COACH_REOPEN_MS = 6 * 60 * 60 * 1000;
export const COACH_HISTORY_LIMIT = 12;
export const COACH_UI = aiConfig.ui_copy;
export const COACH_CHIPS = aiConfig.chips;

export const COACH_CONTEXT_TYPES = [
  'exercise',
  'machine',
  'session_today',
  'routine',
  'recipe',
  'article',
  'none',
] as const;
export type CoachContextType = (typeof COACH_CONTEXT_TYPES)[number];

export type CoachContext = {
  type: CoachContextType;
  id: string;
  label: string;
};

export type CoachLink = { type: string; id: string };

export type CoachCard = {
  id: string;
  type: string;
  buttons?: string[];
  [key: string]: unknown;
};

export type CoachSafetyFlag =
  | 'none'
  | 'medical'
  | 'pregnancy'
  | 'body_or_diet'
  | 'off_topic'
  | 'emergency'
  | 'wellbeing';

export type CoachMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  safety_flag: CoachSafetyFlag | null;
  links: CoachLink[];
  cards: CoachCard[];
  retrieved_ids: CoachLink[];
  feedback: 'up' | 'down' | null;
  created_at: string;
};

export type CoachThread = {
  id: string;
  title: string;
  context_type: CoachContextType | null;
  context_id: string | null;
  last_message_at: string | null;
};

export type SessionTodayExercise = {
  exercise_id: string;
  name: string;
  role: string;
  equipment: string;
  pattern: string;
  sets: number;
  remaining_sets: number;
  rep_min: number;
  rep_max: number;
};

const PENDING_PLAN = 'coach_pending_plan';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function contextChipLabel(context: CoachContext | null): string | null {
  if (!context || context.type === 'none' || !context.label) return null;
  return COACH_UI.context_chip.replace('{label}', context.label);
}

export function titleFromFirstMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 40) || 'New chat';
}

export function shouldReopenLatest(lastMessageAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastMessageAt) return false;
  const stamp = Date.parse(lastMessageAt);
  return Number.isFinite(stamp) && now - stamp < COACH_REOPEN_MS;
}

export function chipsForContext(type: CoachContextType): string[] {
  if (type === 'exercise') return COACH_CHIPS.exercise;
  if (type === 'machine') return COACH_CHIPS.machine;
  if (type === 'session_today') return COACH_CHIPS.session_today;
  if (type === 'routine') return COACH_CHIPS.routine;
  if (type === 'recipe') return COACH_CHIPS.recipe;
  return COACH_CHIPS.new_chat;
}

export function parseCoachContextType(value: unknown): CoachContextType {
  const raw = text(value);
  return (COACH_CONTEXT_TYPES as readonly string[]).includes(raw) ? (raw as CoachContextType) : 'none';
}

export function openCoach(params?: {
  context?: Partial<CoachContext>;
  question?: string;
  conversationId?: string;
  newChat?: boolean;
  entry?: string;
  sessionToday?: SessionTodayExercise[];
}): void {
  const contextType = parseCoachContextType(params?.context?.type);
  const contextual = contextType !== 'none';
  track('ai_chat_started', { source: params?.entry ?? (contextual ? 'contextual' : 'header') });
  router.push({
    pathname: '/coach',
    params: {
      type: contextual ? contextType : 'none',
      id: params?.context?.id ?? '',
      label: params?.context?.label ?? '',
      question: params?.question ?? '',
      conversation: params?.conversationId ?? '',
      newChat: params?.newChat === false && !contextual ? '0' : '1',
      session: params?.sessionToday ? JSON.stringify(params.sessionToday) : '',
    },
  } as Href);
}

export async function openCoachFromHeader(): Promise<void> {
  const latest = await loadLatestCoachThread();
  if (latest && shouldReopenLatest(latest.last_message_at)) {
    openCoach({ conversationId: latest.id, newChat: false, entry: 'header' });
    return;
  }
  openCoach({ newChat: true, entry: 'header' });
}

export function openCoachLink(link: CoachLink): void {
  if (link.type === 'exercise') {
    router.push({ pathname: '/exercise/[id]', params: { id: link.id } } as Href);
    return;
  }
  if (link.type === 'machine') {
    router.push({ pathname: '/machines/[id]', params: { id: link.id } } as Href);
    return;
  }
  if (link.type === 'article') {
    router.push({ pathname: '/learn/[id]', params: { id: link.id } } as Href);
    return;
  }
  if (link.type === 'routine') {
    router.push({ pathname: '/routines/[id]', params: { id: link.id } } as Href);
    return;
  }
  if (link.type === 'recipe') {
    router.push({ pathname: '/food/recipe/[slug]', params: { slug: link.id } } as Href);
    return;
  }
  if (link.type === 'stretch') {
    if (!isFeatureEnabled('stretches')) {
      router.push('/(tabs)' as Href);
      return;
    }
    router.push({ pathname: '/stretches/[id]', params: { id: link.id } } as Href);
  }
}

function isMissingCoachTables(error: { message?: string; code?: string } | null | undefined): boolean {
  return /ai_conversations|ai_messages|schema cache/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

export async function loadLatestCoachThread(): Promise<CoachThread | null> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, title, context_type, context_id, last_message_at, updated_at')
    .gte('created_at', cutoff.toISOString())
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingCoachTables(error)) return null;
    throw error;
  }
  return data ? toThread(data) : null;
}

export async function loadCoachThreads(): Promise<CoachThread[]> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, title, context_type, context_id, last_message_at')
    .gte('created_at', cutoff.toISOString())
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) {
    if (isMissingCoachTables(error)) return [];
    throw error;
  }
  return (data ?? []).map(toThread);
}

function toThread(raw: unknown): CoachThread {
  const row = asRecord(raw);
  return {
    id: text(row.id),
    title: text(row.title) || 'Chat',
    context_type: parseCoachContextType(row.context_type) === 'none' ? null : parseCoachContextType(row.context_type),
    context_id: text(row.context_id) || null,
    last_message_at: text(row.last_message_at) || text(row.updated_at) || null,
  };
}

export async function loadCoachMessages(conversationId: string): Promise<CoachMessage[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('id, role, content, safety_flag, links, cards, retrieved_ids, feedback, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) {
    if (isMissingCoachTables(error)) return [];
    throw error;
  }
  return (data ?? []).map(toMessage).filter((item): item is CoachMessage => item !== null);
}

function toMessage(raw: unknown): CoachMessage | null {
  const row = asRecord(raw);
  const role = text(row.role);
  const content = text(row.content);
  if ((role !== 'user' && role !== 'assistant') || !content) return null;
  const flag = text(row.safety_flag);
  const feedback = text(row.feedback);
  return {
    id: text(row.id) || `local-${Date.now()}`,
    role,
    content,
    safety_flag:
      flag === 'medical' ||
      flag === 'pregnancy' ||
      flag === 'body_or_diet' ||
      flag === 'off_topic' ||
      flag === 'emergency' ||
      flag === 'wellbeing'
        ? flag
        : null,
    links: Array.isArray(row.links) ? (row.links as CoachLink[]) : [],
    cards: Array.isArray(row.cards) ? (row.cards as CoachCard[]) : [],
    retrieved_ids: Array.isArray(row.retrieved_ids) ? (row.retrieved_ids as CoachLink[]) : [],
    feedback: feedback === 'up' || feedback === 'down' ? feedback : null,
    created_at: text(row.created_at) || new Date().toISOString(),
  };
}

export async function saveCoachFeedback(messageId: string, feedback: 'up' | 'down'): Promise<void> {
  const { error } = await supabase.from('ai_messages').update({ feedback }).eq('id', messageId);
  if (error && !isMissingCoachTables(error)) throw error;
}

export async function deleteCoachThread(id: string): Promise<void> {
  const { error } = await supabase.from('ai_conversations').delete().eq('id', id);
  if (error && !isMissingCoachTables(error)) throw error;
}

export async function deleteAllCoachChats(): Promise<void> {
  const { error } = await supabase.from('ai_conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error && !isMissingCoachTables(error)) throw error;
}

export async function stashCoachPlan(sessionId: string, plan: BusyGymPlan): Promise<void> {
  await AsyncStorage.setItem(PENDING_PLAN, JSON.stringify({ sessionId, plan }));
}

export async function takeCoachPlan(sessionId: string): Promise<BusyGymPlan | null> {
  const raw = await AsyncStorage.getItem(PENDING_PLAN);
  if (!raw) return null;
  try {
    const parsed = asRecord(JSON.parse(raw));
    if (text(parsed.sessionId) !== sessionId) return null;
    await AsyncStorage.removeItem(PENDING_PLAN);
    return parsed.plan as BusyGymPlan;
  } catch {
    return null;
  }
}

function nextMondayIso(): string {
  const now = new Date();
  const day = now.getDay();
  const add = day === 1 ? 7 : (8 - day) % 7 || 7;
  const date = new Date(now);
  date.setDate(now.getDate() + add);
  return date.toISOString().slice(0, 10);
}

export async function applyCoachCard(
  card: CoachCard,
  button: string,
  sessionId?: string
): Promise<string> {
  track('ai_card_used', { type: card.type });
  if (card.type === 'session_change' && button === 'Use this') {
    const after = Array.isArray(card.after) ? card.after : [];
    const plan: BusyGymPlan = {
      exercises: after.map((item, index) => {
        const row = asRecord(item);
        return {
          exercise_id: text(row.exercise_id),
          replaces: text(row.replaces) || text(row.exercise_id),
          sets: Number(row.sets) || 2,
          rep_min: Number(row.rep_min) || 8,
          rep_max: Number(row.rep_max) || 12,
          order: Number(row.order) || index + 1,
        };
      }),
      summary: text(card.summary),
      fallback: false,
      lighter: card.lighter === true || text(card.energy) === 'low',
    };
    if (!sessionId) return COACH_UI.card_needs_session;
    await stashCoachPlan(sessionId, plan);
    return plan.lighter ? COACH_UI.card_applied_lighter : COACH_UI.card_applied_look;
  }
  if (card.type === 'session' && button === 'Start') {
    await startBuiltStrengthSession({
      name: text(card.name) || 'Coach session',
      why: '',
      estimated_minutes: Number(card.estimated_minutes) || 30,
      blocks: Array.isArray(card.blocks) ? (card.blocks as BuiltSession['blocks']) : [],
      fallback: false,
    });
    return COACH_UI.card_applied;
  }
  if (card.type === 'routine_options') {
    const options = Array.isArray(card.options) ? card.options : [];
    const first = asRecord(options[0]);
    const slug = text(first.slug);
    if (!slug) return COACH_UI.error;
    if (button === 'Preview') {
      router.push({ pathname: '/routines/[id]', params: { id: slug } } as Href);
      return '';
    }
    if (button === 'Start on Monday') {
      await startRoutine(slug, { startDate: nextMondayIso() });
      return COACH_UI.card_applied;
    }
  }
  if (card.type === 'confirm' && (card.planned_session_id || card.to_date) && button === 'Confirm') {
    await movePlannedSession(text(card.planned_session_id), text(card.to_date));
    const day = text(card.to_date);
    return COACH_UI.card_moved.replace('{day}', day);
  }
  if (card.type === 'confirm' && (card.kind === 'avoid_exercise' || card.kind === 'no_equipment_at_my_gym') && button === 'Save') {
    if (isHealthPreferenceText(JSON.stringify(card))) {
      throw new Error('Do not save a preference for a health or medical reason.');
    }
    await saveCoachPreference({
      kind: card.kind,
      exercise_id: text(card.exercise_id) || null,
      equipment: text(card.equipment) || null,
      reason: (text(card.reason) as 'dislike' | 'not_available' | 'other') || 'dislike',
    });
    return COACH_UI.card_saved;
  }
  if (card.type === 'recipes') {
    const recipes = Array.isArray(card.recipes) ? card.recipes : [];
    const first = asRecord(recipes[0]);
    const slug = text(first.slug);
    if (button === 'Open' && slug) {
      router.push({ pathname: '/food/recipe/[slug]', params: { slug } } as Href);
      return '';
    }
    if (button === 'Add missing to shopping list' && slug) {
      const recipe = recipeBySlug(slug);
      if (recipe) await addRecipeToShoppingList(recipe, recipe.servings);
      return COACH_UI.card_applied;
    }
  }
  return '';
}
