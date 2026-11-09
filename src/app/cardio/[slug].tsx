import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, Chip, DetailLayout, PrimaryButton, StatStrip, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  beginCardioSession,
  cardioSession,
  describeCardioError,
  effortLabel,
  formatEffortTarget,
  formatSegmentSeconds,
  formatSettings,
  isSessionInProgressError,
  machineLabel,
  sessionMachines,
  styleLabel,
} from '@/lib/cardio';
import { cardioCopy, fillCopy, machineCopy } from '@/lib/copy';
import { machineGuide } from '@/lib/machineGuides';
import { confirmFirstSessionSafety } from '@/lib/firstSession';
import { ensureSubscribed } from '@/lib/paywall';
import { useWorkout } from '@/lib/workout';

export default function CardioDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const { colours, spacing } = useTheme();
  const workout = useWorkout();
  const [isStarting, setIsStarting] = useState(false);
  const session = cardioSession(slug);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/programmes' as Href);
  }

  function openActive(id: string, source?: string) {
    if (source === 'stretch') {
      router.push({ pathname: '/stretches/play', params: { sessionId: id } } as Href);
      return;
    }
    if (source === 'cardio') {
      router.push({ pathname: '/cardio/play', params: { sessionId: id } } as Href);
      return;
    }
    router.push({ pathname: '/session/[id]', params: { id } } as Href);
  }

  async function handleStart() {
    if (!ensureSubscribed()) return;
    if (!session) return;
    setIsStarting(true);
    try {
      const allowed = await confirmFirstSessionSafety();
      if (!allowed) return;
      const started = await beginCardioSession(session.slug);
      workout.publish(
        {
          sessionId: started.id,
          dayName: session.name,
          startedAt: Date.parse(started.started_at),
          source: 'cardio',
        },
        null
      );
      router.push({ pathname: '/cardio/play', params: { sessionId: started.id } } as Href);
    } catch (error) {
      if (isSessionInProgressError(error) && error.activeId) {
        showDialog(cardioCopy.in_progress_title, cardioCopy.in_progress_body, [
          {
            text: cardioCopy.open_it,
            onPress: () => openActive(error.activeId, error.activeSource),
          },
          { text: 'OK', style: 'cancel' },
        ]);
        return;
      }
      showDialog(cardioCopy.not_found, describeCardioError(error));
    } finally {
      setIsStarting(false);
    }
  }

  if (!session) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg, paddingTop: insets.top }]}>
        <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
          {cardioCopy.not_found}
        </AppText>
      </View>
    );
  }

  const settings = formatSettings(session.settings);
  const effort = formatEffortTarget(session.effortTarget);
  const guides = sessionMachines(session)
    .map((id) => machineGuide(id))
    .filter((item): item is NonNullable<typeof item> => item != null);

  return (
    <DetailLayout
      cover={null}
      coverSlug={session.coverImageSlug}
      letter={session.name}
      title={session.name}
      eyebrow={`${styleLabel(session.style)} · ${machineLabel(session.machineId)}`}
      onBack={goBack}
      sticky={
        <PrimaryButton
          label={isStarting ? cardioCopy.starting : cardioCopy.start}
          loading={isStarting}
          disabled={isStarting}
          onPress={() => void handleStart()}
        />
      }>
      <AppText variant="body" style={{ color: colours.ink }}>
        {session.summary}
      </AppText>
      <View style={styles.tagRow}>
        <Chip label={styleLabel(session.style)} />
        <Chip label={machineLabel(session.machineId)} />
      </View>
      {guides.map((guide) => (
        <TextButton
          key={guide.id}
          label={fillCopy(machineCopy.first_time, { machine: guide.name.toLowerCase() })}
          onPress={() => router.push({ pathname: '/machines/[id]', params: { id: guide.id } } as Href)}
          style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}
        />
      ))}

      <StatStrip
        style={{ marginTop: spacing.lg }}
        items={[
          { icon: 'time-outline', value: String(session.durationMinutes), label: 'Minutes' },
          { icon: 'heart-outline', value: effort, label: 'Effort' },
          { icon: 'fitness-outline', value: machineLabel(session.machineId), label: 'Machine' },
        ]}
      />

      {settings ? (
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.md }}>
          {fillCopy(cardioCopy.aim_for, { settings })}
        </AppText>
      ) : null}
      <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.xs }}>
        {fillCopy(cardioCopy.should_feel, {
          effort,
          label: effortLabel(session.effortTarget[0]) || effortLabel(session.effortTarget[1]),
        })}
      </AppText>

      {session.durationMinutes >= 10 ? (
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
          {cardioCopy.counts_note}
        </AppText>
      ) : null}

      <AppText variant="title2" style={{ color: colours.ink, marginTop: spacing.lg, marginBottom: spacing.md }}>
        {cardioCopy.segments}
      </AppText>
      {session.intervals.map((interval, index) => (
        <View key={`${interval.label}-${index}`} style={styles.segment}>
          <AppText variant="bodyStrong" style={{ color: colours.ink }}>
            {fillCopy(cardioCopy.segment_line, {
              label: interval.label,
              time: formatSegmentSeconds(interval.seconds),
              effort: interval.effort,
            })}
          </AppText>
          {interval.cue ? (
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
              {interval.cue}
            </AppText>
          ) : null}
        </View>
      ))}

      {session.progression ? (
        <>
          <AppText variant="title2" style={{ color: colours.ink, marginTop: spacing.lg }}>
            {cardioCopy.progression}
          </AppText>
          <AppText variant="body" style={{ color: colours.ink, marginTop: spacing.sm }}>
            {session.progression}
          </AppText>
        </>
      ) : null}

      {session.coachNote ? (
        <>
          <AppText variant="title2" style={{ color: colours.ink, marginTop: spacing.lg }}>
            {cardioCopy.coach_note}
          </AppText>
          <AppText variant="body" style={{ color: colours.ink, marginTop: spacing.sm }}>
            {session.coachNote}
          </AppText>
        </>
      ) : null}
    </DetailLayout>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  segment: {
    marginBottom: 12,
  },
});
