import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import {
  Chip,
  FreeBadge,
  HeroImage,
  IconButton,
  LockedOverlay,
  MenuHeader,
  MenuRow,
  OverflowMenu,
  PrimaryButton,
  ProBadge,
  SafetyNotice,
  StatTile,
  TextButton,
  WhatsNextCard,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  describeCustomWorkoutError,
  duplicateRoutineDay,
  isFreeCustomWorkoutLimitError,
  isProRoutineDuplicateError,
} from '@/lib/customWorkouts';
import { EQUIPMENT_LABELS, MUSCLE_LABELS, type Equipment } from '@/lib/exercises';
import { getExerciseImageSource } from '@/lib/exerciseMedia';
import { coverForRoutine, coverSources } from '@/lib/images';
import { openPaywall } from '@/lib/paywall';
import {
  fetchHandOffPreview,
  isInHandoffWindow,
  previewCopy,
  resolveNextRoutineOffer,
  type NextRoutineOffer,
} from '@/lib/handOff';
import { formatDaysPerWeek, getQuizAnswers, useProfile } from '@/lib/profile';
import { formatSetsAndReps } from '@/lib/programmes';
import {
  DIFFICULTY_LABELS,
  ROUTINE_EQUIPMENT_LABELS,
  ROUTINE_GOAL_LABELS,
  currentEnrolmentWeek,
  describeRoutineError,
  endActiveEnrolment,
  fetchActiveEnrolment,
  fetchRoutine,
  fetchRoutines,
  fetchRoutineRoadmap,
  firstDayOfRoutine,
  formatRestSeconds,
  formatTagLabel,
  getNextRoutineDay,
  groupRoutinePhases,
  isRoutineWeekLocked,
  missingRoutinesMessage,
  startRoutine,
  type PlannedSession,
  type Routine,
  type RoutineDay,
  type RoutineEnrolment,
  type RoutinePhase,
  type RoutineWeek,
} from '@/lib/routines';
import { fetchLastFinishedRoutineSession } from '@/lib/sessions';
import { openRoutineLogger } from '@/lib/startLogger';
import { useSubscription } from '@/lib/subscription';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';
type IoniconName = ComponentProps<typeof Ionicons>['name'];

const SHEET_OVERLAP = 24;
const SHEET_RADIUS = 28;

function dominantEquipment(phase: RoutinePhase): Equipment | null {
  const counts = new Map<Equipment, number>();
  for (const day of phase.days) {
    for (const item of day.exercises) {
      const equipment = item.exercise.equipment;
      counts.set(equipment, (counts.get(equipment) ?? 0) + 1);
    }
  }
  let best: Equipment | null = null;
  let n = 0;
  for (const [equipment, count] of counts) {
    if (count > n) {
      best = equipment;
      n = count;
    }
  }
  return best;
}

function phaseLabel(phase: RoutinePhase, index: number, routine: Routine): string {
  const equipment = dominantEquipment(phase);
  let stage = '';
  if (equipment === 'dumbbell' || equipment === 'kettlebell') {
    stage = routine.tags.includes('one spot') || routine.id === 'gym-confidence-6' ? 'One spot' : 'Dumbbells';
  } else if (equipment === 'machine' || equipment === 'cable') {
    stage = 'Machines';
  } else if (equipment === 'barbell') {
    stage = 'Free weights';
  } else if (equipment === 'band' || equipment === 'bodyweight') {
    stage = 'Minimal equipment';
  }
  const prefix = `Stage ${index + 1}`;
  return stage ? `${prefix}: ${stage}` : prefix;
}

function DayThumb({ day }: { day: RoutineDay }) {
  const { colours, radius, type } = useTheme();
  const photo = day.exercises[0] ? getExerciseImageSource(day.exercises[0].exercise) : null;
  return (
    <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
      {photo ? (
        <Image source={photo} style={styles.photoFill} resizeMode="cover" />
      ) : (
        <Text style={[type.title3, { color: colours.brand }]}>{day.name.slice(0, 1)}</Text>
      )}
    </View>
  );
}

export default function RoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colours, type, spacing, shadow } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const subscription = useSubscription();
  const menuRef = useRef<AnchorHandle>(null);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [enrolment, setEnrolment] = useState<RoutineEnrolment | null>(null);
  const [nextSession, setNextSession] = useState<PlannedSession | null>(null);
  const [doneDayIds, setDoneDayIds] = useState<Set<string>>(new Set());
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const [openDayId, setOpenDayId] = useState<string | null>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const [handOff, setHandOff] = useState<NextRoutineOffer | null>(null);

  const heroHeight = Math.round(windowHeight * 0.45);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      if (!id) {
        setLoadState('not-found');
        return;
      }
      if (subscription.isLoading) {
        setLoadState((state) => (state === 'ready' ? state : 'loading'));
        return;
      }
      setLoadState((state) => (state === 'ready' ? state : 'loading'));
      Promise.all([fetchRoutine(id, { includeLockedWeeks: subscription.isPro }), fetchActiveEnrolment()])
        .then(async ([next, active]) => {
          if (!isCurrent) return;
          if (next?.type === 'stretch') {
            router.replace({ pathname: '/stretches/[id]', params: { id: next.id } } as Href);
            return;
          }
          setRoutine(next);
          setEnrolment(active);
          setErrorMessage(null);
          if (next && active?.routine_id === next.id) {
            const [last, roadmap] = await Promise.all([
              fetchLastFinishedRoutineSession(active.id),
              fetchRoutineRoadmap(active),
            ]);
            if (!isCurrent) return;
            setNextSession(
              getNextRoutineDay(next, active, last?.routine_day_id ?? last?.programme_day_id ?? null)
            );
            setDoneDayIds(
              new Set(roadmap.flatMap((week) => week.days.filter((day) => day.done).map((day) => day.id)))
            );
          } else {
            setNextSession(null);
            setDoneDayIds(new Set());
          }
          const isCurrentPlan = Boolean(next && active?.routine_id === next.id);
          const preview = await fetchHandOffPreview().catch(() => false);
          if (isCurrentPlan && active && (preview || isInHandoffWindow(active))) {
            const catalogue = await fetchRoutines().catch(() => []);
            const offer = await resolveNextRoutineOffer({
              currentRoutineId: active.routine_id,
              catalogue,
              answers,
              isPro: subscription.isPro,
              mode: 'preview',
            }).catch(() => null);
            if (offer) offer.why = `${previewCopy(active)} ${offer.why}`.trim();
            if (isCurrent) setHandOff(offer);
          } else if (isCurrent) {
            setHandOff(null);
          }
          setLoadState(next ? 'ready' : 'not-found');
        })
        .catch((error) => {
          if (!isCurrent) return;
          setErrorMessage(describeRoutineError(error));
          setLoadState('error');
        });
      return () => {
        isCurrent = false;
      };
    }, [
      id,
      answers?.goal,
      answers?.experience,
      answers?.equipment,
      answers?.days_per_week,
      subscription.isLoading,
      subscription.isPro,
    ])
  );

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/programmes' as Href);
  }

  function openMenu() {
    measureAnchor(menuRef.current, (rect) => {
      setMenuAnchor(rect);
      setMenuOpen(true);
    });
  }

  function requestStart() {
    if (!routine) return;
    if (enrolment?.routine_id === routine.id) return;
    if (routine.is_pro && !subscription.isPro) {
      openPaywall('routine');
      return;
    }
    const message = enrolment
      ? `This ends ${enrolment.routine.name} and starts ${routine.name} from week 1. Your logged sessions stay. Upcoming planned sessions from the old plan will be cleared.`
      : `${routine.name} starts today. Home will show your next session from this plan.`;
    showDialog(`Start ${routine.name}?`, message, [
      { text: 'Start routine', onPress: handleStart },
      { text: 'Not now', style: 'cancel' },
    ]);
  }

  function requestSwitch() {
    showDialog(
      'Switch routine?',
      'Pick another plan from Programmes. Your logged sessions stay. This plan stays current until you start a new one.',
      [
        {
          text: 'Choose a plan',
          onPress: () => router.push('/programmes' as Href),
        },
        { text: 'Not now', style: 'cancel' },
      ]
    );
  }

  function requestEnd() {
    if (!routine) return;
    showDialog(
      `End ${routine.name}?`,
      'Your logged sessions and progress stay. Upcoming planned sessions from this plan will be cleared.',
      [
        { text: 'End routine', style: 'destructive', onPress: handleEnd },
        { text: 'Keep this plan', style: 'cancel' },
      ]
    );
  }

  async function handleEnd() {
    setIsEnding(true);
    try {
      await endActiveEnrolment();
      setEnrolment(null);
      setNextSession(null);
      setDoneDayIds(new Set());
    } catch (error) {
      showDialog('Couldn’t end the routine', describeRoutineError(error));
    } finally {
      setIsEnding(false);
    }
  }

  async function handleStart() {
    if (!routine) return;
    setIsStarting(true);
    try {
      const next = await startRoutine(routine.id);
      setEnrolment(next);
      const last = await fetchLastFinishedRoutineSession(next.id);
      setNextSession(getNextRoutineDay(routine, next, last?.routine_day_id ?? last?.programme_day_id ?? null));
    } catch (error) {
      showDialog('Couldn’t start the routine', describeRoutineError(error));
    } finally {
      setIsStarting(false);
    }
  }

  async function openNextSession() {
    if (!enrolment || !nextSession) return;
    setIsStarting(true);
    try {
      await openRoutineLogger({
        enrolmentId: enrolment.id,
        routineDayId: nextSession.day.id,
        sourceProgrammeDayId: nextSession.day.source_programme_day_id,
      });
    } finally {
      setIsStarting(false);
    }
  }

  async function handleDuplicate() {
    if (!routine) return;
    if (routine.is_pro && !subscription.isPro) {
      openPaywall('routine');
      return;
    }
    const day = firstDayOfRoutine(routine);
    if (!day) {
      showDialog('Nothing to copy', 'This routine has no days yet.');
      return;
    }
    setIsDuplicating(true);
    try {
      const copy = await duplicateRoutineDay(
        routine,
        {
          name: day.name,
          exercises: day.exercises.map((item) => ({
            exercise: item.exercise,
            sets: item.sets,
            rep_min: item.rep_min,
            rep_max: item.rep_max,
          })),
        },
        subscription.isPro
      );
      router.push({ pathname: '/workouts/[id]', params: { id: copy.id } });
    } catch (error) {
      if (isProRoutineDuplicateError(error)) {
        openPaywall('routine');
        return;
      }
      if (isFreeCustomWorkoutLimitError(error)) {
        openPaywall('custom-limit');
        return;
      }
      showDialog('Couldn’t copy it', describeCustomWorkoutError(error));
    } finally {
      setIsDuplicating(false);
    }
  }

  if (loadState !== 'ready' || !routine) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg, paddingTop: insets.top }]}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <Text style={[type.body, { color: colours.inkMuted, textAlign: 'center' }]}>
            {loadState === 'not-found'
              ? 'We couldn’t find that routine.'
              : (errorMessage ?? missingRoutinesMessage())}
          </Text>
        )}
      </View>
    );
  }

  const isCurrent = enrolment?.routine_id === routine.id;
  const cover = coverSources(coverForRoutine(routine))[0] ?? null;
  const busy = isStarting || isDuplicating || isEnding;
  const showMore = routine.description.trim().length > 90;
  const phases = groupRoutinePhases(routine.weeks);
  const weeksByNumber = new Map(routine.weeks.map((week) => [week.week_number, week]));
  const stickyLabel = isCurrent
    ? 'Start next session'
    : routine.is_pro && !subscription.isPro
      ? 'Start with Pro'
      : 'Start routine';
  const showSticky = !isCurrent || Boolean(nextSession);
  const stats: { label: string; value: string; icon: IoniconName }[] = [
    { label: 'Weeks', value: String(routine.length_weeks), icon: 'calendar-outline' },
    { label: 'Days a week', value: formatDaysPerWeek(routine.days_per_week), icon: 'repeat-outline' },
    { label: 'Minutes', value: `${routine.session_minutes} min`, icon: 'time-outline' },
    { label: 'Level', value: DIFFICULTY_LABELS[routine.difficulty], icon: 'bar-chart-outline' },
    { label: 'Equipment', value: ROUTINE_EQUIPMENT_LABELS[routine.equipment], icon: 'barbell-outline' },
    { label: 'Goal', value: ROUTINE_GOAL_LABELS[routine.goal], icon: 'flag-outline' },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: showSticky ? 16 : insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}>
        <HeroImage
          image={cover}
          letter={routine.name}
          title={routine.name}
          eyebrow={`${DIFFICULTY_LABELS[routine.difficulty]} · ${ROUTINE_GOAL_LABELS[routine.goal]}`}
          height={heroHeight}>
          <View style={[styles.heroBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            <IconButton icon="chevron-back" variant="overlay" accessibilityLabel="Back" onPress={goBack} />
            <View ref={menuRef} collapsable={false}>
              <IconButton
                icon="ellipsis-horizontal"
                variant="overlay"
                accessibilityLabel="Routine options"
                onPress={openMenu}
              />
            </View>
          </View>
        </HeroImage>

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colours.bg,
              marginTop: -SHEET_OVERLAP,
              borderTopLeftRadius: SHEET_RADIUS,
              borderTopRightRadius: SHEET_RADIUS,
              paddingBottom: spacing.lg,
            },
          ]}>
          <View style={styles.badgeRow}>
            {!subscription.isPro ? routine.is_pro ? <ProBadge /> : <FreeBadge /> : null}
            {isCurrent ? <Chip label="Current" selected /> : null}
          </View>

          <Text
            style={[type.body, { color: colours.ink }]}
            numberOfLines={descriptionOpen ? undefined : 2}>
            {routine.description}
          </Text>
          {showMore ? (
            <TextButton
              label={descriptionOpen ? 'Less' : 'More'}
              onPress={() => setDescriptionOpen((open) => !open)}
              style={styles.more}
            />
          ) : null}

          {routine.tags.length > 0 ? (
            <View style={styles.tagRow}>
              {routine.tags.map((tag) => (
                <Chip key={tag} label={formatTagLabel(tag)} />
              ))}
            </View>
          ) : null}

          {isCurrent && enrolment ? (
            <Text style={[type.caption, { color: colours.inkMuted, marginTop: spacing.md }]}>
              Week {currentEnrolmentWeek(enrolment)} of {routine.length_weeks}
            </Text>
          ) : null}

          <View style={styles.statGrid}>
            {stats.map((stat) => (
              <StatTile
                key={stat.label}
                icon={stat.icon}
                value={stat.value}
                label={stat.label}
                style={styles.statCell}
              />
            ))}
          </View>

          {isCurrent && handOff ? (
            <WhatsNextCard
              title={handOff.routine.name}
              body={handOff.why}
              image={coverSources(coverForRoutine(handOff.routine))[0] ?? null}
              locked={!subscription.isPro && handOff.routine.is_pro}
              primaryLabel="See this routine"
              onPrimary={() =>
                router.push({ pathname: '/routines/[id]', params: { id: handOff.routine.id } } as Href)
              }
              style={[{ marginTop: spacing.lg }, shadow]}
            />
          ) : null}

          <Text style={[type.title2, { color: colours.ink, marginTop: spacing.lg, marginBottom: spacing.md }]}>
            Week by week
          </Text>

          {phases.map((phase, phaseIndex) => {
            const weeks: RoutineWeek[] = [];
            for (let n = phase.fromWeek; n <= phase.toWeek; n += 1) {
              const week = weeksByNumber.get(n);
              if (week) weeks.push(week);
            }
            return (
              <View key={`${phase.fromWeek}-${phase.toWeek}`} style={styles.phase}>
                {phases.length > 1 ? (
                  <Text style={[type.eyebrow, { color: colours.accent, marginBottom: spacing.sm }]}>
                    {phaseLabel(phase, phaseIndex, routine)}
                  </Text>
                ) : null}
                {weeks.map((week) => {
                  const weekLocked = isRoutineWeekLocked(routine, week.week_number, subscription.isPro);
                  const weekOpen = !weekLocked && openWeek === week.week_number;
                  return (
                    <View key={week.id} style={styles.weekRow}>
                      <View style={styles.rail}>
                        <View style={[styles.dot, { backgroundColor: colours.brand }]} />
                        <View style={[styles.railLine, { backgroundColor: colours.brandSoft }]} />
                      </View>
                      <View style={styles.weekBody}>
                        <View
                          style={[
                            styles.weekCard,
                            { backgroundColor: colours.surface, borderRadius: 16 },
                            weekLocked && styles.weekLocked,
                          ]}>
                          {weekLocked ? (
                            <>
                              <View style={styles.weekHeader}>
                                <View style={styles.flex}>
                                  <Text style={[type.title3, { color: colours.ink }]}>
                                    Week {week.week_number}
                                    {week.is_checkpoint ? ' · checkpoint' : ''}
                                  </Text>
                                  <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 2 }]}>
                                    {week.days.length} days
                                  </Text>
                                </View>
                              </View>
                              <LockedOverlay
                                onUnlock={() => openPaywall('routine')}
                                label={`Unlock weeks 2 to ${routine.length_weeks} with Pro`}
                              />
                            </>
                          ) : (
                            <Pressable
                              onPress={() => {
                                setOpenWeek(weekOpen ? null : week.week_number);
                                setOpenDayId(null);
                              }}
                              style={({ pressed }) => [styles.weekHeader, pressed && styles.pressed]}
                              accessibilityRole="button">
                              <View style={styles.flex}>
                                <Text style={[type.title3, { color: colours.ink }]}>
                                  Week {week.week_number}
                                  {week.is_checkpoint ? ' · checkpoint' : ''}
                                </Text>
                                <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 2 }]}>
                                  {week.days.length} days
                                </Text>
                              </View>
                              <Ionicons
                                name={weekOpen ? 'chevron-up' : 'chevron-down'}
                                size={20}
                                color={colours.brand}
                              />
                            </Pressable>
                          )}
                        </View>
                        {weekOpen
                          ? week.days.map((day) => {
                              const dayOpen = openDayId === day.id;
                              const done = doneDayIds.has(day.id);
                              return (
                                <View key={day.id} style={styles.dayWrap}>
                                  <Pressable
                                    onPress={() => setOpenDayId(dayOpen ? null : day.id)}
                                    style={({ pressed }) => [
                                      styles.dayCard,
                                      { backgroundColor: colours.surface, borderRadius: 16 },
                                      pressed && styles.pressed,
                                    ]}
                                    accessibilityRole="button">
                                    <DayThumb day={day} />
                                    <View style={styles.flex}>
                                      <Text style={[type.title3, { color: colours.ink }]} numberOfLines={1}>
                                        {day.name}
                                      </Text>
                                      <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 2 }]}>
                                        Day {day.day_number} · {routine.session_minutes} min
                                      </Text>
                                    </View>
                                    {done ? (
                                      <Ionicons name="checkmark-circle" size={22} color={colours.success} />
                                    ) : (
                                      <Ionicons
                                        name={dayOpen ? 'chevron-up' : 'chevron-down'}
                                        size={18}
                                        color={colours.inkMuted}
                                      />
                                    )}
                                  </Pressable>
                                  {dayOpen
                                    ? day.exercises.map((item) => (
                                        <Pressable
                                          key={`${day.id}-${item.position}`}
                                          onPress={() =>
                                            router.push({
                                              pathname: '/exercise/[id]',
                                              params: { id: item.exercise.id },
                                            })
                                          }
                                          style={({ pressed }) => [
                                            styles.exerciseRow,
                                            { borderTopColor: colours.border },
                                            pressed && styles.pressed,
                                          ]}
                                          accessibilityRole="button">
                                          <View style={styles.flex}>
                                            <Text style={[type.body, { color: colours.ink, fontWeight: '600' }]}>
                                              {item.exercise.name}
                                            </Text>
                                            <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 2 }]}>
                                              {formatSetsAndReps(item)} · {formatRestSeconds(item.rest_seconds)}
                                            </Text>
                                            <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 2 }]}>
                                              {MUSCLE_LABELS[item.exercise.primary_muscle]} ·{' '}
                                              {EQUIPMENT_LABELS[item.exercise.equipment]}
                                            </Text>
                                          </View>
                                          <Ionicons name="chevron-forward" size={20} color={colours.inkMuted} />
                                        </Pressable>
                                      ))
                                    : null}
                                </View>
                              );
                            })
                          : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
          <SafetyNotice style={{ marginTop: spacing.md }} />
        </View>
      </ScrollView>

      {showSticky ? (
        <View
          style={[
            styles.sticky,
            { backgroundColor: colours.bg, paddingBottom: insets.bottom + 12 },
            shadow,
          ]}>
          <PrimaryButton
            label={isStarting ? 'Starting…' : stickyLabel}
            loading={isStarting}
            disabled={busy}
            onPress={isCurrent ? openNextSession : requestStart}
          />
        </View>
      ) : null}

      <OverflowMenu visible={menuOpen} anchor={menuAnchor} onClose={() => setMenuOpen(false)}>
        <MenuHeader label={routine.name} detail="Copy this plan, or change the one you’re on." />
        <MenuRow
          label={isDuplicating ? 'Copying…' : 'Duplicate'}
          onPress={() => {
            setMenuOpen(false);
            void handleDuplicate();
          }}
        />
        {isCurrent ? (
          <>
            <MenuRow
              label="Switch routine"
              onPress={() => {
                setMenuOpen(false);
                requestSwitch();
              }}
            />
            <MenuRow
              label={isEnding ? 'Ending…' : 'End routine'}
              danger
              onPress={() => {
                setMenuOpen(false);
                requestEnd();
              }}
            />
          </>
        ) : null}
      </OverflowMenu>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  heroBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  more: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 0,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  statCell: {
    width: '47%',
    flexGrow: 1,
    minWidth: '47%',
  },
  phase: {
    marginBottom: 8,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rail: {
    width: 22,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 18,
  },
  railLine: {
    flex: 1,
    width: 2,
    marginTop: 4,
  },
  weekBody: {
    flex: 1,
    paddingBottom: 12,
    paddingLeft: 8,
  },
  weekCard: {
    overflow: 'hidden',
  },
  weekLocked: {
    minHeight: 132,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dayWrap: {
    marginTop: 8,
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  thumb: {
    width: 56,
    height: 56,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFill: {
    width: '100%',
    height: '100%',
  },
  flex: {
    flex: 1,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sticky: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  pressed: {
    opacity: 0.8,
  },
});
