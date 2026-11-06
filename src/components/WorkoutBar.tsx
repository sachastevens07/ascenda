import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import { fillCopy, loggerCopy } from '@/lib/copy';
import { useNow, useWorkout } from '@/lib/workout';
import { formatClock } from '@/lib/workoutLog';

/** Shown above the tabs while a workout is in progress. Tap to go back to it. */
export function WorkoutBar() {
  const { colours } = useTheme();
  const { active, restEndsAt } = useWorkout();
  const now = useNow(active !== null && active.startedAt !== null, 500);
  if (!active) return null;

  const isResting = restEndsAt !== null && restEndsAt > now;
  const elapsed = active.startedAt === null ? '0:00' : formatClock((now - active.startedAt) / 1000);
  const time = isResting ? formatClock(Math.ceil((restEndsAt - now) / 1000)) : elapsed;
  const label = fillCopy(loggerCopy.mini_bar, {
    session_name: active.dayName,
    time: isResting ? `Rest ${time}` : time,
  });
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
      accessibilityLabel={`${label}. Go back to your workout`}>
      <View style={styles.row}>
        <View style={[styles.liveDot, { backgroundColor: colours.accent }]} />
        <AppText variant="bodySm" style={[styles.label, { color: colours.bg }]} numberOfLines={1}>
          {label}
        </AppText>
        <Ionicons name="chevron-up" size={18} color={colours.bg} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: 10,
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
  label: {
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
});
