import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoverPhoto } from '@/components/CoverPhoto';
import { showDialog } from '@/components/Dialog';
import { colours } from '@/constants/theme';
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '@/lib/exercises';
import { coverForRoutine } from '@/lib/images';
import {
  describeCustomWorkoutError,
  duplicateRoutineDay,
  isFreeCustomWorkoutLimitError,
  isProRoutineDuplicateError,
} from '@/lib/customWorkouts';
import { openPaywall } from '@/lib/paywall';
import { formatDaysPerWeek } from '@/lib/profile';
import { formatSetsAndReps } from '@/lib/programmes';
import {
  DIFFICULTY_LABELS,
  ROUTINE_EQUIPMENT_LABELS,
  ROUTINE_GOAL_LABELS,
  currentEnrolmentWeek,
  describeRoutineError,
  fetchActiveEnrolment,
  fetchRoutine,
  firstDayOfRoutine,
  formatRestSeconds,
  groupRoutinePhases,
  missingRoutinesMessage,
  startRoutine,
  type Routine,
  type RoutineEnrolment,
} from '@/lib/routines';
import { useSubscription } from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

function describeHowItWorks(routine: Routine): string {
  const sessions = routine.length_weeks * routine.days_per_week;
  const phases = groupRoutinePhases(routine.weeks);
  const shape =
    phases.length === 1
      ? `The same ${routine.days_per_week} workouts each week.`
      : `${phases.length} stages, so the sessions change as you go.`;
  return `${routine.length_weeks} weeks, ${formatDaysPerWeek(routine.days_per_week)} a week, about ${routine.session_minutes} minutes a session. ${sessions} sessions in total. ${shape} When set 1 hits the top of the range, the app suggests a small increase next time.`;
}

export default function RoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const subscription = useSubscription();
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [enrolment, setEnrolment] = useState<RoutineEnrolment | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const [openDayId, setOpenDayId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      if (!id) {
        setLoadState('not-found');
        return;
      }
      setLoadState((state) => (state === 'ready' ? state : 'loading'));
      Promise.all([fetchRoutine(id), fetchActiveEnrolment()])
        .then(([next, active]) => {
          if (!isCurrent) return;
          setRoutine(next);
          setEnrolment(active);
          setErrorMessage(null);
          setLoadState(next ? 'ready' : 'not-found');
        })
        .catch((error) => {
          if (!isCurrent) return;
          setErrorMessage(describeRoutineError(error));
          setLoadState('error');
        });
      return () => {
        isCurrent = false;
      };
    }, [id])
  );

  useEffect(() => {
    if (!routine || subscription.isLoading || subscription.isPro) return;
    if (!routine.is_pro) return;
    openPaywall('routine');
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [routine, subscription.isLoading, subscription.isPro]);

  function requestStart() {
    if (!routine) return;
    if (enrolment?.routine_id === routine.id) return;
    if (routine.is_pro && !subscription.isPro) {
      openPaywall('routine');
      return;
    }
    const message = enrolment
      ? `This leaves ${enrolment.routine.name} and starts ${routine.name} from week 1.`
      : `${routine.name} starts today. Home will use this in the next step.`;
    showDialog(`Start ${routine.name}?`, message, [
      { text: 'Start routine', onPress: handleStart },
      { text: 'Not now', style: 'cancel' },
    ]);
  }

  async function handleStart() {
    if (!routine) return;
    setIsStarting(true);
    try {
      const next = await startRoutine(routine.id);
      setEnrolment(next);
    } catch (error) {
      showDialog('Couldn’t start the routine', describeRoutineError(error));
    } finally {
      setIsStarting(false);
    }
  }

  async function handleDuplicate() {
    if (!routine) return;
    if (routine.is_pro && !subscription.isPro) {
      openPaywall('routine');
      return;
    }
    const day = firstDayOfRoutine(routine);
    if (!day) {
      showDialog('Nothing to copy', 'This routine has no days yet.');
      return;
    }
    setIsDuplicating(true);
    try {
      const copy = await duplicateRoutineDay(
        routine,
        {
          name: day.name,
          exercises: day.exercises.map((item) => ({
            exercise: item.exercise,
            sets: item.sets,
            rep_min: item.rep_min,
            rep_max: item.rep_max,
          })),
        },
        subscription.isPro
      );
      router.push({ pathname: '/workouts/[id]', params: { id: copy.id } });
    } catch (error) {
      if (isProRoutineDuplicateError(error)) {
        openPaywall('routine');
        return;
      }
      if (isFreeCustomWorkoutLimitError(error)) {
        openPaywall('custom-limit');
        return;
      }
      showDialog('Couldn’t copy it', describeCustomWorkoutError(error));
    } finally {
      setIsDuplicating(false);
    }
  }

  if (loadState !== 'ready' || !routine) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <Text style={styles.message}>
            {loadState === 'not-found'
              ? 'We couldn’t find that routine.'
              : (errorMessage ?? missingRoutinesMessage())}
          </Text>
        )}
      </View>
    );
  }

  if (routine.is_pro && !subscription.isPro) {
    return (
      <View style={styles.centre}>
        <Text style={styles.message}>This plan is part of Pro.</Text>
      </View>
    );
  }

  const isCurrent = enrolment?.routine_id === routine.id;
  const details = [
    { name: 'Length', value: `${routine.length_weeks} weeks` },
    { name: 'Days each week', value: formatDaysPerWeek(routine.days_per_week) },
    { name: 'Session length', value: `About ${routine.session_minutes} minutes` },
    { name: 'Difficulty', value: DIFFICULTY_LABELS[routine.difficulty] },
    { name: 'Equipment', value: ROUTINE_EQUIPMENT_LABELS[routine.equipment] },
    { name: 'Goal', value: ROUTINE_GOAL_LABELS[routine.goal] },
    { name: 'Access', value: routine.is_pro ? 'Pro' : 'Free' },
  ];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}>
      <CoverPhoto
        cover={coverForRoutine(routine)}
        letter={routine.name.slice(0, 1)}
        height={280}
        style={styles.cover}
      />
      <View style={styles.chipRow}>
        <Text style={[styles.chip, !routine.is_pro && styles.chipFree]}>
          {routine.is_pro ? 'Pro' : 'Free'}
        </Text>
        {isCurrent && <Text style={[styles.chip, styles.chipCurrent]}>Current</Text>}
      </View>
      <Text style={styles.title}>{routine.name}</Text>
      <Text style={styles.body}>{routine.description}</Text>
      <View style={styles.tagRow}>
        {routine.tags.map((tag) => (
          <Text key={tag} style={styles.tag}>
            {tag}
          </Text>
        ))}
      </View>

      {isCurrent && enrolment && (
        <View style={styles.note}>
          <Text style={styles.noteTitle}>You’re on this plan</Text>
          <Text style={styles.noteBody}>
            Week {currentEnrolmentWeek(enrolment)} of {routine.length_weeks}. Logging still uses your
            programme on Home until the next step.
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Plan details</Text>
        {details.map((row) => (
          <View key={row.name} style={styles.detailRow}>
            <Text style={styles.detailName}>{row.name}</Text>
            <Text style={styles.detailValue}>{row.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>How this plan works</Text>
        <Text style={styles.bodyTight}>{describeHowItWorks(routine)}</Text>
      </View>

      <Text style={styles.sectionTitle}>Week-by-week plan</Text>
      {routine.weeks.map((week) => {
        const weekOpen = openWeek === week.week_number;
        return (
          <View key={week.id} style={styles.card}>
            <Pressable
              onPress={() => {
                setOpenWeek(weekOpen ? null : week.week_number);
                setOpenDayId(null);
              }}
              style={({ pressed }) => [styles.weekHeader, pressed && styles.pressed]}
              accessibilityRole="button">
              <View>
                <Text style={styles.cardTitle}>Week {week.week_number}</Text>
                <Text style={styles.dayLabel}>{week.days.length} days</Text>
              </View>
              <Ionicons
                name={weekOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colours.accent}
              />
            </Pressable>
            {weekOpen &&
              week.days.map((day) => {
                const dayOpen = openDayId === day.id;
                return (
                  <View key={day.id} style={styles.dayBlock}>
                    <Pressable
                      onPress={() => setOpenDayId(dayOpen ? null : day.id)}
                      style={({ pressed }) => [styles.weekHeader, pressed && styles.pressed]}
                      accessibilityRole="button">
                      <View>
                        <Text style={styles.dayName}>{day.name}</Text>
                        <Text style={styles.dayLabel}>
                          Day {day.day_number} · {day.exercises.length} exercises
                        </Text>
                      </View>
                      <Ionicons
                        name={dayOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colours.textMuted}
                      />
                    </Pressable>
                    {dayOpen &&
                      day.exercises.map((item) => (
                        <Pressable
                          key={`${day.id}-${item.position}`}
                          onPress={() =>
                            router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })
                          }
                          style={({ pressed }) => [styles.exerciseRow, pressed && styles.pressed]}
                          accessibilityRole="button">
                          <View style={styles.exerciseText}>
                            <Text style={styles.exerciseName}>{item.exercise.name}</Text>
                            <Text style={styles.exerciseDetail}>
                              {formatSetsAndReps(item)} · {formatRestSeconds(item.rest_seconds)}
                            </Text>
                            <Text style={styles.exerciseDetail}>
                              {MUSCLE_LABELS[item.exercise.primary_muscle]} ·{' '}
                              {EQUIPMENT_LABELS[item.exercise.equipment]}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color={colours.textMuted} />
                        </Pressable>
                      ))}
                  </View>
                );
              })}
          </View>
        );
      })}

      <Text style={styles.disclaimer}>
        General fitness guidance, not medical advice. Stop if anything hurts.
      </Text>

      <Pressable
        style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
        onPress={handleDuplicate}
        disabled={isDuplicating || isStarting}
        accessibilityRole="button">
        <Text style={styles.outlineButtonText}>
          {isDuplicating
            ? 'Copying…'
            : routine.is_pro && !subscription.isPro
              ? 'Duplicate with Pro'
              : 'Duplicate'}
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
        onPress={requestStart}
        disabled={isStarting || isCurrent}
        accessibilityRole="button">
        <Text style={styles.startButtonText}>
          {isCurrent
            ? 'This is your current routine'
            : isStarting
              ? 'Starting…'
              : routine.is_pro && !subscription.isPro
                ? 'Start with Pro'
                : 'Start routine'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colours.background,
  },
  container: {
    padding: 24,
    paddingTop: 8,
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
  cover: {
    marginHorizontal: -24,
    marginTop: -8,
    marginBottom: 20,
  },
  chipRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  chip: {
    fontSize: 13,
    fontWeight: '700',
    color: colours.accent,
    backgroundColor: colours.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    marginRight: 8,
  },
  chipFree: {
    color: colours.surface,
    backgroundColor: colours.accent,
  },
  chipCurrent: {
    color: colours.accent,
    backgroundColor: colours.background,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 8,
  },
  body: {
    fontSize: 17,
    lineHeight: 25,
    color: colours.text,
  },
  bodyTight: {
    fontSize: 16,
    lineHeight: 23,
    color: colours.text,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    marginBottom: 8,
  },
  tag: {
    fontSize: 13,
    fontWeight: '600',
    color: colours.textMuted,
    borderWidth: 1,
    borderColor: colours.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    marginRight: 8,
    marginBottom: 8,
  },
  note: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: colours.accentSoft,
    marginBottom: 16,
  },
  noteTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colours.accent,
    marginBottom: 4,
  },
  noteBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colours.text,
  },
  card: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: colours.surface,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 4,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  dayBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colours.border,
  },
  dayName: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.text,
  },
  detailRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colours.border,
  },
  detailName: {
    fontSize: 14,
    color: colours.textMuted,
  },
  detailValue: {
    fontSize: 17,
    fontWeight: '600',
    color: colours.text,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colours.text,
    marginTop: 8,
    marginBottom: 8,
  },
  phaseTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.accent,
    marginBottom: 10,
    marginTop: 4,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colours.textMuted,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colours.border,
  },
  exerciseText: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 17,
    fontWeight: '600',
    color: colours.text,
  },
  exerciseDetail: {
    fontSize: 15,
    color: colours.textMuted,
    marginTop: 2,
  },
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  outlineButton: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
    marginBottom: 12,
  },
  outlineButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  startButton: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
  },
  startButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.surface,
  },
  pressed: {
    opacity: 0.7,
  },
});
