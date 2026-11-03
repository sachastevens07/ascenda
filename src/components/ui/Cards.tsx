import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { THEME_PREFERENCES, THEME_PREFERENCE_LABELS, useTheme, type ThemePreference } from '@/constants/theme';

import { FreeBadge, ProBadge } from './Badges';
import { ProgressRing } from './Progress';

type ImageCardProps = {
  title: string;
  subtitle?: string;
  tags?: string[];
  image?: ImageSourcePropType | null;
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
  letter,
  isPro = false,
  isFree = false,
  locked = false,
  progress,
  imageAspectRatio = 4 / 5,
  imageHeight,
  onPress,
  style,
}: ImageCardProps) {
  const { colours, radius, shadow, type } = useTheme();
  const frame = (
    <View style={[{ backgroundColor: colours.surface, borderRadius: radius.lg }, shadow]}>
      <View style={[styles.card, { borderRadius: radius.lg }]}>
        <View
          style={[
            styles.photo,
            { backgroundColor: colours.surfaceMuted },
            imageHeight ? { height: imageHeight } : { aspectRatio: imageAspectRatio },
          ]}>
          {image ? (
            <Image source={image} style={styles.photoFill} resizeMode="cover" />
          ) : (
            <Text style={[styles.letter, { color: colours.brand }]}>{(letter ?? title).slice(0, 1)}</Text>
          )}
          {isPro || isFree ? (
            <View style={styles.badge}>
              {isPro ? <ProBadge locked={locked} compact /> : <FreeBadge />}
            </View>
          ) : null}
          {typeof progress === 'number' ? (
            <View style={styles.ring}>
              <ProgressRing progress={progress} size={40} stroke={4} />
            </View>
          ) : null}
        </View>
        <View style={styles.body}>
          <Text style={[type.title3, { color: colours.ink }]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 4 }]} numberOfLines={2}>
              {subtitle}
            </Text>
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
  letter,
  title,
  eyebrow,
  height = 220,
  children,
  style,
}: {
  image?: ImageSourcePropType | null;
  letter?: string;
  title?: string;
  eyebrow?: string;
  height?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, type, spacing } = useTheme();
  return (
    <View style={[{ height, backgroundColor: colours.surfaceMuted }, style]}>
      {image ? (
        <Image source={image} style={styles.photoFill} resizeMode="cover" />
      ) : (
        <View style={styles.heroFallback}>
          <Text style={[styles.letterLarge, { color: colours.brand }]}>{(letter ?? title ?? 'A').slice(0, 1)}</Text>
        </View>
      )}
      {title || eyebrow ? (
        <View style={styles.heroOverlay} pointerEvents="none">
          <View style={[styles.heroFade, { backgroundColor: colours.overlay }]}>
            {eyebrow ? (
              <Text style={[type.eyebrow, { color: colours.onAccent, marginBottom: spacing.sm }]}>{eyebrow}</Text>
            ) : null}
            {title ? (
              <Text style={[type.display, { color: colours.onAccent }]} numberOfLines={2}>
                {title}
              </Text>
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
  const { colours, radius, type } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colours.surface, borderRadius: radius.lg }, style]}>
      {icon ? (
        <View style={[styles.statIcon, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
          <Ionicons name={icon} size={16} color={colours.brand} />
        </View>
      ) : null}
      <Text
        style={[
          icon ? type.title3 : type.display,
          { color: colours.ink, marginTop: icon ? 8 : 0 },
          !icon && { fontSize: 28, lineHeight: 34 },
        ]}
        numberOfLines={2}>
        {value}
      </Text>
      <Text style={[type.caption, { color: colours.inkMuted, marginTop: 2 }]}>{label}</Text>
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
  const { colours, radius, shadow, type } = useTheme();
  const body = (
    <View
      style={[
        styles.highlight,
        { backgroundColor: colours.surface, borderRadius: radius.lg },
        shadow,
      ]}>
      <View style={styles.highlightTop}>
        <Text style={[styles.highlightValue, { color: colours.accent }]} numberOfLines={1}>
          {value}
        </Text>
        <Ionicons name={icon} size={22} color={colours.accent} />
      </View>
      <View style={styles.highlightBottom}>
        <Text style={[type.caption, { color: colours.inkMuted, flex: 1, marginRight: 8 }]} numberOfLines={2}>
          {label}
        </Text>
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
  const { colours, type } = useTheme();
  return (
    <View style={[styles.empty, style]}>
      <Ionicons name={icon} size={36} color={colours.brand} />
      <Text style={[type.title, { color: colours.ink, textAlign: 'center', marginTop: 12 }]}>{title}</Text>
      {body ? (
        <Text style={[type.body, { color: colours.inkMuted, textAlign: 'center', marginTop: 8 }]}>{body}</Text>
      ) : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  size = 'sm',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  size?: 'sm' | 'lg';
}) {
  const { colours, radius, type } = useTheme();
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
      <Text
        numberOfLines={1}
        style={[
          large ? type.body : type.caption,
          { color: selected ? colours.brand : colours.ink, fontWeight: selected ? '700' : '500' },
        ]}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}>
      {inner}
    </Pressable>
  );
}

export const Tag = Chip;

export function SegmentedThemePicker({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  const { colours, radius, type } = useTheme();
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
            <Text
              numberOfLines={1}
              style={[
                type.caption,
                {
                  color: selected ? colours.ink : colours.inkMuted,
                  fontWeight: selected ? '700' : '500',
                },
              ]}>
              {THEME_PREFERENCE_LABELS[option]}
            </Text>
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
  letter: {
    fontSize: 42,
    fontWeight: '700',
  },
  letterLarge: {
    fontSize: 64,
    fontWeight: '700',
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
  highlightValue: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
    flex: 1,
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
