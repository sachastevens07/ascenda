import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlockTargets } from '@/components/BlockTargets';
import { showDialog } from '@/components/Dialog';
import { LevelUpCard } from '@/components/LevelUpCard';
import { useTabBarHeight } from '@/components/PillTabBar';
import { SwapSheet } from '@/components/SwapSheet';
import { colours } from '@/constants/theme';
import {
  customWorkoutToDay,
  describeCustomWorkoutError,
  fetchCustomWorkout,
  fetchCustomWorkouts,
  startBlankCustomSession,
  type CustomWorkout,
} from '@/lib/customWorkouts';
import { describeBlockPosition, ensureActiveBlock, type TrainingBlock } from '@/lib/blocks';
import { fetchFillLibrary, resolveDay, sessionMaxZone } from '@/lib/levels';
import {
  acceptLevelChallenge,
  declineLevelChallenge,
  declineLevelUp,
  ensureLevelChallenge,
  includeChallengeExercise,
  nextLevel,
  type LevelChallenge,
} from '@/lib/levelUp';
import { formatDaysPerWeek, getQuizAnswers, LEVEL_LABELS, useProfile } from '@/lib/profile';
import {
  describeWeightSuggestion,
  fetchProgramme,
  formatSetsAndReps,
  getNextDay,
  getWeightSuggestion,
  type Programme,
  type ProgrammeDay,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';
import { formatShortDate } from '@/lib/progress';
import {
  fetchActiveSession,
  fetchLastFinishedProgrammeSession,
  fetchPreviousSets,
  startCustomSession,
  startSession,
  type LoggedSet,
  type Session,
} from '@/lib/sessions';
import {
  STORE_NAME,
  isTrialEndingSoon,
  openManageSubscription,
  useSubscription,
} from '@/lib/subscription';
import {
  applySwaps,
  deleteUserSwap,
  exerciseFits,
  fetchSessionSwaps,
  fetchUserSwaps,
  saveUserSwap,
  swapIds,
  type DaySwaps,
  type RankedExercise,
  type SwapScope,
  type UserSwaps,
} from '@/lib/swaps';

type LoadState = 'loading' | 'error' | 'ready';

type TodayData = {
  programme: Programme | null;
  activeSession: Session | null;
  /** Swaps in the session in progress, if any. */
  sessionSwaps: DaySwaps;
  /** Her "Every time" swaps. */
  userSwaps: UserSwaps;
  lastFinishedDayId: string | null;
  previous: Record<string, LoggedSet[]>;
  /** All exercises, used to fill slots above her level. */
  library: RankedExercise[];
  customWorkouts: CustomWorkout[];
  /** Custom session in progress, with this session's swaps applied. */
  customDay: ProgrammeDay | null;
  block: TrainingBlock | null;
};

/** Sets or clears (`exercise` null) one slot's swap. */
function withSwap(
  swaps: UserSwaps,
  dayId: string,
  position: number,
  exercise: SlotExercise | null
): UserSwaps {
  const daySwaps = { ...swaps[dayId] };
  if (exercise) daySwaps[position] = exercise;
  else delete daySwaps[position];
  return { ...swaps, [dayId]: daySwaps };
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { profile, setQuietMode, setConfidenceLevel } = useProfile();
  const programmeId = profile?.programme_id ?? null;
  const answers = getQuizAnswers(profile);
  const equipment = answers?.equipment ?? null;
  const level = answers?.confidence_level ?? null;
  const subscription = useSubscription();
  const { isPro } = subscription;
  const [data, setData] = useState<TodayData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [chosenDayId, setChosenDayId] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  /** "Just today" swaps chosen before starting; screen state only, like the chosen day. */
  const [todaySwaps, setTodaySwaps] = useState<UserSwaps>({});
  const [swapItem, setSwapItem] = useState<ProgrammeExercise | null>(null);
  /** Lets the switch move before the save finishes; null means use the profile. */
  const [quietDraft, setQuietDraft] = useState<boolean | null>(null);
  const [isSavingQuiet, setIsSavingQuiet] = useState(false);
  const quietMode = quietDraft ?? profile?.quiet_mode ?? false;
  const [challenge, setChallenge] = useState<LevelChallenge | null>(null);
  const [isSavingChallenge, setIsSavingChallenge] = useState(false);

  // Reloads every time Today comes into view, so it's up to date after a session.
  useFocusEffect(
    useCallback(() => {
      if (!equipment) {
        setLoadState('error');
        return;
      }
      let isCurrent = true;
      (async () => {
        try {
          const [programme, activeSession, lastFinished, userSwaps, library, customWorkouts] =
            await Promise.all([
              programmeId ? fetchProgramme(programmeId, equipment) : Promise.resolve(null),
              fetchActiveSession(),
              fetchLastFinishedProgrammeSession(),
              fetchUserSwaps(equipment),
              fetchFillLibrary(),
              fetchCustomWorkouts().catch(() => [] as CustomWorkout[]),
            ]);
          const sessionSwaps = activeSession ? await fetchSessionSwaps(activeSession) : {};
          let customDay: ProgrammeDay | null = null;
          if (activeSession?.custom_workout_id) {
            const workout = await fetchCustomWorkout(activeSession.custom_workout_id).catch(() => null);
            customDay = workout ? applySwaps(customWorkoutToDay(workout), sessionSwaps) : null;
          }
          const next = programme ? getNextDay(programme, lastFinished?.programme_day_id ?? null) : null;
          let nextChallenge: LevelChallenge | null = null;
          if (level && next) {
            try {
              nextChallenge = await ensureLevelChallenge(level, equipment, next);
            } catch {
              nextChallenge = null;
            }
          }
          const exerciseIds = [
            ...new Set([
              ...(programme?.days.flatMap((d) => d.exercises.map((e) => e.exercise.id)) ?? []),
              ...(customDay?.exercises.map((item) => item.exercise.id) ?? []),
              ...customWorkouts.flatMap((workout) => workout.exercises.map((item) => item.exercise.id)),
              ...Object.values(userSwaps).flatMap((swaps) => Object.values(swaps).map((e) => e.id)),
              ...Object.values(sessionSwaps).map((e) => e.id),
              ...(nextChallenge ? [nextChallenge.exercise.id] : []),
            ]),
          ];
          const previous = await fetchPreviousSets(exerciseIds, activeSession?.id ?? null);
          let block: TrainingBlock | null = null;
          if (programme && level && equipment) {
            try {
              block = await ensureActiveBlock(programme, level, equipment);
            } catch {
              block = null;
            }
          }
          if (!isCurrent) return;
          setChallenge(nextChallenge);
          setData({
            programme,
            activeSession,
            sessionSwaps,
            userSwaps,
            lastFinishedDayId: lastFinished?.programme_day_id ?? null,
            previous,
            library,
            customWorkouts,
            customDay,
            block,
          });
          setLoadState('ready');
        } catch {
          if (isCurrent) setLoadState((state) => (state === 'ready' ? state : 'error'));
        }
      })();
      return () => {
        isCurrent = false;
      };
    }, [programmeId, equipment, level, attempt])
  );

  const programme = data?.programme ?? null;
  const activeSession = data?.activeSession ?? null;
  const nextDay = programme ? getNextDay(programme, data?.lastFinishedDayId ?? null) : null;
  const activeDay = activeSession?.programme_day_id
    ? programme?.days.find((item) => item.id === activeSession.programme_day_id)
    : undefined;
  const customDay = data?.customDay ?? null;
  const isCustomInProgress = customDay !== null;
  const plannedDay =
    activeDay ?? programme?.days.find((item) => item.id === chosenDayId) ?? nextDay;
  const resolvedDay =
    !plannedDay || !data || !equipment || !level
      ? plannedDay
      : activeDay
        ? applySwaps(plannedDay, data.sessionSwaps)
        : resolveDay(
            plannedDay,
            { ...data.userSwaps[plannedDay.id], ...todaySwaps[plannedDay.id] },
            equipment,
            level,
            quietMode,
            data.library
          );
  const day =
    resolvedDay &&
    !activeDay &&
    challenge?.status === 'accepted' &&
    !quietMode
      ? includeChallengeExercise(resolvedDay, challenge.exercise)
      : resolvedDay;
  const maxZone = level ? sessionMaxZone(level, quietMode) : 1;

  async function handleStart() {
    if (!day) return;
    setIsStarting(true);
    try {
      const session = await startSession(day.id, swapIds(day), data?.block?.id ?? null);
      setChosenDayId(null);
      setTodaySwaps({});
      router.push({ pathname: '/session/[id]', params: { id: session.id } });
    } catch {
      showDialog('Couldn’t start the session', 'Check your connection and try again.');
    } finally {
      setIsStarting(false);
    }
  }

  async function handleStartBlank() {
    if (activeSession) {
      showDialog(
        'You already have a session going',
        'Finish or discard it first, then start this workout.',
        [
          {
            text: 'Open it',
            onPress: () => router.push({ pathname: '/session/[id]', params: { id: activeSession.id } }),
          },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }
    setIsStarting(true);
    try {
      const session = await startBlankCustomSession();
      router.push({ pathname: '/session/[id]', params: { id: session.id } });
    } catch (error) {
      showDialog('Couldn’t start the workout', describeCustomWorkoutError(error));
    } finally {
      setIsStarting(false);
    }
  }

  async function handleStartCustom(workout: CustomWorkout) {
    if (activeSession) {
      showDialog(
        'You already have a session going',
        'Finish or discard it first, then start this workout.',
        [
          {
            text: 'Open it',
            onPress: () => router.push({ pathname: '/session/[id]', params: { id: activeSession.id } }),
          },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }
    setIsStarting(true);
    try {
      const session = await startCustomSession(workout.id);
      router.push({ pathname: '/session/[id]', params: { id: session.id } });
    } catch (error) {
      showDialog('Couldn’t start the workout', describeCustomWorkoutError(error));
    } finally {
      setIsStarting(false);
    }
  }

  async function handleSwap(exercise: SlotExercise, scope: SwapScope) {
    if (!day || !swapItem) return;
    const { position } = swapItem;
    if (scope === 'always') {
      await saveUserSwap(day.id, position, exercise.id);
      setData((current) => current && { ...current, userSwaps: withSwap(current.userSwaps, day.id, position, exercise) });
      setTodaySwaps((current) => withSwap(current, day.id, position, null));
    } else {
      setTodaySwaps((current) => withSwap(current, day.id, position, exercise));
    }
    if (!data?.previous[exercise.id]) {
      fetchPreviousSets([exercise.id], data?.activeSession?.id ?? null)
        .then((previous) =>
          setData((current) => current && { ...current, previous: { ...current.previous, ...previous } })
        )
        .catch(() => {});
    }
  }

  async function handleRestore() {
    if (!day || !swapItem) return;
    const { position } = swapItem;
    await deleteUserSwap(day.id, position);
    setData((current) => current && { ...current, userSwaps: withSwap(current.userSwaps, day.id, position, null) });
    setTodaySwaps((current) => withSwap(current, day.id, position, null));
  }

  function handleManageSubscription() {
    openManageSubscription(subscription.managementUrl).catch(() =>
      showDialog('Couldn’t open your subscription', `Open ${STORE_NAME} and go to Subscriptions.`)
    );
  }

  function handleContinue() {
    if (activeSession) {
      router.push({ pathname: '/session/[id]', params: { id: activeSession.id } });
    }
  }

  async function handleAcceptChallenge() {
    if (!challenge) return;
    setIsSavingChallenge(true);
    try {
      await acceptLevelChallenge(challenge.id);
      setChallenge({
        ...challenge,
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      });
      if (!data?.previous[challenge.exercise.id]) {
        fetchPreviousSets([challenge.exercise.id], data?.activeSession?.id ?? null)
          .then((previous) =>
            setData((current) => current && { ...current, previous: { ...current.previous, ...previous } })
          )
          .catch(() => {});
      }
    } catch {
      showDialog(
        'That didn’t save',
        'Check your connection, and that level_up.sql has been run in Supabase.'
      );
    } finally {
      setIsSavingChallenge(false);
    }
  }

  async function handleDeclineChallenge() {
    if (!challenge) return;
    setIsSavingChallenge(true);
    try {
      await declineLevelChallenge(challenge.id);
      setChallenge(null);
    } catch {
      showDialog(
        'That didn’t save',
        'Check your connection, and that level_up.sql has been run in Supabase.'
      );
    } finally {
      setIsSavingChallenge(false);
    }
  }

  async function handleLevelUp() {
    const upcoming = level ? nextLevel(level) : null;
    if (!upcoming) return;
    setIsSavingChallenge(true);
    try {
      await setConfidenceLevel(upcoming);
      setChallenge(null);
      showDialog(
        `You’re on ${LEVEL_LABELS[upcoming]}`,
        'You can move back down any time from Profile. No pressure.'
      );
    } catch {
      showDialog('That didn’t save', 'Check your connection and try again.');
    } finally {
      setIsSavingChallenge(false);
    }
  }

  async function handleStayAtLevel() {
    if (!challenge) return;
    setIsSavingChallenge(true);
    try {
      await declineLevelUp(challenge.id);
      setChallenge(null);
    } catch {
      showDialog(
        'That didn’t save',
        'Check your connection, and that level_up.sql has been run in Supabase.'
      );
    } finally {
      setIsSavingChallenge(false);
    }
  }

  async function handleQuietMode(enabled: boolean) {
    if (activeDay !== undefined || isCustomInProgress || isSavingQuiet || enabled === quietMode) {
      return;
    }
    setQuietDraft(enabled);
    setIsSavingQuiet(true);
    try {
      await setQuietMode(enabled);
    } catch {
      setQuietDraft(null);
      showDialog(
        'Couldn’t update Quiet Mode',
        'Check your connection, and that quiet_mode.sql has been run in Supabase.'
      );
    } finally {
      setIsSavingQuiet(false);
    }
  }

  if (loadState !== 'ready') {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <>
            <Text style={styles.message}>
              We couldn’t load today’s session. Check your connection and try again.
            </Text>
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

  const isNextDay = Boolean(day && nextDay && day.id === nextDay.id);
  const isInProgress = activeDay !== undefined;
  const sessionBusy = isInProgress || isCustomInProgress;
  const suggestionFor = (item: ProgrammeExercise) =>
    getWeightSuggestion(item, data?.previous[item.exercise.id]);
  const needsStartingWeights = Boolean(
    day?.exercises.some((item) => suggestionFor(item).kind === 'find-starting-weight')
  );
  const starterWorkout = data?.customWorkouts.find((item) => item.is_starter);
  const myWorkouts =
    data?.customWorkouts.filter((item) => !item.is_starter && item.exercises.length > 0) ?? [];
  const featuredWorkouts = [
    ...(starterWorkout ? [starterWorkout] : []),
    ...myWorkouts.slice(0, 3),
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <Text style={styles.title}>Today</Text>
        {programme && (
          <Text style={styles.subtitle}>
            {programme.name} · {formatDaysPerWeek(programme.days_per_week)} a week
          </Text>
        )}

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

        {activeSession && !isInProgress && !isCustomInProgress && (
          <View style={styles.tip}>
            <Text style={styles.tipText}>You have a session in progress from an earlier plan.</Text>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, styles.tipButton, pressed && styles.pressed]}
              onPress={handleContinue}
              accessibilityRole="button">
              <Text style={styles.outlineButtonText}>Continue it</Text>
            </Pressable>
          </View>
        )}

        {challenge && level && (
          <LevelUpCard
            challenge={challenge}
            level={level}
            quietMode={quietMode}
            busy={isSavingChallenge}
            onAccept={handleAcceptChallenge}
            onDecline={handleDeclineChallenge}
            onLevelUp={handleLevelUp}
            onStay={handleStayAtLevel}
          />
        )}

        {isCustomInProgress && customDay && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>In progress</Text>
            <Text style={styles.dayName}>{customDay.name}</Text>
            <Text style={styles.cardLabel}>{customDay.exercises.length} exercises</Text>
            {customDay.exercises.map((item, index) => (
              <View key={`${item.exercise.id}-${item.position}`} style={styles.exerciseBlock}>
                <View style={styles.exerciseRow}>
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })
                    }
                    style={({ pressed }) => [styles.exerciseInfo, pressed && styles.pressed]}
                    accessibilityRole="button">
                    <Text style={styles.exerciseNumber}>{index + 1}</Text>
                    <View style={styles.exerciseText}>
                      <Text style={styles.exerciseName}>{item.exercise.name}</Text>
                      <Text style={styles.exerciseDetail}>{formatSetsAndReps(item)}</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable
              style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
              onPress={handleContinue}
              accessibilityRole="button">
              <Text style={styles.startButtonText}>Continue session</Text>
            </Pressable>
          </View>
        )}

        {programme && day ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>
              {isInProgress ? 'In progress' : isNextDay ? 'Your next session' : 'Chosen session'}
            </Text>
            <Text style={styles.cardLabel}>
              Day {day.day_number} of {programme.days.length}
            </Text>
          </View>
          <Text style={styles.dayName}>{day.name}</Text>
          {isPro && data?.block && (
            <Text style={styles.blockPosition}>{describeBlockPosition(data.block)}</Text>
          )}
          <Text style={styles.cardLabel}>{day.exercises.length} exercises</Text>

          <Pressable
            onPress={() => handleQuietMode(!quietMode)}
            disabled={sessionBusy || isSavingQuiet}
            style={({ pressed }) => [styles.quietRow, pressed && styles.pressed]}
            accessibilityRole="switch"
            accessibilityState={{ checked: quietMode, disabled: sessionBusy }}
            accessibilityLabel="Quiet Mode">
            <View style={styles.quietCopy}>
              <Text style={styles.quietTitle}>Quiet Mode</Text>
              <Text style={styles.quietText}>
                {sessionBusy
                  ? 'Finish this session to change Quiet Mode.'
                  : 'Stay in one spot — dumbbells, and maybe a mat or bench.'}
              </Text>
            </View>
            <View style={[styles.quietTrack, quietMode && styles.quietTrackOn]}>
              <View style={styles.quietThumb} />
            </View>
          </Pressable>

          {day.exercises.map((item, index) => {
            const isSwapping = swapItem?.position === item.position;
            const isChallenge = challenge?.exercise.id === item.exercise.id;
            return (
              <View key={item.position} style={styles.exerciseBlock}>
                <View style={styles.exerciseRow}>
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })
                    }
                    style={({ pressed }) => [styles.exerciseInfo, pressed && styles.pressed]}
                    accessibilityRole="button">
                    <Text style={styles.exerciseNumber}>{index + 1}</Text>
                    <View style={styles.exerciseText}>
                      <Text style={styles.exerciseName}>{item.exercise.name}</Text>
                      {isChallenge && (
                        <Text style={styles.swappedFrom}>A try from the next zone</Text>
                      )}
                      {item.original && equipment && exerciseFits(item.original, equipment, maxZone) && (
                        <Text style={styles.swappedFrom}>Instead of {item.original.name}</Text>
                      )}
                      <Text style={styles.exerciseDetail}>{formatSetsAndReps(item)}</Text>
                      {isPro && (
                        <Text style={styles.suggestion}>
                          {describeWeightSuggestion(suggestionFor(item))}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                  {!isInProgress && isPro && !isChallenge && (
                    <Pressable
                      onPress={() => setSwapItem(isSwapping ? null : item)}
                      style={({ pressed }) => [
                        styles.swapButton,
                        isSwapping && styles.swapButtonOpen,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isSwapping }}
                      accessibilityLabel={`Swap ${item.exercise.name}`}>
                      <Ionicons
                        name="swap-horizontal"
                        size={24}
                        color={isSwapping ? colours.surface : colours.accent}
                      />
                    </Pressable>
                  )}
                </View>
                {!isInProgress && isPro && equipment && !isChallenge && (
                  <SwapSheet
                    open={isSwapping}
                    item={item}
                    equipment={equipment}
                    maxZone={maxZone}
                    excludeIds={day.exercises.flatMap((slot) =>
                      slot.original ? [slot.exercise.id, slot.original.id] : [slot.exercise.id]
                    )}
                    onClose={() => setSwapItem(null)}
                    onSwap={handleSwap}
                    onRestore={handleRestore}
                  />
                )}
              </View>
            );
          })}

          {isPro && data?.block && <BlockTargets block={data.block} />}

          <Pressable
            style={({ pressed }) => [styles.startButton, (pressed || isStarting) && styles.pressed]}
            onPress={isInProgress ? handleContinue : handleStart}
            disabled={isStarting || (activeSession !== null && !isInProgress)}
            accessibilityRole="button">
            {isStarting ? (
              <ActivityIndicator color={colours.surface} />
            ) : (
              <Text style={styles.startButtonText}>
                {isInProgress ? 'Continue session' : 'Start session'}
              </Text>
            )}
          </Pressable>
        </View>
        ) : (
          <View style={styles.tip}>
            <Text style={styles.tipText}>
              You don’t have a programme yet. Check your answers in Profile, or start one of your
              own workouts below.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Your workout</Text>
          <Text style={styles.dayName}>Start empty</Text>
          <Text style={styles.cardLabel}>Add whatever you want as you go.</Text>
          <Pressable
            style={({ pressed }) => [styles.startButton, (pressed || isStarting) && styles.pressed]}
            onPress={handleStartBlank}
            disabled={isStarting}
            accessibilityRole="button">
            {isStarting ? (
              <ActivityIndicator color={colours.surface} />
            ) : (
              <Text style={styles.startButtonText}>Start workout</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>My workouts</Text>
          <Text style={styles.dayName}>Saved sessions</Text>
          <Text style={styles.cardLabel}>
            The quiet-spot starter, and anything you’ve saved.
          </Text>
          {featuredWorkouts.length === 0 ? (
            <Text style={styles.quietText}>
              Start a workout to see it here. If this stays empty, run supabase/custom_workouts.sql.
            </Text>
          ) : (
            featuredWorkouts.map((workout) => {
              const count = workout.exercises.length;
              return (
                <View key={workout.id} style={styles.customRow}>
                  <View style={styles.exerciseText}>
                    {workout.is_starter && <Text style={styles.swappedFrom}>Starter</Text>}
                    <Text style={styles.exerciseName}>{workout.name}</Text>
                    <Text style={styles.exerciseDetail}>
                      {count} {count === 1 ? 'exercise' : 'exercises'}
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.miniStart, (pressed || isStarting) && styles.pressed]}
                    onPress={() => handleStartCustom(workout)}
                    disabled={isStarting}
                    accessibilityRole="button"
                    accessibilityLabel={`Start ${workout.name}`}>
                    <Text style={styles.miniStartText}>Start</Text>
                  </Pressable>
                </View>
              );
            })
          )}
          <Pressable
            style={({ pressed }) => [styles.outlineButton, styles.tipButton, pressed && styles.pressed]}
            onPress={() => router.push('/workouts' as Href)}
            accessibilityRole="button">
            <Text style={styles.outlineButtonText}>See all workouts</Text>
          </Pressable>
        </View>

        {needsStartingWeights && (
          <Text style={[styles.tip, styles.tipText]}>
            Finding your starting weight: choose one you can lift for every rep with good form and
            a rep or two to spare. Start light. You can always go up next time.
          </Text>
        )}

        {!isPro && (
          <View style={styles.tip}>
            <Text style={styles.tipTitle}>Get more from every session</Text>
            <Text style={styles.tipText}>
              Pro suggests your weights, tells you when to go up, and lets you swap exercises or
              choose a different day.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, styles.tipButton, pressed && styles.pressed]}
              onPress={() => router.push('/paywall')}
              accessibilityRole="button">
              <Text style={styles.outlineButtonText}>See Pro</Text>
            </Pressable>
          </View>
        )}

        {isPro && programme && programme.days.length > 1 && !isInProgress && !isCustomInProgress && (
          <Pressable
            style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
            onPress={() => setIsPickerOpen(true)}
            accessibilityRole="button">
            <Text style={styles.outlineButtonText}>Do a different day</Text>
          </Pressable>
        )}
        {programme && day && !isNextDay && !isInProgress && (
          <Pressable
            style={styles.link}
            onPress={() => setChosenDayId(null)}
            accessibilityRole="button">
            <Text style={styles.linkText}>Back to your next session</Text>
          </Pressable>
        )}

        <Text style={styles.disclaimer}>
          General fitness guidance, not medical advice. Stop if anything hurts.
        </Text>
      </ScrollView>

      <Modal
        visible={isPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsPickerOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setIsPickerOpen(false)}
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle}>Choose a day</Text>
          <ScrollView>
            {(programme?.days ?? []).map((item) => {
              const isSelected = item.id === day?.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setChosenDayId(item.id === nextDay?.id ? null : item.id);
                    setIsPickerOpen(false);
                  }}
                  style={styles.sheetRow}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}>
                  <View style={styles.exerciseText}>
                    <Text style={[styles.sheetRowText, isSelected && styles.sheetRowTextSelected]}>
                      Day {item.day_number}: {item.name}
                    </Text>
                    {item.id === nextDay?.id && <Text style={styles.cardLabel}>Your next session</Text>}
                  </View>
                  {isSelected && <Ionicons name="checkmark" size={22} color={colours.accent} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
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
    gap: 16,
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
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
    marginTop: -12,
  },
  card: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: colours.surface,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  blockPosition: {
    fontSize: 15,
    fontWeight: '600',
    color: colours.accent,
    marginBottom: 4,
  },
  quietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    marginBottom: 4,
    minHeight: 56,
  },
  quietCopy: {
    flex: 1,
  },
  quietTrack: {
    width: 52,
    height: 32,
    borderRadius: 16,
    padding: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: colours.border,
  },
  quietTrackOn: {
    justifyContent: 'flex-end',
    backgroundColor: colours.accent,
  },
  quietThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colours.surface,
  },
  quietTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.text,
  },
  quietText: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    marginTop: 2,
  },
  exerciseBlock: {
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colours.border,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swapButtonOpen: {
    backgroundColor: colours.accent,
  },
  exerciseInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  swappedFrom: {
    fontSize: 14,
    color: colours.textMuted,
    marginTop: 1,
  },
  swapButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accentSoft,
  },
  exerciseNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 32,
    fontSize: 15,
    fontWeight: '700',
    color: colours.accent,
    backgroundColor: colours.accentSoft,
  },
  exerciseText: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: '600',
    color: colours.text,
  },
  exerciseDetail: {
    fontSize: 16,
    color: colours.text,
    marginTop: 2,
  },
  suggestion: {
    fontSize: 14,
    color: colours.accent,
    marginTop: 2,
  },
  tip: {
    padding: 16,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colours.accentSoft,
  },
  tipTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 4,
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
  pressed: {
    opacity: 0.7,
  },
  link: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: -8,
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
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colours.border,
  },
  miniStart: {
    minHeight: 48,
    minWidth: 88,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
  },
  miniStartText: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.surface,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31, 27, 36, 0.35)',
  },
  sheet: {
    maxHeight: '70%',
    paddingTop: 20,
    paddingHorizontal: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colours.surface,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colours.border,
  },
  sheetRowText: {
    fontSize: 17,
    color: colours.text,
  },
  sheetRowTextSelected: {
    fontWeight: '700',
    color: colours.accent,
  },
});
