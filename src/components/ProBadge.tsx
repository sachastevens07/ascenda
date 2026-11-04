import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colours } from '@/constants/theme';

const GOLD_INK = '#FFF8E8';

export function ProBadge({
  locked = false,
  compact = false,
  style,
}: {
  locked?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const iconSize = compact ? 10 : 12;
  return (
    <View
      style={[styles.badge, compact && styles.compact, style]}
      accessibilityLabel={locked ? 'Pro, locked' : 'Pro'}>
      {locked ? <Ionicons name="lock-closed" size={iconSize} color={GOLD_INK} /> : null}
      <AppText variant="eyebrow" style={{ color: GOLD_INK, letterSpacing: 0.6 }}>
        PRO
      </AppText>
    </View>
  );
}

/** Gold PRO pill beside a heading or button label. */
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

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colours.trophy,
  },
  compact: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
