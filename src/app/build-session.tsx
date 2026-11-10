import { Stack, router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, Chip, PrimaryButton, SecondaryButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { trackAi } from '@/lib/analytics';
import {
  BUILD_SESSION_ENERGY,
  BUILD_SESSION_FEATURE,
  BUILD_SESSION_FOCUSES,
  BUILD_SESSION_KIT,
  BUILD_SESSION_MINUTES,
  builtSessionToDay,
  cardioDefFromPlan,
  cardioIdFromPlan,
  describeBuildSessionError,
  startBuiltStrengthSession,
  strengthLines,
  stretchIdFromPlan,
  type BuildSessionEnergy,
  type BuildSessionFocus,
  type BuildSessionKit,
  type BuildSessionLevel,
  type BuildSessionMinutes,
  type BuiltSession,
} from '@/lib/buildSession';
import { requestBuiltSession } from '@/lib/buildSessionAi';
import { aiCopy, fillCopy } from '@/lib/copy';
import { saveCustomWorkout } from '@/lib/customWorkouts';
import { ensureSubscribed, useSubscriptionGate } from '@/lib/paywall';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { openCardioFromPlan, openRecoveryFromPlan } from '@/lib/startLogger';
import { useWorkout } from '@/lib/workout';

function focusLabel(focus: BuildSessionFocus): string {
  if (focus === 'upper') return aiCopy.build_focus_upper;
  if (focus === 'lower') return aiCopy.build_focus_lower;
  if (focus === 'glutes_and_legs') return aiCopy.build_focus_glutes;
  if (focus === 'cardio') return aiCopy.build_focus_cardio;
  if (focus === 'recovery') return aiCopy.build_focus_recovery;
  return aiCopy.build_focus_full_body;
}

function kitLabel(kit: BuildSessionKit): string {
  if (kit === 'dumbbells') return aiCopy.build_kit_dumbbells;
  if (kit === 'busy_gym') return aiCopy.build_kit_busy;
  if (kit === 'bodyweight') return aiCopy.build_kit_bodyweight;
  return aiCopy.build_kit_full;
}

function energyLabel(energy: BuildSessionEnergy): string {
  if (energy === 'low') return aiCopy.build_energy_low;
  if (energy === 'high') return aiCopy.build_energy_high;
  return aiCopy.build_energy_normal;
}

export default function BuildSessionScreen() {
  useSubscriptionGate();
  const insets = useSafeAreaInsets();
  const { colours, radius, shadow } = useTheme();
  const { profile } = useProfile();
  const { publish } = useWorkout();
  const answers = getQuizAnswers(profile);
  const defaultMinutes = (BUILD_SESSION_MINUTES as readonly number[]).includes(
    answers?.session_minutes ?? 0
  )
    ? (answers?.session_minutes as BuildSessionMinutes)
    : 30;
  const defaultKit: BuildSessionKit =
    answers?.equipment === 'dumbbells'
      ? 'dumbbells'
      : answers?.equipment === 'home'
        ? 'bodyweight'
        : 'full_gym';
  const gym = answers?.gym_experience;
  const level: BuildSessionLevel =
    gym === 'regularly' ? 'advanced' : gym === 'on_and_off' ? 'intermediate' : 'beginner';

  const [minutes, setMinutes] = useState<BuildSessionMinutes>(defaultMinutes);
  const [focus, setFocus] = useState<BuildSessionFocus>('full_body');
  const [kit, setKit] = useState<BuildSessionKit>(defaultKit);
  const [energy, setEnergy] = useState<BuildSessionEnergy>('normal');
  const [plan, setPlan] = useState<BuiltSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const lines = useMemo(() => (plan ? strengthLines(plan) : []), [plan]);
  const cardio = plan ? cardioDefFromPlan(plan) : null;
  const stretchId = plan ? stretchIdFromPlan(plan) : null;
  const canSave = Boolean(plan && lines.length > 0);

  function resetResult() {
    setPlan(null);
    setNotice(null);
  }

  async function submit() {
    if (busy || !ensureSubscribed()) return;
    setBusy(true);
    setNotice(null);
    const outcome = await requestBuiltSession({ minutes, focus, kit, energy, level });
    setBusy(false);
    if (outcome.kind === 'limit') {
      setNotice(aiCopy.build_limit);
      return;
    }
    if (outcome.kind === 'error') {
      setNotice(aiCopy.build_error);
      return;
    }
    setPlan(outcome.plan);
    if (outcome.plan.fallback) setNotice(aiCopy.build_fallback);
  }

  async function start() {
    if (!plan || starting || !ensureSubscribed()) return;
    setStarting(true);
    try {
      const strength = plan.blocks.some((item) => item.block_type === 'strength' && item.exercises.length > 0);
      if (!strength) {
        const cardioSlug = cardioIdFromPlan(plan);
        if (cardioSlug) {
          trackAi('ai_result_accepted', BUILD_SESSION_FEATURE);
          await openCardioFromPlan(cardioSlug, publish);
          return;
        }
        if (stretchId) {
          trackAi('ai_result_accepted', BUILD_SESSION_FEATURE);
          await openRecoveryFromPlan(stretchId, publish);
          return;
        }
      }
      trackAi('ai_result_accepted', BUILD_SESSION_FEATURE);
      await startBuiltStrengthSession(plan);
    } catch (error) {
      const detail = describeBuildSessionError(error);
      if (detail) showDialog(aiCopy.build_title, detail);
    } finally {
      setStarting(false);
    }
  }

  async function saveWorkout() {
    if (!plan || saving || !ensureSubscribed()) return;
    setSaving(true);
    try {
      const day = await builtSessionToDay(plan);
      if (!day) throw new Error('This session’s exercises are not in the library yet.');
      await saveCustomWorkout(
        null,
        day.name,
        day.exercises.map((item) => ({
          exercise: item.exercise,
          sets: item.sets,
          rep_min: item.rep_min,
          rep_max: item.rep_max,
        }))
      );
      showDialog(aiCopy.build_saved, `${day.name} is in your list.`, [
        { text: 'Open My workouts', onPress: () => router.push('/workouts' as Href) },
        { text: 'Done', style: 'cancel' },
      ]);
    } catch (error) {
      const detail = describeBuildSessionError(error);
      if (detail) showDialog(aiCopy.build_title, detail);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: aiCopy.build_title }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <AppText variant="body" style={{ color: colours.inkMuted }}>
          {aiCopy.build_body}
        </AppText>

        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          {aiCopy.build_minutes}
        </AppText>
        <View style={styles.chips}>
          {BUILD_SESSION_MINUTES.map((value) => (
            <Chip
              key={value}
              label={fillCopy(aiCopy.build_minutes_label, { minutes: value })}
              selected={minutes === value}
              onPress={() => {
                setMinutes(value);
                resetResult();
              }}
              size="lg"
            />
          ))}
        </View>

        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          {aiCopy.build_focus}
        </AppText>
        <View style={styles.chips}>
          {BUILD_SESSION_FOCUSES.map((value) => (
            <Chip
              key={value}
              label={focusLabel(value)}
              selected={focus === value}
              onPress={() => {
                setFocus(value);
                resetResult();
              }}
              size="lg"
            />
          ))}
        </View>

        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          {aiCopy.build_kit}
        </AppText>
        <View style={styles.chips}>
          {BUILD_SESSION_KIT.map((value) => (
            <Chip
              key={value}
              label={kitLabel(value)}
              selected={kit === value}
              onPress={() => {
                setKit(value);
                resetResult();
              }}
              size="lg"
            />
          ))}
        </View>

        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          {aiCopy.build_energy}
        </AppText>
        <View style={styles.chips}>
          {BUILD_SESSION_ENERGY.map((value) => (
            <Chip
              key={value}
              label={energyLabel(value)}
              selected={energy === value}
              onPress={() => {
                setEnergy(value);
                resetResult();
              }}
              size="lg"
            />
          ))}
        </View>

        {plan ? (
          <View style={[styles.result, { backgroundColor: colours.surface, borderRadius: radius.lg }, shadow]}>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {plan.name}
            </AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
              {fillCopy(aiCopy.build_minutes_label, { minutes: plan.estimated_minutes })}
            </AppText>
            <AppText variant="body" style={{ color: colours.ink, marginTop: 8 }}>
              {plan.why}
            </AppText>
            {cardio ? (
              <AppText variant="body" style={{ color: colours.ink, marginTop: 8 }}>
                {cardio.name}
              </AppText>
            ) : null}
            {stretchId && lines.length === 0 && !cardio ? (
              <AppText variant="body" style={{ color: colours.ink, marginTop: 8 }}>
                {stretchId.replace(/-/g, ' ')}
              </AppText>
            ) : null}
            {lines.map((line) => (
              <AppText key={line} variant="bodySm" style={{ color: colours.ink, marginTop: 4 }}>
                {line}
              </AppText>
            ))}
            {notice ? (
              <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 8 }}>
                {notice}
              </AppText>
            ) : null}
            <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 10 }}>
              {aiCopy.build_ai_label}
            </AppText>
            <PrimaryButton
              label={starting ? 'Starting…' : aiCopy.build_start}
              onPress={() => void start()}
              loading={starting}
              style={{ marginTop: 12 }}
            />
            {canSave ? (
              <SecondaryButton
                label={saving ? 'Saving…' : aiCopy.build_save}
                onPress={() => void saveWorkout()}
                loading={saving}
                style={{ marginTop: 8 }}
              />
            ) : null}
          </View>
        ) : (
          <>
            {notice ? (
              <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                {notice}
              </AppText>
            ) : null}
            <PrimaryButton
              label={busy ? aiCopy.build_checking : aiCopy.build_submit}
              onPress={() => void submit()}
              loading={busy}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  result: {
    padding: 16,
    gap: 2,
  },
});
