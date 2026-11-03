import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { colours } from '@/constants/theme';
import { STREAK_STRETCH_MIN_SECONDS } from '@/lib/activityStats';
import { maybeAskSessionReminders, syncPlannerReminders } from '@/lib/reminders';
import { formatClock } from '@/lib/workoutLog';
import { discardSession, fetchSession, finishSession } from '@/lib/sessions';
import {
  describeStretchError,
  formatHold,
  loadStretchStepsForSession,
  type StretchPlayStep,
} from '@/lib/stretches';
import { useNow, useWorkout } from '@/lib/workout';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

export default function StretchPlayScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const insets = useSafeAreaInsets();
  const workout = useWorkout();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [steps, setSteps] = useState<StretchPlayStep[]>([]);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(true);
  const [endsAt, setEndsAt] = useState(Date.now());
  const [isSaving, setIsSaving] = useState(false);
  const now = useNow(running && loadState === 'ready', 200);

  const step = steps[index] ?? null;
  const remaining = step ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  const holdDone = Boolean(step) && remaining <= 0;
  const isLast = index >= steps.length - 1;

  const startHold = useCallback((next: StretchPlayStep) => {
    setEndsAt(Date.now() + next.durationSeconds * 1000);
    setRunning(true);
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setLoadState('not-found');
      return;
    }
    let isCurrent = true;
    (async () => {
      const session = await fetchSession(sessionId);
      if (!session || session.source !== 'stretch') {
        if (isCurrent) setLoadState('not-found');
        return;
      }
      const loaded = await loadStretchStepsForSession(session);
      if (!isCurrent) return;
      if (!loaded) {
        setLoadState('error');
        return;
      }
      setSteps(loaded.steps);
      setStartedAt(Date.parse(session.started_at) || Date.now());
      setIndex(0);
      setEndsAt(Date.now() + loaded.steps[0].durationSeconds * 1000);
      setRunning(true);
      workout.publish(
        {
          sessionId: session.id,
          dayName: loaded.dayName,
          startedAt: Date.parse(session.started_at),
          source: 'stretch',
        },
        null
      );
      setLoadState('ready');
    })().catch(() => {
      if (isCurrent) setLoadState('error');
    });
    return () => {
      isCurrent = false;
    };
  }, [sessionId, workout.publish]);

  useEffect(() => {
    if (!holdDone || !running) return;
    Vibration.vibrate([0, 300, 200, 300]);
    setRunning(false);
  }, [holdDone, running]);

  function goNext() {
    const next = steps[index + 1];
    if (!next) {
      void complete();
      return;
    }
    setIndex((current) => current + 1);
    startHold(next);
  }

  async function complete() {
    if (!sessionId || isSaving) return;
    setIsSaving(true);
    try {
      const elapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      await finishSession(sessionId, elapsed);
      workout.end();
      const counts = elapsed >= STREAK_STRETCH_MIN_SECONDS;
      showDialog(
        'Stretch saved',
        counts
          ? `That’s ${formatClock(elapsed)}. Ten minutes or more counts toward your week.`
          : `That’s ${formatClock(elapsed)}. From 10 minutes, a stretch counts toward your week.`
      );
      router.replace('/programmes' as Href);
      void maybeAskSessionReminders();
      void syncPlannerReminders();
    } catch (error) {
      showDialog('Couldn’t save it', describeStretchError(error));
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDiscard() {
    showDialog('Discard this stretch?', 'Nothing will be saved.', [
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => void discard(),
      },
      { text: 'Keep going', style: 'cancel' },
    ]);
  }

  async function discard() {
    if (!sessionId) return;
    try {
      await discardSession(sessionId);
      workout.end();
      router.replace('/programmes' as Href);
    } catch (error) {
      showDialog('Couldn’t discard it', describeStretchError(error));
    }
  }

  if (loadState !== 'ready' || !step) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <Text style={styles.message}>
            {loadState === 'not-found' ? 'We couldn’t find that stretch session.' : 'Check your connection and try again.'}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: 8, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.kicker}>
        Hold {index + 1} of {steps.length}
      </Text>
      <Text style={styles.name}>{step.exercise.name}</Text>
      <Text style={styles.clock}>{formatClock(remaining)}</Text>
      <Text style={styles.holdLabel}>{holdDone ? 'Hold complete' : formatHold(step.durationSeconds)}</Text>

      <View style={styles.cues}>
        {step.exercise.cues.map((cue) => (
          <Text key={cue} style={styles.cue}>
            {cue}
          </Text>
        ))}
      </View>

      <View style={styles.actions}>
        {!holdDone ? (
          <Pressable
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            onPress={() => {
              if (running) {
                setRunning(false);
                setEndsAt(Date.now() + remaining * 1000);
              } else {
                setEndsAt(Date.now() + remaining * 1000);
                setRunning(true);
              }
            }}
            accessibilityRole="button">
            <Text style={styles.secondaryText}>{running ? 'Pause' : 'Resume'}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={() => (isLast && holdDone ? void complete() : goNext())}
          disabled={isSaving}
          accessibilityRole="button">
          <Text style={styles.primaryText}>
            {isSaving ? 'Saving…' : isLast && holdDone ? 'Finish' : holdDone ? 'Next hold' : 'Skip'}
          </Text>
        </Pressable>
        <Pressable
          onPress={confirmDiscard}
          disabled={isSaving}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          accessibilityRole="button">
          <Text style={styles.dangerText}>Discard</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colours.background,
    paddingHorizontal: 24,
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
    lineHeight: 24,
    color: colours.textMuted,
    textAlign: 'center',
  },
  kicker: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colours.accent,
  },
  name: {
    fontSize: 28,
    fontWeight: '700',
    color: colours.text,
    marginTop: 8,
  },
  clock: {
    fontSize: 64,
    fontWeight: '700',
    color: colours.text,
    marginTop: 24,
    fontVariant: ['tabular-nums'],
  },
  holdLabel: {
    fontSize: 16,
    color: colours.textMuted,
    marginTop: 4,
  },
  cues: {
    marginTop: 28,
    gap: 10,
  },
  cue: {
    fontSize: 16,
    lineHeight: 23,
    color: colours.text,
  },
  actions: {
    marginTop: 'auto',
    gap: 10,
  },
  primary: {
    minHeight: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
  },
  primaryText: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.surface,
  },
  secondary: {
    minHeight: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  secondaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  link: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.danger,
  },
  pressed: {
    opacity: 0.7,
  },
});
