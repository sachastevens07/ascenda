import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
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
  AppText,
  ArticleCard,
  AwardsPreview,
  ChallengeHomeCard,
  Chip,
  FuelSuggestionCard,
  HomeHeader,
  IconButton,
  ImageCard,
  OverflowMenu,
  PrimaryButton,
  RecapHomeCard,
  ReferralBanner,
  SectionHeader,
  ShareStatsCard,
  TabAvatar,
  TextButton,
  TypeRing,
  WeekStripCard,
  WeekTodayEmpty,
  WeekTodaySession,
  WelcomeHero,
  WhatsNextCard,
  openRecipe,
  pickAwardsPreview,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  DEFAULT_STREAK_GOAL,
  fetchFinishedSessionMeta,
  fetchStreakGoal,
  getWeeklyStreak,
  normalizeWeeklyTarget,
  sessionDurationSeconds,
  thisWeekTypeCounts,
  type WeekTypeCounts,
  type WeeklyStreak,
} from '@/lib/activityStats';
import {
  EMPTY_ACHIEVEMENT_EXTRAS,
  fetchAchievementExtras,
  fetchHideAchievements,
  getAchievementBadges,
  type AchievementBadge,
} from '@/lib/achievements';
import { equipmentFromMachinesUsed } from '@/lib/onboardingAnswers';
import {
  fetchHideStreak,
  maybeCelebrateStreakGoal,
  maybePromptMissedWeek,
  maybeTrackStreakRepair,
} from '@/lib/streak';
import {
  challengeTimingCopy,
  fetchChallenges,
  pickHomeChallenge,
  type Challenge,
} from '@/lib/challenges';
import { countOwnedCustomWorkouts } from '@/lib/customWorkouts';
import { pickTodaysFuelSuggestion } from '@/lib/foodSuggestions';
import { getExerciseImageSource } from '@/lib/exerciseMedia';
import { aiCopy, billingReminderCopy, fillCopy, foodCopy, homeCopy, nextSessionMenuCopy, routineActionsCopy, subscriptionBanners, welcomeBackCopy } from '@/lib/copy';
import { openRefer } from '@/lib/referrals';
import { routineCardDays } from '@/lib/contentRoutines';
import { coverForChallenge, coverForRoutine, homeHeroSlug, takeCoverSource, takeSlug } from '@/lib/images';
import {
  addDays,
  isPlannedSessionKind,
  loadPlannerWeek,
  startOfWeekMonday,
  toIso,
  type PlannerDayView,
  type PlannerWeek,
} from '@/lib/planner';
import { dismissRecap, loadMonthlyRecap, type MonthlyRecap } from '@/lib/monthlyRecap';
import { fetchProgressSets, getPersonalBests } from '@/lib/progress';
import { fetchLearnArticles, recommendArticles, type LearnArticle } from '@/lib/learn';
import { ensureSubscribed } from '@/lib/paywall';
import { maybeAskSessionReminders, syncPlannerReminders } from '@/lib/reminders';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { formatShortDate } from '@/lib/progress';
import {
  WELCOME_BACK_ROUTINE_ID,
  daysInWeek,
  describeRoutineError,
  endActiveEnrolment,
  fetchActiveEnrolment,
  fetchLatestCompletedEnrolment,
  fetchRoutine,
  fetchCompletedEnrolmentCount,
  fetchRoutineProgressMap,
  fetchRoutines,
  firstDayOfRoutine,
  getNextRoutineDay,
  missingRoutinesMessage,
  isGymBackupRoutine,
  pickFeaturedRoutines,
  resetEnrolmentToWeek,
  startRoutine,
  type PlannedSession,
  type Routine,
  type RoutineDay,
  type RoutineEnrolment,
  type RoutineSummary,
} from '@/lib/routines';
import {
  fetchHandOffPreview,
  handOffCardCopy,
  isInHandoffWindow,
  resolveNextRoutineOffer,
  startNextRoutineOnMonday,
  type NextRoutineOffer,
} from '@/lib/handOff';
import {
  dismissWelcomeBack,
  resolveWelcomeBackOffer,
  saveWelcomeBackPreview,
  type WelcomeBackOffer,
} from '@/lib/welcomeBack';
import { openCardioFromPlan, openLogger, openRecoveryFromPlan, openRoutineLogger } from '@/lib/startLogger';
import { useWorkout } from '@/lib/workout';
import {
  fetchActiveSession,
  fetchLastFinishedRoutineSession,
  startCustomSession,
  type Session,
} from '@/lib/sessions';
import { isCardioSession } from '@/lib/sessionTypes';
import { fetchStretchRoutines } from '@/lib/stretches';
import {
  STORE_NAME,
  isRenewalSoon,
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
  streak: WeeklyStreak;
  hideStreak: boolean;
  hideAchievements: boolean;
  hideRefer: boolean;
  welcomeBack: WelcomeBackOffer | null;
  handOff: NextRoutineOffer | null;
  challenge: Challenge | null;
  progress: Record<string, { done: number; target: number }>;
  learn: LearnArticle[];
  planner: PlannerWeek | null;
  weekStats: { sessions: number; personalBests: number; minutes: string; awards: number };
  weekTypes: WeekTypeCounts;
  awardPreview: AchievementBadge[];
  lifetimeSessions: number;
};

const REFER_HIDE_KEY = 'home-refer-banner-hidden';
const WEEKDAY_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

function fallbackStripDays(): { iso: string; isToday: boolean }[] {
  const monday = startOfWeekMonday(new Date());
  const today = toIso(new Date());
  return Array.from({ length: 7 }, (_, index) => {
    const iso = toIso(addDays(monday, index));
    return { iso, isToday: iso === today };
  });
}

function heroCopyFor(input: {
  inProgress: boolean;
  welcomeBack: WelcomeBackOffer | null;
  enrolment: boolean;
  rest: boolean;
  planned: boolean;
  doneToday: boolean;
  nextName: string;
  minutes: number;
  exercises: number;
  nextDay: string;
  name: string;
}): { eyebrow: string; title: string; subtitle: string; cta: string } {
  if (input.inProgress) {
    return {
      eyebrow: 'In progress',
      title: 'You have a session going',
      subtitle: 'Finish or discard it before starting another.',
      cta: 'Continue session',
    };
  }
  if (input.welcomeBack) {
    return {
      eyebrow: welcomeBackCopy.eyebrow,
      title: input.welcomeBack.title,
      subtitle: input.welcomeBack.body,
      cta: welcomeBackCopy.card_cta,
    };
  }
  if (!input.enrolment) {
    return {
      eyebrow: homeCopy.hero_no_routine.eyebrow,
      title: homeCopy.hero_no_routine.title,
      subtitle: homeCopy.hero_no_routine.subtitle,
      cta: homeCopy.hero_no_routine.cta,
    };
  }
  if (input.doneToday) {
    return {
      eyebrow: homeCopy.hero_done_today.eyebrow,
      title: fillCopy(homeCopy.hero_done_today.title, { name: input.name }),
      subtitle: fillCopy(homeCopy.hero_done_today.subtitle, {
        session_name: input.nextName,
        next_day: input.nextDay,
      }),
      cta: homeCopy.hero_done_today.cta,
    };
  }
  if (input.rest) {
    return homeCopy.hero_rest_day;
  }
  if (input.planned) {
    return {
      eyebrow: homeCopy.hero_planned_today.eyebrow,
      title: fillCopy(homeCopy.hero_planned_today.title, { session_name: input.nextName }),
      subtitle:
        input.exercises > 0
          ? fillCopy(homeCopy.hero_planned_today.subtitle, {
              minutes: input.minutes,
              exercise_count: input.exercises,
            })
          : fillCopy(homeCopy.hero_planned_today.subtitle_timed, { minutes: input.minutes }),
      cta: homeCopy.hero_planned_today.cta,
    };
  }
  return homeCopy.hero_nothing_planned;
}

function sessionThumbnail(
  day: RoutineDay,
  routine: RoutineSummary,
  used: Set<string>
): ImageSourcePropType | null {
  for (const slot of day.exercises) {
    const photo = getExerciseImageSource(slot.exercise);
    if (photo) return photo;
  }
  return takeCoverSource(coverForRoutine(routine), used);
}

export default function HomeScreen() {
  const tabBarHeight = useTabBarHeight();
  const { width, height } = useWindowDimensions();
  const { colours, spacing, radius, shadow } = useTheme();
  const { profile } = useProfile();
  const workout = useWorkout();
  const answers = getQuizAnswers(profile);
  const subscription = useSubscription();
  const [data, setData] = useState<HomeData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [trialBannerHidden, setTrialBannerHidden] = useState(false);
  const [renewalBannerHidden, setRenewalBannerHidden] = useState(false);
  const routineMenuRef = useRef<AnchorHandle>(null);
  const [routineMenuOpen, setRoutineMenuOpen] = useState(false);
  const [routineMenuAnchor, setRoutineMenuAnchor] = useState<AnchorRect | null>(null);
  const [routineMenuMode, setRoutineMenuMode] = useState<'actions' | 'days'>('actions');
  const welcomeBackMenuRef = useRef<AnchorHandle>(null);
  const [welcomeBackMenuOpen, setWelcomeBackMenuOpen] = useState(false);
  const [welcomeBackMenuAnchor, setWelcomeBackMenuAnchor] = useState<AnchorRect | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [referHidden, setReferHidden] = useState(false);
  const [recap, setRecap] = useState<MonthlyRecap | null>(null);
  const [weekTab, setWeekTab] = useState<'workouts' | 'meals'>('workouts');
  const featuredWidth = width * 0.78;
  const stretchWidth = width * 0.56;
  const heroHeight = Math.round(Math.min(Math.max(height * 0.45, 260), 380));

  useEffect(() => {
    const ends = subscription.trialEndsAt;
    if (!ends) {
      setTrialBannerHidden(false);
      return;
    }
    AsyncStorage.getItem(`trial-ending-banner:${ends.toISOString()}`)
      .then((value) => setTrialBannerHidden(value === '1'))
      .catch(() => setTrialBannerHidden(false));
  }, [subscription.trialEndsAt]);

  useEffect(() => {
    const renews = subscription.expiresAt;
    if (!renews || !isRenewalSoon(subscription)) {
      setRenewalBannerHidden(false);
      return;
    }
    AsyncStorage.getItem(`renewal-banner:${renews.toISOString()}`)
      .then((value) => setRenewalBannerHidden(value === '1'))
      .catch(() => setRenewalBannerHidden(false));
  }, [
    subscription.expiresAt,
    subscription.status,
    subscription.willRenew,
    subscription.isAnnual,
  ]);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      if (subscription.isLoading || !subscription.isPro) return;
      (async () => {
        try {
          const [
            routines,
            enrolment,
            activeSession,
            ownedWorkouts,
            challenges,
            progress,
            sessions,
            stretchRoutines,
            streakGoal,
            hideStreak,
            completedEnrolment,
            handOffPreview,
            plannerWeek,
            sets,
            hideAchievements,
            extras,
            completedRoutines,
            hideReferStored,
          ] = await Promise.all([
            fetchRoutines(),
            fetchActiveEnrolment(),
            fetchActiveSession(),
            countOwnedCustomWorkouts(),
            fetchChallenges().catch(() => []),
            fetchRoutineProgressMap().catch(() => ({})),
            fetchFinishedSessionMeta().catch(() => []),
            fetchStretchRoutines().catch(() => []),
            fetchStreakGoal().catch(() => DEFAULT_STREAK_GOAL),
            fetchHideStreak().catch(() => false),
            fetchLatestCompletedEnrolment().catch(() => null),
            fetchHandOffPreview().catch(() => false),
            loadPlannerWeek().catch(() => null),
            fetchProgressSets().catch(() => []),
            fetchHideAchievements().catch(() => false),
            fetchAchievementExtras(
              equipmentFromMachinesUsed(profile?.onboarding_answers?.machines_used)
            ).catch(() => ({
              ...EMPTY_ACHIEVEMENT_EXTRAS,
              knownEquipment: equipmentFromMachinesUsed(profile?.onboarding_answers?.machines_used),
            })),
            fetchCompletedEnrolmentCount().catch(() => 0),
            AsyncStorage.getItem(REFER_HIDE_KEY)
              .then((value) => value === '1')
              .catch(() => false),
          ]);
          const missingSql = routines.length === 0;
          const featured = answers
            ? pickFeaturedRoutines(routines, answers, 4, {
                excludeIds: enrolment ? [enrolment.routine_id] : undefined,
              })
            : routines
                .filter((routine) => !isGymBackupRoutine(routine) && routine.id !== enrolment?.routine_id)
                .slice(0, 4);
          const stretches = stretchRoutines.slice(0, 4);
          let routine: Routine | null = null;
          let next: PlannedSession | null = null;
          let lastDayId: string | null = null;
          if (enrolment) {
            routine = await fetchRoutine(enrolment.routine_id);
            const last = await fetchLastFinishedRoutineSession(enrolment.id);
            lastDayId = last?.routine_day_id ?? last?.programme_day_id ?? null;
            next = routine ? getNextRoutineDay(routine, enrolment, lastDayId) : null;
          }
          const streak = getWeeklyStreak(
            sessions,
            normalizeWeeklyTarget(answers?.days_per_week),
            streakGoal
          );
          const welcomeBack = await resolveWelcomeBackOffer({
            sessions,
            enrolment,
            routine,
            lastDayId,
            nextDay: next?.day ?? (routine ? firstDayOfRoutine(routine) : null),
            catalogue: routines,
            displayName: profile?.display_name,
          }).catch(() => null);
          const inWindow = enrolment ? isInHandoffWindow(enrolment) : Boolean(completedEnrolment);
          const showHandOff = handOffPreview || inWindow;
          const handOff = showHandOff
            ? await resolveNextRoutineOffer({
                currentRoutineId: enrolment?.routine_id ?? completedEnrolment?.routine_id ?? null,
                catalogue: routines,
                answers,
                mode: enrolment ? 'preview' : 'start',
              }).catch(() => null)
            : null;
          const learnArticles = await fetchLearnArticles().catch(() => []);
          const learn = recommendArticles(learnArticles, answers, { limit: 4 });
          const badges = getAchievementBadges({
            sessions,
            sets,
            streak,
            completedRoutines,
            extras,
          });
          const weekStart = plannerWeek?.weekStart ?? toIso(startOfWeekMonday(new Date()));
          const weekEnd = plannerWeek?.weekEnd ?? toIso(addDays(startOfWeekMonday(new Date()), 6));
          const weekSessions = sessions.filter((session) => session.date >= weekStart && session.date <= weekEnd);
          const weekSeconds = weekSessions.reduce((sum, session) => sum + sessionDurationSeconds(session), 0);
          const weekPbs = getPersonalBests(sets).filter((item) => item.date >= weekStart && item.date <= weekEnd).length;
          const weekAwards = badges.filter(
            (item) => item.unlocked && item.unlockedOn && item.unlockedOn >= weekStart && item.unlockedOn <= weekEnd
          ).length;
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
            streak,
            hideStreak,
            hideAchievements,
            hideRefer: hideReferStored,
            welcomeBack,
            handOff,
            challenge: pickHomeChallenge(challenges),
            progress,
            learn,
            planner: plannerWeek,
            weekStats: {
              sessions: weekSessions.length,
              personalBests: weekPbs,
              minutes: String(Math.max(0, Math.round(weekSeconds / 60))),
              awards: weekAwards,
            },
            weekTypes: thisWeekTypeCounts(sessions),
            awardPreview: pickAwardsPreview(badges),
            lifetimeSessions: sessions.length,
          });
          setReferHidden(hideReferStored);
          setLoadState('ready');
          void loadMonthlyRecap({ sessions, sets })
            .then((next) => {
              if (isCurrent) setRecap(next);
            })
            .catch(() => {
              if (isCurrent) setRecap(null);
            });
          if (!hideStreak) void maybeCelebrateStreakGoal(streak);
          void maybeTrackStreakRepair(streak);
          void maybePromptMissedWeek(streak);
          void maybeAskSessionReminders();
          void syncPlannerReminders();
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
      profile?.display_name,
      profile?.onboarding_answers?.machines_used,
      subscription.isPro,
      subscription.isLoading,
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

  async function startDay(
    day: RoutineDay,
    options?: { enrolmentId?: string; easeBack?: boolean; welcomeBack?: boolean }
  ) {
    if (!ensureSubscribed()) return;
    const enrolmentId = options?.enrolmentId ?? data?.enrolment?.id;
    if (!enrolmentId) return;
    setRoutineMenuOpen(false);
    setRoutineMenuMode('actions');
    setIsStarting(true);
    try {
      await openRoutineLogger({
        enrolmentId,
        routineDayId: day.id,
        sourceProgrammeDayId: day.source_programme_day_id,
        easeBack: options?.easeBack,
        welcomeBack: options?.welcomeBack,
      });
    } finally {
      setIsStarting(false);
    }
  }

  async function startLighterSession() {
    const offer = data?.welcomeBack;
    if (!offer) return;
    try {
      if (data.enrolment && offer.nextDay) {
        await startDay(offer.nextDay, { easeBack: true, welcomeBack: true });
        return;
      }
      const created = await startRoutine(WELCOME_BACK_ROUTINE_ID);
      const started = await fetchRoutine(created.routine_id);
      const day = started ? firstDayOfRoutine(started) : null;
      if (!day) {
        showDialog('Couldn’t start that session', 'Open Train and pick a routine when you’re ready.');
        return;
      }
      await startDay(day, { enrolmentId: created.id, easeBack: true, welcomeBack: true });
      setAttempt((count) => count + 1);
    } catch (error) {
      showDialog('Couldn’t start the session', describeRoutineError(error));
    }
  }

  async function restartThisWeek() {
    const offer = data?.welcomeBack;
    if (!data?.enrolment || offer?.restartWeek == null || !offer.restartDay) return;
    try {
      await resetEnrolmentToWeek(data.enrolment.id, offer.restartWeek);
      await startDay(offer.restartDay, { welcomeBack: true });
      setAttempt((count) => count + 1);
    } catch (error) {
      showDialog('Couldn’t restart this week', describeRoutineError(error));
    }
  }

  async function startNextFromHandOff() {
    const offer = data?.handOff;
    if (!offer) return;
    if (offer.mode !== 'start') {
      openRoutine(offer.routine);
      return;
    }
    setIsStarting(true);
    try {
      await startNextRoutineOnMonday(offer.routine);
      setAttempt((count) => count + 1);
    } catch (error) {
      showDialog('Couldn’t start that plan', describeRoutineError(error));
    } finally {
      setIsStarting(false);
    }
  }

  async function switchToWelcomeBackRoutine() {
    const lighter = data?.welcomeBack?.lighterRoutine;
    if (!lighter) return;
    const routineId = lighter.id;
    const startIt = async () => {
      try {
        const created = await startRoutine(routineId);
        const started = await fetchRoutine(created.routine_id);
        const day = started ? firstDayOfRoutine(started) : null;
        if (day) {
          await startDay(day, { enrolmentId: created.id, welcomeBack: true });
        }
        setAttempt((count) => count + 1);
      } catch (error) {
        showDialog('Couldn’t switch routine', describeRoutineError(error));
      }
    };
    if (!data?.enrolment) {
      await startIt();
      return;
    }
    showDialog(routineActionsCopy.switch_title, routineActionsCopy.switch_body, [
      { text: routineActionsCopy.switch_cta, onPress: () => void startIt() },
      { text: routineActionsCopy.cancel, style: 'cancel' },
    ]);
  }

  function skipWelcomeBack() {
    setWelcomeBackMenuOpen(false);
    void Promise.all([dismissWelcomeBack(), saveWelcomeBackPreview(false)]).then(() =>
      setAttempt((count) => count + 1)
    );
  }

  function openWelcomeBackOptions() {
    measureAnchor(welcomeBackMenuRef.current, (rect) => {
      setWelcomeBackMenuAnchor(rect);
      setWelcomeBackMenuOpen(true);
    });
  }

  function confirmRestartWeek() {
    const offer = data?.welcomeBack;
    if (!offer?.restartWeek) return;
    setWelcomeBackMenuOpen(false);
    showDialog(
      welcomeBackCopy.options.restart_week.title,
      fillCopy(welcomeBackCopy.options.restart_week.subtitle, { week: offer.restartWeek }),
      [
        { text: welcomeBackCopy.cta, onPress: () => void restartThisWeek() },
        { text: welcomeBackCopy.later, style: 'cancel' },
      ]
    );
  }

  function openSessionDetail() {
    if (!ensureSubscribed()) return;
    if (!data?.next) return;
    void startDay(data.next.day);
  }

  function continueSession() {
    if (!ensureSubscribed()) return;
    if (!data?.activeSession) return;
    if (data.activeSession.source === 'stretch') {
      router.push({ pathname: '/stretches/play', params: { sessionId: data.activeSession.id } });
      return;
    }
    if (isCardioSession(data.activeSession)) {
      router.push({ pathname: '/cardio/play', params: { sessionId: data.activeSession.id } });
      return;
    }
    router.push({ pathname: '/session/[id]', params: { id: data.activeSession.id } });
  }

  function handleCreateWorkout() {
    router.push({ pathname: '/workouts/[id]', params: { id: 'new' } });
  }

  function requestEndRoutine() {
    if (!data?.enrolment) return;
    showDialog(
      fillCopy(routineActionsCopy.end_title, { routine_name: data.enrolment.routine.name }),
      routineActionsCopy.end_body,
      [
        { text: routineActionsCopy.end_cta, style: 'destructive', onPress: handleEndRoutine },
        { text: routineActionsCopy.cancel, style: 'cancel' },
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

  function dismissRefer() {
    setReferHidden(true);
    AsyncStorage.setItem(REFER_HIDE_KEY, '1').catch(() => setReferHidden(false));
  }

  function shareWeekStats() {
    const stats = data?.weekStats;
    if (!stats) return;
    void Share.share({
      message: `${homeCopy.section_week_so_far}: ${stats.sessions} sessions, ${stats.personalBests} personal bests, ${stats.minutes} minutes, ${stats.awards} awards.`,
    }).catch(() => {});
  }

  async function startTodayFromPlanner(today: PlannerDayView) {
    if (!ensureSubscribed()) return;
    if (today.kind === 'custom' && today.plan?.custom_workout_id) {
      setIsStarting(true);
      try {
        const session = await startCustomSession(today.plan.custom_workout_id);
        openLogger(session.id);
      } catch (error) {
        showDialog('Couldn’t start that session', describeRoutineError(error));
      } finally {
        setIsStarting(false);
      }
      return;
    }
    const dayId = today.plan?.routine_day_id;
    const day = dayId && data?.routine ? data.routine.weeks.flatMap((week) => week.days).find((item) => item.id === dayId) : null;
    if (day && today.kind !== 'cardio') {
      await startDay(day);
      return;
    }
    if (today.kind === 'cardio' && today.plan?.cardio_slug) {
      setIsStarting(true);
      try {
        await openCardioFromPlan(today.plan.cardio_slug, workout.publish);
      } finally {
        setIsStarting(false);
      }
      return;
    }
    if (today.kind === 'recovery' && today.plan?.stretch_slug) {
      setIsStarting(true);
      try {
        await openRecoveryFromPlan(today.plan.stretch_slug, workout.publish);
      } finally {
        setIsStarting(false);
      }
      return;
    }
    if (data?.next) {
      await startDay(data.next.day);
      return;
    }
    router.push('/planner' as Href);
  }

  function inviteFriend() {
    openRefer();
  }

  function openRoutineMenu() {
    if (!data?.enrolment) return;
    measureAnchor(routineMenuRef.current, (rect) => {
      setRoutineMenuAnchor(rect);
      setRoutineMenuMode('actions');
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
            <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
              We couldn’t load Home. Check your connection and try again.
            </AppText>
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

  const {
    featured,
    stretches,
    enrolment,
    routine,
    next,
    missingSql,
    activeSession,
    welcomeBack,
    handOff,
    challenge,
    progress,
    learn,
    planner,
    weekStats,
    weekTypes,
    awardPreview,
    lifetimeSessions,
    hideAchievements,
    streak,
  } = data;
  const inProgress = Boolean(activeSession);
  const weekDays = routine && next ? daysInWeek(routine, next.weekNumber) : [];
  const usedPhotos = new Set<string>();
  const plannerDays = planner?.days ?? [];
  const todayPlan = plannerDays.find((day) => day.isToday) ?? null;
  const heroSlug = takeSlug(
    homeHeroSlug({
      welcomeBack: Boolean(welcomeBack) && !inProgress,
      rest: todayPlan?.kind === 'rest',
      doneToday: Boolean(todayPlan?.completed),
      evening: new Date().getHours() >= 17,
    }),
    usedPhotos
  );
  const nextThumb =
    enrolment && next ? sessionThumbnail(next.day, enrolment.routine, usedPhotos) : null;
  const handOffSlug = handOff ? takeSlug(coverForRoutine(handOff.routine)?.id, usedPhotos) : null;
  const handOffCard = handOff ? handOffCardCopy(handOff) : null;
  const challengeSlug = challenge ? takeSlug(coverForChallenge(challenge)?.id, usedPhotos) : null;
  const stripDays =
    plannerDays.length > 0
      ? plannerDays.map((day, index) => ({
          iso: day.iso,
          label: WEEKDAY_SHORT[index] ?? 'Mo',
          isToday: day.isToday,
          planned: isPlannedSessionKind(day.kind) && !day.isOptional,
          completed: day.completed,
        }))
      : fallbackStripDays().map((day, index) => ({
          iso: day.iso,
          label: WEEKDAY_SHORT[index] ?? 'Mo',
          isToday: day.isToday,
          planned: false,
          completed: false,
        }));
  const upcoming = plannerDays.find(
    (day) => !day.isToday && !day.isPast && isPlannedSessionKind(day.kind) && !day.isOptional
  );
  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? 'you';
  const todayLive = todayPlan && isPlannedSessionKind(todayPlan.kind) && !todayPlan.completed ? todayPlan : null;
  const hero = heroCopyFor({
    inProgress,
    welcomeBack,
    enrolment: Boolean(enrolment),
    rest: todayPlan?.kind === 'rest',
    planned: Boolean(todayLive) || (!todayPlan && Boolean(next)),
    doneToday: Boolean(todayPlan?.completed),
    nextName: todayLive?.title ?? next?.day.name ?? 'your session',
    minutes: todayLive?.sessionMinutes ?? enrolment?.routine.session_minutes ?? 45,
    exercises: todayLive ? todayLive.exercises.length : (next?.day.exercises.length ?? 0),
    nextDay: upcoming?.title ?? next?.day.name ?? 'your next session',
    name: firstName,
  });
  const showTodaySession =
    !inProgress &&
    !welcomeBack &&
    todayPlan &&
    isPlannedSessionKind(todayPlan.kind) &&
    !todayPlan.completed;
  const showTodayEmpty =
    !inProgress &&
    !welcomeBack &&
    !showTodaySession &&
    todayPlan?.kind !== 'rest' &&
    !todayPlan?.completed;
  const showFeatured = missingSql || featured.length > 0;
  const showWeekStats = lifetimeSessions > 0;
  const showAwards = !hideAchievements && awardPreview.length > 0;
  const showRefer = !referHidden;
  const showLearn = learn.length > 0;
  const showStretch = stretches.length > 0;
  const showChallenge = Boolean(challenge);
  const fuel = pickTodaysFuelSuggestion(todayPlan);
  const showHeroFuel = Boolean(fuel) && Boolean(todayPlan?.completed) && !inProgress && !welcomeBack;

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <HomeHeader
          leading={<TabAvatar />}
          onSearch={() => router.push('/programmes' as Href)}
          onPlanner={() => router.push('/planner' as Href)}
        />

        {subscription.status === 'grace' ? (
          <View style={[styles.banner, { backgroundColor: colours.accentSoft, borderRadius: radius.lg }]}>
            <AppText variant="bodySm" style={{ color: colours.ink, flex: 1 }}>
              {subscriptionBanners.grace}
            </AppText>
            <TextButton
              label={subscriptionBanners.grace_cta}
              onPress={handleManageSubscription}
              style={{ alignSelf: 'flex-start' }}
            />
          </View>
        ) : null}

        {subscription.status !== 'grace' &&
        subscription.trialEndsAt &&
        isTrialEndingSoon(subscription) &&
        !trialBannerHidden ? (
          <View style={[styles.banner, { backgroundColor: colours.accentSoft, borderRadius: radius.lg }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="bodySm" style={{ color: colours.ink }}>
                {fillCopy(subscriptionBanners.trial_ending, {
                  day: subscription.trialEndsAt.toLocaleDateString('en-GB', { weekday: 'short' }),
                })}
              </AppText>
              <TextButton
                label={subscriptionBanners.trial_ending_cta}
                onPress={handleManageSubscription}
                style={{ alignSelf: 'flex-start' }}
              />
            </View>
            <IconButton
              icon="close"
              accessibilityLabel={subscriptionBanners.dismiss_a11y}
              onPress={() => {
                setTrialBannerHidden(true);
                const ends = subscription.trialEndsAt;
                if (ends) {
                  AsyncStorage.setItem(`trial-ending-banner:${ends.toISOString()}`, '1').catch(() => {});
                }
              }}
            />
          </View>
        ) : null}

        {subscription.status !== 'grace' &&
        !isTrialEndingSoon(subscription) &&
        isRenewalSoon(subscription) &&
        subscription.expiresAt &&
        !renewalBannerHidden ? (
          <View style={[styles.banner, { backgroundColor: colours.accentSoft, borderRadius: radius.lg }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="bodySm" style={{ color: colours.ink }}>
                {fillCopy(
                  subscription.priceString
                    ? billingReminderCopy.renewal.body
                    : billingReminderCopy.renewal.body.replace(' at {price}', ''),
                  {
                    date: formatShortDate(subscription.expiresAt),
                    price: subscription.priceString ?? '',
                  }
                )}
              </AppText>
              <TextButton
                label={subscriptionBanners.trial_ending_cta}
                onPress={handleManageSubscription}
                style={{ alignSelf: 'flex-start' }}
              />
            </View>
            <IconButton
              icon="close"
              accessibilityLabel={subscriptionBanners.dismiss_a11y}
              onPress={() => {
                setRenewalBannerHidden(true);
                const renews = subscription.expiresAt;
                if (renews) {
                  AsyncStorage.setItem(`renewal-banner:${renews.toISOString()}`, '1').catch(() => {});
                }
              }}
            />
          </View>
        ) : null}

        <WelcomeHero
          imageSlug={heroSlug}
          height={heroHeight}
          eyebrow={hero.eyebrow}
          title={hero.title}
          subtitle={hero.subtitle}
          cta={hero.cta}
          onCta={() => {
            if (inProgress) {
              continueSession();
              return;
            }
            if (welcomeBack) {
              void startLighterSession();
              return;
            }
            if (!enrolment) {
              router.push('/programmes' as Href);
              return;
            }
            if (todayPlan?.completed) {
              router.push('/(tabs)/activity' as Href);
              return;
            }
            if (todayPlan?.kind === 'rest') {
              router.push({ pathname: '/programmes', params: { section: 'stretches' } } as Href);
              return;
            }
            if (todayPlan && isPlannedSessionKind(todayPlan.kind)) {
              void startTodayFromPlanner(todayPlan);
              return;
            }
            if (next) {
              openSessionDetail();
              return;
            }
            router.push('/planner' as Href);
          }}
          ctaLoading={isStarting}
          ctaDisabled={isStarting || subscription.isLoading}
          secondaryLabel={welcomeBack && !inProgress ? welcomeBackCopy.see_options : !enrolment ? 'Create a workout' : undefined}
          onSecondary={
            welcomeBack && !inProgress
              ? openWelcomeBackOptions
              : !enrolment
                ? handleCreateWorkout
                : undefined
          }
          secondaryRef={welcomeBack && !inProgress ? welcomeBackMenuRef : undefined}
          menuRef={enrolment && next && !inProgress && !welcomeBack ? routineMenuRef : undefined}
          onMenu={enrolment && next && !inProgress && !welcomeBack ? openRoutineMenu : undefined}
          style={[styles.heroBleed, { borderRadius: 0 }]}
        />

        {showHeroFuel && fuel ? (
          <FuelSuggestionCard suggestion={fuel} onPress={() => openRecipe(fuel.recipe.slug)} />
        ) : null}

        {handOff && handOffCard && !inProgress ? (
          <WhatsNextCard
            title={handOffCard.title}
            body={handOffCard.body}
            imageSlug={handOffSlug}
            starting={isStarting && handOff.mode === 'start'}
            primaryLabel={handOffCard.primaryLabel}
            onPrimary={() => void startNextFromHandOff()}
            onSeeRoutine={handOff.mode === 'start' ? () => openRoutine(handOff.routine) : undefined}
            seeRoutineLabel={handOffCard.secondaryLabel}
            style={shadow}
          />
        ) : null}

        <TypeRing done={streak.doneThisWeek} target={streak.targetThisWeek} counts={weekTypes} />

        <View style={{ gap: spacing.sm }}>
          <View style={styles.weekTabs}>
            <Chip
              label={homeCopy.week_tab_workouts}
              selected={weekTab === 'workouts'}
              onPress={() => setWeekTab('workouts')}
            />
            <Chip
              label={homeCopy.week_tab_meals}
              selected={weekTab === 'meals'}
              onPress={() => setWeekTab('meals')}
            />
          </View>
          <WeekStripCard
            days={stripDays}
            onPressDay={() => router.push('/planner' as Href)}
            todayCard={
              weekTab === 'meals' ? (
                fuel ? (
                  <FuelSuggestionCard
                    suggestion={fuel}
                    onPress={() => openRecipe(fuel.recipe.slug)}
                    style={{ marginTop: spacing.md, shadowOpacity: 0, elevation: 0 }}
                  />
                ) : (
                  <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.md }}>
                    {homeCopy.meals_empty}
                  </AppText>
                )
              ) : showTodaySession && todayPlan ? (
                <WeekTodaySession
                  title={todayPlan.title ?? next?.day.name ?? 'Today’s session'}
                  subtitle={
                    todayPlan.subtitle ??
                    `${enrolment?.routine.session_minutes ?? todayPlan.sessionMinutes ?? 45} min`
                  }
                  image={nextThumb}
                  onPress={() => void startTodayFromPlanner(todayPlan)}
                />
              ) : showTodayEmpty ? (
                <WeekTodayEmpty onExplore={() => router.push('/planner' as Href)} />
              ) : null
            }
          />
        </View>

        {recap ? (
          <RecapHomeCard
            month={recap.monthName}
            onOpen={() =>
              router.push({ pathname: '/recap/[month]', params: { month: recap.monthKey } } as Href)
            }
            onDismiss={() => {
              setRecap(null);
              void dismissRecap(recap.monthKey);
            }}
          />
        ) : null}

        <Pressable
          onPress={() => {
            if (!ensureSubscribed()) return;
            router.push('/build-session' as Href);
          }}
          accessibilityRole="button"
          accessibilityLabel={aiCopy.build_title}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colours.surface, borderRadius: radius.lg, opacity: pressed ? 0.92 : 1 },
            shadow,
          ]}>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            {aiCopy.build_title}
          </AppText>
          <AppText variant="body" style={{ color: colours.ink, marginTop: 6 }}>
            {aiCopy.build_card_body}
          </AppText>
        </Pressable>

        {showFeatured ? (
          <View>
            <SectionHeader
              title={homeCopy.section_featured}
              actionLabel={homeCopy.see_all}
              onAction={() => router.push('/programmes' as Href)}
            />
            {missingSql ? (
              <View style={[styles.card, { backgroundColor: colours.brandSoft, borderRadius: radius.lg }]}>
                <AppText variant="bodySm" style={{ color: colours.ink }}>{missingRoutinesMessage()}</AppText>
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
                    subtitle={`${routine.length_weeks} weeks · ${routineCardDays(routine)} days / week`}
                    tags={routine.tags}
                    imageSlug={takeSlug(coverForRoutine(routine)?.id, usedPhotos)}
                    letter={routine.name.slice(0, 1)}
                    imageAspectRatio={16 / 10}
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
        ) : null}

        {showChallenge && challenge ? (
          <ChallengeHomeCard
            name={challenge.name}
            timing={challengeTimingCopy(challenge)}
            joined={Boolean(challenge.joined)}
            imageSlug={challengeSlug}
            onPress={() => router.push({ pathname: '/challenges/[id]', params: { id: challenge.id } } as Href)}
          />
        ) : null}

        {showRefer ? (
          <ReferralBanner imageSlug="hero-refer" onInvite={inviteFriend} onDismiss={dismissRefer} />
        ) : null}

        {showWeekStats ? (
          <ShareStatsCard
            sessions={weekStats.sessions}
            personalBests={weekStats.personalBests}
            minutes={weekStats.minutes}
            awards={weekStats.awards}
            onShare={shareWeekStats}
          />
        ) : null}

        {showAwards ? (
          <AwardsPreview
            badges={awardPreview}
            onSeeAll={() => router.push('/(tabs)/activity' as Href)}
            onOpen={() => router.push('/(tabs)/activity' as Href)}
          />
        ) : null}

        {showStretch ? (
          <View>
            <SectionHeader
              title={homeCopy.section_stretch_today}
              actionLabel={homeCopy.see_all}
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
                  imageSlug={takeSlug(coverForRoutine(routine)?.id, usedPhotos)}
                  letter={routine.name.slice(0, 1)}
                  imageAspectRatio={16 / 10}
                  onPress={() => openStretch(routine)}
                  style={{ width: stretchWidth }}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {showLearn ? (
          <View>
            <SectionHeader
              title={homeCopy.section_personalised}
              actionLabel={homeCopy.see_all}
              onAction={() => router.push('/learn' as Href)}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              style={styles.carouselBleed}>
              {learn.map((article) => (
                <ArticleCard key={article.id} article={article} width={stretchWidth} kindChip="Article" />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {enrolment && !next && !missingSql ? (
          <View style={[styles.card, { backgroundColor: colours.brandSoft, borderRadius: radius.lg }]}>
            <AppText variant="bodySm" style={{ color: colours.ink }}>
              {describeRoutineError('This routine has no sessions yet.')}
            </AppText>
          </View>
        ) : null}
      </ScrollView>

      <OverflowMenu
        visible={welcomeBackMenuOpen}
        anchor={welcomeBackMenuAnchor}
        onClose={() => setWelcomeBackMenuOpen(false)}>
        <MenuHeader label={welcomeBackCopy.eyebrow} />
        {welcomeBack?.nextDay ? (
          <MenuRow
            label={fillCopy(welcomeBackCopy.options.lighter.title, {
              session_name: welcomeBack.nextDay.name,
            })}
            detail={welcomeBackCopy.options.lighter.subtitle}
            onPress={() => {
              setWelcomeBackMenuOpen(false);
              void startLighterSession();
            }}
          />
        ) : null}
        {enrolment && welcomeBack?.restartDay && welcomeBack.restartWeek != null ? (
          <MenuRow
            label={welcomeBackCopy.options.restart_week.title}
            detail={fillCopy(welcomeBackCopy.options.restart_week.subtitle, {
              week: welcomeBack.restartWeek,
            })}
            onPress={confirmRestartWeek}
          />
        ) : null}
        {welcomeBack?.lighterRoutine ? (
          <MenuRow
            label={welcomeBackCopy.options.gentler_routine.title}
            detail={welcomeBackCopy.options.gentler_routine.subtitle}
            onPress={() => {
              setWelcomeBackMenuOpen(false);
              void switchToWelcomeBackRoutine();
            }}
          />
        ) : null}
        <MenuRow label={welcomeBackCopy.later} onPress={skipWelcomeBack} />
      </OverflowMenu>

      <OverflowMenu
        visible={routineMenuOpen}
        anchor={routineMenuAnchor}
        onClose={() => {
          setRoutineMenuOpen(false);
          setRoutineMenuMode('actions');
        }}>
        {routineMenuMode === 'days' ? (
          <>
            <MenuHeader label="Do a different day" detail="Opens that day’s session. Your routine stays the same." />
            {weekDays.map((day) => (
              <MenuRow
                key={day.id}
                label={`Day ${day.day_number}: ${day.name}`}
                onPress={() => void startDay(day)}
              />
            ))}
          </>
        ) : (
          <>
            <MenuHeader label={enrolment?.routine.name ?? 'Your routine'} />
            {weekDays.length > 1 ? (
              <MenuRow
                label={nextSessionMenuCopy.different_day}
                onPress={() => setRoutineMenuMode('days')}
              />
            ) : null}
            <MenuRow
              label={nextSessionMenuCopy.switch}
              onPress={() => {
                setRoutineMenuOpen(false);
                router.push('/programmes' as Href);
              }}
            />
            <MenuRow
              label={nextSessionMenuCopy.end}
              danger
              onPress={() => {
                setRoutineMenuOpen(false);
                requestEndRoutine();
              }}
            />
          </>
        )}
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
    paddingTop: 12,
    gap: 16,
  },
  heroBleed: {
    marginHorizontal: -24,
  },
  weekTabs: {
    flexDirection: 'row',
    gap: 8,
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
  banner: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
});
