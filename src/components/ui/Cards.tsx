import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ComponentProps, ReactNode } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME_PREFERENCES, THEME_PREFERENCE_LABELS, useTheme, type ThemePreference } from '@/constants/theme';
import { presentationForSlug, type ImageKind } from '@/lib/images';

import { ProgressRing } from './Progress';

function placeholderIcon(kind: ImageKind | null | undefined): ComponentProps<typeof Ionicons>['name'] {
  if (kind === 'people') return 'person-outline';
  if (kind === 'equipment') return 'barbell-outline';
  if (kind === 'food') return 'restaurant-outline';
  return 'image-outline';
}

/** Brand-tinted block shown until a licensed photo is ready for that slug. */
export function CoverPlaceholder({ kind }: { kind?: ImageKind | null }) {
  const { colours } = useTheme();
  return (
    <View
      style={[styles.placeholder, { backgroundColor: colours.brandSoft }]}
      accessibilityElementsHidden>
      <Ionicons name={placeholderIcon(kind)} size={28} color={colours.brand} />
    </View>
  );
}

/** One photo slot. A slug wins. Anything not ready stays on the placeholder. */
export function PhotoFill({
  slug,
  source,
  kind,
  label,
  focus = 'center',
}: {
  slug?: string | null;
  source?: ImageSourcePropType | null;
  kind?: ImageKind | null;
  label?: string;
  focus?: 'center' | 'top';
}) {
  const resolved = slug ? presentationForSlug(slug) : null;
  const photo = resolved ? resolved.source : source ?? null;
  const photoKind = resolved?.kind ?? kind ?? null;
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [pixels, setPixels] = useState({ width: 0, height: 0 });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const uri = photo && typeof photo === 'object' && 'uri' in photo && typeof photo.uri === 'string' ? photo.uri : '';

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setPixels({ width: 0, height: 0 });
  }, [slug, uri]);

  if (!photo || failed) return <CoverPlaceholder kind={photoKind} />;

  const fitted =
    focus === 'top' && box.width > 0 && box.height > 0 && pixels.width > 0 && pixels.height > 0
      ? coverFrame(box.width, box.height, pixels.width, pixels.height, 'top')
      : null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
      }}>
      {loaded ? null : <CoverPlaceholder kind={photoKind} />}
      <Image
        source={photo}
        resizeMode="cover"
        accessibilityLabel={label}
        onLoad={(event) => {
          const width = event.nativeEvent.source?.width ?? 0;
          const height = event.nativeEvent.source?.height ?? 0;
          if (width > 0 && height > 0) setPixels({ width, height });
          setLoaded(true);
        }}
        onError={() => setFailed(true)}
        style={
          fitted
            ? { position: 'absolute', width: fitted.width, height: fitted.height, top: fitted.top, left: fitted.left, opacity: loaded ? 1 : 0 }
            : [styles.photoFill, { opacity: loaded ? 1 : 0 }]
        }
      />
    </View>
  );
}

type ImageCardProps = {
  title: string;
  subtitle?: string;
  tags?: string[];
  image?: ImageSourcePropType | null;
  /** Manifest slug. When set, this is the photo, and `image` is ignored. */
  imageSlug?: string | null;
  letter?: string;
  isPro?: boolean;
  isFree?: boolean;
  locked?: boolean;
  progress?: number;
  /** Default 4:5. Ignored when `imageHeight` is set. */
  imageAspectRatio?: number;
  imageHeight?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ImageCard({
  title,
  subtitle,
  tags = [],
  image,
  imageSlug,
  letter,
  progress,
  imageAspectRatio = 4 / 5,
  imageHeight,
  onPress,
  style,
}: ImageCardProps) {
  const { colours, radius, shadow } = useTheme();
  const frame = (
    <View style={[{ backgroundColor: colours.surface, borderRadius: radius.lg }, shadow]}>
      <View style={[styles.card, { borderRadius: radius.lg }]}>
        <View
          style={[
            styles.photo,
            { backgroundColor: colours.surfaceMuted },
            imageHeight ? { height: imageHeight } : { aspectRatio: imageAspectRatio },
          ]}>
          <PhotoFill slug={imageSlug} source={imageSlug ? null : image} label={title} />
          {typeof progress === 'number' ? (
            <View style={styles.ring}>
              <ProgressRing progress={progress} size={40} stroke={4} />
            </View>
          ) : null}
        </View>
        <View style={styles.body}>
          <AppText variant="title3" style={{ color: colours.ink }} numberOfLines={2}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }} numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
          {tags.length > 0 ? (
            <View style={styles.tags}>
              {tags.slice(0, 2).map((tag) => (
                <Chip key={tag} label={tag} />
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );

  if (!onPress) {
    return <View style={style}>{frame}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [style, pressed && styles.pressed]}>
      {frame}
    </Pressable>
  );
}

export function HeroImage({
  image,
  imageSlug,
  letter,
  title,
  eyebrow,
  height = 220,
  imageFocus = 'center',
  children,
  style,
}: {
  image?: ImageSourcePropType | null;
  /** Manifest slug. When set, this is the photo, and `image` is ignored. */
  imageSlug?: string | null;
  letter?: string;
  title?: string;
  eyebrow?: string;
  height?: number;
  /** `top` uses the same cover zoom as centre, with the crop window moved up so a face at the top of the photo stays in frame. */
  imageFocus?: 'center' | 'top';
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, spacing } = useTheme();
  return (
    <View style={[{ height, backgroundColor: colours.surfaceMuted, overflow: 'hidden' }, style]}>
      <PhotoFill slug={imageSlug} source={imageSlug ? null : image} label={title} focus={imageFocus} />
      {title || eyebrow ? (
        <View style={styles.heroOverlay} pointerEvents="none">
          <View style={[styles.heroFade, { backgroundColor: colours.overlay }]}>
            {eyebrow ? (
              <AppText variant="eyebrow" style={{ color: colours.onAccent, marginBottom: spacing.sm }}>
                {eyebrow}
              </AppText>
            ) : null}
            {title ? (
              <AppText variant="display" style={{ color: colours.onAccent }} numberOfLines={2}>
                {title}
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Same scale as `resizeMode="cover"`. `top` only changes which part of that scaled photo is visible. */
function coverFrame(
  frameWidth: number,
  frameHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  focus: 'center' | 'top'
) {
  const scale = Math.max(frameWidth / sourceWidth, frameHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const centerTop = (frameHeight - height) / 2;
  return {
    width,
    height,
    left: (frameWidth - width) / 2,
    top: focus === 'top' ? 0 : centerTop,
  };
}

export function StatTile({
  value,
  label,
  icon,
  style,
}: {
  value: string;
  label: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colours.surface, borderRadius: radius.lg }, style]}>
      {icon ? (
        <View style={[styles.statIcon, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
          <Ionicons name={icon} size={16} color={colours.brand} />
        </View>
      ) : null}
      <AppText
        variant={icon ? 'title3' : 'number'}
        style={{ color: colours.ink, marginTop: icon ? 8 : 0 }}
        numberOfLines={2}>
        {value}
      </AppText>
      <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 2 }}>
        {label}
      </AppText>
    </View>
  );
}

/** Compact 4-up stats row for routine and stretch detail. */
export function StatStrip({
  items,
  style,
}: {
  items: { icon: ComponentProps<typeof Ionicons>['name']; value: string; label: string }[];
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, spacing } = useTheme();
  return (
    <View style={[styles.strip, style]}>
      {items.slice(0, 4).map((item) => (
        <View key={item.label} style={styles.stripItem}>
          <Ionicons name={item.icon} size={16} color={colours.brand} />
          <AppText variant="title3" style={{ color: colours.ink, marginTop: spacing.xs }} numberOfLines={1}>
            {item.value}
          </AppText>
          <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 2 }} numberOfLines={1}>
            {item.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** 2×2 progress tile: coral number, icon, caption, optional chevron. */
export function HighlightTile({
  value,
  label,
  icon,
  onPress,
  style,
}: {
  value: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, shadow } = useTheme();
  const body = (
    <View
      style={[
        styles.highlight,
        { backgroundColor: colours.surface, borderRadius: radius.lg },
        shadow,
      ]}>
      <View style={styles.highlightTop}>
        <AppText variant="number" style={{ color: colours.accent, flex: 1 }} numberOfLines={1}>
          {value}
        </AppText>
        <Ionicons name={icon} size={22} color={colours.accent} />
      </View>
      <View style={styles.highlightBottom}>
        <AppText variant="caption" style={{ color: colours.inkMuted, flex: 1, marginRight: 8 }} numberOfLines={2}>
          {label}
        </AppText>
        {onPress ? <Ionicons name="chevron-forward" size={16} color={colours.accent} /> : null}
      </View>
    </View>
  );
  if (!onPress) {
    return <View style={[{ flex: 1 }, style]}>{body}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      style={({ pressed }) => [{ flex: 1 }, style, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  body,
  action,
  style,
}: {
  icon?: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();
  return (
    <View style={[styles.empty, style]}>
      <Ionicons name={icon} size={36} color={colours.brand} />
      <AppText variant="title2" style={{ color: colours.ink, textAlign: 'center', marginTop: 12 }}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center', marginTop: 8 }}>
          {body}
        </AppText>
      ) : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  onLongPress,
  size = 'sm',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  size?: 'sm' | 'lg';
}) {
  const { colours, radius } = useTheme();
  const large = size === 'lg';
  const inner = (
    <View
      style={[
        styles.chip,
        large && styles.chipLg,
        {
          borderRadius: radius.full,
          backgroundColor: selected ? colours.brandSoft : colours.surfaceMuted,
          borderWidth: selected ? 1.5 : 0,
          borderColor: colours.brand,
        },
      ]}>
      <AppText
        numberOfLines={1}
        variant={large ? 'body' : 'bodySm'}
        style={{ color: selected ? colours.brand : colours.ink }}>
        {label}
      </AppText>
    </View>
  );
  if (!onPress && !onLongPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}>
      {inner}
    </Pressable>
  );
}

export const Tag = Chip;

export function ReminderTimeChip({
  timeLabel,
  onPress,
}: {
  timeLabel: string;
  onPress?: () => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Reminder ${timeLabel}`}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          minHeight: 28,
          paddingHorizontal: 8,
          paddingVertical: 4,
          backgroundColor: colours.surfaceMuted,
          borderRadius: radius.full,
        }}>
        <Ionicons name="notifications-outline" size={12} color={colours.inkMuted} />
        <AppText variant="caption" style={{ color: colours.ink }}>
          {timeLabel}
        </AppText>
      </View>
    </Pressable>
  );
}

export function SegmentedThemePicker({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <View
      style={[
        styles.themePicker,
        { backgroundColor: colours.surfaceMuted, borderRadius: radius.full },
      ]}>
      {THEME_PREFERENCES.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.themeOption,
              selected && { backgroundColor: colours.surface, borderRadius: radius.full },
            ]}>
            <AppText
              numberOfLines={1}
              variant="caption"
              style={{ color: selected ? colours.ink : colours.inkMuted }}>
              {THEME_PREFERENCE_LABELS[option]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  photo: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  photoFill: {
    width: '100%',
    height: '100%',
  },
  ring: {
    position: 'absolute',
    right: 12,
    bottom: 12,
  },
  body: {
    padding: 16,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    marginTop: 12,
    overflow: 'hidden',
  },
  chip: {
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLg: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  heroFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  heroFade: {
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 48,
  },
  highlight: {
    padding: 16,
    minHeight: 108,
    justifyContent: 'space-between',
  },
  highlightTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  highlightBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  stat: {
    padding: 16,
    minWidth: 96,
  },
  statIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  stripItem: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyAction: {
    marginTop: 20,
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.92,
  },
  themePicker: {
    flexDirection: 'row',
    padding: 4,
    gap: 2,
  },
  themeOption: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
});
