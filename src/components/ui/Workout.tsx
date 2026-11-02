import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/constants/theme';

export function SetRow({
  setNumber,
  kg,
  reps,
  completed = false,
  onToggle,
  onChangeKg,
  onChangeReps,
  onSwap,
  style,
}: {
  setNumber: number;
  kg: string;
  reps: string;
  completed?: boolean;
  onToggle?: () => void;
  onChangeKg?: (value: string) => void;
  onChangeReps?: (value: string) => void;
  onSwap?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, type } = useTheme();
  return (
    <View style={[styles.set, { backgroundColor: colours.surface, borderRadius: radius.md }, style]}>
      <Pressable
        onPress={onToggle}
        disabled={!onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={`Set ${setNumber}`}
        style={[
          styles.tick,
          {
            borderColor: completed ? colours.brand : colours.border,
            backgroundColor: completed ? colours.brand : colours.surface,
            borderRadius: radius.sm,
          },
        ]}>
        {completed ? <Ionicons name="checkmark" size={18} color={colours.onBrand} /> : null}
      </Pressable>
      <Text style={[type.caption, { color: colours.inkMuted, width: 28 }]}>{setNumber}</Text>
      <TextInput
        value={kg}
        onChangeText={onChangeKg}
        editable={!!onChangeKg}
        keyboardType="decimal-pad"
        placeholder="kg"
        placeholderTextColor={colours.inkMuted}
        style={[styles.field, { color: colours.ink, borderColor: colours.border, borderRadius: radius.sm }]}
      />
      <TextInput
        value={reps}
        onChangeText={onChangeReps}
        editable={!!onChangeReps}
        keyboardType="number-pad"
        placeholder="reps"
        placeholderTextColor={colours.inkMuted}
        style={[styles.field, { color: colours.ink, borderColor: colours.border, borderRadius: radius.sm }]}
      />
      {onSwap ? (
        <Pressable onPress={onSwap} accessibilityRole="button" accessibilityLabel="Swap exercise" hitSlop={8}>
          <Ionicons name="swap-horizontal-outline" size={22} color={colours.brand} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function RestTimerBar({
  label,
  onMinus,
  onPlus,
  onSkip,
  style,
}: {
  label: string;
  onMinus?: () => void;
  onPlus?: () => void;
  onSkip?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, type } = useTheme();
  return (
    <View style={[styles.rest, { backgroundColor: colours.surfaceMuted, borderTopColor: colours.border }, style]}>
      <Ionicons name="stopwatch-outline" size={20} color={colours.brand} />
      <Text style={[type.title, { color: colours.ink, flex: 1 }]}>{label}</Text>
      {onMinus ? (
        <Pressable onPress={onMinus} accessibilityRole="button" accessibilityLabel="Minus 15 seconds" hitSlop={8}>
          <Text style={[type.button, { color: colours.brand }]}>-15</Text>
        </Pressable>
      ) : null}
      {onPlus ? (
        <Pressable onPress={onPlus} accessibilityRole="button" accessibilityLabel="Plus 15 seconds" hitSlop={8}>
          <Text style={[type.button, { color: colours.brand }]}>+15</Text>
        </Pressable>
      ) : null}
      {onSkip ? (
        <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip rest" hitSlop={8}>
          <Text style={[type.button, { color: colours.inkMuted }]}>Skip</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  set: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tick: {
    width: 28,
    height: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 16,
  },
  rest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
