import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/constants/theme';

import { AppText } from './AppText';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Outline only for paired choices such as Camera / Library. Quiet / emphasis are for toggle states. */
  appearance?: 'soft' | 'outline' | 'emphasis' | 'quiet';
  size?: 'default' | 'compact';
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
  size = 'default',
}: ButtonProps) {
  const { colours, radius } = useTheme();
  const fill = colours.brand;
  const ink = colours.onBrand;
  const busy = disabled || loading;
  const compact = size === 'compact';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor: fill, borderRadius: radius.full },
        pressed && !busy && styles.pressed,
        busy && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={ink} />
      ) : (
        <AppText variant="bodyStrong" style={{ color: ink }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
  appearance = 'soft',
}: ButtonProps) {
  const { colours, radius } = useTheme();
  const busy = disabled || loading;
  const outline = appearance === 'outline';
  const quiet = appearance === 'quiet';
  const fill = outline
    ? colours.surface
    : quiet
      ? mixHex(colours.brandSoft, colours.surface, 0.55)
      : appearance === 'emphasis'
        ? mixHex(colours.brandSoft, colours.brand, 0.28)
        : colours.brandSoft;
  const ink = quiet ? colours.inkMuted : colours.brand;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: fill,
          borderRadius: radius.full,
          borderWidth: outline ? 1.5 : 0,
          borderColor: outline ? colours.brand : 'transparent',
        },
        pressed && !busy && styles.pressed,
        busy && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={ink} />
      ) : (
        <AppText variant="bodyStrong" style={{ color: ink }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

export function TextButton({
  label,
  onPress,
  onLongPress,
  disabled = false,
  style,
}: Omit<ButtonProps, 'loading' | 'appearance'> & { onLongPress?: () => void }) {
  const { colours } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.textWrap, pressed && !disabled && styles.pressed, disabled && styles.disabled, style]}>
      <AppText variant="bodyStrong" style={{ color: colours.brand }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function DestructiveTextButton({
  label,
  onPress,
  disabled = false,
  style,
}: Omit<ButtonProps, 'loading' | 'appearance'>) {
  const { colours } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.textWrap, pressed && !disabled && styles.pressed, disabled && styles.disabled, style]}>
      <AppText variant="bodyStrong" style={{ color: colours.danger }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ButtonRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

function mixHex(from: string, to: string, amount: number): string {
  const channel = (hex: string, shift: number) => {
    const raw = hex.replace('#', '');
    const full = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw;
    return (parseInt(full, 16) >> shift) & 255;
  };
  const mix = (shift: number) =>
    Math.round(channel(from, shift) + (channel(to, shift) - channel(from, shift)) * amount);
  const toHex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${toHex(mix(16))}${toHex(mix(8))}${toHex(mix(0))}`;
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    minHeight: 36,
    paddingHorizontal: 14,
  },
  textWrap: {
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.45,
  },
});
