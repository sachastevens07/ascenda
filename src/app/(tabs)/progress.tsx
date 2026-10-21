import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LineChart } from '@/components/LineChart';
import { useTabBarHeight } from '@/components/PillTabBar';
import { colours } from '@/constants/theme';
import { CYCLE_PHASE_LABELS, fetchCyclePatterns, type PhasePattern } from '@/lib/cycle';
import { useProfile } from '@/lib/profile';
import { formatKg } from '@/lib/programmes';
import {
  fetchFinishedSessionDates,
  fetchProgressSets,
  formatShortDate,
  getLiftHistory,
  getLiftOptions,
  getPersonalBests,
  getWeeklyCounts,
  parseDate,
  type PersonalBest,
  type ProgressSet,
  type WeekCount,
} from '@/lib/progress';
import { useSubscription } from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'ready';

type ProgressData = {
  sets: ProgressSet[];
  sessionDates: string[];
  /** Null while cycle notes are off, or if they couldn't be loaded. */
  cyclePatterns: PhasePattern[] | null;
};

const BAR_WIDTH = 20;
const BAR_GAP = 8;
const BAR_AREA_HEIGHT = 120;
/** Keeps a 1-session week from looking like a full bar. */
const MIN_BAR_SCALE = 4;

function describeBest(best: PersonalBest): string {
  switch (best.kind) {
    case 'weight':
      return `${formatKg(best.weightKg ?? 0)} × ${best.reps}`;
    case 'assisted':
      return `${formatKg(best.weightKg ?? 0)} of help × ${best.reps}`;
    case 'reps':
      return `${best.reps} reps`;
  }
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { profile } = useProfile();
  const cycleNotesOn = profile?.cycle_tracking_enabled ?? false;
  const { isPro } = useSubscription();
  const [data, setData] = useState<ProgressData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [liftId, setLiftId] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Reloads every time Progress comes into view, so a session she just finished shows up.
  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      Promise.all([
        fetchProgressSets(),
        fetchFinishedSessionDates(),
        cycleNotesOn ? fetchCyclePatterns().catch(() => null) : null,
      ])
        .then(([sets, sessionDates, cyclePatterns]) => {
          if (!isCurrent) return;
          setData({ sets, sessionDates, cyclePatterns });
          setLoadState('ready');
        })
        .catch(() => {
          if (isCurrent) setLoadState((state) => (state === 'ready' ? state : 'error'));
        });
      return () => {
        isCurrent = false;
      };
    }, [attempt, cycleNotesOn])
  );

  if (loadState !== 'ready' || !data) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <>
            <Text style={styles.message}>
              We couldn’t load your progress. Check your connection and try again.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, styles.retry, pressed && styles.pressed]}
              onPress={() => {
                setLoadState('loading');
                setAttempt((count) => count + 1);
              }}
              accessibilityRole="button">
              <Text style={styles.outlineButtonText}>Try again</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  if (data.sessionDates.length === 0) {
    return (
      <View style={styles.centre}>
        <Ionicons name="trending-up" size={40} color={colours.accent} />
        <Text style={styles.emptyTitle}>Your progress starts here</Text>
        <Text style={styles.message}>
          Finish your first session and your personal bests, lifts and weeks will appear here.
        </Text>
      </View>
    );
  }

  const bests = getPersonalBests(data.sets);
  const liftOptions = getLiftOptions(data.sets);
  const lift = liftOptions.find((option) => option.exerciseId === liftId) ?? liftOptions[0];
  const history = lift ? getLiftHistory(data.sets, lift.exerciseId) : [];
  const weeks = getWeeklyCounts(data.sessionDates);
  const activeWeeks = weeks.filter((week) => week.count > 0).length;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <Text style={styles.title}>Progress</Text>

        <View style={styles.stats}>
          <Stat value={data.sessionDates.length} label={data.sessionDates.length === 1 ? 'session' : 'sessions'} />
          <Stat value={activeWeeks} label={activeWeeks === 1 ? 'week training' : 'weeks training'} />
          <Stat value={bests.length} label={bests.length === 1 ? 'lift tracked' : 'lifts tracked'} />
        </View>

        {isPro ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sessions per week</Text>
            <WeeklyBars weeks={weeks} />
          </View>
        ) : (
          <View style={styles.card}>
            <Ionicons name="stats-chart-outline" size={28} color={colours.accent} />
            <Text style={styles.cardTitle}>See your progress over time</Text>
            <Text style={styles.chartNote}>
              With Pro, chart your sessions each week and the weight on every lift.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
              onPress={() => router.push('/paywall')}
              accessibilityRole="button">
              <Text style={styles.outlineButtonText}>See Pro</Text>
            </Pressable>
          </View>
        )}

        {isPro && lift && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{lift.assisted ? 'Help over time' : 'Weight over time'}</Text>
            <Pressable
              style={({ pressed }) => [styles.picker, pressed && styles.pressed]}
              onPress={() => setIsPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Lift: ${lift.exerciseName}. Change lift`}>
              <Text style={styles.pickerText} numberOfLines={1}>
                {lift.exerciseName}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colours.accent} />
            </Pressable>
            <LineChart
              points={history.map((point) => ({ x: parseDate(point.date).getTime(), y: point.kg }))}
              formatX={(x) => formatShortDate(new Date(x))}
              formatY={(y) => `${Math.round(y)} kg`}
            />
            <Text style={styles.chartNote}>{describeChange(history, lift.assisted)}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal bests</Text>
          {bests.map((best) => (
            <View key={best.exerciseId} style={styles.bestRow}>
              <View style={styles.flex}>
                <Text style={styles.bestName}>{best.exerciseName}</Text>
                <Text style={styles.bestValue}>{describeBest(best)}</Text>
                {best.estimatedMaxKg !== null && (
                  <Text style={styles.bestDetail}>
                    Estimated 1-rep max: {formatKg(best.estimatedMaxKg)}
                  </Text>
                )}
              </View>
              <Text style={styles.bestDate}>{formatShortDate(parseDate(best.date))}</Text>
            </View>
          ))}
          <Text style={styles.footnote}>
            Estimated 1-rep max is worked out from your best set of up to 12 reps. There’s no need
            to test it.
          </Text>
        </View>

        {cycleNotesOn && data.cyclePatterns && <CyclePatterns patterns={data.cyclePatterns} />}

        <Text style={styles.disclaimer}>
          General fitness guidance, not medical advice. Stop if anything hurts.
        </Text>
      </ScrollView>

      <Modal
        visible={isPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsPickerOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsPickerOpen(false)}
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle}>Choose a lift</Text>
          <ScrollView>
            {liftOptions.map((option) => {
              const isSelected = option.exerciseId === lift?.exerciseId;
              return (
                <Pressable
                  key={option.exerciseId}
                  onPress={() => {
                    setLiftId(option.exerciseId);
                    setIsPickerOpen(false);
                  }}
                  style={styles.sheetRow}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}>
                  <View style={styles.flex}>
                    <Text style={[styles.sheetRowText, isSelected && styles.sheetRowTextSelected]}>
                      {option.exerciseName}
                    </Text>
                    <Text style={styles.bestDetail}>
                      {option.sessionCount} {option.sessionCount === 1 ? 'session' : 'sessions'}
                    </Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark" size={22} color={colours.accent} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function describeChange(history: { kg: number }[], assisted: boolean): string {
  if (history.length < 2) {
    return 'Your chart grows each time you do this lift.';
  }
  const first = history[0].kg;
  const latest = history[history.length - 1].kg;
  const change = latest - first;
  if (assisted) {
    return change < 0
      ? `Down from ${formatKg(first)} to ${formatKg(latest)} of help. Great progress.`
      : `Latest: ${formatKg(latest)} of help. Keep going.`;
  }
  return change > 0
    ? `Up from ${formatKg(first)} to ${formatKg(latest)} (+${formatKg(change)}). Great progress.`
    : `Latest: ${formatKg(latest)}. Every session counts.`;
}

function CyclePatterns({ patterns }: { patterns: PhasePattern[] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Your cycle notes</Text>
      {patterns.length === 0 ? (
        <Text style={styles.chartNote}>
          Add a cycle phase to a session from the workout screen, and your patterns will show here.
        </Text>
      ) : (
        patterns.map((pattern) => {
          const details = [
            `${formatOneDecimal(pattern.averageSets)} sets`,
            pattern.averageMinutes === null ? null : `${Math.round(pattern.averageMinutes)} min`,
            pattern.averageVolumeKg === null
              ? null
              : `${formatThousands(Math.round(pattern.averageVolumeKg))} kg lifted`,
          ].filter((detail) => detail !== null);
          return (
            <View key={pattern.phase} style={styles.bestRow}>
              <View style={styles.flex}>
                <Text style={styles.bestName}>{CYCLE_PHASE_LABELS[pattern.phase]}</Text>
                <Text style={styles.bestDetail}>On average: {details.join(' · ')}</Text>
              </View>
              <Text style={styles.bestDate}>
                {pattern.sessionCount} {pattern.sessionCount === 1 ? 'session' : 'sessions'}
              </Text>
            </View>
          );
        })
      )}
      <Text style={styles.footnote}>
        From your own finished sessions. Everyone’s cycle is different, so patterns get clearer with a
        few sessions in each phase. This isn’t advice.
      </Text>
    </View>
  );
}

/** 12500 → "12,500". */
function formatThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatOneDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function WeeklyBars({ weeks }: { weeks: WeekCount[] }) {
  const scrollRef = useRef<ScrollView>(null);
  const scale = Math.max(MIN_BAR_SCALE, ...weeks.map((week) => week.count));
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={styles.bars}>
      {weeks.map((week, index) => {
        const isThisWeek = index === weeks.length - 1;
        // Label every fourth week, counting back from this week.
        const showLabel = (weeks.length - 1 - index) % 4 === 0;
        return (
          <View key={week.weekStart.getTime()} style={styles.barColumn}>
            <View style={styles.barArea}>
              {week.count > 0 && <Text style={styles.barCount}>{week.count}</Text>}
              <View
                style={[
                  styles.bar,
                  { height: Math.max(4, (week.count / scale) * (BAR_AREA_HEIGHT - 20)) },
                  week.count === 0 && styles.barEmpty,
                ]}
              />
            </View>
            <Text style={styles.barLabel} numberOfLines={1}>
              {isThisWeek ? 'Now' : showLabel ? formatShortDate(week.weekStart) : ''}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colours.background,
  },
  content: {
    padding: 24,
    paddingTop: 32,
    gap: 16,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: colours.background,
  },
  message: {
    fontSize: 17,
    lineHeight: 24,
    color: colours.textMuted,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colours.text,
    textAlign: 'center',
  },
  retry: {
    alignSelf: 'stretch',
    marginTop: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
  },
  flex: {
    flex: 1,
  },
  stats: {
    flexDirection: 'row',
    gap: 10,
  },
  stat: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: colours.accent,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colours.surface,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colours.accentSoft,
    marginTop: 2,
  },
  card: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: colours.surface,
    gap: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colours.accentSoft,
  },
  pickerText: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colours.accent,
  },
  chartNote: {
    fontSize: 15,
    lineHeight: 21,
    color: colours.text,
  },
  bars: {
    alignItems: 'flex-end',
    gap: BAR_GAP,
    paddingTop: 4,
    paddingHorizontal: BAR_WIDTH,
  },
  barColumn: {
    width: BAR_WIDTH,
    alignItems: 'center',
    overflow: 'visible',
  },
  barArea: {
    height: BAR_AREA_HEIGHT,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 6,
    backgroundColor: colours.accent,
  },
  barEmpty: {
    backgroundColor: colours.border,
  },
  barCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colours.accent,
    marginBottom: 4,
  },
  barLabel: {
    width: BAR_WIDTH * 3,
    fontSize: 11,
    color: colours.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  bestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colours.border,
  },
  bestName: {
    fontSize: 17,
    fontWeight: '600',
    color: colours.text,
  },
  bestValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.accent,
    marginTop: 2,
  },
  bestDetail: {
    fontSize: 14,
    color: colours.textMuted,
    marginTop: 2,
  },
  bestDate: {
    fontSize: 14,
    color: colours.textMuted,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 19,
    color: colours.textMuted,
    marginTop: 4,
  },
  outlineButton: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  outlineButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    textAlign: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31, 27, 36, 0.35)',
  },
  sheet: {
    maxHeight: '70%',
    paddingTop: 20,
    paddingHorizontal: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colours.surface,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colours.border,
  },
  sheetRowText: {
    fontSize: 17,
    color: colours.text,
  },
  sheetRowTextSelected: {
    fontWeight: '700',
    color: colours.accent,
  },
});
