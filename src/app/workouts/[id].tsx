import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { ExercisePicker } from '@/components/ExercisePicker';
import { AppText } from '@/components/ui/AppText';
import { colours, useTheme } from '@/constants/theme';
import {
  DEFAULT_SLOT,
  MAX_REPS,
  MAX_SETS,
  MAX_WORKOUT_EXERCISES,
  MAX_WORKOUT_NAME,
  MIN_REPS,
  MIN_SETS,
  fetchCustomWorkout,
  missingCustomWorkoutsMessage,
  saveCustomWorkout,
  trimWorkoutName,
  type WorkoutDraftSlot,
} from '@/lib/customWorkouts';
import { EQUIPMENT_LABELS, ZONE_LABELS } from '@/lib/exercises';
import type { SlotExercise } from '@/lib/programmes';

export default function WorkoutEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const insets = useSafeAreaInsets();
  const { type } = useTheme();
  const [name, setName] = useState('');
  const [slots, setSlots] = useState<WorkoutDraftSlot[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [isSaving, setIsSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    if (isNew) {
      setName('');
      setSlots([]);
      setLoadState('ready');
      return;
    }
    if (!id) return;
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
      showDialog('Name this workout', 'Give it a short name you’ll recognise on Home.');
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
          <AppText variant="body" style={styles.message}>
            {isNew
              ? missingCustomWorkoutsMessage()
              : 'We couldn’t load this workout.'}
          </AppText>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled">
        <AppText variant="title1" style={styles.title}>
          {isNew ? 'Create workout' : 'Edit workout'}
        </AppText>
        <AppText variant="bodySm" style={styles.label}>
          Name
        </AppText>
        <TextInput
          style={[styles.input, type.bodyStrong, { fontVariant: ['tabular-nums'] }]}
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
                <AppText variant="title3" style={styles.exerciseName}>
                  {slot.exercise.name}
                </AppText>
                <AppText variant="bodySm" style={styles.meta}>
                  {ZONE_LABELS[slot.exercise.zone]} · {EQUIPMENT_LABELS[slot.exercise.equipment]}
                </AppText>
              </View>
              <Pressable
                onPress={() => setSlots((current) => current.filter((_, i) => i !== index))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${slot.exercise.name}`}>
                <Ionicons name="close-circle" size={26} color={colours.textMuted} />
              </Pressable>
            </View>
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
          <AppText variant="bodyStrong" style={styles.outlineText}>
            Add exercise
          </AppText>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.libraryLink, pressed && styles.pressed]}
          onPress={() => router.push('/library')}
          accessibilityRole="button">
          <Ionicons name="barbell-outline" size={18} color={colours.accent} />
          <AppText variant="bodyStrong" style={styles.libraryLinkText}>
            Exercise library
          </AppText>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.primary, (pressed || isSaving) && styles.pressed]}
          onPress={handleSave}
          disabled={isSaving}
          accessibilityRole="button">
          <AppText variant="bodyStrong" style={styles.primaryText}>
            {isSaving ? 'Saving…' : 'Save workout'}
          </AppText>
        </Pressable>
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
      <AppText variant="bodyStrong" style={styles.stepperLabel}>
        {label}
      </AppText>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          style={styles.stepperButton}
          accessibilityRole="button"
          accessibilityLabel={`Fewer ${label}`}>
          <Ionicons name="remove" size={22} color={value <= min ? colours.border : colours.accent} />
        </Pressable>
        <AppText variant="title3" style={styles.stepperValue}>
          {value}
        </AppText>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          style={styles.stepperButton}
          accessibilityRole="button"
          accessibilityLabel={`More ${label}`}>
          <Ionicons name="add" size={22} color={value >= max ? colours.border : colours.accent} />
        </Pressable>
      </View>
    </View>
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
    color: colours.text,
  },
  label: {
    color: colours.textMuted,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.surface,
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
    color: colours.text,
  },
  meta: {
    color: colours.textMuted,
    marginTop: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  stepperLabel: {
    color: colours.text,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accentSoft,
  },
  stepperValue: {
    minWidth: 28,
    textAlign: 'center',
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
    color: colours.accent,
  },
  libraryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
  },
  libraryLinkText: {
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
    color: colours.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  message: {
    color: colours.textMuted,
    textAlign: 'center',
  },
});
