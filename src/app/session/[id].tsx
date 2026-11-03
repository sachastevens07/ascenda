import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams, useNavigation, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { ExercisePicker } from '@/components/ExercisePicker';
import { SwapSheet } from '@/components/SwapSheet';
import {
  EmptyState,
  IconButton,
  MenuHeader,
  MenuRow,
  OverflowMenu,
  PrimaryButton,
  ProgressBar,
  RestTimerBar,
  SecondaryButton,
  SetRow,
  TextButton,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { collectSessionWins } from '@/lib/activityStats';
import { fillBlockTargetsFromSession } from '@/lib/blocks';
import { recordCheckpointIfNeeded } from '@/lib/checkpoints';
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
import { getExerciseImageSource } from '@/lib/exerciseMedia';
import { EQUIPMENT_LABELS, type Equipment } from '@/lib/exercises';
import { openPaywall } from '@/lib/paywall';
import { markPlannerDateDone } from '@/lib/planner';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import {
  formatKg,
  getWeightSuggestion,
  usesWeight,
  type ProgrammeDay,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';
import { fetchExerciseBests, type ExerciseBests } from '@/lib/progress';
import {
  DEFAULT_REST_SECONDS,
  REST_ADJUST_SECONDS,
  ensureRestTimerPermission,
} from '@/lib/restTimer';
import {
  daysInWeek,
  fetchActiveEnrolment,
  fetchRoutine,
  findPlannedSession,
  formatRestSeconds,
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
  markSessionStarted,
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
  buildEntries,
  clearSessionPlan,
  formatClock,
  formatDuration,
  formatWeightInput,
  getNextSet,
  getSetRecords,
  loadSessionLog,
  parseReps,
  parseWeight,
  saveSessionPlan,
  sessionPlanFromDay,
  setKey,
  setNumbers,
  type RecordKind,
  type SetEntry,
} from '@/lib/workoutLog';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';
type MenuMode = 'actions' | 'days';
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type BeforeRemoveEvent = {
  preventDefault: () => void;
  data: { action: object };
};
type StackNavigation = {
  addListener: (event: 'beforeRemove', callback: (event: BeforeRemoveEvent) => void) => () => void;
  dispatch: (action: object) => void;
};

function showRecords(kinds: RecordKind[]) {
  showDialog(
    kinds.length === 1 ? 'New personal best' : 'New personal bests',
    kinds.map((kind) => RECORD_LABELS[kind]).join('\n')
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function slotRestSeconds(item: ProgrammeExercise): number {
  return item.rest_seconds && item.rest_seconds > 0 ? item.rest_seconds : DEFAULT_REST_SECONDS;
}

function formatTargetLine(item: ProgrammeExercise): string {
  const reps =
    item.rep_min === item.rep_max ? `${item.rep_min}` : `${item.rep_min} to ${item.rep_max}`;
  return `${item.sets} × ${reps} · ${formatRestSeconds(slotRestSeconds(item))}`;
}

function lastSetPlaceholders(
  sets: LoggedSet[] | undefined,
  setNumber: number,
  weighted: boolean
): { kg?: string; reps?: string } {
  if (!sets || sets.length === 0) return {};
  const last = sets.find((set) => set.set_number === setNumber) ?? sets[sets.length - 1];
  return {
    kg: weighted && last.weight_kg !== null ? String(Number(last.weight_kg.toFixed(2))) : undefined,
    reps: last.reps !== null ? String(last.reps) : undefined,
  };
}

function equipmentIcon(equipment: Equipment): IoniconName {
  switch (equipment) {
    case 'barbell':
      return 'barbell-outline';
    case 'dumbbell':
      return 'barbell-outline';
    case 'machine':
      return 'cog-outline';
    case 'cable':
      return 'git-network-outline';
    case 'kettlebell':
      return 'fitness-outline';
    case 'band':
      return 'resize-outline';
    case 'bodyweight':
      return 'body-outline';
  }
}

function ExerciseThumb({ item }: { item: ProgrammeExercise }) {
  const { colours, radius } = useTheme();
  const photo = getExerciseImageSource(item.exercise);
  return (
    <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
      {photo ? (
        <Image source={photo} style={styles.photoFill} resizeMode="cover" />
      ) : (
        <Ionicons
          name={equipmentIcon(item.exercise.equipment)}
          size={22}
          color={colours.brand}
          accessibilityLabel={EQUIPMENT_LABELS[item.exercise.equipment]}
        />
      )}
      {photo ? (
        <View style={[styles.play, { backgroundColor: colours.overlay, borderRadius: radius.full }]}>
          <Ionicons name="play" size={12} color={colours.onAccent} />
        </View>
      ) : null}
    </View>
  );
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

function Stepper({
  label,
  display,
  onMinus,
  onPlus,
}: {
  label: string;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const { colours, type, radius } = useTheme();
  return (
    <View style={styles.stepper}>
      <Text style={[type.caption, { color: colours.inkMuted, marginBottom: 6 }]}>{label}</Text>
      <View style={[styles.stepperControls, { backgroundColor: colours.bg, borderRadius: radius.full }]}>
        <Pressable
          onPress={onMinus}
          style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Fewer ${label.toLowerCase()}`}>
          <Text style={[type.title2, { color: colours.brand }]}>−</Text>
        </Pressable>
        <Text style={[type.body, { color: colours.ink, fontWeight: '700' }]}>{display}</Text>
        <Pressable
          onPress={onPlus}
          style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`More ${label.toLowerCase()}`}>
          <Text style={[type.title2, { color: colours.brand }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation() as unknown as StackNavigation;
  const insets = useSafeAreaInsets();
  const { colours, type, spacing, radius, shadow } = useTheme();
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
  const [editSlot, setEditSlot] = useState<ProgrammeExercise | null>(null);
  const menuRef = useRef<AnchorHandle>(null);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMode, setMenuMode] = useState<MenuMode>('actions');
  const [slotMenuItem, setSlotMenuItem] = useState<ProgrammeExercise | null>(null);
  const [slotMenuAnchor, setSlotMenuAnchor] = useState<AnchorRect | null>(null);

  const workout = useWorkout();
  const { restEndsAt } = workout;
  const now = useNow(startedAt !== null, 500);
  const keepSessionRef = useRef(false);
  const leavingRef = useRef(false);
  const doneSetsRef = useRef(0);
  const emptyDayRef = useRef(true);
  const customWorkoutIdRef = useRef<string | null>(null);

  const customWorkoutId = session?.custom_workout_id ?? null;
  customWorkoutIdRef.current = customWorkoutId;

  const totalSets = day ? day.exercises.reduce((sum, item) => sum + item.sets, 0) : 0;
  const doneSets = Object.values(entries).filter((entry) => entry.completed).length;
  doneSetsRef.current = doneSets;
  emptyDayRef.current = (day?.exercises.length ?? 0) === 0;

  const weekDays = useMemo(
    () => (routine && weekNumber !== null ? daysInWeek(routine, weekNumber) : []),
    [routine, weekNumber]
  );

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
        const historyBests = await fetchExerciseBests(exerciseIds, id).catch(() => ({}));
        if (!isCurrent) return;
        setSession(log.session);
        setDay(log.day);
        setPrevious(log.previous);
        setEntries(buildEntries(log.day, log.logged, log.previous, isPro));
        setBests(historyBests);
        const hasTicks = log.logged.some((set) => set.completed);
        setStartedAt(hasTicks ? new Date(log.session.started_at).getTime() : null);
        setLoadState('ready');

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
    if (!day || startedAt === null) return;
    workout.publish({ sessionId: id, dayName: day.name, startedAt }, getNextSet(day, entries));
  }, [id, day, entries, startedAt, workout]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (keepSessionRef.current || leavingRef.current || doneSetsRef.current > 0) return;
      event.preventDefault();
      leavingRef.current = true;
      const action = event.data.action;
      (async () => {
        try {
          await discardSession(id);
          await clearSessionPlan(id);
          if (
            customWorkoutIdRef.current &&
            customWorkoutIdRef.current !== STARTER_WORKOUT_ID &&
            emptyDayRef.current
          ) {
            await deleteCustomWorkout(customWorkoutIdRef.current).catch(() => {});
          }
        } catch {
          // Still leave so she is not stuck on a broken session.
        } finally {
          workout.end();
          navigation.dispatch(action);
        }
      })();
    });
    return unsubscribe;
  }, [id, navigation, workout]);

  async function persistPlan(nextDay: ProgrammeDay) {
    await saveSessionPlan(id, sessionPlanFromDay(nextDay));
  }

  async function startTimer() {
    if (startedAt !== null) return;
    const at = Date.now();
    setStartedAt(at);
    keepSessionRef.current = false;
    await ensureRestTimerPermission().catch(() => {});
    markSessionStarted(id).catch(() => {});
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
    const completing = !current.completed;
    if (completing) {
      void startTimer();
      workout.startRest(slotRestSeconds(item));
    } else {
      workout.stopRest();
    }
    const next = { ...current, completed: completing };
    updateEntry(key, { completed: completing });
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
    setEntries((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${swapItem.exercise.id}:`)) delete next[key];
      }
      const slot = nextDay.exercises.find((item) => item.position === swapItem.position);
      if (slot) {
        Object.assign(
          next,
          buildEntries({ ...nextDay, exercises: [slot] }, [], { ...previous, ...extra }, isPro)
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
      if (scope === 'always' && customWorkoutId && customWorkoutId !== STARTER_WORKOUT_ID) {
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
        Object.assign(next, buildEntries({ ...nextDay, exercises: [slot] }, [], previous, isPro));
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
      const slot: ProgrammeExercise =
        customWorkoutId && customWorkoutId !== STARTER_WORKOUT_ID
          ? await appendCustomWorkoutExercise(customWorkoutId, exercise)
          : {
              position: (day.exercises.at(-1)?.position ?? 0) + 1,
              ...DEFAULT_SLOT,
              rest_seconds: DEFAULT_REST_SECONDS,
              exercise,
              added: true,
            };
      const nextDay = { ...day, exercises: [...day.exercises, slot] };
      const [extra, extraBests] = await Promise.all([
        fetchPreviousSets([exercise.id], id).catch(() => ({})),
        fetchExerciseBests([exercise.id], id).catch(() => ({})),
      ]);
      setDay(nextDay);
      setPrevious((current) => ({ ...current, ...extra }));
      setBests((current) => ({ ...current, ...extraBests }));
      setEntries((current) => ({
        ...current,
        ...buildEntries(
          { ...nextDay, exercises: [slot] },
          [],
          extra,
          isPro
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
    setEditSlot((current) => (current?.position === position && nextItem ? nextItem : current));
    if (nextItem) {
      setEntries((current) => {
        const next = { ...current };
        const ids = new Set(setNumbers(nextItem).map((setNumber) => setKey(nextItem.exercise.id, setNumber)));
        for (const key of Object.keys(next)) {
          if (key.startsWith(`${nextItem.exercise.id}:`) && !ids.has(key)) delete next[key];
        }
        for (const setNumber of setNumbers(nextItem)) {
          const key = setKey(nextItem.exercise.id, setNumber);
          if (!next[key]) {
            const last = current[setKey(nextItem.exercise.id, setNumber - 1)];
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
    showDialog(`Remove ${item.exercise.name}?`, 'Only for today. Your saved plan stays the same.', [
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
          setEditSlot((current) => (current?.position === item.position ? null : current));
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
        const [prev, nextBests] = await Promise.all([
          fetchPreviousSets(exerciseIds, id),
          fetchExerciseBests(exerciseIds, id).catch(() => ({})),
        ]);
        await saveSessionPlan(id, sessionPlanFromDay(programmeDay));
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
        setEntries(buildEntries(programmeDay, logged, prev, isPro));
        setSwapItem(null);
        setEditSlot(null);
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
    keepSessionRef.current = true;
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
        ticked[item.exercise.id] = setNumbers(item)
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
      workout.end();
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
    } catch {
      keepSessionRef.current = false;
      setIsFinishing(false);
      showDialog('Couldn’t finish the session', 'Check your connection and try again.');
    }
  }

  function confirmFinish() {
    if (doneSets === 0) return;
    if (doneSets < totalSets) {
      showDialog(
        'Finish this session?',
        `You’ve done ${doneSets} of ${totalSets} sets. That’s fine: only the sets you ticked are saved.`,
        [
          { text: 'Keep going', style: 'cancel' },
          { text: 'Finish', onPress: () => void finish() },
        ]
      );
      return;
    }
    void finish();
  }

  async function discard() {
    if (isFinishing) return;
    keepSessionRef.current = true;
    setIsFinishing(true);
    try {
      await discardSession(id);
      await clearSessionPlan(id);
      if (customWorkoutId && customWorkoutId !== STARTER_WORKOUT_ID && day?.exercises.length === 0) {
        await deleteCustomWorkout(customWorkoutId).catch(() => {});
      }
      workout.end();
      router.back();
    } catch {
      keepSessionRef.current = false;
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

  const headerOptions = {
    title: '',
    headerBackTitle: 'Home',
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colours.bg },
    headerTintColor: colours.brand,
    headerRight: () => (
      <View ref={menuRef} collapsable={false}>
        <IconButton
          icon="ellipsis-horizontal"
          variant="muted"
          accessibilityLabel="Session options"
          onPress={openMenu}
        />
      </View>
    ),
  };

  if (loadState !== 'ready' || !day || !session) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        <Stack.Screen options={{ ...headerOptions, headerRight: undefined }} />
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <Text style={[type.body, { color: colours.inkMuted, textAlign: 'center' }]}>
            {loadState === 'not-found'
              ? 'This session isn’t here any more.'
              : 'We couldn’t load this session. Go back and try again.'}
          </Text>
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
  const eyebrow =
    weekNumber !== null
      ? `Week ${weekNumber} · day ${day.day_number}`
      : null;
  const canAddExercise = true;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colours.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={headerOptions} />

      <View style={[styles.stickyTop, { backgroundColor: colours.bg, borderBottomColor: colours.border }]}>
        {eyebrow ? (
          <Text style={[type.eyebrow, { color: colours.accent, marginBottom: 4 }]}>{eyebrow}</Text>
        ) : null}
        <Text style={[type.title1, { color: colours.ink }]} numberOfLines={1}>
          {day.name}
        </Text>
        <View style={styles.headerMeta}>
          <View style={styles.flex}>
            <Text style={[type.caption, { color: colours.inkMuted, marginBottom: 6 }]}>
              {doneSets} of {totalSets} sets
            </Text>
            <ProgressBar progress={totalSets === 0 ? 0 : doneSets / totalSets} />
          </View>
          {startedAt !== null ? (
            <View
              style={[styles.elapsed, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}
              accessibilityLabel="Time since you started">
              <Ionicons name="stopwatch-outline" size={16} color={colours.brand} />
              <Text style={[type.bodySm, { color: colours.brand, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>
                {formatClock((now - startedAt) / 1000)}
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={() => void startTimer()}
              style={({ pressed }) => [
                styles.elapsed,
                { backgroundColor: colours.brandSoft, borderRadius: radius.full },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Start timer">
              <Ionicons name="stopwatch-outline" size={16} color={colours.brand} />
              <Text style={[type.bodySm, { color: colours.brand, fontWeight: '700' }]}>Start timer</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {showGuideTip ? (
          <View style={[styles.tip, { backgroundColor: colours.brandSoft, borderRadius: radius.lg }]}>
            <Ionicons name="information-circle-outline" size={20} color={colours.brand} />
            <Text style={[type.bodySm, { color: colours.ink, flex: 1 }]}>
              First time on a lift? Tap the info icon for a quick guide.
            </Text>
          </View>
        ) : null}

        {day.exercises.length === 0 ? (
          <EmptyState
            icon="barbell-outline"
            title="No exercises yet"
            body="Add your first exercise when you’re ready. This session is yours to build as you go."
          />
        ) : null}

        {day.exercises.map((item) => {
          const weighted = usesWeight(item.exercise.equipment);
          const suggestion = isPro ? getWeightSuggestion(item, previous[item.exercise.id]) : null;
          const increase = suggestion?.kind === 'increase' ? suggestion : null;
          return (
            <View
              key={item.position}
              style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
              <View style={styles.cardHeader}>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })
                  }
                  style={({ pressed }) => [styles.exerciseHeader, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityHint="Shows how to do this exercise">
                  <ExerciseThumb item={item} />
                  <View style={styles.flex}>
                    <Text style={[type.title3, { color: colours.ink }]} numberOfLines={2}>
                      {item.exercise.name}
                    </Text>
                    {item.original && equipment && exerciseFits(item.original, equipment) ? (
                      <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 2 }]}>
                        Instead of {item.original.name}
                      </Text>
                    ) : null}
                    <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 2 }]}>
                      {formatTargetLine(item)}
                    </Text>
                  </View>
                </Pressable>
                <IconButton
                  icon="information-circle-outline"
                  variant="muted"
                  accessibilityLabel={`${item.exercise.name} guide`}
                  onPress={() =>
                    router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })
                  }
                />
                <IconButton
                  icon="swap-horizontal"
                  variant="muted"
                  accessibilityLabel={`Swap ${item.exercise.name}`}
                  onPress={() => openSwap(item)}
                  color={swapItem?.position === item.position ? colours.onBrand : colours.ink}
                  style={
                    swapItem?.position === item.position ? { backgroundColor: colours.brand } : undefined
                  }
                />
                <SlotMenuButton name={item.exercise.name} onOpen={(anchor) => openSlotMenu(item, anchor)} />
              </View>
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

              {setNumbers(item).map((setNumber) => {
                const key = setKey(item.exercise.id, setNumber);
                const entry = entries[key];
                if (!entry) return null;
                const setRecords = records[key];
                const placeholders = lastSetPlaceholders(previous[item.exercise.id], setNumber, weighted);
                const chip =
                  setNumber === 1 && increase
                    ? increase.changeKg > 0
                      ? `+${formatKg(increase.changeKg)}`
                      : `${formatKg(-increase.changeKg)} less help`
                    : undefined;
                return (
                  <SetRow
                    key={key}
                    setNumber={setNumber}
                    kg={entry.weight}
                    reps={entry.reps}
                    completed={entry.completed}
                    weighted={weighted}
                    weightLabel={item.exercise.equipment === 'band' ? 'Band' : 'Bodyweight'}
                    kgPlaceholder={placeholders.kg}
                    repsPlaceholder={placeholders.reps}
                    suggestedLabel={chip}
                    recordLabel={
                      setRecords ? setRecords.map((kind) => RECORD_LABELS[kind]).join(', ') : undefined
                    }
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
            </View>
          );
        })}

        {canAddExercise ? (
          <SecondaryButton
            label={isAdding ? 'Adding…' : 'Add exercise'}
            onPress={() => setPickerOpen(true)}
            disabled={isAdding || isFinishing}
            loading={isAdding}
          />
        ) : null}
      </ScrollView>

      {restEndsAt !== null ? (
        <RestTimerBar
          label={formatClock(restRemaining)}
          onMinus={() => workout.adjustRest(-REST_ADJUST_SECONDS)}
          onPlus={() => workout.adjustRest(REST_ADJUST_SECONDS)}
          onSkip={workout.stopRest}
        />
      ) : null}

      <View
        style={[
          styles.stickyBottom,
          { backgroundColor: colours.bg, paddingBottom: insets.bottom + 8 },
          shadow,
        ]}>
        <PrimaryButton
          label="Finish session"
          onPress={confirmFinish}
          loading={isFinishing}
          disabled={isFinishing || doneSets === 0}
        />
        {doneSets > 0 ? (
          <TextButton label="Discard" onPress={confirmDiscard} disabled={isFinishing} />
        ) : null}
      </View>

      {canAddExercise ? (
        <ExercisePicker
          open={pickerOpen}
          takenIds={day.exercises.map((item) => item.exercise.id)}
          onClose={() => setPickerOpen(false)}
          onChoose={handleAddExercise}
        />
      ) : null}

      <OverflowMenu visible={menuOpen} anchor={menuAnchor} onClose={closeMenu}>
        {menuMode === 'days' ? (
          <>
            <MenuHeader label="Do a different day" detail="Only for today. Your routine stays the same." />
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
            <MenuHeader label={day.name} detail="Changes apply to today only." />
            {weekDays.length > 1 ? (
              <MenuRow label="Do a different day" onPress={() => setMenuMode('days')} />
            ) : null}
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
              label="End session"
              danger
              onPress={() => {
                closeMenu();
                if (doneSets > 0) confirmDiscard();
                else router.back();
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
            <MenuHeader label={slotMenuItem.exercise.name} detail="Changes apply to today only." />
            <MenuRow
              label="Remove exercise"
              danger
              onPress={() => {
                const item = slotMenuItem;
                setSlotMenuItem(null);
                handleRemove(item);
              }}
            />
            <MenuRow
              label="Add set"
              onPress={() => {
                addSet(slotMenuItem);
                setSlotMenuItem(null);
              }}
            />
            <MenuRow
              label="Remove set"
              onPress={() => {
                removeSet(slotMenuItem);
                setSlotMenuItem(null);
              }}
            />
            <MenuRow
              label="Change rep target"
              onPress={() => {
                setEditSlot(slotMenuItem);
                setSlotMenuItem(null);
              }}
            />
          </>
        ) : null}
      </OverflowMenu>

      <Modal
        visible={editSlot !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditSlot(null)}>
        <View style={[styles.sheetLayer, { backgroundColor: colours.overlay }]}>
          <Pressable style={styles.sheetDismiss} onPress={() => setEditSlot(null)} accessibilityLabel="Close" />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colours.surface,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                paddingBottom: insets.bottom + 16,
              },
            ]}>
            {editSlot ? (
              <>
                <Text style={[type.title3, { color: colours.ink }]}>{editSlot.exercise.name}</Text>
                <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 4, marginBottom: spacing.md }]}>
                  {formatTargetLine(editSlot)}
                </Text>
                <Stepper
                  label="Reps"
                  display={
                    editSlot.rep_min === editSlot.rep_max
                      ? `${editSlot.rep_min}`
                      : `${editSlot.rep_min} to ${editSlot.rep_max}`
                  }
                  onMinus={() =>
                    updateSlot(editSlot.position, {
                      rep_min: clamp(editSlot.rep_min - 1, MIN_REPS, editSlot.rep_max),
                    })
                  }
                  onPlus={() =>
                    updateSlot(editSlot.position, {
                      rep_max: clamp(editSlot.rep_max + 1, editSlot.rep_min, MAX_REPS),
                    })
                  }
                />
                <PrimaryButton label="Done" onPress={() => setEditSlot(null)} style={{ marginTop: spacing.lg }} />
              </>
            ) : null}
          </View>
        </View>
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
    paddingBottom: 24,
    gap: 16,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  stickyTop: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginTop: 10,
  },
  elapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
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
  thumb: {
    width: 56,
    height: 56,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFill: {
    width: '100%',
    height: '100%',
  },
  play: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  stickyBottom: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  pressed: {
    opacity: 0.8,
  },
  sheetLayer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetDismiss: {
    flex: 1,
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  stepper: {
    gap: 4,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    minHeight: 48,
  },
  stepperButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
