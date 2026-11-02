import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import {
  AnchoredMenu,
  MenuRow,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/AnchoredMenu';
import { colours } from '@/constants/theme';

export type FilterOption<T extends string> = {
  value: T;
  label: string;
};

type FilterSheetProps<T extends string> = {
  /** Shown on the button and as the menu title, e.g. "Muscle". */
  label: string;
  /** Text for the "no filter" choice, e.g. "All muscles". */
  allLabel: string;
  options: FilterOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  /** Stretch to fill a row. Turn off when stacking filters so the label stays readable. */
  fill?: boolean;
};

export function FilterSheet<T extends string>({
  label,
  allLabel,
  options,
  value,
  onChange,
  fill = true,
}: FilterSheetProps<T>) {
  const buttonRef = useRef<AnchorHandle>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const selected = options.find((option) => option.value === value);
  const isActive = selected !== undefined;

  function open() {
    measureAnchor(buttonRef.current, (rect) => {
      setAnchor(rect);
      setIsOpen(true);
    });
  }

  function choose(next: T | null) {
    onChange(next);
    setIsOpen(false);
  }

  const rows: { value: T | null; label: string }[] = [{ value: null, label: allLabel }, ...options];

  return (
    <>
      <Pressable
        ref={buttonRef}
        collapsable={false}
        onPress={open}
        style={[styles.button, fill && styles.buttonFill, isActive && styles.buttonActive]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? allLabel}`}>
        <Text style={[styles.buttonText, isActive && styles.buttonTextActive]} numberOfLines={1}>
          {selected?.label ?? label}
        </Text>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={isActive ? colours.accent : colours.textMuted}
        />
      </Pressable>

      <AnchoredMenu visible={isOpen} anchor={anchor} onClose={() => setIsOpen(false)} minWidth={200}>
        {rows.map((row) => (
          <MenuRow
            key={row.value ?? 'all'}
            label={row.label}
            selected={row.value === value}
            onPress={() => choose(row.value)}
          />
        ))}
      </AnchoredMenu>
    </>
  );
}

const styles = StyleSheet.create({
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
  buttonFill: {
    flex: 1,
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
});
