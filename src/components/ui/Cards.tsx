import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useId, useState, type ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { THEME_PREFERENCES, THEME_PREFERENCE_LABELS, useTheme, type ThemePreference } from '@/constants/theme';
import {
  contentPositionForFocal,
  DEFAULT_FOCAL_CENTER,
  DEFAULT_FOCAL_PEOPLE,
  presentationForSlug,
  subscribeImageCatalog,
  type FocalPoint,
  type ImageKind,
} from '@/lib/images';

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

function fallbackFocal(focus: 'center' | 'top' | 'faces'): FocalPoint {
  if (focus === 'top') return { x: 0.5, y: 0.22 };
  if (focus === 'faces') return DEFAULT_FOCAL_PEOPLE;
  return DEFAULT_FOCAL_CENTER;
}

function photoUri(photo: ImageSourcePropType): string {
  if (Array.isArray(photo)) {
    const first = photo[0];
    return first && typeof first === 'object' && 'uri' in first && typeof first.uri === 'string' ? first.uri : '';
  }
  return typeof photo === 'object' && photo && 'uri' in photo && typeof photo.uri === 'string' ? photo.uri : '';
}

/** One photo slot. A slug wins. Missing or failed files stay on the placeholder, never a blank box. */
export function PhotoFill({
  slug,
  source,
  kind,
  label,
  focus = 'center',
  align = 'focal',
  focalPoint,
}: {
  slug?: string | null;
  source?: ImageSourcePropType | null;
  kind?: ImageKind | null;
  label?: string;
  /** Used only when there is no manifest slug. Slugs use `focal_point`. */
  focus?: 'center' | 'top' | 'faces';
  /** `center` ignores focal_point so a two-person crop stays in the middle. */
  align?: 'focal' | 'center';
  /** Overrides slug and align. Use for a one-off crop such as the Home refer thumbnail. */
  focalPoint?: FocalPoint | null;
}) {
  const [, setCatalog] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => subscribeImageCatalog(() => setCatalog((value) => value + 1)), []);

  const resolved = slug ? presentationForSlug(slug) : null;
  const photo = resolved ? resolved.source : source ?? null;
  const photoKind = resolved?.kind ?? kind ?? null;
  const uri = photo ? photoUri(photo) : '';
  const position = contentPositionForFocal(
    focalPoint ?? (align === 'center' ? DEFAULT_FOCAL_CENTER : resolved?.focalPoint ?? fallbackFocal(focus))
  );

  useEffect(() => {
    setFailed(false);
  }, [slug, uri]);

  const showPhoto = Boolean(photo) && (typeof photo === 'number' || Boolean(uri)) && !failed;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <CoverPlaceholder kind={photoKind} />
      {showPhoto ? (
        <Image
          source={typeof photo === 'number' ? photo : { uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={position}
          cachePolicy="memory-disk"
          transition={120}
          allowDownscaling
          onError={() => setFailed(true)}
          accessibilityLabel={label}
        />
      ) : null}
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
  titleVariant = 'display',
  titleLines = 2,
  children,
  style,
}: {
  /** Smaller title for cards where the full headline should fit. */
  titleVariant?: 'display' | 'displaySm';
  titleLines?: number;
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
  const fadeId = `heroFade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[{ height, backgroundColor: colours.surfaceMuted, overflow: 'hidden' }, style]}>
      <PhotoFill slug={imageSlug} source={imageSlug ? null : image} label={title} focus={imageFocus} />
      {title || eyebrow ? (
        <View style={styles.heroOverlay} pointerEvents="none">
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000" stopOpacity={0} />
                <Stop offset="0.25" stopColor="#000" stopOpacity={0.12} />
                <Stop offset="1" stopColor="#000" stopOpacity={0.78} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${fadeId})`} />
          </Svg>
          <View style={styles.heroFade}>
            {eyebrow ? (
              <AppText variant="eyebrow" style={{ color: colours.onAccent, marginBottom: spacing.sm }}>
                {eyebrow}
              </AppText>
            ) : null}
            {title ? (
              <AppText variant={titleVariant} style={{ color: colours.onAccent }} numberOfLines={titleLines}>
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
      <AppText
        variant="title2"
        style={{ color: colours.ink, textAlign: 'center', marginTop: 12, alignSelf: 'stretch' }}>
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
