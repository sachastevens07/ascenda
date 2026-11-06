import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { showDialog } from '@/components/Dialog';
import { useTabBarHeight } from '@/components/PillTabBar';
import {
  AppText,
  HeroImage,
  PrimaryButton,
  StatTile,
  TabAvatar,
  TextButton,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  DEFAULT_STREAK_GOAL,
  fetchFinishedSessionMeta,
  fetchStreakGoal,
  getWeeklyStreak,
} from '@/lib/activityStats';
import { fillCopy, lockedHomeCopy, referCopy } from '@/lib/copy';
import { canOpenExportedFile, exportWorkoutHistory, openExportedFile } from '@/lib/export';
import { coverForRoutine, imageSourceForSlug, takeCoverSource } from '@/lib/images';
import { draftFromSaved, emptyOnboardingDraft } from '@/lib/onboardingAnswers';
import { recommendPlan } from '@/lib/onboardingPlan';
import { openPaywall } from '@/lib/paywall';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { fetchProgressSets, getPersonalBests } from '@/lib/progress';
import { fetchActiveEnrolment, fetchRoutines } from '@/lib/routines';
import { fetchRestWeekStarts } from '@/lib/streak';
import { fetchProPackages, getFreeTrialDays } from '@/lib/subscription';

const FRIEND_TRIAL_DAYS = 14;

type LockedPlan = {
  name: string;
  cover: ReturnType<typeof imageSourceForSlug>;
  why: string[];
  milestones: { week: number; title: string; description: string }[];
};

type LockedStats = {
  sessions: number;
  personalBests: number;
  weeksTrained: number;
};

function firstName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

async function runExport(): Promise<void> {
  const result = await exportWorkoutHistory();
  if (result.status === 'empty') {
    showDialog('Nothing to export yet', 'Finish a session and your sets will be ready to download.');
    return;
  }
  if (result.status !== 'saved') return;
  const { fileName, setCount, uri } = result;
  showDialog(
    'Saved',
    `${fileName} (${setCount} sets) is in the folder you chose.`,
    canOpenExportedFile
      ? [
          { text: 'Open', onPress: () => void openExportedFile(uri).catch(() => {}) },
          { text: 'Done', style: 'cancel' },
        ]
      : [{ text: 'Done' }]
  );
}

export function LockedHome() {
  const tabBarHeight = useTabBarHeight();
  const { colours, radius, spacing, shadow } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const [plan, setPlan] = useState<LockedPlan | null>(null);
  const [stats, setStats] = useState<LockedStats>({ sessions: 0, personalBests: 0, weeksTrained: 0 });
  const [trialDays, setTrialDays] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready'>('loading');
  const [exporting, setExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      (async () => {
        const draft = answers
          ? draftFromSaved({
              answers,
              extras: profile?.onboarding_answers,
              age_band: profile?.age_band,
              cardio_preference: profile?.cardio_preference,
              bodyweight_kg: profile?.bodyweight_kg,
            })
          : emptyOnboardingDraft();
        try {
          const [enrolment, routines, sessions, sets, streakGoal, restWeeks, packages] = await Promise.all([
            fetchActiveEnrolment().catch(() => null),
            fetchRoutines().catch(() => []),
            fetchFinishedSessionMeta().catch(() => []),
            fetchProgressSets().catch(() => []),
            fetchStreakGoal().catch(() => DEFAULT_STREAK_GOAL),
            fetchRestWeekStarts().catch(() => new Set<string>()),
            fetchProPackages().catch(() => []),
          ]);
          if (!isCurrent) return;
          const recommended = recommendPlan(draft, enrolment?.routine.slug);
          const routine =
            enrolment?.routine ??
            routines.find((item) => item.slug === recommended?.recommended.slug) ??
            routines[0] ??
            null;
          const why = (recommended?.why ?? []).slice(0, 3);
          const fallbackWhy = (routine?.audience ?? []).slice(0, 3);
          const milestones = (recommended?.milestones ?? []).slice(0, 3);
          const used = new Set<string>();
          const cover = routine
            ? takeCoverSource(coverForRoutine(routine), used)
            : imageSourceForSlug(recommended ? `${recommended.recommended.slug}-cover` : null);
          setPlan({
            name: routine?.name ?? recommended?.recommended.name ?? 'Your plan',
            cover,
            why: why.length > 0 ? why : fallbackWhy,
            milestones,
          });
          const streak = getWeeklyStreak(
            sessions,
            new Map(),
            answers?.days_per_week ?? 3,
            streakGoal,
            restWeeks
          );
          setStats({
            sessions: sessions.length,
            personalBests: getPersonalBests(sets).length,
            weeksTrained: streak.weeksTrained,
          });
          const annual = packages.find((item) => item.packageType === 'ANNUAL');
          setTrialDays(annual ? getFreeTrialDays(annual.product) : null);
          setLoadState('ready');
        } catch {
          if (!isCurrent) return;
          const recommended = recommendPlan(draft);
          setPlan({
            name: recommended?.recommended.name ?? 'Your plan',
            cover: imageSourceForSlug(recommended ? `${recommended.recommended.slug}-cover` : null),
            why: (recommended?.why ?? []).slice(0, 3),
            milestones: (recommended?.milestones ?? []).slice(0, 3),
          });
          setLoadState('ready');
        }
      })();
      return () => {
        isCurrent = false;
      };
    }, [
      answers?.days_per_week,
      answers?.display_name,
      profile?.age_band,
      profile?.bodyweight_kg,
      profile?.cardio_preference,
      profile?.onboarding_answers,
    ])
  );

  const lapsed = stats.sessions > 0;
  const name = firstName(answers?.display_name ?? profile?.display_name);
  const cta = lapsed
    ? lockedHomeCopy.lapsed.cta
    : trialDays
      ? fillCopy(lockedHomeCopy.new.cta, { trial_days: trialDays })
      : lockedHomeCopy.new.cta_no_trial;

  if (loadState !== 'ready' || !plan) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        <ActivityIndicator color={colours.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: (tabBarHeight || 24) + 16, paddingHorizontal: spacing.lg },
        ]}>
        <View style={styles.header}>
          <TabAvatar />
        </View>

        {lapsed ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="display" style={{ color: colours.ink }}>
              {fillCopy(lockedHomeCopy.lapsed.headline, { name })}
            </AppText>
            <AppText variant="body" style={{ color: colours.inkMuted }}>
              {lockedHomeCopy.lapsed.body}
            </AppText>
          </View>
        ) : (
          <AppText variant="body" style={{ color: colours.inkMuted }}>
            {lockedHomeCopy.new.intro}
          </AppText>
        )}

        <View style={[{ backgroundColor: colours.surface, borderRadius: radius.xl, overflow: 'hidden' }, shadow]}>
          <HeroImage image={plan.cover} eyebrow={lockedHomeCopy.new.eyebrow} title={plan.name} height={200} />
          <View style={{ padding: spacing.md, gap: spacing.sm }}>
            {plan.why.length > 0 ? (
              <>
                <AppText variant="title3" style={{ color: colours.ink }}>
                  {lockedHomeCopy.new.why_title}
                </AppText>
                {plan.why.map((line) => (
                  <AppText key={line} variant="body" style={{ color: colours.ink }}>
                    {line}
                  </AppText>
                ))}
              </>
            ) : null}
            {plan.milestones.map((item) => (
              <View key={`${item.week}-${item.title}`} style={{ marginTop: 4 }}>
                <AppText variant="eyebrow" style={{ color: colours.accent }}>
                  Week {item.week}
                </AppText>
                <AppText variant="bodyStrong" style={{ color: colours.ink, marginTop: 2 }}>
                  {item.title}
                </AppText>
                <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }}>
                  {item.description}
                </AppText>
              </View>
            ))}
          </View>
        </View>

        <PrimaryButton label={cta} onPress={() => openPaywall('onboarding')} />
        <AppText variant="bodySm" style={{ color: colours.inkMuted, textAlign: 'center' }}>
          {lapsed ? lockedHomeCopy.lapsed.small_print : lockedHomeCopy.new.small_print}
        </AppText>

        <Pressable
          onPress={() =>
            showDialog(
              referCopy.screen_title,
              fillCopy(referCopy.screen_body, { friend_trial_days: FRIEND_TRIAL_DAYS })
            )
          }
          accessibilityRole="button"
          style={[
            styles.refer,
            { backgroundColor: colours.surface, borderRadius: radius.xl, padding: spacing.md },
            shadow,
          ]}>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            {referCopy.screen_title}
          </AppText>
          <AppText variant="title3" style={{ color: colours.ink, marginTop: 6 }}>
            {referCopy.banner_title}
          </AppText>
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
            {fillCopy(referCopy.banner_body, { friend_trial_days: FRIEND_TRIAL_DAYS })}
          </AppText>
        </Pressable>

        {lapsed ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {lockedHomeCopy.lapsed.stats_title}
            </AppText>
            <View style={styles.stats}>
              <StatTile value={String(stats.sessions)} label="Sessions" style={styles.stat} />
              <StatTile value={String(stats.personalBests)} label="Personal bests" style={styles.stat} />
              <StatTile value={String(stats.weeksTrained)} label="Weeks trained" style={styles.stat} />
            </View>
            <TextButton
              label={lockedHomeCopy.lapsed.see_history}
              onPress={() => router.push('/history' as Href)}
              style={{ alignSelf: 'flex-start' }}
            />
            <TextButton
              label={exporting ? 'Preparing file…' : lockedHomeCopy.lapsed.export}
              onPress={() => {
                if (exporting) return;
                setExporting(true);
                void runExport().finally(() => setExporting(false));
              }}
              style={{ alignSelf: 'flex-start' }}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: 16,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  centre: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refer: {
    gap: 0,
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
  },
});
