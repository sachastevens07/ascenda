import AsyncStorage from '@react-native-async-storage/async-storage';

import { customWorkoutToDay, fetchCustomWorkout } from '@/lib/customWorkouts';
import type { EquipmentAccess } from '@/lib/profile';
import {
  fetchProgrammeDay,
  getWeightSuggestion,
  usesWeight,
  type ProgrammeDay,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';
import { estimateOneRepMax, type ExerciseBests } from '@/lib/progress';
import { fetchRoutineDay, routineDayToProgrammeDay } from '@/lib/routines';
import {
  fetchPreviousSets,
  fetchSession,
  fetchSessionSets,
  type LoggedSet,
  type Session,
} from '@/lib/sessions';
import { applySwaps, fetchSessionSwaps } from '@/lib/swaps';

export type SessionPlanSlot = {
  position: number;
  sets: number;
  rep_min: number;
  rep_max: number;
  rest_seconds: number;
  exercise: SlotExercise;
};

export const EASE_BACK_WEIGHT_SCALE = 0.9;

export type SessionEaseBack = {
  weightScale: number;
};

export type SessionPlan = {
  slots: SessionPlanSlot[];
  /** Welcome-back lighter session: fewer sets live on the slots; weights scale in the logger. */
  easeBack?: SessionEaseBack;
};

function sessionPlanKey(id: string): string {
  return `session-plan:${id}`;
}

export async function saveSessionPlan(sessionId: string, plan: SessionPlan): Promise<void> {
  await AsyncStorage.setItem(sessionPlanKey(sessionId), JSON.stringify(plan));
}

export async function loadSessionPlan(sessionId: string): Promise<SessionPlan | null> {
  const raw = await AsyncStorage.getItem(sessionPlanKey(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionPlan;
  } catch {
    return null;
  }
}

export async function clearSessionPlan(sessionId: string): Promise<void> {
  await AsyncStorage.removeItem(sessionPlanKey(sessionId));
}

export const FALLBACK_REST_SECONDS = 90;

export function sessionPlanFromDay(day: ProgrammeDay, easeBack?: SessionEaseBack): SessionPlan {
  return {
    slots: day.exercises.map((item) => ({
      position: item.position,
      sets: item.sets,
      rep_min: item.rep_min,
      rep_max: item.rep_max,
      rest_seconds: item.rest_seconds ?? FALLBACK_REST_SECONDS,
      exercise: item.exercise,
    })),
    easeBack,
  };
}

/** One fewer set per exercise (minimum 1) and a 10% lower suggested load. */
export function lightenSessionPlan(
  plan: SessionPlan,
  scale = EASE_BACK_WEIGHT_SCALE
): SessionPlan {
  return {
    ...plan,
    easeBack: { weightScale: scale },
    slots: plan.slots.map((slot) => ({
      ...slot,
      sets: Math.max(1, slot.sets - 1),
    })),
  };
}

export function scaleEaseWeight(kg: number, scale: number): number {
  return Math.max(0, Math.round(kg * scale * 2) / 2);
}

export function applySessionPlan(day: ProgrammeDay, plan: SessionPlan): ProgrammeDay {
  return {
    ...day,
    exercises: plan.slots.map((slot) => {
      const existing = day.exercises.find((item) => item.position === slot.position);
      const swapped = existing && existing.exercise.id !== slot.exercise.id;
      return {
        position: slot.position,
        sets: slot.sets,
        rep_min: slot.rep_min,
        rep_max: slot.rep_max,
        rest_seconds: slot.rest_seconds,
        exercise: slot.exercise,
        original: swapped ? existing.exercise : existing?.original,
        added: existing?.added,
      };
    }),
  };
}

/** What's in the boxes for one set. Kept as text so she can type freely. */
export type SetEntry = { weight: string; reps: string; completed: boolean };

/** The next set to do in a session. */
export type NextSet = {
  exerciseName: string;
  setNumber: number;
  /** Null for bodyweight and band, or if she hasn't entered one yet. */
  weightKg: number | null;
  reps: number | null;
};

export type RecordKind = 'heaviest' | 'one-rep-max' | 'volume';

export const RECORD_LABELS: Record<RecordKind, string> = {
  heaviest: 'Heaviest weight',
  'one-rep-max': 'Best estimated 1-rep max',
  volume: 'Most volume in one set (weight × reps)',
};

export const setKey = (exerciseId: string, setNumber: number) => `${exerciseId}:${setNumber}`;

export function setNumbers(item: ProgrammeExercise): number[] {
  return Array.from({ length: item.sets }, (_, index) => index + 1);
}

export function parseWeight(text: string): number | null {
  const value = Number.parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseReps(text: string): number | null {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatWeightInput(kg: number | null): string {
  return kg === null ? '' : String(Number(kg.toFixed(2)));
}

/**
 * Pre-fills each set: what's already logged this session, else the increased weight at the bottom
 * of the rep range if she earned one (Pro only), else last time, else the bottom of the rep range.
 */
export function buildEntries(
  day: ProgrammeDay,
  logged: LoggedSet[],
  previous: Record<string, LoggedSet[]>,
  withProgression: boolean,
  options?: { weightScale?: number }
): Record<string, SetEntry> {
  const entries: Record<string, SetEntry> = {};
  const weightScale = options?.weightScale;
  for (const item of day.exercises) {
    const exerciseId = item.exercise.id;
    const previousSets = previous[exerciseId] ?? [];
    const suggestion = getWeightSuggestion(item, previousSets);
    for (const setNumber of setNumbers(item)) {
      const saved = logged.find(
        (set) => set.exercise_id === exerciseId && set.set_number === setNumber
      );
      if (saved) {
        entries[setKey(exerciseId, setNumber)] = {
          weight: formatWeightInput(saved.weight_kg),
          reps: saved.reps === null ? '' : String(saved.reps),
          completed: saved.completed,
        };
        continue;
      }
      if (withProgression && !weightScale && suggestion.kind === 'increase') {
        entries[setKey(exerciseId, setNumber)] = {
          weight: formatWeightInput(suggestion.kg),
          reps: String(item.rep_min),
          completed: false,
        };
        continue;
      }
      const last =
        previousSets.find((set) => set.set_number === setNumber) ??
        previousSets[previousSets.length - 1];
      let weightKg = last?.weight_kg ?? null;
      if (weightKg !== null && weightScale) {
        weightKg = scaleEaseWeight(weightKg, weightScale);
      }
      entries[setKey(exerciseId, setNumber)] = {
        weight: usesWeight(item.exercise.equipment) ? formatWeightInput(weightKg) : '',
        reps: String(last?.reps ?? item.rep_min),
        completed: false,
      };
    }
  }
  return entries;
}

export type SessionLog = {
  session: Session;
  /** The programme day with this session's swaps applied. */
  day: ProgrammeDay;
  logged: LoggedSet[];
  previous: Record<string, LoggedSet[]>;
  easeBack: SessionEaseBack | null;
};

/** Everything needed to show a session in the logger. Null if the session or its day is gone. */
export async function loadSessionLog(
  id: string,
  equipment: EquipmentAccess
): Promise<SessionLog | null> {
  const session = await fetchSession(id);
  if (!session || session.source === 'stretch') return null;
  const swaps = await fetchSessionSwaps(session);
  let planned: ProgrammeDay | null = null;
  if (session.custom_workout_id) {
    const workout = await fetchCustomWorkout(session.custom_workout_id);
    planned = workout ? customWorkoutToDay(workout) : null;
  } else if (session.routine_day_id) {
    const routineDay = await fetchRoutineDay(session.routine_day_id);
    planned = routineDay ? routineDayToProgrammeDay(routineDay) : null;
  } else if (session.programme_day_id) {
    planned = await fetchProgrammeDay(session.programme_day_id, equipment);
  }
  if (!planned) return null;
  const plan = await loadSessionPlan(session.id);
  const swapped = applySwaps(planned, swaps);
  const day = plan && plan.slots.length > 0 ? applySessionPlan(swapped, plan) : swapped;
  const exerciseIds = day.exercises.map((item) => item.exercise.id);
  const [logged, previous] = await Promise.all([
    fetchSessionSets(id),
    fetchPreviousSets(exerciseIds, id),
  ]);
  return { session, day, logged, previous, easeBack: plan?.easeBack ?? null };
}

/** The first set not yet ticked, in programme order. Null when every set is done. */
export function getNextSet(day: ProgrammeDay, entries: Record<string, SetEntry>): NextSet | null {
  for (const item of day.exercises) {
    for (const setNumber of setNumbers(item)) {
      const entry = entries[setKey(item.exercise.id, setNumber)];
      if (!entry || entry.completed) continue;
      return {
        exerciseName: item.exercise.name,
        setNumber,
        weightKg: usesWeight(item.exercise.equipment) ? parseWeight(entry.weight) : null,
        reps: parseReps(entry.reps),
      };
    }
  }
  return null;
}

/**
 * Personal bests set by ticked sets in this session, by set key. A set counts if it beats her
 * history and every earlier set of that exercise today. Exercises with no history (first time)
 * and assisted machines never get one.
 */
export function getSetRecords(
  day: ProgrammeDay,
  entries: Record<string, SetEntry>,
  bests: Record<string, ExerciseBests>
): Record<string, RecordKind[]> {
  const records: Record<string, RecordKind[]> = {};
  for (const item of day.exercises) {
    const history = bests[item.exercise.id];
    if (!history || (item.exercise.weight_increase_kg ?? 0) < 0) continue;
    const running = { ...history };
    for (const setNumber of setNumbers(item)) {
      const key = setKey(item.exercise.id, setNumber);
      const entry = entries[key];
      const weightKg = entry?.completed ? parseWeight(entry.weight) : null;
      const reps = entry?.completed ? parseReps(entry.reps) : null;
      if (!weightKg || !reps) continue;

      const kinds: RecordKind[] = [];
      const estimate = estimateOneRepMax(weightKg, reps);
      const volume = weightKg * reps;
      if (weightKg > running.weightKg) kinds.push('heaviest');
      if (estimate !== null && estimate > running.estimatedMaxKg) kinds.push('one-rep-max');
      if (volume > running.volumeKg) kinds.push('volume');
      running.weightKg = Math.max(running.weightKg, weightKg);
      running.estimatedMaxKg = Math.max(running.estimatedMaxKg, estimate ?? 0);
      running.volumeKg = Math.max(running.volumeKg, volume);
      if (kinds.length > 0) records[key] = kinds;
    }
  }
  return records;
}

/** "4:05" or "1:02:09". */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

/** "52 minutes", "1 hour 5 minutes". */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 1) return 'under a minute';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const minuteText = `${rest} ${rest === 1 ? 'minute' : 'minutes'}`;
  if (hours === 0) return minuteText;
  const hourText = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return rest === 0 ? hourText : `${hourText} ${minuteText}`;
}
