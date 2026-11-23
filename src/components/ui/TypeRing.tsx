import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { isFeatureEnabled } from '@/config/features';
import { useTheme } from '@/constants/theme';
import type { WeekTypeCounts } from '@/lib/activityStats';
import { fillCopy, weekRingCopy } from '@/lib/copy';

type TypeKey = keyof WeekTypeCounts;

const ICONS: Record<TypeKey | 'sessions', ComponentProps<typeof Ionicons>['name']> = {
  sessions: 'checkmark-circle-outline',
  strength: 'barbell-outline',
  cardio: 'heart-outline',
  recovery: 'leaf-outline',
};

function sentence(label: string): string {
  if (!label) return label;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Tile({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}) {
  const { colours, radius } = useTheme();
  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: colours.bg,
          borderColor: colours.border,
          borderRadius: radius.lg,
        },
      ]}>
      <View style={styles.tileTop}>
        <AppText variant="title2" style={{ color: colours.accent }}>
          {value}
        </AppText>
        <View style={[styles.tileIcon, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
          <Ionicons name={icon} size={14} color={colours.brand} />
        </View>
      </View>
      <AppText variant="caption" style={{ color: colours.inkMuted }} numberOfLines={2}>
        {label}
      </AppText>
    </View>
  );
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
  const goal = Math.max(1, Math.round(target));
  const showRecovery = isFeatureEnabled('stretches') || counts.recovery > 0;
  const tiles: { value: string; label: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
    { value: String(Math.min(done, 99)), label: 'Sessions', icon: ICONS.sessions },
    {
      value: String(counts.strength),
      label: sentence(weekRingCopy.strength),
      icon: ICONS.strength,
    },
    {
      value: String(counts.cardio),
      label: sentence(weekRingCopy.cardio),
      icon: ICONS.cardio,
    },
  ];
  if (showRecovery) {
    tiles.push({
      value: String(counts.recovery),
      label: sentence(weekRingCopy.recovery),
      icon: ICONS.recovery,
    });
  }
  const rows: typeof tiles[] = [];
  for (let i = 0; i < tiles.length; i += 2) {
    rows.push(tiles.slice(i, i + 2));
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colours.surface, borderRadius: radius.xl, padding: spacing.sm, gap: spacing.sm },
        shadow,
        style,
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`${fillCopy(weekRingCopy.sessions, { done, target: goal })}. ${fillCopy(
        weekRingCopy.counts,
        showRecovery ? counts : { ...counts, recovery: 0 }
      )}`}>
      <View style={styles.header}>
        <AppText variant="title3" style={{ color: colours.ink, flex: 1 }}>
          {weekRingCopy.label}
        </AppText>
        <AppText variant="caption" style={{ color: colours.inkMuted }}>
          {fillCopy(weekRingCopy.sessions, { done, target: goal })}
        </AppText>
      </View>
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          {row.map((tile) => (
            <Tile key={tile.label} value={tile.value} label={tile.label} icon={tile.icon} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileIcon: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
