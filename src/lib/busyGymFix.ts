import { trackAi } from '@/lib/analytics';
import {
  buildBusyGymAlternatives,
  fallbackBusyGymPlan,
  toBusyGymRemaining,
  type BusyGymEnergy,
  type BusyGymMinutes,
  type BusyGymPlan,
} from '@/lib/busyGym';
import { aiLimitBypassPayload } from '@/lib/devFlags';
import { preferredSwapIds, resolveExerciseSlug } from '@/lib/contentGuides';
import type { Equipment } from '@/lib/exercises';
import {
  SLOT_EXERCISE_COLUMNS,
  toSlotExercise,
  type ProgrammeDay,
  type SlotExercise,
} from '@/lib/programmes';
import { supabase } from '@/lib/supabase';
import type { SetEntry } from '@/lib/workoutLog';

export const BUSY_GYM_FEATURE = 'busy_gym' as const;

export type BusyGymOutcome =
  | { kind: 'ok'; plan: BusyGymPlan; byId: Map<string, SlotExercise> }
  | { kind: 'limit' }
  | { kind: 'error' };

type FunctionOk = {
  ok: true;
  exercises?: unknown;
  summary?: unknown;
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

function int(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
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

function parsePlan(raw: unknown, fallback: boolean): BusyGymPlan | null {
  const body = asRecord(raw);
  if (!Array.isArray(body.exercises) && body.ok !== true) return null;
  const source = Array.isArray(body.exercises) ? body.exercises : [];
  const exercises = source
    .map((item, index) => {
      const row = asRecord(item);
      const exerciseId = text(row.exercise_id);
      const replaces = text(row.replaces) || exerciseId;
      if (!exerciseId || !replaces) return null;
      return {
        exercise_id: exerciseId,
        replaces,
        sets: Math.max(1, int(row.sets, 1)),
        rep_min: Math.max(1, int(row.rep_min, 8)),
        rep_max: Math.max(1, int(row.rep_max, 12)),
        order: Math.max(1, int(row.order, index + 1)),
      };
    })
    .filter((row): row is BusyGymPlan['exercises'][number] => row !== null);
  return {
    exercises,
    summary: text(body.summary) || 'Here is a shorter session that keeps today\'s main work.',
    fallback,
  };
}

export async function fetchBusyGymSlots(ids: string[]): Promise<Map<string, SlotExercise>> {
  const unique = [...new Set(ids.map((id) => resolveExerciseSlug(id)).filter(Boolean))];
  const map = new Map<string, SlotExercise>();
  if (unique.length === 0) return map;
  const { data, error } = await supabase.from('exercises').select(SLOT_EXERCISE_COLUMNS).in('id', unique);
  if (error || !data) return map;
  for (const row of data) {
    const slot = toSlotExercise(row as SlotExercise);
    map.set(slot.id, slot);
  }
  return map;
}

export async function requestBusyGymFix(input: {
  day: ProgrammeDay;
  entries: Record<string, SetEntry>;
  unavailable: Equipment[];
  minutesLeft: BusyGymMinutes;
  energy: BusyGymEnergy;
}): Promise<BusyGymOutcome> {
  const remaining = toBusyGymRemaining(input.day, input.entries);
  if (remaining.length === 0) return { kind: 'error' };
  const swapIds = remaining.flatMap((item) => preferredSwapIds(item.exercise_id));
  const byId = await fetchBusyGymSlots([...remaining.map((item) => item.exercise_id), ...swapIds]);
  for (const item of input.day.exercises) {
    if (!byId.has(item.exercise.id)) byId.set(item.exercise.id, item.exercise);
  }
  const alternatives = buildBusyGymAlternatives(remaining, input.unavailable, byId);
  const localPlan = fallbackBusyGymPlan(
    remaining,
    alternatives,
    input.unavailable,
    input.minutesLeft,
    input.energy
  );

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { data, error, response } = await supabase.functions.invoke('busy-gym-fix', {
      body: {
        remaining_exercises: remaining,
        unavailable_equipment: input.unavailable,
        minutes_left: input.minutesLeft,
        energy: input.energy,
        eligible_alternatives: alternatives,
        ...aiLimitBypassPayload(),
      },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    const failBody = await readFailBody(data, response);
    if (__DEV__) {
      console.log('busy-gym-fix', {
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
        trackAi('ai_limit_reached', BUSY_GYM_FEATURE);
        return { kind: 'limit' };
      }
      trackAi('ai_fallback_used', BUSY_GYM_FEATURE);
      return { kind: 'ok', plan: localPlan, byId };
    }
    const payload = (data ?? {}) as FunctionOk | FunctionFail;
    if (payload.ok === true) {
      const plan = parsePlan(payload, payload.fallback === true) ?? localPlan;
      trackAi('ai_feature_used', BUSY_GYM_FEATURE);
      if (plan.fallback) trackAi('ai_fallback_used', BUSY_GYM_FEATURE);
      return { kind: 'ok', plan, byId };
    }
    if (payload.reason === 'limit') {
      trackAi('ai_limit_reached', BUSY_GYM_FEATURE);
      return { kind: 'limit' };
    }
    trackAi('ai_fallback_used', BUSY_GYM_FEATURE);
    return { kind: 'ok', plan: localPlan, byId };
  } catch {
    trackAi('ai_fallback_used', BUSY_GYM_FEATURE);
    return { kind: 'ok', plan: localPlan, byId };
  }
}
