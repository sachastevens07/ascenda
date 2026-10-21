import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { colours } from '@/constants/theme';

type PillDropdownOption<T extends string> = {
  value: T;
  label: string;
};

type PillDropdownProps<T extends string> = {
  label: string;
  allLabel: string;
  options: PillDropdownOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
};

const OPTION_HEIGHT = 50;
const OPTION_GAP = 8;
const ANIM_MS = 220;

/** Pill button that expands its options underneath, each in the same pill shape. */
export function PillDropdown<T extends string>({
  label,
  allLabel,
  options,
  value,
  onChange,
}: PillDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  const selected = options.find((option) => option.value === value);
  const isActive = selected !== undefined;
  const rows: { value: T | null; label: string }[] = [{ value: null, label: allLabel }, ...options];
  const menuHeight = rows.length * OPTION_HEIGHT + Math.max(0, rows.length - 1) * OPTION_GAP;

  function animateTo(open: boolean) {
    setIsOpen(open);
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: ANIM_MS,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  function choose(next: T | null) {
    onChange(next);
    animateTo(false);
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => animateTo(!isOpen)}
        style={[styles.button, isActive && styles.buttonActive]}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`${label}: ${selected?.label ?? allLabel}`}>
        <Text style={[styles.buttonText, isActive && styles.buttonTextActive]} numberOfLines={1}>
          {selected?.label ?? label}
        </Text>
        <Animated.View
          style={{
            transform: [
              {
                rotate: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '180deg'],
                }),
              },
            ],
          }}>
          <Ionicons
            name="chevron-down"
            size={18}
            color={isActive ? colours.accent : colours.textMuted}
          />
        </Animated.View>
      </Pressable>

      <Animated.View
        style={[
          styles.menu,
          {
            height: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, menuHeight],
            }),
            opacity: progress,
            marginTop: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, OPTION_GAP],
            }),
            marginBottom: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, OPTION_GAP],
            }),
          },
        ]}
        pointerEvents={isOpen ? 'auto' : 'none'}>
        {rows.map((row, index) => {
          const isSelected = row.value === value;
          return (
            <View key={row.value ?? 'all'} style={index < rows.length - 1 ? styles.slot : undefined}>
              <Pressable
                onPress={() => choose(row.value)}
                style={[styles.option, isSelected && styles.optionSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}>
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {row.label}
                </Text>
                {isSelected && <Ionicons name="checkmark" size={20} color={colours.accent} />}
              </Pressable>
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.surface,
    gap: 6,
  },
  buttonActive: {
    borderColor: colours.accent,
    backgroundColor: colours.accentSoft,
  },
  buttonText: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colours.text,
  },
  buttonTextActive: {
    color: colours.accent,
  },
  menu: {
    overflow: 'hidden',
  },
  slot: {
    marginBottom: OPTION_GAP,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: OPTION_HEIGHT,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.surface,
    gap: 8,
  },
  optionSelected: {
    borderColor: colours.accent,
    backgroundColor: colours.accentSoft,
  },
  optionText: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colours.text,
  },
  optionTextSelected: {
    color: colours.accent,
  },
});
