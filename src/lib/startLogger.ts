import { router, type Href } from 'expo-router';

import { showDialog } from '@/components/Dialog';
import {
  confirmFirstSessionSafety,
  isSessionStartCancelled,
  SessionStartCancelled,
} from '@/lib/firstSession';
import { describeRoutineError, fetchRoutineDay, routineDayToProgrammeDay } from '@/lib/routines';
import { fetchActiveSession, startRoutineSession } from '@/lib/sessions';
import { markWelcomeBackSession } from '@/lib/welcomeBack';
import { lightenSessionPlan, saveSessionPlan, sessionPlanFromDay } from '@/lib/workoutLog';

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
