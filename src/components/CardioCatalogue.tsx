import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
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
import { cardioBuilderSpec } from '@/lib/cardioBuilderContent';
import { cardioCopy } from '@/lib/copy';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { CARDIO_STYLES, type CardioStyle } from '@/lib/sessionTypes';

function routeForBuilderAction(id: string): Href | null {
  if (id === 'quick') return '/cardio/quick';
  if (id === 'intervals') return '/cardio/intervals';
  if (id === 'log') return '/cardio/log';
  return null;
}

export function CardioCatalogue({ bottomInset }: { bottomInset?: number }) {
  const insets = useSafeAreaInsets();
  const paddingBottom = (bottomInset ?? insets.bottom) + 32;
  const { colours, spacing } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const [startedOn, setStartedOn] = useState<string | null>(profile?.onboarding_completed_at ?? null);
  const [machine, setMachine] = useState<CardioMachineId | 'all'>('all');
  const [style, setStyle] = useState<CardioStyle | 'all'>('all');
  const [createOpen, setCreateOpen] = useState(false);

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
    <>
      <FlatList
        data={sessions}
        keyExtractor={(session) => session.slug}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        contentContainerStyle={[styles.content, { paddingBottom }]}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <CreateYourOwnRow onPress={() => setCreateOpen(true)} />
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
              {CARDIO_STYLES.filter((id) => id !== 'mixed').map((id) => (
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
            ) : null}
          </View>
        }
        renderItem={({ item: session }) => (
          <CardioRow
            session={session}
            onPress={() => router.push({ pathname: '/cardio/[slug]', params: { slug: session.slug } } as Href)}
          />
        )}
      />
      <CreateYourOwnSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onChoose={(id) => {
          setCreateOpen(false);
          const href = routeForBuilderAction(id);
          if (href) {
            router.push(href);
            return;
          }
          const action = cardioBuilderSpec.entry.actions.find((item) => item.id === id);
          showDialog(action?.label ?? cardioBuilderSpec.entry.cardTitle, cardioBuilderSpec.entry.comingSoon);
        }}
      />
    </>
  );
}

function CreateYourOwnRow({ onPress }: { onPress: () => void }) {
  const { colours, radius, shadow } = useTheme();
  const title = cardioBuilderSpec.entry.cardTitle;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.createRow,
        { backgroundColor: colours.surface, borderRadius: radius.lg },
        shadow,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.createIcon, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
        <Ionicons name="add" size={20} color={colours.brand} />
      </View>
      <AppText variant="title3" style={{ color: colours.ink, flex: 1 }} numberOfLines={1}>
        {title}
      </AppText>
      <Ionicons name="chevron-forward" size={20} color={colours.inkMuted} />
    </Pressable>
  );
}

function CreateYourOwnSheet({
  visible,
  onClose,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (id: string) => void;
}) {
  const { colours, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const spec = cardioBuilderSpec;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <Pressable style={styles.modalScrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colours.bg,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingBottom: insets.bottom,
            },
          ]}>
          <AppText variant="title2" style={{ color: colours.ink, paddingHorizontal: 24, paddingTop: 20 }}>
            {spec.entry.cardTitle}
          </AppText>
          <View style={{ paddingHorizontal: 24, paddingTop: 16, gap: spacing.sm }}>
            {spec.entry.actions.map((action) => (
              <Pressable
                key={action.id}
                onPress={() => onChoose(action.id)}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={({ pressed }) => [
                  styles.sheetRow,
                  { backgroundColor: colours.surface, borderRadius: radius.lg },
                  pressed && styles.pressed,
                ]}>
                <AppText variant="title3" style={{ color: colours.ink, flex: 1 }}>
                  {action.label}
                </AppText>
                <Ionicons name="chevron-forward" size={20} color={colours.inkMuted} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
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
  createRow: {
    minHeight: 64,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  createIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    width: '100%',
    maxHeight: '80%',
  },
  sheetRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
