import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import {
  AppText,
  Chip,
  DetailLayout,
  IconButton,
  MenuHeader,
  MenuRow,
  OverflowMenu,
  PrimaryButton,
  ProgressBar,
  RelatedLearn,
  SafetyNotice,
  StatStrip,
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
} from '@/lib/customWorkouts';
import { EQUIPMENT_LABELS, MUSCLE_LABELS, type Equipment } from '@/lib/exercises';
import { ROLE_LABELS, formatRir } from '@/lib/routineStandard';
import { getExerciseImageSource } from '@/lib/exerciseMedia';
import { coverForRoutine, coverSources } from '@/lib/images';
import {
  fetchHandOffPreview,
  handOffCardCopy,
  isInHandoffWindow,
  resolveNextRoutineOffer,
  type NextRoutineOffer,
} from '@/lib/handOff';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { formatSetsAndReps } from '@/lib/programmes';
import {
  DIFFICULTY_LABELS,
  ROUTINE_EQUIPMENT_LABELS,
  ROUTINE_GOAL_EYEBROWS,
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
import { fillCopy, routineActionsCopy } from '@/lib/copy';
import { ensureSubscribed } from '@/lib/paywall';
import { openRoutineLogger } from '@/lib/startLogger';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

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
  if (phase.phaseName) return `Phase ${index + 1} · ${phase.phaseName}`;
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
  const prefix = `Phase ${index + 1}`;
  return stage ? `${prefix} · ${stage}` : prefix;
}

function weekDayNames(week: RoutineWeek): string {
  return week.days.map((day) => day.name).join(' · ');
}

function WeekHeaderBody({
  week,
  doneDayIds,
  showTicks,
}: {
  week: RoutineWeek;
  doneDayIds: Set<string>;
  showTicks: boolean;
}) {
  const { colours, spacing } = useTheme();
  const ticks = week.days.filter((day) => doneDayIds.has(day.id)).length;
  return (
    <View style={styles.flex}>
      <View style={styles.weekTitleRow}>
        <AppText variant="title3" style={{ color: colours.ink, flex: 1 }}>Week {week.week_number}</AppText>
        {week.is_checkpoint ? <Chip label="Checkpoint" /> : null}
        {week.is_lighter_week ? <Chip label="Lighter week" /> : null}
      </View>
      <View style={[styles.weekMetaRow, { marginTop: 4 }]}>
        <AppText variant="bodySm" style={{ color: colours.inkMuted, flex: 1 }} numberOfLines={1}>
          {weekDayNames(week)}
        </AppText>
        {showTicks && ticks > 0 ? (
          <View style={[styles.tickRow, { marginLeft: spacing.sm }]}>
            {week.days.map((day) =>
              doneDayIds.has(day.id) ? (
                <Ionicons key={day.id} name="checkmark-circle" size={16} color={colours.success} />
              ) : null
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DayThumb({ day }: { day: RoutineDay }) {
  const { colours, radius } = useTheme();
  const photo = day.exercises[0] ? getExerciseImageSource(day.exercises[0].exercise) : null;
  return (
    <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
      {photo ? (
        <Image source={photo} style={styles.photoFill} resizeMode="cover" />
      ) : (
        <AppText variant="title3" style={{ color: colours.brand }}>{day.name.slice(0, 1)}</AppText>
      )}
    </View>
  );
}

export default function RoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colours, spacing, shadow } = useTheme();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
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

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      if (!id) {
        setLoadState('not-found');
        return;
      }
      setLoadState((state) => (state === 'ready' ? state : 'loading'));
      Promise.all([fetchRoutine(id), fetchActiveEnrolment()])
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
              mode: 'preview',
            }).catch(() => null);
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
    if (enrolment) {
      showDialog(
        fillCopy(routineActionsCopy.switch_title, { routine_name: routine.name }),
        routineActionsCopy.switch_body,
        [
          { text: routineActionsCopy.switch_cta, onPress: handleStart },
          { text: routineActionsCopy.cancel, style: 'cancel' },
        ]
      );
      return;
    }
    void handleStart();
  }

  function requestSwitch() {
    router.push('/programmes' as Href);
  }

  function requestEnd() {
    if (!routine) return;
    showDialog(
      fillCopy(routineActionsCopy.end_title, { routine_name: routine.name }),
      routineActionsCopy.end_body,
      [
        { text: routineActionsCopy.end_cta, style: 'destructive', onPress: handleEnd },
        { text: routineActionsCopy.cancel, style: 'cancel' },
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
    if (!ensureSubscribed()) return;
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
    if (!ensureSubscribed()) return;
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
        }
      );
      router.push({ pathname: '/workouts/[id]', params: { id: copy.id } });
    } catch (error) {
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
          <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
            {loadState === 'not-found'
              ? 'We couldn’t find that routine.'
              : (errorMessage ?? missingRoutinesMessage())}
          </AppText>
        )}
      </View>
    );
  }

  const isCurrent = enrolment?.routine_id === routine.id;
  const nextPlan = handOff ? handOffCardCopy(handOff) : null;
  const cover = coverSources(coverForRoutine(routine))[0] ?? null;
  const busy = isStarting || isDuplicating || isEnding;
  const showMore = routine.description.trim().length > 90;
  const phases = groupRoutinePhases(routine.weeks);
  const weeksByNumber = new Map(routine.weeks.map((week) => [week.week_number, week]));
  const stickyLabel = isCurrent
    ? 'Start next session'
    : enrolment
      ? routineActionsCopy.switch_cta
      : routineActionsCopy.start;
  const showSticky = !isCurrent || Boolean(nextSession);
  const currentWeek = enrolment && isCurrent ? currentEnrolmentWeek(enrolment) : 0;
  const chips = [
    ROUTINE_EQUIPMENT_LABELS[routine.equipment],
    ROUTINE_GOAL_LABELS[routine.goal],
    ...routine.tags.map((tag) => formatTagLabel(tag)),
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <DetailLayout
        cover={cover}
        letter={routine.name}
        title={routine.name}
        eyebrow={`${DIFFICULTY_LABELS[routine.difficulty]} · ${ROUTINE_GOAL_EYEBROWS[routine.goal]}`}
        onBack={goBack}
        menu={
          <View ref={menuRef} collapsable={false}>
            <IconButton
              icon="ellipsis-horizontal"
              variant="overlay"
              accessibilityLabel="Routine options"
              onPress={openMenu}
            />
          </View>
        }
        sticky={
          showSticky ? (
            <PrimaryButton
              label={isStarting ? 'Starting…' : stickyLabel}
              loading={isStarting}
              disabled={busy}
              onPress={isCurrent ? openNextSession : requestStart}
            />
          ) : undefined
        }>
          <View style={styles.badgeRow}>
            {isCurrent ? <Chip label="Current" selected /> : null}
          </View>

          <AppText variant="body" style={{ color: colours.ink }}
            numberOfLines={descriptionOpen ? undefined : 2}>
            {routine.description}
          </AppText>
          {showMore ? (
            <TextButton
              label={descriptionOpen ? 'Less' : 'More'}
              onPress={() => setDescriptionOpen((open) => !open)}
              style={styles.more}
            />
          ) : null}

          {chips.length > 0 ? (
            <View style={styles.tagRow}>
              {chips.map((chip, index) => (
                <Chip key={`${chip}-${index}`} label={chip} />
              ))}
            </View>
          ) : null}

          {isCurrent && enrolment ? (
            <View style={styles.progressBlock}>
              <AppText variant="caption" style={{ color: colours.inkMuted, marginBottom: 8 }}>
                Week {currentWeek} of {routine.length_weeks}
              </AppText>
              <ProgressBar progress={routine.length_weeks > 0 ? currentWeek / routine.length_weeks : 0} />
            </View>
          ) : null}

          <StatStrip
            style={{ marginTop: spacing.lg }}
            items={[
              { icon: 'calendar-outline', value: String(routine.length_weeks), label: 'Weeks' },
              { icon: 'repeat-outline', value: String(routine.days_per_week), label: 'Days a week' },
              { icon: 'time-outline', value: String(routine.session_minutes), label: 'Minutes' },
              { icon: 'bar-chart-outline', value: DIFFICULTY_LABELS[routine.difficulty], label: 'Level' },
            ]}
          />

          {routine.type === 'strength' && routine.audience.length > 0 ? (
            <View style={{ marginTop: spacing.lg, gap: 8 }}>
              <AppText variant="title3" style={{ color: colours.ink }}>Who it’s for</AppText>
              {routine.audience.map((line) => (
                <AppText key={line} variant="body" style={{ color: colours.ink }}>
                  {`\u2022 ${line}`}
                </AppText>
              ))}
            </View>
          ) : null}

          {routine.type === 'strength' && routine.byTheEnd.length > 0 ? (
            <View style={{ marginTop: spacing.lg, gap: 8 }}>
              <AppText variant="title3" style={{ color: colours.ink }}>By the end you’ll</AppText>
              {routine.byTheEnd.map((line) => (
                <AppText key={line} variant="body" style={{ color: colours.ink }}>
                  {`\u2022 ${line}`}
                </AppText>
              ))}
            </View>
          ) : null}

          {routine.type === 'strength' && routine.splitNote ? (
            <View style={{ marginTop: spacing.lg, gap: 8 }}>
              <AppText variant="title3" style={{ color: colours.ink }}>Why this split</AppText>
              <AppText variant="body" style={{ color: colours.ink }}>{routine.splitNote}</AppText>
            </View>
          ) : null}

          {routine.type === 'strength' && routine.howItWorks.length > 0 ? (
            <View style={{ marginTop: spacing.lg, gap: 8 }}>
              <AppText variant="title3" style={{ color: colours.ink }}>How the weeks work</AppText>
              {routine.howItWorks.map((line) => (
                <AppText key={line} variant="body" style={{ color: colours.ink }}>
                  {`\u2022 ${line}`}
                </AppText>
              ))}
            </View>
          ) : null}

          {routine.type === 'strength' && routine.weeklyStructure ? (
            <View style={{ marginTop: spacing.lg, gap: 8 }}>
              <AppText variant="title3" style={{ color: colours.ink }}>Your week</AppText>
              <AppText variant="body" style={{ color: colours.ink }}>{routine.weeklyStructure}</AppText>
            </View>
          ) : null}

          {routine.type === 'strength' && routine.progressionNote ? (
            <View style={{ marginTop: spacing.lg, gap: 8 }}>
              <AppText variant="title3" style={{ color: colours.ink }}>How you'll progress</AppText>
              <AppText variant="body" style={{ color: colours.ink }}>{routine.progressionNote}</AppText>
            </View>
          ) : null}

          {isCurrent && handOff && nextPlan ? (
            <WhatsNextCard
              title={nextPlan.title}
              body={nextPlan.body}
              image={coverSources(coverForRoutine(handOff.routine))[0] ?? null}
              primaryLabel={nextPlan.primaryLabel}
              onPrimary={() =>
                router.push({ pathname: '/routines/[id]', params: { id: handOff.routine.id } } as Href)
              }
              style={[{ marginTop: spacing.lg }, shadow]}
            />
          ) : null}

          <AppText variant="title2" style={{ color: colours.ink, marginTop: spacing.lg, marginBottom: spacing.md }}>
            Week by week
          </AppText>

          {phases.map((phase, phaseIndex) => {
            const weeks: RoutineWeek[] = [];
            for (let n = phase.fromWeek; n <= phase.toWeek; n += 1) {
              const week = weeksByNumber.get(n);
              if (week) weeks.push(week);
            }
            return (
              <View key={`${phase.fromWeek}-${phase.toWeek}`} style={styles.phase}>
                {phases.length > 1 || phase.phaseName ? (
                  <View style={{ marginBottom: spacing.sm, gap: 4 }}>
                    <AppText variant="eyebrow" style={{ color: colours.accent }}>
                      {phaseLabel(phase, phaseIndex, routine)}
                    </AppText>
                    {phase.phaseGoal ? (
                      <AppText variant="bodySm" style={{ color: colours.inkMuted }}>{phase.phaseGoal}</AppText>
                    ) : null}
                  </View>
                ) : null}
                {weeks.map((week) => {
                  const weekOpen = openWeek === week.week_number;
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
                          ]}>
                          <Pressable
                            onPress={() => {
                              setOpenWeek(weekOpen ? null : week.week_number);
                              setOpenDayId(null);
                            }}
                            style={({ pressed }) => [styles.weekHeader, pressed && styles.pressed]}
                            accessibilityRole="button">
                            <WeekHeaderBody
                              week={week}
                              doneDayIds={doneDayIds}
                              showTicks={isCurrent}
                            />
                            <Ionicons
                              name={weekOpen ? 'chevron-up' : 'chevron-down'}
                              size={20}
                              color={colours.brand}
                            />
                          </Pressable>
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
                                      <AppText variant="title3" style={{ color: colours.ink }} numberOfLines={1}>
                                        {day.name}
                                      </AppText>
                                      <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }}>
                                        {day.focus ? `${day.focus} · ` : `Day ${day.day_number} · `}
                                        {routine.session_minutes} min
                                      </AppText>
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
                                            {item.role ? (
                                              <AppText variant="eyebrow" style={{ color: colours.accent, marginBottom: 4 }}>
                                                {ROLE_LABELS[item.role]}
                                              </AppText>
                                            ) : null}
                                            <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                                              {item.exercise.name}
                                            </AppText>
                                            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }}>
                                              {formatSetsAndReps(item)}
                                              {item.target_rir
                                                ? ` · ${formatRir(item.target_rir)}`
                                                : ''}
                                              {` · ${formatRestSeconds(item.rest_seconds)}`}
                                            </AppText>
                                            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }}>
                                              {MUSCLE_LABELS[item.exercise.primary_muscle]} ·{' '}
                                              {EQUIPMENT_LABELS[item.exercise.equipment]}
                                            </AppText>
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
          <RelatedLearn
            routineId={routine.id}
            routineSlug={routine.slug}
            style={{ marginTop: spacing.lg }}
          />
          <SafetyNotice style={{ marginTop: spacing.md }} />
      </DetailLayout>

      <OverflowMenu visible={menuOpen} anchor={menuAnchor} onClose={() => setMenuOpen(false)}>
        <MenuHeader label={routine.name} />
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
              label={routineActionsCopy.switch_cta}
              onPress={() => {
                setMenuOpen(false);
                requestSwitch();
              }}
            />
            <MenuRow
              label={isEnding ? 'Ending…' : routineActionsCopy.end_cta}
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
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
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
  progressBlock: {
    marginTop: 16,
  },
  weekTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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
  pressed: {
    opacity: 0.8,
  },
});
