import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/constants/theme';

export function ProgressRing({
  progress,
  size = 48,
  stroke = 5,
  tone = 'brand',
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  tone?: 'brand' | 'accent';
  children?: ReactNode;
}) {
  const { colours } = useTheme();
  const clamped = Math.min(1, Math.max(0, progress));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const centre = size / 2;
  const fill = tone === 'accent' ? colours.accent : colours.brand;
  return (
    <View style={[styles.ringWrap, { width: size, height: size }]} accessibilityRole="progressbar">
      <Svg width={size} height={size}>
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={colours.surfaceMuted}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={fill}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${centre}, ${centre}`}
        />
      </Svg>
      {children ? <View style={styles.ringLabel}>{children}</View> : null}
    </View>
  );
}

export function ProgressBar({
  progress,
  style,
}: {
  progress: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius } = useTheme();
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <View
      accessibilityRole="progressbar"
      style={[styles.barTrack, { backgroundColor: colours.surfaceMuted, borderRadius: radius.full }, style]}>
      <View
        style={[
          styles.barFill,
          {
            width: `${clamped * 100}%`,
            backgroundColor: colours.brand,
            borderRadius: radius.full,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barTrack: {
    height: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
  },
});
