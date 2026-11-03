import AsyncStorage from '@react-native-async-storage/async-storage';

import { track } from '@/lib/analytics';
import { FREE_STARTER_ROUTINE_ID } from '@/lib/onboarding';
import { nextRoutineOnPath } from '@/lib/paths';
import { addDays, startOfWeekMonday, toIso } from '@/lib/planner';
import { type QuizAnswers } from '@/lib/profile';
import {
  currentEnrolmentWeek,
  pickFeaturedRoutines,
  startRoutine,
  type RoutineEnrolment,
  type RoutineSummary,
} from '@/lib/routines';

const PREVIEW_KEY = 'handoff_preview';
const HANDOFF_WEEKS = 2;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type HandOffMode = 'preview' | 'start';

export type NextRoutineOffer = {
  routine: RoutineSummary;
  mode: HandOffMode;
  pathName: string | null;
  why: string;
  mondayIso: string;
  mondayLabel: string;
};

export function weeksRemainingInEnrolment(enrolment: RoutineEnrolment, now = new Date()): number {
  const week = currentEnrolmentWeek(enrolment, now);
  return Math.max(0, enrolment.routine.length_weeks - week + 1);
}

/** Last two weeks of a plan, including week 6 of a 6-week routine. */
export function isInHandoffWindow(enrolment: RoutineEnrolment, now = new Date()): boolean {
  const remaining = weeksRemainingInEnrolment(enrolment, now);
  return remaining >= 1 && remaining <= HANDOFF_WEEKS;
}

export function upcomingMondayIso(now = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today.getDay() === 1) return toIso(today);
  return toIso(addDays(startOfWeekMonday(today), 7));
}

export function formatMondayLabel(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  const date = new Date(2000, month - 1, day);
  return `Monday ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function previewCopy(enrolment: RoutineEnrolment | null): string {
  if (!enrolment) return 'A good next step when you are ready.';
  const remaining = weeksRemainingInEnrolment(enrolment);
  if (remaining <= 1) return 'This plan is nearly done. Here is a good next step.';
  return 'You are on the home stretch. Here is a good next step.';
}

export async function fetchHandOffPreview(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREVIEW_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function saveHandOffPreview(on: boolean): Promise<void> {
  await AsyncStorage.setItem(PREVIEW_KEY, on ? '1' : '0');
}

export async function resolveNextRoutineOffer(input: {
  currentRoutineId: string | null;
  catalogue: RoutineSummary[];
  answers: QuizAnswers | null;
  isPro: boolean;
  mode: HandOffMode;
}): Promise<NextRoutineOffer | null> {
  const mondayIso = upcomingMondayIso();
  const mondayLabel = formatMondayLabel(mondayIso);
  const strength = input.catalogue.filter(
    (routine) => routine.type !== 'stretch' && routine.id !== input.currentRoutineId
  );

  if (input.currentRoutineId) {
    const pathNext = await nextRoutineOnPath(input.currentRoutineId).catch(() => null);
    if (pathNext && pathNext.routine.id !== input.currentRoutineId) {
      return {
        routine: pathNext.routine,
        mode: input.mode,
        pathName: pathNext.path.name,
        why: `Next on ${pathNext.path.name}.`,
        mondayIso,
        mondayLabel,
      };
    }
  }

  const ranked = input.answers
    ? pickFeaturedRoutines(strength, input.answers, 3, { freeOnly: !input.isPro })
    : strength.filter((routine) => input.isPro || !routine.is_pro);
  const pick =
    ranked.find((routine) => routine.id !== input.currentRoutineId) ??
    strength.find((routine) => routine.id === FREE_STARTER_ROUTINE_ID) ??
    strength[0] ??
    null;
  if (!pick) return null;
  return {
    routine: pick,
    mode: input.mode,
    pathName: null,
    why: 'Chosen from your goals, so you have something ready.',
    mondayIso,
    mondayLabel,
  };
}

export async function startNextRoutineOnMonday(routine: RoutineSummary, isPro: boolean): Promise<'started' | 'paywall'> {
  if (routine.is_pro && !isPro) return 'paywall';
  await startRoutine(routine.id, { startDate: upcomingMondayIso() });
  track('next_routine_started', { routine_id: routine.id });
  return 'started';
}
