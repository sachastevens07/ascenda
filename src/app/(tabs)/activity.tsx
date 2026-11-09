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
  View,
  type ScrollViewInstance,
} from 'react-native';

import { showDialog } from '@/components/Dialog';
import { LineChart } from '@/components/LineChart';
import { useTabBarHeight } from '@/components/PillTabBar';
import {
  AchievementBadge as BadgeMark,
  AppText,
  BadgeSheet,
  DestructiveTextButton,
  HighlightTile,
  MenuRow,
  OverflowMenu,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
  SectionHeader,
  StreakCard,
  TabAvatar,
  TextButton,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  countEarnedAwards,
  EMPTY_ACHIEVEMENT_EXTRAS,
  fetchAchievementExtras,
  fetchHideAchievements,
  formatBadgeProgress,
  formatRepeatCount,
  getAchievementGroups,
  nextBadgeInGroup,
  type AchievementBadge,
  type AchievementExtras,
  type AchievementFamily,
} from '@/lib/achievements';
import {
  fetchFinishedSessionMeta,
  fetchStreakGoal,
  formatTrainingHours,
  getActivityTotals,
  getWeeklyStreak,
  normalizeWeeklyTarget,
  sessionCountsTowardStreak,
  type FinishedSessionMeta,
  type WeeklyStreak,
} from '@/lib/activityStats';
import {
  cardioWeekMinutes,
  fetchCardioLogs,
  longestCardioMinutes,
  type CardioLog,
} from '@/lib/cardio';
import { cardioCopy, fillCopy, progressPhotosCopy, routineActionsCopy, streakCopy } from '@/lib/copy';
import { startOfWeekMonday, toIso } from '@/lib/planner';
import { equipmentFromMachinesUsed } from '@/lib/onboardingAnswers';
import { fetchHideStreak, maybeTrackStreakRepair } from '@/lib/streak';
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
  fetchEnrolmentReview,
  formatLiftCompare,
  type EnrolmentReview,
} from '@/lib/checkpoints';
import {
  handOffCardCopy,
  resolveNextRoutineOffer,
  startNextRoutineOnMonday,
  type NextRoutineOffer,
} from '@/lib/handOff';
import {
  countEnrolmentSessions,
  currentEnrolmentWeek,
  describeRoutineError,
  fetchActiveEnrolment,
  fetchCompletedEnrolmentCount,
  fetchLatestCompletedEnrolment,
  fetchRoutineRoadmap,
  fetchRoutines,
  type RoadmapWeek,
  type RoutineEnrolment,
} from '@/lib/routines';
import { useWeightUnit } from '@/lib/units';

type LoadState = 'loading' | 'error' | 'ready';
type ActivityTab = 'progress' | 'achievements';
type IconName = ComponentProps<typeof Ionicons>['name'];

type ActivityData = {
  sets: ProgressSet[];
  sessions: FinishedSessionMeta[];
  streak: WeeklyStreak;
  hideStreak: boolean;
  hideAchievements: boolean;
  photosEnabled: boolean;
  extras: AchievementExtras;
  enrolment: RoutineEnrolment | null;
  completedEnrolment: RoutineEnrolment | null;
  completedRoutineSessions: number;
  completedRoutines: number;
  roadmap: RoadmapWeek[];
  photos: ProgressPhoto[];
  photosError: string | null;
  review: EnrolmentReview | null;
  nextOffer: NextRoutineOffer | null;
  cardioLogs: CardioLog[];
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
    case 'first_times':
      return 'sparkles-outline';
    case 'sessions':
      return 'barbell-outline';
    case 'weeks':
      return 'calendar-outline';
    case 'consistency':
      return 'flame-outline';
    case 'personal_bests':
      return 'trophy-outline';
    case 'programmes':
      return 'ribbon-outline';
    case 'gym_unlocked':
      return 'walk-outline';
    case 'stretch':
      return 'leaf-outline';
    case 'weight_lifted':
      return 'fitness-outline';
  }
}

export default function ActivityScreen() {
  const tabBarHeight = useTabBarHeight();
  const { colours, radius, shadow } = useTheme();
  useWeightUnit();
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
  const [startingNext, setStartingNext] = useState(false);
  const showPhotosRef = useRef(showPhotos);
  showPhotosRef.current = showPhotos;

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      (async () => {
        try {
          const [sets, sessions, goal, enrolment, completedEnrolment, completedRoutines, hideStreak, hideAchievements, photosEnabled, extras, cardioLogs] =
            await Promise.all([
              fetchProgressSets(),
              fetchFinishedSessionMeta(),
              fetchStreakGoal(),
              fetchActiveEnrolment().catch(() => null),
              fetchLatestCompletedEnrolment().catch(() => null),
              fetchCompletedEnrolmentCount().catch(() => 0),
              fetchHideStreak().catch(() => false),
              fetchHideAchievements().catch(() => false),
              fetchPhotosEnabled().catch(() => false),
              fetchAchievementExtras(
                equipmentFromMachinesUsed(profile?.onboarding_answers?.machines_used)
              ).catch(() => ({
                ...EMPTY_ACHIEVEMENT_EXTRAS,
                knownEquipment: equipmentFromMachinesUsed(profile?.onboarding_answers?.machines_used),
              })),
              fetchCardioLogs().catch(() => []),
            ]);
          const [roadmap, completedRoutineSessions] = await Promise.all([
            enrolment ? fetchRoutineRoadmap(enrolment).catch(() => []) : Promise.resolve([]),
            completedEnrolment
              ? countEnrolmentSessions(completedEnrolment.id).catch(() => 0)
              : Promise.resolve(0),
          ]);
          const streak = getWeeklyStreak(
            sessions,
            normalizeWeeklyTarget(answers?.days_per_week),
            goal
          );
          void maybeTrackStreakRepair(streak);
          const review = completedEnrolment
            ? await fetchEnrolmentReview(completedEnrolment, sessions, sets).catch(() => null)
            : null;
          const catalogue = completedEnrolment ? await fetchRoutines().catch(() => []) : [];
          const nextOffer = completedEnrolment
            ? await resolveNextRoutineOffer({
                currentRoutineId: completedEnrolment.routine_id,
                catalogue,
                answers,
                mode: enrolment ? 'preview' : 'start',
              }).catch(() => null)
            : null;
          if (!isCurrent) return;
          if (!photosEnabled) {
            setShowPhotos(false);
            setCompareIds([]);
          }
          setData({
            sets,
            sessions,
            streak,
            hideStreak,
            hideAchievements,
            photosEnabled,
            extras,
            enrolment,
            completedEnrolment,
            completedRoutineSessions,
            completedRoutines,
            roadmap,
            photos: [],
            photosError: null,
            review,
            nextOffer,
            cardioLogs,
          });
          setLoadState('ready');
          if (photosEnabled && showPhotosRef.current) {
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
    }, [attempt, answers?.days_per_week, profile?.onboarding_answers?.machines_used])
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
    showDialog(progressPhotosCopy.delete_one_title, progressPhotosCopy.delete_body, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: progressPhotosCopy.delete_cta,
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
    showDialog(progressPhotosCopy.delete_all_title, progressPhotosCopy.delete_body, [
      { text: 'Keep them', style: 'cancel' },
      {
        text: progressPhotosCopy.delete_cta,
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

  async function startNextFromReview() {
    const offer = data?.nextOffer;
    if (!offer || offer.mode !== 'start') return;
    setStartingNext(true);
    try {
      await startNextRoutineOnMonday(offer.routine);
      setAttempt((count) => count + 1);
    } catch (error) {
      showDialog('Could not start that plan', describeRoutineError(error));
    } finally {
      setStartingNext(false);
    }
  }

  if (loadState !== 'ready' || !data) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <>
            <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
              We couldn’t load your activity. Check your connection and try again.
            </AppText>
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
  const awardGroups = getAchievementGroups({
    sessions: data.sessions,
    sets: data.sets,
    streak: data.streak,
    completedRoutines: data.completedEnrolment ? Math.max(1, data.completedRoutines) : 0,
    extras: data.extras,
  });
  const badges = awardGroups.flatMap((group) => group.badges);
  const comparePhotos = data.photos.filter((photo) => compareIds.includes(photo.id));
  const awardsEarned = countEarnedAwards(badges);
  const card = [styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow];

  const highlights = (
    <>
      <AppText variant="title2" style={{ color: colours.ink }}>Highlights</AppText>
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
        <View style={styles.titleRow}>
          <TabAvatar />
          <AppText variant="title1" style={{ color: colours.ink, flex: 1 }}>Activity</AppText>
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
                <AppText
                  variant={selected ? 'bodyStrong' : 'body'}
                  style={{ color: selected ? colours.accent : colours.inkMuted }}>
                  {item.label}
                </AppText>
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

            <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
              {fillCopy(streakCopy.this_week_progress, {
                done: data.streak.doneThisWeek,
                target: data.streak.targetThisWeek,
              })}
            </AppText>

            {data.hideStreak ? null : <StreakCard streak={data.streak} />}

            <SectionHeader title="Your routine" />
            <CurrentRoutineCard enrolment={data.enrolment} roadmap={data.roadmap} />

            <CardioProgressCard logs={data.cardioLogs} />

            <SectionHeader title="Personal bests" />
            <View style={card}>
              {bests.length === 0 ? (
                <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                  Finish a weighted session and your bests will land here.
                </AppText>
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
                      <AppText variant="bodyStrong" style={{ color: colours.ink }}>{best.exerciseName}</AppText>
                      <AppText variant="bodySm" style={{ color: colours.accent, marginTop: 2 }}>{describeBest(best)}</AppText>
                    </View>
                    <AppText variant="caption" style={{ color: colours.inkMuted }}>
                      {formatShortDate(parseDate(best.date))}
                    </AppText>
                  </View>
                ))
              )}
            </View>

            {weeks.filter((week) => week.count > 0).length >= 2 ? (
              <View style={card}>
                <AppText variant="title2" style={{ color: colours.ink }}>Sessions per week</AppText>
                <WeeklyBars weeks={weeks} />
              </View>
            ) : null}

            {lift && history.length >= 2 ? (
              <View style={card}>
                <AppText variant="title2" style={{ color: colours.ink }}>
                  {lift.assisted ? 'Help over time' : 'Weight over time'}
                </AppText>
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
                  <AppText variant="bodyStrong" style={{ color: colours.brand, flex: 1 }} numberOfLines={1}>
                    {lift.exerciseName}
                  </AppText>
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
                <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                  {describeChange(history, lift.assisted)}
                </AppText>
              </View>
            ) : null}

            {data.photosEnabled ? (
                <>
                  <SectionHeader title="Progress photos" />
                  <View style={card}>
                    <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                      Optional, private, and never sent to AI. Hidden until you choose to show them.
                    </AppText>
                    {data.photosError ? (
                      <AppText variant="caption" style={{ color: colours.inkMuted }}>{data.photosError}</AppText>
                    ) : null}
                    {showPhotos ? (
                      <>
                        <TextButton
                          label={progressPhotosCopy.hide}
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
                            appearance="outline"
                            onPress={() => void pickPhoto('camera')}
                            disabled={isPhotoBusy}
                            style={styles.photoAction}
                          />
                          <SecondaryButton
                            label="Library"
                            appearance="outline"
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
                                <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 6 }}>
                                  {formatShortDate(parseDate(photo.taken_on))}
                                </AppText>
                              </View>
                            ))}
                          </View>
                        ) : null}
                        {data.photos.length === 0 ? (
                          <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                            No photos yet. Add one when you want.
                          </AppText>
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
                                  <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                                    {formatShortDate(parseDate(photo.taken_on))}
                                  </AppText>
                                  <TextButton
                                    label={selected ? 'Remove from compare' : progressPhotosCopy.compare}
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
                        label={progressPhotosCopy.show}
                        onPress={() => {
                          setShowPhotos(true);
                          void reloadPhotos();
                        }}
                      />
                    )}
                  </View>
                </>
            ) : null}

            <RoutineReviewCard
              enrolment={data.completedEnrolment}
              sessions={data.completedRoutineSessions}
              review={data.review}
              next={data.nextOffer}
              canStart={!data.enrolment && data.nextOffer?.mode === 'start'}
              starting={startingNext}
              onStart={() => void startNextFromReview()}
            />
          </>
        ) : null}

        {tab === 'achievements' ? (
          data.hideAchievements ? (
            <AppText variant="body" style={{ color: colours.inkMuted }}>
              Awards are hidden. You can turn them back on in Profile.
            </AppText>
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
            ? [
                formatRepeatCount(openBadge),
                `Earned ${formatShortDate(parseDate(openBadge.unlockedOn))}.`,
              ]
                .filter(Boolean)
                .join(' ')
            : openBadge?.unlocked
              ? formatRepeatCount(openBadge) ?? 'Earned.'
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

function CardioProgressCard({ logs }: { logs: CardioLog[] }) {
  const { colours, radius, shadow } = useTheme();
  const weekStart = toIso(startOfWeekMonday(new Date()));
  const weekMinutes = Math.round(cardioWeekMinutes(logs, weekStart));
  const longest = Math.round(longestCardioMinutes(logs));
  const effortPoints = logs
    .filter((log) => log.effort != null)
    .map((log) => ({
      x: Date.parse(log.createdAt) || parseDate(log.createdAt.slice(0, 10)).getTime(),
      y: log.effort ?? 0,
    }))
    .filter((point) => Number.isFinite(point.x));

  return (
    <>
      <SectionHeader title={cardioCopy.activity_title} />
      <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
        {logs.length === 0 ? (
          <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
            {cardioCopy.activity_empty}
          </AppText>
        ) : (
          <>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {fillCopy(cardioCopy.activity_week, { minutes: weekMinutes })}
            </AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
              {fillCopy(cardioCopy.activity_longest, { minutes: longest })}
            </AppText>
            {effortPoints.length >= 2 ? (
              <>
                <AppText variant="bodyStrong" style={{ color: colours.ink, marginTop: 16 }}>
                  {cardioCopy.activity_effort}
                </AppText>
                <LineChart
                  points={effortPoints}
                  formatX={(x) => formatShortDate(new Date(x))}
                  formatY={(y) => String(Math.round(y))}
                  height={160}
                />
              </>
            ) : null}
          </>
        )}
      </View>
    </>
  );
}

function CurrentRoutineCard({
  enrolment,
  roadmap,
}: {
  enrolment: RoutineEnrolment | null;
  roadmap: RoadmapWeek[];
}) {
  const { colours, radius, shadow } = useTheme();
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
                <AppText variant="bodyStrong" style={{ color: colours.ink, flex: 1 }} numberOfLines={1}>
                  {enrolment ? enrolment.routine.name : 'No routine yet'}
                </AppText>
              </View>
              <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 2 }}>
                {enrolment
                  ? `Week ${week} of ${enrolment.routine.length_weeks}`
                  : 'Start one from Programmes'}
              </AppText>
              {enrolment ? <ProgressBar progress={doneDays / totalDays} style={{ marginTop: 8 }} /> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colours.brand} />
          </View>
        </View>
      </Pressable>
      {enrolment && currentWeek ? (
        <View style={[styles.roadmapWeek, { borderTopColor: colours.border }]}>
          <AppText variant="bodySm" style={{ color: colours.brand }}>
            This week
            {currentWeek.checkpoint ? ' · checkpoint' : ''}
          </AppText>
          {currentWeek.days.map((day) => (
            <View key={day.id} style={styles.roadmapDay}>
              <Ionicons
                name={day.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={day.done ? colours.success : colours.border}
              />
              <AppText variant="caption" style={{ color: colours.inkMuted }}>{day.name}</AppText>
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

function RoutineReviewCard({
  enrolment,
  sessions,
  review,
  next,
  canStart,
  starting,
  onStart,
}: {
  enrolment: RoutineEnrolment | null;
  sessions: number;
  review: EnrolmentReview | null;
  next: NextRoutineOffer | null;
  canStart: boolean;
  starting: boolean;
  onStart: () => void;
}) {
  const { colours, radius, shadow, spacing } = useTheme();
  if (!enrolment) return null;
  const card = next ? handOffCardCopy(next) : null;
  return (
    <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
      <AppText variant="title2" style={{ color: colours.ink }}>
        {fillCopy(routineActionsCopy.complete_title, { routine_name: enrolment.routine.name })}
      </AppText>
      <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
        {review
          ? fillCopy(routineActionsCopy.complete_body, {
              sessions: review.sessions,
              time: formatTrainingHours(review.durationSeconds),
              pbs: review.personalBests,
            })
          : `${sessions} ${sessions === 1 ? 'session' : 'sessions'} logged.`}
      </AppText>
      {review?.lifts.length ? (
        <AppText variant="eyebrow" style={{ color: colours.accent, marginTop: spacing.sm }}>
          {routineActionsCopy.complete_checkpoint}
        </AppText>
      ) : null}
      {review?.lifts.map((lift) => (
        <AppText key={lift.exerciseId} variant="bodySm" style={{ color: colours.inkMuted }}>
          {formatLiftCompare(lift)}
        </AppText>
      ))}
      {card ? (
        <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
          {card.body}
        </AppText>
      ) : null}
      {canStart && card ? (
        <PrimaryButton
          label={starting ? 'Starting…' : card.primaryLabel}
          onPress={onStart}
          loading={starting}
          disabled={starting}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
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
  const { colours, radius, shadow } = useTheme();
  const next = nextBadgeInGroup(badges);
  return (
    <View
      style={[
        styles.awardCard,
        { backgroundColor: colours.surface, borderRadius: radius.xl },
        shadow,
      ]}>
      <AppText variant="title3" style={{ color: colours.ink }}>{title}</AppText>
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
  const { colours } = useTheme();
  return (
    <View style={styles.badgeGrid}>
      {badges.map((badge) => {
        const progress = badge.id === nextId ? formatBadgeProgress(badge) : formatRepeatCount(badge);
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
            <AppText
              variant="caption"
              style={{
                color: badge.unlocked ? colours.ink : colours.inkMuted,
                textAlign: 'center',
                marginTop: 8,
              }}
              numberOfLines={2}>
              {badge.title}
            </AppText>
            {progress ? (
              <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 2 }}>{progress}</AppText>
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
  const { colours } = useTheme();
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
                <AppText variant="caption" style={{ color: colours.accent, marginBottom: 4 }}>
                  {week.count}
                </AppText>
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
            <AppText variant="caption" style={[styles.barLabel, { color: colours.inkMuted }]} numberOfLines={1}>
              {isThisWeek ? 'Now' : showLabel ? formatShortDate(week.weekStart) : ''}
            </AppText>
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
    paddingTop: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
