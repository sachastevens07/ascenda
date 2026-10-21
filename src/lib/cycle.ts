import type { Equipment } from '@/lib/exercises';
import { usesWeight } from '@/lib/programmes';
import { supabase } from '@/lib/supabase';

// Allowed values. Keep this list in step with supabase/cycle.sql.
export const CYCLE_PHASES = ['period', 'after_period', 'mid_cycle', 'before_period', 'not_sure'] as const;
export type CyclePhase = (typeof CYCLE_PHASES)[number];

export const CYCLE_PHASE_LABELS: Record<CyclePhase, string> = {
  period: 'Period',
  after_period: 'After my period',
  mid_cycle: 'Mid-cycle',
  before_period: 'Before my period',
  not_sure: 'Not sure',
};

/** Supabase returns at most 1000 rows per request. */
const PAGE_SIZE = 1000;

/** Longer sessions were probably left open by mistake, so they're left out of the average length. */
const MAX_SESSION_MINUTES = 4 * 60;

/** Only read while cycle notes are on, so nothing else depends on the column. */
export async function fetchSessionCyclePhase(sessionId: string): Promise<CyclePhase | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('cycle_phase')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return (data?.cycle_phase as CyclePhase | null) ?? null;
}

export async function saveSessionCyclePhase(sessionId: string, phase: CyclePhase | null): Promise<void> {
  const { error } = await supabase.from('sessions').update({ cycle_phase: phase }).eq('id', sessionId);
  if (error) throw error;
}

/** Removes the cycle phase from every one of her sessions. Her workouts are kept. */
export async function deleteAllCycleNotes(): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ cycle_phase: null })
    .not('cycle_phase', 'is', null);
  if (error) throw error;
}

export type PhasePattern = {
  phase: CyclePhase;
  sessionCount: number;
  averageSets: number;
  /** Null if every session in this phase was too long to count. */
  averageMinutes: number | null;
  /** Total kg × reps per session, over sessions with weighted sets; null if there were none. */
  averageVolumeKg: number | null;
};

type TaggedSession = { id: string; cycle_phase: CyclePhase; started_at: string; completed_at: string };

type TaggedSet = {
  session_id: string;
  weight_kg: number | string | null;
  reps: number | null;
  exercise: { equipment: Equipment; weight_increase_kg: number | string | null };
};

async function fetchTaggedSessions(): Promise<TaggedSession[]> {
  const sessions: TaggedSession[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, cycle_phase, started_at, completed_at')
      .not('cycle_phase', 'is', null)
      .not('completed_at', 'is', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    sessions.push(...((data ?? []) as TaggedSession[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return sessions;
}

async function fetchTaggedSets(): Promise<TaggedSet[]> {
  const sets: TaggedSet[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('sets')
      .select(
        'id, session_id, weight_kg, reps, exercise:exercises(equipment, weight_increase_kg), session:sessions!inner(cycle_phase, completed_at)'
      )
      .eq('completed', true)
      .not('session.cycle_phase', 'is', null)
      .not('session.completed_at', 'is', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    sets.push(...((data ?? []) as unknown as TaggedSet[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return sets;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Facts about her finished, tagged sessions, one entry per phase she has used, in phase order. */
export async function fetchCyclePatterns(): Promise<PhasePattern[]> {
  const [sessions, sets] = await Promise.all([fetchTaggedSessions(), fetchTaggedSets()]);

  const setCounts = new Map<string, number>();
  const volumes = new Map<string, number>();
  for (const set of sets) {
    const reps = set.reps ?? 0;
    if (reps < 1) continue;
    setCounts.set(set.session_id, (setCounts.get(set.session_id) ?? 0) + 1);
    // Assisted machines record help, not load, so they don't count towards kg lifted.
    const assisted = Number(set.exercise.weight_increase_kg ?? 0) < 0;
    if (set.weight_kg !== null && usesWeight(set.exercise.equipment) && !assisted) {
      volumes.set(set.session_id, (volumes.get(set.session_id) ?? 0) + Number(set.weight_kg) * reps);
    }
  }

  return CYCLE_PHASES.flatMap((phase): PhasePattern[] => {
    const inPhase = sessions.filter((session) => session.cycle_phase === phase);
    if (inPhase.length === 0) return [];
    const minutes = inPhase
      .map((session) => (Date.parse(session.completed_at) - Date.parse(session.started_at)) / 60_000)
      .filter((value) => value > 0 && value <= MAX_SESSION_MINUTES);
    const sessionVolumes = inPhase.flatMap((session) => {
      const volume = volumes.get(session.id) ?? 0;
      return volume > 0 ? [volume] : [];
    });
    return [
      {
        phase,
        sessionCount: inPhase.length,
        averageSets: average(inPhase.map((session) => setCounts.get(session.id) ?? 0)) ?? 0,
        averageMinutes: average(minutes),
        averageVolumeKg: average(sessionVolumes),
      },
    ];
  });
}
