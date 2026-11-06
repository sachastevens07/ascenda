import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { ExercisePicker } from '@/components/ExercisePicker';
import { HoldPlayer } from '@/components/HoldPlayer';
import { SessionBlockCard } from '@/components/SessionBlockCard';
import { SwapSheet } from '@/components/SwapSheet';
import {
  AppText,
  DestructiveTextButton,
  EmptyState,
  ExerciseThumb,
  IconButton,
  MenuHeader,
  MenuRow,
  NoteChip,
  OverflowMenu,
  PrimaryButton,
  RestChip,
  RestTimerBar,
  SetRow,
  SetTableHeader,
  TextButton,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { collectSessionWins } from '@/lib/activityStats';
import { fillBlockTargetsFromSession } from '@/lib/blocks';
import { recordCheckpointIfNeeded } from '@/lib/checkpoints';
import { fillCopy, loggerCopy } from '@/lib/copy';
import {
  DEFAULT_SLOT,
  MAX_REPS,
  MAX_SETS,
  MAX_WORKOUT_EXERCISES,
  MIN_REPS,
  MIN_SETS,
  STARTER_WORKOUT_ID,
  appendCustomWorkoutExercise,
  copyWorkoutName,
  deleteCustomWorkout,
  describeCustomWorkoutError,
  duplicateRoutineDay,
  isFreeCustomWorkoutLimitError,
  isProRoutineDuplicateError,
  replaceCustomWorkoutExercise,
} from '@/lib/customWorkouts';
import {
  EXERCISE_REST_OPTIONS,
  fetchExercisePrefs,
  saveExerciseNote,
  saveExerciseRestPref,
} from '@/lib/exercisePrefs';
import { openPaywall } from '@/lib/paywall';
import { markPlannerDateDone } from '@/lib/planner';
import { maybeAskSessionReminders, syncPlannerReminders } from '@/lib/reminders';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import {
  formatKg,
  getWeightSuggestion,
  usesWeight,
  type ProgrammeDay,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';
import { ROLE_LABELS } from '@/lib/routineStandard';
import { fetchExerciseBests, type ExerciseBests } from '@/lib/progress';
import {
  REST_ADJUST_SECONDS,
  ensureRestTimerPermission,
  formatRestChipTime,
  getDefaultRestSeconds,
} from '@/lib/restTimer';
import { useWeightUnit } from '@/lib/units';
import {
  daysInWeek,
  fetchActiveEnrolment,
  fetchRoutine,
  findPlannedSession,
  maybeCompleteEnrolment,
  type Routine,
  type RoutineDay,
} from '@/lib/routines';
import {
  discardSession,
  fetchPreviousSets,
  fetchSession,
  fetchSessionSets,
  finishSession,
  saveSessionSwaps,
  saveSet,
  updateSessionRoutineDay,
  type LoggedSet,
  type Session,
} from '@/lib/sessions';
import { useSubscription } from '@/lib/subscription';
import { deleteUserSwap, exerciseFits, saveUserSwap, swapIds, type SwapScope } from '@/lib/swaps';
import { useNow, useWorkout } from '@/lib/workout';
import {
  RECORD_LABELS,
  allSetNumbers,
  buildEntries,
  clearSessionPlan,
  completedWorkingSetCount,
  formatClock,
  formatDuration,
  formatPreviousSet,
  formatWeightInput,
  getNextSet,
  getSetRecords,
  isWarmupSetNumber,
  loadSessionLog,
  parseReps,
  parseWeight,
  saveSessionPlan,
  sessionPlanFromDay,
  sessionVolumeKg,
  setKey,
  workingSetCount,
  type RecordKind,
  type SessionEaseBack,
  type SetEntry,
} from '@/lib/workoutLog';
import {
  applyRampUp,
  blockForSession,
  playStepsFromBlock,
  type BlockPlayStatus,
  type ResolvedBlock,
} from '@/lib/warmupBlocks';
import { consumeWelcomeBackSession, recordWelcomeBackCompleted } from '@/lib/welcomeBack';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';
type MenuMode = 'actions' | 'days';

function showRecords(kinds: RecordKind[]) {
  showDialog(
    kinds.length === 1 ? loggerCopy.pb_toast : loggerCopy.pb_toast,
    kinds.map((kind) => RECORD_LABELS[kind]).join('\n')
  );
}

function slotRestSeconds(
  item: ProgrammeExercise,
  restPrefs: Record<string, number>
): number {
  return restPrefs[item.exercise.id] ??
    (item.rest_seconds && item.rest_seconds > 0 ? item.rest_seconds : getDefaultRestSeconds());
}

function rirLine(rir: number | undefined): string | null {
  if (rir == null) return null;
  const rounded = Math.round(rir);
  if (rounded === 0) return loggerCopy.rir['0'];
  if (rounded === 1) return loggerCopy.rir['1'];
  if (rounded === 2) return loggerCopy.rir['2'];
  if (rounded === 3) return loggerCopy.rir['3'];
  return fillCopy(loggerCopy.rir.range, { min: rounded, max: rounded });
}

function formatTargetLine(item: ProgrammeExercise): string {
  const reps =
    item.rep_min === item.rep_max ? `${item.rep_min}` : `${item.rep_min} to ${item.rep_max}`;
  const parts = [`${item.sets} × ${reps}`];
  const rir = rirLine(item.target_rir);
  if (rir) parts.push(rir);
  return parts.join(' · ');
}

function roleLabel(role: ProgrammeExercise['role']): string | null {
  if (!role) return null;
  return loggerCopy.roles[role] ?? ROLE_LABELS[role];
}

function lastSetPlaceholders(
  sets: LoggedSet[] | undefined,
  setNumber: number,
  weighted: boolean
): { kg?: string; reps?: string } {
  if (!sets || sets.length === 0) return {};
  const last = sets.find((set) => set.set_number === setNumber) ?? sets[sets.length - 1];
  return {
    kg: weighted && last.weight_kg !== null ? formatWeightInput(last.weight_kg) : undefined,
    reps: last.reps !== null ? String(last.reps) : undefined,
  };
}

function SlotMenuButton({
  name,
  onOpen,
}: {
  name: string;
  onOpen: (anchor: AnchorRect) => void;
}) {
  const ref = useRef<AnchorHandle>(null);
  return (
    <View ref={ref} collapsable={false}>
      <IconButton
        icon="ellipsis-horizontal"
        variant="muted"
        accessibilityLabel={`${name} options`}
        onPress={() => measureAnchor(ref.current, onOpen)}
      />
    </View>
  );
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colours, spacing, radius, shadow } = useTheme();
  const weightUnit = useWeightUnit();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const equipment = answers?.equipment ?? null;
  const { isPro, isLoading: isSubscriptionLoading } = useSubscription();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [day, setDay] = useState<ProgrammeDay | null>(null);
  const [previous, setPrevious] = useState<Record<string, LoggedSet[]>>({});
  const [entries, setEntries] = useState<Record<string, SetEntry>>({});
  const [isFinishing, setIsFinishing] = useState(false);
  const [swapItem, setSwapItem] = useState<ProgrammeExercise | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [bests, setBests] = useState<Record<string, ExerciseBests>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSavingWorkout, setIsSavingWorkout] = useState(false);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [easeBack, setEaseBack] = useState<SessionEaseBack | null>(null);
  const menuRef = useRef<AnchorHandle>(null);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMode, setMenuMode] = useState<MenuMode>('actions');
  const [slotMenuItem, setSlotMenuItem] = useState<ProgrammeExercise | null>(null);
  const [slotMenuAnchor, setSlotMenuAnchor] = useState<AnchorRect | null>(null);
  const [coachOpen, setCoachOpen] = useState(true);
  const [warmupStatus, setWarmupStatus] = useState<BlockPlayStatus>('pending');
  const [cooldownStatus, setCooldownStatus] = useState<BlockPlayStatus>('pending');
  const [rampUpApplied, setRampUpApplied] = useState(false);
  const [playingBlock, setPlayingBlock] = useState<ResolvedBlock | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [restPrefs, setRestPrefs] = useState<Record<string, number>>({});
  const [noteItem, setNoteItem] = useState<ProgrammeExercise | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [restItem, setRestItem] = useState<ProgrammeExercise | null>(null);
  const [repItem, setRepItem] = useState<ProgrammeExercise | null>(null);
  const [repMinText, setRepMinText] = useState('');
  const [repMaxText, setRepMaxText] = useState('');
  const [reorderMode, setReorderMode] = useState(false);
  const [pbGlowKey, setPbGlowKey] = useState<string | null>(null);

  const { restEndsAt, publish, startRest, stopRest, adjustRest, end } = useWorkout();
  const now = useNow(startedAt !== null, 500);

  const customWorkoutId = session?.custom_workout_id ?? null;
  const mutateCustom = Boolean(customWorkoutId && customWorkoutId !== STARTER_WORKOUT_ID);

  const totalSets = day ? workingSetCount(day) : 0;
  const doneSets = day ? completedWorkingSetCount(day, entries) : 0;
  const volumeKg = day ? sessionVolumeKg(day, entries) : 0;

  const weekDays = useMemo(
    () => (routine && weekNumber !== null ? daysInWeek(routine, weekNumber) : []),
    [routine, weekNumber]
  );
  const warmupBlock = useMemo(
    () => (day ? blockForSession('warmup', day, routine?.session_minutes) : null),
    [day, routine?.session_minutes]
  );
  const cooldownBlock = useMemo(
    () => (day ? blockForSession('cooldown', day, routine?.session_minutes) : null),
    [day, routine?.session_minutes]
  );

  useEffect(() => {
    if (!pbGlowKey) return;
    const timer = setTimeout(() => setPbGlowKey(null), 1400);
    return () => clearTimeout(timer);
  }, [pbGlowKey]);

  useEffect(() => {
    if (!equipment || isSubscriptionLoading) return;
    let isCurrent = true;
    (async () => {
      try {
        const current = await fetchSession(id);
        if (current?.source === 'stretch') {
          router.replace({ pathname: '/stretches/play', params: { sessionId: id } });
          return;
        }
        const log = await loadSessionLog(id, equipment);
        if (!log) {
          if (isCurrent) setLoadState('not-found');
          return;
        }
        const exerciseIds = log.day.exercises.map((item) => item.exercise.id);
        const [historyBests, prefs] = await Promise.all([
          fetchExerciseBests(exerciseIds, id).catch(() => ({})),
          fetchExercisePrefs(exerciseIds).catch(() => ({ notes: {}, rest: {} })),
        ]);
        if (!isCurrent) return;
        setSession(log.session);
        const built = buildEntries(log.day, log.logged, log.previous, isPro, {
          weightScale: log.easeBack?.weightScale,
        });
        const ramped = applyRampUp(log.day, built, log.rampUpApplied);
        setDay(ramped.day);
        setCoachOpen(true);
        setPrevious(log.previous);
        setEaseBack(log.easeBack);
        setNotes(prefs.notes);
        setRestPrefs(prefs.rest);
        setEntries(ramped.entries);
        setBests(historyBests);
        setStartedAt(log.timerStartedAt);
        setWarmupStatus(log.warmupStatus);
        setCooldownStatus(log.cooldownStatus);
        setRampUpApplied(true);
        setLoadState('ready');
        if (!log.rampUpApplied) {
          await saveSessionPlan(
            id,
            sessionPlanFromDay(ramped.day, log.easeBack ?? undefined, log.timerStartedAt, {
              warmupStatus: log.warmupStatus,
              cooldownStatus: log.cooldownStatus,
              rampUpApplied: true,
            })
          );
        }

        if (log.session.routine_enrolment_id && log.session.routine_day_id) {
          const enrolment = await fetchActiveEnrolment();
          const nextRoutine = enrolment ? await fetchRoutine(enrolment.routine_id) : null;
          const planned =
            nextRoutine && log.session.routine_day_id
              ? findPlannedSession(nextRoutine, log.session.routine_day_id)
              : null;
          if (!isCurrent) return;
          setRoutine(nextRoutine);
          setWeekNumber(planned?.weekNumber ?? null);
        }
      } catch {
        if (isCurrent) setLoadState('error');
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [id, equipment, isPro, isSubscriptionLoading]);

  useEffect(() => {
    if (!day) return;
    publish({ sessionId: id, dayName: day.name, startedAt }, getNextSet(day, entries));
  }, [id, day, entries, startedAt, publish]);

  useEffect(() => {
    ensureRestTimerPermission().catch(() => {});
  }, []);

  async function persistPlan(
    nextDay: ProgrammeDay,
    timerAt: number | null = startedAt,
    extras?: { warmupStatus?: BlockPlayStatus; cooldownStatus?: BlockPlayStatus; rampUpApplied?: boolean }
  ) {
    await saveSessionPlan(
      id,
      sessionPlanFromDay(nextDay, easeBack ?? undefined, timerAt, {
        warmupStatus: extras?.warmupStatus ?? warmupStatus,
        cooldownStatus: extras?.cooldownStatus ?? cooldownStatus,
        rampUpApplied: extras?.rampUpApplied ?? rampUpApplied,
      })
    );
  }

  function startTimer() {
    if (startedAt !== null) return;
    const at = Date.now();
    setStartedAt(at);
    if (day) void persistPlan(day, at);
  }

  function updateEntry(key: string, change: Partial<SetEntry>) {
    setEntries((current) => ({ ...current, [key]: { ...current[key], ...change } }));
  }

  async function persistSet(item: ProgrammeExercise, setNumber: number, next: SetEntry) {
    const weighted = usesWeight(item.exercise.equipment);
    await saveSet({
      session_id: id,
      exercise_id: item.exercise.id,
      set_number: setNumber,
      weight_kg: weighted ? parseWeight(next.weight) : null,
      reps: parseReps(next.reps),
      completed: next.completed,
    });
  }

  function saveEdit(item: ProgrammeExercise, setNumber: number) {
    const next = entries[setKey(item.exercise.id, setNumber)];
    if (!next) return;
    persistSet(item, setNumber, next).catch(() =>
      showDialog('Couldn’t save that set', 'Check your connection and try again.')
    );
  }

  function toggleSet(item: ProgrammeExercise, setNumber: number) {
    const key = setKey(item.exercise.id, setNumber);
    const current = entries[key];
    if (!current) return;
    const completing = !current.completed;
    if (completing && usesWeight(item.exercise.equipment) && parseWeight(current.weight) === null) {
      showDialog('Add a weight first', 'Type the weight you used, then tick the set.');
      return;
    }
    if (completing) {
      startTimer();
      if (!isWarmupSetNumber(setNumber)) startRest(slotRestSeconds(item, restPrefs));
    } else stopRest();
    const next = { ...current, completed: completing };
    updateEntry(key, { completed: completing });
    if (completing && day) {
      const guessed = getSetRecords(
        day,
        { ...entries, [key]: next },
        bests
      )[key];
      if (guessed && guessed.length > 0) {
        setPbGlowKey(key);
        Vibration.vibrate(40);
      }
    }
    persistSet(item, setNumber, next).catch(() => {
      updateEntry(key, { completed: current.completed });
      showDialog('Couldn’t save that set', 'Check your connection and try again.');
    });
  }

  function openSwap(item: ProgrammeExercise) {
    setSwapItem((current) => (current?.position === item.position ? null : item));
  }

  async function handleSwap(exercise: SlotExercise, scope: SwapScope) {
    if (!swapItem || !day) return;
    const nextDay: ProgrammeDay = {
      ...day,
      exercises: day.exercises.map((item) =>
        item.position === swapItem.position
          ? { ...item, exercise, original: item.original ?? item.exercise }
          : item
      ),
    };
    setDay(nextDay);
    setSwapItem(null);
    const extra = previous[exercise.id]
      ? {}
      : await fetchPreviousSets([exercise.id], id).catch(() => ({}));
    if (Object.keys(extra).length > 0) {
      setPrevious((current) => ({ ...current, ...extra }));
    }
    const extraBests = bests[exercise.id]
      ? {}
      : await fetchExerciseBests([exercise.id], id).catch(() => ({}));
    if (Object.keys(extraBests).length > 0) {
      setBests((current) => ({ ...current, ...extraBests }));
    }
    const extraPrefs = notes[exercise.id] || restPrefs[exercise.id]
      ? { notes: {}, rest: {} }
      : await fetchExercisePrefs([exercise.id]).catch(() => ({ notes: {}, rest: {} }));
    if (Object.keys(extraPrefs.notes).length > 0) setNotes((current) => ({ ...current, ...extraPrefs.notes }));
    if (Object.keys(extraPrefs.rest).length > 0) setRestPrefs((current) => ({ ...current, ...extraPrefs.rest }));
    setEntries((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${swapItem.exercise.id}:`)) delete next[key];
      }
      const slot = nextDay.exercises.find((item) => item.position === swapItem.position);
      if (slot) {
        Object.assign(
          next,
          buildEntries({ ...nextDay, exercises: [slot] }, [], { ...previous, ...extra }, isPro, {
            weightScale: easeBack?.weightScale,
          })
        );
      }
      return next;
    });
    try {
      await persistPlan(nextDay);
      await saveSessionSwaps(id, swapIds(nextDay));
      if (scope === 'always' && !customWorkoutId) {
        await saveUserSwap(day.id, swapItem.position, exercise.id);
      }
      if (scope === 'always' && mutateCustom && customWorkoutId) {
        await replaceCustomWorkoutExercise(customWorkoutId, swapItem.position, exercise.id);
      }
    } catch {
      showDialog('Couldn’t save that swap', 'Check your connection and try again.');
    }
  }

  async function handleRestore() {
    if (!swapItem?.original || !day || !session) return;
    const original = swapItem.original;
    const nextDay: ProgrammeDay = {
      ...day,
      exercises: day.exercises.map((item) =>
        item.position === swapItem.position ? { ...item, exercise: original, original: undefined } : item
      ),
    };
    setDay(nextDay);
    setSwapItem(null);
    setEntries((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${swapItem.exercise.id}:`)) delete next[key];
      }
      const slot = nextDay.exercises.find((item) => item.position === swapItem.position);
      if (slot) {
        Object.assign(
          next,
          buildEntries({ ...nextDay, exercises: [slot] }, [], previous, isPro, {
            weightScale: easeBack?.weightScale,
          })
        );
      }
      return next;
    });
    try {
      await persistPlan(nextDay);
      await saveSessionSwaps(id, swapIds(nextDay));
      if (!customWorkoutId) await deleteUserSwap(day.id, swapItem.position);
    } catch {
      showDialog('Couldn’t restore that exercise', 'Check your connection and try again.');
    }
  }

  async function handleAddExercise(exercise: SlotExercise) {
    if (!day) return;
    if (day.exercises.some((item) => item.exercise.id === exercise.id)) {
      showDialog('Already in this session', `${exercise.name} is already in the list.`);
      return;
    }
    if (day.exercises.length >= MAX_WORKOUT_EXERCISES) {
      showDialog('That’s enough for today', `Keep it to ${MAX_WORKOUT_EXERCISES} exercises.`);
      return;
    }
    setIsAdding(true);
    try {
      let slot: ProgrammeExercise;
      if (mutateCustom && customWorkoutId) {
        slot = await appendCustomWorkoutExercise(customWorkoutId, exercise);
      } else {
        const position = Math.max(0, ...day.exercises.map((item) => item.position)) + 1;
        slot = {
          position,
          sets: DEFAULT_SLOT.sets,
          rep_min: DEFAULT_SLOT.rep_min,
          rep_max: DEFAULT_SLOT.rep_max,
          rest_seconds: restPrefs[exercise.id] ?? getDefaultRestSeconds(),
          exercise,
          added: true,
        };
      }
      const nextDay = { ...day, exercises: [...day.exercises, slot] };
      const [extra, extraBests, extraPrefs] = await Promise.all([
        fetchPreviousSets([exercise.id], id).catch(() => ({})),
        fetchExerciseBests([exercise.id], id).catch(() => ({})),
        fetchExercisePrefs([exercise.id]).catch(() => ({ notes: {}, rest: {} })),
      ]);
      setDay(nextDay);
      setPrevious((current) => ({ ...current, ...extra }));
      setBests((current) => ({ ...current, ...extraBests }));
      setNotes((current) => ({ ...current, ...extraPrefs.notes }));
      setRestPrefs((current) => ({ ...current, ...extraPrefs.rest }));
      setEntries((current) => ({
        ...current,
        ...buildEntries(
          { ...nextDay, exercises: [slot] },
          [],
          extra,
          isPro,
          { weightScale: easeBack?.weightScale }
        ),
      }));
      await persistPlan(nextDay);
      setPickerOpen(false);
    } catch (error) {
      showDialog(
        'Couldn’t add that exercise',
        error instanceof Error ? error.message : 'Check your connection and try again.'
      );
    } finally {
      setIsAdding(false);
    }
  }

  function updateSlot(position: number, change: Partial<ProgrammeExercise>) {
    if (!day) return;
    const nextDay: ProgrammeDay = {
      ...day,
      exercises: day.exercises.map((item) => (item.position === position ? { ...item, ...change } : item)),
    };
    const nextItem = nextDay.exercises.find((item) => item.position === position);
    setDay(nextDay);
    if (nextItem) {
      setEntries((current) => {
        const next = { ...current };
        const ids = new Set(allSetNumbers(nextItem).map((setNumber) => setKey(nextItem.exercise.id, setNumber)));
        for (const key of Object.keys(next)) {
          if (key.startsWith(`${nextItem.exercise.id}:`) && !ids.has(key)) delete next[key];
        }
        for (const setNumber of allSetNumbers(nextItem)) {
          const key = setKey(nextItem.exercise.id, setNumber);
          if (!next[key]) {
            const last = current[setKey(nextItem.exercise.id, setNumber - 1)] ??
              current[setKey(nextItem.exercise.id, 1)];
            next[key] = {
              weight: last?.weight ?? '',
              reps: last?.reps ?? String(nextItem.rep_min),
              completed: false,
            };
          }
        }
        return next;
      });
    }
    void persistPlan(nextDay);
  }

  function handleRemove(item: ProgrammeExercise) {
    showDialog(`Remove ${item.exercise.name}?`, loggerCopy.today_only_note, [
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          if (!day) return;
          const nextDay = {
            ...day,
            exercises: day.exercises.filter((slot) => slot.position !== item.position),
          };
          setDay(nextDay);
          setSwapItem((current) => (current?.position === item.position ? null : current));
          setEntries((current) => {
            const next = { ...current };
            for (const key of Object.keys(next)) {
              if (key.startsWith(`${item.exercise.id}:`)) delete next[key];
            }
            return next;
          });
          void persistPlan(nextDay);
        },
      },
      { text: 'Keep it', style: 'cancel' },
    ]);
  }

  function addSet(item: ProgrammeExercise) {
    if (item.sets >= MAX_SETS) return;
    updateSlot(item.position, { sets: item.sets + 1 });
  }

  function addWarmupSet(item: ProgrammeExercise) {
    const count = item.warmup_sets ?? 0;
    if (count >= 3) return;
    updateSlot(item.position, { warmup_sets: count + 1 });
  }

  function removeSet(item: ProgrammeExercise) {
    if (item.sets <= MIN_SETS) return;
    const lastKey = setKey(item.exercise.id, item.sets);
    if (entries[lastKey]?.completed) {
      showDialog('Remove that set?', 'It is already ticked. You can add it back if you change your mind.', [
        { text: 'Remove set', style: 'destructive', onPress: () => updateSlot(item.position, { sets: item.sets - 1 }) },
        { text: 'Keep it', style: 'cancel' },
      ]);
      return;
    }
    updateSlot(item.position, { sets: item.sets - 1 });
  }

  function moveExercise(position: number, direction: -1 | 1) {
    if (!day) return;
    const list = day.exercises.slice();
    const index = list.findIndex((item) => item.position === position);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return;
    const copy = list.slice();
    const [moved] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, moved);
    const nextDay = { ...day, exercises: copy.map((item, order) => ({ ...item, position: order + 1 })) };
    setDay(nextDay);
    void persistPlan(nextDay);
  }

  async function saveRestPref(item: ProgrammeExercise, seconds: number) {
    setRestPrefs((current) => ({ ...current, [item.exercise.id]: seconds }));
    updateSlot(item.position, { rest_seconds: seconds });
    setRestItem(null);
    try {
      await saveExerciseRestPref(item.exercise.id, seconds);
    } catch {
      showDialog('Couldn’t save rest time', 'Check your connection and try again.');
    }
  }

  async function saveNote() {
    if (!noteItem) return;
    const text = noteDraft.trim();
    const exerciseId = noteItem.exercise.id;
    setNotes((current) => {
      const next = { ...current };
      if (text) next[exerciseId] = text;
      else delete next[exerciseId];
      return next;
    });
    setNoteItem(null);
    try {
      await saveExerciseNote(exerciseId, text);
    } catch {
      showDialog('Couldn’t save that note', 'Check your connection and try again.');
    }
  }

  function saveRepTarget() {
    if (!repItem) return;
    const min = Number.parseInt(repMinText, 10);
    const max = Number.parseInt(repMaxText, 10);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      showDialog('Check the numbers', 'Enter a rep range, for example 8 to 12.');
      return;
    }
    const repMin = Math.min(MAX_REPS, Math.max(MIN_REPS, min));
    const repMax = Math.min(MAX_REPS, Math.max(repMin, max));
    updateSlot(repItem.position, { rep_min: repMin, rep_max: repMax });
    setRepItem(null);
  }

  async function applyDifferentDay(nextDay: RoutineDay) {
    if (!session?.routine_enrolment_id) return;
    closeMenu();
    const switchDay = async () => {
      try {
        await updateSessionRoutineDay(id, {
          routineDayId: nextDay.id,
          sourceProgrammeDayId: nextDay.source_programme_day_id,
        });
        const programmeDay = {
          id: nextDay.id,
          day_number: nextDay.day_number,
          name: nextDay.name,
          exercises: nextDay.exercises.map((item) => ({
            position: item.position,
            sets: item.sets,
            rep_min: item.rep_min,
            rep_max: item.rep_max,
            rest_seconds: item.rest_seconds,
            exercise: item.exercise,
          })),
        };
        const logged = await fetchSessionSets(id);
        const exerciseIds = programmeDay.exercises.map((item) => item.exercise.id);
        const [prev, nextBests, prefs] = await Promise.all([
          fetchPreviousSets(exerciseIds, id),
          fetchExerciseBests(exerciseIds, id).catch(() => ({})),
          fetchExercisePrefs(exerciseIds).catch(() => ({ notes: {}, rest: {} })),
        ]);
        await saveSessionPlan(id, sessionPlanFromDay(programmeDay, easeBack ?? undefined, startedAt));
        await saveSessionSwaps(id, {});
        setSession((current) =>
          current
            ? {
                ...current,
                routine_day_id: nextDay.id,
                programme_day_id: nextDay.source_programme_day_id,
                exercise_swaps: {},
              }
            : current
        );
        setDay(programmeDay);
        setPrevious(prev);
        setBests(nextBests);
        setNotes(prefs.notes);
        setRestPrefs(prefs.rest);
        setEntries(
          buildEntries(programmeDay, logged, prev, isPro, { weightScale: easeBack?.weightScale })
        );
        setSwapItem(null);
      } catch (error) {
        showDialog(
          'Couldn’t switch day',
          error instanceof Error ? error.message : 'Check your connection and try again.'
        );
      }
    };
    if (doneSets > 0) {
      showDialog(
        `Switch to ${nextDay.name}?`,
        'Ticked sets stay logged. The list will match the new day.',
        [
          { text: 'Switch day', onPress: () => void switchDay() },
          { text: 'Stay', style: 'cancel' },
        ]
      );
      return;
    }
    await switchDay();
  }

  async function handleSaveWorkout() {
    if (!routine || !day || day.exercises.length === 0) return;
    if (routine.is_pro && !isPro) {
      openPaywall('routine');
      return;
    }
    setIsSavingWorkout(true);
    try {
      const copy = await duplicateRoutineDay(
        routine,
        {
          name: day.name,
          exercises: day.exercises.map((item) => ({
            exercise: item.exercise,
            sets: item.sets,
            rep_min: item.rep_min,
            rep_max: item.rep_max,
          })),
        },
        isPro,
        copyWorkoutName(day.name)
      );
      showDialog('Saved to My workouts', `${copy.name} is in your list.`, [
        {
          text: 'Open it',
          onPress: () => router.push({ pathname: '/workouts/[id]', params: { id: copy.id } }),
        },
        { text: 'Done', style: 'cancel' },
      ]);
    } catch (error) {
      if (isProRoutineDuplicateError(error)) {
        openPaywall('routine');
        return;
      }
      if (isFreeCustomWorkoutLimitError(error)) {
        openPaywall('custom-limit');
        return;
      }
      showDialog('Couldn’t save it', describeCustomWorkoutError(error));
    } finally {
      setIsSavingWorkout(false);
    }
  }

  async function finish() {
    if (!day || isFinishing || doneSets === 0) return;
    setIsFinishing(true);
    try {
      const durationSeconds =
        startedAt === null ? undefined : Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      await finishSession(id, durationSeconds);
      if (session?.date) await markPlannerDateDone(session.date).catch(() => {});
      await clearSessionPlan(id).catch(() => {});
      await fillBlockTargetsFromSession(id).catch(() => {});
      const enrolmentId = session?.routine_enrolment_id;
      const checkpointLines =
        enrolmentId && day
          ? await recordCheckpointIfNeeded(enrolmentId, day.id).catch(() => [])
          : [];
      const finishedRoutine = enrolmentId
        ? await maybeCompleteEnrolment(enrolmentId).catch(() => false)
        : false;
      const ticked: Record<string, { weightKg: number | null; reps: number }[]> = {};
      for (const item of day.exercises) {
        ticked[item.exercise.id] = allSetNumbers(item)
          .filter((setNumber) => !isWarmupSetNumber(setNumber))
          .map((setNumber) => entries[setKey(item.exercise.id, setNumber)])
          .filter((entry): entry is SetEntry => Boolean(entry?.completed))
          .map((entry) => ({
            weightKg: usesWeight(item.exercise.equipment) ? parseWeight(entry.weight) : null,
            reps: parseReps(entry.reps) ?? 0,
          }));
      }
      const wins = collectSessionWins({
        exercises: day.exercises.map((item) => item.exercise),
        ticked,
        previous,
        bests,
      });
      if (checkpointLines.length > 0) wins.unshift(...checkpointLines.slice(0, 2));
      if (finishedRoutine) wins.unshift('You finished the routine.');
      const welcomeBackDone = await consumeWelcomeBackSession(id);
      if (welcomeBackDone) {
        await recordWelcomeBackCompleted(session?.date ?? new Date().toISOString().slice(0, 10));
        wins.unshift('Back on track');
      }
      end();
      if (finishedRoutine && enrolmentId) {
        router.replace({ pathname: '/routines/complete', params: { enrolmentId } } as Href);
        return;
      }
      router.back();
      const trained =
        durationSeconds === undefined ? '' : `You trained for ${formatDuration(durationSeconds)}.`;
      const body =
        [...wins.slice(0, 3), trained].filter(Boolean).join('\n') ||
        'Nice work. That’s another one done.';
      showDialog('Session saved', body);
      void maybeAskSessionReminders();
      void syncPlannerReminders();
    } catch {
      setIsFinishing(false);
      showDialog('Couldn’t finish the session', 'Check your connection and try again.');
    }
  }

  function confirmFinish() {
    if (doneSets === 0) return;
    if (doneSets < totalSets) {
      showDialog(
        loggerCopy.finish_confirm_title,
        fillCopy(loggerCopy.finish_confirm_body_unticked, { count: totalSets - doneSets }),
        [
          { text: loggerCopy.finish_confirm_no, style: 'cancel' },
          { text: loggerCopy.finish_confirm_yes, onPress: () => void finish() },
        ]
      );
      return;
    }
    void finish();
  }

  async function discard() {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      await discardSession(id);
      await clearSessionPlan(id);
      if (customWorkoutId && customWorkoutId !== STARTER_WORKOUT_ID && day?.exercises.length === 0) {
        await deleteCustomWorkout(customWorkoutId).catch(() => {});
      }
      end();
      router.back();
    } catch {
      setIsFinishing(false);
      showDialog('Couldn’t discard the session', 'Check your connection and try again.');
    }
  }

  function confirmDiscard() {
    showDialog('Discard this session?', 'Ticked sets from today will be deleted. Your history stays.', [
      { text: 'Discard', style: 'destructive', onPress: () => void discard() },
      { text: 'Keep it', style: 'cancel' },
    ]);
  }

  function confirmEndSession() {
    if (doneSets > 0) {
      confirmDiscard();
      return;
    }
    void discard();
  }

  function minimise() {
    router.back();
  }

  function openMenu() {
    measureAnchor(menuRef.current, (rect) => {
      setMenuAnchor(rect);
      setMenuMode('actions');
      setMenuOpen(true);
    });
  }

  function closeMenu() {
    setMenuOpen(false);
    setMenuMode('actions');
  }

  function openSlotMenu(item: ProgrammeExercise, anchor: AnchorRect) {
    setSlotMenuItem(item);
    setSlotMenuAnchor(anchor);
  }

  function openGuide(exerciseId: string) {
    router.push({ pathname: '/exercise/[id]', params: { id: exerciseId } });
  }

  if (loadState !== 'ready' || !day || !session) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
            {loadState === 'not-found'
              ? 'This session isn’t here any more.'
              : 'We couldn’t load this session. Go back and try again.'}
          </AppText>
        )}
      </View>
    );
  }

  const restRemaining = restEndsAt === null ? 0 : Math.ceil((restEndsAt - now) / 1000);
  const records = getSetRecords(day, entries, bests);
  const showGuideTip = day.exercises.some((item) => !previous[item.exercise.id]?.length);
  const saveLabel =
    routine?.is_pro && !isPro && !isSavingWorkout
      ? 'Save as workout with Pro'
      : isSavingWorkout
        ? 'Saving…'
        : 'Save as workout';
  const elapsedLabel = startedAt === null ? '0:00' : formatClock((now - startedAt) / 1000);
  const eyebrow =
    weekNumber !== null ? `Week ${weekNumber} · day ${day.day_number}` : null;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colours.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />

      <View style={[styles.top, { paddingTop: insets.top + 4, backgroundColor: colours.bg, borderBottomColor: colours.border }]}>
        <View style={styles.headerRow}>
          <IconButton
            icon="chevron-down"
            variant="muted"
            accessibilityLabel={loggerCopy.minimise_a11y}
            onPress={minimise}
          />
          <AppText variant="title3" style={[styles.flex, { color: colours.ink, textAlign: 'center' }]} numberOfLines={1}>
            {day.name}
          </AppText>
          <View ref={menuRef} collapsable={false}>
            <IconButton
              icon="ellipsis-horizontal"
              variant="muted"
              accessibilityLabel="Session options"
              onPress={openMenu}
            />
          </View>
        </View>
        <View style={styles.headerRow}>
          <AppText variant="bodySm" style={{ color: colours.inkMuted, fontVariant: ['tabular-nums'] }}>
            {elapsedLabel}
          </AppText>
          <View style={styles.flex} />
          <PrimaryButton
            label={loggerCopy.finish}
            onPress={confirmFinish}
            loading={isFinishing}
            disabled={isFinishing || doneSets === 0}
            size="compact"
          />
        </View>
        {eyebrow ? (
          <AppText variant="eyebrow" style={{ color: colours.accent, marginTop: 6 }}>
            {eyebrow}
          </AppText>
        ) : null}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <AppText variant="caption" style={{ color: colours.inkMuted }}>
              {loggerCopy.stats.duration}
            </AppText>
            <AppText variant="title3" style={{ color: colours.ink, fontVariant: ['tabular-nums'] }}>
              {elapsedLabel}
            </AppText>
          </View>
          <View style={styles.stat}>
            <AppText variant="caption" style={{ color: colours.inkMuted }}>
              {loggerCopy.stats.volume}
            </AppText>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {formatKg(volumeKg)}
            </AppText>
          </View>
          <View style={styles.stat}>
            <AppText variant="caption" style={{ color: colours.inkMuted }}>
              {loggerCopy.stats.sets}
            </AppText>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {doneSets} / {totalSets}
            </AppText>
          </View>
        </View>
        {startedAt === null ? (
          <View style={styles.timerHint}>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, flex: 1 }}>
              {loggerCopy.timer_hint}
            </AppText>
            <TextButton label={loggerCopy.start_timer} onPress={startTimer} />
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {showGuideTip ? (
          <View style={[styles.tip, { backgroundColor: colours.brandSoft, borderRadius: radius.lg }]}>
            <Ionicons name="information-circle-outline" size={20} color={colours.brand} />
            <AppText variant="bodySm" style={{ color: colours.ink, flex: 1 }}>
              {loggerCopy.first_time_link}
            </AppText>
          </View>
        ) : null}

        {day.coach_note || day.finisher ? (
          <View style={[{ backgroundColor: colours.surface, borderRadius: radius.lg, padding: 14 }]}>
            <Pressable
              onPress={() => setCoachOpen((open) => !open)}
              style={styles.cardHeader}
              accessibilityRole="button"
              accessibilityLabel={coachOpen ? 'Hide session notes' : 'Show session notes'}>
              <View style={styles.flex}>
                <AppText variant="eyebrow" style={{ color: colours.accent }}>Today</AppText>
                <AppText variant="title3" style={{ color: colours.ink, marginTop: 4 }}>
                  {day.focus ?? day.name}
                </AppText>
              </View>
              <Ionicons name={coachOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colours.brand} />
            </Pressable>
            {coachOpen ? (
              <View style={{ gap: 10, marginTop: 8 }}>
                {day.coach_note ? (
                  <AppText variant="body" style={{ color: colours.ink }}>{day.coach_note}</AppText>
                ) : null}
                {day.finisher ? (
                  <AppText variant="bodySm" style={{ color: colours.inkMuted }}>{day.finisher}</AppText>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {warmupBlock ? (
          <SessionBlockCard
            block={warmupBlock}
            status={warmupStatus}
            onStart={() => setPlayingBlock(warmupBlock)}
            onSkip={() => {
              setWarmupStatus('skipped');
              if (day) void persistPlan(day, startedAt, { warmupStatus: 'skipped' });
            }}
          />
        ) : null}

        {day.exercises.length === 0 ? (
          <EmptyState
            icon="barbell-outline"
            title="No exercises yet"
            body="Add your first exercise when you’re ready. This session is yours to build as you go."
          />
        ) : null}

        {reorderMode ? (
          <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
            Use the arrows to move a lift. Changes apply to today only.
          </AppText>
        ) : null}

        {day.exercises.map((item, index) => {
          const weighted = usesWeight(item.exercise.equipment);
          const suggestion =
            isPro && !easeBack ? getWeightSuggestion(item, previous[item.exercise.id]) : null;
          const increase = suggestion?.kind === 'increase' ? suggestion : null;
          const restSeconds = slotRestSeconds(item, restPrefs);
          const note = notes[item.exercise.id];
          const firstTime = !previous[item.exercise.id]?.length;
          return (
            <View
              key={item.position}
              style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
              <Pressable
                onLongPress={() => setReorderMode(true)}
                delayLongPress={280}
                style={styles.cardHeader}>
                <Pressable
                  onPress={() => openGuide(item.exercise.id)}
                  style={({ pressed }) => [styles.exerciseHeader, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityHint="Shows how to do this exercise">
                  <ExerciseThumb exercise={item.exercise} size={40} showPlay />
                  <View style={styles.flex}>
                    {roleLabel(item.role) ? (
                      <AppText variant="eyebrow" style={{ color: colours.accent, marginBottom: 4 }}>
                        {roleLabel(item.role)}
                      </AppText>
                    ) : null}
                    <AppText variant="title3" style={{ color: colours.brand }} numberOfLines={2}>
                      {item.exercise.name}
                    </AppText>
                    {item.original && equipment && exerciseFits(item.original, equipment) ? (
                      <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }}>
                        Instead of {item.original.name}
                      </AppText>
                    ) : null}
                    {note ? (
                      <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }} numberOfLines={2}>
                        {note}
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
                {reorderMode ? (
                  <View style={styles.reorderBtns}>
                    <IconButton
                      icon="chevron-up"
                      variant="muted"
                      accessibilityLabel={`Move ${item.exercise.name} up`}
                      onPress={() => moveExercise(item.position, -1)}
                      disabled={index === 0}
                    />
                    <IconButton
                      icon="chevron-down"
                      variant="muted"
                      accessibilityLabel={`Move ${item.exercise.name} down`}
                      onPress={() => moveExercise(item.position, 1)}
                      disabled={index === day.exercises.length - 1}
                    />
                  </View>
                ) : (
                  <SlotMenuButton name={item.exercise.name} onOpen={(anchor) => openSlotMenu(item, anchor)} />
                )}
              </Pressable>

              {reorderMode ? null : (
                <>
                  <View style={styles.chipRow}>
                    <RestChip
                      label={fillCopy(loggerCopy.rest_chip, { time: formatRestChipTime(restSeconds) })}
                      onPress={() => setRestItem(item)}
                    />
                    <NoteChip
                      label={loggerCopy.note_chip}
                      filled={Boolean(note)}
                      onPress={() => {
                        setNoteDraft(note ?? '');
                        setNoteItem(item);
                      }}
                    />
                  </View>
                  <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
                    {formatTargetLine(item)}
                  </AppText>
                  {item.tempo ? (
                    <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }}>
                      {item.tempo}
                    </AppText>
                  ) : null}
                  {firstTime ? (
                    <Pressable onPress={() => openGuide(item.exercise.id)} hitSlop={6}>
                      <AppText variant="bodySm" style={{ color: colours.brand, marginTop: 4 }}>
                        {loggerCopy.first_time_link}
                      </AppText>
                    </Pressable>
                  ) : null}

                  {equipment ? (
                    <SwapSheet
                      open={swapItem?.position === item.position}
                      item={item}
                      equipment={equipment}
                      excludeIds={day.exercises.flatMap((slot) =>
                        slot.original ? [slot.exercise.id, slot.original.id] : [slot.exercise.id]
                      )}
                      onClose={() => setSwapItem(null)}
                      onSwap={handleSwap}
                      onRestore={handleRestore}
                      allowAlways={customWorkoutId !== STARTER_WORKOUT_ID}
                      alwaysDetail={
                        customWorkoutId ? 'Replaces it in this workout' : 'Replaces it in your programme'
                      }
                    />
                  ) : null}

                  <SetTableHeader weightUnit={weightUnit} />
                  {allSetNumbers(item).map((setNumber) => {
                    const key = setKey(item.exercise.id, setNumber);
                    const entry = entries[key];
                    if (!entry) return null;
                    const setRecords = records[key];
                    const placeholders = lastSetPlaceholders(previous[item.exercise.id], setNumber, weighted);
                    const workingIndex = allSetNumbers(item).filter((n) => !isWarmupSetNumber(n))[0];
                    const chip =
                      setNumber === workingIndex && increase
                        ? fillCopy(loggerCopy.suggested_chip, { weight: formatKg(increase.kg) })
                        : undefined;
                    const previousSet = (previous[item.exercise.id] ?? []).find(
                      (set) => set.set_number === setNumber
                    ) ?? (isWarmupSetNumber(setNumber) ? undefined : (previous[item.exercise.id] ?? [])[setNumber - 1]);
                    return (
                      <SetRow
                        key={key}
                        setNumber={setNumber}
                        warmup={isWarmupSetNumber(setNumber)}
                        previousLabel={formatPreviousSet(previousSet, weighted)}
                        kg={entry.weight}
                        reps={entry.reps}
                        completed={entry.completed}
                        weighted={weighted}
                        weightLabel={item.exercise.equipment === 'band' ? 'Band' : 'Bodyweight'}
                        kgPlaceholder={placeholders.kg}
                        weightUnit={weightUnit}
                        repsPlaceholder={placeholders.reps}
                        suggestedLabel={chip}
                        recordLabel={
                          setRecords ? setRecords.map((kind) => RECORD_LABELS[kind]).join(', ') : undefined
                        }
                        pbGlow={pbGlowKey === key}
                        onToggle={() => toggleSet(item, setNumber)}
                        onChangeKg={(text) => updateEntry(key, { weight: text })}
                        onChangeReps={(text) => updateEntry(key, { reps: text })}
                        onEndKg={() => saveEdit(item, setNumber)}
                        onEndReps={() => saveEdit(item, setNumber)}
                        onSuggest={
                          increase
                            ? () => updateEntry(key, { weight: formatWeightInput(increase.kg) })
                            : undefined
                        }
                        onRecord={setRecords ? () => showRecords(setRecords) : undefined}
                        style={{ marginTop: spacing.sm }}
                      />
                    );
                  })}
                  <TextButton
                    label={loggerCopy.add_set}
                    onPress={() => addSet(item)}
                    onLongPress={() => addWarmupSet(item)}
                    style={[styles.addSet, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}
                  />
                </>
              )}
            </View>
          );
        })}

        {cooldownBlock ? (
          <SessionBlockCard
            block={cooldownBlock}
            status={cooldownStatus}
            onStart={() => setPlayingBlock(cooldownBlock)}
            onSkip={() => {
              setCooldownStatus('skipped');
              if (day) void persistPlan(day, startedAt, { cooldownStatus: 'skipped' });
            }}
          />
        ) : null}

        {reorderMode ? (
          <PrimaryButton label="Done" onPress={() => setReorderMode(false)} />
        ) : (
          <PrimaryButton
            label={isAdding ? 'Adding…' : loggerCopy.add_exercise}
            onPress={() => setPickerOpen(true)}
            disabled={isAdding || isFinishing || day.exercises.length >= MAX_WORKOUT_EXERCISES}
            loading={isAdding}
          />
        )}
        {doneSets > 0 ? (
          <DestructiveTextButton label="Discard" onPress={confirmDiscard} disabled={isFinishing} />
        ) : null}
      </ScrollView>

      {restEndsAt !== null ? (
        <RestTimerBar
          label={formatClock(restRemaining)}
          caption={fillCopy(loggerCopy.rest_bar, { time: formatClock(restRemaining) }).split(' · ')[0]}
          plusLabel={loggerCopy.rest_add15}
          skipLabel={loggerCopy.rest_skip}
          onMinus={() => adjustRest(-REST_ADJUST_SECONDS)}
          onPlus={() => adjustRest(REST_ADJUST_SECONDS)}
          onSkip={stopRest}
        />
      ) : null}

      {playingBlock ? (
        <HoldPlayer
          title={
            playingBlock.kind === 'warmup'
              ? fillCopy(loggerCopy.warmup_block, { minutes: playingBlock.estimatedMinutes })
              : fillCopy(loggerCopy.cooldown_block, { minutes: playingBlock.estimatedMinutes })
          }
          steps={playStepsFromBlock(playingBlock)}
          onClose={() => setPlayingBlock(null)}
          onComplete={() => {
            const kind = playingBlock.kind;
            setPlayingBlock(null);
            if (kind === 'warmup') {
              setWarmupStatus('done');
              if (day) void persistPlan(day, startedAt, { warmupStatus: 'done' });
            } else {
              setCooldownStatus('done');
              if (day) void persistPlan(day, startedAt, { cooldownStatus: 'done' });
            }
          }}
        />
      ) : null}

      <ExercisePicker
        open={pickerOpen}
        takenIds={day.exercises.map((item) => item.exercise.id)}
        onClose={() => setPickerOpen(false)}
        onChoose={handleAddExercise}
      />

      <OverflowMenu visible={menuOpen} anchor={menuAnchor} onClose={closeMenu}>
        {menuMode === 'days' ? (
          <>
            <MenuHeader label={loggerCopy.different_day_title} detail={loggerCopy.different_day_body} />
            {weekDays.map((option) => (
              <MenuRow
                key={option.id}
                label={`Day ${option.day_number}: ${option.name}`}
                onPress={() => void applyDifferentDay(option)}
              />
            ))}
          </>
        ) : (
          <>
            <MenuHeader label={day.name} detail={loggerCopy.today_only_note} />
            {weekDays.length > 1 ? (
              <MenuRow
                label={loggerCopy.header_menu.different_day}
                onPress={() => setMenuMode('days')}
              />
            ) : null}
            <MenuRow
              label={loggerCopy.header_menu.reorder}
              onPress={() => {
                closeMenu();
                setReorderMode(true);
              }}
            />
            {routine ? (
              <MenuRow
                label={saveLabel}
                onPress={() => {
                  closeMenu();
                  void handleSaveWorkout();
                }}
              />
            ) : null}
            <MenuRow
              label={loggerCopy.header_menu.end}
              danger
              onPress={() => {
                closeMenu();
                confirmEndSession();
              }}
            />
          </>
        )}
      </OverflowMenu>

      <OverflowMenu
        visible={slotMenuItem !== null}
        anchor={slotMenuAnchor}
        onClose={() => setSlotMenuItem(null)}>
        {slotMenuItem ? (
          <>
            <MenuHeader label={slotMenuItem.exercise.name} detail={loggerCopy.today_only_note} />
            <MenuRow
              label={loggerCopy.exercise_menu.guide}
              onPress={() => {
                const item = slotMenuItem;
                setSlotMenuItem(null);
                openGuide(item.exercise.id);
              }}
            />
            <MenuRow
              label={loggerCopy.exercise_menu.swap}
              onPress={() => {
                const item = slotMenuItem;
                setSlotMenuItem(null);
                openSwap(item);
              }}
            />
            <MenuRow
              label={loggerCopy.exercise_menu.remove}
              danger
              onPress={() => {
                const item = slotMenuItem;
                setSlotMenuItem(null);
                handleRemove(item);
              }}
            />
            <MenuRow
              label={loggerCopy.exercise_menu.add_set}
              onPress={() => {
                addSet(slotMenuItem);
                setSlotMenuItem(null);
              }}
            />
            <MenuRow
              label={loggerCopy.exercise_menu.remove_set}
              onPress={() => {
                removeSet(slotMenuItem);
                setSlotMenuItem(null);
              }}
            />
            <MenuRow
              label={loggerCopy.exercise_menu.rep_target}
              onPress={() => {
                const item = slotMenuItem;
                setSlotMenuItem(null);
                setRepMinText(String(item.rep_min));
                setRepMaxText(String(item.rep_max));
                setRepItem(item);
              }}
            />
          </>
        ) : null}
      </OverflowMenu>

      <Modal visible={restItem !== null} transparent animationType="fade" onRequestClose={() => setRestItem(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setRestItem(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colours.surface, borderRadius: radius.lg }, shadow]}
            onPress={() => {}}>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {loggerCopy.rest_sheet_title}
            </AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 6 }}>
              {loggerCopy.rest_sheet_note}
            </AppText>
            <View style={styles.restChoices}>
              {EXERCISE_REST_OPTIONS.map((seconds) => {
                const selected = restItem ? slotRestSeconds(restItem, restPrefs) === seconds : false;
                return (
                  <Pressable
                    key={seconds}
                    onPress={() => restItem && void saveRestPref(restItem, seconds)}
                    style={[
                      styles.restChoice,
                      {
                        backgroundColor: selected ? colours.brandSoft : colours.surfaceMuted,
                        borderRadius: radius.md,
                      },
                    ]}>
                    <AppText variant="bodyStrong" style={{ color: selected ? colours.brand : colours.ink }}>
                      {formatRestChipTime(seconds)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={noteItem !== null} transparent animationType="fade" onRequestClose={() => setNoteItem(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setNoteItem(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colours.surface, borderRadius: radius.lg }, shadow]}
            onPress={() => {}}>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {noteItem ? noteItem.exercise.name : loggerCopy.note_chip}
            </AppText>
            <TextInput
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder={loggerCopy.note_placeholder}
              placeholderTextColor={colours.inkSubtle}
              multiline
              style={[
                styles.noteInput,
                {
                  color: colours.ink,
                  borderColor: colours.border,
                  backgroundColor: colours.surfaceMuted,
                  borderRadius: radius.md,
                },
              ]}
            />
            <PrimaryButton label="Save" onPress={() => void saveNote()} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={repItem !== null} transparent animationType="fade" onRequestClose={() => setRepItem(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setRepItem(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colours.surface, borderRadius: radius.lg }, shadow]}
            onPress={() => {}}>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {loggerCopy.exercise_menu.rep_target}
            </AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 6 }}>
              {loggerCopy.today_only_note}
            </AppText>
            <View style={styles.repRow}>
              <TextInput
                value={repMinText}
                onChangeText={setRepMinText}
                keyboardType="number-pad"
                accessibilityLabel="Minimum reps"
                style={[
                  styles.repField,
                  {
                    color: colours.ink,
                    borderColor: colours.border,
                    backgroundColor: colours.surfaceMuted,
                    borderRadius: radius.md,
                  },
                ]}
              />
              <AppText variant="body" style={{ color: colours.inkMuted }}>to</AppText>
              <TextInput
                value={repMaxText}
                onChangeText={setRepMaxText}
                keyboardType="number-pad"
                accessibilityLabel="Maximum reps"
                style={[
                  styles.repField,
                  {
                    color: colours.ink,
                    borderColor: colours.border,
                    backgroundColor: colours.surfaceMuted,
                    borderRadius: radius.md,
                  },
                ]}
              />
            </View>
            <PrimaryButton label="Save" onPress={saveRepTarget} />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  top: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  timerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  card: {
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  exerciseHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  addSet: {
    marginTop: 8,
  },
  reorderBtns: {
    flexDirection: 'row',
    gap: 4,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.8,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(44, 24, 16, 0.4)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    padding: 20,
    gap: 12,
  },
  restChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  restChoice: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noteInput: {
    minHeight: 96,
    borderWidth: 1,
    padding: 12,
    textAlignVertical: 'top',
  },
  repRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  repField: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    textAlign: 'center',
  },
});
