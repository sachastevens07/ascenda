import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { FilterSheet } from '@/components/FilterSheet';
import { colours } from '@/constants/theme';
import {
  DEFAULT_SLOT,
  MAX_REPS,
  MAX_SETS,
  MAX_WORKOUT_EXERCISES,
  MAX_WORKOUT_NAME,
  MIN_REPS,
  MIN_SETS,
  fetchCustomWorkout,
  fetchExercisesForBuilder,
  missingCustomWorkoutsMessage,
  saveCustomWorkout,
  trimWorkoutName,
  type WorkoutDraftSlot,
} from '@/lib/customWorkouts';
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLES,
  MUSCLE_LABELS,
  ZONE_LABELS,
  ZONES,
  type Equipment,
  type Muscle,
} from '@/lib/exercises';
import type { SlotExercise } from '@/lib/programmes';

type ZoneFilter = '1' | '2' | '3' | '4';

export default function WorkoutEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [slots, setSlots] = useState<WorkoutDraftSlot[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>(
    isNew ? 'ready' : 'loading'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (isNew || !id) return;
    let isCurrent = true;
    fetchCustomWorkout(id)
      .then((workout) => {
        if (!isCurrent) return;
        if (!workout || workout.is_starter) {
          setLoadState('error');
          return;
        }
        setName(workout.name);
        setSlots(
          workout.exercises.map((item) => ({
            exercise: item.exercise,
            sets: item.sets,
            rep_min: item.rep_min,
            rep_max: item.rep_max,
          }))
        );
        setLoadState('ready');
      })
      .catch(() => {
        if (isCurrent) setLoadState('error');
      });
    return () => {
      isCurrent = false;
    };
  }, [id, isNew]);

  function addExercise(exercise: SlotExercise) {
    if (slots.some((slot) => slot.exercise.id === exercise.id)) {
      showDialog('Already in this workout', `${exercise.name} is already on the list.`);
      return;
    }
    if (slots.length >= MAX_WORKOUT_EXERCISES) {
      showDialog('That’s enough for now', `Keep it to ${MAX_WORKOUT_EXERCISES} exercises.`);
      return;
    }
    setSlots((current) => [...current, { exercise, ...DEFAULT_SLOT }]);
    setPickerOpen(false);
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= slots.length) return;
    setSlots((current) => {
      const copy = [...current];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }

  function updateSlot(index: number, change: Partial<WorkoutDraftSlot>) {
    setSlots((current) =>
      current.map((slot, i) => (i === index ? { ...slot, ...change } : slot))
    );
  }

  async function handleSave() {
    const trimmed = trimWorkoutName(name);
    if (trimmed.length === 0) {
      showDialog('Name this workout', 'Give it a short name you’ll recognise on Today.');
      return;
    }
    if (slots.length === 0) {
      showDialog('Add an exercise', 'A workout needs at least one exercise.');
      return;
    }
    setIsSaving(true);
    try {
      await saveCustomWorkout(isNew ? null : id, trimmed, slots);
      if (router.canGoBack()) router.back();
      else router.replace('/workouts' as Href);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      showDialog(
        'That didn’t save',
        /custom_workouts/i.test(detail)
          ? missingCustomWorkoutsMessage()
          : detail || 'Check your connection and try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (loadState !== 'ready') {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <Text style={styles.message}>We couldn’t load this workout.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{isNew ? 'Create workout' : 'Edit workout'}</Text>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Corner full body"
          placeholderTextColor={colours.textMuted}
          maxLength={MAX_WORKOUT_NAME}
          accessibilityLabel="Workout name"
        />

        {slots.map((slot, index) => (
          <View key={`${slot.exercise.id}-${index}`} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.flex}>
                <Text style={styles.exerciseName}>{slot.exercise.name}</Text>
                <Text style={styles.meta}>
                  {ZONE_LABELS[slot.exercise.zone]} · {EQUIPMENT_LABELS[slot.exercise.equipment]}
                </Text>
              </View>
              <Pressable
                onPress={() => setSlots((current) => current.filter((_, i) => i !== index))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${slot.exercise.name}`}>
                <Ionicons name="close-circle" size={26} color={colours.textMuted} />
              </Pressable>
            </View>
            <View style={styles.steppers}>
              <Stepper
                label="Sets"
                value={slot.sets}
                min={MIN_SETS}
                max={MAX_SETS}
                onChange={(sets) => updateSlot(index, { sets })}
              />
              <Stepper
                label="Min reps"
                value={slot.rep_min}
                min={MIN_REPS}
                max={slot.rep_max}
                onChange={(rep_min) => updateSlot(index, { rep_min })}
              />
              <Stepper
                label="Max reps"
                value={slot.rep_max}
                min={slot.rep_min}
                max={MAX_REPS}
                onChange={(rep_max) => updateSlot(index, { rep_max })}
              />
            </View>
            <View style={styles.reorder}>
              <Pressable
                onPress={() => move(index, -1)}
                disabled={index === 0}
                style={({ pressed }) => [styles.reorderButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Move up">
                <Ionicons name="chevron-up" size={22} color={index === 0 ? colours.border : colours.accent} />
              </Pressable>
              <Pressable
                onPress={() => move(index, 1)}
                disabled={index === slots.length - 1}
                style={({ pressed }) => [styles.reorderButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Move down">
                <Ionicons
                  name="chevron-down"
                  size={22}
                  color={index === slots.length - 1 ? colours.border : colours.accent}
                />
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable
          style={({ pressed }) => [styles.outline, pressed && styles.pressed]}
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button">
          <Text style={styles.outlineText}>Add exercise</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.primary, (pressed || isSaving) && styles.pressed]}
          onPress={handleSave}
          disabled={isSaving}
          accessibilityRole="button">
          <Text style={styles.primaryText}>{isSaving ? 'Saving…' : 'Save workout'}</Text>
        </Pressable>

        <Text style={styles.disclaimer}>
          General fitness guidance, not medical advice. Stop if anything hurts.
        </Text>
      </ScrollView>

      <ExercisePicker
        open={pickerOpen}
        takenIds={slots.map((slot) => slot.exercise.id)}
        onClose={() => setPickerOpen(false)}
        onChoose={addExercise}
      />
    </View>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          style={styles.stepperButton}
          accessibilityRole="button"
          accessibilityLabel={`Fewer ${label}`}>
          <Ionicons name="remove" size={20} color={value <= min ? colours.border : colours.accent} />
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          style={styles.stepperButton}
          accessibilityRole="button"
          accessibilityLabel={`More ${label}`}>
          <Ionicons name="add" size={20} color={value >= max ? colours.border : colours.accent} />
        </Pressable>
      </View>
    </View>
  );
}

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

function ExercisePicker({
  open,
  takenIds,
  onClose,
  onChoose,
}: {
  open: boolean;
  takenIds: string[];
  onClose: () => void;
  onChoose: (exercise: SlotExercise) => void;
}) {
  const insets = useSafeAreaInsets();
  const [exercises, setExercises] = useState<SlotExercise[]>([]);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [zone, setZone] = useState<ZoneFilter | null>(null);

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
        matchesSearch(exercise, query.trim())
    );
  }, [exercises, takenIds, muscle, equipment, zone, query]);

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.picker, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Add exercise</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={28} color={colours.text} />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={20} color={colours.textMuted} />
          <TextInput
            style={styles.searchInput}
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
            label="Muscle"
            allLabel="All muscles"
            options={MUSCLES.map((value) => ({ value, label: MUSCLE_LABELS[value] }))}
            value={muscle}
            onChange={setMuscle}
          />
          <FilterSheet
            label="Equipment"
            allLabel="All kit"
            options={EQUIPMENT.map((value) => ({ value, label: EQUIPMENT_LABELS[value] }))}
            value={equipment}
            onChange={setEquipment}
          />
          <FilterSheet
            label="Zone"
            allLabel="All zones"
            options={ZONES.map((value) => ({
              value: String(value) as ZoneFilter,
              label: ZONE_LABELS[value],
            }))}
            value={zone}
            onChange={setZone}
          />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          {filtered.map((exercise) => (
            <Pressable
              key={exercise.id}
              onPress={() => onChoose(exercise)}
              style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
              accessibilityRole="button">
              <View style={styles.flex}>
                <Text style={styles.pickName}>{exercise.name}</Text>
                <Text style={styles.meta}>
                  {ZONE_LABELS[exercise.zone]} · {MUSCLE_LABELS[exercise.primary_muscle]} ·{' '}
                  {EQUIPMENT_LABELS[exercise.equipment]}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={24} color={colours.accent} />
            </Pressable>
          ))}
          {filtered.length === 0 && (
            <Text style={styles.emptyPick}>No exercises match. Try clearing a filter.</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colours.background,
  },
  content: {
    padding: 24,
    gap: 14,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.background,
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colours.text,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: colours.textMuted,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.surface,
    fontSize: 17,
    color: colours.text,
  },
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: colours.surface,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.text,
  },
  meta: {
    fontSize: 14,
    color: colours.textMuted,
    marginTop: 2,
  },
  steppers: {
    flexDirection: 'row',
    gap: 8,
  },
  stepper: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  stepperLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colours.textMuted,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accentSoft,
  },
  stepperValue: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: colours.text,
  },
  reorder: {
    flexDirection: 'row',
    gap: 8,
  },
  reorderButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accentSoft,
  },
  outline: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  outlineText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  primary: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  message: {
    fontSize: 17,
    color: colours.textMuted,
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    textAlign: 'center',
  },
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
  pickerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colours.text,
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
    fontSize: 17,
    color: colours.text,
    paddingVertical: 12,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  pickName: {
    fontSize: 17,
    fontWeight: '600',
    color: colours.text,
  },
  emptyPick: {
    fontSize: 16,
    color: colours.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
});
