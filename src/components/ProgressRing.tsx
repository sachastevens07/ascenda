import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colours } from '@/constants/theme';

/** 0–1 ring. Label sits in the middle. */
export function ProgressRing({
  progress,
  size = 48,
  stroke = 5,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const clamped = Math.min(1, Math.max(0, progress));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const centre = size / 2;
  return (
    <View style={[styles.wrap, { width: size, height: size }]} accessibilityRole="progressbar">
      <Svg width={size} height={size}>
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={colours.accentSoft}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={colours.accent}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${centre}, ${centre}`}
        />
      </Svg>
      {children ? <View style={styles.label}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
