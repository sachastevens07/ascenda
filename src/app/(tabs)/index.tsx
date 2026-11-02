import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CoverPhoto } from '@/components/CoverPhoto';
import { showDialog } from '@/components/Dialog';
import { useTabBarHeight } from '@/components/PillTabBar';
import { ProBadge, ProMark } from '@/components/ProBadge';
import { colours } from '@/constants/theme';
import { coverForRoutine } from '@/lib/images';
import {
  atFreeCustomWorkoutLimit,
  countOwnedCustomWorkouts,
} from '@/lib/customWorkouts';
import { consumeOnboardingPaywall } from '@/lib/onboarding';
import { openPaywall } from '@/lib/paywall';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { formatShortDate } from '@/lib/progress';
import {
  describeRoutineError,
  endActiveEnrolment,
  fetchActiveEnrolment,
  fetchRoutine,
  fetchRoutines,
  getNextRoutineDay,
  missingRoutinesMessage,
  pickFeaturedRoutines,
  type PlannedSession,
  type Routine,
  type RoutineEnrolment,
  type RoutineSummary,
} from '@/lib/routines';
import {
  fetchActiveSession,
  fetchLastFinishedRoutineSession,
  type Session,
} from '@/lib/sessions';
import {
  STORE_NAME,
  isTrialEndingSoon,
  openManageSubscription,
  useSubscription,
} from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'ready';

type HomeData = {
  featured: RoutineSummary[];
  enrolment: RoutineEnrolment | null;
  routine: Routine | null;
  next: PlannedSession | null;
  missingSql: boolean;
  activeSession: Session | null;
  ownedWorkouts: number;
};

export default function HomeScreen() {
  const tabBarHeight = useTabBarHeight();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const subscription = useSubscription();
  const [data, setData] = useState<HomeData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const openedOnboardingPaywall = useRef(false);

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
          const [routines, enrolment, activeSession, ownedWorkouts] = await Promise.all([
            fetchRoutines(),
            fetchActiveEnrolment(),
            fetchActiveSession(),
            countOwnedCustomWorkouts(),
          ]);
          const missingSql = routines.length === 0;
          const featured = answers
            ? pickFeaturedRoutines(routines, answers, subscription.isPro ? 4 : 2, {
                freeOnly: !subscription.isPro,
              })
            : subscription.isPro
              ? routines.slice(0, 4)
              : routines.filter((routine) => !routine.is_pro).slice(0, 2);
          let routine: Routine | null = null;
          let next: PlannedSession | null = null;
          if (enrolment) {
            routine = await fetchRoutine(enrolment.routine_id);
            const last = await fetchLastFinishedRoutineSession(enrolment.id);
            const lastDayId = last?.routine_day_id ?? last?.programme_day_id ?? null;
            next = routine ? getNextRoutineDay(routine, enrolment, lastDayId) : null;
          }
          if (!isCurrent) return;
          setData({ featured, enrolment, routine, next, missingSql, activeSession, ownedWorkouts });
          setLoadState('ready');
        } catch {
          if (isCurrent) setLoadState((state) => (state === 'ready' ? state : 'error'));
        }
      })();
      return () => {
        isCurrent = false;
      };
    }, [answers?.goal, answers?.experience, answers?.equipment, answers?.days_per_week, answers?.confidence, attempt, subscription.isPro])
  );

  function handleManageSubscription() {
    openManageSubscription(subscription.managementUrl).catch(() =>
      showDialog('Couldn’t open your subscription', `Open ${STORE_NAME} and go to Subscriptions.`)
    );
  }

  function openRoutine(routine: RoutineSummary) {
    router.push({ pathname: '/routines/[id]', params: { id: routine.id } } as Href);
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
    if (data?.activeSession) {
      router.push({ pathname: '/session/[id]', params: { id: data.activeSession.id } });
    }
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
    showDialog(data.enrolment.routine.name, 'Switch to another plan, or end this one. Your logged sessions stay.', [
      { text: 'Switch routine', onPress: () => router.push('/programmes' as Href) },
      { text: 'End routine', style: 'destructive', onPress: requestEndRoutine },
      { text: 'Not now', style: 'cancel' },
    ]);
  }

  if (loadState !== 'ready' || !data) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <>
            <Text style={styles.message}>We couldn’t load Home. Check your connection and try again.</Text>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, styles.retry, pressed && styles.pressed]}
              onPress={() => setAttempt((count) => count + 1)}
              accessibilityRole="button">
              <Text style={styles.outlineButtonText}>Try again</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  const { featured, enrolment, next, missingSql, activeSession } = data;
  const inProgress = Boolean(activeSession);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <Text style={styles.title}>
          {profile?.display_name ? `Hi, ${profile.display_name}` : 'Home'}
        </Text>

        {subscription.trialEndsAt && isTrialEndingSoon(subscription) && (
          <View style={styles.tip}>
            <Text style={styles.tipText}>
              Your free trial ends on {formatShortDate(subscription.trialEndsAt)}. After that, Pro
              continues as a paid plan unless you cancel.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, styles.tipButton, pressed && styles.pressed]}
              onPress={handleManageSubscription}
              accessibilityRole="button">
              <Text style={styles.outlineButtonText}>Manage subscription</Text>
            </Pressable>
          </View>
        )}

        {inProgress && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>In progress</Text>
            <Text style={styles.dayName}>You have a session going</Text>
            <Text style={styles.cardLabel}>Finish or discard it before starting another.</Text>
            <Pressable
              style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
              onPress={continueSession}
              accessibilityRole="button">
              <Text style={styles.startButtonText}>Continue session</Text>
            </Pressable>
          </View>
        )}

        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {subscription.isPro ? 'Featured for you' : 'Starter routines'}
            </Text>
            <Pressable
              onPress={() => router.push('/programmes' as Href)}
              style={({ pressed }) => pressed && styles.pressed}
              accessibilityRole="button">
              <Text style={styles.viewAll}>View all</Text>
            </Pressable>
          </View>
          {missingSql ? (
            <View style={styles.tip}>
              <Text style={styles.tipText}>{missingRoutinesMessage()}</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.featuredRow}>
              {featured.map((routine) => (
                <Pressable
                  key={routine.id}
                  onPress={() => openRoutine(routine)}
                  style={({ pressed }) => [styles.featuredCard, pressed && styles.pressed]}
                  accessibilityRole="button">
                  <View>
                    <CoverPhoto
                      cover={coverForRoutine(routine)}
                      letter={routine.name.slice(0, 1)}
                      height={176}
                    />
                    {routine.is_pro ? (
                      <View style={styles.featuredChipWrap}>
                        <ProBadge compact />
                      </View>
                    ) : (
                      <Text style={[styles.featuredChip, styles.featuredChipFree]}>Free</Text>
                    )}
                  </View>
                  <View style={styles.featuredBody}>
                    <Text style={styles.featuredName} numberOfLines={2}>
                      {routine.name}
                    </Text>
                    <Text style={styles.featuredMeta}>
                      {routine.length_weeks} weeks · {routine.days_per_week} days / week
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {enrolment && next && !inProgress && (
          <View style={[styles.card, styles.sessionCard]}>
            <Pressable
              onPress={openSessionDetail}
              style={({ pressed }) => pressed && styles.pressed}
              accessibilityRole="button">
              <CoverPhoto
                cover={coverForRoutine(enrolment.routine)}
                letter={enrolment.routine.name.slice(0, 1)}
                height={96}
                style={styles.sessionCover}
              />
              <Text style={styles.cardLabel}>Your next session</Text>
              <Text style={styles.dayName}>{next.day.name}</Text>
              <Text style={styles.cardLabel}>
                Week {next.weekNumber} · day {next.day.day_number} · about{' '}
                {enrolment.routine.session_minutes} min
              </Text>
              <Text style={styles.sessionHint}>
                {next.day.exercises.length} exercises. Tap to review, swap or start.
              </Text>
              <View style={styles.startButton}>
                <Text style={styles.startButtonText}>Open session</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={openRoutineMenu}
              style={({ pressed }) => [styles.sessionMenu, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Switch or end this routine">
              <Ionicons name="ellipsis-horizontal" size={22} color={colours.text} />
            </Pressable>
          </View>
        )}

        {!enrolment && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>No routine yet</Text>
            <Text style={styles.dayName}>Create a workout</Text>
            <Text style={styles.cardLabel}>
              Name it, add exercises from the library, then save. Or pick a featured routine above.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
              onPress={handleCreateWorkout}
              accessibilityRole="button">
              {atFreeCustomWorkoutLimit(data.ownedWorkouts, subscription.isPro) ? (
                <ProMark locked textStyle={styles.startButtonText}>
                  Create with Pro
                </ProMark>
              ) : (
                <Text style={styles.startButtonText}>Create a workout</Text>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
              onPress={() => router.push('/workouts' as Href)}
              accessibilityRole="button">
              <Text style={styles.linkText}>My workouts</Text>
            </Pressable>
          </View>
        )}

        {enrolment && !next && !missingSql && (
          <View style={styles.tip}>
            <Text style={styles.tipText}>
              {describeRoutineError('This routine has no sessions yet.')}
            </Text>
          </View>
        )}

        <Text style={styles.disclaimer}>
          General fitness guidance, not medical advice. Stop if anything hurts.
        </Text>
      </ScrollView>
    </View>
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
    gap: 20,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colours.background,
  },
  message: {
    fontSize: 17,
    lineHeight: 24,
    color: colours.textMuted,
    textAlign: 'center',
  },
  retry: {
    alignSelf: 'stretch',
    marginTop: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
  },
  viewAll: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
  },
  featuredRow: {
    paddingRight: 8,
  },
  featuredCard: {
    width: 228,
    marginRight: 14,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colours.surface,
  },
  featuredChip: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '700',
    color: colours.accent,
    backgroundColor: colours.surface,
  },
  featuredChipWrap: {
    position: 'absolute',
    left: 12,
    bottom: 12,
  },
  featuredChipFree: {
    color: colours.surface,
    backgroundColor: colours.accent,
  },
  featuredBody: {
    padding: 14,
  },
  featuredName: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.text,
  },
  featuredMeta: {
    fontSize: 13,
    color: colours.textMuted,
    marginTop: 4,
  },
  card: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: colours.surface,
  },
  sessionCard: {
    overflow: 'hidden',
    position: 'relative',
  },
  sessionMenu: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.surface,
  },
  sessionCover: {
    marginHorizontal: -20,
    marginTop: -20,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colours.textMuted,
  },
  dayName: {
    fontSize: 26,
    fontWeight: '700',
    color: colours.text,
    marginTop: 6,
    marginBottom: 2,
  },
  sessionHint: {
    fontSize: 15,
    color: colours.text,
    marginTop: 8,
  },
  tip: {
    padding: 16,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colours.accentSoft,
  },
  tipText: {
    fontSize: 15,
    lineHeight: 22,
    color: colours.text,
  },
  tipButton: {
    marginTop: 12,
  },
  startButton: {
    minHeight: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
    marginTop: 16,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.surface,
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
  link: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
  },
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
