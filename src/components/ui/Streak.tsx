import { View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import {
  REST_EARN_EVERY,
  type StreakWeek,
  type StreakWeekStatus,
  type WeeklyStreak,
  describeStreak,
} from '@/lib/activityStats';
import { fillCopy, streakCopy, streakWeeksLabel } from '@/lib/copy';

function circleColour(
  status: StreakWeekStatus,
  colours: ReturnType<typeof useTheme>['colours']
): { fill: string; border: string } {
  if (status === 'gold') return { fill: colours.pro, border: colours.pro };
  if (status === 'counted') return { fill: colours.brand, border: colours.brand };
  if (status === 'rest') return { fill: colours.accentSoft, border: colours.accent };
  if (status === 'repaired') return { fill: colours.success, border: colours.success };
  if (status === 'missed') return { fill: colours.surfaceMuted, border: colours.surfaceMuted };
  return { fill: 'transparent', border: colours.border };
}

function restBankCopy(streak: WeeklyStreak): string {
  if (streak.restWeeksBanked > 0 && streak.sessionWeeks > 0 && streak.sessionWeeks % REST_EARN_EVERY === 0) {
    return streakCopy.rest_week_earned;
  }
  return fillCopy(streakCopy.rest_week_banked, { count: streak.restWeeksBanked });
}

function weekLabel(week: StreakWeek): string {
  if (week.status === 'gold') return 'gold';
  if (week.status === 'counted') return 'counted';
  if (week.status === 'rest') return 'rest';
  if (week.status === 'repaired') return 'repaired';
  if (week.status === 'missed') return 'quiet';
  return 'this week';
}

export function RestWeekBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colours, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colours.accentSoft,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        },
        style,
      ]}>
      <AppText variant="bodyStrong" style={{ color: colours.ink }}>
        Planned rest week. Enjoy it.
      </AppText>
    </View>
  );
}

export function StreakCard({ streak }: { streak: WeeklyStreak }) {
  const { colours, radius, shadow, spacing } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colours.surface,
          borderRadius: radius.xl,
          padding: spacing.lg,
        },
        shadow,
      ]}>
      <AppText variant="eyebrow" style={{ color: colours.accent }}>
        {streakCopy.label}
      </AppText>
      <AppText variant="title2" style={{ color: colours.ink, marginTop: 6 }}>
        {streakCopy.current_run} {streakWeeksLabel(streak.current)}
      </AppText>
      <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 4 }}>
        {fillCopy(streakCopy.goal_progress, { current: streak.current, goal: streak.goal })}
      </AppText>
      <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 2 }}>
        {streakCopy.weeks_trained} {streakWeeksLabel(streak.weeksTrained)}
      </AppText>
      <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 2 }}>
        {streakCopy.gold_weeks} {streak.goldWeeks}
      </AppText>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: spacing.md,
        }}
        accessibilityRole="text"
        accessibilityLabel={`Last ${streak.recent.length} weeks: ${streak.recent.map(weekLabel).join(', ')}`}>
        {streak.recent.map((week) => {
          const tone = circleColour(week.status, colours);
          return (
            <View
              key={week.monday}
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: tone.fill,
                borderWidth: 1.5,
                borderColor: tone.border,
              }}
            />
          );
        })}
      </View>

      <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.md }}>
        {restBankCopy(streak)}
      </AppText>
      <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 6 }}>
        {describeStreak(streak)}
      </AppText>
    </View>
  );
}
