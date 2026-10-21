import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { colours } from '@/constants/theme';
import {
  deleteCustomWorkout,
  duplicateCustomWorkout,
  fetchCustomWorkouts,
  missingCustomWorkoutsMessage,
  type CustomWorkout,
} from '@/lib/customWorkouts';
import { fetchActiveSession, startCustomSession } from '@/lib/sessions';

type LoadState = 'loading' | 'error' | 'ready';

export default function WorkoutsScreen() {
  const insets = useSafeAreaInsets();
  const [workouts, setWorkouts] = useState<CustomWorkout[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [missingSql, setMissingSql] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

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
      const detail = error instanceof Error ? error.message : '';
      showDialog(
        'Couldn’t start the workout',
        /custom_workouts/i.test(detail) ? missingCustomWorkoutsMessage() : 'Check your connection and try again.'
      );
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
    } catch {
      showDialog('Couldn’t copy it', 'Check your connection and try again.');
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
  const mine = workouts.filter((item) => !item.is_starter);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      <Text style={styles.title}>My workouts</Text>
      <Text style={styles.lead}>
        Build your own sessions, or start with the quiet-spot starter. Free for everyone.
      </Text>

      <Pressable
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: 'new' } })}
        accessibilityRole="button">
        <Text style={styles.primaryText}>Create workout</Text>
      </Pressable>

      {starter && (
        <WorkoutCard
          workout={starter}
          busy={busyId === starter.id}
          onStart={() => handleStart(starter)}
          onDuplicate={() => handleDuplicate(starter)}
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
          />
        ))
      )}

      <Text style={styles.disclaimer}>
        General fitness guidance, not medical advice. Stop if anything hurts.
      </Text>
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
}: {
  workout: CustomWorkout;
  busy: boolean;
  onStart: () => void;
  onEdit?: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
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
});
