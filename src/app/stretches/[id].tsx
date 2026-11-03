import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import {
  Chip,
  DetailLayout,
  FreeBadge,
  LockedOverlay,
  PrimaryButton,
  ProBadge,
  SafetyNotice,
  StatStrip,
  TextButton,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { getExerciseImageSource } from '@/lib/exerciseMedia';
import { confirmFirstSessionSafety } from '@/lib/firstSession';
import { coverForRoutine, coverSources } from '@/lib/images';
import { openPaywall } from '@/lib/paywall';
import {
  DIFFICULTY_LABELS,
  ROUTINE_EQUIPMENT_LABELS,
  ROUTINE_GOAL_LABELS,
  formatTagLabel,
  type Routine,
  type RoutineDayExercise,
} from '@/lib/routines';
import {
  STRETCH_PREVIEW_STEPS,
  beginStretchSession,
  describeStretchError,
  fetchStretchRoutine,
  formatHold,
  formatHoldShort,
  isSessionInProgressError,
  missingStretchesMessage,
  stretchSteps,
  totalHoldSeconds,
} from '@/lib/stretches';
import { useSubscription } from '@/lib/subscription';
import { useWorkout } from '@/lib/workout';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

function HoldThumb({ step }: { step: RoutineDayExercise }) {
  const { colours, radius, type } = useTheme();
  const photo = getExerciseImageSource(step.exercise);
  return (
    <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
      {photo ? (
        <Image source={photo} style={styles.photoFill} resizeMode="cover" />
      ) : (
        <Text style={[type.title3, { color: colours.brand }]}>{step.exercise.name.slice(0, 1)}</Text>
      )}
    </View>
  );
}

export default function StretchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colours, type, spacing } = useTheme();
  const subscription = useSubscription();
  const workout = useWorkout();
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      if (!id) {
        setLoadState('not-found');
        return;
      }
      setLoadState((state) => (state === 'ready' ? state : 'loading'));
      fetchStretchRoutine(id)
        .then((next) => {
          if (!isCurrent) return;
          setRoutine(next);
          setErrorMessage(null);
          setLoadState(next ? 'ready' : 'not-found');
        })
        .catch((error) => {
          if (!isCurrent) return;
          setErrorMessage(describeStretchError(error));
          setLoadState('error');
        });
      return () => {
        isCurrent = false;
      };
    }, [id])
  );

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/programmes' as Href);
  }

  async function handleStart() {
    if (!routine) return;
    if (routine.is_pro && !subscription.isPro) {
      openPaywall('stretch');
      return;
    }
    const day = stretchSteps(routine);
    const dayId = routine.weeks[0]?.days[0]?.id;
    if (!dayId || day.length === 0) {
      showDialog('Nothing to start', 'This stretch has no holds yet.');
      return;
    }
    setIsStarting(true);
    try {
      const allowed = await confirmFirstSessionSafety();
      if (!allowed) return;
      const session = await beginStretchSession(dayId);
      workout.publish(
        {
          sessionId: session.id,
          dayName: routine.name,
          startedAt: Date.parse(session.started_at),
          source: 'stretch',
        },
        null
      );
      router.push({ pathname: '/stretches/play', params: { sessionId: session.id } } as Href);
    } catch (error) {
      if (isSessionInProgressError(error) && error.activeId) {
        const playStretch = error.activeSource === 'stretch';
        showDialog(
          'You already have a session going',
          'Finish or discard it first, then start this stretch.',
          [
            {
              text: 'Open it',
              onPress: () =>
                router.push(
                  playStretch
                    ? ({ pathname: '/stretches/play', params: { sessionId: error.activeId } } as Href)
                    : ({ pathname: '/session/[id]', params: { id: error.activeId } } as Href)
                ),
            },
            { text: 'OK', style: 'cancel' },
          ]
        );
        return;
      }
      showDialog('Couldn’t start the stretch', describeStretchError(error));
    } finally {
      setIsStarting(false);
    }
  }

  if (loadState !== 'ready' || !routine) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg, paddingTop: insets.top }]}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <Text style={[type.body, { color: colours.inkMuted, textAlign: 'center' }]}>
            {loadState === 'not-found'
              ? 'We couldn’t find that stretch.'
              : (errorMessage ?? missingStretchesMessage())}
          </Text>
        )}
      </View>
    );
  }

  const steps = stretchSteps(routine);
  const locked = routine.is_pro && !subscription.isPro;
  const visibleSteps = locked ? steps.slice(0, STRETCH_PREVIEW_STEPS) : steps;
  const hiddenCount = Math.max(0, steps.length - visibleSteps.length);
  const holdSeconds = totalHoldSeconds(steps);
  const cover = coverSources(coverForRoutine(routine))[0] ?? null;
  const showMore = routine.description.trim().length > 90;
  const chips = [
    ROUTINE_EQUIPMENT_LABELS[routine.equipment],
    ROUTINE_GOAL_LABELS[routine.goal],
    ...routine.tags.map((tag) => formatTagLabel(tag)),
  ];
  const stickyLabel = locked ? 'Start with Pro' : 'Start stretch';

  return (
    <DetailLayout
      cover={cover}
      letter={routine.name}
      title={routine.name}
      eyebrow={`${DIFFICULTY_LABELS[routine.difficulty]} · Stretch`}
      onBack={goBack}
      sticky={
        <PrimaryButton
          label={isStarting ? 'Starting…' : stickyLabel}
          loading={isStarting}
          disabled={isStarting}
          onPress={() => void handleStart()}
        />
      }>
      <View style={styles.badgeRow}>
        {!subscription.isPro ? routine.is_pro ? <ProBadge /> : <FreeBadge /> : null}
      </View>

      <Text style={[type.body, { color: colours.ink }]} numberOfLines={descriptionOpen ? undefined : 2}>
        {routine.description}
      </Text>
      {showMore ? (
        <TextButton
          label={descriptionOpen ? 'Less' : 'More'}
          onPress={() => setDescriptionOpen((open) => !open)}
          style={styles.more}
        />
      ) : null}

      {chips.length > 0 ? (
        <View style={styles.tagRow}>
          {chips.map((chip, index) => (
            <Chip key={`${chip}-${index}`} label={chip} />
          ))}
        </View>
      ) : null}

      <StatStrip
        style={{ marginTop: spacing.lg }}
        items={[
          { icon: 'time-outline', value: String(routine.session_minutes), label: 'Minutes' },
          { icon: 'body-outline', value: String(steps.length), label: 'Holds' },
          { icon: 'timer-outline', value: formatHoldShort(holdSeconds), label: 'Time' },
          { icon: 'bar-chart-outline', value: DIFFICULTY_LABELS[routine.difficulty], label: 'Level' },
        ]}
      />

      <Text style={[type.title2, { color: colours.ink, marginTop: spacing.lg, marginBottom: spacing.md }]}>
        Holds
      </Text>
      {visibleSteps.map((step) => (
        <Pressable
          key={`${step.position}-${step.exercise.id}`}
          onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: step.exercise.id } })}
          style={({ pressed }) => [
            styles.holdRow,
            { backgroundColor: colours.surface, borderRadius: 16 },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button">
          <HoldThumb step={step} />
          <View style={styles.flex}>
            <Text style={[type.title3, { color: colours.ink }]} numberOfLines={1}>
              {step.exercise.name}
            </Text>
            <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 2 }]}>
              {formatHold(step.duration_seconds ?? 30)}
            </Text>
          </View>
        </Pressable>
      ))}
      {hiddenCount > 0 ? (
        <View
          style={[
            styles.lockCard,
            { backgroundColor: colours.surface, borderRadius: 16, minHeight: 132 },
          ]}>
          <Text style={[type.title3, { color: colours.ink }]}>
            {hiddenCount} more {hiddenCount === 1 ? 'hold' : 'holds'}
          </Text>
          <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 4 }]}>
            The free plan includes three stretch sessions in full.
          </Text>
          <LockedOverlay onUnlock={() => openPaywall('stretch')} label="Unlock with Pro" />
        </View>
      ) : null}

      <SafetyNotice style={{ marginTop: spacing.md }} />
    </DetailLayout>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  more: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 0,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  holdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
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
  flex: {
    flex: 1,
  },
  lockCard: {
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 4,
  },
  pressed: {
    opacity: 0.8,
  },
});
