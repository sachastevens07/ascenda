import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { colours } from '@/constants/theme';
import {
  FREE_CUSTOM_WORKOUT_LIMIT,
  atFreeCustomWorkoutLimit,
  deleteCustomWorkout,
  describeCustomWorkoutError,
  duplicateCustomWorkout,
  fetchCustomWorkouts,
  isFreeCustomWorkoutLimitError,
  missingCustomWorkoutsMessage,
  ownedCustomWorkoutCount,
  startBlankCustomSession,
  type CustomWorkout,
} from '@/lib/customWorkouts';
import {
  addCustomWorkoutToPlanner,
  describePlannerError,
  upcomingPlannerDays,
} from '@/lib/planner';
import { openPaywall } from '@/lib/paywall';
import { fetchActiveSession, startCustomSession } from '@/lib/sessions';
import { useSubscription } from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'ready';

export default function WorkoutsScreen() {
  const insets = useSafeAreaInsets();
  const { isPro } = useSubscription();
  const [workouts, setWorkouts] = useState<CustomWorkout[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [missingSql, setMissingSql] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [plannerWorkout, setPlannerWorkout] = useState<CustomWorkout | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      (async () => {
        try {
          const list = await fetchCustomWorkouts();
          if (!isCurrent) return;
          setWorkouts(list);
          setMissingSql(list.length === 0);
          setLoadState('ready');
        } catch (error) {
          if (!isCurrent) return;
          const detail = error instanceof Error ? error.message : '';
          setMissingSql(/custom_workouts/i.test(detail));
          setLoadState((state) => (state === 'ready' ? state : 'error'));
        }
      })();
      return () => {
        isCurrent = false;
      };
    }, [attempt])
  );

  const mine = workouts.filter((item) => !item.is_starter);
  const ownedCount = ownedCustomWorkoutCount(workouts);
  const atLimit = atFreeCustomWorkoutLimit(ownedCount, isPro);

  function requireCreateRoom(): boolean {
    if (atLimit) {
      openPaywall('custom-limit');
      return false;
    }
    return true;
  }

  function handleCreate() {
    if (!requireCreateRoom()) return;
    router.push({ pathname: '/workouts/[id]', params: { id: 'new' } });
  }

  async function handleStartBlank() {
    if (!requireCreateRoom()) return;
    setBusyId('blank');
    try {
      const active = await fetchActiveSession();
      if (active) {
        showDialog(
          'You already have a session going',
          'Finish or discard it first, then start this workout.',
          [
            {
              text: 'Open it',
              onPress: () => router.push({ pathname: '/session/[id]', params: { id: active.id } }),
            },
            { text: 'OK', style: 'cancel' },
          ]
        );
        return;
      }
      const session = await startBlankCustomSession(isPro);
      router.push({ pathname: '/session/[id]', params: { id: session.id } });
    } catch (error) {
      if (isFreeCustomWorkoutLimitError(error)) {
        openPaywall('custom-limit');
        return;
      }
      showDialog('Couldn’t start the workout', describeCustomWorkoutError(error));
    } finally {
      setBusyId(null);
    }
  }

  async function handleStart(workout: CustomWorkout) {
    setBusyId(workout.id);
    try {
      const active = await fetchActiveSession();
      if (active) {
        showDialog(
          'You already have a session going',
          'Finish or discard it first, then start this workout.',
          [
            {
              text: 'Open it',
              onPress: () => router.push({ pathname: '/session/[id]', params: { id: active.id } }),
            },
            { text: 'OK', style: 'cancel' },
          ]
        );
        return;
      }
      const session = await startCustomSession(workout.id);
      router.push({ pathname: '/session/[id]', params: { id: session.id } });
    } catch (error) {
      showDialog('Couldn’t start the workout', describeCustomWorkoutError(error));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(workout: CustomWorkout) {
    if (!requireCreateRoom()) return;
    setBusyId(workout.id);
    try {
      const copy = await duplicateCustomWorkout(workout, isPro);
      setWorkouts((current) => {
        const starter = current.filter((item) => item.is_starter);
        const rest = current.filter((item) => !item.is_starter && item.id !== copy.id);
        return [...starter, copy, ...rest];
      });
      router.push({ pathname: '/workouts/[id]', params: { id: copy.id } });
    } catch (error) {
      if (isFreeCustomWorkoutLimitError(error)) {
        openPaywall('custom-limit');
        return;
      }
      showDialog('Couldn’t copy it', describeCustomWorkoutError(error));
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(workout: CustomWorkout) {
    showDialog(`Delete ${workout.name}?`, 'Your past sessions stay. This only removes the saved workout.', [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(workout.id);
          try {
            await deleteCustomWorkout(workout.id);
            setWorkouts((current) => current.filter((item) => item.id !== workout.id));
          } catch {
            showDialog('Couldn’t delete it', 'Check your connection and try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
      { text: 'Keep it', style: 'cancel' },
    ]);
  }

  async function handlePlan(date: string) {
    if (!plannerWorkout) return;
    const workout = plannerWorkout;
    setBusyId(workout.id);
    try {
      const day = upcomingPlannerDays().find((item) => item.iso === date);
      await addCustomWorkoutToPlanner(workout.id, date);
      setPlannerWorkout(null);
      showDialog(
        'Added to your planner',
        `${workout.name} is on ${day?.label ?? date}. Open Planner to see your week.`
      );
    } catch (error) {
      showDialog('Couldn’t add it', describePlannerError(error));
    } finally {
      setBusyId(null);
    }
  }

  if (loadState !== 'ready') {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <>
            <Text style={styles.message}>
              {missingSql
                ? missingCustomWorkoutsMessage()
                : 'We couldn’t load your workouts. Check your connection and try again.'}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              onPress={() => {
                setLoadState('loading');
                setAttempt((count) => count + 1);
              }}
              accessibilityRole="button">
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  const starter = workouts.find((item) => item.is_starter);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      <Text style={styles.title}>My workouts</Text>
      <Text style={styles.lead}>
        {isPro
          ? 'Create as many as you like. Start one, or add it to a day in the planner.'
          : `Free includes ${FREE_CUSTOM_WORKOUT_LIMIT} saved workouts (${ownedCount} of ${FREE_CUSTOM_WORKOUT_LIMIT}). Duplicates count. The starter does not. Existing ones stay if a plan lapses.`}
      </Text>

      <View style={styles.card}>
        <Text style={styles.kicker}>New</Text>
        <Text style={styles.cardTitle}>Create workout</Text>
        <Text style={styles.cardMeta}>Name it, pick exercises, set sets and reps, then save.</Text>
        <Pressable
          style={({ pressed }) => [styles.primary, styles.islandButton, pressed && styles.pressed]}
          onPress={handleCreate}
          disabled={busyId !== null}
          accessibilityRole="button">
          <Text style={styles.primaryText}>{atLimit ? 'Create with Pro' : 'Create workout'}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          onPress={handleStartBlank}
          disabled={busyId !== null}
          accessibilityRole="button">
          <Text style={styles.linkText}>
            {busyId === 'blank' ? 'Starting…' : 'Or start empty and add lifts as you go'}
          </Text>
        </Pressable>
      </View>

      {starter && (
        <WorkoutCard
          workout={starter}
          busy={busyId === starter.id}
          onStart={() => handleStart(starter)}
          onDuplicate={() => handleDuplicate(starter)}
          onPlan={() => setPlannerWorkout(starter)}
        />
      )}

      {mine.length === 0 ? (
        <Text style={styles.empty}>
          Your saved workouts will show here. Create one, or copy the starter and change it.
        </Text>
      ) : (
        mine.map((workout) => (
          <WorkoutCard
            key={workout.id}
            workout={workout}
            busy={busyId === workout.id}
            onStart={() => handleStart(workout)}
            onEdit={() => router.push({ pathname: '/workouts/[id]', params: { id: workout.id } })}
            onDuplicate={() => handleDuplicate(workout)}
            onDelete={() => confirmDelete(workout)}
            onPlan={() => setPlannerWorkout(workout)}
          />
        ))
      )}

      <Text style={styles.disclaimer}>
        General fitness guidance, not medical advice. Stop if anything hurts.
      </Text>

      <Modal
        visible={plannerWorkout !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPlannerWorkout(null)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setPlannerWorkout(null)}
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle}>Add to planner</Text>
          <Text style={styles.sheetLead}>
            {plannerWorkout
              ? `Pick a day for ${plannerWorkout.name}. It will show on the Planner week.`
              : ''}
          </Text>
          <ScrollView>
            {upcomingPlannerDays().map((day) => (
              <Pressable
                key={day.iso}
                onPress={() => handlePlan(day.iso)}
                style={styles.sheetRow}
                accessibilityRole="button">
                <Text style={styles.sheetRowText}>
                  {day.label}
                  {day.isToday ? ' · today' : ''}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

function WorkoutCard({
  workout,
  busy,
  onStart,
  onEdit,
  onDuplicate,
  onDelete,
  onPlan,
}: {
  workout: CustomWorkout;
  busy: boolean;
  onStart: () => void;
  onEdit?: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
  onPlan: () => void;
}) {
  const count = workout.exercises.length;
  return (
    <View style={styles.card}>
      {workout.is_starter && <Text style={styles.kicker}>Starter</Text>}
      <Text style={styles.cardTitle}>{workout.name}</Text>
      <Text style={styles.cardMeta}>
        {count} {count === 1 ? 'exercise' : 'exercises'}
      </Text>
      <Pressable
        style={({ pressed }) => [styles.button, (pressed || busy) && styles.pressed]}
        onPress={onStart}
        disabled={busy}
        accessibilityRole="button">
        <Text style={styles.buttonText}>{busy ? 'Starting…' : 'Start'}</Text>
      </Pressable>
      <View style={styles.actions}>
        {onEdit && (
          <Pressable onPress={onEdit} style={styles.link} accessibilityRole="button">
            <Text style={styles.linkText}>Edit</Text>
          </Pressable>
        )}
        <Pressable onPress={onDuplicate} style={styles.link} accessibilityRole="button">
          <Text style={styles.linkText}>Duplicate</Text>
        </Pressable>
        <Pressable onPress={onPlan} style={styles.link} accessibilityRole="button">
          <Text style={styles.linkText}>Add to planner</Text>
        </Pressable>
        {onDelete && (
          <Pressable onPress={onDelete} style={styles.link} accessibilityRole="button">
            <Text style={styles.dangerText}>Delete</Text>
          </Pressable>
        )}
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
    paddingTop: 16,
    gap: 16,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colours.background,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
  },
  lead: {
    fontSize: 16,
    lineHeight: 23,
    color: colours.textMuted,
    marginTop: -8,
  },
  message: {
    fontSize: 17,
    lineHeight: 24,
    color: colours.textMuted,
    textAlign: 'center',
  },
  empty: {
    fontSize: 16,
    lineHeight: 23,
    color: colours.textMuted,
  },
  primary: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
  },
  islandButton: {
    marginTop: 16,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.surface,
  },
  button: {
    minHeight: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
    marginTop: 12,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  card: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: colours.surface,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colours.accent,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colours.text,
  },
  cardMeta: {
    fontSize: 15,
    color: colours.textMuted,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
  },
  link: {
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
  },
  dangerText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.danger,
  },
  pressed: {
    opacity: 0.7,
  },
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    textAlign: 'center',
    marginTop: 8,
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
  },
  sheetLead: {
    fontSize: 15,
    lineHeight: 22,
    color: colours.textMuted,
    marginTop: 6,
    marginBottom: 8,
  },
  sheetRow: {
    minHeight: 56,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colours.border,
  },
  sheetRowText: {
    fontSize: 17,
    color: colours.text,
  },
});
