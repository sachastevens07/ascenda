import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import { fillCopy, loggerCopy } from '@/lib/copy';

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
  onDelete,
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
  onDelete?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, type } = useTheme();
  const setLabel = warmup ? loggerCopy.warmup_set_label : String(setNumber);
  const commitAt = 52;
  const flyOff = 420;
  const translate = useRef(new Animated.Value(0)).current;
  const startX = useRef(0);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  useEffect(() => {
    startX.current = 0;
    translate.setValue(0);
  }, [setNumber, translate]);

  const pan = useMemo(() => {
    const snapTo = (to: number, onDone?: () => void) => {
      startX.current = to;
      Animated.timing(translate, {
        toValue: to,
        duration: to === 0 ? 90 : 70,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onDone?.();
      });
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Boolean(onDeleteRef.current) &&
        Math.abs(gesture.dx) > 4 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        translate.stopAnimation((value) => {
          startX.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        translate.setValue(startX.current + gesture.dx * 1.2);
      },
      onPanResponderRelease: (_, gesture) => {
        const next = startX.current + gesture.dx * 1.2;
        const commit = Math.abs(next) > commitAt || Math.abs(gesture.vx) > 0.5;
        if (!commit || !onDeleteRef.current) {
          snapTo(0);
          return;
        }
        const dir = next >= 0 ? 1 : -1;
        snapTo(dir * flyOff, () => onDeleteRef.current?.());
      },
      onPanResponderTerminate: () => snapTo(0),
    });
  }, [translate]);

  const row = (
    <>
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
    </>
  );

  if (!onDelete) {
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
        {row}
      </View>
    );
  }

  return (
    <View
      style={[styles.swipeWrap, { backgroundColor: colours.danger, borderRadius: radius.md }, style]}
      accessibilityActions={[{ name: 'delete', label: loggerCopy.delete_set }]}
      accessibilityLabel={fillCopy(loggerCopy.delete_set_a11y, { set: setLabel })}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'delete') onDelete();
      }}>
      <View style={styles.deleteBackdrop} pointerEvents="none">
        <Ionicons name="trash-outline" size={18} color={colours.onBrand} />
        <Ionicons name="trash-outline" size={18} color={colours.onBrand} />
      </View>
      <Animated.View
        {...pan.panHandlers}
        style={[
          styles.set,
          {
            backgroundColor: pbGlow ? colours.accentSoft : completed ? colours.brandSoft : colours.bg,
            borderRadius: radius.md,
            transform: [{ translateX: translate }],
          },
        ]}>
        {row}
      </Animated.View>
    </View>
  );
}

export function ExerciseNameHit({
  onPress,
  onDragStart,
  onDragMove,
  onDragEnd,
  onMoveUp,
  onMoveDown,
  dragEnabled = true,
  children,
}: {
  onPress: () => void;
  onDragStart: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  dragEnabled?: boolean;
  children: ReactNode;
}) {
  const dragging = useRef(false);
  const panHeld = useRef(false);
  const callbacks = useRef({ onPress, onDragStart, onDragMove, onDragEnd });
  callbacks.current = { onPress, onDragStart, onDragMove, onDragEnd };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          dragging.current && Math.abs(gesture.dy) > 3,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          dragging.current && Math.abs(gesture.dy) > 3,
        onPanResponderTerminationRequest: () => !dragging.current,
        onPanResponderGrant: () => {
          panHeld.current = true;
        },
        onPanResponderMove: (_, gesture) => {
          if (dragging.current) callbacks.current.onDragMove(gesture.dy);
        },
        onPanResponderRelease: () => {
          panHeld.current = false;
          if (!dragging.current) return;
          dragging.current = false;
          callbacks.current.onDragEnd();
        },
        onPanResponderTerminate: () => {
          panHeld.current = false;
          if (!dragging.current) return;
          dragging.current = false;
          callbacks.current.onDragEnd();
        },
      }),
    []
  );

  const actions = [
    ...(onMoveUp ? [{ name: 'moveUp' as const, label: loggerCopy.move_up }] : []),
    ...(onMoveDown ? [{ name: 'moveDown' as const, label: loggerCopy.move_down }] : []),
  ];

  return (
    <View
      {...(dragEnabled ? pan.panHandlers : null)}
      collapsable={false}
      style={styles.flex}
      accessibilityActions={actions.length ? actions : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'moveUp') onMoveUp?.();
        if (event.nativeEvent.actionName === 'moveDown') onMoveDown?.();
      }}>
      <Pressable
        onPress={() => {
          if (!dragging.current) callbacks.current.onPress();
        }}
        onLongPress={
          dragEnabled
            ? () => {
                dragging.current = true;
                callbacks.current.onDragStart();
              }
            : undefined
        }
        onPressOut={() => {
          if (!dragging.current) return;
          setTimeout(() => {
            if (!dragging.current || panHeld.current) return;
            dragging.current = false;
            callbacks.current.onDragEnd();
          }, 40);
        }}
        delayLongPress={220}
        accessibilityRole="button"
        accessibilityHint={dragEnabled ? loggerCopy.reorder_hint : undefined}
        style={({ pressed }) => [styles.flex, pressed && !dragging.current ? styles.namePressed : null]}>
        {children}
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
  swipeWrap: {
    overflow: 'hidden',
  },
  deleteBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
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
  flex: {
    flex: 1,
  },
  namePressed: {
    opacity: 0.8,
  },
});
