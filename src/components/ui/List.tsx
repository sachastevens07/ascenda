import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/constants/theme';

export function ChipScroller({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      style={style}>
      {children}
    </ScrollView>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, type } = useTheme();
  return (
    <View style={[styles.section, style]}>
      <Text style={[type.title, { color: colours.ink, flex: 1 }]}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={[type.caption, { color: colours.brand, fontWeight: '700' }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  showChevron = true,
  style,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, type } = useTheme();
  const inner = (
    <View
      style={[
        styles.row,
        { borderBottomColor: colours.border, backgroundColor: colours.surface },
        style,
      ]}>
      {left}
      <View style={styles.rowText}>
        <Text style={[type.title3, { color: colours.ink }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 2 }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {showChevron && onPress ? <Ionicons name="chevron-forward" size={20} color={colours.inkMuted} /> : null}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => pressed && styles.pressed}>
      {inner}
    </Pressable>
  );
}

export function StickyDayHeader({
  title,
  onRest,
  onAdd,
  style,
}: {
  title: string;
  onRest?: () => void;
  onAdd?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, type } = useTheme();
  return (
    <View style={[styles.sticky, { backgroundColor: colours.bg, borderBottomColor: colours.border }, style]}>
      <Text style={[type.title, { color: colours.ink, flex: 1 }]}>{title}</Text>
      {onRest ? (
        <Pressable onPress={onRest} accessibilityRole="button" accessibilityLabel="Rest day" hitSlop={8}>
          <Ionicons name="moon-outline" size={22} color={colours.ink} />
        </Pressable>
      ) : null}
      {onAdd ? (
        <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add workout" hitSlop={8}>
          <Ionicons name="add" size={24} color={colours.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: 8,
    paddingVertical: 4,
    paddingRight: 8,
    alignItems: 'center',
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  row: {
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
  },
  sticky: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.8,
  },
});
