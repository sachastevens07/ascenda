import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { ProBadge } from '@/components/ProBadge';
import { colours } from '@/constants/theme';
import { fetchFinishedSessionMeta, formatTrainingHours } from '@/lib/activityStats';
import {
  describeReview,
  fetchEnrolmentReview,
  formatLiftCompare,
  type EnrolmentReview,
} from '@/lib/checkpoints';
import { nextRoutineOnPath } from '@/lib/paths';
import { openPaywall } from '@/lib/paywall';
import { fetchProgressSets } from '@/lib/progress';
import { offerProgrammePhoto } from '@/lib/progressPhotos';
import { fetchEnrolment, type RoutineSummary } from '@/lib/routines';
import { useSubscription } from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'ready';

export default function RoutineCompleteScreen() {
  const { enrolmentId } = useLocalSearchParams<{ enrolmentId: string }>();
  const insets = useSafeAreaInsets();
  const subscription = useSubscription();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [review, setReview] = useState<EnrolmentReview | null>(null);
  const [next, setNext] = useState<{ pathName: string; routine: RoutineSummary } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    (async () => {
      if (!enrolmentId) {
        setLoadState('error');
        return;
      }
      const enrolment = await fetchEnrolment(enrolmentId);
      if (!enrolment) {
        setLoadState('error');
        return;
      }
      const [sessions, sets, pathNext] = await Promise.all([
        fetchFinishedSessionMeta(),
        fetchProgressSets(),
        nextRoutineOnPath(enrolment.routine_id).catch(() => null),
      ]);
      const built = await fetchEnrolmentReview(enrolment, sessions, sets);
      if (!isCurrent) return;
      setReview(built);
      setNext(pathNext ? { pathName: pathNext.path.name, routine: pathNext.routine } : null);
      setLoadState('ready');
      if (subscription.isPro) void offerProgrammePhoto('end');
    })().catch(() => {
      if (isCurrent) setLoadState('error');
    });
    return () => {
      isCurrent = false;
    };
  }, [enrolmentId, subscription.isPro]);

  async function shareCard() {
    if (!review) return;
    const lifts = review.lifts.map(formatLiftCompare).join('\n');
    const message = [
      `I finished ${review.enrolment.routine.name}.`,
      describeReview(review),
      lifts,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await Share.share({ message, title: review.enrolment.routine.name });
    } catch {
      showDialog('Couldn’t share', 'You can still screenshot the card.');
    }
  }

  if (loadState !== 'ready' || !review) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <Text style={styles.message}>We couldn’t load that review.</Text>
        )}
      </View>
    );
  }

  const locked = !subscription.isPro;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}>
      <Text style={styles.kicker}>Routine complete</Text>
      <Text style={styles.title}>{review.enrolment.routine.name}</Text>
      <Text style={styles.body}>That’s a full plan. Your history stays.</Text>

      <View style={styles.card} accessibilityLabel="Completion card">
        <Text style={styles.cardKicker}>Ascenda</Text>
        <Text style={styles.cardTitle}>{review.enrolment.routine.name}</Text>
        <Text style={styles.cardStat}>{review.sessions} sessions</Text>
        <Text style={styles.cardStat}>{formatTrainingHours(review.durationSeconds)}</Text>
        <Text style={styles.cardStat}>
          {review.personalBests} {review.personalBests === 1 ? 'personal best' : 'personal bests'}
        </Text>
        {review.lifts.slice(0, 3).map((lift) => (
          <Text key={lift.exerciseId} style={styles.cardLift}>
            {formatLiftCompare(lift)}
          </Text>
        ))}
        <Text style={styles.cardFoot}>No body data. Just the work.</Text>
      </View>

      {locked ? (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => openPaywall('review')}
          accessibilityRole="button">
          <ProBadge style={styles.inlineBadge} />
          <Text style={styles.buttonText}>Unlock the full review</Text>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => void shareCard()}
          accessibilityRole="button">
          <Text style={styles.buttonText}>Share this card</Text>
        </Pressable>
      )}

      {next ? (
        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>Next on {next.pathName}</Text>
          <Text style={styles.nextName}>{next.routine.name}</Text>
          <Pressable
            style={({ pressed }) => [styles.outline, pressed && styles.pressed]}
            onPress={() => {
              if (next.routine.is_pro && !subscription.isPro) {
                openPaywall('path');
                return;
              }
              router.replace({ pathname: '/routines/[id]', params: { id: next.routine.id } } as Href);
            }}
            accessibilityRole="button">
            <Text style={styles.outlineText}>See this routine</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        onPress={() => router.replace('/programmes' as Href)}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        accessibilityRole="button">
        <Text style={styles.linkText}>Back to Programmes</Text>
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
    gap: 14,
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
  kicker: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colours.accent,
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
  card: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: colours.text,
    gap: 8,
  },
  cardKicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colours.accentSoft,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colours.surface,
    marginBottom: 8,
  },
  cardStat: {
    fontSize: 18,
    fontWeight: '600',
    color: colours.accentSoft,
  },
  cardLift: {
    fontSize: 15,
    color: colours.surface,
    marginTop: 4,
  },
  cardFoot: {
    fontSize: 13,
    color: colours.textMuted,
    marginTop: 12,
  },
  button: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
    flexDirection: 'row',
    gap: 8,
  },
  inlineBadge: {
    marginRight: 4,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.surface,
  },
  nextCard: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: colours.surface,
    gap: 8,
  },
  nextLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colours.accent,
  },
  nextName: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.text,
  },
  outline: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
  },
  outlineText: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.accent,
  },
  link: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
  },
  pressed: {
    opacity: 0.7,
  },
});
