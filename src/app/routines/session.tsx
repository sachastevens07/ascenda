import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { SwapSheet } from '@/components/SwapSheet';
import { colours } from '@/constants/theme';
import {
  copyWorkoutName,
  describeCustomWorkoutError,
  duplicateRoutineDay,
  isFreeCustomWorkoutLimitError,
  isProRoutineDuplicateError,
  MAX_REPS,
  MAX_SETS,
  MIN_REPS,
  MIN_SETS,
} from '@/lib/customWorkouts';
import { openPaywall } from '@/lib/paywall';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import {
  describeWeightSuggestion,
  formatSetsAndReps,
  getWeightSuggestion,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';
import {
  daysInWeek,
  describeRoutineError,
  fetchActiveEnrolment,
  fetchRoutine,
  findPlannedSession,
  type PlannedSession,
  type Routine,
  type RoutineDayExercise,
} from '@/lib/routines';
import { fetchActiveSession, fetchPreviousSets, startRoutineSession, type LoggedSet } from '@/lib/sessions';
import { useSubscription } from '@/lib/subscription';
import { deleteUserSwap, exerciseFits, saveUserSwap, type SwapScope } from '@/lib/swaps';
import { saveSessionPlan } from '@/lib/workoutLog';

type DraftSlot = RoutineDayExercise & { original?: SlotExercise };

function toDraft(item: RoutineDayExercise): DraftSlot {
  return { ...item };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function SessionDetailScreen() {
  const { routineId, dayId, enrolmentId } = useLocalSearchParams<{
    routineId: string;
    dayId: string;
    enrolmentId: string;
  }>();
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const equipment = answers?.equipment ?? null;
  const { isPro } = useSubscription();
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [enrolmentIdState, setEnrolmentIdState] = useState(enrolmentId ?? '');
  const [planned, setPlanned] = useState<PlannedSession | null>(null);
  const [slots, setSlots] = useState<DraftSlot[]>([]);
  const [swapItem, setSwapItem] = useState<ProgrammeExercise | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSavingWorkout, setIsSavingWorkout] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [previous, setPrevious] = useState<Record<string, LoggedSet[]>>({});

  useEffect(() => {
    let isCurrent = true;
    (async () => {
      try {
        if (!routineId || !dayId) {
          setLoadState('error');
          return;
        }
        const [nextRoutine, enrolment] = await Promise.all([
          fetchRoutine(routineId),
          fetchActiveEnrolment(),
        ]);
        const nextPlanned = nextRoutine ? findPlannedSession(nextRoutine, dayId) : null;
        if (!isCurrent) return;
        if (!nextRoutine || !nextPlanned) {
          setLoadState('error');
          return;
        }
        setRoutine(nextRoutine);
        setEnrolmentIdState(enrolmentId || enrolment?.id || '');
        setPlanned(nextPlanned);
        setSlots(nextPlanned.day.exercises.map(toDraft));
        setLoadState('ready');
        const ids = nextPlanned.day.exercises.map((item) => item.exercise.id);
        fetchPreviousSets(ids)
          .then((sets) => {
            if (isCurrent) setPrevious(sets);
          })
          .catch(() => {});
      } catch {
        if (isCurrent) setLoadState('error');
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [routineId, dayId, enrolmentId]);

  const weekDays = useMemo(
    () => (routine && planned ? daysInWeek(routine, planned.weekNumber) : []),
    [routine, planned]
  );

  function applyDay(next: PlannedSession) {
    setPlanned(next);
    setSlots(next.day.exercises.map(toDraft));
    setSwapItem(null);
    const ids = next.day.exercises.map((item) => item.exercise.id);
    fetchPreviousSets(ids)
      .then(setPrevious)
      .catch(() => {});
  }

  function updateSlot(position: number, change: Partial<DraftSlot>) {
    setSlots((current) =>
      current.map((item) => (item.position === position ? { ...item, ...change } : item))
    );
  }

  function handleRemove(position: number) {
    const slot = slots.find((item) => item.position === position);
    if (!slot) return;
    showDialog(`Remove ${slot.exercise.name}?`, 'Only for today. The routine itself stays the same.', [
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setSlots((current) => current.filter((item) => item.position !== position)),
      },
      { text: 'Keep it', style: 'cancel' },
    ]);
  }

  async function handleSwap(exercise: SlotExercise, scope: SwapScope) {
    if (!swapItem || !planned) return;
    const { position } = swapItem;
    const current = slots.find((item) => item.position === position);
    if (scope === 'always' && planned.day.source_programme_day_id) {
      await saveUserSwap(planned.day.source_programme_day_id, position, exercise.id);
    }
    updateSlot(position, {
      exercise,
      original: current && current.exercise.id !== exercise.id ? current.exercise : current?.original,
    });
    if (!previous[exercise.id]) {
      fetchPreviousSets([exercise.id])
        .then((sets) => setPrevious((current) => ({ ...current, ...sets })))
        .catch(() => {});
    }
  }

  async function handleRestore() {
    if (!swapItem?.original || !planned) return;
    const { position, original } = swapItem;
    if (planned.day.source_programme_day_id) {
      await deleteUserSwap(planned.day.source_programme_day_id, position);
    }
    updateSlot(position, { exercise: original, original: undefined });
  }

  async function handleSaveWorkout() {
    if (!routine || !planned || slots.length === 0) return;
    if (routine.is_pro && !isPro) {
      openPaywall('routine');
      return;
    }
    setIsSavingWorkout(true);
    try {
      const copy = await duplicateRoutineDay(
        routine,
        {
          name: planned.day.name,
          exercises: slots.map((item) => ({
            exercise: item.exercise,
            sets: item.sets,
            rep_min: item.rep_min,
            rep_max: item.rep_max,
          })),
        },
        isPro,
        copyWorkoutName(planned.day.name)
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

  async function handleStart() {
    if (!planned || !enrolmentIdState || slots.length === 0) return;
    const active = await fetchActiveSession();
    if (active) {
      showDialog(
        'You already have a session going',
        'Finish or discard it first, then start this one.',
        [
          {
            text: 'Open it',
            onPress: () => router.replace({ pathname: '/session/[id]', params: { id: active.id } }),
          },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }
    setIsStarting(true);
    try {
      const swaps: Record<string, string> = {};
      for (const slot of slots) {
        const plannedSlot = planned.day.exercises.find((item) => item.position === slot.position);
        if (plannedSlot && plannedSlot.exercise.id !== slot.exercise.id) {
          swaps[String(slot.position)] = slot.exercise.id;
        }
      }
      const session = await startRoutineSession({
        enrolmentId: enrolmentIdState,
        routineDayId: planned.day.id,
        sourceProgrammeDayId: planned.day.source_programme_day_id,
        exerciseSwaps: swaps,
      });
      await saveSessionPlan(session.id, {
        slots: slots.map((slot) => ({
          position: slot.position,
          sets: slot.sets,
          rep_min: slot.rep_min,
          rep_max: slot.rep_max,
          rest_seconds: slot.rest_seconds,
          exercise: slot.exercise,
        })),
      });
      router.replace({ pathname: '/session/[id]', params: { id: session.id } });
    } catch (error) {
      showDialog('Couldn’t start the session', describeRoutineError(error));
    } finally {
      setIsStarting(false);
    }
  }

  if (loadState !== 'ready' || !planned || !routine) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <Text style={styles.message}>We couldn’t load this session. Go back and try again.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.label}>
          Week {planned.weekNumber} · day {planned.day.day_number} · about {routine.session_minutes} min
        </Text>
        <Text style={styles.title}>{planned.day.name}</Text>
        <Text style={styles.intro}>
          Change today only — swaps, sets and removals don’t rewrite the routine. Then start when
          you’re ready.
        </Text>

        {slots.map((item, index) => {
          const asProgramme: ProgrammeExercise = {
            position: item.position,
            sets: item.sets,
            rep_min: item.rep_min,
            rep_max: item.rep_max,
            exercise: item.exercise,
            original: item.original,
          };
          const isSwapping = swapItem?.position === item.position;
          const suggestion = getWeightSuggestion(asProgramme, previous[item.exercise.id]);
          return (
            <View key={`${item.position}-${item.exercise.id}`} style={styles.card}>
              <View style={styles.row}>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })
                  }
                  style={({ pressed }) => [styles.exerciseInfo, pressed && styles.pressed]}
                  accessibilityRole="button">
                  <Text style={styles.number}>{index + 1}</Text>
                  <View style={styles.exerciseText}>
                    <Text style={styles.exerciseName}>{item.exercise.name}</Text>
                    {item.original && equipment && exerciseFits(item.original, equipment) && (
                      <Text style={styles.swapped}>Instead of {item.original.name}</Text>
                    )}
                    <Text style={styles.detail}>{formatSetsAndReps(asProgramme)}</Text>
                    {isPro && (
                      <Text style={styles.suggestion}>{describeWeightSuggestion(suggestion)}</Text>
                    )}
                  </View>
                </Pressable>
                {isPro && (
                  <Pressable
                    onPress={() => setSwapItem(isSwapping ? null : asProgramme)}
                    style={({ pressed }) => [
                      styles.iconButton,
                      isSwapping && styles.iconButtonOpen,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Swap ${item.exercise.name}`}>
                    <Ionicons
                      name="swap-horizontal"
                      size={22}
                      color={isSwapping ? colours.surface : colours.accent}
                    />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => handleRemove(item.position)}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.exercise.name}`}>
                  <Ionicons name="close" size={22} color={colours.danger} />
                </Pressable>
              </View>
              {isPro && equipment && (
                <SwapSheet
                  open={isSwapping}
                  item={asProgramme}
                  equipment={equipment}
                  excludeIds={slots.flatMap((slot) =>
                    slot.original ? [slot.exercise.id, slot.original.id] : [slot.exercise.id]
                  )}
                  allowAlways={Boolean(planned.day.source_programme_day_id)}
                  alwaysDetail="Replaces it in this routine day"
                  onClose={() => setSwapItem(null)}
                  onSwap={handleSwap}
                  onRestore={handleRestore}
                />
              )}
              <View style={styles.steppers}>
                <Stepper
                  label="Sets"
                  value={item.sets}
                  display={`${item.sets}`}
                  onMinus={() => updateSlot(item.position, { sets: clamp(item.sets - 1, MIN_SETS, MAX_SETS) })}
                  onPlus={() => updateSlot(item.position, { sets: clamp(item.sets + 1, MIN_SETS, MAX_SETS) })}
                />
                <Stepper
                  label="Reps"
                  value={item.rep_min}
                  display={`${item.rep_min}–${item.rep_max}`}
                  onMinus={() =>
                    updateSlot(item.position, {
                      rep_min: clamp(item.rep_min - 1, MIN_REPS, item.rep_max),
                    })
                  }
                  onPlus={() =>
                    updateSlot(item.position, {
                      rep_max: clamp(item.rep_max + 1, item.rep_min, MAX_REPS),
                    })
                  }
                />
              </View>
            </View>
          );
        })}

        {slots.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.exerciseName}>No exercises left for today</Text>
            <Text style={styles.detail}>Add a different day, or go back and leave this session.</Text>
          </View>
        )}

        {weekDays.length > 1 && (
          <Pressable
            style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
            onPress={() => setIsPickerOpen(true)}
            accessibilityRole="button">
            <Text style={styles.outlineButtonText}>Do a different day</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
          onPress={handleSaveWorkout}
          disabled={isSavingWorkout || isStarting || slots.length === 0}
          accessibilityRole="button">
          <Text style={styles.outlineButtonText}>
            {isSavingWorkout
              ? 'Saving…'
              : routine.is_pro && !isPro
                ? 'Save as workout with Pro'
                : 'Save as workout'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.startButton, (pressed || isStarting) && styles.pressed]}
          onPress={handleStart}
          disabled={isStarting || isSavingWorkout || slots.length === 0}
          accessibilityRole="button">
          {isStarting ? (
            <ActivityIndicator color={colours.surface} />
          ) : (
            <Text style={styles.startButtonText}>Start session</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal
        visible={isPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsPickerOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsPickerOpen(false)}
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle}>Week {planned.weekNumber}</Text>
          <ScrollView>
            {weekDays.map((day) => {
              const isSelected = day.id === planned.day.id;
              const next = routine ? findPlannedSession(routine, day.id) : null;
              return (
                <Pressable
                  key={day.id}
                  onPress={() => {
                    if (next) applyDay(next);
                    setIsPickerOpen(false);
                  }}
                  style={styles.sheetRow}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}>
                  <View style={styles.exerciseText}>
                    <Text style={[styles.sheetRowText, isSelected && styles.sheetRowTextSelected]}>
                      Day {day.day_number}: {day.name}
                    </Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark" size={22} color={colours.accent} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
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
  value: number;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={onMinus}
          style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Fewer ${label.toLowerCase()}`}>
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{display}</Text>
        <Pressable
          onPress={onPlus}
          style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`More ${label.toLowerCase()}`}>
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colours.background,
  },
  content: {
    padding: 24,
    paddingTop: 8,
    gap: 12,
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
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: colours.accent,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colours.text,
  },
  intro: {
    fontSize: 16,
    lineHeight: 22,
    color: colours.textMuted,
    marginBottom: 8,
  },
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: colours.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exerciseInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  number: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 32,
    fontSize: 15,
    fontWeight: '700',
    color: colours.accent,
    backgroundColor: colours.accentSoft,
  },
  exerciseText: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 17,
    fontWeight: '600',
    color: colours.text,
  },
  swapped: {
    fontSize: 14,
    color: colours.accent,
    marginTop: 2,
  },
  detail: {
    fontSize: 15,
    color: colours.textMuted,
    marginTop: 2,
  },
  suggestion: {
    fontSize: 14,
    color: colours.accent,
    marginTop: 2,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accentSoft,
  },
  iconButtonOpen: {
    backgroundColor: colours.accent,
  },
  steppers: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  stepper: {
    flex: 1,
  },
  stepperLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colours.textMuted,
    marginBottom: 6,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: colours.background,
    paddingHorizontal: 6,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    fontSize: 22,
    fontWeight: '600',
    color: colours.accent,
  },
  stepperValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colours.text,
  },
  outlineButton: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
    marginTop: 8,
  },
  outlineButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  startButton: {
    minHeight: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
    marginTop: 4,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.surface,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31, 27, 36, 0.35)',
  },
  sheet: {
    maxHeight: '70%',
    paddingTop: 20,
    paddingHorizontal: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colours.surface,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colours.border,
  },
  sheetRowText: {
    fontSize: 17,
    color: colours.text,
  },
  sheetRowTextSelected: {
    fontWeight: '700',
    color: colours.accent,
  },
  pressed: {
    opacity: 0.7,
  },
});
