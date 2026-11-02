import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

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
      <Text style={[styles.label, compact && styles.labelCompact]}>PRO</Text>
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
      <Text style={textStyle}>{children}</Text>
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
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: GOLD_INK,
  },
  labelCompact: {
    fontSize: 10,
  },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
