import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { ExercisePicker } from '@/components/ExercisePicker';
import { SwapSheet } from '@/components/SwapSheet';
import { colours } from '@/constants/theme';
import { collectSessionWins } from '@/lib/activityStats';
import { fillBlockTargetsFromSession } from '@/lib/blocks';
import {
  appendCustomWorkoutExercise,
  deleteCustomWorkout,
  replaceCustomWorkoutExercise,
  STARTER_WORKOUT_ID,
} from '@/lib/customWorkouts';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import {
  describeProgressionGoal,
  formatKg,
  formatSetsAndReps,
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

function formatPrevious(sets: LoggedSet[] | undefined): string | null {
  if (!sets || sets.length === 0) return null;
  const weights = new Set(sets.map((set) => set.weight_kg));
  const reps = sets.map((set) => set.reps ?? 0).join(', ');
  const [onlyWeight] = [...weights];
  if (weights.size === 1 && onlyWeight !== null) return `Last time: ${formatKg(onlyWeight)} × ${reps}`;
  if (weights.size === 1) return `Last time: ${reps} reps`;
  return `Last time: ${sets
    .map((set) => (set.weight_kg === null ? `${set.reps}` : `${formatKg(set.weight_kg)} × ${set.reps}`))
    .join(', ')}`;
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
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

  // Keeps the bar above the tabs up to date with this session's next set.
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
      // Carry a newly entered weight on to the following sets that don't have one yet.
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

  /** Saves edits to a set that's already ticked. */
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

  /** Puts `exercise` in the slot for this session and pre-fills its sets. */
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
    // Keep anything she already typed for this exercise earlier in the session.
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
      const newEntries = buildEntries(
        { ...day, exercises: [added] },
        [],
        mergedPrevious,
        isPro
      );
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

  if (loadState !== 'ready' || !day) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <Text style={styles.message}>
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

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (restEndsAt === null ? 32 : 140) },
        ]}
        keyboardShouldPersistTaps="handled">
        <View>
          <Text style={styles.title}>{day.name}</Text>
          <View style={styles.headerRow}>
            <Text style={styles.progress}>
              {doneSets} of {totalSets} sets done
            </Text>
            {startedAt !== null && (
              <View style={styles.elapsed} accessibilityLabel="Time since you started">
                <Ionicons name="stopwatch-outline" size={18} color={colours.accent} />
                <Text style={styles.elapsedText}>{formatClock((now - startedAt) / 1000)}</Text>
              </View>
            )}
          </View>
        </View>

        {day.exercises.length === 0 && (
          <Text style={styles.emptyAdd}>
            Add your first exercise when you’re ready. This session is yours to build as you go.
          </Text>
        )}

        {day.exercises.map((item) => {
          const weighted = usesWeight(item.exercise.equipment);
          const previousText = formatPrevious(previous[item.exercise.id]);
          const isFirstTime = !previous[item.exercise.id]?.length;
          const goalText = isPro
            ? describeProgressionGoal(getWeightSuggestion(item, previous[item.exercise.id]))
            : null;
          return (
            <View key={item.position} style={styles.card}>
              <View style={styles.cardHeader}>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })
                  }
                  style={({ pressed }) => [styles.exerciseHeader, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityHint="Shows how to do this exercise">
                  <View style={styles.flex}>
                    <Text style={styles.exerciseName}>{item.exercise.name}</Text>
                    {item.original && equipment && exerciseFits(item.original, equipment) && (
                      <Text style={styles.swappedFrom}>Instead of {item.original.name}</Text>
                    )}
                    <Text style={styles.exerciseDetail}>{formatSetsAndReps(item)}</Text>
                    {isFirstTime && (
                      <Text style={styles.previous}>First time: tap for the guide</Text>
                    )}
                    {previousText && <Text style={styles.previous}>{previousText}</Text>}
                    {goalText && <Text style={styles.goal}>{goalText}</Text>}
                  </View>
                  <Ionicons name="information-circle-outline" size={24} color={colours.accent} />
                </Pressable>
                {isPro && (
                  <Pressable
                    onPress={() => openSwap(item)}
                    style={({ pressed }) => [
                      styles.swapButton,
                      swapItem?.position === item.position && styles.swapButtonOpen,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: swapItem?.position === item.position }}
                    accessibilityLabel={`Swap ${item.exercise.name}`}>
                    <Ionicons
                      name="swap-horizontal"
                      size={24}
                      color={swapItem?.position === item.position ? colours.surface : colours.accent}
                    />
                  </Pressable>
                )}
              </View>
              {isPro && equipment && (
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
                    customWorkoutId
                      ? 'Replaces it in this workout'
                      : 'Replaces it in your programme'
                  }
                />
              )}

              <View style={styles.columnLabels}>
                <Text style={[styles.columnLabel, styles.setColumn]}>Set</Text>
                <Text style={[styles.columnLabel, styles.flex]}>{weighted ? 'kg' : ''}</Text>
                <Text style={[styles.columnLabel, styles.flex]}>Reps</Text>
                <View style={styles.checkColumn} />
              </View>

              {setNumbers(item).map((setNumber) => {
                const key = setKey(item.exercise.id, setNumber);
                const entry = entries[key];
                const setRecords = records[key];
                return (
                  <View key={key} style={styles.setRow}>
                    {setRecords ? (
                      <Pressable
                        onPress={() => showRecords(setRecords)}
                        style={styles.setColumn}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Set ${setNumber}: new personal best. ${setRecords
                          .map((kind) => RECORD_LABELS[kind])
                          .join(', ')}`}>
                        <Text style={styles.setNumber}>{setNumber}</Text>
                        <Ionicons name="trophy" size={18} color={colours.trophy} style={styles.trophy} />
                      </Pressable>
                    ) : (
                      <Text style={[styles.setNumber, styles.setColumn]}>{setNumber}</Text>
                    )}
                    {weighted ? (
                      <TextInput
                        style={[styles.input, styles.flex, entry.completed && styles.inputDone]}
                        value={entry.weight}
                        onChangeText={(text) => updateEntry(key, { weight: text })}
                        onEndEditing={() => saveEdit(item, setNumber)}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        placeholder="–"
                        placeholderTextColor={colours.textMuted}
                        accessibilityLabel={`Set ${setNumber} weight in kilograms`}
                      />
                    ) : (
                      <Text style={[styles.noWeight, styles.flex]}>
                        {item.exercise.equipment === 'band' ? 'Band' : 'Bodyweight'}
                      </Text>
                    )}
                    <TextInput
                      style={[styles.input, styles.flex, entry.completed && styles.inputDone]}
                      value={entry.reps}
                      onChangeText={(text) => updateEntry(key, { reps: text })}
                      onEndEditing={() => saveEdit(item, setNumber)}
                      keyboardType="number-pad"
                      selectTextOnFocus
                      accessibilityLabel={`Set ${setNumber} reps`}
                    />
                    <Pressable
                      onPress={() => toggleSet(item, setNumber)}
                      style={({ pressed }) => [
                        styles.check,
                        entry.completed && styles.checkDone,
                        pressed && styles.pressed,
                      ]}
                      hitSlop={4}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: entry.completed }}
                      accessibilityLabel={`Set ${setNumber} done`}>
                      <Ionicons
                        name="checkmark"
                        size={28}
                        color={entry.completed ? colours.surface : colours.accent}
                      />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          );
        })}

        {customWorkoutId && customWorkoutId !== STARTER_WORKOUT_ID && (
          <Pressable
            style={({ pressed }) => [styles.addButton, (pressed || isAdding) && styles.pressed]}
            onPress={() => setPickerOpen(true)}
            disabled={isAdding || isFinishing}
            accessibilityRole="button">
            <Text style={styles.addButtonText}>{isAdding ? 'Adding…' : 'Add exercise'}</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.finishButton, (pressed || isFinishing) && styles.pressed]}
          onPress={confirmFinish}
          disabled={isFinishing}
          accessibilityRole="button">
          {isFinishing ? (
            <ActivityIndicator color={colours.surface} />
          ) : (
            <Text style={styles.finishText}>Finish session</Text>
          )}
        </Pressable>
        <Pressable
          style={styles.link}
          onPress={confirmDiscard}
          disabled={isFinishing}
          accessibilityRole="button">
          <Text style={styles.linkText}>Discard session</Text>
        </Pressable>

      </ScrollView>

      {restEndsAt !== null && (
        <View style={[styles.restBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.restClock}>
            <Text style={styles.restLabel}>Rest</Text>
            <Text style={styles.restTime}>{formatClock(restRemaining)}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.restButton, pressed && styles.pressed]}
            onPress={() => workout.adjustRest(-REST_ADJUST_SECONDS)}
            accessibilityRole="button"
            accessibilityLabel={`${REST_ADJUST_SECONDS} seconds less rest`}>
            <Text style={styles.restButtonText}>−{REST_ADJUST_SECONDS}s</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.restButton, pressed && styles.pressed]}
            onPress={() => workout.adjustRest(REST_ADJUST_SECONDS)}
            accessibilityRole="button"
            accessibilityLabel={`${REST_ADJUST_SECONDS} seconds more rest`}>
            <Text style={styles.restButtonText}>+{REST_ADJUST_SECONDS}s</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.restButton, styles.skipButton, pressed && styles.pressed]}
            onPress={workout.stopRest}
            accessibilityRole="button">
            <Text style={[styles.restButtonText, styles.skipText]}>Skip</Text>
          </Pressable>
        </View>
      )}

      {customWorkoutId && customWorkoutId !== STARTER_WORKOUT_ID && (
        <ExercisePicker
          open={pickerOpen}
          takenIds={day.exercises.map((item) => item.exercise.id)}
          onClose={() => setPickerOpen(false)}
          onChoose={handleAddExercise}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colours.background,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colours.background,
  },
  message: {
    fontSize: 17,
    color: colours.textMuted,
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colours.text,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progress: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
  },
  elapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colours.accentSoft,
  },
  elapsedText: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.accent,
    fontVariant: ['tabular-nums'],
  },
  trophy: {
    alignSelf: 'center',
    marginTop: 2,
  },
  card: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: colours.surface,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  challengeGuide: {
    marginBottom: 12,
  },
  exerciseHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  swappedFrom: {
    fontSize: 14,
    color: colours.textMuted,
    marginTop: 1,
  },
  swapButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accentSoft,
  },
  swapButtonOpen: {
    backgroundColor: colours.accent,
  },
  exerciseName: {
    fontSize: 19,
    fontWeight: '700',
    color: colours.text,
  },
  exerciseDetail: {
    fontSize: 15,
    color: colours.text,
    marginTop: 2,
  },
  previous: {
    fontSize: 14,
    color: colours.accent,
    marginTop: 2,
  },
  goal: {
    fontSize: 14,
    fontWeight: '600',
    color: colours.accent,
    marginTop: 2,
  },
  columnLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  columnLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colours.textMuted,
    textAlign: 'center',
  },
  setColumn: {
    width: 32,
  },
  checkColumn: {
    width: 56,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  setNumber: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.textMuted,
    textAlign: 'center',
  },
  input: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.background,
    fontSize: 20,
    fontWeight: '600',
    color: colours.text,
    textAlign: 'center',
  },
  inputDone: {
    borderColor: colours.accentSoft,
    backgroundColor: colours.accentSoft,
  },
  noWeight: {
    fontSize: 15,
    color: colours.textMuted,
    textAlign: 'center',
  },
  check: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  checkDone: {
    backgroundColor: colours.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  emptyAdd: {
    fontSize: 16,
    lineHeight: 23,
    color: colours.textMuted,
  },
  addButton: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  addButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  finishButton: {
    minHeight: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
    marginTop: 8,
  },
  finishText: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.surface,
  },
  link: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.textMuted,
  },
  restBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colours.text,
  },
  restClock: {
    flex: 1,
  },
  restLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colours.accentSoft,
  },
  restTime: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.surface,
    fontVariant: ['tabular-nums'],
  },
  restButton: {
    minWidth: 60,
    height: 52,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  restButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.surface,
  },
  skipButton: {
    backgroundColor: colours.accent,
  },
  skipText: {
    color: colours.surface,
  },
});
