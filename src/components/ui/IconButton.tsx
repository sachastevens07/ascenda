import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/constants/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  disabled = false,
  color,
  size = 22,
  variant = 'plain',
  style,
}: {
  icon: IoniconName;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  color?: string;
  size?: number;
  variant?: 'plain' | 'muted' | 'overlay';
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius } = useTheme();
  const muted = variant === 'muted';
  const overlay = variant === 'overlay';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.hit,
        muted && {
          width: 40,
          height: 40,
          borderRadius: radius.full,
          backgroundColor: colours.surfaceMuted,
        },
        overlay && {
          width: 40,
          height: 40,
          borderRadius: radius.full,
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
        },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      <Ionicons name={icon} size={size} color={color ?? (overlay ? colours.onAccent : colours.ink)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
