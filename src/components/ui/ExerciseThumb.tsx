import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useTheme, type Palette } from '@/constants/theme';
import { EQUIPMENT_LABELS, type Equipment } from '@/lib/exercises';
import { getExerciseImageSource } from '@/lib/exerciseMedia';

type McName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Sage teal (stretch category) and warm ochre (custom category) from DESIGN.md. */
const CABLE = { light: '#4F8A86', dark: '#7EB8B4' };
const BAND = { light: '#8A6D3B', dark: '#C4A36A' };

export function equipmentIconName(equipment: Equipment): McName {
  switch (equipment) {
    case 'barbell':
      return 'weight-lifter';
    case 'dumbbell':
      return 'dumbbell';
    case 'machine':
      return 'cog';
    case 'cable':
      return 'cable-data';
    case 'kettlebell':
      return 'kettlebell';
    case 'band':
      return 'vector-line';
    case 'bodyweight':
      return 'yoga';
  }
}

export function equipmentIconColour(
  equipment: Equipment,
  colours: Palette,
  scheme: 'light' | 'dark' | null | undefined
): { icon: string; background: string } {
  const dark = scheme === 'dark';
  switch (equipment) {
    case 'barbell':
      return { icon: colours.brand, background: colours.brandSoft };
    case 'dumbbell':
      return { icon: colours.accent, background: colours.accentSoft };
    case 'machine':
      return { icon: colours.success, background: colours.surfaceMuted };
    case 'cable':
      return { icon: dark ? CABLE.dark : CABLE.light, background: colours.surfaceMuted };
    case 'kettlebell':
      return { icon: colours.pro, background: colours.surfaceMuted };
    case 'band':
      return { icon: dark ? BAND.dark : BAND.light, background: colours.surfaceMuted };
    case 'bodyweight':
      return { icon: colours.inkMuted, background: colours.surfaceMuted };
  }
}

/** Photo when we have one; otherwise a distinct icon per equipment type. */
export function ExerciseThumb({
  exercise,
  size = 56,
  showPlay = false,
}: {
  exercise: { id: string; equipment: Equipment; media_url?: string | null };
  size?: number;
  showPlay?: boolean;
}) {
  const { colours, radius, scheme } = useTheme();
  const photo = getExerciseImageSource(exercise);
  const tint = equipmentIconColour(exercise.equipment, colours, scheme);
  const iconSize = Math.round(size * 0.42);

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius.md,
          backgroundColor: photo ? colours.surfaceMuted : tint.background,
        },
      ]}>
      {photo ? (
        <Image source={photo} style={{ width: size, height: size }} resizeMode="cover" accessibilityLabel="" />
      ) : (
        <MaterialCommunityIcons
          name={equipmentIconName(exercise.equipment)}
          size={iconSize}
          color={tint.icon}
          accessibilityLabel={EQUIPMENT_LABELS[exercise.equipment]}
        />
      )}
      {photo && showPlay ? (
        <View style={[styles.play, { backgroundColor: colours.overlay, borderRadius: radius.full }]}>
          <Ionicons name="play" size={12} color={colours.onAccent} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
