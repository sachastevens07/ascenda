import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { useTheme } from '@/constants/theme';

export function ProBadge({
  locked = false,
  compact = false,
  style,
}: {
  locked?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius } = useTheme();
  const iconSize = compact ? 10 : 12;
  return (
    <View
      style={[
        styles.pro,
        { backgroundColor: colours.pro, borderRadius: radius.full },
        compact && styles.proCompact,
        style,
      ]}
      accessibilityLabel={locked ? 'Pro, locked' : 'Pro'}>
      {locked ? <Ionicons name="lock-closed" size={iconSize} color={colours.onPro} /> : null}
      <Text style={[styles.proLabel, { color: colours.onPro }, compact && styles.proLabelCompact]}>PRO</Text>
    </View>
  );
}

export function ProMark({
  children,
  locked = false,
  compact = false,
  textStyle,
  style,
}: {
  children: string;
  locked?: boolean;
  compact?: boolean;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.mark, style]}>
      <ProBadge locked={locked} compact={compact} />
      <Text style={textStyle}>{children}</Text>
    </View>
  );
}

export function FreeBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colours, radius } = useTheme();
  return (
    <View
      style={[
        styles.free,
        { backgroundColor: colours.surface, borderRadius: radius.full },
        style,
      ]}
      accessibilityLabel="Free">
      <Text style={[styles.freeLabel, { color: colours.brand }]}>FREE</Text>
    </View>
  );
}

export function AchievementBadge({
  unlocked,
  label,
  mark,
  children,
  style,
}: {
  unlocked: boolean;
  label: string;
  /** Milestone number drawn in the medal, Sweat-style. */
  mark?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();
  return (
    <View
      style={[
        styles.achievement,
        {
          backgroundColor: unlocked ? colours.accent : colours.surfaceMuted,
          borderWidth: unlocked ? 0 : 1,
          borderColor: colours.border,
        },
        style,
      ]}
      accessibilityLabel={unlocked ? label : `${label}, locked`}>
      {mark ? (
        <Text style={[styles.markText, { color: unlocked ? colours.onAccent : colours.inkMuted }]}>{mark}</Text>
      ) : children ? (
        children
      ) : unlocked ? (
        <Ionicons name="checkmark" size={14} color={colours.onAccent} />
      ) : null}
    </View>
  );
}

export function LockedOverlay({
  onUnlock,
  label = 'Unlock with Pro',
  style,
}: {
  onUnlock?: () => void;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, type } = useTheme();
  return (
    <View
      pointerEvents={onUnlock ? 'auto' : 'none'}
      style={[
        styles.locked,
        { backgroundColor: colours.overlay, borderRadius: radius.lg },
        style,
      ]}>
      <Ionicons name="lock-closed" size={22} color={colours.onAccent} />
      {onUnlock ? (
        <Pressable
          onPress={onUnlock}
          accessibilityRole="button"
          style={({ pressed }) => [styles.unlock, pressed && styles.pressed]}>
          <ProBadge locked compact />
          <Text style={[type.button, { color: colours.onAccent }]}>{label}</Text>
        </Pressable>
      ) : (
        <Text style={[type.caption, { color: colours.onAccent }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  proCompact: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  proLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  proLabelCompact: {
    fontSize: 10,
  },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  free: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  freeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  achievement: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  markText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  locked: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
  },
  unlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pressed: {
    opacity: 0.8,
  },
});
