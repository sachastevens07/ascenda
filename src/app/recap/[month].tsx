import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, PrimaryButton, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  DEFAULT_STREAK_GOAL,
  fetchFinishedSessionMeta,
  fetchStreakGoal,
  getWeeklyStreak,
  normalizeWeeklyTarget,
} from '@/lib/activityStats';
import { EMPTY_ACHIEVEMENT_EXTRAS, fetchAchievementExtras, getAchievementBadges } from '@/lib/achievements';
import { recapCopy } from '@/lib/copy';
import {
  highlightLabel,
  highlightValue,
  loadMonthlyRecap,
  recapShareMessage,
  type MonthlyRecap,
} from '@/lib/monthlyRecap';
import { equipmentFromMachinesUsed } from '@/lib/onboardingAnswers';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { fetchProgressSets } from '@/lib/progress';
import { fetchCompletedEnrolmentCount } from '@/lib/routines';

type RecapPage = {
  key: string;
  eyebrow: string;
  title: string;
  body?: string;
  rows?: { label: string; value: string }[];
  names?: string[];
  story?: boolean;
};

export default function MonthlyRecapScreen() {
  const { month } = useLocalSearchParams<{ month: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colours, radius, spacing, shadow } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const [recap, setRecap] = useState<MonthlyRecap | null>(null);
  const [page, setPage] = useState(0);
  const [includePb, setIncludePb] = useState(false);
  const [loading, setLoading] = useState(true);
  const pageWidth = Math.max(280, width);

  useEffect(() => {
    let isCurrent = true;
    (async () => {
      const [sessions, sets, extras, completedRoutines, streakGoal] = await Promise.all([
        fetchFinishedSessionMeta().catch(() => []),
        fetchProgressSets().catch(() => []),
        fetchAchievementExtras(equipmentFromMachinesUsed(profile?.onboarding_answers?.machines_used)).catch(
          () => ({
            ...EMPTY_ACHIEVEMENT_EXTRAS,
            knownEquipment: equipmentFromMachinesUsed(profile?.onboarding_answers?.machines_used),
          })
        ),
        fetchCompletedEnrolmentCount().catch(() => 0),
        fetchStreakGoal().catch(() => DEFAULT_STREAK_GOAL),
      ]);
      const weeklyTarget = normalizeWeeklyTarget(answers?.days_per_week);
      const streak = getWeeklyStreak(sessions, weeklyTarget, streakGoal);
      const badges = getAchievementBadges({
        sessions,
        sets,
        streak,
        completedRoutines,
        extras,
      });
      const loaded = await loadMonthlyRecap({
        sessions,
        sets,
        badges,
        weeklyTarget,
        streakGoal,
        monthKey: month && /^\d{4}-\d{2}/.test(month) ? `${month.slice(0, 7)}-01` : undefined,
        ignoreDismissed: true,
      });
      if (!isCurrent) return;
      setRecap(loaded);
      setLoading(false);
    })().catch(() => {
      if (isCurrent) setLoading(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [answers?.days_per_week, month, profile?.onboarding_answers?.machines_used]);

  const pages = useMemo((): RecapPage[] => {
    if (!recap) return [];
    const { stats } = recap;
    const list: RecapPage[] = [
      {
        key: 'title',
        eyebrow: recapCopy.eyebrow,
        title: recap.headline,
        body: `Your ${stats.month} in the gym`,
      },
      {
        key: 'mix',
        eyebrow: recapCopy.page_mix,
        title: `${stats.sessions} ${stats.sessions === 1 ? 'session' : 'sessions'}`,
        rows: [
          { label: recapCopy.page_minutes, value: String(stats.minutes) },
          ...(stats.strength_sessions
            ? [{ label: recapCopy.page_strength, value: String(stats.strength_sessions) }]
            : []),
          ...(stats.cardio_sessions
            ? [{ label: recapCopy.page_cardio, value: String(stats.cardio_sessions) }]
            : []),
          ...(stats.recovery_sessions
            ? [{ label: recapCopy.page_recovery, value: String(stats.recovery_sessions) }]
            : []),
        ],
      },
    ];
    if (stats.personal_bests || stats.new_exercises || stats.new_machines) {
      list.push({
        key: 'firsts',
        eyebrow: recapCopy.page_pbs,
        title: stats.personal_bests
          ? `${stats.personal_bests} ${stats.personal_bests === 1 ? 'personal best' : 'personal bests'}`
          : recapCopy.page_new_exercises,
        names: [
          ...stats.pb_names,
          ...stats.new_exercise_names.filter((name) => !stats.pb_names.includes(name)),
          ...stats.new_machine_names,
        ].slice(0, 8),
        rows: [
          ...(stats.new_exercises
            ? [{ label: recapCopy.page_new_exercises, value: String(stats.new_exercises) }]
            : []),
          ...(stats.new_machines
            ? [{ label: recapCopy.page_new_machines, value: String(stats.new_machines) }]
            : []),
        ],
      });
    }
    if (stats.weeks_trained || stats.gold_weeks || stats.awards || stats.longest_run) {
      list.push({
        key: 'weeks',
        eyebrow: recapCopy.page_weeks,
        title: stats.longest_run
          ? `${stats.longest_run} ${stats.longest_run === 1 ? 'week' : 'weeks'} in a row`
          : recapCopy.page_weeks,
        rows: [
          { label: recapCopy.page_weeks, value: String(stats.weeks_trained) },
          ...(stats.gold_weeks ? [{ label: recapCopy.page_gold, value: String(stats.gold_weeks) }] : []),
          ...(stats.awards ? [{ label: recapCopy.page_awards, value: String(stats.awards) }] : []),
        ],
        names: stats.award_names.slice(0, 6),
      });
    }
    list.push({
      key: 'story',
      eyebrow: recapCopy.page_story,
      title: recap.headline,
      body: recap.story,
      story: true,
    });
    return list;
  }, [recap]);

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setPage(Math.max(0, Math.min(next, pages.length - 1)));
  }

  async function shareCard() {
    if (!recap) return;
    try {
      await Share.share({
        message: recapShareMessage(recap, includePb),
        title: `Your ${recap.stats.month} in the gym`,
      });
    } catch {
      showDialog('Could not share', 'You can still screenshot the card.');
    }
  }

  if (loading) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        <ActivityIndicator color={colours.brand} />
      </View>
    );
  }

  if (!recap) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg, padding: spacing.lg }]}>
        <AppText variant="title2" style={{ color: colours.ink, textAlign: 'center' }}>
          {recapCopy.empty_month}
        </AppText>
        <TextButton label="Back" onPress={() => router.back()} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingBottom: insets.bottom + 16 }]}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}>
        {pages.map((item) => (
          <View key={item.key} style={[styles.page, { width: pageWidth, paddingHorizontal: spacing.lg }]}>
            <AppText variant="eyebrow" style={{ color: colours.accent }}>
              {item.eyebrow}
            </AppText>
            <AppText variant="display" style={{ color: colours.ink, marginTop: spacing.sm }}>
              {item.title}
            </AppText>
            {item.body ? (
              <AppText variant="body" style={{ color: colours.inkMuted, marginTop: spacing.md }}>
                {item.body}
              </AppText>
            ) : null}
            {item.rows?.map((row) => (
              <View key={row.label} style={[styles.row, { marginTop: spacing.md }]}>
                <AppText variant="body" style={{ color: colours.inkMuted }}>
                  {row.label}
                </AppText>
                <AppText variant="title2" style={{ color: colours.accent }}>
                  {row.value}
                </AppText>
              </View>
            ))}
            {item.names?.map((name) => (
              <AppText key={name} variant="body" style={{ color: colours.ink, marginTop: spacing.xs }}>
                {name}
              </AppText>
            ))}
            {item.story ? (
              <View
                style={[
                  styles.shareCard,
                  {
                    backgroundColor: colours.ink,
                    borderRadius: radius.xl,
                    aspectRatio: 9 / 16,
                    maxHeight: 420,
                    marginTop: spacing.lg,
                  },
                  shadow,
                ]}
                accessibilityLabel="Share card">
                <AppText variant="eyebrow" style={{ color: colours.accent }}>
                  Ascenda
                </AppText>
                <AppText variant="title2" style={{ color: colours.bg, marginTop: spacing.sm }}>
                  Your {recap.stats.month} in the gym
                </AppText>
                <AppText variant="title3" style={{ color: colours.accent, marginTop: spacing.lg }}>
                  {highlightLabel(recap.highlight)}
                </AppText>
                <AppText variant="display" style={{ color: colours.bg, marginTop: spacing.xs }}>
                  {highlightValue(recap.stats, recap.highlight)}
                </AppText>
                {includePb && recap.personalBests[0] ? (
                  <AppText variant="body" style={{ color: colours.bg, marginTop: spacing.md }}>
                    {recap.personalBests[0].weightKg != null
                      ? `${recap.personalBests[0].name}, ${recap.personalBests[0].weightKg} kg`
                      : recap.personalBests[0].name}
                  </AppText>
                ) : null}
                <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 'auto' }}>
                  {recapCopy.share_note}
                </AppText>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.dots, { gap: spacing.xs }]}>
        {pages.map((item, index) => (
          <View
            key={item.key}
            style={[
              styles.dot,
              {
                backgroundColor: index === page ? colours.brand : colours.surfaceMuted,
              },
            ]}
          />
        ))}
      </View>

      {pages[page]?.story ? (
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {recap.personalBests.length > 0 ? (
            <Pressable
              onPress={() => setIncludePb((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ selected: includePb }}
              style={styles.toggle}>
              <AppText variant="body" style={{ color: colours.ink }}>
                {recapCopy.include_pb}
              </AppText>
              <AppText variant="bodyStrong" style={{ color: colours.brand }}>
                {includePb ? 'On' : 'Off'}
              </AppText>
            </Pressable>
          ) : null}
          <PrimaryButton label={recapCopy.share} onPress={() => void shareCard()} />
          <AppText variant="caption" style={{ color: colours.inkMuted, textAlign: 'center' }}>
            {recap.usedFallback ? recapCopy.share_note : recapCopy.ai_label}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centre: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  shareCard: {
    width: '72%',
    alignSelf: 'center',
    padding: 20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  toggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
});
