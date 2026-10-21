import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DialogCard, type DialogOptions } from '@/components/Dialog';
import { colours } from '@/constants/theme';
import { EQUIPMENT_LABELS } from '@/lib/exercises';
import type { EquipmentAccess } from '@/lib/profile';
import type { ProgrammeExercise, SlotExercise } from '@/lib/programmes';
import { fetchAlternatives, type SwapScope } from '@/lib/swaps';

type SwapSheetProps = {
  /** The slot being swapped; the sheet is open while this is set. */
  item: ProgrammeExercise | null;
  equipment: EquipmentAccess;
  /** Exercises already in the day, which can't be offered. */
  excludeIds: string[];
  onClose: () => void;
  onSwap: (exercise: SlotExercise, scope: SwapScope) => Promise<void>;
  /** Puts the programme's own exercise back, today and in her programme. */
  onRestore: () => Promise<void>;
};

type LoadState = 'loading' | 'error' | 'ready';

export function SwapSheet({ item, equipment, excludeIds, onClose, onSwap, onRestore }: SwapSheetProps) {
  const insets = useSafeAreaInsets();
  const [alternatives, setAlternatives] = useState<SlotExercise[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [chosen, setChosen] = useState<SlotExercise | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<DialogOptions | null>(null);

  const current = item?.exercise ?? null;
  const excludeKey = excludeIds.join(',');

  useEffect(() => {
    setChosen(null);
    if (!current) return;
    let isCurrent = true;
    setLoadState('loading');
    fetchAlternatives(current, equipment, excludeKey.split(','))
      .then((result) => {
        if (!isCurrent) return;
        setAlternatives(result);
        setLoadState('ready');
      })
      .catch(() => {
        if (isCurrent) setLoadState('error');
      });
    return () => {
      isCurrent = false;
    };
  }, [current, equipment, excludeKey]);

  async function save(action: () => Promise<void>) {
    setIsSaving(true);
    try {
      await action();
      onClose();
    } catch {
      setSaveError({ title: 'That swap didn’t save', message: 'Check your connection and try again.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      visible={item !== null}
      transparent
      animationType="slide"
      onRequestClose={saveError ? () => setSaveError(null) : onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {chosen ? (
          <>
            <Text style={styles.title}>Swap to {chosen.name}</Text>
            <Text style={styles.subtitle}>How long for?</Text>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, (pressed || isSaving) && styles.pressed]}
              onPress={() => save(() => onSwap(chosen, 'today'))}
              disabled={isSaving}
              accessibilityRole="button">
              <Text style={styles.primaryButtonText}>Just today</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, (pressed || isSaving) && styles.pressed]}
              onPress={() => save(() => onSwap(chosen, 'always'))}
              disabled={isSaving}
              accessibilityRole="button">
              <Text style={styles.outlineButtonText}>Every time</Text>
              <Text style={styles.buttonHint}>Replaces it in your programme</Text>
            </Pressable>
            <Pressable
              style={styles.link}
              onPress={() => setChosen(null)}
              disabled={isSaving}
              accessibilityRole="button">
              <Text style={styles.linkText}>Back</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>Swap {current?.name}</Text>
            <Text style={styles.subtitle}>These work the same muscle with equipment you have.</Text>
            <ScrollView>
              {item?.original && (
                <Pressable
                  style={({ pressed }) => [styles.row, (pressed || isSaving) && styles.pressed]}
                  onPress={() => save(onRestore)}
                  disabled={isSaving}
                  accessibilityRole="button">
                  <Ionicons name="arrow-undo" size={22} color={colours.accent} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>Back to {item.original.name}</Text>
                    <Text style={styles.rowDetail}>The exercise from your programme</Text>
                  </View>
                </Pressable>
              )}
              {loadState === 'loading' ? (
                <ActivityIndicator style={styles.status} color={colours.accent} />
              ) : loadState === 'error' ? (
                <Text style={styles.status}>
                  We couldn’t load alternatives. Check your connection and try again.
                </Text>
              ) : alternatives.length === 0 ? (
                <Text style={styles.status}>
                  There’s nothing else for this muscle with your equipment.
                </Text>
              ) : (
                alternatives.map((exercise) => (
                  <Pressable
                    key={exercise.id}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    onPress={() => setChosen(exercise)}
                    accessibilityRole="button">
                    <Ionicons name="swap-horizontal" size={22} color={colours.accent} />
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>{exercise.name}</Text>
                      <Text style={styles.rowDetail}>{EQUIPMENT_LABELS[exercise.equipment]}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colours.textMuted} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </>
        )}
      </View>
      {saveError && <DialogCard dialog={saveError} onClose={() => setSaveError(null)} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31, 27, 36, 0.35)',
  },
  sheet: {
    maxHeight: '75%',
    paddingTop: 20,
    paddingHorizontal: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colours.surface,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: colours.textMuted,
    marginTop: 4,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colours.border,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colours.text,
  },
  rowDetail: {
    fontSize: 14,
    color: colours.textMuted,
    marginTop: 2,
  },
  status: {
    fontSize: 16,
    lineHeight: 22,
    color: colours.textMuted,
    paddingVertical: 20,
  },
  primaryButton: {
    minHeight: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
    marginTop: 12,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.surface,
  },
  outlineButton: {
    minHeight: 64,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
    marginTop: 12,
  },
  outlineButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  buttonHint: {
    fontSize: 13,
    color: colours.textMuted,
    marginTop: 2,
  },
  link: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.textMuted,
  },
  pressed: {
    opacity: 0.7,
  },
});
