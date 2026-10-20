import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colours } from '@/constants/theme';
import { formatKg } from '@/lib/programmes';
import { useNow, useWorkout } from '@/lib/workout';
import { formatClock, type NextSet } from '@/lib/workoutLog';

function describeNextSet(next: NextSet): string {
  const load =
    next.weightKg !== null && next.reps !== null
      ? `${formatKg(next.weightKg)} × ${next.reps}`
      : next.reps !== null
        ? `${next.reps} reps`
        : null;
  return [next.exerciseName, `Set ${next.setNumber}`, load].filter(Boolean).join(' · ');
}

/** Shown above the tabs while a workout is in progress. Tap to go back to it. */
export function WorkoutBar() {
  const { active, nextSet, restEndsAt } = useWorkout();
  const now = useNow(active !== null, 500);
  if (!active) return null;

  const isResting = restEndsAt !== null && restEndsAt > now;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/session/[id]', params: { id: active.sessionId } })}
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Workout in progress. Go back to your workout">
      <View style={styles.text}>
        <View style={styles.topRow}>
          <View style={styles.liveDot} />
          <Text style={styles.label} numberOfLines={1}>
            {active.dayName}
          </Text>
          <Text style={styles.elapsed}>{formatClock((now - active.startedAt) / 1000)}</Text>
        </View>
        <Text style={styles.next} numberOfLines={1}>
          {nextSet ? `Next: ${describeNextSet(nextSet)}` : 'All sets done. Tap to finish.'}
        </Text>
      </View>
      {isResting ? (
        <View style={styles.rest}>
          <Text style={styles.restLabel}>Rest</Text>
          <Text style={styles.restTime}>{formatClock(Math.ceil((restEndsAt - now) / 1000))}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-up" size={22} color={colours.surface} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 20,
    backgroundColor: colours.text,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    flex: 1,
  },
  topRow: {
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
  label: {
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
  next: {
    fontSize: 14,
    color: colours.accentSoft,
    marginTop: 3,
  },
  rest: {
    alignItems: 'center',
    minWidth: 64,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colours.accent,
  },
  restLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colours.accentSoft,
  },
  restTime: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.surface,
    fontVariant: ['tabular-nums'],
  },
});
