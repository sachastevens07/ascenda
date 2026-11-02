import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { showDialog } from '@/components/Dialog';
import { LineChart } from '@/components/LineChart';
import { useTabBarHeight } from '@/components/PillTabBar';
import {
  AchievementBadge as BadgeMark,
  EmptyState,
  MenuRow,
  DestructiveTextButton,
  OverflowMenu,
  ProBadge,
  ProgressBar,
  ProgressRing,
  SecondaryButton,
  StatTile,
  TextButton,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { getAchievementBadges, type AchievementBadge } from '@/lib/achievements';
import {
  describeStreak,
  fetchFinishedSessionMeta,
  fetchStreakGoal,
  formatTrainingHours,
  getActivityTotals,
  getWeeklyStreak,
  sessionCountsTowardStreak,
  type FinishedSessionMeta,
  type WeeklyStreak,
} from '@/lib/activityStats';
import { getGymUnlocked } from '@/lib/gymUnlocked';
import { openPaywall, type PaywallReason } from '@/lib/paywall';
import {
  fetchPlannedCountsByWeek,
  fetchThisWeekProgress,
  toIso,
  type WeekPlanProgress,
} from '@/lib/planner';
import { formatKg, usesWeight } from '@/lib/programmes';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import {
  fetchProgressSets,
  formatShortDate,
  getLiftHistory,
  getLiftOptions,
  getPersonalBests,
  getWeeklyCounts,
  parseDate,
  type PersonalBest,
  type ProgressSet,
  type WeekCount,
} from '@/lib/progress';
import {
  deleteAllProgressPhotos,
  deleteProgressPhoto,
  describePhotosError,
  fetchProgressPhotos,
  uploadProgressPhoto,
  type ProgressPhoto,
} from '@/lib/progressPhotos';
import {
  describeReview,
  fetchEnrolmentReview,
  formatLiftCompare,
  type EnrolmentReview,
} from '@/lib/checkpoints';
import { nextRoutineOnPath } from '@/lib/paths';
import {
  countEnrolmentSessions,
  currentEnrolmentWeek,
  fetchActiveEnrolment,
  fetchCompletedEnrolmentCount,
  fetchLatestCompletedEnrolment,
  fetchRoutineRoadmap,
  type RoadmapWeek,
  type RoutineEnrolment,
  type RoutineSummary,
} from '@/lib/routines';
import { useSubscription } from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'ready';
type ActivityTab = 'progress' | 'achievements';
type IconName = ComponentProps<typeof Ionicons>['name'];

type ActivityData = {
  sets: ProgressSet[];
  sessions: FinishedSessionMeta[];
  weekProgress: WeekPlanProgress;
  streak: WeeklyStreak;
  enrolment: RoutineEnrolment | null;
  completedEnrolment: RoutineEnrolment | null;
  completedRoutineSessions: number;
  completedRoutines: number;
  roadmap: RoadmapWeek[];
  photos: ProgressPhoto[];
  photosError: string | null;
  review: EnrolmentReview | null;
  nextPathRoutine: RoutineSummary | null;
};

const BAR_WIDTH = 20;
const BAR_GAP = 8;
const BAR_AREA_HEIGHT = 120;
const MIN_BAR_SCALE = 4;

const SESSION_IDS = ['session-1', 'week-1', 'session-5', 'session-10', 'session-25', 'session-50'];
const STREAK_IDS = ['streak-4', 'streak-8', 'streak-12'];
const PB_IDS = ['pb-1'];
const PROGRAMME_IDS = ['routine-1'];
const SESSION_THRESHOLDS = [1, 5, 10, 25, 50];
const STREAK_THRESHOLDS = [4, 8, 12];
const WEIGHT_THRESHOLDS = [10_000, 100_000, 500_000, 1_000_000];
const GYM_THRESHOLDS = [1, 5, 10, 25];
const TABS = [
  { id: 'progress', label: 'Progress' },
  { id: 'achievements', label: 'Achievements' },
] as const;

function describeBest(best: PersonalBest): string {
  switch (best.kind) {
    case 'weight':
      return `${formatKg(best.weightKg ?? 0)} × ${best.reps}`;
    case 'assisted':
      return `${formatKg(best.weightKg ?? 0)} of help × ${best.reps}`;
    case 'reps':
      return `${best.reps} reps`;
  }
}

function formatTotalKg(kg: number): string {
  const rounded = kg >= 100 ? Math.round(kg) : Number(kg.toFixed(1));
  return `${rounded.toLocaleString('en-GB')} kg`;
}

function totalWeightLiftedKg(sets: ProgressSet[]): number {
  return sets.reduce((sum, set) => {
    if (!usesWeight(set.equipment) || set.weightKg === null) return sum;
    return sum + Math.abs(set.weightKg) * set.reps;
  }, 0);
}

function pickBadges(badges: AchievementBadge[], ids: string[]): AchievementBadge[] {
  const byId = new Map(badges.map((badge) => [badge.id, badge]));
  return ids.flatMap((id) => {
    const badge = byId.get(id);
    return badge ? [badge] : [];
  });
}

function nextStep(value: number, thresholds: number[]): { label: string; ratio: number } | null {
  if (thresholds.length === 0) return null;
  const next = thresholds.find((step) => value < step) ?? thresholds[thresholds.length - 1];
  const ratio = next === 0 ? 0 : Math.min(1, value / next);
  return { label: `${Math.round(value).toLocaleString('en-GB')} / ${next.toLocaleString('en-GB')}`, ratio };
}

function badgeIcon(id: string): IconName {
  if (id.startsWith('session-')) return 'barbell-outline';
  if (id === 'week-1') return 'calendar-outline';
  if (id.startsWith('streak-')) return 'flame-outline';
  if (id.startsWith('pb-')) return 'trophy-outline';
  if (id.startsWith('routine-')) return 'ribbon-outline';
  if (id === 'equipment-barbell') return 'barbell-outline';
  if (id === 'equipment-machine') return 'hardware-chip-outline';
  if (id === 'equipment-cable') return 'git-network-outline';
  if (id === 'equipment-dumbbell') return 'barbell-outline';
  if (id === 'equipment-kettlebell') return 'fitness-outline';
  if (id === 'equipment-band') return 'ellipse-outline';
  if (id === 'equipment-bodyweight') return 'body-outline';
  if (id.startsWith('zone-')) return 'location-outline';
  if (id.startsWith('exercises-') || id.includes('exercise')) return 'sparkles-outline';
  return 'medal-outline';
}

export default function ActivityScreen() {
  const tabBarHeight = useTabBarHeight();
  const { colours, radius, shadow, type } = useTheme();
  const { isPro } = useSubscription();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const [data, setData] = useState<ActivityData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [liftId, setLiftId] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const liftPickerRef = useRef<AnchorHandle>(null);
  const [pickerAnchor, setPickerAnchor] = useState<AnchorRect | null>(null);
  const [tab, setTab] = useState<ActivityTab>('progress');
  const [showPhotos, setShowPhotos] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [isPhotoBusy, setIsPhotoBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      (async () => {
        try {
          const [sets, sessions, weekProgress, goal, enrolment, completedEnrolment, completedRoutines] =
            await Promise.all([
              fetchProgressSets(),
              fetchFinishedSessionMeta(),
              fetchThisWeekProgress().catch(() => ({ completed: 0, planned: 0 })),
              fetchStreakGoal(),
              fetchActiveEnrolment().catch(() => null),
              fetchLatestCompletedEnrolment().catch(() => null),
              fetchCompletedEnrolmentCount().catch(() => 0),
            ]);
          const from = sessions[0]?.date ?? toIso(new Date());
          const [plannedByWeek, photosResult, roadmap, completedRoutineSessions] = await Promise.all([
            fetchPlannedCountsByWeek(from, toIso(new Date())),
            fetchProgressPhotos()
              .then((photos) => ({ photos, error: null as string | null }))
              .catch((error) => ({ photos: [] as ProgressPhoto[], error: describePhotosError(error) })),
            enrolment ? fetchRoutineRoadmap(enrolment).catch(() => []) : Promise.resolve([]),
            completedEnrolment
              ? countEnrolmentSessions(completedEnrolment.id).catch(() => 0)
              : Promise.resolve(0),
          ]);
          const fallbackTarget = answers?.days_per_week || enrolment?.routine.days_per_week || 3;
          const streak = getWeeklyStreak(sessions, plannedByWeek, fallbackTarget, goal);
          const review = completedEnrolment
            ? await fetchEnrolmentReview(completedEnrolment, sessions, sets).catch(() => null)
            : null;
          const pathNext = completedEnrolment
            ? await nextRoutineOnPath(completedEnrolment.routine_id).catch(() => null)
            : null;
          if (!isCurrent) return;
          setData({
            sets,
            sessions,
            weekProgress,
            streak,
            enrolment,
            completedEnrolment,
            completedRoutineSessions,
            completedRoutines,
            roadmap,
            photos: photosResult.photos,
            photosError: photosResult.error,
            review,
            nextPathRoutine: pathNext?.routine ?? null,
          });
          setLoadState('ready');
        } catch {
          if (isCurrent) setLoadState((state) => (state === 'ready' ? state : 'error'));
        }
      })();
      return () => {
        isCurrent = false;
      };
    }, [attempt, answers?.days_per_week])
  );

  async function reloadPhotos() {
    try {
      const photos = await fetchProgressPhotos();
      setData((current) => (current ? { ...current, photos, photosError: null } : current));
    } catch (error) {
      setData((current) =>
        current ? { ...current, photosError: describePhotosError(error) } : current
      );
    }
  }

  async function pickPhoto(source: 'camera' | 'library') {
    setIsPhotoBusy(true);
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showDialog(
          source === 'camera' ? 'Camera is off' : 'Photos are off',
          'Turn the permission on in your phone settings if you want to add a progress photo.'
        );
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.7,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.7,
            });
      if (result.canceled || !result.assets[0]?.uri) return;
      await uploadProgressPhoto(result.assets[0].uri);
      await reloadPhotos();
    } catch (error) {
      showDialog('Couldn’t add that photo', describePhotosError(error));
    } finally {
      setIsPhotoBusy(false);
    }
  }

  function confirmDeletePhoto(photo: ProgressPhoto) {
    showDialog('Delete this photo?', 'This removes it from your account. It is never sent anywhere else.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProgressPhoto(photo);
            setCompareIds((current) => current.filter((id) => id !== photo.id));
            await reloadPhotos();
          } catch (error) {
            showDialog('Couldn’t delete that photo', describePhotosError(error));
          }
        },
      },
    ]);
  }

  function confirmDeleteAll(photos: ProgressPhoto[]) {
    showDialog('Delete all progress photos?', 'This removes every photo from your account.', [
      { text: 'Keep them', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAllProgressPhotos(photos);
            setCompareIds([]);
            await reloadPhotos();
          } catch (error) {
            showDialog('Couldn’t delete those photos', describePhotosError(error));
          }
        },
      },
    ]);
  }

  if (loadState !== 'ready' || !data) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <>
            <Text style={[type.body, { color: colours.inkMuted, textAlign: 'center' }]}>
              We couldn’t load your activity. Check your connection and try again.
            </Text>
            <SecondaryButton
              label="Try again"
              onPress={() => {
                setLoadState('loading');
                setAttempt((count) => count + 1);
              }}
              style={styles.retry}
            />
          </>
        )}
      </View>
    );
  }

  const totals = getActivityTotals(data.sessions, data.sets);
  const isEmpty = data.sessions.length === 0;
  const bests = getPersonalBests(data.sets);
  const liftOptions = getLiftOptions(data.sets);
  const lift = liftOptions.find((option) => option.exerciseId === liftId) ?? liftOptions[0];
  const history = lift ? getLiftHistory(data.sets, lift.exerciseId) : [];
  const weeks = getWeeklyCounts(
    data.sessions.filter(sessionCountsTowardStreak).map((session) => session.date)
  );
  const gym = getGymUnlocked(data.sets);
  const badges = getAchievementBadges({
    sessions: data.sessions,
    sets: data.sets,
    streak: data.streak,
    completedRoutines: data.completedEnrolment ? Math.max(1, data.completedRoutines) : 0,
    gym,
  });
  const comparePhotos = data.photos.filter((photo) => compareIds.includes(photo.id));
  const streakRatio = data.streak.goal > 0 ? data.streak.current / data.streak.goal : 0;
  const liftedKg = totalWeightLiftedKg(data.sets);
  const gymProgress = nextStep(gym.exerciseCount, GYM_THRESHOLDS);
  const weightTarget = WEIGHT_THRESHOLDS.find((step) => liftedKg < step) ?? WEIGHT_THRESHOLDS[WEIGHT_THRESHOLDS.length - 1];
  const weightProgress = nextStep(liftedKg, WEIGHT_THRESHOLDS);
  const card = [
    styles.card,
    { backgroundColor: colours.surface, borderRadius: radius.xl },
    shadow,
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <Text style={[type.display, { color: colours.ink }]}>Activity</Text>

        <View style={styles.stats}>
          <StatTile
            value={String(totals.sessions)}
            label={totals.sessions === 1 ? 'session' : 'sessions'}
            style={styles.statFlex}
          />
          <StatTile
            value={String(totals.liftsTracked)}
            label={totals.liftsTracked === 1 ? 'lift tracked' : 'lifts tracked'}
            style={styles.statFlex}
          />
          <StatTile value={formatTrainingHours(totals.durationSeconds)} label="time spent" style={styles.statFlex} />
        </View>

        {data.weekProgress.planned > 0 ? (
          <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: -4 }]}>
            This week: {data.streak.doneThisWeek} of {data.weekProgress.planned}{' '}
            {data.weekProgress.planned === 1 ? 'workout' : 'workouts'}
          </Text>
        ) : null}

        <View style={card}>
          <Text style={[type.eyebrow, { color: colours.accent }]}>Weekly streak</Text>
          <View style={styles.streakRow}>
            <ProgressRing progress={streakRatio} size={84} stroke={8} tone="accent">
              <Text style={[type.title3, { color: colours.ink }]}>
                {data.streak.current}/{data.streak.goal}
              </Text>
            </ProgressRing>
            <View style={styles.flex}>
              <Text style={[type.title2, { color: colours.ink }]}>
                {data.streak.current} of {data.streak.goal} weeks
              </Text>
              <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 4 }]}>
                {describeStreak(data.streak)}
              </Text>
            </View>
            <StatTile
              value={String(data.streak.best)}
              label="All-time best"
              icon="trophy-outline"
              style={[styles.bestTile, { backgroundColor: colours.surfaceMuted }]}
            />
          </View>
        </View>

        <View style={[styles.tabRow, { borderBottomColor: colours.border }]} accessibilityRole="tablist">
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setTab(item.id)}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected }}>
                <Text
                  style={[
                    type.title3,
                    { color: selected ? colours.ink : colours.inkMuted, fontWeight: selected ? '700' : '500' },
                  ]}>
                  {item.label}
                </Text>
                <View
                  style={[styles.underline, { backgroundColor: selected ? colours.brand : 'transparent' }]}
                />
              </Pressable>
            );
          })}
        </View>

        {tab === 'progress' ? (
          <>
            <CurrentRoutineCard enrolment={data.enrolment} roadmap={data.roadmap} isPro={isPro} />

            {isEmpty ? (
              <EmptyState
                icon="trending-up-outline"
                title="Your progress starts here"
                body="Finish your first session and your personal bests, lifts and weeks will appear here."
              />
            ) : (
              <>
                <View style={card}>
                  <Text style={[type.title, { color: colours.ink }]}>Personal bests</Text>
                  {bests.map((best) => (
                    <View
                      key={best.exerciseId}
                      style={[styles.bestRow, { borderTopColor: colours.border }]}>
                      <View style={styles.flex}>
                        <Text style={[type.body, { color: colours.ink, fontWeight: '600' }]}>
                          {best.exerciseName}
                        </Text>
                        <Text style={[type.title3, { color: colours.accent, marginTop: 2 }]}>
                          {describeBest(best)}
                        </Text>
                        {best.estimatedMaxKg !== null ? (
                          <Text style={[type.caption, { color: colours.inkMuted, marginTop: 2 }]}>
                            Estimated 1-rep max: {formatKg(best.estimatedMaxKg)}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={[type.caption, { color: colours.inkMuted }]}>
                        {formatShortDate(parseDate(best.date))}
                      </Text>
                    </View>
                  ))}
                  <Text style={[type.caption, { color: colours.inkMuted }]}>
                    Estimated 1-rep max is worked out from your best set of up to 12 reps. There’s no need
                    to test it.
                  </Text>
                </View>

                {isPro ? (
                  <View style={card}>
                    <Text style={[type.title, { color: colours.ink }]}>Sessions per week</Text>
                    <WeeklyBars weeks={weeks} />
                  </View>
                ) : (
                  <ProCard
                    reason="charts"
                    title="See your progress over time"
                    copy="With Pro, chart your sessions each week and the weight on every lift."
                  />
                )}

                {isPro && lift ? (
                  <View style={card}>
                    <Text style={[type.title, { color: colours.ink }]}>
                      {lift.assisted ? 'Help over time' : 'Weight over time'}
                    </Text>
                    <Pressable
                      ref={liftPickerRef}
                      collapsable={false}
                      style={({ pressed }) => [
                        styles.picker,
                        { backgroundColor: colours.brandSoft, borderRadius: radius.full },
                        pressed && styles.pressed,
                      ]}
                      onPress={() => {
                        measureAnchor(liftPickerRef.current, (rect) => {
                          setPickerAnchor(rect);
                          setIsPickerOpen(true);
                        });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Lift: ${lift.exerciseName}. Change lift`}>
                      <Text style={[type.body, { color: colours.brand, fontWeight: '700', flex: 1 }]} numberOfLines={1}>
                        {lift.exerciseName}
                      </Text>
                      <Ionicons
                        name={isPickerOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colours.brand}
                      />
                    </Pressable>
                    <LineChart
                      points={history.map((point) => ({
                        x: parseDate(point.date).getTime(),
                        y: point.kg,
                      }))}
                      formatX={(x) => formatShortDate(new Date(x))}
                      formatY={(y) => `${Math.round(y)} kg`}
                    />
                    <Text style={[type.bodySm, { color: colours.inkMuted }]}>
                      {describeChange(history, lift.assisted)}
                    </Text>
                  </View>
                ) : null}
              </>
            )}

            {isPro ? (
              <RoutineReviewCard
                enrolment={data.completedEnrolment}
                sessions={data.completedRoutineSessions}
                review={data.review}
                nextRoutine={data.nextPathRoutine}
              />
            ) : data.completedEnrolment ? (
              <ProCard
                reason="review"
                title="End-of-routine review"
                copy="You finished a routine. Pro unlocks a short review of how it went."
              />
            ) : null}

            {isPro ? (
              <View style={card}>
                <Text style={[type.title, { color: colours.ink }]}>Progress photos</Text>
                <Text style={[type.bodySm, { color: colours.inkMuted }]}>
                  Optional, private, and never sent to AI. Hidden until you choose to show them.
                </Text>
                {data.photosError ? (
                  <Text style={[type.caption, { color: colours.inkMuted }]}>{data.photosError}</Text>
                ) : null}
                {showPhotos ? (
                  <>
                    <TextButton
                      label="Hide photos"
                      onPress={() => {
                        setShowPhotos(false);
                        setCompareIds([]);
                      }}
                    />
                    <View style={styles.photoActions}>
                      <SecondaryButton
                        label="Camera"
                        onPress={() => void pickPhoto('camera')}
                        disabled={isPhotoBusy}
                        style={styles.photoAction}
                      />
                      <SecondaryButton
                        label="Library"
                        onPress={() => void pickPhoto('library')}
                        disabled={isPhotoBusy}
                        style={styles.photoAction}
                      />
                    </View>
                    {isPhotoBusy ? <ActivityIndicator color={colours.brand} /> : null}
                    {comparePhotos.length === 2 ? (
                      <View style={styles.compareRow}>
                        {comparePhotos.map((photo) => (
                          <View key={photo.id} style={styles.flex}>
                            {photo.url ? (
                              <Image source={{ uri: photo.url }} style={[styles.compareImage, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]} />
                            ) : (
                              <View style={[styles.compareImage, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]} />
                            )}
                            <Text style={[type.caption, { color: colours.inkMuted, marginTop: 6 }]}>
                              {formatShortDate(parseDate(photo.taken_on))}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {data.photos.length === 0 ? (
                      <Text style={[type.bodySm, { color: colours.inkMuted }]}>
                        No photos yet. Add one when you want.
                      </Text>
                    ) : (
                      data.photos.map((photo) => {
                        const selected = compareIds.includes(photo.id);
                        return (
                          <View key={photo.id} style={styles.photoRow}>
                            {photo.url ? (
                              <Image
                                source={{ uri: photo.url }}
                                style={[styles.photoThumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}
                              />
                            ) : (
                              <View
                                style={[styles.photoThumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}
                              />
                            )}
                            <View style={styles.flex}>
                              <Text style={[type.body, { color: colours.ink, fontWeight: '600' }]}>
                                {formatShortDate(parseDate(photo.taken_on))}
                              </Text>
                              <TextButton
                                label={selected ? 'Remove from compare' : 'Compare'}
                                onPress={() =>
                                  setCompareIds((current) => {
                                    if (current.includes(photo.id)) {
                                      return current.filter((id) => id !== photo.id);
                                    }
                                    return current.length >= 2
                                      ? [current[1], photo.id]
                                      : [...current, photo.id];
                                  })
                                }
                                style={styles.inlineAction}
                              />
                            </View>
                            <Pressable
                              onPress={() => confirmDeletePhoto(photo)}
                              accessibilityRole="button"
                              accessibilityLabel="Delete photo">
                              <Ionicons name="trash-outline" size={22} color={colours.inkMuted} />
                            </Pressable>
                          </View>
                        );
                      })
                    )}
                    {data.photos.length > 0 ? (
                      <DestructiveTextButton
                        label="Delete all photos"
                        onPress={() => confirmDeleteAll(data.photos)}
                      />
                    ) : null}
                  </>
                ) : (
                  <TextButton label="Show photos" onPress={() => setShowPhotos(true)} />
                )}
              </View>
            ) : (
              <ProCard
                reason="photos"
                title="Progress photos"
                copy="With Pro, keep private photos on this phone account. They stay hidden until you tap Show photos."
              />
            )}
          </>
        ) : (
          <>
            <AchievementGroup
              title="Sessions"
              progress={nextStep(data.sessions.length, SESSION_THRESHOLDS)}
              badges={pickBadges(badges, SESSION_IDS)}
            />
            <AchievementGroup
              title="Streaks"
              progress={nextStep(data.streak.current, STREAK_THRESHOLDS)}
              badges={pickBadges(badges, STREAK_IDS)}
            />
            <AchievementGroup
              title="Weight lifted"
              progress={
                weightProgress
                  ? {
                      label: `${formatTotalKg(liftedKg)} towards ${formatTotalKg(weightTarget)}`,
                      ratio: weightProgress.ratio,
                    }
                  : null
              }
              badges={[]}
              empty="Ticked weighted sets add up here. Badge tiers come next."
            />
            <AchievementGroup
              title="Personal bests"
              progress={nextStep(bests.length, [1, 10, 50, 100])}
              badges={pickBadges(badges, PB_IDS)}
            />
            <AchievementGroup
              title="Programmes"
              progress={nextStep(
                data.completedEnrolment ? Math.max(1, data.completedRoutines) : data.completedRoutines,
                [1, 3, 10]
              )}
              badges={pickBadges(badges, PROGRAMME_IDS)}
            />
            <View style={card}>
              <Text style={[type.title, { color: colours.ink }]}>Gym unlocked</Text>
              <Text style={[type.bodySm, { color: colours.inkMuted }]}>
                Every new exercise and piece of kit you tick in a finished session counts.
              </Text>
              <View style={styles.gymStats}>
                <StatTile
                  value={String(gym.exerciseCount)}
                  label={gym.exerciseCount === 1 ? 'exercise tried' : 'exercises tried'}
                  style={styles.statFlex}
                />
                <StatTile
                  value={String(gym.equipmentCount)}
                  label={gym.equipmentCount === 1 ? 'type of equipment' : 'types of equipment'}
                  style={styles.statFlex}
                />
              </View>
              {gymProgress ? (
                <>
                  <Text style={[type.caption, { color: colours.inkMuted }]}>
                    {gymProgress.label} exercises
                  </Text>
                  <ProgressBar progress={gymProgress.ratio} />
                </>
              ) : null}
              <BadgeGrid badges={gym.badges} />
            </View>
          </>
        )}
      </ScrollView>

      <OverflowMenu visible={isPickerOpen} anchor={pickerAnchor} onClose={() => setIsPickerOpen(false)}>
        {liftOptions.map((option) => (
          <MenuRow
            key={option.exerciseId}
            label={option.exerciseName}
            detail={`${option.sessionCount} ${option.sessionCount === 1 ? 'session' : 'sessions'}`}
            selected={option.exerciseId === lift?.exerciseId}
            onPress={() => {
              setLiftId(option.exerciseId);
              setIsPickerOpen(false);
            }}
          />
        ))}
      </OverflowMenu>
    </View>
  );
}

function CurrentRoutineCard({
  enrolment,
  roadmap,
  isPro,
}: {
  enrolment: RoutineEnrolment | null;
  roadmap: RoadmapWeek[];
  isPro: boolean;
}) {
  const { colours, radius, shadow, type } = useTheme();
  const showProBadge = Boolean(enrolment?.routine.is_pro && !isPro);
  const week = enrolment ? currentEnrolmentWeek(enrolment) : 0;
  const totalDays = enrolment
    ? Math.max(1, enrolment.routine.length_weeks * enrolment.routine.days_per_week)
    : 1;
  const doneDays = roadmap.reduce((count, item) => count + item.days.filter((day) => day.done).length, 0);

  return (
    <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
      <View style={styles.titleRow}>
        <Text style={[type.eyebrow, { color: colours.accent }]}>Current routine</Text>
        {showProBadge ? <ProBadge locked compact /> : null}
      </View>
      {enrolment ? (
        <>
          <Text style={[type.title, { color: colours.ink }]}>{enrolment.routine.name}</Text>
          <Text style={[type.bodySm, { color: colours.inkMuted }]}>
            Week {week} of {enrolment.routine.length_weeks}
          </Text>
          <ProgressBar progress={doneDays / totalDays} />
          {isPro
            ? roadmap.map((item) => (
                <View key={item.weekNumber} style={[styles.roadmapWeek, { borderTopColor: colours.border }]}>
                  <Text
                    style={[
                      type.body,
                      { color: item.current ? colours.brand : colours.ink, fontWeight: '600' },
                    ]}>
                    Week {item.weekNumber}
                    {item.current ? ' · now' : ''}
                    {item.checkpoint ? ' · checkpoint' : ''}
                  </Text>
                  {item.days.map((day) => (
                    <View key={day.id} style={styles.roadmapDay}>
                      <Ionicons
                        name={day.done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={18}
                        color={day.done ? colours.success : colours.border}
                      />
                      <Text style={[type.bodySm, { color: colours.inkMuted }]}>{day.name}</Text>
                    </View>
                  ))}
                </View>
              ))
            : null}
        </>
      ) : (
        <Text style={[type.bodySm, { color: colours.inkMuted }]}>
          Start a routine from Programmes and your weeks will show here.
        </Text>
      )}
    </View>
  );
}

function ProCard({
  title,
  copy,
  reason,
}: {
  title: string;
  copy: string;
  reason: PaywallReason;
}) {
  const { colours, radius, shadow, type } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
      <ProBadge locked />
      <Text style={[type.title, { color: colours.ink }]}>{title}</Text>
      <Text style={[type.bodySm, { color: colours.inkMuted }]}>{copy}</Text>
      <SecondaryButton label="See Pro" onPress={() => openPaywall(reason)} />
    </View>
  );
}

function RoutineReviewCard({
  enrolment,
  sessions,
  review,
  nextRoutine,
}: {
  enrolment: RoutineEnrolment | null;
  sessions: number;
  review: EnrolmentReview | null;
  nextRoutine: RoutineSummary | null;
}) {
  const { colours, radius, shadow, type } = useTheme();
  if (!enrolment) return null;
  return (
    <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
      <Text style={[type.title, { color: colours.ink }]}>End-of-routine review</Text>
      <Text style={[type.body, { color: colours.ink, fontWeight: '600' }]}>{enrolment.routine.name}</Text>
      <Text style={[type.bodySm, { color: colours.inkMuted }]}>
        You finished this plan
        {enrolment.completed_at
          ? ` on ${formatShortDate(parseDate(enrolment.completed_at.slice(0, 10)))}`
          : ''}
        . {review ? describeReview(review) : `${sessions} ${sessions === 1 ? 'session' : 'sessions'} logged.`}
      </Text>
      {review?.lifts.map((lift) => (
        <Text key={lift.exerciseId} style={[type.bodySm, { color: colours.inkMuted }]}>
          {formatLiftCompare(lift)}
        </Text>
      ))}
      {nextRoutine ? (
        <Text style={[type.caption, { color: colours.inkMuted }]}>Next on your path: {nextRoutine.name}.</Text>
      ) : (
        <Text style={[type.caption, { color: colours.inkMuted }]}>
          That’s a full routine. Start another when you’re ready.
        </Text>
      )}
    </View>
  );
}

function AchievementGroup({
  title,
  progress,
  badges,
  empty,
}: {
  title: string;
  progress: { label: string; ratio: number } | null;
  badges: AchievementBadge[];
  empty?: string;
}) {
  const { colours, radius, shadow, type } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
      <Text style={[type.title, { color: colours.ink }]}>{title}</Text>
      {progress ? (
        <>
          <Text style={[type.caption, { color: colours.inkMuted }]}>{progress.label}</Text>
          <ProgressBar progress={progress.ratio} />
        </>
      ) : null}
      {badges.length > 0 ? (
        <BadgeGrid badges={badges} />
      ) : empty ? (
        <Text style={[type.bodySm, { color: colours.inkMuted }]}>{empty}</Text>
      ) : null}
    </View>
  );
}

function BadgeGrid({ badges }: { badges: AchievementBadge[] }) {
  const { colours, type } = useTheme();
  return (
    <View style={styles.badgeGrid}>
      {badges.map((badge) => (
        <View key={badge.id} style={styles.badgeCell}>
          <BadgeMark unlocked={badge.unlocked} label={badge.title}>
            <Ionicons
              name={badgeIcon(badge.id)}
              size={22}
              color={badge.unlocked ? colours.onBrand : colours.inkMuted}
            />
          </BadgeMark>
          <Text
            style={[
              type.caption,
              {
                color: badge.unlocked ? colours.ink : colours.inkMuted,
                textAlign: 'center',
                marginTop: 8,
              },
            ]}
            numberOfLines={2}>
            {badge.title}
          </Text>
        </View>
      ))}
    </View>
  );
}

function describeChange(history: { kg: number }[], assisted: boolean): string {
  if (history.length < 2) {
    return 'Your chart grows each time you do this lift.';
  }
  const first = history[0].kg;
  const latest = history[history.length - 1].kg;
  const change = latest - first;
  if (assisted) {
    return change < 0
      ? `Down from ${formatKg(first)} to ${formatKg(latest)} of help. Great progress.`
      : `Latest: ${formatKg(latest)} of help. Keep going.`;
  }
  return change > 0
    ? `Up from ${formatKg(first)} to ${formatKg(latest)} (+${formatKg(change)}). Great progress.`
    : `Latest: ${formatKg(latest)}. Every session counts.`;
}

function WeeklyBars({ weeks }: { weeks: WeekCount[] }) {
  const { colours, type } = useTheme();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scale = Math.max(MIN_BAR_SCALE, ...weeks.map((week) => week.count));
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={styles.bars}>
      {weeks.map((week, index) => {
        const isThisWeek = index === weeks.length - 1;
        const showLabel = (weeks.length - 1 - index) % 4 === 0;
        return (
          <View key={week.weekStart.getTime()} style={styles.barColumn}>
            <View style={styles.barArea}>
              {week.count > 0 ? (
                <Text style={[type.caption, { color: colours.accent, fontWeight: '700', marginBottom: 4 }]}>
                  {week.count}
                </Text>
              ) : null}
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(4, (week.count / scale) * (BAR_AREA_HEIGHT - 20)),
                    backgroundColor: week.count === 0 ? colours.border : colours.accent,
                  },
                ]}
              />
            </View>
            <Text style={[styles.barLabel, type.caption, { color: colours.inkMuted }]} numberOfLines={1}>
              {isThisWeek ? 'Now' : showLabel ? formatShortDate(week.weekStart) : ''}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 32,
    gap: 16,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  retry: {
    alignSelf: 'stretch',
    marginTop: 12,
  },
  stats: {
    flexDirection: 'row',
    gap: 10,
  },
  statFlex: {
    flex: 1,
    minWidth: 0,
    padding: 12,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    padding: 20,
    gap: 12,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  bestTile: {
    minWidth: 88,
    maxWidth: 108,
    padding: 12,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -24,
    paddingHorizontal: 24,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 8,
    gap: 8,
  },
  underline: {
    height: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  bars: {
    alignItems: 'flex-end',
    gap: BAR_GAP,
    paddingTop: 4,
    paddingHorizontal: BAR_WIDTH,
  },
  barColumn: {
    width: BAR_WIDTH,
    alignItems: 'center',
    overflow: 'visible',
  },
  barArea: {
    height: BAR_AREA_HEIGHT,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 6,
  },
  barLabel: {
    width: BAR_WIDTH * 3,
    textAlign: 'center',
    marginTop: 6,
  },
  bestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 8,
  },
  photoAction: {
    flex: 1,
    minHeight: 48,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  photoThumb: {
    width: 64,
    height: 64,
  },
  compareRow: {
    flexDirection: 'row',
    gap: 10,
  },
  compareImage: {
    width: '100%',
    aspectRatio: 3 / 4,
  },
  inlineAction: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 0,
  },
  gymStats: {
    flexDirection: 'row',
    gap: 10,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeCell: {
    width: '30%',
    alignItems: 'center',
  },
  roadmapWeek: {
    gap: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  roadmapDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pressed: {
    opacity: 0.8,
  },
});
