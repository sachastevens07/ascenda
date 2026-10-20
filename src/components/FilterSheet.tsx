import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colours } from '@/constants/theme';

export type FilterOption<T extends string> = {
  value: T;
  label: string;
};

type FilterSheetProps<T extends string> = {
  /** Shown on the button and as the sheet title, e.g. "Muscle". */
  label: string;
  /** Text for the "no filter" choice, e.g. "All muscles". */
  allLabel: string;
  options: FilterOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
};

export function FilterSheet<T extends string>({
  label,
  allLabel,
  options,
  value,
  onChange,
}: FilterSheetProps<T>) {
  const insets = useSafeAreaInsets();
  const [isOpen, setIsOpen] = useState(false);

  const selected = options.find((option) => option.value === value);
  const isActive = selected !== undefined;

  function choose(next: T | null) {
    onChange(next);
    setIsOpen(false);
  }

  const rows: { value: T | null; label: string }[] = [{ value: null, label: allLabel }, ...options];

  return (
    <>
      <Pressable
        onPress={() => setIsOpen(true)}
        style={[styles.button, isActive && styles.buttonActive]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? allLabel}`}>
        <Text style={[styles.buttonText, isActive && styles.buttonTextActive]} numberOfLines={1}>
          {selected?.label ?? label}
        </Text>
        <Ionicons
          name="chevron-down"
          size={18}
          color={isActive ? colours.accent : colours.textMuted}
        />
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle}>{label}</Text>
          <ScrollView>
            {rows.map((row) => {
              const isSelected = row.value === value;
              return (
                <Pressable
                  key={row.value ?? 'all'}
                  onPress={() => choose(row.value)}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}>
                  <Text style={[styles.rowText, isSelected && styles.rowTextSelected]}>
                    {row.label}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={22} color={colours.accent} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31, 27, 36, 0.35)',
  },
  sheet: {
    maxHeight: '70%',
    paddingTop: 20,
    paddingHorizontal: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colours.surface,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colours.border,
  },
  rowText: {
    fontSize: 17,
    color: colours.text,
  },
  rowTextSelected: {
    fontWeight: '700',
    color: colours.accent,
  },
});
