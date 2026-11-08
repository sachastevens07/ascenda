import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import { fillCopy, programmesCopy } from '@/lib/copy';

import { PhotoFill } from './Cards';
import { IconButton } from './IconButton';

export function OverlayImageCard({
  image,
  imageSlug,
  eyebrow,
  title,
  subtitle,
  chip,
  onPress,
  aspectRatio = 4 / 3,
  style,
}: {
  image?: ImageSourcePropType | null;
  imageSlug?: string | null;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  chip?: string;
  onPress: () => void;
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, shadow } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [style, shadow, pressed && styles.pressed]}>
      <View style={[styles.overlayCard, { borderRadius: radius.xl, backgroundColor: colours.surfaceMuted }]}>
        <View style={[styles.overlayPhoto, { aspectRatio }]}>
          <PhotoFill slug={imageSlug} source={imageSlug ? null : image} kind="people" label={title} />
          <View style={[styles.overlayFade, { backgroundColor: colours.overlay }]} />
          <View style={styles.overlayCopy}>
            {chip ? (
              <View style={[styles.chip, { backgroundColor: colours.surface, borderRadius: radius.full }]}>
                <AppText variant="eyebrow" style={{ color: colours.brand }}>
                  {chip}
                </AppText>
              </View>
            ) : null}
            {eyebrow ? (
              <AppText variant="eyebrow" style={{ color: colours.onAccent, marginTop: chip ? 8 : 0 }}>
                {eyebrow}
              </AppText>
            ) : null}
            <AppText variant="displaySm" style={{ color: colours.onAccent, marginTop: 6 }} numberOfLines={2}>
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="bodySm" style={{ color: colours.onAccent, marginTop: 4 }} numberOfLines={2}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function StyleTile({
  label,
  image,
  imageSlug,
  wide,
  onPress,
  style,
}: {
  label: string;
  image?: ImageSourcePropType | null;
  imageSlug?: string | null;
  wide?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [wide ? styles.styleWide : styles.styleHalf, style, pressed && styles.pressed]}>
      <View style={[styles.styleTile, { borderRadius: radius.lg, backgroundColor: colours.surfaceMuted }]}>
        <PhotoFill slug={imageSlug} source={imageSlug ? null : image} kind="people" label={label} />
        <View style={[styles.styleFade, { backgroundColor: colours.overlay }]} />
        <AppText variant="title3" style={[styles.styleLabel, { color: colours.onAccent }]} numberOfLines={2}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

export function SingleSessionCard({
  title,
  minutes,
  image,
  imageSlug,
  onPress,
  onPlay,
  style,
}: {
  title: string;
  minutes: number;
  image?: ImageSourcePropType | null;
  imageSlug?: string | null;
  onPress: () => void;
  onPlay: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, shadow } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [style, shadow, pressed && styles.pressed]}>
      <View style={[styles.single, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
        <View style={[styles.singlePhoto, { backgroundColor: colours.surfaceMuted }]}>
          <PhotoFill slug={imageSlug} source={imageSlug ? null : image} kind="people" label={title} />
          <View style={styles.playWrap}>
            <IconButton
              icon="play"
              variant="overlay"
              accessibilityLabel={fillCopy(programmesCopy.play_a11y, { session_name: title })}
              onPress={onPlay}
            />
          </View>
        </View>
        <View style={styles.singleBody}>
          <AppText variant="title3" style={{ color: colours.ink }} numberOfLines={2}>
            {title}
          </AppText>
          <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 4 }}>
            {minutes} min
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

export function BuildPlanButton({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { colours, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={programmesCopy.build_plan}
      style={({ pressed }) => [
        styles.build,
        { backgroundColor: colours.brandSoft, borderRadius: radius.full },
        pressed && styles.pressed,
        style,
      ]}>
      <Ionicons name="sparkles-outline" size={18} color={colours.brand} />
      <AppText variant="bodyStrong" style={{ color: colours.brand }}>
        {programmesCopy.build_plan}
      </AppText>
    </Pressable>
  );
}

export function StyleGrid({ children }: { children: ReactNode }) {
  return <View style={styles.styleGrid}>{children}</View>;
}

const styles = StyleSheet.create({
  overlayCard: {
    overflow: 'hidden',
  },
  overlayPhoto: {
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  overlayFade: {
    ...StyleSheet.absoluteFill,
    opacity: 0.45,
  },
  overlayCopy: {
    padding: 20,
  },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fill: {
    width: '100%',
    height: '100%',
    ...StyleSheet.absoluteFill,
  },
  styleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  styleWide: {
    width: '100%',
  },
  styleHalf: {
    width: '48%',
    flexGrow: 1,
  },
  styleTile: {
    height: 92,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  styleFade: {
    ...StyleSheet.absoluteFill,
    opacity: 0.4,
  },
  styleLabel: {
    padding: 12,
  },
  single: {
    overflow: 'hidden',
  },
  singlePhoto: {
    aspectRatio: 3 / 4,
    overflow: 'hidden',
  },
  playWrap: {
    position: 'absolute',
    right: 8,
    bottom: 8,
  },
  singleBody: {
    padding: 12,
  },
  build: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 20,
  },
  pressed: {
    opacity: 0.85,
  },
});
