import { router, type Href } from 'expo-router';

import { showDialog } from '@/components/Dialog';
import { beginCardioSession, cardioSession, describeCardioError, isSessionInProgressError } from '@/lib/cardio';
import { fetchRoutineIdBySlug } from '@/lib/completeWeek';
import {
  confirmFirstSessionSafety,
  isSessionStartCancelled,
  SessionStartCancelled,
} from '@/lib/firstSession';
import { ensureSubscribed } from '@/lib/paywall';
import {
  describeRoutineError,
  fetchRoutine,
  fetchRoutineDay,
  firstDayOfRoutine,
  routineDayToProgrammeDay,
} from '@/lib/routines';
import { fetchActiveSession, startRoutineSession } from '@/lib/sessions';
import { beginStretchSession, describeStretchError } from '@/lib/stretches';
import { markWelcomeBackSession } from '@/lib/welcomeBack';
import { lightenSessionPlan, saveSessionPlan, sessionPlanFromDay } from '@/lib/workoutLog';
import type { ActiveWorkout } from '@/lib/workout';
import type { NextSet } from '@/lib/workoutLog';

export type StartLoggerInput = {
  enrolmentId: string;
  routineDayId: string;
  sourceProgrammeDayId?: string | null;
  easeBack?: boolean;
  welcomeBack?: boolean;
};

/** Creates a routine session and opens the logger. Returns an in-progress session instead if one exists. */
export async function startRoutineLogger(
  input: StartLoggerInput
): Promise<{ sessionId: string; alreadyActive: boolean }> {
  if (!ensureSubscribed()) throw new SessionStartCancelled();
  const allowed = await confirmFirstSessionSafety();
  if (!allowed) throw new SessionStartCancelled();
  const active = await fetchActiveSession();
  if (active) return { sessionId: active.id, alreadyActive: true };

  const day = await fetchRoutineDay(input.routineDayId);
  const session = await startRoutineSession({
    enrolmentId: input.enrolmentId,
    routineDayId: input.routineDayId,
    sourceProgrammeDayId: input.sourceProgrammeDayId ?? day?.source_programme_day_id,
    sessionType: day?.sessionType,
  });
  if (day) {
    let plan = sessionPlanFromDay(routineDayToProgrammeDay(day));
    if (input.easeBack) plan = lightenSessionPlan(plan);
    await saveSessionPlan(session.id, plan);
  }
  if (input.welcomeBack || input.easeBack) await markWelcomeBackSession(session.id);
  return { sessionId: session.id, alreadyActive: false };
}

export function openLogger(sessionId: string, replace = false): void {
  if (!ensureSubscribed()) return;
  const route = { pathname: '/session/[id]', params: { id: sessionId } } as Href;
  if (replace) router.replace(route);
  else router.push(route);
}

export function promptActiveSession(sessionId: string, replace = false): void {
  showDialog(
    'You already have a session going',
    'Finish or discard it first, then start this one.',
    [
      { text: 'Open it', onPress: () => openLogger(sessionId, replace) },
      { text: 'OK', style: 'cancel' },
    ]
  );
}

/** Starts a routine session and opens the logger, or offers the one already in progress. */
export async function openRoutineLogger(
  input: StartLoggerInput,
  options?: { replace?: boolean }
): Promise<void> {
  try {
    const result = await startRoutineLogger(input);
    if (result.alreadyActive) {
      promptActiveSession(result.sessionId, options?.replace);
      return;
    }
    openLogger(result.sessionId, options?.replace);
  } catch (error) {
    if (isSessionStartCancelled(error)) return;
    showDialog('Couldn’t start the session', describeRoutineError(error));
  }
}

function openActive(id: string, source?: string, replace = false): void {
  const route =
    source === 'stretch'
      ? ({ pathname: '/stretches/play', params: { sessionId: id } } as Href)
      : source === 'cardio'
        ? ({ pathname: '/cardio/play', params: { sessionId: id } } as Href)
        : ({ pathname: '/session/[id]', params: { id } } as Href);
  if (replace) router.replace(route);
  else router.push(route);
}

type PublishWorkout = (active: ActiveWorkout, nextSet: NextSet | null) => void;

/** Starts a cardio session from the planner or Home and opens the player. */
export async function openCardioFromPlan(
  slug: string,
  publish: PublishWorkout,
  options?: { replace?: boolean }
): Promise<void> {
  try {
    if (!ensureSubscribed()) throw new SessionStartCancelled();
    const def = cardioSession(slug);
    if (!def) {
      showDialog('Couldn’t start the session', 'That cardio session isn’t in the library.');
      return;
    }
    const allowed = await confirmFirstSessionSafety();
    if (!allowed) throw new SessionStartCancelled();
    const started = await beginCardioSession(slug);
    publish(
      {
        sessionId: started.id,
        dayName: def.name,
        startedAt: Date.parse(started.started_at),
        source: 'cardio',
      },
      null
    );
    openActive(started.id, 'cardio', options?.replace);
  } catch (error) {
    if (isSessionStartCancelled(error)) return;
    if (isSessionInProgressError(error) && error.activeId) {
      showDialog(
        'You already have a session going',
        'Finish or discard it first, then start this one.',
        [
          { text: 'Open it', onPress: () => openActive(error.activeId, error.activeSource, options?.replace) },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }
    showDialog('Couldn’t start the session', describeCardioError(error));
  }
}

/** Starts a stretch from a known routine day (legacy stretch rows). */
export async function openStretchDayFromPlan(
  routineDayId: string,
  name: string,
  publish: PublishWorkout,
  options?: { replace?: boolean }
): Promise<void> {
  try {
    if (!ensureSubscribed()) throw new SessionStartCancelled();
    const allowed = await confirmFirstSessionSafety();
    if (!allowed) throw new SessionStartCancelled();
    const started = await beginStretchSession(routineDayId);
    publish(
      {
        sessionId: started.id,
        dayName: name || 'Recovery',
        startedAt: Date.parse(started.started_at),
        source: 'stretch',
      },
      null
    );
    openActive(started.id, 'stretch', options?.replace);
  } catch (error) {
    if (isSessionStartCancelled(error)) return;
    if (isSessionInProgressError(error) && error.activeId) {
      showDialog(
        'You already have a session going',
        'Finish or discard it first, then start this one.',
        [
          { text: 'Open it', onPress: () => openActive(error.activeId, error.activeSource, options?.replace) },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }
    showDialog('Couldn’t start the session', describeStretchError(error));
  }
}

/** Starts a recovery stretch from the planner or Home and opens the player. */
export async function openRecoveryFromPlan(
  stretchSlug: string,
  publish: PublishWorkout,
  options?: { replace?: boolean }
): Promise<void> {
  try {
    if (!ensureSubscribed()) throw new SessionStartCancelled();
    const allowed = await confirmFirstSessionSafety();
    if (!allowed) throw new SessionStartCancelled();
    const routineId = await fetchRoutineIdBySlug(stretchSlug);
    const routine = routineId ? await fetchRoutine(routineId) : null;
    const day = routine ? firstDayOfRoutine(routine) : null;
    if (!day) {
      showDialog('Couldn’t start the session', describeStretchError(new Error('source stretch')));
      return;
    }
    const started = await beginStretchSession(day.id);
    publish(
      {
        sessionId: started.id,
        dayName: routine?.name ?? 'Recovery',
        startedAt: Date.parse(started.started_at),
        source: 'stretch',
      },
      null
    );
    openActive(started.id, 'stretch', options?.replace);
  } catch (error) {
    if (isSessionStartCancelled(error)) return;
    if (isSessionInProgressError(error) && error.activeId) {
      showDialog(
        'You already have a session going',
        'Finish or discard it first, then start this one.',
        [
          { text: 'Open it', onPress: () => openActive(error.activeId, error.activeSource, options?.replace) },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }
    showDialog('Couldn’t start the session', describeStretchError(error));
  }
}
