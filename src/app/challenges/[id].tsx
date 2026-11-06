import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoverPhoto } from '@/components/CoverPhoto';
import { showDialog } from '@/components/Dialog';
import { AppText, PrimaryButton, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { fetchFinishedSessionMeta } from '@/lib/activityStats';
import {
  activeJoinedChallenge,
  challengeProgress,
  challengeRangeCopy,
  challengeStatus,
  challengeTimingCopy,
  describeChallengeError,
  fetchChallenges,
  formatStartOption,
  joinChallenge,
  leaveChallenge,
  rollingStartOptions,
  type Challenge,
} from '@/lib/challenges';
import { challengesCopy, fillCopy, routineActionsCopy } from '@/lib/copy';
import { coverForChallenge } from '@/lib/images';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { fetchProgressSets } from '@/lib/progress';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colours, radius, spacing, shadow } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [other, setOther] = useState<Challenge | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [joining, setJoining] = useState(false);

  const reload = useCallback(async () => {
    if (!id) {
      setLoadState('not-found');
      return;
    }
    const sessions = await fetchFinishedSessionMeta().catch(() => []);
    const sets = await fetchProgressSets().catch(() => []);
    const daysPerWeek = answers?.days_per_week ?? 3;
    const list = await fetchChallenges({ sessions, sets, daysPerWeek });
    const next = list.find((item) => item.id === id) ?? null;
    if (!next) {
      setLoadState('not-found');
      return;
    }
    setChallenge(next);
    setOther(activeJoinedChallenge(list.filter((item) => item.id !== next.id)));
    setLoadState('ready');
  }, [answers?.days_per_week, id]);

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

  async function joinWithStart(startDate: string, replaceId?: string) {
    if (!challenge) return;
    setJoining(true);
    try {
      await joinChallenge(challenge.id, startDate, replaceId ? { replaceId } : undefined);
      await reload();
    } catch (error) {
      showDialog('Could not join', describeChallengeError(error));
    } finally {
      setJoining(false);
    }
  }

  function pickStart(replaceId?: string) {
    const options = rollingStartOptions();
    showDialog(
      challengesCopy.start_choice_title,
      undefined,
      [
        ...options.map((option) => ({
          text: formatStartOption(option),
          onPress: () => {
            void joinWithStart(option.date, replaceId);
          },
        })),
        { text: routineActionsCopy.cancel, style: 'cancel' as const },
      ]
    );
  }

  function handleJoin() {
    if (!challenge) return;
    if (other) {
      showDialog(
        challengesCopy.switch_title,
        fillCopy(challengesCopy.switch_body, { current: other.name }),
        [
          {
            text: challengesCopy.join,
            onPress: () => pickStart(other.id),
          },
          { text: routineActionsCopy.cancel, style: 'cancel' },
        ]
      );
      return;
    }
    pickStart();
  }

  function handleLeave() {
    if (!challenge) return;
    showDialog(challengesCopy.leave, challengesCopy.leave_body, [
      {
        text: challengesCopy.leave,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await leaveChallenge(challenge.id);
              await reload();
            } catch (error) {
              showDialog('Could not leave', describeChallengeError(error));
            }
          })();
        },
      },
      { text: routineActionsCopy.cancel, style: 'cancel' },
    ]);
  }

  async function shareCompletion() {
    if (!challenge) return;
    const sessions = challenge.progress.missionsDone;
    try {
      await Share.share({
        title: challenge.completionTitle,
        message: [challenge.completionTitle, fillCopy(challenge.completionBody, { sessions })]
          .filter(Boolean)
          .join('\n'),
      });
    } catch {
      showDialog('Could not share', 'You can still screenshot the numbers.');
    }
  }

  if (loadState !== 'ready' || !challenge) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
            {loadState === 'not-found'
              ? 'We could not find that challenge.'
              : 'Check your connection and try again.'}
          </AppText>
        )}
      </View>
    );
  }

  const status = challengeStatus(challenge);
  const ring = challengeProgress(challenge);
  const cover = coverForChallenge(challenge);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colours.bg }]}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32, gap: spacing.md }]}>
      <CoverPhoto cover={cover} letter={challenge.name.slice(0, 1)} height={180} />
      <AppText variant="eyebrow" style={{ color: colours.accent }}>
        {challengeTimingCopy(challenge)}
      </AppText>
      <AppText variant="display" style={{ color: colours.ink }}>
        {challenge.name}
      </AppText>
      <AppText variant="body" style={{ color: colours.inkMuted }}>
        {challenge.description}
      </AppText>
      {challenge.joined ? (
        <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
          {challengeRangeCopy(challenge)}
        </AppText>
      ) : null}
      {challenge.joined ? (
        <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
          {challengesCopy.joined}
        </AppText>
      ) : null}

      {challenge.progress.justCaughtUp ? (
        <View style={{ backgroundColor: colours.accentSoft, borderRadius: radius.xl, padding: spacing.lg }}>
          <AppText variant="body" style={{ color: colours.ink }}>
            {challengesCopy.week_repeat}
          </AppText>
        </View>
      ) : null}

      <View style={[{ backgroundColor: colours.surface, borderRadius: radius.xl, padding: spacing.lg }, shadow]}>
        <AppText variant="title3" style={{ color: colours.ink }}>
          {fillCopy(challengesCopy.progress, { done: ring.done, total: ring.target })}
        </AppText>
        {challenge.progress.current ? (
          <AppText variant="body" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
            {challenge.progress.current.mission.body}
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        {challenge.missions.map((mission, index) => {
          const done = index < challenge.progress.missionsDone;
          const current = challenge.progress.current?.mission.week === mission.week;
          return (
            <View key={mission.week} style={{ gap: 4 }}>
              <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                {done ? 'Done · ' : current ? 'This week · ' : ''}
                {mission.title}
              </AppText>
              <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                {mission.body}
              </AppText>
            </View>
          );
        })}
      </View>

      {status === 'complete' ? (
        <>
          <AppText variant="title2" style={{ color: colours.ink }}>
            {challengesCopy.complete_title}
          </AppText>
          <PrimaryButton label="Share this card" onPress={() => void shareCompletion()} />
        </>
      ) : status === 'ended' ? (
        <>
          <AppText variant="body" style={{ color: colours.inkMuted }}>
            {fillCopy(challengesCopy.ended_quietly, { challenge: challenge.name })}
          </AppText>
          <PrimaryButton
            label={joining ? 'Joining…' : challengesCopy.join}
            onPress={() => handleJoin()}
            loading={joining}
            disabled={joining}
          />
        </>
      ) : challenge.joined ? (
        <TextButton label={challengesCopy.leave} onPress={handleLeave} style={{ alignSelf: 'flex-start' }} />
      ) : (
        <PrimaryButton
          label={joining ? 'Joining…' : challengesCopy.join}
          onPress={() => handleJoin()}
          loading={joining}
          disabled={joining}
        />
      )}

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
});
