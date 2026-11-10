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
import { AppText, PrimaryButton, StatTile, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  DEFAULT_STREAK_GOAL,
  fetchFinishedSessionMeta,
  fetchStreakGoal,
  getWeeklyStreak,
  normalizeWeeklyTarget,
} from '@/lib/activityStats';
import { EMPTY_ACHIEVEMENT_EXTRAS, fetchAchievementExtras, getAchievementBadges } from '@/lib/achievements';
import { fillCopy, recapCopy } from '@/lib/copy';
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
  tiles?: { value: string; label: string; icon?: 'barbell-outline' | 'time-outline' | 'trophy-outline' | 'ribbon-outline' | 'flame-outline' | 'walk-outline' }[];
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
        key: 'overview',
        eyebrow: recapCopy.eyebrow,
        title: fillCopy(recapCopy.card_title, { month: stats.month }),
        body: recapCopy.stats_note,
        tiles: [
          { value: String(stats.sessions), label: recapCopy.page_sessions, icon: 'barbell-outline' },
          { value: String(stats.minutes), label: recapCopy.page_minutes, icon: 'time-outline' },
          ...(stats.personal_bests
            ? [{ value: String(stats.personal_bests), label: recapCopy.page_pbs, icon: 'trophy-outline' as const }]
            : []),
          ...(stats.awards
            ? [{ value: String(stats.awards), label: recapCopy.page_awards, icon: 'ribbon-outline' as const }]
            : []),
        ],
      },
    ];

    const mixTiles = [
      ...(stats.strength_sessions
        ? [{ value: String(stats.strength_sessions), label: recapCopy.page_strength, icon: 'barbell-outline' as const }]
        : []),
      ...(stats.cardio_sessions
        ? [{ value: String(stats.cardio_sessions), label: recapCopy.page_cardio, icon: 'walk-outline' as const }]
        : []),
      ...(stats.recovery_sessions
        ? [{ value: String(stats.recovery_sessions), label: recapCopy.page_recovery, icon: 'flame-outline' as const }]
        : []),
    ];
    if (mixTiles.length > 0) {
      list.push({
        key: 'mix',
        eyebrow: recapCopy.page_mix,
        title: `${stats.sessions} ${stats.sessions === 1 ? 'session' : 'sessions'} logged`,
        tiles: mixTiles,
      });
    }

    if (stats.personal_bests || stats.new_exercises || stats.new_machines) {
      list.push({
        key: 'firsts',
        eyebrow: recapCopy.page_pbs,
        title: stats.personal_bests
          ? `${stats.personal_bests} ${stats.personal_bests === 1 ? 'personal best' : 'personal bests'}`
          : stats.new_exercises
            ? `${stats.new_exercises} new ${stats.new_exercises === 1 ? 'exercise' : 'exercises'}`
            : `${stats.new_machines} new ${stats.new_machines === 1 ? 'machine' : 'machines'}`,
        tiles: [
          ...(stats.new_exercises
            ? [{ value: String(stats.new_exercises), label: recapCopy.page_new_exercises }]
            : []),
          ...(stats.new_machines
            ? [{ value: String(stats.new_machines), label: recapCopy.page_new_machines }]
            : []),
        ],
        names: [
          ...stats.pb_names,
          ...stats.new_exercise_names.filter((name) => !stats.pb_names.includes(name)),
          ...stats.new_machine_names,
        ].slice(0, 6),
      });
    }

    if (stats.weeks_trained || stats.gold_weeks || stats.longest_run) {
      list.push({
        key: 'weeks',
        eyebrow: recapCopy.page_weeks,
        title: stats.longest_run
          ? `${stats.longest_run} ${stats.longest_run === 1 ? 'week' : 'weeks'} in a row`
          : `${stats.weeks_trained} ${stats.weeks_trained === 1 ? 'week' : 'weeks'} trained`,
        tiles: [
          { value: String(stats.weeks_trained), label: recapCopy.page_weeks, icon: 'flame-outline' },
          ...(stats.gold_weeks
            ? [{ value: String(stats.gold_weeks), label: recapCopy.page_gold, icon: 'trophy-outline' as const }]
            : []),
          ...(stats.awards
            ? [{ value: String(stats.awards), label: recapCopy.page_awards, icon: 'ribbon-outline' as const }]
            : []),
        ],
        names: stats.award_names.slice(0, 4),
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
        title: fillCopy(recapCopy.card_title, { month: recap.stats.month }),
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
          {recapCopy.window_closed}
        </AppText>
        <AppText
          variant="body"
          style={{ color: colours.inkMuted, textAlign: 'center', marginTop: spacing.sm }}>
          {recapCopy.empty_month}
        </AppText>
        <TextButton label="Back" onPress={() => router.back()} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingBottom: insets.bottom + 12 }]}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}>
        {pages.map((item) => (
          <ScrollView
            key={item.key}
            style={{ width: pageWidth }}
            contentContainerStyle={[
              styles.page,
              { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
            ]}
            showsVerticalScrollIndicator={false}>
            <AppText variant="eyebrow" style={{ color: colours.accent }}>
              {item.eyebrow}
            </AppText>
            <AppText variant="displaySm" style={{ color: colours.ink }}>
              {item.title}
            </AppText>
            {item.body && !item.story ? (
              <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                {item.body}
              </AppText>
            ) : null}

            {item.tiles && item.tiles.length > 0 ? (
              <View style={[styles.grid, { gap: spacing.sm }]}>
                {item.tiles.map((tile) => (
                  <StatTile
                    key={`${tile.label}-${tile.value}`}
                    value={tile.value}
                    label={tile.label}
                    icon={tile.icon}
                    style={styles.tile}
                  />
                ))}
              </View>
            ) : null}

            {item.names && item.names.length > 0 ? (
              <View
                style={[
                  styles.listCard,
                  { backgroundColor: colours.surface, borderRadius: radius.lg, padding: spacing.md },
                  shadow,
                ]}>
                {item.names.map((name) => (
                  <AppText
                    key={name}
                    variant="body"
                    style={{ color: colours.ink, paddingVertical: 6 }}>
                    {name}
                  </AppText>
                ))}
              </View>
            ) : null}

            {item.story ? (
              <>
                <View
                  style={[
                    styles.storyCard,
                    {
                      backgroundColor: colours.surface,
                      borderRadius: radius.xl,
                      padding: spacing.lg,
                      borderColor: colours.border,
                    },
                    shadow,
                  ]}>
                  <AppText variant="body" style={{ color: colours.ink, lineHeight: 24 }}>
                    {item.body}
                  </AppText>
                  <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: spacing.md }}>
                    {recap.usedFallback ? recapCopy.stats_note : recapCopy.ai_label}
                  </AppText>
                </View>

                <View
                  style={[
                    styles.shareCard,
                    { backgroundColor: colours.ink, borderRadius: radius.xl, padding: spacing.lg },
                    shadow,
                  ]}
                  accessibilityLabel="Share card">
                  <AppText variant="eyebrow" style={{ color: colours.accent }}>
                    Ascenda
                  </AppText>
                  <AppText variant="title2" style={{ color: colours.bg, marginTop: spacing.sm }}>
                    {fillCopy(recapCopy.card_title, { month: recap.stats.month })}
                  </AppText>
                  <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: spacing.lg }}>
                    {highlightLabel(recap.highlight)}
                  </AppText>
                  <AppText variant="display" style={{ color: colours.accent, marginTop: 4 }}>
                    {highlightValue(recap.stats, recap.highlight)}
                  </AppText>
                  <View style={{ marginTop: spacing.md, gap: 4 }}>
                    <AppText variant="bodySm" style={{ color: colours.bg }}>
                      {recap.stats.sessions} sessions · {recap.stats.minutes} min
                    </AppText>
                    {includePb && recap.personalBests[0] ? (
                      <AppText variant="bodySm" style={{ color: colours.bg }}>
                        {recap.personalBests[0].weightKg != null
                          ? `${recap.personalBests[0].name}, ${recap.personalBests[0].weightKg} kg`
                          : recap.personalBests[0].name}
                      </AppText>
                    ) : null}
                  </View>
                  <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: spacing.lg }}>
                    {recapCopy.share_note}
                  </AppText>
                </View>
              </>
            ) : null}
          </ScrollView>
        ))}
      </ScrollView>

      <View style={[styles.dots, { gap: spacing.xs }]}>
        {pages.map((item, index) => (
          <View
            key={item.key}
            style={[
              styles.dot,
              { backgroundColor: index === page ? colours.brand : colours.surfaceMuted },
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
              style={[
                styles.toggle,
                {
                  backgroundColor: colours.surface,
                  borderRadius: radius.lg,
                  paddingHorizontal: spacing.md,
                },
              ]}>
              <AppText variant="body" style={{ color: colours.ink }}>
                {recapCopy.include_pb}
              </AppText>
              <AppText variant="bodyStrong" style={{ color: colours.brand }}>
                {includePb ? 'On' : 'Off'}
              </AppText>
            </Pressable>
          ) : null}
          <PrimaryButton label={recapCopy.share} onPress={() => void shareCard()} />
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
    paddingTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    width: '48%',
    flexGrow: 1,
  },
  listCard: {
    gap: 0,
  },
  storyCard: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  shareCard: {
    width: '100%',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 10,
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
    paddingVertical: 12,
  },
});
