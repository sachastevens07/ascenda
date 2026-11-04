import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, Chip, PrimaryButton, TextButton, WhatsNextCard } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { fetchFinishedSessionMeta, formatTrainingHours } from '@/lib/activityStats';
import {
  describeReview,
  fetchEnrolmentReview,
  formatLiftCompare,
  type EnrolmentReview,
} from '@/lib/checkpoints';
import {
  resolveNextRoutineOffer,
  startNextRoutineOnMonday,
  type NextRoutineOffer,
} from '@/lib/handOff';
import { coverForRoutine, coverSources } from '@/lib/images';
import { openPaywall } from '@/lib/paywall';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { fetchProgressSets } from '@/lib/progress';
import { describeRoutineError, fetchEnrolment, fetchRoutines } from '@/lib/routines';
import { useSubscription } from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'ready';

export default function RoutineCompleteScreen() {
  const { enrolmentId } = useLocalSearchParams<{ enrolmentId: string }>();
  const insets = useSafeAreaInsets();
  const { colours, radius, spacing, shadow } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const subscription = useSubscription();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [review, setReview] = useState<EnrolmentReview | null>(null);
  const [next, setNext] = useState<NextRoutineOffer | null>(null);
  const [starting, setStarting] = useState(false);

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
      const [sessions, sets, catalogue] = await Promise.all([
        fetchFinishedSessionMeta(),
        fetchProgressSets(),
        fetchRoutines().catch(() => []),
      ]);
      const built = await fetchEnrolmentReview(enrolment, sessions, sets);
      const offer = await resolveNextRoutineOffer({
        currentRoutineId: enrolment.routine_id,
        catalogue,
        answers,
        isPro: subscription.isPro,
        mode: 'start',
      }).catch(() => null);
      if (!isCurrent) return;
      setReview(built);
      setNext(offer);
      setLoadState('ready');
    })().catch(() => {
      if (isCurrent) setLoadState('error');
    });
    return () => {
      isCurrent = false;
    };
  }, [answers?.goal, answers?.experience, answers?.equipment, answers?.days_per_week, enrolmentId, subscription.isPro]);

  async function shareCard() {
    if (!review) return;
    const lifts = review.lifts.map(formatLiftCompare).join('\n');
    const message = [`I finished ${review.enrolment.routine.name}.`, describeReview(review), lifts]
      .filter(Boolean)
      .join('\n');
    try {
      await Share.share({ message, title: review.enrolment.routine.name });
    } catch {
      showDialog('Couldn’t share', 'You can still screenshot the card.');
    }
  }

  async function startNext() {
    if (!next) return;
    setStarting(true);
    try {
      const result = await startNextRoutineOnMonday(next.routine, subscription.isPro);
      if (result === 'paywall') {
        openPaywall('routine');
        return;
      }
      router.replace('/');
    } catch (error) {
      showDialog('Couldn’t start that plan', describeRoutineError(error));
    } finally {
      setStarting(false);
    }
  }

  if (loadState !== 'ready' || !review) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
            We couldn’t load that review.
          </AppText>
        )}
      </View>
    );
  }

  const locked = !subscription.isPro;
  const cover = next ? coverSources(coverForRoutine(next.routine))[0] ?? null : null;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colours.bg }]}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32, gap: spacing.md }]}>
      <AppText variant="eyebrow" style={{ color: colours.accent }}>Routine complete</AppText>
      <AppText variant="display" style={{ color: colours.ink }}>{review.enrolment.routine.name}</AppText>
      <AppText variant="body" style={{ color: colours.inkMuted }}>That’s a full plan. Your history stays.</AppText>
      <Chip label="Routine completed" selected />

      <View
        style={[styles.card, { backgroundColor: colours.ink, borderRadius: radius.xl }]}
        accessibilityLabel="Completion card">
        <AppText variant="eyebrow" style={{ color: colours.accent }}>Ascenda</AppText>
        <AppText variant="title2" style={{ color: colours.bg, marginTop: spacing.sm }}>
          {review.enrolment.routine.name}
        </AppText>
        <AppText variant="title3" style={{ color: colours.accent, marginTop: spacing.md }}>
          {review.sessions} {review.sessions === 1 ? 'session' : 'sessions'}
        </AppText>
        <AppText variant="title3" style={{ color: colours.accent }}>{formatTrainingHours(review.durationSeconds)}</AppText>
        <AppText variant="title3" style={{ color: colours.accent }}>
          {review.personalBests} {review.personalBests === 1 ? 'personal best' : 'personal bests'}
        </AppText>
        {review.lifts.slice(0, 3).map((lift) => (
          <AppText key={lift.exerciseId} variant="body" style={{ color: colours.bg, marginTop: spacing.xs }}>
            {formatLiftCompare(lift)}
          </AppText>
        ))}
        <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: spacing.md }}>
          No body data. Just the work.
        </AppText>
      </View>

      {locked ? (
        <PrimaryButton label="Unlock the full review" onPress={() => openPaywall('review')} />
      ) : (
        <PrimaryButton label="Share this card" onPress={() => void shareCard()} />
      )}

      {next ? (
        <WhatsNextCard
          title={next.routine.name}
          body={`${next.why} Starts ${next.mondayLabel}.`}
          image={cover}
          locked={!subscription.isPro && next.routine.is_pro}
          starting={starting}
          primaryLabel={`Start on ${next.mondayLabel}`}
          onPrimary={() => void startNext()}
          onSeeRoutine={() =>
            router.replace({ pathname: '/routines/[id]', params: { id: next.routine.id } } as Href)
          }
          style={shadow}
        />
      ) : null}

      <TextButton
        label="Back to Programmes"
        onPress={() => router.replace('/programmes' as Href)}
        style={{ alignSelf: 'center' }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 24,
    paddingTop: 8,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    padding: 24,
  },
});
