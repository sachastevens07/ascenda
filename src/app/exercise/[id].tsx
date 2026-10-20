import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colours } from '@/constants/theme';
import { EQUIPMENT_LABELS, MUSCLE_LABELS, fetchExercise, type Exercise } from '@/lib/exercises';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');

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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      {exercise.media_url ? (
        <Image
          source={{ uri: exercise.media_url }}
          style={styles.media}
          resizeMode="contain"
          accessibilityLabel={`${exercise.name} demonstration`}
        />
      ) : (
        <View style={[styles.media, styles.mediaPlaceholder]}>
          <Ionicons name="barbell-outline" size={48} color={colours.accent} />
          <Text style={styles.mediaPlaceholderText}>Demo image coming soon</Text>
        </View>
      )}

      <Text style={styles.title}>{exercise.name}</Text>

      <View style={styles.tags}>
        <Text style={[styles.tag, styles.tagPrimary]}>
          {MUSCLE_LABELS[exercise.primary_muscle]}
        </Text>
        {exercise.secondary_muscles.map((muscle) => (
          <Text key={muscle} style={styles.tag}>
            {MUSCLE_LABELS[muscle]}
          </Text>
        ))}
        <Text style={[styles.tag, styles.tagEquipment]}>
          {EQUIPMENT_LABELS[exercise.equipment]}
        </Text>
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
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 20,
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
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
});
