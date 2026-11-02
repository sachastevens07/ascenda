import Ionicons from '@expo/vector-icons/Ionicons';
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
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';

import {
  MenuHeader,
  MenuRow,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/AnchoredMenu';
import { showDialog } from '@/components/Dialog';
import { useTabBarHeight } from '@/components/PillTabBar';
import {
  IconButton,
  ImageCard,
  OverflowMenu,
  PrimaryButton,
  ProMark,
  ProgressRing,
  SectionHeader,
  TextButton,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  DEFAULT_STREAK_GOAL,
  fetchFinishedSessionMeta,
  fetchStreakGoal,
  getWeeklyStreak,
  type WeeklyStreak,
} from '@/lib/activityStats';
import {
  challengeCountdown,
  fetchChallenges,
  pickHomeChallenge,
  type Challenge,
} from '@/lib/challenges';
import {
  atFreeCustomWorkoutLimit,
  countOwnedCustomWorkouts,
} from '@/lib/customWorkouts';
import { getExerciseImageSource } from '@/lib/exerciseMedia';
import { coverForRoutine, coverSources } from '@/lib/images';
import { consumeOnboardingPaywall } from '@/lib/onboarding';
import { openPaywall } from '@/lib/paywall';
import { fetchPlannedCountsByWeek, fetchThisWeekProgress, toIso, type WeekPlanProgress } from '@/lib/planner';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { formatShortDate } from '@/lib/progress';
import {
  describeRoutineError,
  endActiveEnrolment,
  fetchActiveEnrolment,
  fetchRoutine,
  fetchRoutineProgressMap,
  fetchRoutines,
  getNextRoutineDay,
  missingRoutinesMessage,
  pickFeaturedRoutines,
  type PlannedSession,
  type Routine,
  type RoutineDay,
  type RoutineEnrolment,
  type RoutineSummary,
} from '@/lib/routines';
import {
  fetchActiveSession,
  fetchLastFinishedRoutineSession,
  type Session,
} from '@/lib/sessions';
import { fetchStretchRoutines } from '@/lib/stretches';
import {
  STORE_NAME,
  isTrialEndingSoon,
  openManageSubscription,
  useSubscription,
} from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'ready';

type HomeData = {
  featured: RoutineSummary[];
  stretches: RoutineSummary[];
  enrolment: RoutineEnrolment | null;
  routine: Routine | null;
  next: PlannedSession | null;
  missingSql: boolean;
  activeSession: Session | null;
  ownedWorkouts: number;
  weekProgress: WeekPlanProgress;
  streak: WeeklyStreak;
  challenge: Challenge | null;
  progress: Record<string, { done: number; target: number }>;
};

function greeting(name: string | null | undefined): string {
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${hello}, ${first}` : hello;
}

function coverImage(routine: Pick<RoutineSummary, 'id' | 'cover'>): ImageSourcePropType | null {
  return coverSources(coverForRoutine(routine))[0] ?? null;
}

function sessionThumbnail(day: RoutineDay, routine: RoutineSummary): ImageSourcePropType | null {
  for (const slot of day.exercises) {
    const photo = getExerciseImageSource(slot.exercise);
    if (photo) return photo;
  }
  return coverImage(routine);
}

export default function HomeScreen() {
  const tabBarHeight = useTabBarHeight();
  const { width } = useWindowDimensions();
  const { colours, spacing, radius, shadow, type } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const subscription = useSubscription();
  const [data, setData] = useState<HomeData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const openedOnboardingPaywall = useRef(false);
  const routineMenuRef = useRef<AnchorHandle>(null);
  const [routineMenuOpen, setRoutineMenuOpen] = useState(false);
  const [routineMenuAnchor, setRoutineMenuAnchor] = useState<AnchorRect | null>(null);
  const featuredWidth = width * 0.78;
  const stretchWidth = width * 0.56;

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      if (!openedOnboardingPaywall.current && !subscription.isPro) {
        consumeOnboardingPaywall()
          .then((queued) => {
            if (!isCurrent || queued === null) return;
            openedOnboardingPaywall.current = true;
            openPaywall('onboarding');
          })
          .catch(() => {});
      }
      (async () => {
        try {
          const [
            routines,
            enrolment,
            activeSession,
            ownedWorkouts,
            weekProgress,
            challenges,
            progress,
            sessions,
            stretchRoutines,
            streakGoal,
          ] = await Promise.all([
            fetchRoutines(),
            fetchActiveEnrolment(),
            fetchActiveSession(),
            countOwnedCustomWorkouts(),
            fetchThisWeekProgress().catch(() => ({ completed: 0, planned: 0 })),
            fetchChallenges().catch(() => []),
            fetchRoutineProgressMap().catch(() => ({})),
            fetchFinishedSessionMeta().catch(() => []),
            fetchStretchRoutines().catch(() => []),
            fetchStreakGoal().catch(() => DEFAULT_STREAK_GOAL),
          ]);
          const missingSql = routines.length === 0;
          const featured = answers
            ? pickFeaturedRoutines(routines, answers, subscription.isPro ? 4 : 2, {
                freeOnly: !subscription.isPro,
              })
            : subscription.isPro
              ? routines.slice(0, 4)
              : routines.filter((routine) => !routine.is_pro).slice(0, 2);
          const stretches = (subscription.isPro ? stretchRoutines : stretchRoutines.filter((item) => !item.is_pro)).slice(
            0,
            4
          );
          let routine: Routine | null = null;
          let next: PlannedSession | null = null;
          if (enrolment) {
            routine = await fetchRoutine(enrolment.routine_id);
            const last = await fetchLastFinishedRoutineSession(enrolment.id);
            const lastDayId = last?.routine_day_id ?? last?.programme_day_id ?? null;
            next = routine ? getNextRoutineDay(routine, enrolment, lastDayId) : null;
          }
          const from = sessions[0]?.date ?? toIso(new Date());
          const plannedByWeek = await fetchPlannedCountsByWeek(from, toIso(new Date())).catch(
            () => new Map<string, number>()
          );
          const fallbackTarget = answers?.days_per_week || enrolment?.routine.days_per_week || 3;
          const streak = getWeeklyStreak(sessions, plannedByWeek, fallbackTarget, streakGoal);
          if (!isCurrent) return;
          setData({
            featured,
            stretches,
            enrolment,
            routine,
            next,
            missingSql,
            activeSession,
            ownedWorkouts,
            weekProgress,
            streak,
            challenge: pickHomeChallenge(challenges),
            progress,
          });
          setLoadState('ready');
        } catch {
          if (isCurrent) setLoadState((state) => (state === 'ready' ? state : 'error'));
        }
      })();
      return () => {
        isCurrent = false;
      };
    }, [
      answers?.goal,
      answers?.experience,
      answers?.equipment,
      answers?.days_per_week,
      answers?.confidence,
      attempt,
      subscription.isPro,
    ])
  );

  function handleManageSubscription() {
    openManageSubscription(subscription.managementUrl).catch(() =>
      showDialog('Couldn’t open your subscription', `Open ${STORE_NAME} and go to Subscriptions.`)
    );
  }

  function openRoutine(routine: RoutineSummary) {
    router.push({ pathname: '/routines/[id]', params: { id: routine.id } } as Href);
  }

  function openStretch(routine: RoutineSummary) {
    router.push({ pathname: '/stretches/[id]', params: { id: routine.id } } as Href);
  }

  function openSessionDetail() {
    if (!data?.enrolment || !data.next) return;
    router.push({
      pathname: '/routines/session',
      params: {
        routineId: data.enrolment.routine_id,
        dayId: data.next.day.id,
        enrolmentId: data.enrolment.id,
      },
    } as Href);
  }

  function continueSession() {
    if (!data?.activeSession) return;
    if (data.activeSession.source === 'stretch') {
      router.push({ pathname: '/stretches/play', params: { sessionId: data.activeSession.id } });
      return;
    }
    router.push({ pathname: '/session/[id]', params: { id: data.activeSession.id } });
  }

  function handleCreateWorkout() {
    if (atFreeCustomWorkoutLimit(data?.ownedWorkouts ?? 0, subscription.isPro)) {
      openPaywall('custom-limit');
      return;
    }
    router.push({ pathname: '/workouts/[id]', params: { id: 'new' } });
  }

  function requestEndRoutine() {
    if (!data?.enrolment) return;
    showDialog(
      `End ${data.enrolment.routine.name}?`,
      'Your logged sessions and progress stay. Upcoming planned sessions from this plan will be cleared.',
      [
        { text: 'End routine', style: 'destructive', onPress: handleEndRoutine },
        { text: 'Keep this plan', style: 'cancel' },
      ]
    );
  }

  async function handleEndRoutine() {
    try {
      await endActiveEnrolment();
      setAttempt((count) => count + 1);
    } catch (error) {
      showDialog('Couldn’t end the routine', describeRoutineError(error));
    }
  }

  function openRoutineMenu() {
    if (!data?.enrolment) return;
    measureAnchor(routineMenuRef.current, (rect) => {
      setRoutineMenuAnchor(rect);
      setRoutineMenuOpen(true);
    });
  }

  if (loadState !== 'ready' || !data) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <>
            <Text style={[type.body, { color: colours.inkMuted, textAlign: 'center' }]}>
              We couldn’t load Home. Check your connection and try again.
            </Text>
            <PrimaryButton
              label="Try again"
              onPress={() => setAttempt((count) => count + 1)}
              style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}
            />
          </>
        )}
      </View>
    );
  }

  const { featured, stretches, enrolment, next, missingSql, activeSession, weekProgress, streak, challenge, progress } =
    data;
  const inProgress = Boolean(activeSession);
  const weekRatio = weekProgress.planned > 0 ? weekProgress.completed / weekProgress.planned : 0;
  const showWeekCard = weekProgress.planned > 0 || streak.current > 0;
  const atCustomLimit = atFreeCustomWorkoutLimit(data.ownedWorkouts, subscription.isPro);
  const nextThumb =
    enrolment && next && !inProgress ? sessionThumbnail(next.day, enrolment.routine) : null;

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <Text style={[type.display, { color: colours.ink }]}>{greeting(profile?.display_name)}</Text>

        {subscription.trialEndsAt && isTrialEndingSoon(subscription) ? (
          <View style={[styles.card, { backgroundColor: colours.brandSoft, borderRadius: radius.lg }]}>
            <Text style={[type.bodySm, { color: colours.ink }]}>
              Your free trial ends on {formatShortDate(subscription.trialEndsAt)}.
            </Text>
            <TextButton label="Manage subscription" onPress={handleManageSubscription} style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : null}

        {inProgress ? (
          <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
            <Text style={[type.eyebrow, { color: colours.accent }]}>In progress</Text>
            <Text style={[type.title2, { color: colours.ink, marginTop: spacing.sm }]}>You have a session going</Text>
            <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: spacing.xs }]}>
              Finish or discard it before starting another.
            </Text>
            <PrimaryButton label="Continue session" tone="accent" onPress={continueSession} style={{ marginTop: spacing.md }} />
          </View>
        ) : null}

        {enrolment && next && !inProgress ? (
          <View style={[{ backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
            <View style={[styles.heroClip, { borderRadius: radius.xl }]}>
              <Pressable onPress={openSessionDetail} accessibilityRole="button">
                <View style={[styles.heroPhoto, { backgroundColor: colours.surfaceMuted }]}>
                  {nextThumb ? (
                    <Image
                      source={nextThumb}
                      style={styles.heroFill}
                      resizeMode="cover"
                      accessibilityLabel={next.day.name}
                    />
                  ) : (
                    <Text style={[styles.heroLetter, { color: colours.brand }]}>{next.day.name.slice(0, 1)}</Text>
                  )}
                </View>
              </Pressable>
              <View style={styles.heroBody}>
                <View style={styles.heroHeading}>
                  <View style={styles.flex}>
                    <Text style={[type.eyebrow, { color: colours.accent }]}>
                      Week {next.weekNumber} · day {next.day.day_number}
                    </Text>
                    <Pressable onPress={openSessionDetail} accessibilityRole="button">
                      <Text style={[type.title2, { color: colours.ink, marginTop: spacing.xs }]}>{next.day.name}</Text>
                    </Pressable>
                    <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 4 }]}>
                      {enrolment.routine.session_minutes} min · {next.day.exercises.length} exercises
                    </Text>
                  </View>
                  <View ref={routineMenuRef} collapsable={false}>
                    <IconButton
                      icon="ellipsis-horizontal"
                      variant="muted"
                      accessibilityLabel="Switch or end this routine"
                      onPress={openRoutineMenu}
                    />
                  </View>
                </View>
                <PrimaryButton label="Start session" tone="accent" onPress={openSessionDetail} style={{ marginTop: spacing.md }} />
              </View>
            </View>
          </View>
        ) : null}

        {!enrolment && !inProgress ? (
          <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
            <Text style={[type.eyebrow, { color: colours.inkMuted }]}>No routine yet</Text>
            <Text style={[type.title2, { color: colours.ink, marginTop: spacing.sm }]}>Create a workout</Text>
            <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: spacing.xs }]}>
              Add exercises from the library, or pick a featured routine below.
            </Text>
            {atCustomLimit ? (
              <Pressable
                onPress={handleCreateWorkout}
                style={({ pressed }) => [
                  styles.limitButton,
                  { backgroundColor: colours.brand, borderRadius: radius.full },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button">
                <ProMark locked textStyle={[type.button, { color: colours.onBrand }]}>
                  Create with Pro
                </ProMark>
              </Pressable>
            ) : (
              <PrimaryButton label="Create a workout" onPress={handleCreateWorkout} style={{ marginTop: spacing.md }} />
            )}
            <TextButton label="My workouts" onPress={() => router.push('/workouts' as Href)} />
          </View>
        ) : null}

        {showWeekCard ? (
          <View style={[styles.weekCard, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
            <ProgressRing progress={weekRatio} size={56} stroke={6}>
              <Text style={[type.caption, { color: colours.ink, fontWeight: '700' }]}>
                {weekProgress.completed}/{weekProgress.planned || 0}
              </Text>
            </ProgressRing>
            <View style={styles.flex}>
              {weekProgress.planned > 0 ? (
                <Text style={[type.title3, { color: colours.ink }]}>
                  {weekProgress.completed} of {weekProgress.planned}{' '}
                  {weekProgress.planned === 1 ? 'workout' : 'workouts'}
                </Text>
              ) : (
                <Text style={[type.title3, { color: colours.ink }]}>This week</Text>
              )}
              <View style={styles.streakRow}>
                <Ionicons name="flame" size={16} color={colours.accent} />
                <Text style={[type.bodySm, { color: colours.accent, fontWeight: '700' }]}>
                  {streak.current === 0
                    ? 'Start a streak'
                    : streak.current === 1
                      ? '1-week streak'
                      : `${streak.current}-week streak`}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {challenge ? (
          <Pressable
            onPress={() => router.push({ pathname: '/challenges/[id]', params: { id: challenge.id } } as Href)}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: colours.surface, borderRadius: radius.xl },
              shadow,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button">
            <Text style={[type.eyebrow, { color: colours.accent }]}>Challenge</Text>
            <Text style={[type.title3, { color: colours.ink, marginTop: spacing.sm }]}>{challenge.name}</Text>
            <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 4 }]}>{challengeCountdown(challenge)}</Text>
          </Pressable>
        ) : null}

        <View>
          <SectionHeader
            title={subscription.isPro ? 'Featured for you' : 'Starter routines'}
            actionLabel="See all"
            onAction={() => router.push('/programmes' as Href)}
          />
          {missingSql ? (
            <View style={[styles.card, { backgroundColor: colours.brandSoft, borderRadius: radius.lg }]}>
              <Text style={[type.bodySm, { color: colours.ink }]}>{missingRoutinesMessage()}</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              style={styles.carouselBleed}>
              {featured.map((routine) => (
                <ImageCard
                  key={routine.id}
                  title={routine.name}
                  subtitle={`${routine.length_weeks} weeks · ${routine.days_per_week} days / week`}
                  image={coverImage(routine)}
                  letter={routine.name.slice(0, 1)}
                  isPro={!subscription.isPro && routine.is_pro}
                  isFree={!subscription.isPro && !routine.is_pro}
                  locked={!subscription.isPro && routine.is_pro}
                  progress={
                    progress[routine.id] ? progress[routine.id].done / progress[routine.id].target : undefined
                  }
                  onPress={() => openRoutine(routine)}
                  style={{ width: featuredWidth }}
                />
              ))}
            </ScrollView>
          )}
        </View>

        {stretches.length > 0 ? (
          <View>
            <SectionHeader
              title="Stretch today"
              actionLabel="See all"
              onAction={() => router.push({ pathname: '/programmes', params: { section: 'stretches' } } as Href)}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              style={styles.carouselBleed}>
              {stretches.map((routine) => (
                <ImageCard
                  key={routine.id}
                  title={routine.name}
                  subtitle={`${routine.session_minutes} min`}
                  image={coverImage(routine)}
                  letter={routine.name.slice(0, 1)}
                  isPro={!subscription.isPro && routine.is_pro}
                  isFree={!subscription.isPro && !routine.is_pro}
                  locked={!subscription.isPro && routine.is_pro}
                  imageAspectRatio={16 / 10}
                  onPress={() => openStretch(routine)}
                  style={{ width: stretchWidth }}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {enrolment && !next && !missingSql ? (
          <View style={[styles.card, { backgroundColor: colours.brandSoft, borderRadius: radius.lg }]}>
            <Text style={[type.bodySm, { color: colours.ink }]}>
              {describeRoutineError('This routine has no sessions yet.')}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <OverflowMenu visible={routineMenuOpen} anchor={routineMenuAnchor} onClose={() => setRoutineMenuOpen(false)}>
        <MenuHeader
          label={enrolment?.routine.name ?? 'Your routine'}
          detail="Switch to another plan, or end this one. Your logged sessions stay."
        />
        <MenuRow
          label="Switch routine"
          onPress={() => {
            setRoutineMenuOpen(false);
            router.push('/programmes' as Href);
          }}
        />
        <MenuRow
          label="End routine"
          danger
          onPress={() => {
            setRoutineMenuOpen(false);
            requestEndRoutine();
          }}
        />
      </OverflowMenu>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 20,
    gap: 20,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    padding: 20,
  },
  heroClip: {
    overflow: 'hidden',
  },
  heroPhoto: {
    aspectRatio: 16 / 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFill: {
    width: '100%',
    height: '100%',
  },
  heroLetter: {
    fontSize: 48,
    fontWeight: '700',
  },
  heroBody: {
    padding: 20,
  },
  heroHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  weekCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  flex: {
    flex: 1,
  },
  carouselBleed: {
    marginHorizontal: -24,
    marginVertical: -12,
    overflow: 'visible',
  },
  carousel: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 12,
  },
  limitButton: {
    minHeight: 56,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pressed: {
    opacity: 0.8,
  },
});
