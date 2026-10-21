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
import { ZONES, ZONE_LABELS, type Zone } from '@/lib/exercises';
import { fetchConfidenceHistory, type ConfidenceHistory } from '@/lib/levelUp';
import {
  LEVELS,
  LEVEL_DESCRIPTIONS,
  LEVEL_LABELS,
  getQuizAnswers,
  useProfile,
  type Level,
} from '@/lib/profile';
import { formatKg } from '@/lib/programmes';
import {
  fetchFinishedSessionDates,
  fetchProgressSets,
  formatShortDate,
  getConfidenceTimeline,
  getLiftHistory,
  getLiftOptions,
  getPersonalBests,
  getTrainedZones,
  getWeeklyCounts,
  parseDate,
  type ConfidenceEvent,
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
  /** Empty if she hasn't changed level, or if level_up.sql hasn't been run. */
  confidenceHistory: ConfidenceHistory[];
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
  const answers = getQuizAnswers(profile);
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
        fetchConfidenceHistory().catch(() => []),
      ])
        .then(([sets, sessionDates, cyclePatterns, confidenceHistory]) => {
          if (!isCurrent) return;
          setData({ sets, sessionDates, cyclePatterns, confidenceHistory });
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

  const isEmpty = data.sessionDates.length === 0;
  const level = answers?.confidence_level ?? null;
  const bests = getPersonalBests(data.sets);
  const liftOptions = getLiftOptions(data.sets);
  const lift = liftOptions.find((option) => option.exerciseId === liftId) ?? liftOptions[0];
  const history = lift ? getLiftHistory(data.sets, lift.exerciseId) : [];
  const weeks = getWeeklyCounts(data.sessionDates);
  const activeWeeks = weeks.filter((week) => week.count > 0).length;
  const trainedZones = getTrainedZones(data.sets);
  const timeline = level
    ? getConfidenceTimeline(data.confidenceHistory, level, profile?.onboarding_completed_at ?? null)
    : [];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <Text style={styles.title}>Progress</Text>

        {isEmpty && (
          <View style={styles.emptyIntro}>
            <Ionicons name="trending-up" size={36} color={colours.accent} />
            <Text style={styles.emptyTitle}>Your progress starts here</Text>
            <Text style={styles.emptyCopy}>
              Finish your first session and your personal bests, lifts and weeks will appear here.
            </Text>
          </View>
        )}

        {level && (
          <ConfidenceCard level={level} timeline={timeline} trainedZones={trainedZones} />
        )}

        {!isEmpty && (
          <>
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
          </>
        )}

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

const LEVEL_STEP_LABELS: Record<Level, string> = {
  1: 'Corner',
  2: 'Area',
  3: 'Machines',
  4: 'Gym',
};

function formatEventDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatShortDate(parseDate(value));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatShortDate(parsed);
}

function describeTimelineEvent(event: ConfidenceEvent): string {
  switch (event.kind) {
    case 'started':
      return `Started at ${LEVEL_LABELS[event.level]}`;
    case 'up':
      return `Moved up to ${LEVEL_LABELS[event.level]}`;
    case 'down':
      return `Moved back to ${LEVEL_LABELS[event.level]}`;
  }
}

function ConfidenceCard({
  level,
  timeline,
  trainedZones,
}: {
  level: Level;
  timeline: ConfidenceEvent[];
  trainedZones: Zone[];
}) {
  const trained = new Set(trainedZones);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Your confidence</Text>
      <Text style={styles.levelName}>{LEVEL_LABELS[level]}</Text>
      <Text style={styles.chartNote}>{LEVEL_DESCRIPTIONS[level]}</Text>

      <View style={styles.levelTrack} accessibilityLabel={`Level ${level} of 4`}>
        {LEVELS.map((step) => {
          const reached = step <= level;
          return (
            <View key={step} style={styles.levelStep}>
              <View style={[styles.levelDot, reached && styles.levelDotOn]} />
              <Text style={[styles.levelStepLabel, step === level && styles.levelStepLabelOn]}>
                {LEVEL_STEP_LABELS[step]}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Level-ups</Text>
      {timeline.map((event, index) => (
        <View key={`${event.kind}-${event.level}-${event.date ?? index}`} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <View style={[styles.timelineDot, event.kind === 'up' && styles.timelineDotUp]} />
            {index < timeline.length - 1 && <View style={styles.timelineLine} />}
          </View>
          <View style={styles.flex}>
            <Text style={styles.bestName}>{describeTimelineEvent(event)}</Text>
            {event.date ? (
              <Text style={styles.bestDetail}>{formatEventDate(event.date)}</Text>
            ) : (
              <Text style={styles.bestDetail}>When you started</Text>
            )}
          </View>
        </View>
      ))}
      {timeline.length <= 1 && (
        <Text style={styles.footnote}>
          Level-ups will show here as you take up more of the gym. You can also change your level
          any time from Profile.
        </Text>
      )}

      <Text style={styles.sectionLabel}>Zones you’ve trained in</Text>
      <View style={styles.zoneGrid}>
        {ZONES.map((zone) => {
          const done = trained.has(zone);
          return (
            <View
              key={zone}
              style={[styles.zoneChip, done && styles.zoneChipOn]}
              accessibilityState={{ selected: done }}>
              <Text style={[styles.zoneChipText, done && styles.zoneChipTextOn]}>
                {ZONE_LABELS[zone]}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.footnote}>
        {trainedZones.length === 0
          ? 'Finish a session and the parts of the gym you’ve used will show here.'
          : 'From the sets you’ve ticked in finished sessions.'}
      </Text>
    </View>
  );
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
  emptyIntro: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  emptyCopy: {
    fontSize: 17,
    lineHeight: 24,
    color: colours.textMuted,
    textAlign: 'center',
  },
  levelName: {
    fontSize: 24,
    fontWeight: '700',
    color: colours.accent,
  },
  levelTrack: {
    flexDirection: 'row',
    paddingTop: 4,
  },
  levelStep: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  levelDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colours.border,
  },
  levelDotOn: {
    backgroundColor: colours.accent,
  },
  levelStepLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colours.textMuted,
    textAlign: 'center',
  },
  levelStepLabelOn: {
    color: colours.accent,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.text,
    marginTop: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  timelineRail: {
    width: 14,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colours.border,
    marginTop: 5,
  },
  timelineDotUp: {
    backgroundColor: colours.accent,
  },
  timelineLine: {
    width: 2,
    flexGrow: 1,
    minHeight: 16,
    backgroundColor: colours.border,
    marginTop: 4,
  },
  zoneGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  zoneChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colours.background,
    borderWidth: 1,
    borderColor: colours.border,
  },
  zoneChipOn: {
    backgroundColor: colours.accentSoft,
    borderColor: colours.accent,
  },
  zoneChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colours.textMuted,
  },
  zoneChipTextOn: {
    color: colours.accent,
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
