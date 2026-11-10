import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoverPhoto } from '@/components/CoverPhoto';
import { ProgressRing } from '@/components/ProgressRing';
import { AppText } from '@/components/ui/AppText';
import { colours } from '@/constants/theme';
import { routineCardDays } from '@/lib/contentRoutines';
import { coverForRoutine } from '@/lib/images';
import {
  describePathError,
  fetchPath,
  missingPathsMessage,
  type PathStep,
  type RoutinePath,
} from '@/lib/paths';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

export default function PathDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [path, setPath] = useState<RoutinePath | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      if (!id) {
        setLoadState('not-found');
        return;
      }
      fetchPath(id)
        .then((next) => {
          if (!isCurrent) return;
          setPath(next);
          setLoadState(next ? 'ready' : 'not-found');
        })
        .catch((error) => {
          if (!isCurrent) return;
          setErrorMessage(describePathError(error));
          setLoadState('error');
        });
      return () => {
        isCurrent = false;
      };
    }, [id])
  );

  if (loadState !== 'ready' || !path) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <AppText variant="body" style={styles.message}>
            {loadState === 'not-found' ? 'We couldn’t find that path.' : (errorMessage ?? missingPathsMessage())}
          </AppText>
        )}
      </View>
    );
  }

  const doneCount = path.steps.filter((step) => step.done).length;

  function openStep(step: PathStep) {
    router.push({ pathname: '/routines/[id]', params: { id: step.routine.id } } as Href);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}>
      <CoverPhoto
        cover={coverForRoutine({ id: path.id, cover: path.cover })}
        letter={path.name.slice(0, 1)}
        height={180}
        style={styles.cover}
      />
      <AppText variant="title1" style={styles.title}>
        {path.name}
      </AppText>
      <AppText variant="body" style={styles.body}>
        {path.description}
      </AppText>
      <AppText variant="bodySm" style={styles.meta}>
        {doneCount} of {path.steps.length} routines finished
      </AppText>

      {path.steps.map((step, index) => {
        return (
          <Pressable
            key={step.routine.id}
            onPress={() => openStep(step)}
            style={({ pressed }) => [styles.step, pressed && styles.pressed]}
            accessibilityRole="button">
            <View style={styles.rail}>
              <ProgressRing progress={step.done ? 1 : step.current ? 0.35 : 0} size={36} stroke={4} />
              {index < path.steps.length - 1 ? <View style={styles.railLine} /> : null}
            </View>
            <View style={styles.flex}>
              <AppText variant="eyebrow" style={styles.stepOrder}>
                Step {step.order}
                {step.done ? ' · done' : step.current ? ' · now' : ''}
              </AppText>
              <AppText variant="title3" style={styles.stepName}>
                {step.routine.name}
              </AppText>
              <AppText variant="bodySm" style={styles.meta}>
                {step.routine.length_weeks} weeks · {routineCardDays(step.routine)} days / week
              </AppText>
            </View>
          </Pressable>
        );
      })}

      {path.nextRoutine ? (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() =>
            router.push({ pathname: '/routines/[id]', params: { id: path.nextRoutine!.id } } as Href)
          }
          accessibilityRole="button">
          <AppText variant="bodyStrong" style={styles.buttonText}>
            See {path.nextRoutine.name}
          </AppText>
        </Pressable>
      ) : (
        <AppText variant="body" style={styles.body}>
          You’ve finished every step on this path. That’s a big piece of work.
        </AppText>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colours.background,
  },
  container: {
    padding: 24,
    paddingTop: 8,
    gap: 12,
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
  cover: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  chipRow: {
    flexDirection: 'row',
  },
  free: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    color: colours.surface,
    backgroundColor: colours.accent,
  },
  title: {
    color: colours.text,
  },
  body: {
    color: colours.textMuted,
  },
  meta: {
    color: colours.textMuted,
  },
  step: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  rail: {
    alignItems: 'center',
    width: 36,
  },
  railLine: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: colours.accentSoft,
    marginTop: 4,
  },
  flex: {
    flex: 1,
    paddingTop: 4,
  },
  stepOrder: {
    color: colours.accent,
  },
  stepName: {
    color: colours.text,
    marginTop: 2,
  },
  button: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
    marginTop: 8,
  },
  buttonText: {
    color: colours.surface,
  },
  pressed: {
    opacity: 0.7,
  },
});
