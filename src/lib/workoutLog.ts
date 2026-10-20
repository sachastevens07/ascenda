import type { EquipmentAccess } from '@/lib/profile';
import {
  fetchProgrammeDay,
  getWeightSuggestion,
  usesWeight,
  type ProgrammeDay,
  type ProgrammeExercise,
} from '@/lib/programmes';
import { estimateOneRepMax, type ExerciseBests } from '@/lib/progress';
import {
  fetchPreviousSets,
  fetchSession,
  fetchSessionSets,
  type LoggedSet,
  type Session,
} from '@/lib/sessions';
import { applySwaps, fetchSessionSwaps } from '@/lib/swaps';

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
 * of the rep range if she earned one, else last time, else the bottom of the rep range.
 */
export function buildEntries(
  day: ProgrammeDay,
  logged: LoggedSet[],
  previous: Record<string, LoggedSet[]>
): Record<string, SetEntry> {
  const entries: Record<string, SetEntry> = {};
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
      if (suggestion.kind === 'increase') {
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
      entries[setKey(exerciseId, setNumber)] = {
        weight: usesWeight(item.exercise.equipment) ? formatWeightInput(last?.weight_kg ?? null) : '',
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
};

/** Everything needed to show a session in the logger. Null if the session or its day is gone. */
export async function loadSessionLog(
  id: string,
  equipment: EquipmentAccess
): Promise<SessionLog | null> {
  const session = await fetchSession(id);
  if (!session?.programme_day_id) return null;
  const [programmeDay, swaps] = await Promise.all([
    fetchProgrammeDay(session.programme_day_id, equipment),
    fetchSessionSwaps(session),
  ]);
  if (!programmeDay) return null;
  const day = applySwaps(programmeDay, swaps);
  const exerciseIds = day.exercises.map((item) => item.exercise.id);
  const [logged, previous] = await Promise.all([
    fetchSessionSets(id),
    fetchPreviousSets(exerciseIds, id),
  ]);
  return { session, day, logged, previous };
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
