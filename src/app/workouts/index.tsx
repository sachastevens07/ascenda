import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AnchoredMenu,
  MenuHeader,
  MenuRow,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/AnchoredMenu';
import { showDialog } from '@/components/Dialog';
import { AppText } from '@/components/ui/AppText';
import { colours } from '@/constants/theme';
import {
  deleteCustomWorkout,
  describeCustomWorkoutError,
  duplicateCustomWorkout,
  fetchCustomWorkouts,
  missingCustomWorkoutsMessage,
  startBlankCustomSession,
  type CustomWorkout,
} from '@/lib/customWorkouts';
import {
  addCustomWorkoutToPlanner,
  describePlannerError,
  upcomingPlannerDays,
} from '@/lib/planner';
import { confirmFirstSessionSafety } from '@/lib/firstSession';
import { ensureSubscribed } from '@/lib/paywall';
import { fetchActiveSession, startCustomSession } from '@/lib/sessions';

type LoadState = 'loading' | 'error' | 'ready';

export default function WorkoutsScreen() {
  const insets = useSafeAreaInsets();
  const [workouts, setWorkouts] = useState<CustomWorkout[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [missingSql, setMissingSql] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [plannerWorkout, setPlannerWorkout] = useState<CustomWorkout | null>(null);
  const [plannerAnchor, setPlannerAnchor] = useState<AnchorRect | null>(null);

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

  function handleCreate() {
    router.push({ pathname: '/workouts/[id]', params: { id: 'new' } });
  }

  async function handleStartBlank() {
    if (!ensureSubscribed()) return;
    setBusyId('blank');
    try {
      const allowed = await confirmFirstSessionSafety();
      if (!allowed) return;
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
      const session = await startBlankCustomSession();
      router.push({ pathname: '/session/[id]', params: { id: session.id } });
    } catch (error) {
      showDialog('Couldn’t start the workout', describeCustomWorkoutError(error));
    } finally {
      setBusyId(null);
    }
  }

  async function handleStart(workout: CustomWorkout) {
    if (!ensureSubscribed()) return;
    setBusyId(workout.id);
    try {
      const allowed = await confirmFirstSessionSafety();
      if (!allowed) return;
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
    setBusyId(workout.id);
    try {
      const copy = await duplicateCustomWorkout(workout);
      setWorkouts((current) => {
        const starter = current.filter((item) => item.is_starter);
        const rest = current.filter((item) => !item.is_starter && item.id !== copy.id);
        return [...starter, copy, ...rest];
      });
      router.push({ pathname: '/workouts/[id]', params: { id: copy.id } });
    } catch (error) {
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
            <AppText variant="body" style={styles.message}>
              {missingSql
                ? missingCustomWorkoutsMessage()
                : 'We couldn’t load your workouts. Check your connection and try again.'}
            </AppText>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              onPress={() => {
                setLoadState('loading');
                setAttempt((count) => count + 1);
              }}
              accessibilityRole="button">
              <AppText variant="bodyStrong" style={styles.buttonText}>
                Try again
              </AppText>
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
      <AppText variant="display" style={styles.title}>
        My workouts
      </AppText>
      <AppText variant="body" style={styles.lead}>
        Create as many as you like. Start one, or add it to a day in the planner.
      </AppText>

      <View style={styles.card}>
        <AppText variant="eyebrow" style={styles.kicker}>
          New
        </AppText>
        <AppText variant="title2" style={styles.cardTitle}>
          Create workout
        </AppText>
        <AppText variant="bodySm" style={styles.cardMeta}>
          Name it, pick exercises, set sets and reps, then save.
        </AppText>
        <Pressable
          style={({ pressed }) => [styles.primary, styles.islandButton, pressed && styles.pressed]}
          onPress={handleCreate}
          disabled={busyId !== null}
          accessibilityRole="button">
          <AppText variant="bodyStrong" style={styles.primaryText}>
            Create workout
          </AppText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          onPress={handleStartBlank}
          disabled={busyId !== null}
          accessibilityRole="button">
          <AppText variant="bodyStrong" style={styles.linkText}>
            {busyId === 'blank' ? 'Starting…' : 'Or start empty and add lifts as you go'}
          </AppText>
        </Pressable>
      </View>

      {starter && (
        <WorkoutCard
          workout={starter}
          busy={busyId === starter.id}
          onStart={() => handleStart(starter)}
          onDuplicate={() => handleDuplicate(starter)}
          onPlan={(anchor) => {
              setPlannerAnchor(anchor);
              setPlannerWorkout(starter);
            }}
        />
      )}

      {mine.length === 0 ? (
        <AppText variant="body" style={styles.empty}>
          Your saved workouts will show here. Create one, or copy the starter and change it.
        </AppText>
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
            onPlan={(anchor) => {
              setPlannerAnchor(anchor);
              setPlannerWorkout(workout);
            }}
          />
        ))
      )}

      <AnchoredMenu
        visible={plannerWorkout !== null}
        anchor={plannerAnchor}
        onClose={() => setPlannerWorkout(null)}>
        <MenuHeader
          label="Add to planner"
          detail={
            plannerWorkout
              ? `Pick a day for ${plannerWorkout.name}. It will show on the Planner week.`
              : undefined
          }
        />
        {upcomingPlannerDays().map((day) => (
          <MenuRow
            key={day.iso}
            label={day.isToday ? `${day.label} · today` : day.label}
            onPress={() => handlePlan(day.iso)}
          />
        ))}
      </AnchoredMenu>
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
  onPlan: (anchor: AnchorRect) => void;
}) {
  const planRef = useRef<AnchorHandle>(null);
  const count = workout.exercises.length;
  return (
    <View style={styles.card}>
      {workout.is_starter && (
        <AppText variant="eyebrow" style={styles.kicker}>
          Starter
        </AppText>
      )}
      <AppText variant="title2" style={styles.cardTitle}>
        {workout.name}
      </AppText>
      <AppText variant="bodySm" style={styles.cardMeta}>
        {count} {count === 1 ? 'exercise' : 'exercises'}
      </AppText>
      <Pressable
        style={({ pressed }) => [styles.button, (pressed || busy) && styles.pressed]}
        onPress={onStart}
        disabled={busy}
        accessibilityRole="button">
        <AppText variant="bodyStrong" style={styles.buttonText}>
          {busy ? 'Starting…' : 'Start'}
        </AppText>
      </Pressable>
      <View style={styles.actions}>
        {onEdit && (
          <Pressable onPress={onEdit} style={styles.link} accessibilityRole="button">
            <AppText variant="bodyStrong" style={styles.linkText}>
              Edit
            </AppText>
          </Pressable>
        )}
        <Pressable onPress={onDuplicate} style={styles.link} accessibilityRole="button">
          <AppText variant="bodyStrong" style={styles.linkText}>
            Duplicate
          </AppText>
        </Pressable>
        <Pressable
          ref={planRef}
          collapsable={false}
          onPress={() => measureAnchor(planRef.current, onPlan)}
          style={styles.link}
          accessibilityRole="button">
          <AppText variant="bodyStrong" style={styles.linkText}>
            Add to planner
          </AppText>
        </Pressable>
        {onDelete && (
          <Pressable onPress={onDelete} style={styles.link} accessibilityRole="button">
            <AppText variant="bodyStrong" style={styles.dangerText}>
              Delete
            </AppText>
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
    color: colours.text,
  },
  lead: {
    color: colours.textMuted,
    marginTop: -8,
  },
  message: {
    color: colours.textMuted,
    textAlign: 'center',
  },
  empty: {
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
    color: colours.accent,
  },
  card: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: colours.surface,
  },
  kicker: {
    color: colours.accent,
    marginBottom: 6,
  },
  cardTitle: {
    color: colours.text,
  },
  cardMeta: {
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
    color: colours.accent,
  },
  dangerText: {
    color: colours.danger,
  },
  pressed: {
    opacity: 0.7,
  },
});
