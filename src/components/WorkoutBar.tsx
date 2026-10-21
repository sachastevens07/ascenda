import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colours } from '@/constants/theme';
import { formatKg } from '@/lib/programmes';
import { useNow, useWorkout } from '@/lib/workout';
import { formatClock, type NextSet } from '@/lib/workoutLog';

/** "Set 2 · 12 kg × 8", "Set 2 · 10 reps". */
function describeSet(next: NextSet): string {
  const load =
    next.weightKg !== null && next.reps !== null
      ? `${formatKg(next.weightKg)} × ${next.reps}`
      : next.reps !== null
        ? `${next.reps} reps`
        : null;
  return [`Set ${next.setNumber}`, load].filter(Boolean).join(' · ');
}

/** Shown above the tabs while a workout is in progress. Tap to go back to it. */
export function WorkoutBar() {
  const { active, nextSet, restEndsAt } = useWorkout();
  const now = useNow(active !== null, 500);
  if (!active) return null;

  const isResting = restEndsAt !== null && restEndsAt > now;
  const elapsed = formatClock((now - active.startedAt) / 1000);
  const rest = isResting ? formatClock(Math.ceil((restEndsAt - now) / 1000)) : null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/session/[id]', params: { id: active.sessionId } })}
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={[
        `Workout in progress: ${active.dayName}, ${elapsed}`,
        nextSet ? `Next: ${nextSet.exerciseName}, ${describeSet(nextSet)}` : 'All sets done',
        rest ? `Rest ${rest}` : null,
        'Go back to your workout',
      ]
        .filter(Boolean)
        .join('. ')}>
      <View style={styles.row}>
        <View style={styles.liveDot} />
        <Text style={styles.dayName}>{active.dayName}</Text>
        <Text style={styles.elapsed}>{elapsed}</Text>
        <Ionicons name="chevron-up" size={20} color={colours.accentSoft} />
      </View>

      {nextSet ? (
        <>
          <Text style={styles.exercise}>
            <Text style={styles.nextLabel}>Next: </Text>
            {nextSet.exerciseName}
          </Text>
          <View style={styles.row}>
            <Text style={styles.set}>{describeSet(nextSet)}</Text>
            {rest && <RestPill time={rest} />}
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <Text style={styles.set}>All sets done. Tap to finish.</Text>
          {rest && <RestPill time={rest} />}
        </View>
      )}
    </Pressable>
  );
}

function RestPill({ time }: { time: string }) {
  return (
    <View style={styles.rest}>
      <Text style={styles.restLabel}>Rest</Text>
      <Text style={styles.restTime}>{time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 20,
    backgroundColor: colours.text,
  },
  pressed: {
    opacity: 0.85,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colours.accentSoft,
  },
  dayName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colours.surface,
  },
  elapsed: {
    fontSize: 15,
    fontWeight: '700',
    color: colours.accentSoft,
    fontVariant: ['tabular-nums'],
  },
  exercise: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.surface,
  },
  nextLabel: {
    fontWeight: '400',
    color: colours.accentSoft,
  },
  set: {
    flex: 1,
    fontSize: 15,
    color: colours.accentSoft,
  },
  rest: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colours.accent,
  },
  restLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colours.accentSoft,
  },
  restTime: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.surface,
    fontVariant: ['tabular-nums'],
  },
});
