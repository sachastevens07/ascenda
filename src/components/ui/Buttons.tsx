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
  /** Outline only for paired choices such as Camera / Library. */
  appearance?: 'soft' | 'outline';
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const { colours, radius } = useTheme();
  const fill = colours.brand;
  const ink = colours.onBrand;
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
  appearance = 'soft',
}: ButtonProps) {
  const { colours, radius } = useTheme();
  const busy = disabled || loading;
  const outline = appearance === 'outline';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: outline ? colours.surface : colours.brandSoft,
          borderRadius: radius.full,
          borderWidth: outline ? 1.5 : 0,
          borderColor: outline ? colours.brand : 'transparent',
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
}: Omit<ButtonProps, 'loading' | 'appearance'>) {
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
