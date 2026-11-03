import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/constants/theme';
import {
  REST_BANK_CAP,
  REST_EARN_EVERY,
  type StreakWeek,
  type StreakWeekStatus,
  type WeeklyStreak,
  describeStreak,
} from '@/lib/activityStats';

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
  const towards = streak.sessionWeeks % REST_EARN_EVERY;
  if (streak.restWeeksBanked >= REST_BANK_CAP) return '2 rest weeks ready';
  if (streak.restWeeksBanked === 1) {
    return towards > 0
      ? `1 rest week ready · ${towards} of ${REST_EARN_EVERY} towards another`
      : '1 rest week ready';
  }
  return `${towards} of ${REST_EARN_EVERY} weeks towards a rest week`;
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
  const { colours, radius, type, spacing } = useTheme();
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
      <Text style={[type.bodySm, { color: colours.ink, fontWeight: '600' }]}>
        Planned rest week. Enjoy it.
      </Text>
    </View>
  );
}

export function StreakCard({ streak }: { streak: WeeklyStreak }) {
  const { colours, radius, shadow, type, spacing } = useTheme();
  const runLabel =
    streak.current === 1 ? '1 week' : `${streak.current} weeks`;
  const trainedLabel =
    streak.weeksTrained === 1 ? '1 week' : `${streak.weeksTrained} weeks`;

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
      <Text style={[type.caption, { color: colours.accent, fontWeight: '700' }]}>Streak</Text>
      <Text style={[type.title, { color: colours.ink, marginTop: 6 }]}>Current run {runLabel}</Text>
      <Text style={[type.body, { color: colours.inkMuted, marginTop: 4 }]}>
        Weeks trained {trainedLabel}
      </Text>
      <Text style={[type.body, { color: colours.inkMuted, marginTop: 2 }]}>
        Gold weeks {streak.goldWeeks}
      </Text>

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

      <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: spacing.md }]}>
        {restBankCopy(streak)}
      </Text>
      {streak.current === 0 ? (
        <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 6 }]}>{describeStreak(streak)}</Text>
      ) : null}
    </View>
  );
}
