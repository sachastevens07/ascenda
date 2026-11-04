import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';

export function SetRow({
  setNumber,
  kg,
  reps,
  completed = false,
  weighted = true,
  weightLabel,
  kgPlaceholder,
  weightUnit = 'kg',
  repsPlaceholder,
  suggestedLabel,
  recordLabel,
  onToggle,
  onChangeKg,
  onChangeReps,
  onEndKg,
  onEndReps,
  onSuggest,
  onRecord,
  style,
}: {
  setNumber: number;
  kg: string;
  reps: string;
  completed?: boolean;
  weighted?: boolean;
  weightLabel?: string;
  kgPlaceholder?: string;
  weightUnit?: 'kg' | 'lbs';
  repsPlaceholder?: string;
  suggestedLabel?: string;
  recordLabel?: string;
  onToggle?: () => void;
  onChangeKg?: (value: string) => void;
  onChangeReps?: (value: string) => void;
  onEndKg?: () => void;
  onEndReps?: () => void;
  onSuggest?: () => void;
  onRecord?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, type } = useTheme();
  return (
    <View
      style={[
        styles.set,
        {
          backgroundColor: completed ? colours.brandSoft : colours.bg,
          borderRadius: radius.md,
        },
        style,
      ]}>
      {recordLabel && onRecord ? (
        <Pressable
          onPress={onRecord}
          style={styles.setNum}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Set ${setNumber}: new personal best. ${recordLabel}`}>
          <AppText variant="bodyStrong" style={{ color: colours.inkMuted }}>
            {setNumber}
          </AppText>
          <Ionicons name="trophy" size={14} color={colours.pro} />
        </Pressable>
      ) : (
        <AppText variant="bodyStrong" style={{ color: colours.inkMuted, width: 24, textAlign: 'center' }}>
          {setNumber}
        </AppText>
      )}
      {weighted ? (
        <View style={styles.kgWrap}>
          <TextInput
            value={kg}
            onChangeText={onChangeKg}
            onEndEditing={onEndKg}
            editable={!!onChangeKg}
            keyboardType="decimal-pad"
            selectTextOnFocus
            placeholder={kgPlaceholder ?? weightUnit}
            placeholderTextColor={colours.inkSubtle}
            accessibilityLabel={`Set ${setNumber} weight in ${weightUnit === 'lbs' ? 'pounds' : 'kilograms'}`}
            style={[
              styles.field,
              type.bodyStrong,
              {
                color: colours.ink,
                borderColor: completed ? colours.brandSoft : colours.border,
                backgroundColor: colours.surface,
                borderRadius: radius.md,
                width: '100%',
                fontVariant: ['tabular-nums'],
              },
            ]}
          />
          {suggestedLabel ? (
            <Pressable
              onPress={onSuggest}
              disabled={!onSuggest}
              accessibilityRole={onSuggest ? 'button' : undefined}
              accessibilityLabel={suggestedLabel}
              style={[styles.chip, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
              <AppText variant="caption" style={{ color: colours.brand }}>
                {suggestedLabel}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <AppText variant="bodySm" style={{ color: colours.inkMuted, flex: 1, textAlign: 'center' }}>
          {weightLabel ?? 'Bodyweight'}
        </AppText>
      )}
      <TextInput
        value={reps}
        onChangeText={onChangeReps}
        onEndEditing={onEndReps}
        editable={!!onChangeReps}
        keyboardType="number-pad"
        selectTextOnFocus
        placeholder={repsPlaceholder ?? 'reps'}
        placeholderTextColor={colours.inkSubtle}
        accessibilityLabel={`Set ${setNumber} reps`}
        style={[
          styles.field,
          styles.flex,
          type.bodyStrong,
          {
            color: colours.ink,
            borderColor: completed ? colours.brandSoft : colours.border,
            backgroundColor: colours.surface,
            borderRadius: radius.md,
            fontVariant: ['tabular-nums'],
          },
        ]}
      />
      <Pressable
        onPress={onToggle}
        disabled={!onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={`Set ${setNumber} done`}
        style={[
          styles.tick,
          {
            borderColor: completed ? colours.success : colours.brand,
            backgroundColor: completed ? colours.success : colours.surface,
            borderRadius: radius.md,
          },
        ]}>
        <Ionicons name="checkmark" size={22} color={completed ? colours.onBrand : colours.brand} />
      </Pressable>
    </View>
  );
}

export function RestTimerBar({
  label,
  caption = 'Rest',
  onMinus,
  onPlus,
  onSkip,
  style,
}: {
  label: string;
  caption?: string;
  onMinus?: () => void;
  onPlus?: () => void;
  onSkip?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();
  return (
    <View style={[styles.rest, { backgroundColor: colours.surface, borderTopColor: colours.border }, style]}>
      <Ionicons name="stopwatch-outline" size={22} color={colours.accent} />
      <View style={styles.restCopy}>
        <AppText variant="caption" style={{ color: colours.inkMuted }}>
          {caption}
        </AppText>
        <AppText variant="number" style={{ color: colours.ink }}>
          {label}
        </AppText>
      </View>
      {onMinus ? (
        <Pressable onPress={onMinus} accessibilityRole="button" accessibilityLabel="Minus 15 seconds" hitSlop={8}>
          <AppText variant="bodyStrong" style={{ color: colours.brand }}>
            -15s
          </AppText>
        </Pressable>
      ) : null}
      {onPlus ? (
        <Pressable onPress={onPlus} accessibilityRole="button" accessibilityLabel="Plus 15 seconds" hitSlop={8}>
          <AppText variant="bodyStrong" style={{ color: colours.brand }}>
            +15s
          </AppText>
        </Pressable>
      ) : null}
      {onSkip ? (
        <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip rest" hitSlop={8}>
          <AppText variant="bodyStrong" style={{ color: colours.inkMuted }}>
            Skip
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  set: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  setNum: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  kgWrap: {
    flex: 1,
    gap: 4,
  },
  field: {
    minHeight: 40,
    borderWidth: 1,
    paddingHorizontal: 10,
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tick: {
    width: 48,
    height: 48,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  restCopy: {
    flex: 1,
  },
});
