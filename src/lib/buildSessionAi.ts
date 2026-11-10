import { trackAi } from '@/lib/analytics';
import {
  BUILD_SESSION_FEATURE,
  BUILD_SESSION_TIMING,
  cardioCatalog,
  cooldownTemplates,
  eligibleExercisesFor,
  fallbackBuiltSession,
  isBarbellExercise,
  parseBuiltSession,
  patternsForExerciseIds,
  singleSessionsPayload,
  stretchCatalog,
  validateBuiltSession,
  warmupTemplates,
  type BuildSessionEnergy,
  type BuildSessionFocus,
  type BuildSessionKit,
  type BuildSessionLevel,
  type BuildSessionMinutes,
  type BuildSessionRequest,
  type BuiltSession,
} from '@/lib/buildSession';
import { resolveExerciseSlug } from '@/lib/contentGuides';
import { aiLimitBypassPayload } from '@/lib/devFlags';
import { supabase } from '@/lib/supabase';

export type BuildSessionOutcome =
  | { kind: 'ok'; plan: BuiltSession }
  | { kind: 'limit' }
  | { kind: 'error' };

type FunctionOk = {
  ok: true;
  name?: unknown;
  why?: unknown;
  estimated_minutes?: unknown;
  blocks?: unknown;
  fallback?: boolean;
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

export async function fetchBuildSessionContext(): Promise<{
  loggedBarbellIds: string[];
  recentPatterns: string[];
}> {
  const loggedBarbellIds: string[] = [];
  const recentPatterns: string[] = [];
  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 2);
    const since = cutoff.toISOString().slice(0, 10);
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, date')
      .not('completed_at', 'is', null)
      .gte('date', since)
      .order('date', { ascending: false })
      .limit(8);
    const ids = (sessions ?? []).map((row) => text(asRecord(row).id)).filter(Boolean);
    if (ids.length === 0) return { loggedBarbellIds, recentPatterns };
    const { data: sets } = await supabase
      .from('sets')
      .select('exercise_id, exercise:exercises(equipment, id)')
      .in('session_id', ids)
      .eq('completed', true)
      .gt('set_number', 0);
    for (const row of sets ?? []) {
      const item = asRecord(row);
      const exerciseId = resolveExerciseSlug(text(item.exercise_id));
      const nested = asRecord(item.exercise);
      const equipment = text(nested.equipment);
      if ((equipment === 'barbell' || isBarbellExercise(exerciseId)) && exerciseId) {
        loggedBarbellIds.push(exerciseId);
      }
    }
    const { data: named } = await supabase
      .from('sets')
      .select('exercise_id')
      .in('session_id', ids)
      .eq('completed', true)
      .gt('set_number', 0)
      .limit(80);
    const slugs = [...new Set((named ?? []).map((row) => resolveExerciseSlug(text(asRecord(row).exercise_id))))];
    recentPatterns.push(...patternsForExerciseIds(slugs));
  } catch {
    /* Recent history is optional. */
  }
  return {
    loggedBarbellIds: [...new Set(loggedBarbellIds)],
    recentPatterns: [...new Set(recentPatterns)].slice(0, 24),
  };
}

export async function requestBuiltSession(input: {
  minutes: BuildSessionMinutes;
  focus: BuildSessionFocus;
  kit: BuildSessionKit;
  energy: BuildSessionEnergy;
  level: BuildSessionLevel;
}): Promise<BuildSessionOutcome> {
  const extra = await fetchBuildSessionContext();
  const request: BuildSessionRequest = {
    minutes: input.minutes,
    focus: input.focus,
    kit: input.kit,
    energy: input.energy,
    level: input.level,
    recent_patterns: extra.recentPatterns,
    logged_barbell_ids: extra.loggedBarbellIds,
  };
  const eligible = eligibleExercisesFor({
    focus: request.focus,
    kit: request.kit,
    level: request.level,
    loggedBarbellIds: request.logged_barbell_ids,
  });
  const local = fallbackBuiltSession(request);

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { data, error, response } = await supabase.functions.invoke('build-session', {
      body: {
        minutes: request.minutes,
        focus: request.focus,
        equipment: request.kit,
        energy: request.energy,
        level: request.level,
        recent_training: { patterns: request.recent_patterns },
        logged_barbell_ids: request.logged_barbell_ids,
        eligible_exercises: eligible,
        warmup_templates: warmupTemplates(),
        cooldown_templates: cooldownTemplates(),
        cardio_sessions: cardioCatalog(),
        stretch_routines: stretchCatalog(),
        single_sessions: singleSessionsPayload(),
        timing: BUILD_SESSION_TIMING,
        ...aiLimitBypassPayload(),
      },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    const failBody = await readFailBody(data, response);
    if (__DEV__) {
      console.log('build-session', {
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
        trackAi('ai_limit_reached', BUILD_SESSION_FEATURE);
        return { kind: 'limit' };
      }
      trackAi('ai_fallback_used', BUILD_SESSION_FEATURE);
      return { kind: 'ok', plan: local };
    }
    const payload = (data ?? {}) as FunctionOk | FunctionFail;
    if (payload.ok === true) {
      const parsed = parseBuiltSession(payload, payload.fallback === true);
      const valid = parsed ? validateBuiltSession(parsed, request, eligible) : null;
      const plan = valid ?? (parsed?.fallback ? parsed : null) ?? local;
      trackAi('ai_feature_used', BUILD_SESSION_FEATURE);
      if (plan.fallback) trackAi('ai_fallback_used', BUILD_SESSION_FEATURE);
      return { kind: 'ok', plan: { ...plan, fallback: plan.fallback || parsed?.fallback === true } };
    }
    if (payload.reason === 'limit') {
      trackAi('ai_limit_reached', BUILD_SESSION_FEATURE);
      return { kind: 'limit' };
    }
    trackAi('ai_fallback_used', BUILD_SESSION_FEATURE);
    return { kind: 'ok', plan: local };
  } catch {
    trackAi('ai_fallback_used', BUILD_SESSION_FEATURE);
    return { kind: 'ok', plan: local };
  }
}
