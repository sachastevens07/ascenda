import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { useTabBarHeight } from '@/components/PillTabBar';
import { SwapSheet } from '@/components/SwapSheet';
import { colours } from '@/constants/theme';
import { fetchFillLibrary, resolveDay, sessionMaxZone } from '@/lib/levels';
import { formatDaysPerWeek, getQuizAnswers, useProfile } from '@/lib/profile';
import {
  describeWeightSuggestion,
  fetchProgramme,
  formatSetsAndReps,
  getNextDay,
  getWeightSuggestion,
  type Programme,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';
import { formatShortDate } from '@/lib/progress';
import {
  fetchActiveSession,
  fetchLastFinishedSession,
  fetchPreviousSets,
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

type LoadState = 'loading' | 'error' | 'no-programme' | 'ready';

type TodayData = {
  programme: Programme;
  activeSession: Session | null;
  /** Swaps in the session in progress, if any. */
  sessionSwaps: DaySwaps;
  /** Her "Every time" swaps. */
  userSwaps: UserSwaps;
  lastFinishedDayId: string | null;
  previous: Record<string, LoggedSet[]>;
  /** All exercises, used to fill slots above her level. */
  library: RankedExercise[];
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
  const { profile, setQuietMode } = useProfile();
  const programmeId = profile?.programme_id ?? null;
  const answers = getQuizAnswers(profile);
  const equipment = answers?.equipment ?? null;
  const level = answers?.confidence_level ?? null;
  const quietMode = profile?.quiet_mode ?? false;
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

  // Reloads every time Today comes into view, so it's up to date after a session.
  useFocusEffect(
    useCallback(() => {
      if (!programmeId || !equipment) {
        setLoadState('no-programme');
        return;
      }
      let isCurrent = true;
      (async () => {
        try {
          const [programme, activeSession, lastFinished, userSwaps, library] = await Promise.all([
            fetchProgramme(programmeId, equipment),
            fetchActiveSession(),
            fetchLastFinishedSession(),
            fetchUserSwaps(equipment),
            fetchFillLibrary(),
          ]);
          if (!programme) {
            if (isCurrent) setLoadState('no-programme');
            return;
          }
          const sessionSwaps = activeSession ? await fetchSessionSwaps(activeSession) : {};
          const exerciseIds = [
            ...new Set([
              ...programme.days.flatMap((d) => d.exercises.map((e) => e.exercise.id)),
              ...Object.values(userSwaps).flatMap((swaps) => Object.values(swaps).map((e) => e.id)),
              ...Object.values(sessionSwaps).map((e) => e.id),
            ]),
          ];
          const previous = await fetchPreviousSets(exerciseIds, activeSession?.id ?? null);
          if (!isCurrent) return;
          setData({
            programme,
            activeSession,
            sessionSwaps,
            userSwaps,
            lastFinishedDayId: lastFinished?.programme_day_id ?? null,
            previous,
            library,
          });
          setLoadState('ready');
        } catch {
          if (isCurrent) setLoadState((state) => (state === 'ready' ? state : 'error'));
        }
      })();
      return () => {
        isCurrent = false;
      };
    }, [programmeId, equipment, attempt])
  );

  const programme = data?.programme ?? null;
  const activeSession = data?.activeSession ?? null;
  const nextDay = programme ? getNextDay(programme, data?.lastFinishedDayId ?? null) : null;
  const activeDay = activeSession
    ? programme?.days.find((item) => item.id === activeSession.programme_day_id)
    : undefined;
  const plannedDay =
    activeDay ?? programme?.days.find((item) => item.id === chosenDayId) ?? nextDay;
  const day =
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
  const maxZone = level ? sessionMaxZone(level, quietMode) : 1;

  async function handleStart() {
    if (!day) return;
    setIsStarting(true);
    try {
      const session = await startSession(day.id, swapIds(day));
      setChosenDayId(null);
      setTodaySwaps({});
      router.push({ pathname: '/session/[id]', params: { id: session.id } });
    } catch {
      showDialog('Couldn’t start the session', 'Check your connection and try again.');
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

  async function handleQuietMode(enabled: boolean) {
    try {
      await setQuietMode(enabled);
    } catch {
      showDialog('Couldn’t update Quiet Mode', 'Check your connection and try again.');
    }
  }

  if (loadState !== 'ready' || !programme || !day) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : loadState === 'error' ? (
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
        ) : (
          <Text style={styles.message}>
            You don’t have a programme yet. Check your answers in Profile.
          </Text>
        )}
      </View>
    );
  }

  const isNextDay = day.id === nextDay?.id;
  const isInProgress = activeDay !== undefined;
  const suggestionFor = (item: (typeof day.exercises)[number]) =>
    getWeightSuggestion(item, data?.previous[item.exercise.id]);
  const needsStartingWeights = day.exercises.some(
    (item) => suggestionFor(item).kind === 'find-starting-weight'
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <Text style={styles.title}>Today</Text>
        <Text style={styles.subtitle}>
          {programme.name} · {formatDaysPerWeek(programme.days_per_week)} a week
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

        {activeSession && !isInProgress && (
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
          <Text style={styles.cardLabel}>{day.exercises.length} exercises</Text>

          {!isInProgress && (
            <Pressable
              onPress={() => handleQuietMode(!quietMode)}
              style={styles.quietRow}
              accessibilityRole="switch"
              accessibilityState={{ checked: quietMode }}
              accessibilityLabel="Quiet Mode">
              <View style={styles.exerciseText}>
                <Text style={styles.quietTitle}>Quiet Mode</Text>
                <Text style={styles.quietText}>
                  Stay in one spot — dumbbells, and maybe a mat or bench.
                </Text>
              </View>
              <Switch
                value={quietMode}
                pointerEvents="none"
                trackColor={{ false: colours.border, true: colours.accent }}
                thumbColor={colours.surface}
                ios_backgroundColor={colours.border}
              />
            </Pressable>
          )}

          {day.exercises.map((item, index) => (
            <View key={item.position} style={styles.exerciseRow}>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })
                }
                style={({ pressed }) => [styles.exerciseInfo, pressed && styles.pressed]}
                accessibilityRole="button">
                <Text style={styles.exerciseNumber}>{index + 1}</Text>
                <View style={styles.exerciseText}>
                  <Text style={styles.exerciseName}>{item.exercise.name}</Text>
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
              {!isInProgress && isPro && (
                <Pressable
                  onPress={() => setSwapItem(item)}
                  style={({ pressed }) => [styles.swapButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Swap ${item.exercise.name}`}>
                  <Ionicons name="swap-horizontal" size={24} color={colours.accent} />
                </Pressable>
              )}
            </View>
          ))}

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

        {isPro && programme.days.length > 1 && !isInProgress && (
          <Pressable
            style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
            onPress={() => setIsPickerOpen(true)}
            accessibilityRole="button">
            <Text style={styles.outlineButtonText}>Do a different day</Text>
          </Pressable>
        )}
        {!isNextDay && !isInProgress && (
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

      {equipment && (
        <SwapSheet
          item={swapItem}
          equipment={equipment}
          maxZone={maxZone}
          excludeIds={day.exercises.flatMap((item) =>
            item.original ? [item.exercise.id, item.original.id] : [item.exercise.id]
          )}
          onClose={() => setSwapItem(null)}
          onSwap={handleSwap}
          onRestore={handleRestore}
        />
      )}

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
            {programme.days.map((item) => {
              const isSelected = item.id === day.id;
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
  quietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 8,
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
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colours.border,
  },
  exerciseInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    paddingVertical: 12,
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
