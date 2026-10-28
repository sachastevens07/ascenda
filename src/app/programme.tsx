import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlockTargets } from '@/components/BlockTargets';
import { colours } from '@/constants/theme';
import { describeBlockPosition, ensureActiveBlock, type TrainingBlock } from '@/lib/blocks';
import { fetchFillLibrary, resolveDay } from '@/lib/levels';
import {
  EQUIPMENT_ACCESS_LABELS,
  formatDaysPerWeek,
  getQuizAnswers,
  useProfile,
  type QuizAnswers,
} from '@/lib/profile';
import { fetchProgramme, formatSetsAndReps, type Programme } from '@/lib/programmes';
import { useSubscription } from '@/lib/subscription';
import { exerciseFits, fetchUserSwaps } from '@/lib/swaps';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

function scheduleNote(answers: QuizAnswers, programme: Programme): string | null {
  const chosenDays = answers.days_per_week;
  if (chosenDays === 1) {
    return 'You chose 1 day a week, so do one session each week and alternate between the days below.';
  }
  if (chosenDays > programme.days_per_week && answers.experience === 'new') {
    return `You chose ${chosenDays} days a week. As you're new to lifting, this plan starts you on ${programme.days_per_week} days so your body can adapt. Once you've found your feet, change your experience in Profile to unlock more days.`;
  }
  if (chosenDays > programme.days_per_week) {
    return `You chose ${chosenDays} days a week. This plan has ${programme.days_per_week} training days so your body has time to recover. Rest days help you get stronger too.`;
  }
  return null;
}

export default function ProgrammeScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const programmeId = profile?.programme_id ?? null;
  const equipment = answers?.equipment ?? null;
  const { isPro } = useSubscription();
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [block, setBlock] = useState<TrainingBlock | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  useEffect(() => {
    if (!programmeId || !equipment) {
      setLoadState('not-found');
      return;
    }
    let isCurrent = true;
    setLoadState('loading');
    Promise.all([fetchProgramme(programmeId, equipment), fetchUserSwaps(equipment), fetchFillLibrary()])
      .then(async ([result, swaps, library]) => {
        if (!isCurrent) return;
        const resolved = result && {
          ...result,
          days: result.days.map((day) =>
            resolveDay(day, swaps[day.id] ?? {}, equipment, 4, false, library)
          ),
        };
        setProgramme(resolved);
        if (resolved) {
          const nextBlock = await ensureActiveBlock(resolved, 4, equipment).catch(() => null);
          if (isCurrent) setBlock(nextBlock);
        }
        setLoadState(result ? 'ready' : 'not-found');
      })
      .catch(() => {
        if (isCurrent) setLoadState('error');
      });
    return () => {
      isCurrent = false;
    };
  }, [programmeId, equipment]);

  if (loadState !== 'ready' || !programme || !answers) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <Text style={styles.message}>
            {loadState === 'not-found'
              ? 'You don’t have a programme yet.'
              : 'We couldn’t load your programme. Check your connection and try again.'}
          </Text>
        )}
      </View>
    );
  }

  const note = scheduleNote(answers, programme);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      <View>
        <Text style={styles.title}>{programme.name}</Text>
        <Text style={styles.subtitle}>
          {formatDaysPerWeek(programme.days_per_week)} a week ·{' '}
          {EQUIPMENT_ACCESS_LABELS[answers.equipment]}
        </Text>
        {isPro && block && (
          <Text style={styles.blockPosition}>{describeBlockPosition(block)}</Text>
        )}
      </View>
      {isPro && block && <BlockTargets block={block} />}
      <Text style={styles.body}>{programme.description}</Text>
      {note && <Text style={styles.note}>{note}</Text>}

      {programme.days.map((day) => (
        <View key={day.id} style={styles.card}>
          <Text style={styles.dayLabel}>Day {day.day_number}</Text>
          <Text style={styles.cardTitle}>{day.name}</Text>
          {day.exercises.map((item) => (
            <Pressable
              key={item.position}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })}
              style={({ pressed }) => [styles.exerciseRow, pressed && styles.pressed]}
              accessibilityRole="button">
              <View style={styles.exerciseText}>
                <Text style={styles.exerciseName}>{item.exercise.name}</Text>
                {item.original &&
                  exerciseFits(item.original, answers.equipment) && (
                    <Text style={styles.swappedFrom}>Instead of {item.original.name}</Text>
                  )}
                <Text style={styles.exerciseDetail}>{formatSetsAndReps(item)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colours.textMuted} />
            </Pressable>
          ))}
        </View>
      ))}

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
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colours.text,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
    marginTop: 4,
  },
  blockPosition: {
    fontSize: 15,
    fontWeight: '600',
    color: colours.text,
    marginTop: 6,
  },
  body: {
    fontSize: 17,
    lineHeight: 25,
    color: colours.text,
  },
  note: {
    fontSize: 15,
    lineHeight: 22,
    color: colours.text,
    padding: 16,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colours.accentSoft,
  },
  card: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: colours.surface,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colours.textMuted,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
    marginTop: 2,
    marginBottom: 4,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colours.border,
  },
  pressed: {
    opacity: 0.6,
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
  swappedFrom: {
    fontSize: 14,
    color: colours.accent,
    marginTop: 1,
  },
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
});
