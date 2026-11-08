import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, PhotoFill, PrimaryButton, SafetyNotice, Tag } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { programmesCopy } from '@/lib/copy';
import { exerciseNameFromSlug } from '@/lib/onboardingAnswers';
import {
  describeSingleSessionError,
  singleSessionBySlug,
  startSingleSession,
} from '@/lib/singleSessions';

export default function SingleSessionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const { colours, spacing, radius } = useTheme();
  const [starting, setStarting] = useState(false);
  const session = slug ? singleSessionBySlug(slug) : null;
  async function start() {
    if (!session) return;
    setStarting(true);
    try {
      await startSingleSession(session.slug);
    } catch (error) {
      const message = describeSingleSessionError(error);
      if (message) showDialog('Couldn’t start that session', message);
    } finally {
      setStarting(false);
    }
  }

  if (!session) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        <Stack.Screen options={{ title: 'Session' }} />
        <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
          That session isn’t in the list.
        </AppText>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen options={{ title: session.name }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.hero, { backgroundColor: colours.surfaceMuted, borderRadius: radius.xl }]}>
          <PhotoFill slug={session.cover_image_slug} kind="people" label={session.name} />
        </View>
        <AppText variant="eyebrow" style={{ color: colours.accent, marginTop: spacing.lg }}>
          {session.estimated_minutes} min
        </AppText>
        <AppText variant="display" style={{ color: colours.ink, marginTop: spacing.sm }}>
          {session.name}
        </AppText>
        {session.subtitle ? (
          <AppText variant="body" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
            {session.subtitle}
          </AppText>
        ) : null}
        {session.reviewed_by ? (
          <AppText variant="eyebrow" style={{ color: colours.brand, marginTop: spacing.sm }}>
            {programmesCopy.coach_reviewed}
          </AppText>
        ) : null}
        {session.display_tags.length > 0 ? (
          <View style={styles.tags}>
            {session.display_tags.slice(0, 2).map((tag) => (
              <Tag key={tag} label={tag} />
            ))}
          </View>
        ) : null}
        {session.short_description ? (
          <AppText variant="body" style={{ color: colours.ink, marginTop: spacing.md }}>
            {session.short_description}
          </AppText>
        ) : null}
        {session.coach_note ? (
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
            {session.coach_note}
          </AppText>
        ) : null}
        <AppText variant="title3" style={{ color: colours.ink, marginTop: spacing.lg }}>
          Exercises
        </AppText>
        {session.exercises.map((slot) => (
          <AppText
            key={`${slot.slug}-${slot.role ?? 'slot'}`}
            variant="body"
            style={{ color: colours.ink, marginTop: spacing.sm }}>
            {exerciseNameFromSlug(slot.slug)}
            {slot.sets ? ` · ${slot.sets} × ${slot.rep_min} to ${slot.rep_max}` : ''}
          </AppText>
        ))}
        <PrimaryButton
          label={starting ? 'Starting…' : programmesCopy.start_session}
          onPress={() => void start()}
          loading={starting}
          disabled={starting}
          style={{ marginTop: spacing.xl }}
        />
        <SafetyNotice style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 24,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  hero: {
    aspectRatio: 4 / 3,
    overflow: 'hidden',
  },
  heroFill: {
    width: '100%',
    height: '100%',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    marginTop: 12,
  },
});
