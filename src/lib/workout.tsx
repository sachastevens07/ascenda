import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Vibration } from 'react-native';

import { useAuth } from '@/lib/auth';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { cancelRestOver, scheduleRestOver } from '@/lib/restTimer';
import { fetchRoutineDay } from '@/lib/routines';
import { fetchActiveSession, type SessionSource } from '@/lib/sessions';
import { useSubscription } from '@/lib/subscription';
import { buildEntries, getNextSet, loadSessionLog, type NextSet } from '@/lib/workoutLog';

/** The session in progress, as shown in the bar above the tabs. */
export type ActiveWorkout = {
  sessionId: string;
  dayName: string;
  /** Epoch milliseconds. */
  startedAt: number;
  source?: SessionSource;
};

type WorkoutState = {
  active: ActiveWorkout | null;
  /** Null when every set is ticked. */
  nextSet: NextSet | null;
  /** Epoch milliseconds when the rest ends; null when she isn't resting. */
  restEndsAt: number | null;
  /** The logger calls this whenever the session or its sets change. */
  publish: (active: ActiveWorkout, nextSet: NextSet | null) => void;
  /** Clears everything after she finishes or discards. */
  end: () => void;
  startRest: (seconds: number) => void;
  adjustRest: (seconds: number) => void;
  stopRest: () => void;
};

const WorkoutContext = createContext<WorkoutState | null>(null);

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { profile } = useProfile();
  const userId = session?.user.id ?? null;
  const equipment = getQuizAnswers(profile)?.equipment ?? null;
  const { isPro } = useSubscription();
  // Read when restoring, without restarting the restore if Pro status arrives later.
  const isProRef = useRef(isPro);
  isProRef.current = isPro;

  const [active, setActive] = useState<ActiveWorkout | null>(null);
  const [nextSet, setNextSet] = useState<NextSet | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const notificationId = useRef<string | null>(null);
  const hasPublished = useRef(false);

  const restVersion = useRef(0);

  const setRest = useCallback((endsAt: number | null) => {
    const version = ++restVersion.current;
    const previousId = notificationId.current;
    notificationId.current = null;
    setRestEndsAt(endsAt);
    cancelRestOver(previousId).catch(() => {});
    if (endsAt !== null) {
      scheduleRestOver((endsAt - Date.now()) / 1000)
        .then((id) => {
          // The rest may have been changed or skipped while this was being scheduled.
          if (version === restVersion.current) notificationId.current = id;
          else cancelRestOver(id).catch(() => {});
        })
        .catch(() => {});
    }
  }, []);

  // Restores the workout in progress when the app opens (or she signs in).
  useEffect(() => {
    hasPublished.current = false;
    setActive(null);
    setNextSet(null);
    if (!userId || !equipment) return;
    let isCurrent = true;
    (async () => {
      const current = await fetchActiveSession();
      if (!current) return;
      if (current.source === 'stretch') {
        const day = current.routine_day_id ? await fetchRoutineDay(current.routine_day_id) : null;
        if (!isCurrent || hasPublished.current) return;
        setActive({
          sessionId: current.id,
          dayName: day?.name ?? 'Stretch',
          startedAt: new Date(current.started_at).getTime(),
          source: 'stretch',
        });
        setNextSet(null);
        return;
      }
      const log = await loadSessionLog(current.id, equipment);
      if (!isCurrent || !log || hasPublished.current) return;
      if (!log.logged.some((set) => set.completed)) return;
      setActive({
        sessionId: current.id,
        dayName: log.day.name,
        startedAt: new Date(current.started_at).getTime(),
      });
      setNextSet(
        getNextSet(log.day, buildEntries(log.day, log.logged, log.previous, isProRef.current))
      );
    })().catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [userId, equipment]);

  // Vibrates when the rest is over, even if she has left the workout screen.
  useEffect(() => {
    if (restEndsAt === null) return;
    const timer = setInterval(() => {
      if (Date.now() >= restEndsAt) {
        Vibration.vibrate([0, 300, 200, 300]);
        notificationId.current = null;
        setRestEndsAt(null);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [restEndsAt]);

  const publish = useCallback((workout: ActiveWorkout, next: NextSet | null) => {
    hasPublished.current = true;
    setActive(workout);
    setNextSet(next);
  }, []);

  const end = useCallback(() => {
    hasPublished.current = true;
    setActive(null);
    setNextSet(null);
    setRest(null);
  }, [setRest]);

  const value = useMemo<WorkoutState>(
    () => ({
      active,
      nextSet,
      restEndsAt,
      publish,
      end,
      startRest: (seconds) => setRest(Date.now() + seconds * 1000),
      adjustRest: (seconds) => {
        if (restEndsAt === null) return;
        const endsAt = restEndsAt + seconds * 1000;
        setRest(endsAt - Date.now() >= 1000 ? endsAt : null);
      },
      stopRest: () => setRest(null),
    }),
    [active, nextSet, restEndsAt, publish, end, setRest]
  );

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
}

export function useWorkout(): WorkoutState {
  const value = useContext(WorkoutContext);
  if (!value) throw new Error('useWorkout must be used inside WorkoutProvider');
  return value;
}

/** The current time, updated every `intervalMs` while `isRunning`. */
export function useNow(isRunning: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isRunning) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [isRunning, intervalMs]);
  return now;
}
