import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import {
  IconButton,
  MenuRow,
  OverflowMenu,
  PrimaryButton,
  ProgressRing,
  TextButton,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { STREAK_STRETCH_MIN_SECONDS } from '@/lib/activityStats';
import { getExerciseImageSource } from '@/lib/exerciseMedia';
import { maybeAskSessionReminders, syncPlannerReminders } from '@/lib/reminders';
import { discardSession, fetchSession, finishSession } from '@/lib/sessions';
import {
  describeStretchError,
  formatHoldShort,
  loadStretchStepsForSession,
  type StretchPlayStep,
} from '@/lib/stretches';
import { formatClock } from '@/lib/workoutLog';
import { useNow, useWorkout } from '@/lib/workout';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

const RING_SIZE = 180;

export default function StretchPlayScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const insets = useSafeAreaInsets();
  const { colours, type, spacing, radius } = useTheme();
  const workout = useWorkout();
  const menuRef = useRef<AnchorHandle>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
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
  const nextStep = steps[index + 1] ?? null;
  const photo = step ? getExerciseImageSource(step.exercise) : null;
  const ringProgress =
    !step || step.durationSeconds <= 0 ? 1 : Math.min(1, 1 - remaining / step.durationSeconds);

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
    if (!next) return;
    setIndex((current) => current + 1);
    startHold(next);
  }

  function skipHold() {
    if (isLast) {
      setEndsAt(Date.now());
      setRunning(false);
      return;
    }
    goNext();
  }

  function togglePause() {
    if (running) {
      setRunning(false);
      setEndsAt(Date.now() + remaining * 1000);
      return;
    }
    setEndsAt(Date.now() + remaining * 1000);
    setRunning(true);
  }

  function openMenu() {
    measureAnchor(menuRef.current, (rect) => {
      setMenuAnchor(rect);
      setMenuOpen(true);
    });
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

  function confirmEnd() {
    showDialog('End this stretch?', 'Nothing will be saved.', [
      {
        text: 'End stretch',
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
      showDialog('Couldn’t end it', describeStretchError(error));
    }
  }

  if (loadState !== 'ready' || !step) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <Text style={[type.body, { color: colours.inkMuted, textAlign: 'center' }]}>
            {loadState === 'not-found'
              ? 'We couldn’t find that stretch session.'
              : 'Check your connection and try again.'}
          </Text>
        )}
      </View>
    );
  }

  const cues = step.exercise.cues.slice(0, 3);
  const primaryLabel = holdDone
    ? isLast
      ? isSaving
        ? 'Saving…'
        : 'Finish'
      : 'Next hold'
    : running
      ? 'Pause'
      : 'Resume';

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.topBar}>
        <View style={styles.menuSpacer} />
        <View ref={menuRef} collapsable={false}>
          <IconButton
            icon="ellipsis-horizontal"
            variant="muted"
            accessibilityLabel="Stretch options"
            onPress={openMenu}
          />
        </View>
      </View>

      <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.lg }]}>
        {photo ? (
          <Image source={photo} style={styles.photoFill} resizeMode="cover" accessibilityLabel={step.exercise.name} />
        ) : (
          <Text style={[styles.letter, { color: colours.brand }]}>{step.exercise.name.slice(0, 1)}</Text>
        )}
      </View>

      <Text style={[type.eyebrow, { color: colours.accent, marginTop: spacing.md }]}>
        Hold {index + 1} of {steps.length}
      </Text>
      <Text style={[type.title1, { color: colours.ink, marginTop: spacing.xs }]}>{step.exercise.name}</Text>

      <View style={styles.cues}>
        {cues.map((cue) => (
          <Text key={cue} style={[type.bodySm, { color: colours.ink }]}>
            {cue}
          </Text>
        ))}
      </View>

      <View style={styles.ringWrap}>
        <ProgressRing progress={ringProgress} size={RING_SIZE} stroke={10}>
          <Text style={[type.number, { color: colours.ink, fontVariant: ['tabular-nums'] }]}>
            {formatClock(remaining)}
          </Text>
        </ProgressRing>
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label={primaryLabel}
          onPress={() => {
            if (holdDone) {
              if (isLast) void complete();
              else goNext();
              return;
            }
            togglePause();
          }}
          loading={isSaving && holdDone && isLast}
          disabled={isSaving}
        />
        {holdDone ? null : (
          <TextButton label="Skip" onPress={skipHold} disabled={isSaving} style={{ alignSelf: 'center' }} />
        )}
        {nextStep ? (
          <Text style={[type.bodySm, { color: colours.inkMuted, textAlign: 'center', marginTop: spacing.sm }]}>
            Next: {nextStep.exercise.name} · {formatHoldShort(nextStep.durationSeconds)}
          </Text>
        ) : (
          <Text style={[type.bodySm, { color: colours.inkMuted, textAlign: 'center', marginTop: spacing.sm }]}>
            Last hold
          </Text>
        )}
      </View>

      <OverflowMenu visible={menuOpen} anchor={menuAnchor} onClose={() => setMenuOpen(false)}>
        <MenuRow
          label="End stretch"
          danger
          onPress={() => {
            setMenuOpen(false);
            confirmEnd();
          }}
        />
      </OverflowMenu>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuSpacer: {
    width: 44,
    height: 44,
  },
  thumb: {
    width: '100%',
    aspectRatio: 16 / 10,
    maxHeight: 160,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  photoFill: {
    width: '100%',
    height: '100%',
  },
  letter: {
    fontSize: 48,
    fontWeight: '700',
  },
  cues: {
    marginTop: 12,
    gap: 6,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    flex: 1,
  },
  actions: {
    marginTop: 16,
    alignItems: 'stretch',
  },
});
