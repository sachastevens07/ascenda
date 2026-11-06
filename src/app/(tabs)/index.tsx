import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
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
  CoverPlaceholder,
  IconButton,
  ImageCard,
  OverflowMenu,
  PrimaryButton,
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
  normalizeWeeklyTarget,
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
import { countOwnedCustomWorkouts } from '@/lib/customWorkouts';
import { getExerciseImageSource } from '@/lib/exerciseMedia';
import { billingReminderCopy, fillCopy, nextSessionMenuCopy, routineActionsCopy, streakCopy, streakWeeksLabel, subscriptionBanners, welcomeBackCopy } from '@/lib/copy';
import { coverForChallenge, coverForRoutine, takeCoverSource } from '@/lib/images';
import { DAILY_QUOTES, fetchDailyQuotes, fetchHideQuote, pickDailyQuote, saveHideQuote, type DailyQuote } from '@/lib/quotes';
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
  const { width } = useWindowDimensions();
  const { colours, spacing, radius, shadow } = useTheme();
  const { profile } = useProfile();
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
  const [quoteHidden, setQuoteHidden] = useState(false);
  const featuredWidth = width * 0.78;
  const stretchWidth = width * 0.56;

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
            streakGoal,
            restWeeks
          );
          void syncRestWeeksBanked(streak.restWeeksBanked);
          const welcomeBack = await resolveWelcomeBackOffer({
            sessions,
            enrolment,
            routine,
            lastDayId,
            nextDay: next?.day ?? (routine ? firstDayOfRoutine(routine) : null),
            catalogue: routines,
            lastWeekStatus: streak.lastWeek?.status ?? null,
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
      profile?.display_name,
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

  const { featured, stretches, enrolment, routine, next, missingSql, activeSession, streak, hideStreak, welcomeBack, handOff, challenge, progress, learn, quotes } =
    data;
  const quote = pickDailyQuote(quotes);
  const showQuote = !quoteHidden;
  const inProgress = Boolean(activeSession);
  const weekRatio = streak.targetThisWeek > 0 ? streak.doneThisWeek / streak.targetThisWeek : 0;
  const showWeekCard = streak.targetThisWeek > 0;
  const weekDays = routine && next ? daysInWeek(routine, next.weekNumber) : [];
  const usedPhotos = new Set<string>();
  const nextThumb =
    enrolment && next && !inProgress ? sessionThumbnail(next.day, enrolment.routine, usedPhotos) : null;
  const handOffImage = handOff ? takeCoverSource(coverForRoutine(handOff.routine), usedPhotos) : null;
  const challengeCover = challenge ? takeCoverSource(coverForChallenge(challenge), usedPhotos) : null;

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <View style={styles.header}>
          <TabAvatar />
          <AppText variant="display" style={{ color: colours.ink, flex: 1 }} numberOfLines={1}>
            {greeting(profile?.display_name)}
          </AppText>
        </View>

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

        {inProgress ? (
          <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
            <AppText variant="eyebrow" style={{ color: colours.accent }}>In progress</AppText>
            <AppText variant="title2" style={{ color: colours.ink, marginTop: spacing.sm }}>You have a session going</AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.xs }}>
              Finish or discard it before starting another.
            </AppText>
            <PrimaryButton label="Continue session" onPress={continueSession} style={{ marginTop: spacing.md }} />
          </View>
        ) : null}

        {welcomeBack && !inProgress ? (
          <WelcomeBackCard
            eyebrow={welcomeBackCopy.eyebrow}
            title={welcomeBack.title}
            body={welcomeBack.body}
            cta={welcomeBackCopy.card_cta}
            seeOptions={welcomeBackCopy.see_options}
            starting={isStarting}
            onStartLighter={() => void startLighterSession()}
            onSeeOptions={openWelcomeBackOptions}
            optionsRef={welcomeBackMenuRef}
            style={shadow}
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
                    <CoverPlaceholder />
                  )}
                </View>
              </Pressable>
              <View style={styles.heroBody}>
                <View style={styles.heroHeading}>
                  <View style={styles.flex}>
                    <AppText variant="eyebrow" style={{ color: colours.accent }}>
                      Week {next.weekNumber} · day {next.day.day_number}
                    </AppText>
                    <Pressable onPress={openSessionDetail} accessibilityRole="button">
                      <AppText variant="title2" style={{ color: colours.ink, marginTop: spacing.xs }}>{next.day.name}</AppText>
                    </Pressable>
                    <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
                      {enrolment.routine.session_minutes} min · {next.day.exercises.length} exercises
                    </AppText>
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
                  disabled={isStarting || subscription.isLoading}
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
            image={handOffImage}
            starting={isStarting && handOff.mode === 'start'}
            primaryLabel={handOff.mode === 'start' ? `Start on ${handOff.mondayLabel}` : 'See this routine'}
            onPrimary={() => void startNextFromHandOff()}
            onSeeRoutine={handOff.mode === 'start' ? () => openRoutine(handOff.routine) : undefined}
            style={shadow}
          />
        ) : null}

        {!enrolment && !inProgress && !welcomeBack && !handOff ? (
          <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
            <AppText variant="eyebrow" style={{ color: colours.inkMuted }}>No routine yet</AppText>
            <AppText variant="title2" style={{ color: colours.ink, marginTop: spacing.sm }}>Create a workout</AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.xs }}>
              Add exercises from the library, or pick a featured routine below.
            </AppText>
            <PrimaryButton label="Create a workout" onPress={handleCreateWorkout} style={{ marginTop: spacing.md }} />
            <TextButton label="My workouts" onPress={() => router.push('/workouts' as Href)} />
          </View>
        ) : null}

        {showWeekCard ? (
          <View
            style={[styles.weekCard, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}
            accessibilityRole="text"
            accessibilityLabel={fillCopy(streakCopy.this_week_progress, {
              done: streak.doneThisWeek,
              target: streak.targetThisWeek,
            })}>
            <ProgressRing progress={weekRatio} size={56} stroke={6}>
              <AppText variant="caption" style={{ color: colours.ink }}>
                {streak.doneThisWeek}/{streak.targetThisWeek}
              </AppText>
            </ProgressRing>
            <View style={styles.flex}>
              <AppText variant="title3" style={{ color: colours.ink }}>
                {fillCopy(streakCopy.this_week_progress, {
                  done: streak.doneThisWeek,
                  target: streak.targetThisWeek,
                })}
              </AppText>
              {hideStreak ? null : (
                <View style={styles.streakBlock}>
                  <View style={styles.streakRow}>
                    <Ionicons name="flame" size={16} color={colours.accent} />
                    <AppText variant="bodySm" style={{ color: colours.accent }}>
                      {streakCopy.current_run}: {streakWeeksLabel(streak.current)}
                    </AppText>
                  </View>
                  <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 2 }}>
                    {streakCopy.weeks_trained}: {streak.weeksTrained}
                  </AppText>
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
            {challengeCover ? (
              <Image
                source={challengeCover}
                style={[styles.challengePhoto, { borderRadius: radius.md }]}
                resizeMode="cover"
                accessibilityLabel={challenge.name}
              />
            ) : (
              <View style={[styles.challengePhoto, { borderRadius: radius.md, overflow: 'hidden' }]}>
                <CoverPlaceholder />
              </View>
            )}
            <AppText variant="eyebrow" style={{ color: colours.accent, marginTop: spacing.sm }}>Challenge</AppText>
            <AppText variant="title3" style={{ color: colours.ink, marginTop: spacing.sm }}>{challenge.name}</AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
              {challengeTimingCopy(challenge)}
            </AppText>
          </Pressable>
        ) : null}

        <View>
          <SectionHeader
            title="Featured for you"
            actionLabel="See all"
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
                  subtitle={`${routine.length_weeks} weeks · ${routine.days_per_week} days / week`}
                  image={takeCoverSource(coverForRoutine(routine), usedPhotos)}
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
                  image={takeCoverSource(coverForRoutine(routine), usedPhotos)}
                  letter={routine.name.slice(0, 1)}
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
  banner: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  challengePhoto: {
    width: '100%',
    aspectRatio: 16 / 10,
    overflow: 'hidden',
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
