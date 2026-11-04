import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoverPhoto } from '@/components/CoverPhoto';
import { showDialog } from '@/components/Dialog';
import { ProBadge, ProMark } from '@/components/ProBadge';
import { ProgressRing } from '@/components/ProgressRing';
import { AppText } from '@/components/ui/AppText';
import { colours } from '@/constants/theme';
import { fetchFinishedSessionMeta } from '@/lib/activityStats';
import {
  challengeProgress,
  challengeRangeCopy,
  challengeStatus,
  challengeTimingCopy,
  describeChallengeError,
  fetchChallenge,
  formatStartOption,
  joinChallenge,
  missingChallengesMessage,
  rollingStartOptions,
  type Challenge,
} from '@/lib/challenges';
import { coverForRoutine } from '@/lib/images';
import { openPaywall } from '@/lib/paywall';
import { useSubscription } from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const subscription = useSubscription();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [done, setDone] = useState(0);
  const [target, setTarget] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [joining, setJoining] = useState(false);

  const reload = useCallback(async () => {
    if (!id) {
      setLoadState('not-found');
      return;
    }
    const next = await fetchChallenge(id);
    if (!next) {
      setLoadState('not-found');
      return;
    }
    const sessions = await fetchFinishedSessionMeta().catch(() => []);
    const progress = challengeProgress(next, sessions);
    setChallenge(next);
    setDone(progress.done);
    setTarget(progress.target);
    setLoadState('ready');
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      reload().catch(() => {
        if (isCurrent) setLoadState('error');
      });
      return () => {
        isCurrent = false;
      };
    }, [reload])
  );

  async function joinWithStart(startDate: string) {
    if (!challenge) return;
    setJoining(true);
    try {
      await joinChallenge(challenge.id, startDate);
      await reload();
    } catch (error) {
      showDialog('Couldn’t join', describeChallengeError(error));
    } finally {
      setJoining(false);
    }
  }

  function handleJoin() {
    if (!challenge) return;
    if ((challenge.is_pro || challenge.routine.is_pro) && !subscription.isPro) {
      openPaywall(challenge.is_pro ? 'challenge' : 'routine');
      return;
    }
    const options = rollingStartOptions();
    showDialog(
      'Pick a start day',
      'Four weeks from that day. You can start on a Monday or the 1st of the month.',
      [
        ...options.map((option) => ({
          text: formatStartOption(option),
          onPress: () => {
            void joinWithStart(option.date);
          },
        })),
        { text: 'Not now', style: 'cancel' as const },
      ]
    );
  }

  if (loadState !== 'ready' || !challenge) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <AppText variant="body" style={styles.message}>
            {loadState === 'not-found' ? 'We couldn’t find that challenge.' : missingChallengesMessage()}
          </AppText>
        )}
      </View>
    );
  }

  const status = challengeStatus(challenge);
  const locked = (challenge.is_pro || challenge.routine.is_pro) && !subscription.isPro;
  const ratio = target > 0 ? done / target : 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}>
      <CoverPhoto
        cover={coverForRoutine({ id: challenge.routine.id, cover: challenge.cover ?? challenge.routine.cover })}
        letter={challenge.name.slice(0, 1)}
        height={180}
        style={styles.cover}
      />
      <View style={styles.chipRow}>
        {challenge.is_pro ? (
          <ProBadge />
        ) : (
          <AppText variant="caption" style={styles.free}>
            Free to join
          </AppText>
        )}
        <AppText variant="bodySm" style={styles.status}>
          {challengeTimingCopy(challenge)}
        </AppText>
      </View>
      <AppText variant="title1" style={styles.title}>
        {challenge.name}
      </AppText>
      <AppText variant="body" style={styles.body}>
        {challenge.description}
      </AppText>
      <AppText variant="bodySm" style={styles.meta}>
        {challengeRangeCopy(challenge)}
      </AppText>
      <AppText variant="bodySm" style={styles.meta}>
        Routine: {challenge.routine.name}
      </AppText>
      {challenge.participantCount > 0 ? (
        <AppText variant="bodySm" style={styles.meta}>
          {challenge.participantCount === 1
            ? '1 person has joined'
            : `${challenge.participantCount} people have joined`}
        </AppText>
      ) : null}

      <View style={styles.ringCard}>
        <ProgressRing progress={ratio} size={88} stroke={8}>
          <AppText variant="bodyStrong" style={styles.ringValue}>
            {done}/{target}
          </AppText>
        </ProgressRing>
        <AppText variant="body" style={styles.body}>
          {challenge.joined
            ? `Sessions in your four-week window, toward ${target}.`
            : `Join, then sessions in your four-week window count toward ${target}.`}
        </AppText>
      </View>

      {status === 'ended' ? (
        <AppText variant="body" style={styles.body}>
          Finished. Your sessions stay in Activity.
        </AppText>
      ) : challenge.joined ? (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() =>
            router.push({ pathname: '/routines/[id]', params: { id: challenge.routine.id } } as Href)
          }
          accessibilityRole="button">
          <AppText variant="bodyStrong" style={styles.buttonText}>
            Open {challenge.routine.name}
          </AppText>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => void handleJoin()}
          disabled={joining}
          accessibilityRole="button">
          {locked ? (
            <ProMark locked textStyle={styles.buttonText}>
              Join with Pro
            </ProMark>
          ) : (
            <AppText variant="bodyStrong" style={styles.buttonText}>
              {joining ? 'Joining…' : 'Join challenge'}
            </AppText>
          )}
        </Pressable>
      )}
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
    color: colours.textMuted,
    textAlign: 'center',
  },
  cover: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  free: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    color: colours.surface,
    backgroundColor: colours.accent,
  },
  status: {
    color: colours.accent,
  },
  title: {
    color: colours.text,
  },
  body: {
    color: colours.textMuted,
  },
  meta: {
    color: colours.textMuted,
  },
  ringCard: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    padding: 20,
    borderRadius: 22,
    backgroundColor: colours.surface,
  },
  ringValue: {
    color: colours.text,
  },
  button: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
    marginTop: 8,
  },
  buttonText: {
    color: colours.surface,
  },
  pressed: {
    opacity: 0.7,
  },
});
