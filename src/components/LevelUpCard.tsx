import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colours } from '@/constants/theme';
import { ZONE_LABELS } from '@/lib/exercises';
import {
  nextLevel,
  type ChallengeExercise,
  type LevelChallenge,
} from '@/lib/levelUp';
import { LEVEL_LABELS, type Level } from '@/lib/profile';

type LevelUpCardProps = {
  challenge: LevelChallenge;
  level: Level;
  /** Hide the try while Quiet Mode is on — it lives in the next zone. */
  quietMode: boolean;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onLevelUp: () => void;
  onStay: () => void;
};

/** Offer to try one next-zone exercise, or to move up a level after two completions. */
export function LevelUpCard({
  challenge,
  level,
  quietMode,
  busy = false,
  onAccept,
  onDecline,
  onLevelUp,
  onStay,
}: LevelUpCardProps) {
  const upcoming = nextLevel(level);
  const zoneName = ZONE_LABELS[challenge.exercise.zone];

  if (quietMode && challenge.status === 'offered') {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>Optional</Text>
        <Text style={styles.title}>A try is waiting</Text>
        <Text style={styles.body}>
          When you turn Quiet Mode off, you can try one exercise from the {zoneName.toLowerCase()}.
          Only if you feel like it.
        </Text>
      </View>
    );
  }

  if (challenge.status === 'ready' && upcoming) {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>When you’re ready</Text>
        <Text style={styles.title}>Move up to {LEVEL_LABELS[upcoming]}?</Text>
        <Text style={styles.body}>
          You’ve done {challenge.exercise.name} twice. {LEVEL_LABELS[upcoming]} would add the{' '}
          {zoneName.toLowerCase()} to your usual sessions. You can stay here, or change your mind
          later from Profile.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed]}
          onPress={onLevelUp}
          disabled={busy}
          accessibilityRole="button">
          <Text style={styles.primaryText}>Move to {LEVEL_LABELS[upcoming]}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondary, (pressed || busy) && styles.pressed]}
          onPress={onStay}
          disabled={busy}
          accessibilityRole="button">
          <Text style={styles.secondaryText}>Stay at {LEVEL_LABELS[level]}</Text>
        </Pressable>
      </View>
    );
  }

  if (quietMode) return null;

  if (challenge.status === 'offered') {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>Optional</Text>
        <Text style={styles.title}>Try something from the {zoneName.toLowerCase()}?</Text>
        <Text style={styles.body}>
          You’ve done four sessions at your level. This is only if you feel like it — no rush, and
          you can say no.
        </Text>
        <ExerciseGuide exercise={challenge.exercise} />
        <Pressable
          style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed]}
          onPress={onAccept}
          disabled={busy}
          accessibilityRole="button">
          <Text style={styles.primaryText}>I’ll try it</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondary, (pressed || busy) && styles.pressed]}
          onPress={onDecline}
          disabled={busy}
          accessibilityRole="button">
          <Text style={styles.secondaryText}>Not this time</Text>
        </Pressable>
      </View>
    );
  }

  if (challenge.status === 'accepted') {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>In this session</Text>
        <Text style={styles.title}>{challenge.exercise.name}</Text>
        <Text style={styles.body}>
          Added from the {zoneName.toLowerCase()}. Skip it if you’d rather stay with what you know.
        </Text>
        <ExerciseGuide exercise={challenge.exercise} />
      </View>
    );
  }

  return null;
}

/** Location hint and form cues — the same “where to find it and what to do” copy as the library. */
export function ExerciseGuide({ exercise }: { exercise: ChallengeExercise }) {
  return (
    <View style={styles.guide}>
      <View style={styles.guideBlock}>
        <View style={styles.guideHeading}>
          <Ionicons name="location-outline" size={18} color={colours.accent} />
          <Text style={styles.guideTitle}>Where to find it</Text>
        </View>
        <Text style={styles.guideBody}>{exercise.location_hint}</Text>
      </View>
      <View style={styles.guideBlock}>
        <View style={styles.guideHeading}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colours.accent} />
          <Text style={styles.guideTitle}>What to do</Text>
        </View>
        {exercise.cues.map((cue, index) => (
          <View key={cue} style={styles.cue}>
            <Text style={styles.cueNumber}>{index + 1}</Text>
            <Text style={styles.guideBody}>{cue}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: colours.accentSoft,
    gap: 12,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colours.accent,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colours.text,
  },
  guide: {
    gap: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colours.surface,
  },
  guideBlock: {
    gap: 8,
  },
  guideHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  guideTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.text,
  },
  guideBody: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: colours.text,
  },
  cue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cueNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 13,
    fontWeight: '700',
    color: colours.accent,
    backgroundColor: colours.accentSoft,
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
  secondary: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  secondaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  pressed: {
    opacity: 0.7,
  },
});
