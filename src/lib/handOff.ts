import AsyncStorage from '@react-native-async-storage/async-storage';

import { track } from '@/lib/analytics';
import { contentRoutine } from '@/lib/contentRoutines';
import { fillCopy, routineActionsCopy } from '@/lib/copy';
import { nextRoutineOnPath } from '@/lib/paths';
import { addDays, startOfWeekMonday, toIso } from '@/lib/planner';
import { type QuizAnswers } from '@/lib/profile';
import {
  isGymBackupRoutine,
  isWelcomeBackRoutine,
  LAUNCH_ROUTINE_IDS,
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
  const week = currentEnrolmentWeekSafe(enrolment, now);
  return Math.max(0, enrolment.routine.length_weeks - week + 1);
}

/** Last two weeks of a plan, including week 6 of a 6-week routine. */
export function isInHandoffWindow(enrolment: RoutineEnrolment, now = new Date()): boolean {
  const remaining = weeksRemainingInEnrolment(enrolment, now);
  return remaining >= 1 && remaining <= HANDOFF_WEEKS;
}

function currentEnrolmentWeekSafe(enrolment: RoutineEnrolment, now: Date): number {
  const start = new Date(`${enrolment.start_date}T12:00:00`);
  const mondayNow = startOfWeekMonday(now).getTime();
  const mondayStart = startOfWeekMonday(start).getTime();
  const weeks = Math.floor((mondayNow - mondayStart) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(Math.max(1, weeks), enrolment.routine.length_weeks);
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

export function previewCopy(_enrolment: RoutineEnrolment | null): string {
  return routineActionsCopy.whats_next_title;
}

export function handOffCardCopy(offer: NextRoutineOffer): {
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
} {
  if (offer.mode === 'preview') {
    const body = offer.pathName ? `Next on ${offer.pathName}. ${offer.why}` : offer.why;
    return {
      title: routineActionsCopy.whats_next_title,
      body,
      primaryLabel: routineActionsCopy.whats_next_cta,
      secondaryLabel: '',
    };
  }
  const startLine = `Starts ${offer.mondayLabel}.`;
  const body = offer.pathName ? `Next on ${offer.pathName}. ${startLine}` : startLine;
  return {
    title: offer.routine.name,
    body,
    primaryLabel: fillCopy(routineActionsCopy.complete_next_cta, { next_routine: offer.routine.name }),
    secondaryLabel: routineActionsCopy.whats_next_cta,
  };
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

function eligibleNext(catalogue: RoutineSummary[], currentRoutineId: string | null): RoutineSummary[] {
  return catalogue.filter(
    (routine) =>
      routine.type !== 'stretch' &&
      routine.id !== currentRoutineId &&
      routine.slug !== currentRoutineId &&
      !isWelcomeBackRoutine(routine) &&
      !isGymBackupRoutine(routine)
  );
}

function matchSlug(catalogue: RoutineSummary[], slug: string): RoutineSummary | null {
  return catalogue.find((routine) => routine.slug === slug || routine.id === slug) ?? null;
}

function overlaySlug(currentRoutineId: string | null, catalogue: RoutineSummary[]): string | null {
  if (!currentRoutineId) return null;
  const row = catalogue.find((routine) => routine.id === currentRoutineId || routine.slug === currentRoutineId);
  return row?.slug ?? currentRoutineId;
}

function pickFromSuggestions(
  currentSlug: string | null,
  eligible: RoutineSummary[],
  answers: QuizAnswers | null
): RoutineSummary | null {
  if (!currentSlug) return null;
  const slugs = contentRoutine(currentSlug)?.next_routine_suggestions ?? [];
  const suggested = slugs
    .map((slug) => matchSlug(eligible, slug))
    .filter((item): item is RoutineSummary => item !== null);
  if (suggested.length === 0) return null;
  if (answers) {
    const ranked = pickFeaturedRoutines(suggested, answers, suggested.length);
    if (ranked[0]) return ranked[0];
  }
  return suggested[0];
}

function isOfferableNext(routine: RoutineSummary, currentRoutineId: string | null): boolean {
  return (
    routine.type !== 'stretch' &&
    routine.id !== currentRoutineId &&
    routine.slug !== currentRoutineId &&
    !isWelcomeBackRoutine(routine) &&
    !isGymBackupRoutine(routine)
  );
}

/** Path, then next_routine_suggestions from /content, then goals, then a live strength plan. */
export async function resolveNextRoutineOffer(input: {
  currentRoutineId: string | null;
  catalogue: RoutineSummary[];
  answers: QuizAnswers | null;
  mode: HandOffMode;
}): Promise<NextRoutineOffer | null> {
  const mondayIso = upcomingMondayIso();
  const mondayLabel = formatMondayLabel(mondayIso);
  const eligible = eligibleNext(input.catalogue, input.currentRoutineId);
  const slug = overlaySlug(input.currentRoutineId, input.catalogue);

  let pick: RoutineSummary | null = null;
  let pathName: string | null = null;

  if (input.currentRoutineId) {
    const pathNext = await nextRoutineOnPath(input.currentRoutineId).catch(() => null);
    if (pathNext && isOfferableNext(pathNext.routine, input.currentRoutineId)) {
      pick = pathNext.routine;
      pathName = pathNext.path.name;
    }
  }

  if (!pick) {
    pick = pickFromSuggestions(slug, eligible, input.answers);
  }

  if (!pick && input.answers) {
    pick = pickFeaturedRoutines(eligible, input.answers, 1)[0] ?? null;
  }

  if (!pick) {
    const starter = LAUNCH_ROUTINE_IDS[0];
    pick =
      eligible.find((routine) => routine.id === starter || routine.slug === starter) ?? eligible[0] ?? null;
  }

  if (!pick) return null;
  return {
    routine: pick,
    mode: input.mode,
    pathName,
    why: fillCopy(routineActionsCopy.whats_next_body, { next_routine: pick.name }),
    mondayIso,
    mondayLabel,
  };
}

export async function startNextRoutineOnMonday(routine: RoutineSummary): Promise<'started'> {
  await startRoutine(routine.id, { startDate: upcomingMondayIso() });
  track('next_routine_started', { routine_id: routine.id });
  return 'started';
}
