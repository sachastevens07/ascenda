import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoverPhoto } from '@/components/CoverPhoto';
import { showDialog } from '@/components/Dialog';
import { FilterSheet } from '@/components/FilterSheet';
import { ProBadge } from '@/components/ProBadge';
import { colours } from '@/constants/theme';
import { coverForRoutine } from '@/lib/images';
import {
  collectRoutineTags,
  endActiveEnrolment,
  currentEnrolmentWeek,
  describeRoutineError,
  fetchActiveEnrolment,
  fetchRoutines,
  missingRoutinesMessage,
  type RoutineEnrolment,
  type RoutineSummary,
} from '@/lib/routines';

type LoadState = 'loading' | 'error' | 'ready';

export function RoutineCatalogue({
  showTitle = true,
  bottomInset,
}: {
  showTitle?: boolean;
  bottomInset?: number;
}) {
  const insets = useSafeAreaInsets();
  const paddingBottom = (bottomInset ?? insets.bottom) + 32;
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [enrolment, setEnrolment] = useState<RoutineEnrolment | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [missingSql, setMissingSql] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      (async () => {
        try {
          const [list, active] = await Promise.all([fetchRoutines(), fetchActiveEnrolment()]);
          if (!isCurrent) return;
          setRoutines(list);
          setEnrolment(active);
          setMissingSql(list.length === 0);
          setLoadState('ready');
        } catch (error) {
          if (!isCurrent) return;
          const detail = error instanceof Error ? error.message : '';
          setMissingSql(/routines\.sql/i.test(detail));
          setLoadState((state) => (state === 'ready' ? state : 'error'));
        }
      })();
      return () => {
        isCurrent = false;
      };
    }, [attempt])
  );

  function requestLeave() {
    if (!enrolment) return;
    showDialog(
      `End ${enrolment.routine.name}?`,
      'Your logged sessions and progress stay. Upcoming planned sessions from this plan will be cleared.',
      [
        { text: 'End routine', style: 'destructive', onPress: handleLeave },
        { text: 'Keep this plan', style: 'cancel' },
      ]
    );
  }

  async function handleLeave() {
    setIsLeaving(true);
    try {
      await endActiveEnrolment();
      setEnrolment(null);
    } catch (error) {
      showDialog('Couldn’t end the routine', describeRoutineError(error));
    } finally {
      setIsLeaving(false);
    }
  }

  function openDetails(summary: RoutineSummary) {
    router.push({ pathname: '/routines/[id]', params: { id: summary.id } } as Href);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom }]}>
      {showTitle ? <Text style={styles.title}>Routines</Text> : null}
      <Text style={[styles.intro, !showTitle && styles.introFlush]}>
        Six plans to start with. Filter by tag, then open a plan to see the week-by-week details. Pro
        plans show week 1 on the free plan.
      </Text>

      {enrolment && (
        <View style={styles.activeCard}>
          <Text style={styles.activeLabel}>Your current routine</Text>
          <Text style={styles.activeName}>{enrolment.routine.name}</Text>
          <Text style={styles.meta}>
            Week {currentEnrolmentWeek(enrolment)} of {enrolment.routine.length_weeks}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            onPress={requestLeave}
            disabled={isLeaving}
            accessibilityRole="button">
            <Text style={styles.secondaryText}>{isLeaving ? 'Ending…' : 'End routine'}</Text>
          </Pressable>
        </View>
      )}

      {loadState === 'loading' && <ActivityIndicator color={colours.accent} style={styles.spinner} />}

      {loadState === 'error' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Couldn’t load routines</Text>
          <Text style={styles.body}>
            {missingSql ? missingRoutinesMessage() : 'Check your connection and try again.'}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            onPress={() => setAttempt((n) => n + 1)}
            accessibilityRole="button">
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {loadState === 'ready' && missingSql && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Routines aren’t in the database yet</Text>
          <Text style={styles.body}>{missingRoutinesMessage()}</Text>
        </View>
      )}

      {routines.length > 0 && (
        <View style={styles.filterRow}>
          <FilterSheet
            label="Tag"
            allLabel="All tags"
            options={collectRoutineTags(routines).map((value) => ({ value, label: value }))}
            value={tagFilter}
            onChange={setTagFilter}
          />
        </View>
      )}

      {routines
        .filter((summary) => !tagFilter || summary.tags.includes(tagFilter))
        .map((summary) => {
          const isCurrent = enrolment?.routine_id === summary.id;
          return (
            <View key={summary.id} style={styles.card}>
              <CoverPhoto
                cover={coverForRoutine(summary)}
                letter={summary.name.slice(0, 1)}
                height={168}
                style={styles.cover}
              />
              <View style={styles.chipRow}>
                {summary.is_pro ? (
                  <ProBadge />
                ) : (
                  <Text style={[styles.chip, styles.chipFree]}>Free</Text>
                )}
                {isCurrent && <Text style={[styles.chip, styles.chipCurrent]}>Current</Text>}
              </View>
              <Text style={styles.cardTitle}>{summary.name}</Text>
              <Text style={styles.meta}>
                {summary.length_weeks} weeks · {summary.days_per_week} days / week · about{' '}
                {summary.session_minutes} min
              </Text>
              <Text style={styles.body}>{summary.description}</Text>
              <View style={styles.tagRow}>
                {summary.tags.map((tag) => (
                  <Text key={tag} style={styles.tag}>
                    {tag}
                  </Text>
                ))}
              </View>
              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                onPress={() => openDetails(summary)}
                accessibilityRole="button">
                <Text style={styles.buttonText}>See more details</Text>
              </Pressable>
            </View>
          );
        })}
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
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 8,
  },
  intro: {
    fontSize: 16,
    color: colours.textMuted,
    marginBottom: 16,
    lineHeight: 22,
  },
  introFlush: {
    marginTop: 4,
  },
  filterRow: {
    marginBottom: 20,
  },
  spinner: {
    marginVertical: 24,
  },
  activeCard: {
    padding: 20,
    borderRadius: 18,
    backgroundColor: colours.accentSoft,
    marginBottom: 24,
  },
  activeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colours.accent,
    marginBottom: 4,
  },
  activeName: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
  },
  card: {
    padding: 20,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colours.surface,
    marginBottom: 20,
  },
  cover: {
    marginHorizontal: -20,
    marginTop: -20,
    marginBottom: 16,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    fontSize: 13,
    fontWeight: '700',
    color: colours.accent,
    backgroundColor: colours.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  chipFree: {
    color: colours.surface,
    backgroundColor: colours.accent,
  },
  chipCurrent: {
    color: colours.accent,
    backgroundColor: colours.background,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 6,
  },
  meta: {
    fontSize: 15,
    color: colours.textMuted,
    marginBottom: 4,
  },
  body: {
    fontSize: 16,
    color: colours.text,
    marginTop: 8,
    lineHeight: 22,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  tag: {
    fontSize: 13,
    fontWeight: '600',
    color: colours.textMuted,
    borderWidth: 1,
    borderColor: colours.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    marginRight: 8,
    marginBottom: 8,
  },
  button: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
    marginTop: 12,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  secondary: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
  },
  pressed: {
    opacity: 0.7,
  },
});
