import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
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
        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          Optional
        </AppText>
        <AppText variant="title3" style={{ color: colours.text }}>
          A try is waiting
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.text }}>
          When you turn Quiet Mode off, you can try one exercise from the {zoneName.toLowerCase()}.
          Only if you feel like it.
        </AppText>
      </View>
    );
  }

  if (challenge.status === 'ready' && upcoming) {
    return (
      <View style={styles.card}>
        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          When you’re ready
        </AppText>
        <AppText variant="title3" style={{ color: colours.text }}>
          Move up to {LEVEL_LABELS[upcoming]}?
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.text }}>
          You’ve done {challenge.exercise.name} twice. {LEVEL_LABELS[upcoming]} would add the{' '}
          {zoneName.toLowerCase()} to your usual sessions. You can stay here, or change your mind
          later from Profile.
        </AppText>
        <Pressable
          style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed]}
          onPress={onLevelUp}
          disabled={busy}
          accessibilityRole="button">
          <AppText variant="bodyStrong" style={{ color: colours.surface }}>
            Move to {LEVEL_LABELS[upcoming]}
          </AppText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondary, (pressed || busy) && styles.pressed]}
          onPress={onStay}
          disabled={busy}
          accessibilityRole="button">
          <AppText variant="bodyStrong" style={{ color: colours.accent }}>
            Stay at {LEVEL_LABELS[level]}
          </AppText>
        </Pressable>
      </View>
    );
  }

  if (quietMode) return null;

  if (challenge.status === 'offered') {
    return (
      <View style={styles.card}>
        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          Optional
        </AppText>
        <AppText variant="title3" style={{ color: colours.text }}>
          Try something from the {zoneName.toLowerCase()}?
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.text }}>
          You’ve done four sessions at your level. This is only if you feel like it. No rush, and
          you can say no.
        </AppText>
        <ExerciseGuide exercise={challenge.exercise} />
        <Pressable
          style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed]}
          onPress={onAccept}
          disabled={busy}
          accessibilityRole="button">
          <AppText variant="bodyStrong" style={{ color: colours.surface }}>
            I’ll try it
          </AppText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondary, (pressed || busy) && styles.pressed]}
          onPress={onDecline}
          disabled={busy}
          accessibilityRole="button">
          <AppText variant="bodyStrong" style={{ color: colours.accent }}>
            Not this time
          </AppText>
        </Pressable>
      </View>
    );
  }

  if (challenge.status === 'accepted') {
    return (
      <View style={styles.card}>
        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          In this session
        </AppText>
        <AppText variant="title3" style={{ color: colours.text }}>
          {challenge.exercise.name}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.text }}>
          Added from the {zoneName.toLowerCase()}. Skip it if you’d rather stay with what you know.
        </AppText>
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
          <AppText variant="bodyStrong" style={{ color: colours.text }}>
            Where to find it
          </AppText>
        </View>
        <AppText variant="bodySm" style={{ color: colours.text }}>
          {exercise.location_hint}
        </AppText>
      </View>
      <View style={styles.guideBlock}>
        <View style={styles.guideHeading}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colours.accent} />
          <AppText variant="bodyStrong" style={{ color: colours.text }}>
            What to do
          </AppText>
        </View>
        {exercise.cues.map((cue, index) => (
          <View key={cue} style={styles.cue}>
            <AppText variant="caption" style={styles.cueNumber}>
              {index + 1}
            </AppText>
            <AppText variant="bodySm" style={{ color: colours.text, flex: 1 }}>
              {cue}
            </AppText>
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
  secondary: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  pressed: {
    opacity: 0.7,
  },
});
