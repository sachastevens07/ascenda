import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colours } from '@/constants/theme';
import {
  EQUIPMENT_LABELS,
  EXERCISE_MEDIA_BUCKET,
  MUSCLE_LABELS,
  ZONE_LABELS,
  fetchExercise,
  type Exercise,
} from '@/lib/exercises';
import { getExerciseImageSource } from '@/lib/exerciseMedia';
import { setupStepsFor } from '@/lib/gymUnlocked';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import type { SlotExercise } from '@/lib/programmes';
import { fetchAlternatives } from '@/lib/swaps';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const mediaWidth = windowWidth - 40;
  const mediaHeight = Math.min(280, Math.round((mediaWidth * 3) / 4));
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [mediaFailed, setMediaFailed] = useState(false);
  const [swaps, setSwaps] = useState<SlotExercise[]>([]);

  useEffect(() => {
    let isCurrent = true;
    fetchExercise(id)
      .then((result) => {
        if (!isCurrent) return;
        setExercise(result);
        setLoadState(result ? 'ready' : 'not-found');
      })
      .catch(() => {
        if (isCurrent) setLoadState('error');
      });
    return () => {
      isCurrent = false;
    };
  }, [id]);

  useEffect(() => {
    if (!exercise) return;
    let isCurrent = true;
    fetchAlternatives(
      {
        id: exercise.id,
        name: exercise.name,
        primary_muscle: exercise.primary_muscle,
        equipment: exercise.equipment,
        zone: exercise.zone,
        weight_increase_kg: null,
      },
      answers?.equipment ?? 'full_gym',
      [exercise.id]
    )
      .then((options) => {
        if (isCurrent) setSwaps(options.alternatives);
      })
      .catch(() => {
        if (isCurrent) setSwaps([]);
      });
    return () => {
      isCurrent = false;
    };
  }, [exercise, answers?.equipment]);

  if (loadState !== 'ready' || !exercise) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <Text style={styles.message}>
            {loadState === 'not-found'
              ? 'We couldn’t find that exercise.'
              : 'We couldn’t load this exercise. Check your connection and try again.'}
          </Text>
        )}
      </View>
    );
  }

  const mediaSource = mediaFailed ? null : getExerciseImageSource(exercise);
  const setup = setupStepsFor(exercise);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      {mediaSource ? (
        <View style={[styles.media, { width: mediaWidth, height: mediaHeight }]}>
          <Image
            source={mediaSource}
            style={{ width: mediaWidth, height: mediaHeight }}
            resizeMode="cover"
            onError={() => setMediaFailed(true)}
            accessibilityLabel={`${exercise.name} demonstration`}
          />
        </View>
      ) : (
        <View style={[styles.media, styles.mediaPlaceholder, { width: mediaWidth, height: mediaHeight }]}>
          <Ionicons name="barbell-outline" size={48} color={colours.accent} />
          <Text style={styles.mediaPlaceholderText}>Demo image coming soon</Text>
          {__DEV__ && (
            <Text style={styles.mediaDevHint}>
              Upload {exercise.id}.jpg to the {EXERCISE_MEDIA_BUCKET} bucket
            </Text>
          )}
        </View>
      )}

      <View style={styles.firstTime}>
        <Text style={styles.firstTimeLabel}>First time</Text>
        <Text style={styles.firstTimeCopy}>
          Where to find it, how to set it up, what to do, and a swap if it’s taken.
        </Text>
      </View>

      <Text style={styles.title}>{exercise.name}</Text>

      <View style={styles.tags}>
        <Text style={[styles.tag, styles.tagPrimary]}>{MUSCLE_LABELS[exercise.primary_muscle]}</Text>
        {exercise.secondary_muscles.map((muscle) => (
          <Text key={muscle} style={styles.tag}>
            {MUSCLE_LABELS[muscle]}
          </Text>
        ))}
        <Text style={[styles.tag, styles.tagEquipment]}>{EQUIPMENT_LABELS[exercise.equipment]}</Text>
        <Text style={styles.tag}>{ZONE_LABELS[exercise.zone]}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Ionicons name="location-outline" size={20} color={colours.accent} />
          <Text style={styles.cardTitle}>Where to find it</Text>
        </View>
        <Text style={styles.body}>{exercise.location_hint}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Ionicons name="construct-outline" size={20} color={colours.accent} />
          <Text style={styles.cardTitle}>How to set it up</Text>
        </View>
        {setup.map((step, index) => (
          <View key={step} style={styles.cue}>
            <Text style={styles.cueNumber}>{index + 1}</Text>
            <Text style={[styles.body, styles.cueText]}>{step}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Ionicons name="checkmark-circle-outline" size={20} color={colours.accent} />
          <Text style={styles.cardTitle}>Form cues</Text>
        </View>
        {exercise.cues.map((cue, index) => (
          <View key={cue} style={styles.cue}>
            <Text style={styles.cueNumber}>{index + 1}</Text>
            <Text style={[styles.body, styles.cueText]}>{cue}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Ionicons name="swap-horizontal-outline" size={20} color={colours.accent} />
          <Text style={styles.cardTitle}>If it’s taken</Text>
        </View>
        <Text style={styles.body}>
          Pick one of these — same muscles, no need to wait. You can also swap from the logger.
        </Text>
        {swaps.length === 0 ? (
          <Text style={styles.muted}>We’ll suggest a swap here once the library has finished loading.</Text>
        ) : (
          swaps.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: option.id } } as Href)}
              style={({ pressed }) => [styles.swapRow, pressed && styles.pressed]}
              accessibilityRole="button">
              <View style={styles.flex}>
                <Text style={styles.swapName}>{option.name}</Text>
                <Text style={styles.muted}>
                  {EQUIPMENT_LABELS[option.equipment]} · {ZONE_LABELS[option.zone]}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colours.textMuted} />
            </Pressable>
          ))
        )}
      </View>

      <Text style={styles.disclaimer}>
        General fitness guidance, not medical advice. Stop if anything hurts.
      </Text>
    </ScrollView>
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
  media: {
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colours.surface,
  },
  mediaPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colours.accentSoft,
  },
  mediaPlaceholderText: {
    fontSize: 15,
    fontWeight: '600',
    color: colours.accent,
  },
  mediaDevHint: {
    fontSize: 12,
    color: colours.textMuted,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  firstTime: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: colours.accentSoft,
    gap: 4,
  },
  firstTimeLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colours.accent,
  },
  firstTimeCopy: {
    fontSize: 15,
    lineHeight: 21,
    color: colours.text,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colours.text,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 14,
    fontWeight: '600',
    color: colours.textMuted,
    backgroundColor: colours.surface,
  },
  tagPrimary: {
    color: colours.surface,
    backgroundColor: colours.accent,
  },
  tagEquipment: {
    color: colours.accent,
    backgroundColor: colours.accentSoft,
  },
  card: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: colours.surface,
    gap: 12,
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.text,
  },
  body: {
    fontSize: 17,
    lineHeight: 25,
    color: colours.text,
  },
  muted: {
    fontSize: 15,
    lineHeight: 22,
    color: colours.textMuted,
  },
  cue: {
    flexDirection: 'row',
    gap: 12,
  },
  cueNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 28,
    fontSize: 15,
    fontWeight: '700',
    color: colours.accent,
    backgroundColor: colours.accentSoft,
  },
  cueText: {
    flex: 1,
  },
  swapRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colours.border,
    paddingTop: 10,
  },
  swapName: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.text,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
});
