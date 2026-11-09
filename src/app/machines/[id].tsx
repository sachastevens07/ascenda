import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, DetailLayout, RelatedLearn, SafetyNotice } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { machineCopy } from '@/lib/copy';
import {
  machineExercises,
  machineGuide,
} from '@/lib/machineGuides';

export default function MachineGuideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colours, spacing, radius } = useTheme();
  const guide = machineGuide(Array.isArray(id) ? id[0] : id);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/learn' as Href);
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
  const useTitle = guide.useKind === 'start' ? machineCopy.start : machineCopy.use;

  return (
    <DetailLayout
      cover={null}
      coverSlug={guide.imageSlug}
      letter={guide.name}
      title={guide.name}
      eyebrow={machineCopy.eyebrow}
      onBack={goBack}>
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
            {machineCopy.exercises}
          </AppText>
          {exercises.map((item) => (
            <Pressable
              key={item.slug}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.slug } } as Href)}
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
