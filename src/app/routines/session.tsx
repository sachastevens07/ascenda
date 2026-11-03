import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { SwapSheet } from '@/components/SwapSheet';
import {
  EmptyState,
  IconButton,
  ListRow,
  MenuHeader,
  MenuRow,
  OverflowMenu,
  PrimaryButton,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
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
import { getExerciseImageSource } from '@/lib/exerciseMedia';
import { openPaywall } from '@/lib/paywall';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import {
  formatKg,
  formatSetsAndReps,
  getWeightSuggestion,
  usesWeight,
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
import {
  fetchActiveSession,
  fetchPreviousSets,
  heaviestWeight,
  startRoutineSession,
  type LoggedSet,
} from '@/lib/sessions';
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

function formatCompactSets(item: Pick<DraftSlot, 'sets' | 'rep_min' | 'rep_max'>): string {
  const reps = item.rep_min === item.rep_max ? `${item.rep_min}` : `${item.rep_min}-${item.rep_max}`;
  return `${item.sets} × ${reps}`;
}

function lastWeightLabel(sets: LoggedSet[] | undefined): string | null {
  const kg = heaviestWeight(sets);
  return kg === null ? null : `${formatKg(kg)} last time`;
}

function ExerciseThumb({ slot }: { slot: DraftSlot }) {
  const { colours, radius, type } = useTheme();
  const photo = getExerciseImageSource(slot.exercise);
  return (
    <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
      {photo ? (
        <Image source={photo} style={styles.photoFill} resizeMode="cover" />
      ) : (
        <Text style={[type.title3, { color: colours.brand }]}>{slot.exercise.name.slice(0, 1)}</Text>
      )}
    </View>
  );
}

export default function SessionDetailScreen() {
  const { routineId, dayId, enrolmentId } = useLocalSearchParams<{
    routineId: string;
    dayId: string;
    enrolmentId: string;
  }>();
  const insets = useSafeAreaInsets();
  const { colours, type, spacing, radius, shadow } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const equipment = answers?.equipment ?? null;
  const { isPro } = useSubscription();
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [enrolmentIdState, setEnrolmentIdState] = useState(enrolmentId ?? '');
  const [planned, setPlanned] = useState<PlannedSession | null>(null);
  const [slots, setSlots] = useState<DraftSlot[]>([]);
  const [swapItem, setSwapItem] = useState<ProgrammeExercise | null>(null);
  const [editSlot, setEditSlot] = useState<DraftSlot | null>(null);
  const menuRef = useRef<AnchorHandle>(null);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMode, setMenuMode] = useState<'actions' | 'days'>('actions');
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
    setEditSlot(null);
    const ids = next.day.exercises.map((item) => item.exercise.id);
    fetchPreviousSets(ids)
      .then(setPrevious)
      .catch(() => {});
  }

  function updateSlot(position: number, change: Partial<DraftSlot>) {
    setSlots((current) =>
      current.map((item) => (item.position === position ? { ...item, ...change } : item))
    );
    setEditSlot((current) =>
      current && current.position === position ? { ...current, ...change } : current
    );
  }

  function handleRemove(position: number) {
    const slot = slots.find((item) => item.position === position);
    if (!slot) return;
    showDialog(`Remove ${slot.exercise.name}?`, 'Only for today. The routine itself stays the same.', [
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setSlots((current) => current.filter((item) => item.position !== position));
          setEditSlot((current) => (current?.position === position ? null : current));
          setSwapItem((current) => (current?.position === position ? null : current));
        },
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
        .then((sets) => setPrevious((currentSets) => ({ ...currentSets, ...sets })))
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

  const showStartingTip = slots.some((item) => {
    if (!usesWeight(item.exercise.equipment)) return false;
    return (
      getWeightSuggestion(
        {
          position: item.position,
          sets: item.sets,
          rep_min: item.rep_min,
          rep_max: item.rep_max,
          exercise: item.exercise,
        },
        previous[item.exercise.id]
      ).kind === 'find-starting-weight'
    );
  });

  if (loadState !== 'ready' || !planned || !routine) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: '',
            headerBackTitle: 'Home',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colours.bg },
            headerTintColor: colours.brand,
          }}
        />
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <Text style={[type.body, { color: colours.inkMuted, textAlign: 'center' }]}>
            We couldn’t load this session. Go back and try again.
          </Text>
        )}
      </View>
    );
  }

  const busy = isStarting || isSavingWorkout;
  const saveLabel =
    routine.is_pro && !isPro && !isSavingWorkout
      ? 'Save as workout with Pro'
      : isSavingWorkout
        ? 'Saving…'
        : 'Save as workout';

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen
        options={{
          headerShown: true,
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
        }}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={[type.eyebrow, { color: colours.accent }]}>
          Week {planned.weekNumber} · day {planned.day.day_number}
        </Text>
        <Text style={[type.title1, { color: colours.ink, marginTop: spacing.sm }]}>{planned.day.name}</Text>
        <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 4 }]}>
          {routine.session_minutes} min · {slots.length} {slots.length === 1 ? 'exercise' : 'exercises'}
        </Text>

        {showStartingTip ? (
          <View
            style={[
              styles.tip,
              { backgroundColor: colours.brandSoft, borderRadius: radius.lg, marginTop: spacing.lg },
            ]}>
            <Ionicons name="information-circle-outline" size={20} color={colours.brand} />
            <Text style={[type.bodySm, { color: colours.ink, flex: 1 }]}>Find your starting weight</Text>
          </View>
        ) : null}

        <View
          style={[
            styles.list,
            { backgroundColor: colours.surface, borderRadius: radius.lg, marginTop: spacing.lg },
          ]}>
          {slots.map((item) => {
            const asProgramme: ProgrammeExercise = {
              position: item.position,
              sets: item.sets,
              rep_min: item.rep_min,
              rep_max: item.rep_max,
              exercise: item.exercise,
              original: item.original,
            };
            const isSwapping = swapItem?.position === item.position;
            const last = lastWeightLabel(previous[item.exercise.id]);
            const subtitle = [
              formatCompactSets(item),
              last,
              item.original && equipment && exerciseFits(item.original, equipment)
                ? `Instead of ${item.original.name}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <View key={`${item.position}-${item.exercise.id}`}>
                <ListRow
                  title={item.exercise.name}
                  subtitle={subtitle}
                  showChevron={false}
                  onPress={() => {
                    setSwapItem(null);
                    setEditSlot(item);
                  }}
                  left={
                    <Pressable
                      onPress={() =>
                        router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${item.exercise.name} guide`}>
                      <ExerciseThumb slot={item} />
                    </Pressable>
                  }
                  right={
                    <View style={styles.rowActions}>
                      {isPro ? (
                        <IconButton
                          icon="swap-horizontal"
                          variant="muted"
                          accessibilityLabel={`Swap ${item.exercise.name}`}
                          onPress={() => {
                            setEditSlot(null);
                            setSwapItem(isSwapping ? null : asProgramme);
                          }}
                          color={isSwapping ? colours.onBrand : colours.ink}
                          style={isSwapping ? { backgroundColor: colours.brand } : undefined}
                        />
                      ) : null}
                      <IconButton
                        icon="close"
                        variant="muted"
                        accessibilityLabel={`Remove ${item.exercise.name}`}
                        onPress={() => handleRemove(item.position)}
                        color={colours.danger}
                      />
                    </View>
                  }
                />
                {isPro && equipment ? (
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
                ) : null}
              </View>
            );
          })}

          {slots.length === 0 ? (
            <EmptyState
              icon="barbell-outline"
              title="No exercises left for today"
              body="Add a different day, or go back and leave this session."
            />
          ) : null}
        </View>
      </ScrollView>

      <View
        style={[
          styles.sticky,
          { backgroundColor: colours.bg, paddingBottom: insets.bottom + 12 },
          shadow,
        ]}>
        <PrimaryButton
          label="Start session"
          loading={isStarting}
          disabled={busy || slots.length === 0}
          onPress={handleStart}
        />
      </View>

      <OverflowMenu visible={menuOpen} anchor={menuAnchor} onClose={closeMenu}>
        {menuMode === 'days' ? (
          <>
            <MenuHeader label="Do a different day" />
            {weekDays.map((day) => {
              const isSelected = day.id === planned.day.id;
              const next = findPlannedSession(routine, day.id);
              return (
                <MenuRow
                  key={day.id}
                  label={`Day ${day.day_number}: ${day.name}`}
                  selected={isSelected}
                  onPress={() => {
                    if (next) applyDay(next);
                    closeMenu();
                  }}
                />
              );
            })}
          </>
        ) : (
          <>
            <MenuHeader label={planned.day.name} />
            {weekDays.length > 1 ? (
              <MenuRow label="Do a different day" onPress={() => setMenuMode('days')} />
            ) : null}
            <MenuRow
              label={saveLabel}
              onPress={() => {
                closeMenu();
                void handleSaveWorkout();
              }}
            />
          </>
        )}
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
                  {formatSetsAndReps(editSlot)}
                </Text>
                <View style={styles.steppers}>
                  <Stepper
                    label="Sets"
                    display={`${editSlot.sets}`}
                    onMinus={() =>
                      updateSlot(editSlot.position, {
                        sets: clamp(editSlot.sets - 1, MIN_SETS, MAX_SETS),
                      })
                    }
                    onPlus={() =>
                      updateSlot(editSlot.position, {
                        sets: clamp(editSlot.sets + 1, MIN_SETS, MAX_SETS),
                      })
                    }
                  />
                  <Stepper
                    label="Reps"
                    display={`${editSlot.rep_min}-${editSlot.rep_max}`}
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
                </View>
                <PrimaryButton label="Done" onPress={() => setEditSlot(null)} style={{ marginTop: spacing.lg }} />
              </>
            ) : null}
          </View>
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
  display: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const { colours, type, radius } = useTheme();
  return (
    <View style={styles.stepper}>
      <Text style={[type.caption, { color: colours.inkMuted, marginBottom: 6 }]}>{label}</Text>
      <View
        style={[
          styles.stepperControls,
          { backgroundColor: colours.bg, borderRadius: radius.full },
        ]}>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  list: {
    overflow: 'hidden',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  sticky: {
    paddingHorizontal: 20,
    paddingTop: 12,
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
    paddingTop: 24,
  },
  steppers: {
    flexDirection: 'row',
    gap: 12,
  },
  stepper: {
    flex: 1,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 6,
  },
  stepperButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
