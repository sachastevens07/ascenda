import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/constants/theme';
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
  const { colours } = useTheme();
  const { active, nextSet, restEndsAt } = useWorkout();
  const now = useNow(active !== null, 500);
  if (!active) return null;

  const isResting = restEndsAt !== null && restEndsAt > now;
  const elapsed = formatClock((now - active.startedAt) / 1000);
  const rest = isResting ? formatClock(Math.ceil((restEndsAt - now) / 1000)) : null;
  return (
    <Pressable
      onPress={() =>
        active.source === 'stretch'
          ? router.push({ pathname: '/stretches/play', params: { sessionId: active.sessionId } })
          : router.push({ pathname: '/session/[id]', params: { id: active.sessionId } })
      }
      style={({ pressed }) => [
        styles.bar,
        { backgroundColor: colours.ink },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={[
        `Workout in progress: ${active.dayName}, ${elapsed}`,
        nextSet
          ? `Next: ${nextSet.exerciseName}, ${describeSet(nextSet)}`
          : active.source === 'stretch'
            ? 'Tap to continue your stretch'
            : 'All sets done',
        rest ? `Rest ${rest}` : null,
        'Go back to your workout',
      ]
        .filter(Boolean)
        .join('. ')}>
      <View style={styles.row}>
        <View style={[styles.liveDot, { backgroundColor: colours.accent }]} />
        <Text style={[styles.dayName, { color: colours.bg }]}>{active.dayName}</Text>
        <Text style={[styles.elapsed, { color: colours.bg }]}>{elapsed}</Text>
        <Ionicons name="chevron-up" size={18} color={colours.bg} />
      </View>

      {nextSet ? (
        <>
          <Text style={[styles.exercise, { color: colours.bg }]}>
            <Text style={[styles.nextLabel, { color: colours.brandSoft }]}>Next: </Text>
            {nextSet.exerciseName}
          </Text>
          <View style={styles.row}>
            <Text style={[styles.set, { color: colours.brandSoft }]}>{describeSet(nextSet)}</Text>
            {rest && <RestPill time={rest} />}
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <Text style={[styles.set, { color: colours.brandSoft }]}>
            {active.source === 'stretch' ? 'Tap to continue your stretch.' : 'All sets done. Tap to finish.'}
          </Text>
          {rest && <RestPill time={rest} />}
        </View>
      )}
    </Pressable>
  );
}

function RestPill({ time }: { time: string }) {
  const { colours } = useTheme();
  return (
    <View style={[styles.rest, { backgroundColor: colours.brand }]}>
      <Text style={[styles.restLabel, { color: colours.onBrand }]}>Rest</Text>
      <Text style={[styles.restTime, { color: colours.onBrand }]}>{time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: 3,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
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
  },
  dayName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  elapsed: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  exercise: {
    fontSize: 15,
    fontWeight: '600',
  },
  nextLabel: {
    fontWeight: '400',
  },
  set: {
    flex: 1,
    fontSize: 14,
  },
  rest: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  restLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  restTime: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
