import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, type Href } from 'expo-router';
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
  BadgeSheet,
  DestructiveTextButton,
  HighlightTile,
  MenuRow,
  OverflowMenu,
  ProBadge,
  ProgressBar,
  SecondaryButton,
  SectionHeader,
  StreakCard,
  TextButton,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  countEarnedAwards,
  fetchHideAchievements,
  formatBadgeProgress,
  getAchievementGroups,
  nextBadgeInGroup,
  type AchievementBadge,
  type AchievementFamily,
} from '@/lib/achievements';
import {
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
import { fetchHideStreak, fetchRestWeekStarts, maybeTrackStreakRepair, syncRestWeeksBanked } from '@/lib/streak';
import { fetchBackOnTrack } from '@/lib/welcomeBack';
import { openPaywall, type PaywallReason } from '@/lib/paywall';
import {
  fetchPlannedCountsByWeek,
  fetchThisWeekProgress,
  toIso,
  type WeekPlanProgress,
} from '@/lib/planner';
import { formatKg } from '@/lib/programmes';
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
  fetchPhotosEnabled,
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
  hideStreak: boolean;
  hideAchievements: boolean;
  photosEnabled: boolean;
  backOnTrack: boolean;
  backOnTrackAt: string | null;
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

const TABS = [
  { id: 'progress', label: 'Progress' },
  { id: 'achievements', label: 'Awards' },
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

function hoursTileValue(seconds: number): string {
  if (seconds <= 0) return '0';
  return formatTrainingHours(seconds).replace(/ h$/, '');
}

function familyIcon(family: AchievementFamily): IconName {
  switch (family) {
    case 'firsts':
      return 'sparkles-outline';
    case 'sessions':
      return 'barbell-outline';
    case 'weeks':
      return 'calendar-outline';
    case 'pbs':
      return 'trophy-outline';
    case 'programmes':
      return 'ribbon-outline';
    case 'gym':
      return 'walk-outline';
    case 'weight':
      return 'fitness-outline';
  }
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
  const [openBadge, setOpenBadge] = useState<AchievementBadge | null>(null);
  const showPhotosRef = useRef(showPhotos);
  showPhotosRef.current = showPhotos;

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      (async () => {
        try {
          const [sets, sessions, weekProgress, goal, enrolment, completedEnrolment, completedRoutines, hideStreak, hideAchievements, photosEnabled, restWeeks, backOnTrack] =
            await Promise.all([
              fetchProgressSets(),
              fetchFinishedSessionMeta(),
              fetchThisWeekProgress().catch(() => ({ completed: 0, planned: 0 })),
              fetchStreakGoal(),
              fetchActiveEnrolment().catch(() => null),
              fetchLatestCompletedEnrolment().catch(() => null),
              fetchCompletedEnrolmentCount().catch(() => 0),
              fetchHideStreak().catch(() => false),
              fetchHideAchievements().catch(() => false),
              fetchPhotosEnabled().catch(() => false),
              fetchRestWeekStarts().catch(() => new Set<string>()),
              fetchBackOnTrack().catch(() => ({ unlocked: false, at: null as string | null })),
            ]);
          const from = sessions[0]?.date ?? toIso(new Date());
          const [plannedByWeek, roadmap, completedRoutineSessions] = await Promise.all([
            fetchPlannedCountsByWeek(from, toIso(new Date())),
            enrolment ? fetchRoutineRoadmap(enrolment).catch(() => []) : Promise.resolve([]),
            completedEnrolment
              ? countEnrolmentSessions(completedEnrolment.id).catch(() => 0)
              : Promise.resolve(0),
          ]);
          const fallbackTarget = answers?.days_per_week || enrolment?.routine.days_per_week || 3;
          const streak = getWeeklyStreak(sessions, plannedByWeek, fallbackTarget, goal, restWeeks);
          void syncRestWeeksBanked(streak.restWeeksBanked);
          void maybeTrackStreakRepair(streak);
          const review = completedEnrolment
            ? await fetchEnrolmentReview(completedEnrolment, sessions, sets).catch(() => null)
            : null;
          const pathNext = completedEnrolment
            ? await nextRoutineOnPath(completedEnrolment.routine_id).catch(() => null)
            : null;
          if (!isCurrent) return;
          if (!photosEnabled) {
            setShowPhotos(false);
            setCompareIds([]);
          }
          setData({
            sets,
            sessions,
            weekProgress,
            streak,
            hideStreak,
            hideAchievements,
            photosEnabled,
            backOnTrack: backOnTrack.unlocked,
            backOnTrackAt: backOnTrack.at,
            enrolment,
            completedEnrolment,
            completedRoutineSessions,
            completedRoutines,
            roadmap,
            photos: [],
            photosError: null,
            review,
            nextPathRoutine: pathNext?.routine ?? null,
          });
          setLoadState('ready');
          if (photosEnabled && isPro && showPhotosRef.current) {
            try {
              const photos = await fetchProgressPhotos();
              if (isCurrent) {
                setData((current) => (current ? { ...current, photos, photosError: null } : current));
              }
            } catch (error) {
              if (isCurrent) {
                setData((current) =>
                  current ? { ...current, photosError: describePhotosError(error) } : current
                );
              }
            }
          }
        } catch {
          if (isCurrent) setLoadState((state) => (state === 'ready' ? state : 'error'));
        }
      })();
      return () => {
        isCurrent = false;
      };
    }, [attempt, answers?.days_per_week, isPro])
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
  const bests = getPersonalBests(data.sets);
  const liftOptions = getLiftOptions(data.sets);
  const lift = liftOptions.find((option) => option.exerciseId === liftId) ?? liftOptions[0];
  const history = lift ? getLiftHistory(data.sets, lift.exerciseId) : [];
  const weeks = getWeeklyCounts(
    data.sessions.filter(sessionCountsTowardStreak).map((session) => session.date)
  );
  const gym = getGymUnlocked(data.sets);
  const awardGroups = getAchievementGroups({
    sessions: data.sessions,
    sets: data.sets,
    streak: data.streak,
    completedRoutines: data.completedEnrolment ? Math.max(1, data.completedRoutines) : 0,
    gym,
    backOnTrack: data.backOnTrack,
    backOnTrackAt: data.backOnTrackAt,
  });
  const badges = awardGroups.flatMap((group) => group.badges);
  const comparePhotos = data.photos.filter((photo) => compareIds.includes(photo.id));
  const awardsEarned = countEarnedAwards(badges);
  const card = [styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow];

  const highlights = (
    <>
      <Text style={[type.title, { color: colours.ink }]}>Highlights</Text>
      <View style={styles.highlightRow}>
        <HighlightTile
          value={String(totals.sessions)}
          label={totals.sessions === 1 ? 'Session completed' : 'Sessions completed'}
          icon="barbell-outline"
          onPress={() => setTab('achievements')}
        />
        <HighlightTile
          value={hoursTileValue(totals.durationSeconds)}
          label="Hours trained"
          icon="time-outline"
        />
      </View>
      <View style={styles.highlightRow}>
        <HighlightTile
          value={String(bests.length)}
          label={bests.length === 1 ? 'Personal best' : 'Personal bests'}
          icon="trophy-outline"
        />
        <HighlightTile
          value={String(awardsEarned)}
          label={awardsEarned === 1 ? 'Award earned' : 'Awards earned'}
          icon="medal-outline"
          onPress={() => setTab('achievements')}
        />
      </View>
    </>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <View style={styles.header}>
        <Text style={[type.display, { color: colours.ink }]}>Activity</Text>
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
                    type.body,
                    {
                      color: selected ? colours.accent : colours.inkMuted,
                      fontWeight: selected ? '700' : '500',
                    },
                  ]}>
                  {item.label}
                </Text>
                <View
                  style={[styles.underline, { backgroundColor: selected ? colours.accent : 'transparent' }]}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        {tab === 'progress' ? (
          <>
            {highlights}

            {data.weekProgress.planned > 0 ? (
              <Text style={[type.bodySm, { color: colours.inkMuted }]}>
                This week: {data.streak.doneThisWeek} of {data.weekProgress.planned}{' '}
                {data.weekProgress.planned === 1 ? 'workout' : 'workouts'}
              </Text>
            ) : null}

            {data.hideStreak ? null : <StreakCard streak={data.streak} />}

            <SectionHeader title="Your routine" />
            <CurrentRoutineCard enrolment={data.enrolment} roadmap={data.roadmap} isPro={isPro} />

            <SectionHeader title="Personal bests" />
            <View style={card}>
              {bests.length === 0 ? (
                <Text style={[type.bodySm, { color: colours.inkMuted }]}>
                  Finish a weighted session and your bests will land here.
                </Text>
              ) : (
                bests.map((best, index) => (
                  <View
                    key={best.exerciseId}
                    style={[
                      styles.goalRow,
                      index > 0 && { borderTopColor: colours.border, borderTopWidth: StyleSheet.hairlineWidth },
                    ]}>
                    <View style={[styles.goalIcon, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
                      <Ionicons name="trophy-outline" size={18} color={colours.accent} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[type.body, { color: colours.ink, fontWeight: '600' }]}>{best.exerciseName}</Text>
                      <Text style={[type.bodySm, { color: colours.accent, marginTop: 2 }]}>{describeBest(best)}</Text>
                    </View>
                    <Text style={[type.caption, { color: colours.inkMuted }]}>
                      {formatShortDate(parseDate(best.date))}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {isPro ? (
              weeks.filter((week) => week.count > 0).length >= 2 ? (
                <View style={card}>
                  <Text style={[type.title, { color: colours.ink }]}>Sessions per week</Text>
                  <WeeklyBars weeks={weeks} />
                </View>
              ) : null
            ) : (
              <ProCard
                reason="charts"
                title="See your progress over time"
                copy="With Pro, chart your sessions each week and the weight on every lift."
              />
            )}

            {isPro && lift && history.length >= 2 ? (
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

            {data.photosEnabled ? (
              isPro ? (
                <>
                  <SectionHeader title="Progress photos" />
                  <View style={card}>
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
                            setData((current) =>
                              current ? { ...current, photos: [], photosError: null } : current
                            );
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
                                  <Image
                                    source={{ uri: photo.url }}
                                    style={[
                                      styles.compareImage,
                                      { backgroundColor: colours.surfaceMuted, borderRadius: radius.md },
                                    ]}
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.compareImage,
                                      { backgroundColor: colours.surfaceMuted, borderRadius: radius.md },
                                    ]}
                                  />
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
                                    style={[
                                      styles.photoThumb,
                                      { backgroundColor: colours.surfaceMuted, borderRadius: radius.md },
                                    ]}
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.photoThumb,
                                      { backgroundColor: colours.surfaceMuted, borderRadius: radius.md },
                                    ]}
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
                      <TextButton
                        label="Show photos"
                        onPress={() => {
                          setShowPhotos(true);
                          void reloadPhotos();
                        }}
                      />
                    )}
                  </View>
                </>
              ) : (
                <ProCard
                  reason="photos"
                  title="Progress photos"
                  copy="With Pro, keep private photos on your account. Never sent to AI, and never shown in summaries or share cards."
                />
              )
            ) : null}

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
          </>
        ) : null}

        {tab === 'achievements' ? (
          data.hideAchievements ? (
            <Text style={[type.body, { color: colours.inkMuted }]}>
              Awards are hidden. You can turn them back on in Profile.
            </Text>
          ) : (
            awardGroups.map((group) => (
              <AwardGroup
                key={group.family}
                title={group.title}
                badges={group.badges}
                onOpen={setOpenBadge}
              />
            ))
          )
        ) : null}
      </ScrollView>

      <BadgeSheet
        visible={openBadge !== null}
        title={openBadge?.title ?? ''}
        body={openBadge?.detail ?? ''}
        meta={
          openBadge?.unlocked && openBadge.unlockedOn
            ? `Earned ${formatShortDate(parseDate(openBadge.unlockedOn))}.`
            : openBadge?.unlocked
              ? 'Earned.'
              : 'This one is still ahead.'
        }
        onClose={() => setOpenBadge(null)}
      />

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
  const currentWeek =
    roadmap.find((item) => item.current) ?? roadmap.find((item) => item.weekNumber === week) ?? null;

  function openPlan() {
    if (enrolment) {
      router.push({ pathname: '/routines/[id]', params: { id: enrolment.routine.id } } as Href);
      return;
    }
    router.push('/(tabs)/programmes' as Href);
  }

  return (
    <View>
      <Pressable
        onPress={openPlan}
        accessibilityRole="button"
        accessibilityLabel={enrolment ? enrolment.routine.name : 'Start a routine'}
        style={({ pressed }) => [pressed && styles.pressed]}>
        <View style={[{ borderRadius: radius.lg }, shadow]}>
          <View style={[styles.routineCard, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
            <View style={[styles.routineMark, { backgroundColor: colours.brand }]}>
              <Ionicons name="barbell-outline" size={22} color={colours.onBrand} />
            </View>
            <View style={[styles.flex, styles.routineBody]}>
              <View style={styles.routineTitleRow}>
                <Text style={[type.body, { color: colours.ink, fontWeight: '700', flex: 1 }]} numberOfLines={1}>
                  {enrolment ? enrolment.routine.name : 'No routine yet'}
                </Text>
                {showProBadge ? <ProBadge locked compact /> : null}
              </View>
              <Text style={[type.caption, { color: colours.inkMuted, marginTop: 2 }]}>
                {enrolment
                  ? `Week ${week} of ${enrolment.routine.length_weeks}`
                  : 'Start one from Programmes'}
              </Text>
              {enrolment ? <ProgressBar progress={doneDays / totalDays} style={{ marginTop: 8 }} /> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colours.brand} />
          </View>
        </View>
      </Pressable>
      {enrolment && currentWeek ? (
        <View style={[styles.roadmapWeek, { borderTopColor: colours.border }]}>
          <Text style={[type.bodySm, { color: colours.brand, fontWeight: '600' }]}>
            This week
            {currentWeek.checkpoint ? ' · checkpoint' : ''}
          </Text>
          {currentWeek.days.map((day) => (
            <View key={day.id} style={styles.roadmapDay}>
              <Ionicons
                name={day.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={day.done ? colours.success : colours.border}
              />
              <Text style={[type.caption, { color: colours.inkMuted }]}>{day.name}</Text>
            </View>
          ))}
          <TextButton label="See full plan" onPress={openPlan} style={styles.inlineAction} />
        </View>
      ) : enrolment ? (
        <TextButton label="See full plan" onPress={openPlan} style={styles.inlineAction} />
      ) : null}
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

function AwardGroup({
  title,
  badges,
  onOpen,
}: {
  title: string;
  badges: AchievementBadge[];
  onOpen: (badge: AchievementBadge) => void;
}) {
  const { colours, radius, shadow, type } = useTheme();
  const next = nextBadgeInGroup(badges);
  return (
    <View
      style={[
        styles.awardCard,
        { backgroundColor: colours.surface, borderRadius: radius.xl },
        shadow,
      ]}>
      <Text style={[type.title3, { color: colours.ink }]}>{title}</Text>
      <MedalRow badges={badges} nextId={next?.id ?? null} onOpen={onOpen} />
    </View>
  );
}

function MedalRow({
  badges,
  nextId = null,
  onOpen,
}: {
  badges: AchievementBadge[];
  nextId?: string | null;
  onOpen: (badge: AchievementBadge) => void;
}) {
  const { colours, type } = useTheme();
  return (
    <View style={styles.badgeGrid}>
      {badges.map((badge) => {
        const progress = badge.id === nextId ? formatBadgeProgress(badge) : null;
        return (
          <Pressable
            key={badge.id}
            style={styles.badgeCell}
            onPress={() => onOpen(badge)}
            accessibilityRole="button"
            accessibilityLabel={badge.unlocked ? badge.title : `${badge.title}, locked`}>
            <BadgeMark unlocked={badge.unlocked} label={badge.title} tier={badge.tier}>
              <Ionicons
                name={familyIcon(badge.family)}
                size={28}
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
            {progress ? (
              <Text style={[type.caption, { color: colours.inkMuted, marginTop: 2 }]}>{progress}</Text>
            ) : null}
          </Pressable>
        );
      })}
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  content: {
    padding: 20,
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
  flex: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    padding: 20,
    gap: 12,
  },
  highlightRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 8,
    gap: 8,
  },
  underline: {
    height: 2,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  routineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    gap: 12,
    paddingRight: 12,
    minHeight: 72,
  },
  routineMark: {
    width: 56,
    alignSelf: 'stretch',
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routineBody: {
    paddingVertical: 12,
  },
  routineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  goalIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  awardCard: {
    padding: 16,
    gap: 12,
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
    paddingTop: 10,
    marginTop: 4,
    paddingHorizontal: 4,
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
