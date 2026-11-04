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
  /** Plum by default. Coral is not used for primary buttons. */
  tone?: 'brand' | 'accent';
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
  tone = 'brand',
}: ButtonProps) {
  const { colours, radius } = useTheme();
  const fill = tone === 'accent' ? colours.accent : colours.brand;
  const ink = tone === 'accent' ? colours.onAccent : colours.onBrand;
  const busy = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy: loading }}
      style={({ pressed }) => [
        styles.base,
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
}: Omit<ButtonProps, 'tone'>) {
  const { colours, radius } = useTheme();
  const busy = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: colours.surface,
          borderRadius: radius.full,
          borderWidth: 1.5,
          borderColor: colours.brand,
        },
        pressed && !busy && styles.pressed,
        busy && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colours.brand} />
      ) : (
        <AppText variant="bodyStrong" style={{ color: colours.brand }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

export function TextButton({
  label,
  onPress,
  disabled = false,
  style,
}: Omit<ButtonProps, 'tone' | 'loading'>) {
  const { colours } = useTheme();
  return (
    <Pressable
      onPress={onPress}
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
}: Omit<ButtonProps, 'tone' | 'loading'>) {
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

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
