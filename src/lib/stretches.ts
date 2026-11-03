import { fetchExercise, type Exercise } from '@/lib/exercises';
import {
  describeRoutineError,
  fetchRoutine,
  fetchRoutineDay,
  fetchRoutines,
  firstDayOfRoutine,
  type Routine,
  type RoutineDay,
  type RoutineDayExercise,
  type RoutineSummary,
} from '@/lib/routines';
import { fetchActiveSession, startStretchSession, type Session } from '@/lib/sessions';

export const STRETCH_PREVIEW_STEPS = 2;

export function missingStretchesMessage(): string {
  return 'Stretch routines need supabase/stretches.sql run in the Supabase SQL editor.';
}

export function describeStretchError(error: unknown): string {
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  if (/stretches\.sql|source.*stretch/i.test(detail)) return missingStretchesMessage();
  return describeRoutineError(error) || detail || 'Check your connection and try again.';
}

export async function fetchStretchRoutines(): Promise<RoutineSummary[]> {
  return fetchRoutines({ type: 'stretch' });
}

export async function fetchStretchRoutine(id: string): Promise<Routine | null> {
  const routine = await fetchRoutine(id, { includeLockedWeeks: true });
  if (!routine || routine.type !== 'stretch') return null;
  return routine;
}

export function stretchSteps(routine: Routine): RoutineDayExercise[] {
  return firstDayOfRoutine(routine)?.exercises ?? [];
}

export function totalHoldSeconds(steps: Pick<RoutineDayExercise, 'duration_seconds'>[]): number {
  return steps.reduce((sum, step) => sum + (step.duration_seconds ?? 0), 0);
}

export function formatHold(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (rest === 0) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  return `${minutes} min ${rest} s`;
}

export function formatHoldShort(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (rest === 0) return minutes === 1 ? '1 min' : `${minutes} min`;
  return `${minutes} min ${rest} s`;
}

export type StretchPlayStep = {
  position: number;
  durationSeconds: number;
  exercise: Exercise;
};

export async function loadStretchSteps(source: Routine | RoutineDay): Promise<StretchPlayStep[]> {
  const slots = 'weeks' in source ? stretchSteps(source) : source.exercises;
  const steps: StretchPlayStep[] = [];
  for (const slot of slots) {
    const exercise = await fetchExercise(slot.exercise.id);
    if (!exercise) continue;
    steps.push({
      position: slot.position,
      durationSeconds: slot.duration_seconds ?? 30,
      exercise,
    });
  }
  return steps;
}

export async function loadStretchStepsForSession(
  session: Session
): Promise<{ steps: StretchPlayStep[]; dayName: string } | null> {
  if (!session.routine_day_id) return null;
  const day = await fetchRoutineDay(session.routine_day_id);
  if (!day) return null;
  const steps = await loadStretchSteps(day);
  if (steps.length === 0) return null;
  return { steps, dayName: day.name };
}

export async function beginStretchSession(routineDayId: string): Promise<Session> {
  const active = await fetchActiveSession();
  if (active) {
    const error = new Error('You already have a session going');
    (error as Error & { code?: string }).code = 'SESSION_IN_PROGRESS';
    (error as Error & { activeId?: string }).activeId = active.id;
    (error as Error & { activeSource?: string }).activeSource = active.source;
    throw error;
  }
  return startStretchSession(routineDayId);
}

export function isSessionInProgressError(
  error: unknown
): error is Error & { code: 'SESSION_IN_PROGRESS'; activeId: string; activeSource?: string } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'SESSION_IN_PROGRESS');
}
