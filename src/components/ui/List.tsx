import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
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
  const { colours } = useTheme();
  return (
    <View style={[styles.section, style]}>
      <AppText variant="title2" style={{ color: colours.ink, flex: 1 }}>
        {title}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <AppText variant="bodyStrong" style={{ color: colours.accent }}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  eyebrow,
  eyebrowColor,
  left,
  right,
  onPress,
  showChevron = true,
  style,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  eyebrowColor?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();
  const inner = (
    <View
      style={[
        styles.row,
        { borderBottomColor: colours.border, backgroundColor: colours.surface },
        style,
      ]}>
      {left}
      <View style={styles.rowText}>
        {eyebrow ? (
          <AppText variant="eyebrow" style={{ color: eyebrowColor ?? colours.accent, marginBottom: 2 }}>
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="title3" style={{ color: colours.ink }} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
      {showChevron ? <Ionicons name="chevron-forward" size={20} color={colours.inkMuted} /> : null}
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
  today = false,
  onAdd,
  style,
}: {
  title: string;
  today?: boolean;
  onAdd?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();
  const ink = today ? colours.onBrand : colours.inkMuted;
  const body = (
    <View
      style={[
        styles.sticky,
        today ? { backgroundColor: colours.ink } : { backgroundColor: colours.surfaceMuted },
        style,
      ]}>
      <AppText variant="eyebrow" style={{ color: ink, flex: 1 }} numberOfLines={1}>
        {title}
      </AppText>
      {onAdd ? <Ionicons name="add" size={18} color={ink} /> : null}
    </View>
  );
  if (!onAdd) return body;
  return (
    <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add to ${title}`}>
      {body}
    </Pressable>
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
    height: 32,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 2,
    elevation: 3,
  },
  pressed: {
    opacity: 0.8,
  },
});
