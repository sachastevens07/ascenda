import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, IconButton, PrimaryButton, ProgressRing, TextButton } from '@/components/ui';
import { ExerciseThumb } from '@/components/ui/ExerciseThumb';
import { useTheme } from '@/constants/theme';
import { formatHoldShort } from '@/lib/stretches';
import type { HoldPlayStep } from '@/lib/warmupBlocks';
import { formatClock } from '@/lib/workoutLog';
import { useNow } from '@/lib/workout';

const RING_SIZE = 180;

export function HoldPlayer({
  title,
  steps,
  onClose,
  onComplete,
}: {
  title: string;
  steps: HoldPlayStep[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colours, spacing, radius } = useTheme();
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(true);
  const [endsAt, setEndsAt] = useState(() =>
    steps[0]?.durationSeconds ? Date.now() + steps[0].durationSeconds * 1000 : Date.now()
  );
  const step = steps[index] ?? null;
  const timed = Boolean(step?.durationSeconds);
  const now = useNow(running && timed, 200);
  const remaining = timed && step?.durationSeconds
    ? Math.max(0, Math.ceil((endsAt - now) / 1000))
    : 0;
  const holdDone = timed && remaining <= 0;
  const isLast = index >= steps.length - 1;
  const nextStep = steps[index + 1] ?? null;
  const ringProgress = !timed || !step?.durationSeconds
    ? 1
    : Math.min(1, 1 - remaining / step.durationSeconds);

  const startHold = useCallback((next: HoldPlayStep) => {
    if (next.durationSeconds) {
      setEndsAt(Date.now() + next.durationSeconds * 1000);
      setRunning(true);
      return;
    }
    setRunning(false);
  }, []);

  useEffect(() => {
    if (!holdDone || !running) return;
    Vibration.vibrate([0, 300, 200, 300]);
    setRunning(false);
  }, [holdDone, running]);

  function goNext() {
    const next = steps[index + 1];
    if (!next) {
      onComplete();
      return;
    }
    setIndex((current) => current + 1);
    startHold(next);
  }

  function skipHold() {
    goNext();
  }

  function togglePause() {
    if (!timed) return;
    if (running) {
      setRunning(false);
      setEndsAt(Date.now() + remaining * 1000);
      return;
    }
    setEndsAt(Date.now() + remaining * 1000);
    setRunning(true);
  }

  if (!step) return null;

  const primaryLabel = timed
    ? holdDone
      ? isLast
        ? 'Finish'
        : 'Next hold'
      : running
        ? 'Pause'
        : 'Resume'
    : isLast
      ? 'Finish'
      : 'Done';

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.screen,
          {
            backgroundColor: colours.bg,
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 24,
          },
        ]}>
        <View style={styles.topBar}>
          <IconButton
            icon="chevron-down"
            variant="muted"
            accessibilityLabel="Close"
            onPress={onClose}
          />
          <AppText variant="eyebrow" style={{ color: colours.accent, flex: 1, textAlign: 'center' }}>
            {title}
          </AppText>
          <View style={styles.spacer} />
        </View>

        <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.lg }]}>
          <ExerciseThumb
            exercise={{ id: step.exerciseId, equipment: step.equipment }}
            size={72}
          />
        </View>

        <AppText variant="eyebrow" style={{ color: colours.accent, marginTop: spacing.md }}>
          {timed ? `Hold ${index + 1} of ${steps.length}` : `Move ${index + 1} of ${steps.length}`}
        </AppText>
        <AppText variant="title1" style={{ color: colours.ink, marginTop: spacing.xs }}>
          {step.name}
        </AppText>
        <AppText variant="body" style={{ color: colours.ink, marginTop: spacing.sm }}>
          {step.cue}
        </AppText>
        {step.note ? (
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 6 }}>
            {step.note}
          </AppText>
        ) : null}

        <View style={styles.ringWrap}>
          <ProgressRing progress={ringProgress} size={RING_SIZE} stroke={10}>
            <AppText variant="number" style={{ color: colours.ink, fontVariant: ['tabular-nums'] }}>
              {timed ? formatClock(remaining) : step.repsLabel ?? ''}
            </AppText>
          </ProgressRing>
        </View>

        <PrimaryButton
          label={primaryLabel}
          onPress={() => {
            if (!timed || holdDone) {
              goNext();
              return;
            }
            togglePause();
          }}
        />
        {timed && !holdDone ? (
          <TextButton label="Skip" onPress={skipHold} style={{ alignSelf: 'center' }} />
        ) : null}
        {nextStep ? (
          <AppText variant="bodySm" style={{ color: colours.inkMuted, textAlign: 'center', marginTop: spacing.sm }}>
            Next: {nextStep.name}
            {nextStep.durationSeconds
              ? ` · ${formatHoldShort(nextStep.durationSeconds)}`
              : nextStep.repsLabel
                ? ` · ${nextStep.repsLabel}`
                : ''}
          </AppText>
        ) : (
          <AppText variant="bodySm" style={{ color: colours.inkMuted, textAlign: 'center', marginTop: spacing.sm }}>
            Last move
          </AppText>
        )}
        <Pressable onPress={onClose} hitSlop={8} style={{ alignSelf: 'center', marginTop: 8 }}>
          <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
            Close without finishing
          </AppText>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spacer: {
    width: 40,
    height: 40,
  },
  thumb: {
    width: '100%',
    aspectRatio: 16 / 10,
    maxHeight: 140,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    flex: 1,
  },
});
