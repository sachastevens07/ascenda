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
  ArticleCard,
  IconButton,
  ImageCard,
  OverflowMenu,
  PrimaryButton,
  ProMark,
  ProgressRing,
  QuoteCard,
  SectionHeader,
  TabAvatar,
  TextButton,
  WelcomeBackCard,
  WhatsNextCard,
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
  fetchHideStreak,
  fetchRestWeekStarts,
  maybeCelebrateStreakGoal,
  maybePromptMissedWeek,
  maybeTrackStreakRepair,
  syncRestWeeksBanked,
} from '@/lib/streak';
import {
  challengeTimingCopy,
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
import { DAILY_QUOTES, fetchDailyQuotes, fetchHideQuote, pickDailyQuote, saveHideQuote, type DailyQuote } from '@/lib/quotes';
import { fetchLearnArticles, recommendArticles, type LearnArticle } from '@/lib/learn';
import { openPaywall } from '@/lib/paywall';
import { fetchPlannedCountsByWeek, fetchThisWeekProgress, toIso, type WeekPlanProgress } from '@/lib/planner';
import { maybeAskSessionReminders, syncPlannerReminders } from '@/lib/reminders';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { formatShortDate } from '@/lib/progress';
import {
  daysInWeek,
  describeRoutineError,
  endActiveEnrolment,
  fetchActiveEnrolment,
  fetchLatestCompletedEnrolment,
  fetchRoutine,
  fetchRoutineProgressMap,
  fetchRoutines,
  firstDayOfRoutine,
  getNextRoutineDay,
  missingRoutinesMessage,
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
  isInHandoffWindow,
  previewCopy,
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
import { openRoutineLogger } from '@/lib/startLogger';
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
  hideStreak: boolean;
  hideQuote: boolean;
  welcomeBack: WelcomeBackOffer | null;
  handOff: NextRoutineOffer | null;
  challenge: Challenge | null;
  progress: Record<string, { done: number; target: number }>;
  learn: LearnArticle[];
  quotes: DailyQuote[];
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
  const [routineMenuMode, setRoutineMenuMode] = useState<'actions' | 'days'>('actions');
  const [isStarting, setIsStarting] = useState(false);
  const [quoteHidden, setQuoteHidden] = useState(false);
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
            hideStreak,
            hideQuote,
            restWeeks,
            completedEnrolment,
            handOffPreview,
            quotes,
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
            fetchHideStreak().catch(() => false),
            fetchHideQuote().catch(() => false),
            fetchRestWeekStarts().catch(() => new Set<string>()),
            fetchLatestCompletedEnrolment().catch(() => null),
            fetchHandOffPreview().catch(() => false),
            fetchDailyQuotes().catch(() => DAILY_QUOTES),
          ]);
          const missingSql = routines.length === 0;
          const featured = answers
            ? pickFeaturedRoutines(routines, answers, subscription.isPro ? 4 : 2, {
                freeOnly: !subscription.isPro,
                excludeIds: enrolment ? [enrolment.routine_id] : undefined,
              })
            : (subscription.isPro
                ? routines.slice(0, 4)
                : routines.filter((routine) => !routine.is_pro).slice(0, 2)
              ).filter((routine) => routine.id !== enrolment?.routine_id);
          const stretches = (subscription.isPro ? stretchRoutines : stretchRoutines.filter((item) => !item.is_pro)).slice(
            0,
            4
          );
          let routine: Routine | null = null;
          let next: PlannedSession | null = null;
          let lastDayId: string | null = null;
          if (enrolment) {
            routine = await fetchRoutine(enrolment.routine_id);
            const last = await fetchLastFinishedRoutineSession(enrolment.id);
            lastDayId = last?.routine_day_id ?? last?.programme_day_id ?? null;
            next = routine ? getNextRoutineDay(routine, enrolment, lastDayId) : null;
          }
          const from = sessions[0]?.date ?? toIso(new Date());
          const plannedByWeek = await fetchPlannedCountsByWeek(from, toIso(new Date())).catch(
            () => new Map<string, number>()
          );
          const fallbackTarget = answers?.days_per_week || enrolment?.routine.days_per_week || 3;
          const streak = getWeeklyStreak(sessions, plannedByWeek, fallbackTarget, streakGoal, restWeeks);
          void syncRestWeeksBanked(streak.restWeeksBanked);
          const welcomeBack = await resolveWelcomeBackOffer({
            sessions,
            enrolment,
            routine,
            lastDayId,
            nextDay: next?.day ?? (routine ? firstDayOfRoutine(routine) : null),
            catalogue: routines,
            isPro: subscription.isPro,
          }).catch(() => null);
          const inWindow = enrolment ? isInHandoffWindow(enrolment) : Boolean(completedEnrolment);
          const showHandOff = handOffPreview || inWindow;
          const handOff = showHandOff
            ? await resolveNextRoutineOffer({
                currentRoutineId: enrolment?.routine_id ?? completedEnrolment?.routine_id ?? null,
                catalogue: routines,
                answers,
                isPro: subscription.isPro,
                mode: enrolment ? 'preview' : 'start',
              }).catch(() => null)
            : null;
          if (handOff && enrolment) {
            handOff.why = `${previewCopy(enrolment)} ${handOff.why}`.trim();
          }
          const learnArticles = await fetchLearnArticles().catch(() => []);
          const learn = recommendArticles(learnArticles, answers, { limit: 2 });
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
            hideStreak,
            hideQuote,
            welcomeBack,
            handOff,
            challenge: pickHomeChallenge(challenges),
            progress,
            learn,
            quotes,
          });
          setQuoteHidden(hideQuote);
          setLoadState('ready');
          if (!hideStreak) void maybeCelebrateStreakGoal(streak);
          void maybeTrackStreakRepair(streak);
          void maybePromptMissedWeek(streak, () => setAttempt((count) => count + 1));
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

  async function startDay(
    day: RoutineDay,
    options?: { enrolmentId?: string; easeBack?: boolean; welcomeBack?: boolean }
  ) {
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
      const created = await startRoutine(offer.starterRoutineId);
      const started = await fetchRoutine(created.routine_id);
      const day = started ? firstDayOfRoutine(started) : null;
      if (!day) {
        showDialog('Couldn’t start that session', 'Open Programmes and pick a routine when you’re ready.');
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
      const result = await startNextRoutineOnMonday(offer.routine, subscription.isPro);
      if (result === 'paywall') {
        openPaywall('routine');
        return;
      }
      setAttempt((count) => count + 1);
    } catch (error) {
      showDialog('Couldn’t start that plan', describeRoutineError(error));
    } finally {
      setIsStarting(false);
    }
  }

  async function switchToLighterRoutine() {
    const lighter = data?.welcomeBack?.lighterRoutine;
    if (!lighter) return;
    if (lighter.is_pro && !subscription.isPro) {
      openPaywall('routine');
      return;
    }
    try {
      const created = await startRoutine(lighter.id);
      const started = await fetchRoutine(created.routine_id);
      const day = started ? firstDayOfRoutine(started) : null;
      if (day) {
        await startDay(day, { enrolmentId: created.id, easeBack: true, welcomeBack: true });
      }
      setAttempt((count) => count + 1);
    } catch (error) {
      showDialog('Couldn’t switch routine', describeRoutineError(error));
    }
  }

  function openWelcomeBackOptions() {
    const offer = data?.welcomeBack;
    if (!offer) return;
    const buttons: { text: string; style?: 'cancel' | 'default' | 'destructive'; onPress?: () => void }[] = [];
    if (data?.enrolment && offer.restartDay && offer.restartWeek != null) {
      buttons.push({
        text: `Restart week ${offer.restartWeek}`,
        onPress: () =>
          showDialog(
            `Restart week ${offer.restartWeek}?`,
            'You’ll pick up this week from the first session. Your logged sessions stay.',
            [
              { text: 'Restart week', onPress: () => void restartThisWeek() },
              { text: 'Not now', style: 'cancel' },
            ]
          ),
      });
    }
    if (offer.lighterRoutine) {
      buttons.push({
        text: `Try ${offer.lighterRoutine.name}`,
        onPress: () => void switchToLighterRoutine(),
      });
    }
    if (data?.enrolment && data.next) {
      buttons.push({
        text: 'Start my usual session',
        onPress: () => void startDay(data.next!.day, { welcomeBack: true }),
      });
    } else {
      buttons.push({
        text: 'Browse routines',
        onPress: () => router.push('/programmes' as Href),
      });
    }
    buttons.push({
      text: 'Not now',
      style: 'cancel',
      onPress: () => {
        void Promise.all([dismissWelcomeBack(), saveWelcomeBackPreview(false)]).then(() =>
          setAttempt((count) => count + 1)
        );
      },
    });
    showDialog('Ease back in', 'Pick what feels doable today.', buttons);
  }

  function openSessionDetail() {
    if (!data?.next) return;
    void startDay(data.next.day);
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

  function hideQuote() {
    setQuoteHidden(true);
    saveHideQuote(true).catch(() => setQuoteHidden(false));
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

  const { featured, stretches, enrolment, routine, next, missingSql, activeSession, weekProgress, streak, hideStreak, welcomeBack, handOff, challenge, progress, learn, quotes } =
    data;
  const quote = pickDailyQuote(quotes);
  const showQuote = !quoteHidden;
  const inProgress = Boolean(activeSession);
  const weekRatio = weekProgress.planned > 0 ? weekProgress.completed / weekProgress.planned : 0;
  const showWeekCard =
    weekProgress.planned > 0 || (!hideStreak && (streak.current > 0 || streak.weeksTrained > 0));
  const atCustomLimit = atFreeCustomWorkoutLimit(data.ownedWorkouts, subscription.isPro);
  const weekDays = routine && next ? daysInWeek(routine, next.weekNumber) : [];
  const nextThumb =
    enrolment && next && !inProgress ? sessionThumbnail(next.day, enrolment.routine) : null;

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <View style={styles.header}>
          <TabAvatar />
          <Text style={[type.display, { color: colours.ink, flex: 1 }]} numberOfLines={1}>
            {greeting(profile?.display_name)}
          </Text>
        </View>

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
            <PrimaryButton label="Continue session" onPress={continueSession} style={{ marginTop: spacing.md }} />
          </View>
        ) : null}

        {welcomeBack && !inProgress ? (
          <WelcomeBackCard
            body={welcomeBack.body}
            starting={isStarting}
            onStartLighter={() => void startLighterSession()}
            onSeeOptions={openWelcomeBackOptions}
          />
        ) : null}

        {enrolment && next && !inProgress && !welcomeBack ? (
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
                      accessibilityLabel="Session options"
                      onPress={openRoutineMenu}
                    />
                  </View>
                </View>
                <PrimaryButton
                  label={isStarting ? 'Starting…' : 'Start session'}
                  onPress={openSessionDetail}
                  loading={isStarting}
                  disabled={isStarting}
                  style={{ marginTop: spacing.md }}
                />
              </View>
            </View>
          </View>
        ) : null}

        {handOff && !inProgress ? (
          <WhatsNextCard
            title={handOff.routine.name}
            body={handOff.why}
            image={coverImage(handOff.routine)}
            locked={!subscription.isPro && handOff.routine.is_pro}
            starting={isStarting && handOff.mode === 'start'}
            primaryLabel={handOff.mode === 'start' ? `Start on ${handOff.mondayLabel}` : 'See this routine'}
            onPrimary={() => void startNextFromHandOff()}
            onSeeRoutine={handOff.mode === 'start' ? () => openRoutine(handOff.routine) : undefined}
            style={shadow}
          />
        ) : null}

        {!enrolment && !inProgress && !welcomeBack && !handOff ? (
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
              {hideStreak ? null : (
                <View style={styles.streakBlock}>
                  <View style={styles.streakRow}>
                    <Ionicons name="flame" size={16} color={colours.accent} />
                    <Text style={[type.bodySm, { color: colours.accent, fontWeight: '700' }]}>
                      {streak.current === 0
                        ? 'Start a streak'
                        : `Current run: ${streak.current} ${streak.current === 1 ? 'week' : 'weeks'}`}
                    </Text>
                  </View>
                  <Text style={[type.caption, { color: colours.inkMuted, marginTop: 2 }]}>
                    Weeks trained: {streak.weeksTrained}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : null}

        {showQuote ? <QuoteCard quote={quote} onHide={hideQuote} /> : null}

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
            <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 4 }]}>
              {challengeTimingCopy(challenge)}
            </Text>
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

        {learn.length > 0 ? (
          <View>
            <SectionHeader
              title="From Learn"
              actionLabel="See all"
              onAction={() => router.push('/(tabs)/learn' as Href)}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              style={styles.carouselBleed}>
              {learn.map((article) => (
                <ArticleCard key={article.id} article={article} width={stretchWidth} />
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
            <MenuHeader
              label={enrolment?.routine.name ?? 'Your routine'}
              detail="Switch to another plan, or end this one. Your logged sessions stay."
            />
            {weekDays.length > 1 ? (
              <MenuRow label="Do a different day" onPress={() => setRoutineMenuMode('days')} />
            ) : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  streakBlock: {
    marginTop: 6,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
