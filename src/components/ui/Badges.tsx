import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';

import { TextButton } from './Buttons';

export const BADGE_TIER_COLOURS = {
  bronze: '#B9805A',
  silver: '#9BA3AB',
  gold: '#C4A35A',
  platinum: '#7E8FB8',
} as const;

export type BadgeTier = keyof typeof BADGE_TIER_COLOURS;

export function ProBadge({
  locked = false,
  compact = false,
  style,
}: {
  locked?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius } = useTheme();
  const iconSize = compact ? 10 : 12;
  return (
    <View
      style={[
        styles.pro,
        { backgroundColor: colours.pro, borderRadius: radius.full },
        compact && styles.proCompact,
        style,
      ]}
      accessibilityLabel={locked ? 'Pro, locked' : 'Pro'}>
      {locked ? <Ionicons name="lock-closed" size={iconSize} color={colours.onPro} /> : null}
      <AppText variant="eyebrow" style={{ color: colours.onPro, letterSpacing: 0.6 }}>
        PRO
      </AppText>
    </View>
  );
}

export function ProMark({
  children,
  locked = false,
  compact = false,
  textStyle,
  style,
}: {
  children: string;
  locked?: boolean;
  compact?: boolean;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.mark, style]}>
      <ProBadge locked={locked} compact={compact} />
      <AppText variant="bodyStrong" style={textStyle}>
        {children}
      </AppText>
    </View>
  );
}

export function FreeBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colours, radius } = useTheme();
  return (
    <View
      style={[
        styles.free,
        { backgroundColor: colours.surface, borderRadius: radius.full },
        style,
      ]}
      accessibilityLabel="Free">
      <AppText variant="eyebrow" style={{ color: colours.brand, letterSpacing: 0.6 }}>
        FREE
      </AppText>
    </View>
  );
}

export function AchievementBadge({
  unlocked,
  label,
  tier,
  mark,
  children,
  style,
}: {
  unlocked: boolean;
  label: string;
  tier?: BadgeTier | null;
  /** Kept for older call sites; D7 uses a family icon instead of a number. */
  mark?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();
  const ring = unlocked && tier ? BADGE_TIER_COLOURS[tier] : 'transparent';
  const ink = unlocked ? colours.onBrand : colours.inkMuted;
  return (
    <View
      style={[
        styles.achievement,
        {
          backgroundColor: unlocked ? colours.brand : colours.surfaceMuted,
          borderWidth: unlocked && tier ? 4 : 0,
          borderColor: ring,
        },
        style,
      ]}
      accessibilityLabel={unlocked ? label : `${label}, locked`}>
      {mark ? (
        <AppText variant="title2" style={{ color: ink }}>
          {mark}
        </AppText>
      ) : children ? (
        children
      ) : unlocked ? (
        <Ionicons name="checkmark" size={28} color={ink} />
      ) : (
        <Ionicons name="medal-outline" size={28} color={ink} />
      )}
    </View>
  );
}

export function BadgeSheet({
  visible,
  title,
  body,
  meta,
  onClose,
}: {
  visible: boolean;
  title: string;
  body: string;
  meta?: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colours, radius, spacing, shadow } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.sheetOverlay, { backgroundColor: colours.overlay }]}>
        <Pressable style={styles.sheetDismiss} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colours.surface,
              borderRadius: radius.xl,
              paddingBottom: Math.max(insets.bottom, 16),
            },
            shadow,
          ]}>
          <AppText variant="title2" style={{ color: colours.ink }}>
            {title}
          </AppText>
          <AppText variant="body" style={{ color: colours.ink, marginTop: spacing.sm }}>
            {body}
          </AppText>
          {meta ? (
            <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
              {meta}
            </AppText>
          ) : null}
          <TextButton label="Close" onPress={onClose} style={{ alignSelf: 'flex-start', marginTop: spacing.md }} />
        </View>
      </View>
    </Modal>
  );
}

export function LockedOverlay({
  onUnlock,
  label = 'Unlock with Pro',
  style,
}: {
  onUnlock?: () => void;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius } = useTheme();
  return (
    <View
      pointerEvents={onUnlock ? 'auto' : 'none'}
      style={[
        styles.locked,
        { backgroundColor: colours.overlay, borderRadius: radius.lg },
        style,
      ]}>
      <Ionicons name="lock-closed" size={22} color={colours.onAccent} />
      {onUnlock ? (
        <Pressable
          onPress={onUnlock}
          accessibilityRole="button"
          style={({ pressed }) => [styles.unlock, pressed && styles.pressed]}>
          <ProBadge locked compact />
          <AppText variant="bodyStrong" style={{ color: colours.onAccent }}>
            {label}
          </AppText>
        </Pressable>
      ) : (
        <AppText variant="caption" style={{ color: colours.onAccent }}>
          {label}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  proCompact: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  free: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  achievement: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  locked: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
  },
  unlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pressed: {
    opacity: 0.8,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetDismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 20,
    zIndex: 1,
  },
});
