import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoverPhoto } from '@/components/CoverPhoto';
import { showDialog } from '@/components/Dialog';
import { ProBadge, ProMark } from '@/components/ProBadge';
import { SafetyNotice } from '@/components/ui';
import { confirmFirstSessionSafety } from '@/lib/firstSession';
import { colours } from '@/constants/theme';
import { coverForRoutine } from '@/lib/images';
import { openPaywall } from '@/lib/paywall';
import { formatTagLabel, type Routine } from '@/lib/routines';
import {
  STRETCH_PREVIEW_STEPS,
  beginStretchSession,
  describeStretchError,
  fetchStretchRoutine,
  formatHold,
  isSessionInProgressError,
  missingStretchesMessage,
  stretchSteps,
  totalHoldSeconds,
} from '@/lib/stretches';
import { useSubscription } from '@/lib/subscription';
import { useWorkout } from '@/lib/workout';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

export default function StretchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const subscription = useSubscription();
  const workout = useWorkout();
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

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
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <Text style={styles.message}>
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

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}>
      <CoverPhoto
        cover={coverForRoutine(routine)}
        letter={routine.name.slice(0, 1)}
        height={220}
        style={styles.cover}
      />
      <View style={styles.chipRow}>
        {routine.is_pro ? <ProBadge /> : <Text style={[styles.chip, styles.chipFree]}>Free</Text>}
      </View>
      <Text style={styles.title}>{routine.name}</Text>
      <Text style={styles.body}>{routine.description}</Text>
      <View style={styles.tagRow}>
        {routine.tags.map((tag) => (
          <Text key={tag} style={styles.tag}>
            {formatTagLabel(tag)}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailName}>Length</Text>
          <Text style={styles.detailValue}>About {routine.session_minutes} minutes</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailName}>Holds</Text>
          <Text style={styles.detailValue}>
            {steps.length} timed holds · {formatHold(holdSeconds)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailName}>Kit</Text>
          <Text style={styles.detailValue}>A mat. A wall or doorway helps.</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailName}>Access</Text>
          <Text style={styles.detailValue}>{routine.is_pro ? 'Pro' : 'Free'}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Holds</Text>
      {visibleSteps.map((step) => (
        <Pressable
          key={`${step.position}-${step.exercise.id}`}
          onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: step.exercise.id } })}
          style={({ pressed }) => [styles.stepRow, pressed && styles.pressed]}
          accessibilityRole="button">
          <View style={styles.flex}>
            <Text style={styles.stepName}>{step.exercise.name}</Text>
            <Text style={styles.stepMeta}>{formatHold(step.duration_seconds ?? 30)}</Text>
          </View>
        </Pressable>
      ))}
      {hiddenCount > 0 && (
        <View style={styles.lockCard}>
          <ProBadge locked />
          <Text style={styles.lockTitle}>
            {hiddenCount} more {hiddenCount === 1 ? 'hold' : 'holds'} with Pro
          </Text>
          <Text style={styles.lockBody}>The free plan includes three stretch sessions in full.</Text>
          <Pressable
            style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
            onPress={() => openPaywall('stretch')}
            accessibilityRole="button">
            <Text style={styles.outlineButtonText}>Unlock with Pro</Text>
          </Pressable>
        </View>
      )}

      <SafetyNotice />
      <Pressable
        style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
        onPress={() => void handleStart()}
        disabled={isStarting}
        accessibilityRole="button">
        {locked && !isStarting ? (
          <ProMark locked textStyle={styles.startButtonText}>
            Start with Pro
          </ProMark>
        ) : (
          <Text style={styles.startButtonText}>{isStarting ? 'Starting…' : 'Start stretch'}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colours.background,
  },
  container: {
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
    lineHeight: 24,
    color: colours.textMuted,
    textAlign: 'center',
  },
  cover: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '700',
  },
  chipFree: {
    color: colours.surface,
    backgroundColor: colours.accent,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colours.text,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    color: colours.textMuted,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 13,
    fontWeight: '600',
    color: colours.accent,
    backgroundColor: colours.accentSoft,
  },
  card: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: colours.surface,
    gap: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.text,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailName: {
    fontSize: 15,
    color: colours.textMuted,
  },
  detailValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colours.text,
    textAlign: 'right',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.text,
    marginTop: 8,
  },
  stepRow: {
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colours.surface,
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  stepName: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.text,
  },
  stepMeta: {
    fontSize: 14,
    color: colours.textMuted,
    marginTop: 2,
  },
  lockCard: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: colours.surface,
    gap: 8,
    alignItems: 'flex-start',
  },
  lockTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.text,
  },
  lockBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colours.textMuted,
  },
  outlineButton: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    marginTop: 4,
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.accent,
  },
  startButton: {
    minHeight: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
    marginTop: 8,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.surface,
  },
  pressed: {
    opacity: 0.7,
  },
});
