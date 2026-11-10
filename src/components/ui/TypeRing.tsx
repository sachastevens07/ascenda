import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import type { WeekTypeCounts } from '@/lib/activityStats';
import { SESSION_TYPE_COLOURS } from '@/lib/completeWeek';
import { fillCopy, weekRingCopy } from '@/lib/copy';

type TypeKey = keyof WeekTypeCounts;

const ICONS: Record<TypeKey, ComponentProps<typeof Ionicons>['name']> = {
  strength: 'barbell-outline',
  cardio: 'heart-outline',
  recovery: 'leaf-outline',
};

function typeColour(key: TypeKey, brand: string): string {
  if (key === 'strength') return brand;
  return SESSION_TYPE_COLOURS[key];
}

export function TypeRing({
  done,
  target,
  counts,
  style,
}: {
  done: number;
  target: number;
  counts: WeekTypeCounts;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing, shadow } = useTheme();
  const goal = Math.max(1, target);
  const size = 88;
  const stroke = 10;
  const ringRadius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * ringRadius;
  const centre = size / 2;
  const order: TypeKey[] = ['strength', 'cardio', 'recovery'];
  let offset = 0;
  const arcs = order.flatMap((key) => {
    const value = Math.max(0, counts[key]);
    if (value <= 0) return [];
    const length = circumference * Math.min(1, value / goal);
    const dashoffset = circumference * 0.25 - offset;
    offset += length;
    return [{ key, length, dashoffset, colour: typeColour(key, colours.brand) }];
  });

  return (
    <View
      style={[
        { backgroundColor: colours.surface, borderRadius: radius.xl, padding: spacing.md },
        shadow,
        style,
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`${fillCopy(weekRingCopy.sessions, { done, target: goal })}. ${fillCopy(
        weekRingCopy.counts,
        counts
      )}`}>
      <AppText variant="eyebrow" style={{ color: colours.accent, marginBottom: spacing.sm }}>
        {weekRingCopy.label}
      </AppText>
      <View style={styles.row}>
        <View style={[styles.ringWrap, { width: size, height: size }]}>
          <Svg width={size} height={size}>
            <Circle
              cx={centre}
              cy={centre}
              r={ringRadius}
              stroke={colours.surfaceMuted}
              strokeWidth={stroke}
              fill="none"
            />
            {arcs.map((arc) => (
              <Circle
                key={arc.key}
                cx={centre}
                cy={centre}
                r={ringRadius}
                stroke={arc.colour}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${arc.length} ${circumference}`}
                strokeDashoffset={arc.dashoffset}
                strokeLinecap="butt"
              />
            ))}
          </Svg>
          <View style={styles.ringLabel} pointerEvents="none">
            <AppText variant="title2" style={{ color: colours.ink }}>
              {Math.min(done, 99)}
            </AppText>
            <AppText variant="caption" style={{ color: colours.inkMuted }}>
              of {goal}
            </AppText>
          </View>
        </View>
        <View style={styles.counts}>
          {order.map((key) => (
            <View key={key} style={styles.countRow}>
              <Ionicons name={ICONS[key]} size={16} color={typeColour(key, colours.brand)} />
              <AppText variant="bodySm" style={{ color: colours.ink }}>
                {counts[key]} {weekRingCopy[key]}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabel: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counts: {
    flex: 1,
    gap: 8,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
