import AsyncStorage from '@react-native-async-storage/async-storage';

import { customWorkoutToDay, fetchCustomWorkout } from '@/lib/customWorkouts';
import type { EquipmentAccess } from '@/lib/profile';
import {
  fetchProgrammeDay,
  formatKg,
  getWeightSuggestion,
  usesWeight,
  type ProgrammeDay,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';
import { estimateOneRepMax, type ExerciseBests } from '@/lib/progress';
import { getDefaultRestSeconds } from '@/lib/restTimer';
import type { ExerciseRole, ProgressionRule } from '@/lib/routineStandard';
import { fetchRoutineDay, routineDayToProgrammeDay } from '@/lib/routines';
import { formatWeightInput as formatDisplayWeight, parseDisplayWeight } from '@/lib/units';
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
  /** Extra warm-up sets logged as set_number 0, -1, -2. Today only. */
  warmup_sets?: number;
  role?: ExerciseRole;
  target_rir?: number;
  tempo?: string;
  progression_rule?: ProgressionRule;
  load_increment_kg?: number;
  notes?: string;
};

export const EASE_BACK_WEIGHT_SCALE = 0.9;

export type SessionEaseBack = {
  weightScale: number;
};

export type SessionPlan = {
  slots: SessionPlanSlot[];
  /** Welcome-back lighter session: fewer sets live on the slots; weights scale in the logger. */
  easeBack?: SessionEaseBack;
  /** Epoch ms when the live timer started (first ticked set, or Start timer). */
  timerStartedAt?: number | null;
  warmupStatus?: 'pending' | 'done' | 'skipped';
  cooldownStatus?: 'pending' | 'done' | 'skipped';
  rampUpApplied?: boolean;
  /** Single-session name when there is no custom workout or routine day. */
  title?: string;
  focus?: string | null;
  coach_note?: string | null;
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

export function sessionPlanFromDay(
  day: ProgrammeDay,
  easeBack?: SessionEaseBack,
  timerStartedAt?: number | null,
  extras?: Pick<SessionPlan, 'warmupStatus' | 'cooldownStatus' | 'rampUpApplied'>
): SessionPlan {
  return {
    title: day.name,
    focus: day.focus,
    coach_note: day.coach_note,
    slots: day.exercises.map((item) => ({
      position: item.position,
      sets: item.sets,
      rep_min: item.rep_min,
      rep_max: item.rep_max,
      rest_seconds: item.rest_seconds ?? getDefaultRestSeconds(),
      exercise: item.exercise,
      warmup_sets: item.warmup_sets ?? 0,
      role: item.role,
      target_rir: item.target_rir,
      tempo: item.tempo,
      progression_rule: item.progression_rule,
      load_increment_kg: item.load_increment_kg,
      notes: item.notes,
    })),
    easeBack,
    timerStartedAt: timerStartedAt ?? null,
    warmupStatus: extras?.warmupStatus,
    cooldownStatus: extras?.cooldownStatus,
    rampUpApplied: extras?.rampUpApplied,
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
        warmup_sets: slot.warmup_sets ?? existing?.warmup_sets ?? 0,
        role: existing?.role ?? slot.role,
        target_rir: existing?.target_rir ?? slot.target_rir,
        tempo: existing?.tempo ?? slot.tempo,
        progression_rule: existing?.progression_rule ?? slot.progression_rule,
        load_increment_kg: existing?.load_increment_kg ?? slot.load_increment_kg,
        notes: existing?.notes ?? slot.notes,
        alternative_exercise_ids: existing?.alternative_exercise_ids,
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

/** Warm-up sets use 0, -1, -2 so working set 1 stays the progression set. */
export function warmupSetNumbers(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => -index);
}

export function allSetNumbers(item: ProgrammeExercise): number[] {
  return [...warmupSetNumbers(item.warmup_sets ?? 0), ...setNumbers(item)];
}

export function isWarmupSetNumber(setNumber: number): boolean {
  return setNumber <= 0;
}

export function parseWeight(text: string): number | null {
  return parseDisplayWeight(text);
}

export function parseReps(text: string): number | null {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatWeightInput(kg: number | null): string {
  return formatDisplayWeight(kg);
}

/**
 * Pre-fills each set: what's already logged this session, else the increased weight at the bottom
 * of the rep range if she earned one, else last time, else the bottom of the rep range.
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
    for (const setNumber of allSetNumbers(item)) {
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
      if (withProgression && !weightScale && !isWarmupSetNumber(setNumber) && suggestion.kind === 'increase') {
        entries[setKey(exerciseId, setNumber)] = {
          weight: formatWeightInput(suggestion.kg),
          reps: String(item.rep_min),
          completed: false,
        };
        continue;
      }
      const last =
        previousSets.find((set) => set.set_number === setNumber) ??
        (isWarmupSetNumber(setNumber) ? undefined : previousSets[previousSets.length - 1]);
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
  timerStartedAt: number | null;
  warmupStatus: 'pending' | 'done' | 'skipped';
  cooldownStatus: 'pending' | 'done' | 'skipped';
  rampUpApplied: boolean;
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
  const plan = await loadSessionPlan(session.id);
  if (!planned && plan?.slots.length) {
    planned = {
      id: session.id,
      day_number: 1,
      name: plan.title ?? 'Session',
      focus: plan.focus ?? null,
      coach_note: plan.coach_note ?? null,
      exercises: plan.slots.map((slot) => ({
        position: slot.position,
        sets: slot.sets,
        rep_min: slot.rep_min,
        rep_max: slot.rep_max,
        rest_seconds: slot.rest_seconds,
        exercise: slot.exercise,
        warmup_sets: slot.warmup_sets,
        role: slot.role,
        target_rir: slot.target_rir,
        tempo: slot.tempo,
        progression_rule: slot.progression_rule,
        load_increment_kg: slot.load_increment_kg,
        notes: slot.notes,
      })),
    };
  }
  if (!planned) return null;
  const swapped = applySwaps(planned, swaps);
  const day = plan && plan.slots.length > 0 ? applySessionPlan(swapped, plan) : swapped;
  const exerciseIds = day.exercises.map((item) => item.exercise.id);
  const [logged, previous] = await Promise.all([
    fetchSessionSets(id),
    fetchPreviousSets(exerciseIds, id),
  ]);
  const hasTicked = logged.some((set) => set.completed);
  const timerStartedAt =
    typeof plan?.timerStartedAt === 'number'
      ? plan.timerStartedAt
      : hasTicked
        ? new Date(session.started_at).getTime()
        : null;
  return {
    session,
    day,
    logged,
    previous,
    easeBack: plan?.easeBack ?? null,
    timerStartedAt,
    warmupStatus: plan?.warmupStatus ?? 'pending',
    cooldownStatus: plan?.cooldownStatus ?? 'pending',
    rampUpApplied: Boolean(plan?.rampUpApplied),
  };
}

/** The first set not yet ticked, in programme order. Null when every set is done. */
export function getNextSet(day: ProgrammeDay, entries: Record<string, SetEntry>): NextSet | null {
  for (const item of day.exercises) {
    for (const setNumber of allSetNumbers(item)) {
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
    for (const setNumber of allSetNumbers(item)) {
      if (isWarmupSetNumber(setNumber)) continue;
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

/** Last time this set was logged, e.g. "8 kg × 10". */
export function formatPreviousSet(set: LoggedSet | undefined, weighted: boolean): string {
  if (!set) return '-';
  if (weighted && set.weight_kg !== null && set.reps !== null) {
    return `${formatKg(set.weight_kg)} × ${set.reps}`;
  }
  if (set.reps !== null) return `${set.reps} reps`;
  if (weighted && set.weight_kg !== null) return formatKg(set.weight_kg);
  return '-';
}

/** Sum of ticked weight × reps in this session, in kilograms. */
export function sessionVolumeKg(
  day: ProgrammeDay,
  entries: Record<string, SetEntry>
): number {
  let total = 0;
  for (const item of day.exercises) {
    if (!usesWeight(item.exercise.equipment)) continue;
    for (const setNumber of allSetNumbers(item)) {
      if (isWarmupSetNumber(setNumber)) continue;
      const entry = entries[setKey(item.exercise.id, setNumber)];
      if (!entry?.completed) continue;
      const kg = parseWeight(entry.weight);
      const reps = parseReps(entry.reps);
      if (kg !== null && reps !== null) total += kg * reps;
    }
  }
  return total;
}

export function workingSetCount(day: ProgrammeDay): number {
  return day.exercises.reduce((sum, item) => sum + setNumbers(item).length, 0);
}

export function completedWorkingSetCount(
  day: ProgrammeDay,
  entries: Record<string, SetEntry>
): number {
  let done = 0;
  for (const item of day.exercises) {
    for (const setNumber of setNumbers(item)) {
      if (entries[setKey(item.exercise.id, setNumber)]?.completed) done += 1;
    }
  }
  return done;
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
