import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoverPhoto } from '@/components/CoverPhoto';
import { ProBadge, ProMark } from '@/components/ProBadge';
import { ProgressRing } from '@/components/ProgressRing';
import { colours } from '@/constants/theme';
import { coverForRoutine } from '@/lib/images';
import { openPaywall } from '@/lib/paywall';
import {
  describePathError,
  fetchPath,
  missingPathsMessage,
  type PathStep,
  type RoutinePath,
} from '@/lib/paths';
import { useSubscription } from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

export default function PathDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const subscription = useSubscription();
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
          <Text style={styles.message}>
            {loadState === 'not-found' ? 'We couldn’t find that path.' : (errorMessage ?? missingPathsMessage())}
          </Text>
        )}
      </View>
    );
  }

  const locked = path.is_pro && !subscription.isPro;
  const doneCount = path.steps.filter((step) => step.done).length;

  function openStep(step: PathStep) {
    if (locked && step.order > 1) {
      openPaywall('path');
      return;
    }
    if (step.routine.is_pro && !subscription.isPro) {
      openPaywall('routine');
      return;
    }
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
      <View style={styles.chipRow}>{path.is_pro ? <ProBadge /> : <Text style={styles.free}>Free</Text>}</View>
      <Text style={styles.title}>{path.name}</Text>
      <Text style={styles.body}>{path.description}</Text>
      <Text style={styles.meta}>
        {doneCount} of {path.steps.length} routines finished
      </Text>

      {path.steps.map((step, index) => {
        const stepLocked = locked && step.order > 1;
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
              <Text style={styles.stepOrder}>
                Step {step.order}
                {step.done ? ' · done' : step.current ? ' · now' : ''}
              </Text>
              <Text style={styles.stepName}>{step.routine.name}</Text>
              <Text style={styles.meta}>
                {step.routine.length_weeks} weeks · {step.routine.days_per_week} days / week
              </Text>
            </View>
            {stepLocked || step.routine.is_pro ? <ProBadge locked={stepLocked} compact /> : null}
          </Pressable>
        );
      })}

      {locked ? (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => openPaywall('path')}
          accessibilityRole="button">
          <ProMark locked textStyle={styles.buttonText}>
            Unlock the full path
          </ProMark>
        </Pressable>
      ) : path.nextRoutine ? (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() =>
            router.push({ pathname: '/routines/[id]', params: { id: path.nextRoutine!.id } } as Href)
          }
          accessibilityRole="button">
          <Text style={styles.buttonText}>See {path.nextRoutine.name}</Text>
        </Pressable>
      ) : (
        <Text style={styles.body}>You’ve finished every step on this path. That’s a big piece of work.</Text>
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
    fontSize: 17,
    lineHeight: 24,
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
    fontSize: 12,
    fontWeight: '700',
    color: colours.surface,
    backgroundColor: colours.accent,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colours.text,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    color: colours.textMuted,
  },
  meta: {
    fontSize: 14,
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colours.accent,
  },
  stepName: {
    fontSize: 18,
    fontWeight: '700',
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
    fontSize: 17,
    fontWeight: '700',
    color: colours.surface,
  },
  pressed: {
    opacity: 0.7,
  },
});
