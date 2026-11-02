import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
  PrimaryButton,
  ProgressBar,
  RestTimerBar,
  SecondaryButton,
  SetRow,
  TextButton,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { collectSessionWins } from '@/lib/activityStats';
import { fillBlockTargetsFromSession } from '@/lib/blocks';
import {
  appendCustomWorkoutExercise,
  deleteCustomWorkout,
  replaceCustomWorkoutExercise,
  STARTER_WORKOUT_ID,
} from '@/lib/customWorkouts';
import { getExerciseImageSource } from '@/lib/exerciseMedia';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import {
  formatKg,
  getWeightSuggestion,
  usesWeight,
  type ProgrammeDay,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';
import { markPlannerDateDone } from '@/lib/planner';
import { recordCheckpointIfNeeded } from '@/lib/checkpoints';
import { maybeCompleteEnrolment } from '@/lib/routines';
import { fetchExerciseBests, type ExerciseBests } from '@/lib/progress';
import {
  DEFAULT_REST_SECONDS,
  REST_ADJUST_SECONDS,
  ensureRestTimerPermission,
} from '@/lib/restTimer';
import {
  discardSession,
  fetchPreviousSets,
  fetchSession,
  finishSession,
  saveSessionSwaps,
  saveSet,
  type LoggedSet,
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
  setKey,
  setNumbers,
  type RecordKind,
  type SetEntry,
} from '@/lib/workoutLog';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

function showRecords(kinds: RecordKind[]) {
  showDialog(
    kinds.length === 1 ? 'New personal best' : 'New personal bests',
    kinds.map((kind) => RECORD_LABELS[kind]).join('\n')
  );
}

function formatCompactSets(item: Pick<ProgrammeExercise, 'sets' | 'rep_min' | 'rep_max'>): string {
  const reps = item.rep_min === item.rep_max ? `${item.rep_min}` : `${item.rep_min}-${item.rep_max}`;
  return `${item.sets} × ${reps}`;
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

function ExerciseThumb({ item }: { item: ProgrammeExercise }) {
  const { colours, radius, type } = useTheme();
  const photo = getExerciseImageSource(item.exercise);
  return (
    <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
      {photo ? (
        <Image source={photo} style={styles.photoFill} resizeMode="cover" />
      ) : (
        <Text style={[type.title3, { color: colours.brand }]}>{item.exercise.name.slice(0, 1)}</Text>
      )}
      <View style={[styles.play, { backgroundColor: colours.overlay, borderRadius: radius.full }]}>
        <Ionicons name="play" size={12} color={colours.onAccent} />
      </View>
    </View>
  );
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colours, type, spacing, radius, shadow } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const equipment = answers?.equipment ?? null;
  const { isPro, isLoading: isSubscriptionLoading } = useSubscription();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [day, setDay] = useState<ProgrammeDay | null>(null);
  const [previous, setPrevious] = useState<Record<string, LoggedSet[]>>({});
  const [entries, setEntries] = useState<Record<string, SetEntry>>({});
  const [isFinishing, setIsFinishing] = useState(false);
  const [swapItem, setSwapItem] = useState<ProgrammeExercise | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [bests, setBests] = useState<Record<string, ExerciseBests>>({});
  const [customWorkoutId, setCustomWorkoutId] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [routineEnrolmentId, setRoutineEnrolmentId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const workout = useWorkout();
  const { restEndsAt, publish } = workout;
  const now = useNow(loadState === 'ready', 500);

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
        setDay(log.day);
        setPrevious(log.previous);
        setEntries(buildEntries(log.day, log.logged, log.previous, isPro));
        setStartedAt(new Date(log.session.started_at).getTime());
        setBests(historyBests);
        setCustomWorkoutId(log.session.custom_workout_id);
        setSessionDate(log.session.date);
        setRoutineEnrolmentId(log.session.routine_enrolment_id);
        setLoadState('ready');
      } catch {
        if (isCurrent) setLoadState('error');
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [id, equipment, isPro, isSubscriptionLoading]);

  useEffect(() => {
    ensureRestTimerPermission().catch(() => {});
  }, []);

  useEffect(() => {
    if (!day || startedAt === null) return;
    publish({ sessionId: id, dayName: day.name, startedAt }, getNextSet(day, entries));
  }, [id, day, entries, startedAt, publish]);

  function updateEntry(key: string, change: Partial<SetEntry>) {
    setEntries((current) => ({ ...current, [key]: { ...current[key], ...change } }));
  }

  function toLoggedSet(item: ProgrammeExercise, setNumber: number, entry: SetEntry): LoggedSet {
    return {
      session_id: id,
      exercise_id: item.exercise.id,
      set_number: setNumber,
      weight_kg: usesWeight(item.exercise.equipment) ? parseWeight(entry.weight) : null,
      reps: parseReps(entry.reps),
      completed: entry.completed,
    };
  }

  async function toggleSet(item: ProgrammeExercise, setNumber: number) {
    const key = setKey(item.exercise.id, setNumber);
    const entry = entries[key];
    const completing = !entry.completed;
    const weighted = usesWeight(item.exercise.equipment);

    if (completing) {
      const reps = parseReps(entry.reps);
      if (reps === null || reps < 1) {
        showDialog('How many reps?', 'Add the number of reps you did, then tick the set.');
        return;
      }
      if (weighted && parseWeight(entry.weight) === null) {
        showDialog('What weight?', 'Add the weight you used in kg, then tick the set.');
        return;
      }
    }

    const updated = { ...entry, completed: completing };
    const before = entries;
    setEntries((current) => {
      const next = { ...current, [key]: updated };
      if (completing && weighted) {
        for (const later of setNumbers(item).filter((n) => n > setNumber)) {
          const laterKey = setKey(item.exercise.id, later);
          if (!next[laterKey].completed && next[laterKey].weight === '') {
            next[laterKey] = { ...next[laterKey], weight: entry.weight };
          }
        }
      }
      return next;
    });
    if (completing) workout.startRest(DEFAULT_REST_SECONDS);

    try {
      await saveSet(toLoggedSet(item, setNumber, updated));
    } catch {
      setEntries(before);
      if (completing) workout.stopRest();
      showDialog('That set didn’t save', 'Check your connection and try again.');
    }
  }

  async function saveEdit(item: ProgrammeExercise, setNumber: number) {
    const entry = entries[setKey(item.exercise.id, setNumber)];
    if (!entry?.completed) return;
    try {
      await saveSet(toLoggedSet(item, setNumber, entry));
    } catch {
      showDialog('That change didn’t save', 'Check your connection and try again.');
    }
  }

  function openSwap(item: ProgrammeExercise) {
    if (swapItem?.position === item.position) {
      setSwapItem(null);
      return;
    }
    const hasTicked = setNumbers(item).some(
      (setNumber) => entries[setKey(item.exercise.id, setNumber)]?.completed
    );
    if (hasTicked) {
      showDialog(
        'You’ve already ticked sets',
        `To swap ${item.exercise.name}, untick its sets first.`
      );
      return;
    }
    setSwapItem(item);
  }

  async function replaceSlot(item: ProgrammeExercise, exercise: SlotExercise) {
    if (!day) return;
    const original = item.original ?? item.exercise;
    const updatedItem: ProgrammeExercise = {
      position: item.position,
      sets: item.sets,
      rep_min: item.rep_min,
      rep_max: item.rep_max,
      exercise,
      ...(exercise.id === original.id ? {} : { original }),
    };
    const updatedDay = {
      ...day,
      exercises: day.exercises.map((slot) => (slot.position === item.position ? updatedItem : slot)),
    };
    await saveSessionSwaps(id, swapIds(updatedDay));

    const [previousSets, newBests] = await Promise.all([
      previous[exercise.id] ? {} : fetchPreviousSets([exercise.id], id).catch(() => ({})),
      bests[exercise.id] ? {} : fetchExerciseBests([exercise.id], id).catch(() => ({})),
    ]);
    const mergedPrevious = { ...previous, ...previousSets };
    const newEntries = buildEntries({ ...day, exercises: [updatedItem] }, [], mergedPrevious, isPro);
    setDay(updatedDay);
    setPrevious(mergedPrevious);
    setBests((current) => ({ ...current, ...newBests }));
    setEntries((current) => ({ ...newEntries, ...current }));
  }

  async function handleSwap(exercise: SlotExercise, scope: SwapScope) {
    if (!day || !swapItem) return;
    if (scope === 'always') {
      if (customWorkoutId && customWorkoutId !== STARTER_WORKOUT_ID) {
        await replaceCustomWorkoutExercise(customWorkoutId, swapItem.position, exercise.id);
      } else if (!customWorkoutId) {
        await saveUserSwap(day.id, swapItem.position, exercise.id);
      }
    }
    await replaceSlot(swapItem, exercise);
  }

  async function handleAddExercise(exercise: SlotExercise) {
    if (!day || !customWorkoutId || customWorkoutId === STARTER_WORKOUT_ID) return;
    setPickerOpen(false);
    setIsAdding(true);
    try {
      const added = await appendCustomWorkoutExercise(customWorkoutId, exercise);
      const updatedDay = { ...day, exercises: [...day.exercises, added] };
      const extraPrevious = previous[exercise.id]
        ? {}
        : await fetchPreviousSets([exercise.id], id).catch(() => ({}));
      const extraBests = bests[exercise.id]
        ? {}
        : await fetchExerciseBests([exercise.id], id).catch(() => ({}));
      const mergedPrevious = { ...previous, ...extraPrevious };
      const newEntries = buildEntries({ ...day, exercises: [added] }, [], mergedPrevious, isPro);
      setDay(updatedDay);
      setPrevious(mergedPrevious);
      setBests((current) => ({ ...current, ...extraBests }));
      setEntries((current) => ({ ...current, ...newEntries }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      showDialog('Couldn’t add that exercise', detail || 'Check your connection and try again.');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRestore() {
    if (!day || !swapItem?.original) return;
    if (customWorkoutId && customWorkoutId !== STARTER_WORKOUT_ID) {
      await replaceCustomWorkoutExercise(customWorkoutId, swapItem.position, swapItem.original.id);
    } else if (!customWorkoutId) {
      await deleteUserSwap(day.id, swapItem.position);
    }
    await replaceSlot(swapItem, swapItem.original);
  }

  async function finish() {
    setIsFinishing(true);
    try {
      const durationSeconds =
        startedAt === null ? undefined : Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      await finishSession(id, durationSeconds);
      if (sessionDate) {
        await markPlannerDateDone(sessionDate).catch(() => {});
      }
      await clearSessionPlan(id).catch(() => {});
      await fillBlockTargetsFromSession(id).catch(() => {});
      const checkpointLines =
        routineEnrolmentId && day
          ? await recordCheckpointIfNeeded(routineEnrolmentId, day.id).catch(() => [])
          : [];
      const finishedRoutine = routineEnrolmentId
        ? await maybeCompleteEnrolment(routineEnrolmentId).catch(() => false)
        : false;
      const ticked: Record<string, { weightKg: number | null; reps: number }[]> = {};
      if (day) {
        for (const item of day.exercises) {
          ticked[item.exercise.id] = setNumbers(item)
            .map((setNumber) => entries[setKey(item.exercise.id, setNumber)])
            .filter((entry): entry is SetEntry => Boolean(entry?.completed))
            .map((entry) => ({
              weightKg: usesWeight(item.exercise.equipment) ? parseWeight(entry.weight) : null,
              reps: parseReps(entry.reps) ?? 0,
            }));
        }
      }
      const wins = collectSessionWins({
        exercises: (day?.exercises ?? []).map((item) => item.exercise),
        ticked,
        previous,
        bests,
      });
      if (checkpointLines.length > 0) wins.unshift(...checkpointLines.slice(0, 2));
      if (finishedRoutine) wins.unshift('You finished the routine.');
      workout.end();
      if (finishedRoutine && routineEnrolmentId) {
        router.replace({ pathname: '/routines/complete', params: { enrolmentId: routineEnrolmentId } });
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
      setIsFinishing(false);
      showDialog('Couldn’t finish the session', 'Check your connection and try again.');
    }
  }

  async function discard() {
    setIsFinishing(true);
    try {
      await discardSession(id);
      await clearSessionPlan(id).catch(() => {});
      if (
        customWorkoutId &&
        customWorkoutId !== STARTER_WORKOUT_ID &&
        (day?.exercises.length ?? 0) === 0
      ) {
        await deleteCustomWorkout(customWorkoutId).catch(() => {});
      }
      workout.end();
      router.back();
    } catch {
      setIsFinishing(false);
      showDialog('Couldn’t discard the session', 'Check your connection and try again.');
    }
  }

  function confirmDiscard() {
    showDialog('Discard this session?', 'Any sets you’ve ticked in it will be deleted.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: discard },
    ]);
  }

  const totalSets = day?.exercises.reduce((sum, item) => sum + item.sets, 0) ?? 0;
  const doneSets = Object.values(entries).filter((entry) => entry.completed).length;

  function confirmFinish() {
    if (doneSets === 0) {
      showDialog(
        'No sets ticked yet',
        'Tick off the sets you’ve done, or discard this session if you didn’t train.',
        [
          { text: 'Keep going', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: discard },
        ]
      );
      return;
    }
    if (doneSets < totalSets) {
      showDialog(
        'Finish session?',
        `You’ve done ${doneSets} of ${totalSets} sets. That’s fine: only the sets you ticked are saved.`,
        [
          { text: 'Keep going', style: 'cancel' },
          { text: 'Finish', onPress: finish },
        ]
      );
      return;
    }
    finish();
  }

  const headerOptions = {
    headerShown: true,
    title: '',
    headerBackTitle: 'Home',
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colours.bg },
    headerTintColor: colours.brand,
  } as const;

  if (loadState !== 'ready' || !day) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        <Stack.Screen options={headerOptions} />
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <Text style={[type.body, { color: colours.inkMuted, textAlign: 'center' }]}>
            {loadState === 'not-found'
              ? 'We couldn’t find this session.'
              : 'We couldn’t load this session. Check your connection and try again.'}
          </Text>
        )}
      </View>
    );
  }

  const restRemaining = restEndsAt === null ? 0 : Math.ceil((restEndsAt - now) / 1000);
  const records = getSetRecords(day, entries, bests);
  const showGuideTip = day.exercises.some((item) => !previous[item.exercise.id]?.length);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colours.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={headerOptions} />

      <View style={[styles.stickyTop, { backgroundColor: colours.bg, borderBottomColor: colours.border }]}>
        <Text style={[type.title2, { color: colours.ink }]} numberOfLines={1}>
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
          ) : null}
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
                      {formatCompactSets(item)}
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
                {isPro ? (
                  <IconButton
                    icon="swap-horizontal"
                    variant="muted"
                    accessibilityLabel={`Swap ${item.exercise.name}`}
                    onPress={() => openSwap(item)}
                    color={swapItem?.position === item.position ? colours.onBrand : colours.ink}
                    style={
                      swapItem?.position === item.position
                        ? { backgroundColor: colours.brand }
                        : undefined
                    }
                  />
                ) : null}
              </View>
              {isPro && equipment ? (
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
                const setRecords = records[key];
                const placeholders = lastSetPlaceholders(previous[item.exercise.id], setNumber, weighted);
                const chip =
                  setNumber === 1 && increase
                    ? increase.changeKg > 0
                      ? `Go up ${formatKg(increase.changeKg)}`
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

        {customWorkoutId && customWorkoutId !== STARTER_WORKOUT_ID ? (
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
          disabled={isFinishing}
        />
        <TextButton label="Discard" onPress={confirmDiscard} disabled={isFinishing} />
      </View>

      {customWorkoutId && customWorkoutId !== STARTER_WORKOUT_ID ? (
        <ExercisePicker
          open={pickerOpen}
          takenIds={day.exercises.map((item) => item.exercise.id)}
          onClose={() => setPickerOpen(false)}
          onChoose={handleAddExercise}
        />
      ) : null}
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
});
