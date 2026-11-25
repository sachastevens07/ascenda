import { isFeatureEnabled } from '@/config/features';
import { track, trackAi } from '@/lib/analytics';
import {
  COACH_FEATURE,
  COACH_HISTORY_LIMIT,
  type CoachCard,
  type CoachContext,
  type CoachLink,
  type CoachMessage,
  type CoachSafetyFlag,
  type SessionTodayExercise,
} from '@/lib/coach';
import { aiLimitBypassPayload } from '@/lib/devFlags';
import { getQuizAnswers, type Profile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

export type CoachOutcome =
  | {
      kind: 'ok';
      reply: string;
      links: CoachLink[];
      cards: CoachCard[];
      safety_flag: CoachSafetyFlag;
      fallback: boolean;
      conversationId: string | null;
      messageId: string | null;
    }
  | { kind: 'limit' }
  | { kind: 'error' };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asFlag(value: unknown): CoachSafetyFlag {
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

/**
 * What she already told Evoluma, so Coach never asks again (AI rules: no name, email,
 * bodyweight, statement answers or health data such as life_stage).
 */
export function coachHerTraining(
  profile: Profile | null,
  activeRoutine: { id: string; name: string; week: number; length_weeks: number } | null
): Record<string, unknown> {
  const answers = getQuizAnswers(profile);
  return {
    plan_answers: answers
      ? {
          goals: answers.main_goals,
          days_per_week: answers.days_per_week,
          experience: answers.experience,
          gym_experience: answers.gym_experience,
          session_minutes: answers.session_minutes,
          equipment: answers.equipment,
          gym_comfort: answers.confidence,
          focus_areas: answers.focus_areas,
          cardio_preference: profile?.cardio_preference ?? null,
        }
      : null,
    active_routine: activeRoutine,
  };
}

export async function requestCoachAnswer(input: {
  message: string;
  context: CoachContext;
  conversationId: string | null;
  newChat: boolean;
  history: { role: 'user' | 'assistant'; content: string }[];
  sessionToday?: SessionTodayExercise[];
  herTraining?: Record<string, unknown>;
}): Promise<CoachOutcome> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const { data, error, response } = await supabase.functions.invoke('coach', {
    body: {
      // Never include life_stage or period dates. Special-category health data stays on-device/DB only.
      message: input.message,
      context: input.context,
      conversation_id: input.conversationId,
      new_chat: input.newChat,
      history: input.history.slice(-COACH_HISTORY_LIMIT),
      session_today: input.sessionToday ?? [],
      her_training: input.herTraining ?? {},
      stretches_enabled: isFeatureEnabled('stretches'),
      ...aiLimitBypassPayload(),
    },
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (__DEV__) {
    console.log('coach', {
      status: response?.status ?? null,
      error: error?.message ?? null,
      ok: asRecord(data).ok ?? null,
      reason: asRecord(data).reason ?? null,
    });
  }
  const payload = asRecord(data);
  const reason = text(payload.reason);
  if (response?.status === 429 || reason === 'limit' || error?.message?.includes('429')) {
    trackAi('ai_limit_reached', COACH_FEATURE);
    return { kind: 'limit' };
  }
  if (error || payload.ok !== true) {
    trackAi('ai_fallback_used', COACH_FEATURE);
    return { kind: 'error' };
  }
  trackAi('ai_feature_used', COACH_FEATURE);
  if (payload.fallback === true) trackAi('ai_fallback_used', COACH_FEATURE);
  const cards = Array.isArray(payload.cards) ? (payload.cards as CoachCard[]) : [];
  for (const card of cards) {
    if (card.type) track('ai_tool_called', { type: String(card.type).slice(0, 40) });
  }
  return {
    kind: 'ok',
    reply: text(payload.reply),
    links: Array.isArray(payload.links) ? (payload.links as CoachLink[]) : [],
    cards,
    safety_flag: asFlag(payload.safety_flag),
    fallback: payload.fallback === true,
    conversationId: text(payload.conversation_id) || input.conversationId,
    messageId: text(payload.message_id) || null,
  };
}

export function historyFromMessages(messages: CoachMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  return messages.slice(-COACH_HISTORY_LIMIT).map((item) => ({
    role: item.role,
    content: item.content.slice(0, 900),
  }));
}
