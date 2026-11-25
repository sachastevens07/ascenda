import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { showDialog } from '@/components/Dialog';
import { LineChart } from '@/components/LineChart';
import { useTabBarHeight } from '@/components/PillTabBar';
import {
  AchievementBadge as BadgeMark,
  AppText,
  BadgeSheet,
  DestructiveTextButton,
  MenuRow,
  OverflowMenu,
  PhotoFill,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
  SectionHeader,
  StreakCard,
  CoachButton,
  TabAvatar,
  TextButton,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { fonts } from '@/constants/fonts';
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
  thisWeekTypeCounts,
  type FinishedSessionMeta,
  type WeekTypeCounts,
  type WeeklyStreak,
} from '@/lib/activityStats';
import {
  cardioMinutesLastEightWeeks,
  cardioWeekMinutes,
  cardioWeeksLogged,
  fetchCardioLogs,
  longestCardioMinutes,
  mostRepeatedCardioCompare,
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
  weekTypes: WeekTypeCounts;
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
const PB_PREVIEW = 3;
const PB_ANIM_MS = 250;

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
  const insets = useSafeAreaInsets();
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
            weekTypes: thisWeekTypeCounts(sessions),
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
      <View style={[styles.centre, { backgroundColor: colours.bg, paddingTop: insets.top }]}>
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

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <TabAvatar />
          <AppText variant="title1" style={{ color: colours.ink, flex: 1 }}>Activity</AppText>
          <CoachButton />
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
            <SummaryCard
              done={data.streak.doneThisWeek}
              target={data.streak.targetThisWeek}
              counts={data.weekTypes}
              sessions={data.sessions}
              totalSessions={totals.sessions}
              hours={hoursTileValue(totals.durationSeconds)}
              personalBests={bests.length}
              awards={awardsEarned}
              onOpenAwards={() => setTab('achievements')}
            />

            {data.hideStreak ? null : <StreakCard streak={data.streak} />}

            <SectionHeader title="Your routine" />
            <CurrentRoutineCard enrolment={data.enrolment} roadmap={data.roadmap} />

            {weeks.filter((week) => week.count > 0).length >= 2 ? (
              <View style={card}>
                <View style={styles.cardHeader}>
                  <AppText variant="title3" style={{ color: colours.ink, flex: 1 }}>Sessions per week</AppText>
                  <AppText variant="caption" style={{ color: colours.inkMuted }}>Last 8 weeks</AppText>
                </View>
                <WeeklyBars weeks={weeks} />
              </View>
            ) : null}

            <PersonalBestsCard bests={bests} />

            <CardioProgressCard logs={data.cardioLogs} />

            {lift && history.length >= 2 ? (
              <View style={card}>
                <AppText variant="title3" style={{ color: colours.ink }}>
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
                  <View style={card}>
                    <View style={styles.cardHeader}>
                      <AppText variant="title3" style={{ color: colours.ink, flex: 1 }}>
                        Progress photos
                      </AppText>
                      <Ionicons name="lock-closed-outline" size={18} color={colours.inkMuted} />
                    </View>
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
                      <SecondaryButton
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
  const showHistory = cardioWeeksLogged(logs) >= 2;
  const minuteWeeks = showHistory ? cardioMinutesLastEightWeeks(logs) : [];
  const compare = showHistory ? mostRepeatedCardioCompare(logs) : null;
  const card = [styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow];

  return (
    <>
      <View style={card}>
        <View style={styles.cardHeader}>
          <AppText variant="title3" style={{ color: colours.ink, flex: 1 }}>
            {cardioCopy.activity_title}
          </AppText>
          <Ionicons name="heart-outline" size={20} color={colours.accent} />
        </View>
        {logs.length === 0 ? (
          <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
            {cardioCopy.activity_empty}
          </AppText>
        ) : (
          <View style={styles.cardioRow}>
            <View style={styles.flex}>
              <AppText variant="title1" style={{ color: colours.ink }}>
                {weekMinutes}
                <AppText variant="bodyStrong" style={{ color: colours.inkMuted }}> min</AppText>
              </AppText>
              <AppText variant="caption" style={{ color: colours.inkMuted }}>This week</AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="title1" style={{ color: colours.ink }}>
                {longest}
                <AppText variant="bodyStrong" style={{ color: colours.inkMuted }}> min</AppText>
              </AppText>
              <AppText variant="caption" style={{ color: colours.inkMuted }}>Longest session</AppText>
            </View>
          </View>
        )}
      </View>
      {showHistory ? (
        <View style={card}>
          <AppText variant="title3" style={{ color: colours.ink }}>
            {cardioCopy.activity_minutes_week}
          </AppText>
          <WeeklyBars weeks={minuteWeeks} />
        </View>
      ) : null}
      {compare ? (
        <View style={card}>
          <AppText variant="title3" style={{ color: colours.ink }}>
            {cardioCopy.activity_compare}
          </AppText>
          <AppText variant="body" style={{ color: colours.ink }}>
            {fillCopy(cardioCopy.activity_compare_line, {
              name: compare.name,
              then: compare.firstLabel,
              now: compare.latestLabel,
            })}
          </AppText>
        </View>
      ) : null}
    </>
  );
}

function PersonalBestsCard({ bests }: { bests: PersonalBest[] }) {
  const { colours, radius, shadow } = useTheme();
  const [open, setOpen] = useState(false);
  const [restHeight, setRestHeight] = useState(0);
  const extraHeight = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const expandable = bests.length > PB_PREVIEW;
  const preview = bests.slice(0, PB_PREVIEW);
  const rest = bests.slice(PB_PREVIEW);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(extraHeight, {
        toValue: open ? restHeight : 0,
        duration: PB_ANIM_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(spin, {
        toValue: open ? 1 : 0,
        duration: PB_ANIM_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [extraHeight, open, restHeight, spin]);

  return (
    <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
      <Pressable
        onPress={() => {
          if (!expandable) return;
          setOpen((value) => !value);
        }}
        disabled={!expandable}
        accessibilityRole={expandable ? 'button' : 'header'}
        accessibilityState={expandable ? { expanded: open } : undefined}
        accessibilityLabel="Personal bests"
        accessibilityHint={
          expandable ? (open ? 'Hides the full list' : 'Shows all personal bests') : undefined
        }
        style={styles.pbHeader}>
        <AppText variant="title3" style={{ color: colours.ink, flex: 1 }}>
          Personal bests
        </AppText>
        {expandable ? (
          <Animated.View
            style={{
              transform: [
                {
                  rotate: spin.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg'],
                  }),
                },
              ],
            }}>
            <Ionicons name="chevron-down" size={20} color={colours.inkMuted} />
          </Animated.View>
        ) : null}
      </Pressable>
      {bests.length === 0 ? (
        <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
          Finish a weighted session and your bests will land here.
        </AppText>
      ) : (
        <View style={styles.pbList}>
          {preview.map((best, index) => (
            <BestRow key={best.exerciseId} best={best} bordered={index > 0} />
          ))}
          {rest.length > 0 ? (
            <>
              <View
                collapsable={false}
                pointerEvents="none"
                style={styles.pbMeasure}
                onLayout={(event) => {
                  const height = Math.round(event.nativeEvent.layout.height);
                  if (height > 0 && height !== restHeight) setRestHeight(height);
                }}>
                {rest.map((best) => (
                  <BestRow key={`measure-${best.exerciseId}`} best={best} bordered />
                ))}
              </View>
              <Animated.View style={{ height: extraHeight, overflow: 'hidden' }}>
                {rest.map((best) => (
                  <BestRow key={best.exerciseId} best={best} bordered />
                ))}
              </Animated.View>
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

function BestRow({ best, bordered }: { best: PersonalBest; bordered: boolean }) {
  const { colours, radius } = useTheme();
  return (
    <View
      style={[
        styles.goalRow,
        bordered && { borderTopColor: colours.border, borderTopWidth: StyleSheet.hairlineWidth },
      ]}>
      <View style={[styles.goalIcon, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
        <Ionicons name="trophy-outline" size={18} color={colours.accent} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" style={{ color: colours.ink }}>
          {best.exerciseName}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.accent, marginTop: 2 }}>
          {describeBest(best)}
        </AppText>
      </View>
      <AppText variant="caption" style={{ color: colours.inkMuted }}>
        {formatShortDate(parseDate(best.date))}
      </AppText>
    </View>
  );
}

function gymDaysInRoadmap(roadmap: RoadmapWeek[]) {
  return roadmap.flatMap((week) => week.days.filter((day) => day.sessionType !== 'recovery'));
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
  const gymDays = gymDaysInRoadmap(roadmap);
  const gymDone = gymDays.filter((day) => day.done).length;
  const gymTotal =
    gymDays.length > 0
      ? gymDays.length
      : enrolment
        ? Math.max(1, enrolment.routine.length_weeks * enrolment.routine.days_per_week)
        : 1;

  function openPlan() {
    if (enrolment) {
      router.push({ pathname: '/routines/[id]', params: { id: enrolment.routine.id } } as Href);
      return;
    }
    router.push('/(tabs)/programmes' as Href);
  }

  const percent = enrolment ? Math.round((gymDone / gymTotal) * 100) : 0;

  return (
    <Pressable
      onPress={openPlan}
      accessibilityRole="button"
      accessibilityLabel={
        enrolment
          ? `${enrolment.routine.name}, ${gymDone} of ${gymTotal} gym days`
          : 'Start a routine'
      }
      style={({ pressed }) => [pressed && styles.pressed]}>
      <View style={[{ borderRadius: radius.xl }, shadow]}>
        <View style={[styles.routineCard, { backgroundColor: colours.surface, borderRadius: radius.xl }]}>
          <View style={[styles.routinePhoto, { backgroundColor: colours.brand, borderRadius: radius.lg }]}>
            {enrolment?.routine.cover ? (
              <PhotoFill
                slug={enrolment.routine.cover.id}
                kind={enrolment.routine.cover.kind}
                label={enrolment.routine.name}
              />
            ) : (
              <Ionicons name="barbell-outline" size={24} color={colours.onBrand} />
            )}
          </View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong" style={{ color: colours.ink }} numberOfLines={1}>
              {enrolment ? enrolment.routine.name : 'No routine yet'}
            </AppText>
            <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 2 }}>
              {enrolment
                ? `Week ${week} of ${enrolment.routine.length_weeks} · ${gymDone} of ${gymTotal} sessions`
                : 'Start one from Train'}
            </AppText>
            {enrolment ? (
              <View style={styles.routineProgressRow}>
                <ProgressBar progress={gymDone / gymTotal} style={styles.flex} />
                <AppText variant="caption" style={{ color: colours.brand, fontFamily: fonts.bold }}>
                  {percent}%
                </AppText>
              </View>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colours.inkMuted} />
        </View>
      </View>
    </Pressable>
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
  const shown = weeks.slice(-8);
  const scale = Math.max(MIN_BAR_SCALE, ...shown.map((week) => week.count));
  return (
    <View>
      <View style={styles.bars}>
        {shown.map((week, index) => {
          const isThisWeek = index === shown.length - 1;
          return (
            <View key={week.weekStart.getTime()} style={styles.barColumn}>
              <AppText
                variant="caption"
                style={{ color: week.count > 0 ? colours.ink : 'transparent', marginBottom: 4, fontFamily: fonts.bold }}>
                {week.count}
              </AppText>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(6, (week.count / scale) * (BAR_AREA_HEIGHT - 24)),
                    backgroundColor:
                      week.count === 0 ? colours.surfaceMuted : isThisWeek ? colours.accent : colours.brand,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={[styles.barAxis, { borderTopColor: colours.border }]}>
        <AppText variant="caption" style={{ color: colours.inkMuted }}>
          {shown[0] ? formatShortDate(shown[0].weekStart) : ''}
        </AppText>
        <AppText variant="caption" style={{ color: colours.inkMuted }}>
          This week
        </AppText>
      </View>
    </View>
  );
}

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Days this week (Monday first) with at least one session that counts. */
function daysTrainedThisWeek(sessions: FinishedSessionMeta[]): boolean[] {
  const monday = startOfWeekMonday(new Date());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return toIso(date);
  });
  const trained = new Set(sessions.filter(sessionCountsTowardStreak).map((session) => session.date));
  return days.map((iso) => trained.has(iso));
}

function WeekRing({ done, target }: { done: number; target: number }) {
  const { colours } = useTheme();
  const size = 76;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(1, done / Math.max(1, target));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colours.onBrand} strokeOpacity={0.2} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colours.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {done >= target && target > 0 ? (
        <Ionicons name="checkmark" size={28} color={colours.onBrand} />
      ) : (
        <AppText variant="bodyStrong" style={{ color: colours.onBrand }}>
          {done}/{target}
        </AppText>
      )}
    </View>
  );
}

function SummaryCard({
  done,
  target,
  counts,
  sessions,
  totalSessions,
  hours,
  personalBests,
  awards,
  onOpenAwards,
}: {
  done: number;
  target: number;
  counts: WeekTypeCounts;
  sessions: FinishedSessionMeta[];
  totalSessions: number;
  hours: string;
  personalBests: number;
  awards: number;
  onOpenAwards: () => void;
}) {
  const { colours, radius, shadow } = useTheme();
  const goal = Math.max(1, Math.round(target));
  const trainedDays = daysTrainedThisWeek(sessions);
  const todayIndex = (new Date().getDay() + 6) % 7;
  const soft = { color: colours.onBrand, opacity: 0.72 };
  const breakdown = [
    `${counts.strength} strength`,
    `${counts.cardio} cardio`,
    ...(counts.recovery > 0 ? [`${counts.recovery} recovery`] : []),
  ].join(' · ');
  const stats: { value: string; label: string; onPress?: () => void }[] = [
    { value: String(totalSessions), label: totalSessions === 1 ? 'Session' : 'Sessions' },
    { value: hours, label: 'Hours' },
    { value: String(personalBests), label: personalBests === 1 ? 'PB' : 'PBs' },
    { value: String(awards), label: awards === 1 ? 'Award' : 'Awards', onPress: onOpenAwards },
  ];

  return (
    <View
      style={[styles.summary, { backgroundColor: colours.brand, borderRadius: radius.xl }, shadow]}
      accessibilityLabel={`This week: ${done} of ${goal} sessions. ${breakdown}.`}>
      <View style={styles.summaryTop}>
        <View style={styles.flex}>
          <AppText variant="eyebrow" style={soft}>
            This week
          </AppText>
          <AppText variant="title1" style={{ color: colours.onBrand, marginTop: 4 }}>
            {done} of {goal} sessions
          </AppText>
          <AppText variant="bodySm" style={[soft, { marginTop: 2 }]}>
            {breakdown}
          </AppText>
        </View>
        <WeekRing done={done} target={goal} />
      </View>

      <View style={styles.dayRow}>
        {WEEKDAY_LETTERS.map((letter, index) => {
          const trained = trainedDays[index];
          const isToday = index === todayIndex;
          return (
            <View key={index} style={styles.dayColumn}>
              <AppText variant="caption" style={[soft, isToday && { opacity: 1, fontFamily: fonts.bold }]}>
                {letter}
              </AppText>
              <View
                style={[
                  styles.dayDot,
                  {
                    backgroundColor: trained ? colours.accent : 'transparent',
                    borderColor: trained ? colours.accent : isToday ? colours.onBrand : 'rgba(255,255,255,0.3)',
                  },
                ]}>
                {trained ? <Ionicons name="checkmark" size={12} color={colours.onAccent} /> : null}
              </View>
            </View>
          );
        })}
      </View>

      <View style={[styles.summaryDivider, { backgroundColor: colours.onBrand }]} />

      <View style={styles.summaryStats}>
        {stats.map((stat) => {
          const body = (
            <>
              <AppText variant="title2" style={{ color: colours.onBrand }}>
                {stat.value}
              </AppText>
              <AppText variant="caption" style={soft} numberOfLines={1}>
                {stat.label}
              </AppText>
            </>
          );
          return stat.onPress ? (
            <Pressable
              key={stat.label}
              onPress={stat.onPress}
              accessibilityRole="button"
              style={({ pressed }) => [styles.summaryStat, pressed && styles.pressed]}>
              {body}
            </Pressable>
          ) : (
            <View key={stat.label} style={styles.summaryStat}>
              {body}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    padding: 20,
    gap: 16,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayColumn: {
    alignItems: 'center',
    gap: 6,
  },
  dayDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.3,
  },
  summaryStats: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryStat: {
    flex: 1,
    gap: 2,
  },
  routinePhoto: {
    width: 64,
    height: 64,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routineProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardioRow: {
    flexDirection: 'row',
    gap: 12,
  },
  barAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    marginTop: 2,
  },
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
    gap: 14,
    padding: 12,
  },
  routineMark: {
    width: 0,
  },
  routineBody: {
    paddingVertical: 0,
  },
  routineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pbHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 28,
  },
  pbList: {
    position: 'relative',
  },
  pbMeasure: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0,
    zIndex: -1,
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
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BAR_AREA_HEIGHT,
    gap: BAR_GAP,
    paddingTop: 4,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barArea: {
    flex: 1,
  },
  bar: {
    width: '70%',
    maxWidth: 32,
    borderRadius: 8,
  },
  barLabel: {
    textAlign: 'center',
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
  pressed: {
    opacity: 0.8,
  },
});
