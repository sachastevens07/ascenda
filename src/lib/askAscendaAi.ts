import { trackAi } from '@/lib/analytics';
import {
  ASK_FEATURE,
  ASK_HISTORY_LIMIT,
  fallbackAskAnswer,
  parseAskAnswer,
  stripNeverSend,
  type AskAnswer,
  type AskContext,
  type AskHistoryTurn,
} from '@/lib/askAscenda';
import { aiLimitBypassPayload } from '@/lib/devFlags';
import { supabase } from '@/lib/supabase';

export type AskOutcome =
  | { kind: 'ok'; answer: AskAnswer; conversationId: string | null; messageId: string | null }
  | { kind: 'limit' }
  | { kind: 'error' };

type FunctionOk = {
  ok: true;
  reply?: unknown;
  links?: unknown;
  action?: unknown;
  safety_flag?: unknown;
  fallback?: boolean;
  conversation_id?: unknown;
  message_id?: unknown;
};

type FunctionFail = {
  ok?: false;
  reason?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function readFailBody(data: unknown, response: Response | undefined): Promise<FunctionFail | null> {
  if (data && typeof data === 'object' && 'reason' in data) {
    return data as FunctionFail;
  }
  if (!response) return null;
  try {
    const parsed: unknown = await response.clone().json();
    if (parsed && typeof parsed === 'object' && 'reason' in parsed) {
      return parsed as FunctionFail;
    }
  } catch {
    /* Gateway errors are not JSON. */
  }
  return null;
}

export async function requestAskAnswer(input: {
  context: AskContext;
  history: AskHistoryTurn[];
  conversationId: string | null;
}): Promise<AskOutcome> {
  const local = fallbackAskAnswer(input.context);
  const body = stripNeverSend({
    question: input.context.question,
    screen: input.context.screen,
    screen_id: input.context.screen_id,
    routine: input.context.routine,
    planned_sessions: input.context.planned_sessions,
    last_sessions: input.context.last_sessions,
    exercise_guides: input.context.exercise_guides,
    machine_guides: input.context.machine_guides,
    learn_summaries: input.context.learn_summaries,
    app_help: input.context.app_help,
    history: input.history.slice(-ASK_HISTORY_LIMIT),
    conversation_id: input.conversationId,
    ...aiLimitBypassPayload(),
  });

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { data, error, response } = await supabase.functions.invoke('ask-ascenda', {
      body,
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    const failBody = await readFailBody(data, response);
    if (__DEV__) {
      console.log('ask-ascenda', {
        status: response?.status ?? null,
        error: error?.message ?? null,
        ok: failBody?.ok ?? (data as FunctionOk | null)?.ok ?? null,
        reason: failBody?.reason ?? null,
      });
    }
    if (error) {
      const status = response?.status;
      const reason = failBody?.reason;
      if (status === 429 || reason === 'limit') {
        trackAi('ai_limit_reached', ASK_FEATURE);
        return { kind: 'limit' };
      }
      trackAi('ai_fallback_used', ASK_FEATURE);
      return { kind: 'ok', answer: local, conversationId: input.conversationId, messageId: null };
    }
    const payload = (data ?? {}) as FunctionOk | FunctionFail;
    if (payload.ok === true) {
      const parsed = parseAskAnswer(payload, input.context, payload.fallback === true);
      const answer = parsed ?? local;
      trackAi('ai_feature_used', ASK_FEATURE);
      if (answer.fallback) trackAi('ai_fallback_used', ASK_FEATURE);
      return {
        kind: 'ok',
        answer,
        conversationId: text(asRecord(payload).conversation_id) || input.conversationId,
        messageId: text(asRecord(payload).message_id) || null,
      };
    }
    if (payload.reason === 'limit') {
      trackAi('ai_limit_reached', ASK_FEATURE);
      return { kind: 'limit' };
    }
    trackAi('ai_fallback_used', ASK_FEATURE);
    return { kind: 'ok', answer: local, conversationId: input.conversationId, messageId: null };
  } catch {
    trackAi('ai_fallback_used', ASK_FEATURE);
    return { kind: 'ok', answer: local, conversationId: input.conversationId, messageId: null };
  }
}
