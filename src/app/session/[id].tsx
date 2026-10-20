import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colours } from '@/constants/theme';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import {
  fetchProgrammeDay,
  formatKg,
  formatSetsAndReps,
  usesWeight,
  type ProgrammeDay,
  type ProgrammeExercise,
} from '@/lib/programmes';
import {
  DEFAULT_REST_SECONDS,
  REST_ADJUST_SECONDS,
  cancelRestOver,
  ensureRestTimerPermission,
  scheduleRestOver,
} from '@/lib/restTimer';
import {
  discardSession,
  fetchPreviousSets,
  fetchSession,
  fetchSessionSets,
  finishSession,
  saveSet,
  type LoggedSet,
} from '@/lib/sessions';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

/** What's in the boxes for one set. Kept as text so she can type freely. */
type SetEntry = { weight: string; reps: string; completed: boolean };

const setKey = (exerciseId: string, setNumber: number) => `${exerciseId}:${setNumber}`;

function setNumbers(item: ProgrammeExercise): number[] {
  return Array.from({ length: item.sets }, (_, index) => index + 1);
}

function parseWeight(text: string): number | null {
  const value = Number.parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function parseReps(text: string): number | null {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function formatWeightInput(kg: number | null): string {
  return kg === null ? '' : String(Number(kg.toFixed(2)));
}

/** Pre-fills each set: what's already logged this session, else last time, else the bottom of the rep range. */
function buildEntries(
  day: ProgrammeDay,
  logged: LoggedSet[],
  previous: Record<string, LoggedSet[]>
): Record<string, SetEntry> {
  const entries: Record<string, SetEntry> = {};
  for (const item of day.exercises) {
    const exerciseId = item.exercise.id;
    const previousSets = previous[exerciseId] ?? [];
    for (const setNumber of setNumbers(item)) {
      const saved = logged.find(
        (set) => set.exercise_id === exerciseId && set.set_number === setNumber
      );
      if (saved) {
        entries[setKey(exerciseId, setNumber)] = {
          weight: formatWeightInput(saved.weight_kg),
          reps: saved.reps === null ? '' : String(saved.reps),
          completed: saved.completed,
        };
        continue;
      }
      const last =
        previousSets.find((set) => set.set_number === setNumber) ??
        previousSets[previousSets.length - 1];
      entries[setKey(exerciseId, setNumber)] = {
        weight: usesWeight(item.exercise.equipment) ? formatWeightInput(last?.weight_kg ?? null) : '',
        reps: String(last?.reps ?? item.rep_min),
        completed: false,
      };
    }
  }
  return entries;
}

function formatPrevious(sets: LoggedSet[] | undefined): string | null {
  if (!sets || sets.length === 0) return null;
  const weights = new Set(sets.map((set) => set.weight_kg));
  const reps = sets.map((set) => set.reps ?? 0).join(', ');
  const [onlyWeight] = [...weights];
  if (weights.size === 1 && onlyWeight !== null) return `Last time: ${formatKg(onlyWeight)} × ${reps}`;
  if (weights.size === 1) return `Last time: ${reps} reps`;
  return `Last time: ${sets
    .map((set) => (set.weight_kg === null ? `${set.reps}` : `${formatKg(set.weight_kg)} × ${set.reps}`))
    .join(', ')}`;
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const equipment = getQuizAnswers(profile)?.equipment ?? null;

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [day, setDay] = useState<ProgrammeDay | null>(null);
  const [previous, setPrevious] = useState<Record<string, LoggedSet[]>>({});
  const [entries, setEntries] = useState<Record<string, SetEntry>>({});
  const [isFinishing, setIsFinishing] = useState(false);

  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const restNotificationId = useRef<string | null>(null);

  useEffect(() => {
    if (!equipment) return;
    let isCurrent = true;
    (async () => {
      try {
        const session = await fetchSession(id);
        const sessionDay = session?.programme_day_id
          ? await fetchProgrammeDay(session.programme_day_id, equipment)
          : null;
        if (!sessionDay) {
          if (isCurrent) setLoadState('not-found');
          return;
        }
        const exerciseIds = sessionDay.exercises.map((item) => item.exercise.id);
        const [logged, previousSets] = await Promise.all([
          fetchSessionSets(id),
          fetchPreviousSets(exerciseIds, id),
        ]);
        if (!isCurrent) return;
        setDay(sessionDay);
        setPrevious(previousSets);
        setEntries(buildEntries(sessionDay, logged, previousSets));
        setLoadState('ready');
      } catch {
        if (isCurrent) setLoadState('error');
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [id, equipment]);

  useEffect(() => {
    ensureRestTimerPermission().catch(() => {});
  }, []);

  useEffect(() => {
    if (restEndsAt === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= restEndsAt) {
        Vibration.vibrate([0, 300, 200, 300]);
        restNotificationId.current = null;
        setRestEndsAt(null);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [restEndsAt]);

  async function setRestTimer(endsAt: number | null) {
    const previousId = restNotificationId.current;
    restNotificationId.current = null;
    setNow(Date.now());
    setRestEndsAt(endsAt);
    await cancelRestOver(previousId).catch(() => {});
    if (endsAt !== null) {
      restNotificationId.current = await scheduleRestOver((endsAt - Date.now()) / 1000).catch(
        () => null
      );
    }
  }

  function adjustRest(seconds: number) {
    if (restEndsAt === null) return;
    const endsAt = restEndsAt + seconds * 1000;
    setRestTimer(endsAt - Date.now() >= 1000 ? endsAt : null);
  }

  function updateEntry(key: string, change: Partial<SetEntry>) {
    setEntries((current) => ({ ...current, [key]: { ...current[key], ...change } }));
  }

  function toLoggedSet(item: ProgrammeExercise, setNumber: number, entry: SetEntry): LoggedSet {
    return {
      session_id: id,
      exercise_id: item.exercise.id,
      set_number: setNumber,
      weight_kg: usesWeight(item.exercise.equipment) ? parseWeight(entry.weight) : null,
      reps: parseReps(entry.reps),
      completed: entry.completed,
    };
  }

  async function toggleSet(item: ProgrammeExercise, setNumber: number) {
    const key = setKey(item.exercise.id, setNumber);
    const entry = entries[key];
    const completing = !entry.completed;
    const weighted = usesWeight(item.exercise.equipment);

    if (completing) {
      const reps = parseReps(entry.reps);
      if (reps === null || reps < 1) {
        Alert.alert('How many reps?', 'Add the number of reps you did, then tick the set.');
        return;
      }
      if (weighted && parseWeight(entry.weight) === null) {
        Alert.alert('What weight?', 'Add the weight you used in kg, then tick the set.');
        return;
      }
    }

    const updated = { ...entry, completed: completing };
    const before = entries;
    setEntries((current) => {
      const next = { ...current, [key]: updated };
      // Carry a newly entered weight on to the following sets that don't have one yet.
      if (completing && weighted) {
        for (const later of setNumbers(item).filter((n) => n > setNumber)) {
          const laterKey = setKey(item.exercise.id, later);
          if (!next[laterKey].completed && next[laterKey].weight === '') {
            next[laterKey] = { ...next[laterKey], weight: entry.weight };
          }
        }
      }
      return next;
    });
    if (completing) setRestTimer(Date.now() + DEFAULT_REST_SECONDS * 1000);

    try {
      await saveSet(toLoggedSet(item, setNumber, updated));
    } catch {
      setEntries(before);
      if (completing) setRestTimer(null);
      Alert.alert('That set didn’t save', 'Check your connection and try again.');
    }
  }

  /** Saves edits to a set that's already ticked. */
  async function saveEdit(item: ProgrammeExercise, setNumber: number) {
    const entry = entries[setKey(item.exercise.id, setNumber)];
    if (!entry?.completed) return;
    try {
      await saveSet(toLoggedSet(item, setNumber, entry));
    } catch {
      Alert.alert('That change didn’t save', 'Check your connection and try again.');
    }
  }

  async function finish() {
    setIsFinishing(true);
    try {
      await finishSession(id);
      await setRestTimer(null);
      router.back();
      Alert.alert('Session saved', 'Nice work. That’s another one done.');
    } catch {
      setIsFinishing(false);
      Alert.alert('Couldn’t finish the session', 'Check your connection and try again.');
    }
  }

  async function discard() {
    setIsFinishing(true);
    try {
      await discardSession(id);
      await setRestTimer(null);
      router.back();
    } catch {
      setIsFinishing(false);
      Alert.alert('Couldn’t discard the session', 'Check your connection and try again.');
    }
  }

  function confirmDiscard() {
    Alert.alert('Discard this session?', 'Any sets you’ve ticked in it will be deleted.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: discard },
    ]);
  }

  const totalSets = day?.exercises.reduce((sum, item) => sum + item.sets, 0) ?? 0;
  const doneSets = Object.values(entries).filter((entry) => entry.completed).length;

  function confirmFinish() {
    if (doneSets === 0) {
      Alert.alert(
        'No sets ticked yet',
        'Tick off the sets you’ve done, or discard this session if you didn’t train.',
        [
          { text: 'Keep going', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: discard },
        ]
      );
      return;
    }
    if (doneSets < totalSets) {
      Alert.alert(
        'Finish session?',
        `You’ve done ${doneSets} of ${totalSets} sets. That’s fine: only the sets you ticked are saved.`,
        [
          { text: 'Keep going', style: 'cancel' },
          { text: 'Finish', onPress: finish },
        ]
      );
      return;
    }
    finish();
  }

  if (loadState !== 'ready' || !day) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <Text style={styles.message}>
            {loadState === 'not-found'
              ? 'We couldn’t find this session.'
              : 'We couldn’t load this session. Check your connection and try again.'}
          </Text>
        )}
      </View>
    );
  }

  const restRemaining = restEndsAt === null ? 0 : (restEndsAt - now) / 1000;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (restEndsAt === null ? 32 : 140) },
        ]}
        keyboardShouldPersistTaps="handled">
        <View>
          <Text style={styles.title}>{day.name}</Text>
          <Text style={styles.progress}>
            {doneSets} of {totalSets} sets done
          </Text>
        </View>

        {day.exercises.map((item) => {
          const weighted = usesWeight(item.exercise.equipment);
          const previousText = formatPrevious(previous[item.exercise.id]);
          return (
            <View key={item.position} style={styles.card}>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })
                }
                style={({ pressed }) => [styles.exerciseHeader, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityHint="Shows how to do this exercise">
                <View style={styles.flex}>
                  <Text style={styles.exerciseName}>{item.exercise.name}</Text>
                  <Text style={styles.exerciseDetail}>{formatSetsAndReps(item)}</Text>
                  {previousText && <Text style={styles.previous}>{previousText}</Text>}
                </View>
                <Ionicons name="information-circle-outline" size={24} color={colours.accent} />
              </Pressable>

              <View style={styles.columnLabels}>
                <Text style={[styles.columnLabel, styles.setColumn]}>Set</Text>
                <Text style={[styles.columnLabel, styles.flex]}>{weighted ? 'kg' : ''}</Text>
                <Text style={[styles.columnLabel, styles.flex]}>Reps</Text>
                <View style={styles.checkColumn} />
              </View>

              {setNumbers(item).map((setNumber) => {
                const key = setKey(item.exercise.id, setNumber);
                const entry = entries[key];
                return (
                  <View key={key} style={styles.setRow}>
                    <Text style={[styles.setNumber, styles.setColumn]}>{setNumber}</Text>
                    {weighted ? (
                      <TextInput
                        style={[styles.input, styles.flex, entry.completed && styles.inputDone]}
                        value={entry.weight}
                        onChangeText={(text) => updateEntry(key, { weight: text })}
                        onEndEditing={() => saveEdit(item, setNumber)}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        placeholder="–"
                        placeholderTextColor={colours.textMuted}
                        accessibilityLabel={`Set ${setNumber} weight in kilograms`}
                      />
                    ) : (
                      <Text style={[styles.noWeight, styles.flex]}>
                        {item.exercise.equipment === 'band' ? 'Band' : 'Bodyweight'}
                      </Text>
                    )}
                    <TextInput
                      style={[styles.input, styles.flex, entry.completed && styles.inputDone]}
                      value={entry.reps}
                      onChangeText={(text) => updateEntry(key, { reps: text })}
                      onEndEditing={() => saveEdit(item, setNumber)}
                      keyboardType="number-pad"
                      selectTextOnFocus
                      accessibilityLabel={`Set ${setNumber} reps`}
                    />
                    <Pressable
                      onPress={() => toggleSet(item, setNumber)}
                      style={({ pressed }) => [
                        styles.check,
                        entry.completed && styles.checkDone,
                        pressed && styles.pressed,
                      ]}
                      hitSlop={4}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: entry.completed }}
                      accessibilityLabel={`Set ${setNumber} done`}>
                      <Ionicons
                        name="checkmark"
                        size={28}
                        color={entry.completed ? colours.surface : colours.accent}
                      />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          );
        })}

        <Pressable
          style={({ pressed }) => [styles.finishButton, (pressed || isFinishing) && styles.pressed]}
          onPress={confirmFinish}
          disabled={isFinishing}
          accessibilityRole="button">
          {isFinishing ? (
            <ActivityIndicator color={colours.surface} />
          ) : (
            <Text style={styles.finishText}>Finish session</Text>
          )}
        </Pressable>
        <Pressable
          style={styles.link}
          onPress={confirmDiscard}
          disabled={isFinishing}
          accessibilityRole="button">
          <Text style={styles.linkText}>Discard session</Text>
        </Pressable>

        <Text style={styles.disclaimer}>
          General fitness guidance, not medical advice. Stop if anything hurts.
        </Text>
      </ScrollView>

      {restEndsAt !== null && (
        <View style={[styles.restBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.restClock}>
            <Text style={styles.restLabel}>Rest</Text>
            <Text style={styles.restTime}>{formatClock(restRemaining)}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.restButton, pressed && styles.pressed]}
            onPress={() => adjustRest(-REST_ADJUST_SECONDS)}
            accessibilityRole="button"
            accessibilityLabel={`${REST_ADJUST_SECONDS} seconds less rest`}>
            <Text style={styles.restButtonText}>−{REST_ADJUST_SECONDS}s</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.restButton, pressed && styles.pressed]}
            onPress={() => adjustRest(REST_ADJUST_SECONDS)}
            accessibilityRole="button"
            accessibilityLabel={`${REST_ADJUST_SECONDS} seconds more rest`}>
            <Text style={styles.restButtonText}>+{REST_ADJUST_SECONDS}s</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.restButton, styles.skipButton, pressed && styles.pressed]}
            onPress={() => setRestTimer(null)}
            accessibilityRole="button">
            <Text style={[styles.restButtonText, styles.skipText]}>Skip</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colours.background,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colours.background,
  },
  message: {
    fontSize: 17,
    color: colours.textMuted,
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colours.text,
  },
  progress: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
    marginTop: 4,
  },
  card: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: colours.surface,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  exerciseName: {
    fontSize: 19,
    fontWeight: '700',
    color: colours.text,
  },
  exerciseDetail: {
    fontSize: 15,
    color: colours.text,
    marginTop: 2,
  },
  previous: {
    fontSize: 14,
    color: colours.accent,
    marginTop: 2,
  },
  columnLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  columnLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colours.textMuted,
    textAlign: 'center',
  },
  setColumn: {
    width: 32,
  },
  checkColumn: {
    width: 56,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  setNumber: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.textMuted,
    textAlign: 'center',
  },
  input: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.background,
    fontSize: 20,
    fontWeight: '600',
    color: colours.text,
    textAlign: 'center',
  },
  inputDone: {
    borderColor: colours.accentSoft,
    backgroundColor: colours.accentSoft,
  },
  noWeight: {
    fontSize: 15,
    color: colours.textMuted,
    textAlign: 'center',
  },
  check: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  checkDone: {
    backgroundColor: colours.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  finishButton: {
    minHeight: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
    marginTop: 8,
  },
  finishText: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.surface,
  },
  link: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.textMuted,
  },
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    textAlign: 'center',
  },
  restBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colours.text,
  },
  restClock: {
    flex: 1,
  },
  restLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colours.accentSoft,
  },
  restTime: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.surface,
    fontVariant: ['tabular-nums'],
  },
  restButton: {
    minWidth: 60,
    height: 52,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  restButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.surface,
  },
  skipButton: {
    backgroundColor: colours.accent,
  },
  skipText: {
    color: colours.surface,
  },
});
