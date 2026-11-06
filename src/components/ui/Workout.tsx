import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import { loggerCopy } from '@/lib/copy';

export function SetTableHeader({
  weightUnit = 'kg',
}: {
  weightUnit?: 'kg' | 'lbs';
}) {
  const { colours } = useTheme();
  return (
    <View style={styles.headerRow} accessibilityRole="header">
      <AppText variant="eyebrow" style={[styles.setCol, { color: colours.inkMuted }]}>
        {loggerCopy.columns.set}
      </AppText>
      <AppText variant="eyebrow" style={[styles.prevCol, { color: colours.inkMuted }]}>
        {loggerCopy.columns.previous}
      </AppText>
      <AppText variant="eyebrow" style={[styles.kgCol, { color: colours.inkMuted }]}>
        {weightUnit === 'lbs' ? loggerCopy.columns.lbs : loggerCopy.columns.kg}
      </AppText>
      <AppText variant="eyebrow" style={[styles.repsCol, { color: colours.inkMuted }]}>
        {loggerCopy.columns.reps}
      </AppText>
      <View style={styles.tickSpacer} />
    </View>
  );
}

export function SetRow({
  setNumber,
  kg,
  reps,
  completed = false,
  weighted = true,
  warmup = false,
  previousLabel,
  weightLabel,
  kgPlaceholder,
  weightUnit = 'kg',
  repsPlaceholder,
  suggestedLabel,
  recordLabel,
  pbGlow = false,
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
  warmup?: boolean;
  previousLabel?: string;
  weightLabel?: string;
  kgPlaceholder?: string;
  weightUnit?: 'kg' | 'lbs';
  repsPlaceholder?: string;
  suggestedLabel?: string;
  recordLabel?: string;
  pbGlow?: boolean;
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
  const setLabel = warmup ? loggerCopy.warmup_set_label : String(setNumber);
  return (
    <View
      style={[
        styles.set,
        {
          backgroundColor: pbGlow ? colours.accentSoft : completed ? colours.brandSoft : colours.bg,
          borderRadius: radius.md,
        },
        style,
      ]}>
      {recordLabel && onRecord ? (
        <Pressable
          onPress={onRecord}
          style={styles.setCol}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Set ${setLabel}: new personal best. ${recordLabel}`}>
          <AppText variant="bodyStrong" style={{ color: colours.inkMuted }}>
            {setLabel}
          </AppText>
          <Ionicons name="trophy" size={14} color={colours.pro} />
        </Pressable>
      ) : (
        <AppText
          variant="bodyStrong"
          style={{ color: colours.inkMuted, width: 28, textAlign: 'center' }}>
          {setLabel}
        </AppText>
      )}
      <AppText
        variant="caption"
        numberOfLines={1}
        style={[styles.prevCol, { color: colours.inkMuted, fontVariant: ['tabular-nums'] }]}>
        {previousLabel ?? '-'}
      </AppText>
      {weighted ? (
        <View style={styles.kgCol}>
          <TextInput
            value={kg}
            onChangeText={onChangeKg}
            onEndEditing={onEndKg}
            editable={!!onChangeKg}
            keyboardType="decimal-pad"
            selectTextOnFocus
            placeholder={kgPlaceholder ?? weightUnit}
            placeholderTextColor={colours.inkSubtle}
            accessibilityLabel={`Set ${setLabel} weight in ${weightUnit === 'lbs' ? 'pounds' : 'kilograms'}`}
            style={[
              styles.field,
              type.bodyStrong,
              {
                color: colours.ink,
                borderColor: completed ? colours.brandSoft : colours.border,
                backgroundColor: colours.surfaceMuted,
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
        <AppText variant="caption" style={[styles.kgCol, { color: colours.inkMuted, textAlign: 'center' }]}>
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
        accessibilityLabel={`Set ${setLabel} reps`}
        style={[
          styles.field,
          styles.repsCol,
          type.bodyStrong,
          {
            color: colours.ink,
            borderColor: completed ? colours.brandSoft : colours.border,
            backgroundColor: colours.surfaceMuted,
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
        accessibilityLabel={`Set ${setLabel} done`}
        style={[
          styles.tick,
          {
            borderColor: completed ? colours.success : colours.brand,
            backgroundColor: completed ? colours.success : colours.surface,
            borderRadius: radius.md,
          },
        ]}>
        <Ionicons name="checkmark" size={20} color={completed ? colours.onBrand : colours.brand} />
      </Pressable>
    </View>
  );
}

export function RestChip({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.prefChip, { backgroundColor: colours.surfaceMuted, borderRadius: radius.full }]}>
      <Ionicons name="timer-outline" size={14} color={colours.brand} />
      <AppText variant="caption" style={{ color: colours.ink }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function NoteChip({
  label,
  filled = false,
  onPress,
}: {
  label: string;
  filled?: boolean;
  onPress: () => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.prefChip, { backgroundColor: colours.surfaceMuted, borderRadius: radius.full }]}>
      <Ionicons name={filled ? 'document-text' : 'document-text-outline'} size={14} color={colours.brand} />
      <AppText variant="caption" style={{ color: colours.ink }} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function RestTimerBar({
  label,
  caption = 'Rest',
  minusLabel = loggerCopy.rest_add15.replace('+', '-'),
  plusLabel = loggerCopy.rest_add15,
  skipLabel = loggerCopy.rest_skip,
  onMinus,
  onPlus,
  onSkip,
  style,
}: {
  label: string;
  caption?: string;
  minusLabel?: string;
  plusLabel?: string;
  skipLabel?: string;
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
            {minusLabel}
          </AppText>
        </Pressable>
      ) : null}
      {onPlus ? (
        <Pressable onPress={onPlus} accessibilityRole="button" accessibilityLabel="Plus 15 seconds" hitSlop={8}>
          <AppText variant="bodyStrong" style={{ color: colours.brand }}>
            {plusLabel}
          </AppText>
        </Pressable>
      ) : null}
      {onSkip ? (
        <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel={skipLabel} hitSlop={8}>
          <AppText variant="bodyStrong" style={{ color: colours.inkMuted }}>
            {skipLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  set: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  setCol: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  prevCol: {
    flex: 1.15,
  },
  kgCol: {
    width: 72,
    gap: 4,
  },
  repsCol: {
    width: 52,
    textAlign: 'center',
  },
  tickSpacer: {
    width: 44,
  },
  field: {
    minHeight: 44,
    height: 44,
    borderWidth: 1,
    paddingHorizontal: 6,
    textAlign: 'center',
  },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  prefChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  tick: {
    width: 44,
    height: 44,
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
