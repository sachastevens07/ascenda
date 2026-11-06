import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseMediaPlayer } from '@/components/ExerciseMediaPlayer';
import { equipmentIconName, RelatedLearn } from '@/components/ui';
import { AppText } from '@/components/ui/AppText';
import { colours } from '@/constants/theme';
import { useDevTools } from '@/lib/devFlags';
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
  const { showDevTools } = useDevTools();
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
          <AppText variant="body" style={styles.message}>
            {loadState === 'not-found'
              ? 'We couldn’t find that exercise.'
              : 'We couldn’t load this exercise. Check your connection and try again.'}
          </AppText>
        )}
      </View>
    );
  }

  const mediaSource = mediaFailed ? null : getExerciseImageSource(exercise);
  const setup = setupStepsFor(exercise);
  const mediaFallback = mediaSource ? (
    <Image
      source={mediaSource}
      style={{ width: mediaWidth, height: mediaHeight }}
      resizeMode="cover"
      onError={() => setMediaFailed(true)}
      accessibilityLabel={`${exercise.name} demonstration`}
    />
  ) : (
    <View style={[styles.mediaPlaceholder, { width: mediaWidth, height: mediaHeight }]}>
      <MaterialCommunityIcons
        name={equipmentIconName(exercise.equipment)}
        size={48}
        color={colours.accent}
        accessibilityLabel={EQUIPMENT_LABELS[exercise.equipment]}
      />
      <AppText variant="bodySm" style={styles.mediaPlaceholderText}>
        Demo image coming soon
      </AppText>
      {showDevTools && (
        <AppText variant="caption" style={styles.mediaDevHint}>
          Upload {exercise.id}.jpg to the {EXERCISE_MEDIA_BUCKET} bucket
        </AppText>
      )}
    </View>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      <View style={[styles.media, { width: mediaWidth }]}>
        <ExerciseMediaPlayer
          exerciseId={exercise.id}
          cues={exercise.cues}
          width={mediaWidth}
          height={mediaHeight}
          fallback={mediaFallback}
        />
      </View>

      <View style={styles.firstTime}>
        <AppText variant="eyebrow" style={styles.firstTimeLabel}>
          First time
        </AppText>
        <AppText variant="bodySm" style={styles.firstTimeCopy}>
          Where to find it, how to set it up, what to do, and a swap if it’s taken.
        </AppText>
      </View>

      <AppText variant="title1" style={styles.title}>
        {exercise.name}
      </AppText>

      <View style={styles.tags}>
        <AppText variant="bodySm" style={[styles.tag, styles.tagPrimary]}>
          {MUSCLE_LABELS[exercise.primary_muscle]}
        </AppText>
        {exercise.secondary_muscles.map((muscle) => (
          <AppText key={muscle} variant="bodySm" style={styles.tag}>
            {MUSCLE_LABELS[muscle]}
          </AppText>
        ))}
        <AppText variant="bodySm" style={[styles.tag, styles.tagEquipment]}>
          {EQUIPMENT_LABELS[exercise.equipment]}
        </AppText>
        <AppText variant="bodySm" style={styles.tag}>
          {ZONE_LABELS[exercise.zone]}
        </AppText>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Ionicons name="location-outline" size={20} color={colours.accent} />
          <AppText variant="title3" style={styles.cardTitle}>
            Where to find it
          </AppText>
        </View>
        <AppText variant="body" style={styles.body}>
          {exercise.location_hint}
        </AppText>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Ionicons name="construct-outline" size={20} color={colours.accent} />
          <AppText variant="title3" style={styles.cardTitle}>
            How to set it up
          </AppText>
        </View>
        {setup.map((step, index) => (
          <View key={step} style={styles.cue}>
            <AppText variant="bodySm" style={styles.cueNumber}>
              {index + 1}
            </AppText>
            <AppText variant="body" style={[styles.body, styles.cueText]}>
              {step}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Ionicons name="checkmark-circle-outline" size={20} color={colours.accent} />
          <AppText variant="title3" style={styles.cardTitle}>
            Form cues
          </AppText>
        </View>
        {exercise.cues.map((cue, index) => (
          <View key={cue} style={styles.cue}>
            <AppText variant="bodySm" style={styles.cueNumber}>
              {index + 1}
            </AppText>
            <AppText variant="body" style={[styles.body, styles.cueText]}>
              {cue}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Ionicons name="swap-horizontal-outline" size={20} color={colours.accent} />
          <AppText variant="title3" style={styles.cardTitle}>
            If it’s taken
          </AppText>
        </View>
        <AppText variant="body" style={styles.body}>
          Pick one of these: same muscles, no need to wait. You can also swap from the logger.
        </AppText>
        {swaps.length === 0 ? (
          <AppText variant="bodySm" style={styles.muted}>
            We’ll suggest a swap here once the library has finished loading.
          </AppText>
        ) : (
          swaps.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: option.id } } as Href)}
              style={({ pressed }) => [styles.swapRow, pressed && styles.pressed]}
              accessibilityRole="button">
              <View style={styles.flex}>
                <AppText variant="bodyStrong" style={styles.swapName}>
                  {option.name}
                </AppText>
                <AppText variant="bodySm" style={styles.muted}>
                  {EQUIPMENT_LABELS[option.equipment]} · {ZONE_LABELS[option.zone]}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colours.textMuted} />
            </Pressable>
          ))
        )}
      </View>

      <RelatedLearn exerciseId={exercise.id} />
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
    color: colours.textMuted,
    textAlign: 'center',
  },
  media: {
    alignSelf: 'center',
  },
  mediaPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colours.accentSoft,
  },
  mediaPlaceholderText: {
    color: colours.accent,
  },
  mediaDevHint: {
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
    color: colours.accent,
  },
  firstTimeCopy: {
    color: colours.text,
  },
  title: {
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
    color: colours.text,
  },
  body: {
    color: colours.text,
  },
  muted: {
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
    color: colours.text,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
