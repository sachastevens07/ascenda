import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterSheet } from '@/components/FilterSheet';
import { AppText } from '@/components/ui/AppText';
import { ExerciseThumb } from '@/components/ui';
import { colours, type } from '@/constants/theme';
import { fetchExercisesForBuilder } from '@/lib/customWorkouts';
import {
  BUILDER_TAGS,
  BUILDER_TAG_LABELS,
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLES,
  MUSCLE_LABELS,
  ZONE_LABELS,
  ZONES,
  exerciseMatchesBuilderTag,
  type BuilderTag,
  type Equipment,
  type Muscle,
} from '@/lib/exercises';
import type { SlotExercise } from '@/lib/programmes';

type ZoneFilter = '1' | '2' | '3' | '4';

function matchesSearch(exercise: SlotExercise, query: string): boolean {
  if (!query) return true;
  const haystack = [
    exercise.name,
    EQUIPMENT_LABELS[exercise.equipment],
    MUSCLE_LABELS[exercise.primary_muscle],
    ZONE_LABELS[exercise.zone],
  ]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

type ExercisePickerProps = {
  open: boolean;
  takenIds: string[];
  onClose: () => void;
  onChoose: (exercise: SlotExercise) => void;
};

export function ExercisePicker({ open, takenIds, onClose, onChoose }: ExercisePickerProps) {
  const insets = useSafeAreaInsets();
  const [exercises, setExercises] = useState<SlotExercise[]>([]);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [zone, setZone] = useState<ZoneFilter | null>(null);
  const [tag, setTag] = useState<BuilderTag | null>(null);

  useEffect(() => {
    if (!open || exercises.length > 0) return;
    fetchExercisesForBuilder()
      .then(setExercises)
      .catch(() => {});
  }, [open, exercises.length]);

  const filtered = useMemo(() => {
    const taken = new Set(takenIds);
    return exercises.filter(
      (exercise) =>
        !taken.has(exercise.id) &&
        (!muscle || exercise.primary_muscle === muscle) &&
        (!equipment || exercise.equipment === equipment) &&
        (!zone || String(exercise.zone) === zone) &&
        (!tag || exerciseMatchesBuilderTag(exercise, tag)) &&
        matchesSearch(exercise, query.trim())
    );
  }, [exercises, takenIds, muscle, equipment, zone, tag, query]);

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.picker, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.pickerHeader}>
          <AppText variant="title2" style={{ color: colours.text }}>
            Add exercise
          </AppText>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={28} color={colours.text} />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={20} color={colours.textMuted} />
          <TextInput
            style={[styles.searchInput, type.bodyStrong, { fontVariant: ['tabular-nums'] }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colours.textMuted}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <View style={styles.filters}>
          <FilterSheet
            fill={false}
            label="Muscle"
            allLabel="All muscles"
            options={MUSCLES.map((value) => ({ value, label: MUSCLE_LABELS[value] }))}
            value={muscle}
            onChange={setMuscle}
          />
          <FilterSheet
            fill={false}
            label="Equipment"
            allLabel="All kit"
            options={EQUIPMENT.map((value) => ({ value, label: EQUIPMENT_LABELS[value] }))}
            value={equipment}
            onChange={setEquipment}
          />
          <FilterSheet
            fill={false}
            label="Zone"
            allLabel="All zones"
            options={ZONES.map((value) => ({
              value: String(value) as ZoneFilter,
              label: ZONE_LABELS[value],
            }))}
            value={zone}
            onChange={setZone}
          />
          <FilterSheet
            fill={false}
            label="Tag"
            allLabel="All tags"
            options={BUILDER_TAGS.map((value) => ({ value, label: BUILDER_TAG_LABELS[value] }))}
            value={tag}
            onChange={setTag}
          />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          {filtered.map((exercise) => (
            <Pressable
              key={exercise.id}
              onPress={() => onChoose(exercise)}
              style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
              accessibilityRole="button">
              <ExerciseThumb exercise={exercise} size={48} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong" style={{ color: colours.text }}>
                  {exercise.name}
                </AppText>
                <AppText variant="bodySm" style={{ color: colours.textMuted, marginTop: 2 }}>
                  {ZONE_LABELS[exercise.zone]} · {MUSCLE_LABELS[exercise.primary_muscle]} ·{' '}
                  {EQUIPMENT_LABELS[exercise.equipment]}
                </AppText>
              </View>
              <Ionicons name="add-circle-outline" size={24} color={colours.accent} />
            </Pressable>
          ))}
          {filtered.length === 0 && (
            <AppText variant="body" style={{ color: colours.textMuted, textAlign: 'center', marginTop: 24 }}>
              No exercises match. Try clearing a filter.
            </AppText>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  picker: {
    flex: 1,
    backgroundColor: colours.background,
    paddingHorizontal: 20,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.surface,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: colours.text,
    paddingVertical: 12,
  },
  filters: {
    gap: 10,
    marginVertical: 12,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colours.border,
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
