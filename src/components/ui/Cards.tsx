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

import { useTheme } from '@/constants/theme';

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
  onPress,
  style,
}: ImageCardProps) {
  const { colours, radius, shadow, type } = useTheme();
  const body = (
    <View
      style={[
        styles.card,
        { backgroundColor: colours.surface, borderRadius: radius.lg },
        shadow,
        style,
      ]}>
      <View style={[styles.photo, { backgroundColor: colours.surfaceMuted }]}>
        {image ? (
          <Image source={image} style={styles.photoFill} resizeMode="cover" />
        ) : (
          <Text style={[styles.letter, { color: colours.brand }]}>{(letter ?? title).slice(0, 1)}</Text>
        )}
        {typeof progress === 'number' ? (
          <View style={styles.ring}>
            <ProgressRing progress={progress} size={40} stroke={4} />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[type.title, { color: colours.ink, flex: 1 }]} numberOfLines={2}>
            {title}
          </Text>
          {isPro ? <ProBadge locked={locked} compact /> : isFree ? <FreeBadge /> : null}
        </View>
        {subtitle ? (
          <Text style={[type.caption, { color: colours.inkMuted, marginTop: 4 }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {tags.length > 0 ? (
          <View style={styles.tags}>
            {tags.slice(0, 3).map((tag) => (
              <Chip key={tag} label={tag} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

export function HeroImage({
  image,
  letter,
  title,
  height = 220,
  style,
}: {
  image?: ImageSourcePropType | null;
  letter?: string;
  title?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, type } = useTheme();
  return (
    <View style={[{ height, backgroundColor: colours.surfaceMuted }, style]}>
      {image ? (
        <Image source={image} style={styles.photoFill} resizeMode="cover" />
      ) : (
        <View style={styles.heroFallback}>
          <Text style={[styles.letterLarge, { color: colours.brand }]}>{(letter ?? title ?? 'A').slice(0, 1)}</Text>
        </View>
      )}
      {title ? (
        <View style={[styles.heroOverlay, { backgroundColor: colours.overlay }]}>
          <Text style={[type.display, { color: colours.onAccent }]}>{title}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function StatTile({
  value,
  label,
  style,
}: {
  value: string;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, type } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colours.surface, borderRadius: radius.lg }, style]}>
      <Text style={[type.display, { color: colours.ink, fontSize: 28, lineHeight: 34 }]}>{value}</Text>
      <Text style={[type.caption, { color: colours.inkMuted, marginTop: 4 }]}>{label}</Text>
    </View>
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
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { colours, radius, type } = useTheme();
  const inner = (
    <View
      style={[
        styles.chip,
        {
          borderRadius: radius.full,
          backgroundColor: selected ? colours.brandSoft : colours.surfaceMuted,
          borderWidth: selected ? 1.5 : 0,
          borderColor: colours.brand,
        },
      ]}>
      <Text style={[type.caption, { color: selected ? colours.brand : colours.ink }]}>{label}</Text>
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

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  photo: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    padding: 20,
  },
  stat: {
    padding: 16,
    minWidth: 96,
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
});
