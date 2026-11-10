import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, Chip, PrimaryButton, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { fetchFinishedSessionMeta } from '@/lib/activityStats';
import { fillCopy, recapCopy } from '@/lib/copy';
import {
  formatDelta,
  formatMetricValue,
  formatRecapDuration,
  formatRecapVolume,
  loadMonthlyRecap,
  metricValue,
  recapShareMessage,
  reportTitle,
  type ChartMetric,
  type MonthlyRecap,
} from '@/lib/monthlyRecap';
import { useProfile } from '@/lib/profile';
import { fetchProgressSets } from '@/lib/progress';

const METRICS: { id: ChartMetric; label: string }[] = [
  { id: 'workouts', label: recapCopy.workouts },
  { id: 'duration', label: recapCopy.duration },
  { id: 'volume', label: recapCopy.volume },
  { id: 'sets', label: recapCopy.sets },
];

function DeltaLine({
  current,
  previous,
  format,
}: {
  current: number;
  previous: number;
  format?: (value: number) => string;
}) {
  const { colours } = useTheme();
  const delta = formatDelta(current, previous, format);
  if (delta.flat || !delta.text) return null;
  return (
    <AppText
      variant="caption"
      style={{ color: delta.up ? colours.success : colours.inkMuted, marginTop: 2 }}>
      {delta.up ? '↑' : '↓'} {delta.text}
    </AppText>
  );
}

function MonthBarChart({
  recap,
  metric,
  width,
}: {
  recap: MonthlyRecap;
  metric: ChartMetric;
  width: number;
}) {
  const { colours, radius } = useTheme();
  const height = 140;
  const chartWidth = Math.max(240, width - 48);
  const values = recap.yearBars.map((bar) => metricValue(bar, metric));
  const max = Math.max(1, ...values);
  const gap = 6;
  const barWidth = (chartWidth - gap * 11) / 12;

  return (
    <View>
      <Svg width={chartWidth} height={height}>
        {recap.yearBars.map((bar, index) => {
          const value = values[index];
          const barHeight = Math.max(value > 0 ? 4 : 0, (value / max) * (height - 24));
          const active = bar.monthKey === recap.monthKey;
          return (
            <Rect
              key={bar.monthKey}
              x={index * (barWidth + gap)}
              y={height - 18 - barHeight}
              width={barWidth}
              height={barHeight}
              rx={4}
              fill={active ? colours.brand : colours.surfaceMuted}
            />
          );
        })}
      </Svg>
      <View style={[styles.barLabels, { width: chartWidth }]}>
        {recap.yearBars.map((bar) => (
          <AppText
            key={bar.monthKey}
            variant="caption"
            style={{
              color: bar.monthKey === recap.monthKey ? colours.brand : colours.inkMuted,
              width: barWidth + gap,
              textAlign: 'center',
            }}>
            {bar.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

function ShareCards({ recap }: { recap: MonthlyRecap }) {
  const { colours, radius, spacing, shadow } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(320, width - 64);

  return (
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}>
      <View
        style={[
          styles.shareCard,
          {
            width: cardWidth,
            backgroundColor: colours.ink,
            borderRadius: radius.xl,
            padding: spacing.lg,
          },
          shadow,
        ]}>
        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          {recap.monthName} {recap.year}
        </AppText>
        <AppText variant="title1" style={{ color: colours.bg, marginTop: spacing.sm }}>
          {recapCopy.workouts}
        </AppText>
        <View style={[styles.shareGrid, { marginTop: spacing.lg, gap: spacing.md }]}>
          {(
            [
              ['workouts', recap.totals.workouts, recap.previous.workouts, String] as const,
              [
                'duration',
                recap.totals.durationSeconds,
                recap.previous.durationSeconds,
                formatRecapDuration,
              ] as const,
              ['volume', recap.totals.volumeKg, recap.previous.volumeKg, formatRecapVolume] as const,
              ['sets', recap.totals.sets, recap.previous.sets, String] as const,
            ] as const
          ).map(([key, current, previous, format]) => (
            <View key={key} style={styles.shareStat}>
              <AppText variant="caption" style={{ color: colours.inkMuted }}>
                {recapCopy[key]}
              </AppText>
              <AppText variant="title2" style={{ color: colours.bg, marginTop: 4 }}>
                {format(current)}
              </AppText>
              <DeltaLine current={current} previous={previous} format={format} />
            </View>
          ))}
        </View>
        <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 'auto' }}>
          Ascenda
        </AppText>
      </View>

      <View
        style={[
          styles.shareCard,
          {
            width: cardWidth,
            backgroundColor: colours.ink,
            borderRadius: radius.xl,
            padding: spacing.lg,
          },
          shadow,
        ]}>
        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          {recap.monthName} {recap.year}
        </AppText>
        <AppText variant="title1" style={{ color: colours.bg, marginTop: spacing.sm }}>
          {recapCopy.personal_records}
        </AppText>
        <View style={{ marginTop: spacing.lg, gap: spacing.md, flex: 1 }}>
          {recap.personalBests.slice(0, 3).map((pb) => (
            <View key={pb.exerciseId}>
              <AppText variant="bodyStrong" style={{ color: colours.bg }}>
                {pb.name}
              </AppText>
              <AppText variant="body" style={{ color: colours.accent, marginTop: 2 }}>
                {pb.detail}
              </AppText>
            </View>
          ))}
          {recap.personalBests.length === 0 ? (
            <AppText variant="body" style={{ color: colours.inkMuted }}>
              No personal bests this month yet.
            </AppText>
          ) : null}
          {recap.personalBests.length > 3 ? (
            <AppText variant="caption" style={{ color: colours.inkMuted }}>
              {fillCopy(recapCopy.more_prs, { count: recap.personalBests.length - 3 })}
            </AppText>
          ) : null}
        </View>
        <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: spacing.md }}>
          Ascenda
        </AppText>
      </View>
    </ScrollView>
  );
}

export default function MonthlyRecapScreen() {
  const { month } = useLocalSearchParams<{ month: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colours, radius, spacing, shadow } = useTheme();
  const { profile } = useProfile();
  const [recap, setRecap] = useState<MonthlyRecap | null>(null);
  const [metric, setMetric] = useState<ChartMetric>('workouts');
  const [shareMode, setShareMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const firstName = profile?.display_name?.trim().split(/\s+/)[0] || 'you';

  useEffect(() => {
    let isCurrent = true;
    (async () => {
      const [sessions, sets] = await Promise.all([
        fetchFinishedSessionMeta().catch(() => []),
        fetchProgressSets().catch(() => []),
      ]);
      const loaded = await loadMonthlyRecap({
        sessions,
        sets,
        monthKey: month && /^\d{4}-\d{2}/.test(month) ? `${month.slice(0, 7)}-01` : undefined,
      });
      if (!isCurrent) return;
      setRecap(loaded);
      setLoading(false);
    })().catch(() => {
      if (isCurrent) setLoading(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [month]);

  const hero = useMemo(() => {
    if (!recap) return null;
    return {
      value: formatMetricValue(recap.totals, metric),
      delta: formatDelta(
        metricValue(recap.totals, metric),
        metricValue(recap.previous, metric),
        metric === 'duration'
          ? formatRecapDuration
          : metric === 'volume'
            ? formatRecapVolume
            : String
      ),
    };
  }, [metric, recap]);

  async function shareReport() {
    if (!recap) return;
    try {
      await Share.share({
        message: recapShareMessage(recap),
        title: reportTitle(recap),
      });
    } catch {
      showDialog('Could not share', 'You can still screenshot the card.');
    }
  }

  if (loading) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        <ActivityIndicator color={colours.brand} />
      </View>
    );
  }

  if (!recap) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg, padding: spacing.lg }]}>
        <AppText variant="title2" style={{ color: colours.ink, textAlign: 'center' }}>
          {recapCopy.window_closed}
        </AppText>
        <AppText
          variant="body"
          style={{ color: colours.inkMuted, textAlign: 'center', marginTop: spacing.sm }}>
          {recapCopy.empty_month}
        </AppText>
        <TextButton label="Back" onPress={() => router.back()} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  if (shareMode) {
    return (
      <View style={[styles.screen, { backgroundColor: colours.bg, paddingBottom: insets.bottom + 16 }]}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
          <AppText variant="title2" style={{ color: colours.ink }}>
            {recapCopy.share_prompt}
          </AppText>
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
            {recapCopy.share_note}
          </AppText>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: spacing.lg }}>
          <ShareCards recap={recap} />
        </View>
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          <PrimaryButton label={recapCopy.share} onPress={() => void shareReport()} />
          <TextButton label="Back to report" onPress={() => setShareMode(false)} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + 120,
          gap: spacing.lg,
        }}>
        <View>
          <AppText variant="title1" style={{ color: colours.ink }}>
            {recap.monthName} {recap.year}
          </AppText>
          <AppText variant="display" style={{ color: colours.ink, marginTop: spacing.sm }}>
            {hero?.value}
          </AppText>
          {hero && !hero.delta.flat && hero.delta.text ? (
            <AppText
              variant="body"
              style={{
                color: hero.delta.up ? colours.success : colours.inkMuted,
                marginTop: 4,
              }}>
              {hero.delta.up ? '↑' : '↓'} {hero.delta.text}
            </AppText>
          ) : null}
        </View>

        <MonthBarChart recap={recap} metric={metric} width={width} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {METRICS.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              selected={metric === item.id}
              onPress={() => setMetric(item.id)}
            />
          ))}
        </ScrollView>

        <View>
          <AppText variant="eyebrow" style={{ color: colours.inkMuted, marginBottom: spacing.sm }}>
            {recapCopy.summary}
          </AppText>
          <View style={[styles.grid, { gap: spacing.sm }]}>
            {(
              [
                [recapCopy.workouts, recap.totals.workouts, recap.previous.workouts, String] as const,
                [
                  recapCopy.duration,
                  recap.totals.durationSeconds,
                  recap.previous.durationSeconds,
                  formatRecapDuration,
                ] as const,
                [
                  recapCopy.volume,
                  recap.totals.volumeKg,
                  recap.previous.volumeKg,
                  formatRecapVolume,
                ] as const,
                [recapCopy.sets, recap.totals.sets, recap.previous.sets, String] as const,
              ] as const
            ).map(([label, current, previous, format]) => (
              <View
                key={label}
                style={[
                  styles.summaryTile,
                  {
                    backgroundColor: colours.surface,
                    borderRadius: radius.lg,
                    padding: spacing.md,
                  },
                  shadow,
                ]}>
                <AppText variant="caption" style={{ color: colours.inkMuted }}>
                  {label}
                </AppText>
                <AppText variant="title2" style={{ color: colours.ink, marginTop: 6 }}>
                  {format(current)}
                </AppText>
                <DeltaLine current={current} previous={previous} format={format} />
              </View>
            ))}
          </View>
        </View>

        {recap.exercises.length > 0 ? (
          <View>
            <AppText variant="eyebrow" style={{ color: colours.inkMuted, marginBottom: spacing.sm }}>
              {recapCopy.exercises}
            </AppText>
            <View
              style={[
                {
                  backgroundColor: colours.surface,
                  borderRadius: radius.xl,
                  overflow: 'hidden',
                },
                shadow,
              ]}>
              {recap.exercises.slice(0, 12).map((row, index) => (
                <View
                  key={row.exerciseId}
                  style={[
                    styles.exerciseRow,
                    {
                      borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: colours.border,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.md,
                    },
                  ]}>
                  <AppText variant="bodyStrong" style={{ color: colours.ink, flex: 1 }}>
                    {row.name}
                  </AppText>
                  <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                    {fillCopy(recapCopy.times, { count: row.times })}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View
          style={[
            {
              backgroundColor: colours.accentSoft,
              borderRadius: radius.xl,
              padding: spacing.lg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colours.accent,
            },
            shadow,
          ]}>
          <AppText style={{ fontSize: 36, lineHeight: 42, marginBottom: spacing.sm }}>
            {recapCopy.congrats_emoji}
          </AppText>
          <AppText variant="title3" style={{ color: colours.ink }}>
            {fillCopy(recapCopy.congrats, { month: recap.monthName, name: firstName })}
          </AppText>
          <AppText variant="body" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
            {recapCopy.congrats_body}
          </AppText>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 12,
            paddingHorizontal: spacing.lg,
            backgroundColor: colours.bg,
            borderTopColor: colours.border,
          },
        ]}>
        <PrimaryButton label={recapCopy.share} onPress={() => setShareMode(true)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centre: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barLabels: {
    flexDirection: 'row',
    marginTop: 4,
  },
  chips: {
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryTile: {
    width: '48%',
    flexGrow: 1,
    minHeight: 96,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  shareCard: {
    minHeight: 420,
  },
  shareGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  shareStat: {
    width: '48%',
  },
});
