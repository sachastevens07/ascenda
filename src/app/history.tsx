import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, IconButton, ListRow } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { fetchFinishedSessionMeta, type FinishedSessionMeta } from '@/lib/activityStats';
import { cardioBuilderSpec } from '@/lib/cardioBuilderContent';
import { lockedHomeCopy } from '@/lib/copy';
import { formatKg } from '@/lib/programmes';
import { fetchProgressSets, formatShortDate, getPersonalBests, parseDate, type PersonalBest } from '@/lib/progress';
import { isCardioSession } from '@/lib/sessionTypes';
import { discardSession } from '@/lib/sessions';

function sessionLabel(session: FinishedSessionMeta): string {
  if (session.source === 'stretch') return 'Stretch';
  if (session.source === 'cardio' || session.type === 'cardio') return 'Cardio';
  if (session.source === 'custom') return 'Custom workout';
  return 'Session';
}

function pbLabel(best: PersonalBest): string {
  if (best.kind === 'reps') return `${best.reps} reps`;
  if (best.weightKg == null) return `${best.reps} reps`;
  return `${formatKg(best.weightKg)} × ${best.reps}`;
}

function confirmDeleteCardio(session: FinishedSessionMeta, onDeleted: () => void) {
  const copy = cardioBuilderSpec.justLogIt;
  showDialog(copy.deleteTitle, copy.deleteBody, [
    {
      text: copy.deleteCta,
      style: 'destructive',
      onPress: () => {
        void discardSession(session.id)
          .then(onDeleted)
          .catch(() => showDialog(copy.deleteTitle, 'Check your connection and try again.'));
      },
    },
    { text: 'Keep', style: 'cancel' },
  ]);
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colours, spacing } = useTheme();
  const [sessions, setSessions] = useState<FinishedSessionMeta[]>([]);
  const [bests, setBests] = useState<PersonalBest[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      setLoadState('loading');
      Promise.all([fetchFinishedSessionMeta(), fetchProgressSets()])
        .then(([nextSessions, sets]) => {
          if (!isCurrent) return;
          setSessions([...nextSessions].reverse().slice(0, 30));
          setBests(getPersonalBests(sets));
          setLoadState('ready');
        })
        .catch(() => {
          if (isCurrent) setLoadState('error');
        });
      return () => {
        isCurrent = false;
      };
    }, [])
  );

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton
          icon="chevron-back"
          accessibilityLabel="Back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
        />
        <AppText variant="title1" style={{ color: colours.ink, flex: 1 }}>
          {lockedHomeCopy.lapsed.see_history}
        </AppText>
      </View>
      {loadState === 'loading' ? (
        <View style={styles.centre}>
          <ActivityIndicator color={colours.brand} />
        </View>
      ) : loadState === 'error' ? (
        <View style={styles.centre}>
          <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
            We couldn’t load your history. Check your connection and try again.
          </AppText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          {sessions.length === 0 ? (
            <AppText variant="body" style={{ color: colours.inkMuted, paddingHorizontal: spacing.lg }}>
              Your finished sessions will show up here.
            </AppText>
          ) : (
            sessions.map((session) => (
              <ListRow
                key={session.id}
                title={sessionLabel(session)}
                subtitle={formatShortDate(parseDate(session.date))}
                showChevron={false}
                right={
                  isCardioSession(session) ? (
                    <AppText variant="bodySm" style={{ color: colours.brand, paddingRight: 4 }}>
                      Delete
                    </AppText>
                  ) : undefined
                }
                onPress={
                  isCardioSession(session)
                    ? () =>
                        confirmDeleteCardio(session, () => {
                          setSessions((current) => current.filter((item) => item.id !== session.id));
                        })
                    : undefined
                }
              />
            ))
          )}
          {bests.length > 0 ? (
            <View style={{ marginTop: spacing.lg }}>
              <AppText
                variant="title3"
                style={{ color: colours.ink, paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
                Personal bests
              </AppText>
              {bests.slice(0, 20).map((best) => (
                <ListRow
                  key={best.exerciseId}
                  title={best.exerciseName}
                  subtitle={pbLabel(best)}
                  showChevron={false}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
    minHeight: 52,
  },
  centre: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
