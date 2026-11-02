import Ionicons from '@expo/vector-icons/Ionicons';
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

import {
  AnchoredMenu,
  MenuRow,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/AnchoredMenu';
import { showDialog } from '@/components/Dialog';
import { LineChart } from '@/components/LineChart';
import { useTabBarHeight } from '@/components/PillTabBar';
import { ProBadge, ProMark } from '@/components/ProBadge';
import { colours } from '@/constants/theme';
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
import { equipmentListLabel, exerciseListLabel, getGymUnlocked } from '@/lib/gymUnlocked';
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
  fetchProgressPhotos,
  uploadProgressPhoto,
  type ProgressPhoto,
} from '@/lib/progressPhotos';
import {
  countEnrolmentSessions,
  currentEnrolmentWeek,
  fetchActiveEnrolment,
  fetchCompletedEnrolmentCount,
  fetchLatestCompletedEnrolment,
  fetchRoutineRoadmap,
  type RoadmapWeek,
  type RoutineEnrolment,
} from '@/lib/routines';
import { useSubscription } from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'ready';
type ActivityTab = 'progress' | 'achievements';

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
};

const BAR_WIDTH = 20;
const BAR_GAP = 8;
const BAR_AREA_HEIGHT = 120;
const MIN_BAR_SCALE = 4;

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

export default function ActivityScreen() {
  const tabBarHeight = useTabBarHeight();
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
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <>
            <Text style={styles.message}>
              We couldn’t load your activity. Check your connection and try again.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, styles.retry, pressed && styles.pressed]}
              onPress={() => {
                setLoadState('loading');
                setAttempt((count) => count + 1);
              }}
              accessibilityRole="button">
              <Text style={styles.outlineButtonText}>Try again</Text>
            </Pressable>
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

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <Text style={styles.title}>Activity</Text>

        <View style={styles.stats}>
          <Stat value={String(totals.sessions)} label={totals.sessions === 1 ? 'session' : 'sessions'} />
          <Stat
            value={String(totals.liftsTracked)}
            label={totals.liftsTracked === 1 ? 'lift tracked' : 'lifts tracked'}
          />
          <Stat value={formatTrainingHours(totals.durationSeconds)} label="time spent" />
        </View>

        {data.weekProgress.planned > 0 && (
          <Text style={styles.weekLine}>
            This week: {data.streak.doneThisWeek} of {data.weekProgress.planned}{' '}
            {data.weekProgress.planned === 1 ? 'workout' : 'workouts'}
          </Text>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly streak</Text>
          <Text style={styles.levelName}>
            {data.streak.current} of {data.streak.goal} weeks
          </Text>
          <View style={styles.streakTrack} accessibilityRole="progressbar">
            <View
              style={[
                styles.streakFill,
                { width: `${Math.min(100, (data.streak.current / data.streak.goal) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.chartNote}>{describeStreak(data.streak)}</Text>
        </View>

        <View style={styles.tabRow}>
          {(['progress', 'achievements'] as const).map((value) => {
            const selected = tab === value;
            return (
              <Pressable
                key={value}
                onPress={() => setTab(value)}
                style={[styles.tabChip, selected && styles.tabChipOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}>
                <Text style={[styles.tabChipText, selected && styles.tabChipTextOn]}>
                  {value === 'progress' ? 'Progress' : 'Achievements'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'progress' ? (
          <>
            {isEmpty && (
              <View style={styles.emptyIntro}>
                <Ionicons name="trending-up" size={36} color={colours.accent} />
                <Text style={styles.emptyTitle}>Your progress starts here</Text>
                <Text style={styles.emptyCopy}>
                  Finish your first session and your personal bests, lifts and weeks will appear here.
                </Text>
              </View>
            )}

            {!isEmpty && (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Personal bests</Text>
                  {bests.map((best) => (
                    <View key={best.exerciseId} style={styles.bestRow}>
                      <View style={styles.flex}>
                        <Text style={styles.bestName}>{best.exerciseName}</Text>
                        <Text style={styles.bestValue}>{describeBest(best)}</Text>
                        {best.estimatedMaxKg !== null && (
                          <Text style={styles.bestDetail}>
                            Estimated 1-rep max: {formatKg(best.estimatedMaxKg)}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.bestDate}>{formatShortDate(parseDate(best.date))}</Text>
                    </View>
                  ))}
                  <Text style={styles.footnote}>
                    Estimated 1-rep max is worked out from your best set of up to 12 reps. There’s no
                    need to test it.
                  </Text>
                </View>

                {isPro ? (
                  <View style={styles.card}>
                    <View style={styles.titleRow}>
                      <Text style={styles.cardTitle}>Sessions per week</Text>
                      <ProBadge />
                    </View>
                    <WeeklyBars weeks={weeks} />
                  </View>
                ) : (
                  <ProCard
                    reason="charts"
                    title="See your progress over time"
                    copy="With Pro, chart your sessions each week and the weight on every lift."
                  />
                )}

                {isPro && lift && (
                  <View style={styles.card}>
                    <View style={styles.titleRow}>
                      <Text style={styles.cardTitle}>
                        {lift.assisted ? 'Help over time' : 'Weight over time'}
                      </Text>
                      <ProBadge />
                    </View>
                    <Pressable
                      ref={liftPickerRef}
                      collapsable={false}
                      style={({ pressed }) => [styles.picker, pressed && styles.pressed]}
                      onPress={() => {
                        measureAnchor(liftPickerRef.current, (rect) => {
                          setPickerAnchor(rect);
                          setIsPickerOpen(true);
                        });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Lift: ${lift.exerciseName}. Change lift`}>
                      <Text style={styles.pickerText} numberOfLines={1}>
                        {lift.exerciseName}
                      </Text>
                      <Ionicons
                        name={isPickerOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colours.accent}
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
                    <Text style={styles.chartNote}>{describeChange(history, lift.assisted)}</Text>
                  </View>
                )}
              </>
            )}

            {isPro ? (
              <RoutineRoadmapCard enrolment={data.enrolment} roadmap={data.roadmap} />
            ) : (
              <ProCard
                reason="roadmap"
                title="Routine roadmap"
                copy="With Pro, see each week of your routine and which days you’ve finished."
              />
            )}

            {isPro ? (
              <RoutineReviewCard
                enrolment={data.completedEnrolment}
                sessions={data.completedRoutineSessions}
              />
            ) : data.completedEnrolment ? (
              <ProCard
                reason="review"
                title="End-of-routine review"
                copy="You finished a routine. Pro unlocks a short review of how it went."
              />
            ) : null}

            {isPro ? (
              <View style={styles.card}>
                <View style={styles.titleRow}>
                  <Text style={styles.cardTitle}>Progress photos</Text>
                  <ProBadge />
                </View>
                <Text style={styles.chartNote}>
                  Optional, private, and never sent to AI. Hidden until you choose to show them.
                </Text>
                {data.photosError && !data.photosError.includes('activity.sql') ? (
                  <Text style={styles.bestDetail}>{data.photosError}</Text>
                ) : null}
                {data.photosError?.includes('activity.sql') ? (
                  <Text style={styles.bestDetail}>{data.photosError}</Text>
                ) : showPhotos ? (
                  <>
                    <Pressable
                      style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
                      onPress={() => {
                        setShowPhotos(false);
                        setCompareIds([]);
                      }}
                      accessibilityRole="button">
                      <Text style={styles.outlineButtonText}>Hide photos</Text>
                    </Pressable>
                    <View style={styles.goalRow}>
                      <Pressable
                        style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
                        onPress={() => void pickPhoto('camera')}
                        disabled={isPhotoBusy}
                        accessibilityRole="button">
                        <Text style={styles.smallButtonText}>Camera</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
                        onPress={() => void pickPhoto('library')}
                        disabled={isPhotoBusy}
                        accessibilityRole="button">
                        <Text style={styles.smallButtonText}>Library</Text>
                      </Pressable>
                    </View>
                    {isPhotoBusy && <ActivityIndicator color={colours.accent} />}
                    {comparePhotos.length === 2 && (
                      <View style={styles.compareRow}>
                        {comparePhotos.map((photo) => (
                          <View key={photo.id} style={styles.flex}>
                            {photo.url ? (
                              <Image source={{ uri: photo.url }} style={styles.compareImage} />
                            ) : (
                              <View style={styles.compareImage} />
                            )}
                            <Text style={styles.bestDetail}>
                              {formatShortDate(parseDate(photo.taken_on))}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {data.photos.length === 0 ? (
                      <Text style={styles.bestDetail}>No photos yet. Add one when you want.</Text>
                    ) : (
                      data.photos.map((photo) => {
                        const selected = compareIds.includes(photo.id);
                        return (
                          <View key={photo.id} style={styles.photoRow}>
                            {photo.url ? (
                              <Image source={{ uri: photo.url }} style={styles.photoThumb} />
                            ) : (
                              <View style={styles.photoThumb} />
                            )}
                            <View style={styles.flex}>
                              <Text style={styles.bestName}>
                                {formatShortDate(parseDate(photo.taken_on))}
                              </Text>
                              <Pressable
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
                                accessibilityRole="button">
                                <Text style={styles.linkText}>
                                  {selected ? 'Remove from compare' : 'Compare'}
                                </Text>
                              </Pressable>
                            </View>
                            <Pressable
                              onPress={() => confirmDeletePhoto(photo)}
                              accessibilityRole="button"
                              accessibilityLabel="Delete photo">
                              <Ionicons name="trash-outline" size={22} color={colours.textMuted} />
                            </Pressable>
                          </View>
                        );
                      })
                    )}
                    {data.photos.length > 0 && (
                      <Pressable
                        style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
                        onPress={() => confirmDeleteAll(data.photos)}
                        accessibilityRole="button">
                        <Text style={styles.outlineButtonText}>Delete all photos</Text>
                      </Pressable>
                    )}
                  </>
                ) : (
                  <Pressable
                    style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
                    onPress={() => setShowPhotos(true)}
                    accessibilityRole="button">
                    <Text style={styles.outlineButtonText}>Show photos</Text>
                  </Pressable>
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
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Gym unlocked</Text>
              <Text style={styles.chartNote}>
                Every new exercise and piece of kit you tick in a finished session counts.
              </Text>
              <View style={styles.gymStats}>
                <View style={styles.flex}>
                  <Text style={styles.levelName}>{gym.exerciseCount}</Text>
                  <Text style={styles.bestDetail}>{exerciseListLabel(gym.exerciseCount)}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.levelName}>{gym.equipmentCount}</Text>
                  <Text style={styles.bestDetail}>{equipmentListLabel(gym.equipmentCount)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Achievements</Text>
              {badges.map((badge) => (
                <BadgeRow key={badge.id} badge={badge} />
              ))}
              <Text style={styles.footnote}>
                Locked badges stay grey until you unlock them.
              </Text>
            </View>
          </>
        )}

        <Text style={styles.disclaimer}>
          General fitness guidance, not medical advice. Stop if anything hurts.
        </Text>
      </ScrollView>

      <AnchoredMenu
        visible={isPickerOpen}
        anchor={pickerAnchor}
        onClose={() => setIsPickerOpen(false)}>
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
      </AnchoredMenu>
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
  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <ProBadge locked />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.chartNote}>{copy}</Text>
      <Pressable
        style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
        onPress={() => openPaywall(reason)}
        accessibilityRole="button">
        <ProMark locked textStyle={styles.outlineButtonText}>
          See Pro
        </ProMark>
      </Pressable>
    </View>
  );
}

function RoutineRoadmapCard({
  enrolment,
  roadmap,
}: {
  enrolment: RoutineEnrolment | null;
  roadmap: RoadmapWeek[];
}) {
  if (!enrolment) {
    return (
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle}>Routine roadmap</Text>
          <ProBadge />
        </View>
        <Text style={styles.chartNote}>Start a routine and its weeks will show here.</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.cardTitle}>{enrolment.routine.name}</Text>
        <ProBadge />
      </View>
      <Text style={styles.chartNote}>
        Week {currentEnrolmentWeek(enrolment)} of {enrolment.routine.length_weeks}
      </Text>
      {roadmap.map((week) => (
        <View key={week.weekNumber} style={styles.roadmapWeek}>
          <Text style={[styles.bestName, week.current && styles.pickerText]}>
            Week {week.weekNumber}
            {week.current ? ' · now' : ''}
          </Text>
          {week.days.map((day) => (
            <View key={day.id} style={styles.roadmapDay}>
              <Ionicons
                name={day.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={day.done ? colours.accent : colours.border}
              />
              <Text style={styles.bestDetail}>{day.name}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function RoutineReviewCard({
  enrolment,
  sessions,
}: {
  enrolment: RoutineEnrolment | null;
  sessions: number;
}) {
  if (!enrolment) return null;
  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.cardTitle}>End-of-routine review</Text>
        <ProBadge />
      </View>
      <Text style={styles.bestName}>{enrolment.routine.name}</Text>
      <Text style={styles.chartNote}>
        You finished this plan
        {enrolment.completed_at
          ? ` on ${formatShortDate(parseDate(enrolment.completed_at.slice(0, 10)))}`
          : ''}
        . {sessions} {sessions === 1 ? 'session' : 'sessions'} logged across{' '}
        {enrolment.routine.length_weeks} weeks.
      </Text>
      <Text style={styles.footnote}>That’s a full routine. Start another when you’re ready.</Text>
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

function BadgeRow({ badge }: { badge: AchievementBadge }) {
  return (
    <View
      style={[styles.badgeRow, !badge.unlocked && styles.badgeRowLocked]}
      accessibilityState={{ disabled: !badge.unlocked }}>
      <View style={[styles.badgeDot, badge.unlocked && styles.badgeDotOn]}>
        {badge.unlocked ? <Ionicons name="checkmark" size={14} color={colours.surface} /> : null}
      </View>
      <View style={styles.flex}>
        <Text style={[styles.bestName, !badge.unlocked && styles.badgeLockedText]}>{badge.title}</Text>
        <Text style={styles.bestDetail}>
          {badge.unlocked
            ? badge.unlockedOn
              ? `${badge.detail} ${formatShortDate(parseDate(badge.unlockedOn))}`
              : badge.detail
            : badge.detail}
        </Text>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function WeeklyBars({ weeks }: { weeks: WeekCount[] }) {
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
              {week.count > 0 && <Text style={styles.barCount}>{week.count}</Text>}
              <View
                style={[
                  styles.bar,
                  { height: Math.max(4, (week.count / scale) * (BAR_AREA_HEIGHT - 20)) },
                  week.count === 0 && styles.barEmpty,
                ]}
              />
            </View>
            <Text style={styles.barLabel} numberOfLines={1}>
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
    backgroundColor: colours.background,
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
    backgroundColor: colours.background,
  },
  message: {
    fontSize: 17,
    lineHeight: 24,
    color: colours.textMuted,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colours.text,
    textAlign: 'center',
  },
  emptyIntro: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  emptyCopy: {
    fontSize: 17,
    lineHeight: 24,
    color: colours.textMuted,
    textAlign: 'center',
  },
  levelName: {
    fontSize: 24,
    fontWeight: '700',
    color: colours.accent,
  },
  streakTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colours.border,
    overflow: 'hidden',
  },
  streakFill: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colours.accent,
  },
  goalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  goalChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colours.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.surface,
  },
  goalChipOn: {
    borderColor: colours.accent,
    backgroundColor: colours.accentSoft,
  },
  goalChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: colours.textMuted,
  },
  goalChipTextOn: {
    color: colours.accent,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.surface,
  },
  tabChipOn: {
    backgroundColor: colours.accent,
  },
  tabChipText: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.textMuted,
  },
  tabChipTextOn: {
    color: colours.surface,
  },
  gymStats: {
    flexDirection: 'row',
    gap: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  badgeRowLocked: {
    opacity: 0.45,
  },
  badgeDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colours.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDotOn: {
    borderColor: colours.accent,
    backgroundColor: colours.accent,
  },
  badgeLockedText: {
    color: colours.textMuted,
  },
  retry: {
    alignSelf: 'stretch',
    marginTop: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
  },
  weekLine: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
    marginTop: -8,
  },
  flex: {
    flex: 1,
  },
  stats: {
    flexDirection: 'row',
    gap: 10,
  },
  stat: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: colours.accent,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colours.surface,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colours.accentSoft,
    marginTop: 2,
  },
  card: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: colours.surface,
    gap: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
    flexShrink: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colours.accentSoft,
  },
  pickerText: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colours.accent,
  },
  chartNote: {
    fontSize: 15,
    lineHeight: 21,
    color: colours.text,
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
    backgroundColor: colours.accent,
  },
  barEmpty: {
    backgroundColor: colours.border,
  },
  barCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colours.accent,
    marginBottom: 4,
  },
  barLabel: {
    width: BAR_WIDTH * 3,
    fontSize: 11,
    color: colours.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  bestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colours.border,
  },
  bestName: {
    fontSize: 17,
    fontWeight: '600',
    color: colours.text,
  },
  bestValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.accent,
    marginTop: 2,
  },
  bestDetail: {
    fontSize: 14,
    color: colours.textMuted,
    marginTop: 2,
  },
  bestDate: {
    fontSize: 14,
    color: colours.textMuted,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 19,
    color: colours.textMuted,
    marginTop: 4,
  },
  outlineButton: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  outlineButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  smallButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accentSoft,
  },
  smallButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.accent,
  },
  linkText: {
    fontSize: 15,
    fontWeight: '700',
    color: colours.accent,
    marginTop: 4,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colours.border,
  },
  compareRow: {
    flexDirection: 'row',
    gap: 10,
  },
  compareImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: colours.border,
  },
  roadmapWeek: {
    gap: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colours.border,
  },
  roadmapDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    textAlign: 'center',
  },
});
