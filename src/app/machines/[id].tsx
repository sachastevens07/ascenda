import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, DetailLayout, PrimaryButton, RelatedLearn, SafetyNotice, SecondaryButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { aiCopy, fillCopy, machineCopy } from '@/lib/copy';
import {
  machineExercises,
  machineGuide,
} from '@/lib/machineGuides';
import { useWorkout } from '@/lib/workout';

export default function MachineGuideScreen() {
  const { id, scanned, people } = useLocalSearchParams<{ id: string; scanned?: string; people?: string }>();
  const insets = useSafeAreaInsets();
  const { colours, spacing, radius } = useTheme();
  const workout = useWorkout();
  const [picking, setPicking] = useState(false);
  const fromScan = scanned === '1' || scanned === 'true';
  const guide = machineGuide(Array.isArray(id) ? id[0] : id);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/learn' as Href);
  }

  if (!guide) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg, paddingTop: insets.top }]}>
        <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
          {machineCopy.not_found}
        </AppText>
      </View>
    );
  }

  const exercises = machineExercises(guide);
  const machineName = guide.name;
  const useTitle = guide.useKind === 'start' ? machineCopy.start : machineCopy.use;
  const active = workout.active;
  const canAddToSession =
    Boolean(active) && active?.source !== 'cardio' && active?.source !== 'stretch';

  function addExercise(slug: string) {
    if (!active || !canAddToSession) {
      showDialog(machineCopy.add_today, machineCopy.no_session);
      return;
    }
    setPicking(false);
    router.push({
      pathname: '/session/[id]',
      params: { id: active.sessionId, addExercise: slug },
    } as Href);
  }

  function handleAdd() {
    if (!canAddToSession) {
      showDialog(machineCopy.add_today, machineCopy.no_session);
      return;
    }
    if (exercises.length === 0) return;
    if (exercises.length === 1) {
      addExercise(exercises[0].slug);
      return;
    }
    setPicking(true);
  }

  async function shareUnlock() {
    try {
      await Share.share({
        message: fillCopy(machineCopy.share_message, { machine: machineName.toLowerCase() }),
        title: machineCopy.share,
      });
    } catch {
      showDialog(machineCopy.share, 'You can still screenshot the guide name.');
    }
  }

  return (
    <DetailLayout
      cover={null}
      coverSlug={guide.imageSlug}
      letter={guide.name}
      title={guide.name}
      eyebrow={machineCopy.eyebrow}
      onBack={goBack}
      sticky={
        fromScan ? (
          <View style={{ gap: 10 }}>
            {exercises.length > 0 ? (
              <PrimaryButton label={machineCopy.add_today} onPress={handleAdd} />
            ) : null}
            <SecondaryButton label={machineCopy.share} appearance="outline" onPress={() => void shareUnlock()} />
          </View>
        ) : undefined
      }>
      <GuideSection title={machineCopy.find} steps={guide.whereToFind ? [guide.whereToFind] : []} />
      <GuideSection title={machineCopy.setup} steps={guide.setup} />
      <GuideSection title={useTitle} steps={guide.startAndStop} />

      {guide.beginnerSettings ? (
        <View
          style={[
            styles.beginner,
            { backgroundColor: colours.brandSoft, borderRadius: radius.lg, marginTop: spacing.lg },
          ]}>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            {machineCopy.beginner}
          </AppText>
          <AppText variant="body" style={{ color: colours.ink, marginTop: spacing.sm }}>
            {guide.beginnerSettings}
          </AppText>
        </View>
      ) : null}

      <GuideSection title={machineCopy.mistakes} steps={guide.commonMistakes} />
      <GuideSection title={machineCopy.etiquette} steps={guide.etiquette} />

      {exercises.length > 0 ? (
        <View style={{ marginTop: spacing.lg }}>
          <AppText variant="title2" style={{ color: colours.ink, marginBottom: spacing.md }}>
            {picking ? machineCopy.pick_exercise : machineCopy.exercises}
          </AppText>
          {exercises.map((item) => (
            <Pressable
              key={item.slug}
              onPress={() =>
                picking
                  ? addExercise(item.slug)
                  : router.push({ pathname: '/exercise/[id]', params: { id: item.slug } } as Href)
              }
              style={({ pressed }) => [
                styles.exerciseRow,
                { backgroundColor: colours.surface, borderRadius: radius.md },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button">
              <AppText variant="bodyStrong" style={{ color: colours.ink, flex: 1 }}>
                {item.name}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {fromScan ? (
        <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: spacing.lg }}>
          {machineCopy.ai_label}
        </AppText>
      ) : null}
      {people === '1' ? (
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
          {aiCopy.people_tip}
        </AppText>
      ) : null}
      <RelatedLearn category="gym_confidence" style={{ marginTop: spacing.lg }} />
      <SafetyNotice style={{ marginTop: spacing.md }} />
    </DetailLayout>
  );
}

function GuideSection({ title, steps }: { title: string; steps: string[] }) {
  const { colours, spacing } = useTheme();
  if (steps.length === 0) return null;
  return (
    <View style={{ marginTop: spacing.lg }}>
      <AppText variant="title2" style={{ color: colours.ink, marginBottom: spacing.md }}>
        {title}
      </AppText>
      {steps.map((step, index) => (
        <View key={`${title}-${index}`} style={styles.step}>
          <AppText variant="bodySm" style={{ color: colours.accent, minWidth: 20 }}>
            {index + 1}
          </AppText>
          <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
            {step}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  beginner: {
    padding: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  exerciseRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  pressed: {
    opacity: 0.85,
  },
});
