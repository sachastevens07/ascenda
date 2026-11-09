import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Chip, ChipScroller, PhotoFill } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { fetchFinishedSessionMeta } from '@/lib/activityStats';
import {
  CARDIO_MACHINES,
  cardioRowMeta,
  machineLabel,
  styleLabel,
  visibleCardioSessions,
  type CardioMachineId,
  type CardioSessionDef,
} from '@/lib/cardio';
import { cardioCopy } from '@/lib/copy';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { CARDIO_STYLES, type CardioStyle } from '@/lib/sessionTypes';

export function CardioCatalogue({ bottomInset }: { bottomInset?: number }) {
  const insets = useSafeAreaInsets();
  const paddingBottom = (bottomInset ?? insets.bottom) + 32;
  const { colours, spacing, radius, shadow } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const [startedOn, setStartedOn] = useState<string | null>(profile?.onboarding_completed_at ?? null);
  const [machine, setMachine] = useState<CardioMachineId | 'all'>('all');
  const [style, setStyle] = useState<CardioStyle | 'all'>('all');

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      fetchFinishedSessionMeta()
        .then((sessions) => {
          if (!isCurrent) return;
          setStartedOn(sessions[0]?.date ?? profile?.onboarding_completed_at ?? null);
        })
        .catch(() => {
          if (isCurrent) setStartedOn(profile?.onboarding_completed_at ?? null);
        });
      return () => {
        isCurrent = false;
      };
    }, [profile?.onboarding_completed_at])
  );

  const { sessions, beginnerWindow } = useMemo(
    () =>
      visibleCardioSessions({
        gymExperience: answers?.gym_experience ?? profile?.gym_experience,
        startedOn,
        machine,
        style,
      }),
    [answers?.gym_experience, profile?.gym_experience, startedOn, machine, style]
  );

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom }]}>
      {beginnerWindow ? (
        <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
          {cardioCopy.beginner_note}
        </AppText>
      ) : null}

      <ChipScroller style={styles.filters}>
        <Chip label={cardioCopy.filter_all} selected={machine === 'all'} onPress={() => setMachine('all')} />
        {CARDIO_MACHINES.filter((id) => id !== 'mixed').map((id) => (
          <Chip
            key={id}
            label={machineLabel(id)}
            selected={machine === id}
            onPress={() => setMachine(machine === id ? 'all' : id)}
          />
        ))}
      </ChipScroller>
      <ChipScroller>
        <Chip label={cardioCopy.filter_all} selected={style === 'all'} onPress={() => setStyle('all')} />
        {CARDIO_STYLES.map((id) => (
          <Chip
            key={id}
            label={styleLabel(id)}
            selected={style === id}
            onPress={() => setStyle(style === id ? 'all' : id)}
          />
        ))}
      </ChipScroller>

      {sessions.length === 0 ? (
        <AppText variant="body" style={{ color: colours.inkMuted, marginTop: spacing.md }}>
          {beginnerWindow && style === 'intervals' ? cardioCopy.beginner_empty : cardioCopy.empty}
        </AppText>
      ) : (
        sessions.map((session) => (
          <CardioRow
            key={session.slug}
            session={session}
            onPress={() => router.push({ pathname: '/cardio/[slug]', params: { slug: session.slug } } as Href)}
          />
        ))
      )}
    </ScrollView>
  );
}

function CardioRow({ session, onPress }: { session: CardioSessionDef; onPress: () => void }) {
  const { colours, radius, shadow } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={session.name}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colours.surface, borderRadius: radius.lg },
        shadow,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
        <PhotoFill slug={session.coverImageSlug} kind="equipment" label={session.name} />
      </View>
      <View style={styles.copy}>
        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          {machineLabel(session.machineId)}
        </AppText>
        <AppText variant="title3" style={{ color: colours.ink, marginTop: 4 }} numberOfLines={2}>
          {session.name}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
          {cardioRowMeta(session)}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 12,
  },
  filters: {
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  thumb: {
    width: 72,
    height: 72,
    overflow: 'hidden',
  },
  copy: {
    flex: 1,
  },
  pressed: {
    opacity: 0.85,
  },
});
