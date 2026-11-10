import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { useTabBarHeight } from '@/components/PillTabBar';
import {
  AppText,
  IconButton,
  ListRow,
  MenuHeader,
  MenuRow,
  OverflowMenu,
  PrimaryButton,
  ReminderTimeChip,
  StickyDayHeader,
  TabAvatar,
  TextButton,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { fetchCustomWorkouts, type CustomWorkout } from '@/lib/customWorkouts';
import {
  CALENDAR_WEEKDAYS,
  addCustomWorkoutToPlanner,
  addDays,
  clearPlannerDay,
  describePlannerError,
  formatAgendaHeading,
  formatStickyDayHeading,
  isPlannedSessionKind,
  loadPlannerRange,
  skipPlannedSession,
  monthsInHorizon,
  movePlannedSession,
  parseIsoDate,
  plannerHorizon,
  setRestDay,
  startOfMonth,
  startOfWeekMonday,
  toIso,
  upcomingPlannerDays,
  type PlannerDayView,
  type PlannerRange,
} from '@/lib/planner';
import { SESSION_TYPE_COLOURS } from '@/lib/completeWeek';
import { weekRingCopy } from '@/lib/copy';
import {
  openCardioFromPlan,
  openRecoveryFromPlan,
  openRoutineLogger,
  openStretchDayFromPlan,
} from '@/lib/startLogger';
import { useWorkout } from '@/lib/workout';
import { confirmFirstSessionSafety } from '@/lib/firstSession';
import { ensureSubscribed } from '@/lib/paywall';
import {
  DEFAULT_REMINDER_TIME,
  REMINDER_HOURS,
  fetchLastSessionReminderTime,
  fetchReminderPrefs,
  formatReminderClock,
  hourToReminderTime,
  maybeAskSessionReminders,
  reminderTimeForDay,
  setPlannedReminderTime,
  syncPlannerReminders,
  type ReminderPrefs,
} from '@/lib/reminders';
import { fetchActiveSession, startCustomSession } from '@/lib/sessions';

type LoadState = 'loading' | 'error' | 'ready';
type SheetMode = 'day' | 'fab' | 'workouts' | 'pick-day' | 'reminder-time' | null;
type PickDayReason = 'workout' | 'rest';
type ViewMode = 'agenda' | 'month';
type AgendaSection = { iso: string; day: PlannerDayView; data: PlannerDayView[] };

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

export default function PlannerScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { colours, spacing, radius, shadow } = useTheme();
  const workout = useWorkout();
  const agendaRef = useRef<SectionList<PlannerDayView, AgendaSection>>(null);
  const fabRef = useRef<AnchorHandle>(null);
  const [range, setRange] = useState<PlannerRange | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [errorMessage, setErrorMessage] = useState('We couldn’t load your planner. Check your connection and try again.');
  const [viewMode, setViewMode] = useState<ViewMode>('agenda');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<PlannerDayView | null>(null);
  const [sheet, setSheet] = useState<SheetMode>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [workouts, setWorkouts] = useState<CustomWorkout[]>([]);
  const [pendingWorkout, setPendingWorkout] = useState<CustomWorkout | null>(null);
  const [pickDayReason, setPickDayReason] = useState<PickDayReason | null>(null);
  const [menuSource, setMenuSource] = useState<'day' | 'fab'>('day');
  const [busy, setBusy] = useState(false);
  const [didScrollToToday, setDidScrollToToday] = useState(false);
  const [weekStartIso, setWeekStartIso] = useState(() => toIso(startOfWeekMonday(new Date())));
  const [reminderPrefs, setReminderPrefs] = useState<ReminderPrefs | null>(null);
  const [lastSessionTime, setLastSessionTime] = useState<string | null>(null);

  const horizon = useMemo(() => plannerHorizon(), []);
  const todayIso = toIso(new Date());

  const reload = useCallback(async () => {
    const [next, prefs, lastTime] = await Promise.all([
      loadPlannerRange(horizon.from, horizon.to),
      fetchReminderPrefs().catch(() => null),
      fetchLastSessionReminderTime().catch(() => null),
    ]);
    setRange(next);
    setReminderPrefs(prefs);
    setLastSessionTime(lastTime);
    setLoadState('ready');
    void maybeAskSessionReminders();
    void syncPlannerReminders();
  }, [horizon.from, horizon.to]);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      setLoadState((state) => (state === 'ready' ? state : 'loading'));
      reload().catch((error) => {
        if (!isCurrent) return;
        setErrorMessage(describePlannerError(error));
        setLoadState((state) => (state === 'ready' ? state : 'error'));
      });
      return () => {
        isCurrent = false;
      };
    }, [reload, attempt])
  );

  const daysByIso = useMemo(() => {
    const map = new Map<string, PlannerDayView>();
    for (const day of range?.days ?? []) map.set(day.iso, day);
    return map;
  }, [range]);

  const agendaDays = useMemo(
    () => (range?.days ?? []).filter((day) => day.iso >= todayIso),
    [range, todayIso]
  );
  const agendaSections = useMemo<AgendaSection[]>(
    () => agendaDays.map((day) => ({ iso: day.iso, day, data: [day] })),
    [agendaDays]
  );

  const weekDays = useMemo(() => {
    const monday = toIso(startOfWeekMonday(new Date()));
    const sunday = toIso(addDays(startOfWeekMonday(new Date()), 6));
    return (range?.days ?? []).filter((day) => day.iso >= monday && day.iso <= sunday);
  }, [range]);

  const stripDays = useMemo(() => {
    const start = parseIsoDate(weekStartIso);
    return Array.from({ length: 7 }, (_, index) => daysByIso.get(toIso(addDays(start, index))) ?? null);
  }, [weekStartIso, daysByIso]);

  const canPrevWeek = parseIsoDate(weekStartIso) > startOfWeekMonday(horizon.from);
  const canNextWeek = parseIsoDate(weekStartIso) < startOfWeekMonday(horizon.to);

  const months = useMemo(() => monthsInHorizon(horizon.from, horizon.to), [horizon.from, horizon.to]);
  const weekPlanned = weekDays.filter((day) => isPlannedSessionKind(day.kind) && !day.isOptional);
  const weekDone = weekPlanned.filter((day) => day.completed).length;
  const movingDay = movingId ? (range?.days.find((day) => day.plan?.id === movingId) ?? null) : null;

  function closeSheets() {
    setSheet(null);
    setPendingWorkout(null);
    setPickDayReason(null);
  }

  async function runAction(work: () => Promise<unknown>, failTitle: string): Promise<boolean> {
    setBusy(true);
    try {
      await work();
      await reload();
      closeSheets();
      return true;
    } catch (error) {
      showDialog(failTitle, describePlannerError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openDay(day: PlannerDayView, from?: AnchorHandle | null) {
    if (movingId) {
      void runAction(
        () => movePlannedSession(movingId, day.iso, movingDay?.plan ?? null),
        'Couldn’t move it'
      ).then((ok) => {
        if (ok) setMovingId(null);
      });
      return;
    }
    setSelectedDay(day);
    setMenuSource('day');
    if (from) {
      measureAnchor(from, (rect) => {
        setAnchor(rect);
        setSheet('day');
      });
      return;
    }
    setSheet('day');
  }

  async function openWorkouts() {
    setBusy(true);
    try {
      const list = await fetchCustomWorkouts();
      setWorkouts(list);
      setSheet('workouts');
    } catch (error) {
      showDialog('Couldn’t load your workouts', describePlannerError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddWorkout(workout: CustomWorkout) {
    if (menuSource === 'day' && selectedDay) {
      await runAction(() => addCustomWorkoutToPlanner(workout.id, selectedDay.iso), 'Couldn’t add it');
      return;
    }
    setPendingWorkout(workout);
    setPickDayReason('workout');
    setSheet('pick-day');
  }

  async function handleRest() {
    if (!selectedDay) return;
    await runAction(() => setRestDay(selectedDay.iso), 'Couldn’t mark rest');
  }

  async function handlePickDay(iso: string) {
    if (pickDayReason === 'rest') {
      await runAction(() => setRestDay(iso), 'Couldn’t mark rest');
      return;
    }
    if (pendingWorkout) {
      await runAction(() => addCustomWorkoutToPlanner(pendingWorkout.id, iso), 'Couldn’t add it');
    }
  }

  async function handleClear() {
    if (!selectedDay) return;
    await runAction(() => clearPlannerDay(selectedDay.iso), 'Couldn’t update that day');
  }

  async function handleSkip() {
    if (!selectedDay?.plan) return;
    await runAction(() => skipPlannedSession(selectedDay.plan!), 'Couldn’t skip that session');
  }

  function startMove() {
    if (!selectedDay?.plan) return;
    setMovingId(selectedDay.plan.id);
    closeSheets();
  }

  function openReminderTime(day: PlannerDayView, from?: AnchorHandle | null) {
    if (!day.plan || day.plan.status !== 'planned') return;
    setSelectedDay(day);
    setMenuSource('day');
    if (from) {
      measureAnchor(from, (rect) => {
        setAnchor(rect);
        setSheet('reminder-time');
      });
      return;
    }
    setSheet('reminder-time');
  }

  async function handleReminderTime(time: string) {
    if (!selectedDay?.plan) return;
    await runAction(() => setPlannedReminderTime(selectedDay.plan!.id, time), 'Couldn’t save that time');
  }

  function reminderChoices(day: PlannerDayView): string[] {
    const choices = REMINDER_HOURS.map((hour) => hourToReminderTime(hour));
    if (lastSessionTime && !choices.includes(lastSessionTime)) choices.push(lastSessionTime);
    choices.sort();
    const current = reminderPrefs ? reminderTimeForDay(day, reminderPrefs) : DEFAULT_REMINDER_TIME;
    if (!choices.includes(current)) choices.push(current);
    return choices;
  }

  function handleAddPress() {
    setMenuSource('fab');
    setPendingWorkout(null);
    setPickDayReason(null);
    measureAnchor(fabRef.current, (rect) => {
      setAnchor(rect);
      setSheet('fab');
    });
  }

  async function startFabAddWorkout() {
    setPickDayReason('workout');
    await openWorkouts();
  }

  function startFabRest() {
    setPendingWorkout(null);
    setPickDayReason('rest');
    setSheet('pick-day');
  }

  async function handleOpen(day: PlannerDayView) {
    if (!ensureSubscribed()) return;
    if (!day.plan) return;
    closeSheets();

    if (day.plan.routine_day_id && day.kind !== 'cardio') {
      if (!range?.enrolment) {
        showDialog('Start this from Home', 'Open Home to begin this routine session.');
        return;
      }
      setBusy(true);
      try {
        if (day.kind === 'recovery' || day.isStretch) {
          await openStretchDayFromPlan(day.plan.routine_day_id, day.title ?? 'Recovery', workout.publish);
        } else {
          await openRoutineLogger({
            enrolmentId: range.enrolment.id,
            routineDayId: day.plan.routine_day_id,
          });
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (day.kind === 'cardio' && day.plan.cardio_slug) {
      setBusy(true);
      try {
        await openCardioFromPlan(day.plan.cardio_slug, workout.publish);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (day.kind === 'recovery' && day.plan.stretch_slug) {
      setBusy(true);
      try {
        await openRecoveryFromPlan(day.plan.stretch_slug, workout.publish);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!day.plan.custom_workout_id) return;

    setBusy(true);
    try {
      const allowed = await confirmFirstSessionSafety();
      if (!allowed) return;
      const active = await fetchActiveSession();
      if (active) {
        showDialog(
          'You already have a session going',
          'Finish or discard it first, then start this workout.',
          [
            {
              text: 'Open it',
              onPress: () => router.push({ pathname: '/session/[id]', params: { id: active.id } }),
            },
            { text: 'OK', style: 'cancel' },
          ]
        );
        return;
      }
      const session = await startCustomSession(day.plan.custom_workout_id);
      router.push({ pathname: '/session/[id]', params: { id: session.id } });
    } catch (error) {
      showDialog('Couldn’t start the workout', describePlannerError(error));
    } finally {
      setBusy(false);
    }
  }

  function scrollAgendaToToday() {
    const index = agendaSections.findIndex((section) => section.day.isToday);
    if (index < 0) return;
    agendaRef.current?.scrollToLocation({
      sectionIndex: index,
      itemIndex: 0,
      viewPosition: 0,
      animated: false,
    });
  }

  function scrollToIso(iso: string) {
    const index = agendaSections.findIndex((section) => section.iso === iso);
    if (index < 0) return;
    agendaRef.current?.scrollToLocation({
      sectionIndex: index,
      itemIndex: 0,
      viewPosition: 0,
      animated: true,
    });
  }

  function shiftWeek(delta: number) {
    const next = addDays(parseIsoDate(weekStartIso), delta * 7);
    const min = startOfWeekMonday(horizon.from);
    const max = startOfWeekMonday(horizon.to);
    if (next < min || next > max) return;
    const iso = toIso(next);
    setWeekStartIso(iso);
    const weekEnd = toIso(addDays(next, 6));
    const target = agendaSections.find((section) => section.iso >= iso && section.iso <= weekEnd);
    if (viewMode === 'agenda' && target) scrollToIso(target.iso);
  }

  function handleStripDay(day: PlannerDayView) {
    if (viewMode === 'month') {
      setSelectedDay(day);
      return;
    }
    scrollToIso(day.iso);
  }

  if (loadState !== 'ready' || !range) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <>
            <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>{errorMessage}</AppText>
            <PrimaryButton
              label="Try again"
              onPress={() => {
                setLoadState('loading');
                setAttempt((count) => count + 1);
              }}
              style={{ marginTop: spacing.md, alignSelf: 'stretch' }}
            />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <View style={[styles.top, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <TabAvatar />
        <AppText variant="title1" style={{ color: colours.ink, flex: 1 }}>Planner</AppText>
        <IconButton
          icon={viewMode === 'agenda' ? 'calendar-outline' : 'list-outline'}
          variant="muted"
          accessibilityLabel={viewMode === 'agenda' ? 'Show monthly calendar' : 'Show list'}
          onPress={() => setViewMode((mode) => (mode === 'agenda' ? 'month' : 'agenda'))}
        />
      </View>

      <View style={styles.strip}>
        <IconButton
          icon="chevron-back"
          accessibilityLabel="Previous week"
          disabled={!canPrevWeek}
          onPress={() => shiftWeek(-1)}
        />
        {stripDays.map((day, index) => {
          const letter = WEEKDAY_LETTERS[index];
          const planned = day ? isPlannedSessionKind(day.kind) : false;
          const selected = day?.iso === (selectedDay?.iso ?? todayIso);
          return (
            <Pressable
              key={letter + String(index)}
              onPress={() => day && handleStripDay(day)}
              disabled={!day}
              style={styles.stripDay}
              accessibilityRole="button"
              accessibilityLabel={day ? `${day.weekday} ${day.dayNumber}` : letter}>
              <AppText variant="caption" style={{ color: colours.inkMuted }}>{letter}</AppText>
              <View
                style={[
                  styles.stripCircle,
                  { borderRadius: radius.full },
                  day?.isToday && { backgroundColor: colours.ink },
                  selected && !day?.isToday && { borderWidth: 1.5, borderColor: colours.brand },
                ]}>
                <AppText
                  variant="bodySm"
                  style={[
                    { color: day?.isToday ? colours.onBrand : colours.ink },
                    day?.isPast && !day.isToday && { color: colours.inkMuted },
                  ]}>
                  {day?.dayNumber ?? ''}
                </AppText>
              </View>
              <View
                style={[
                  styles.stripDot,
                  { backgroundColor: planned ? colours.accent : 'transparent' },
                ]}
              />
            </Pressable>
          );
        })}
        <IconButton
          icon="chevron-forward"
          accessibilityLabel="Next week"
          disabled={!canNextWeek}
          onPress={() => shiftWeek(1)}
        />
      </View>

      {movingDay ? (
        <View
          style={[
            styles.moveBanner,
            { backgroundColor: colours.brandSoft, borderRadius: radius.lg },
          ]}>
          <AppText variant="bodySm" style={{ color: colours.ink, flex: 1 }}>
            Tap a day to move {movingDay.title ?? 'this session'}.
          </AppText>
          <TextButton label="Cancel" onPress={() => setMovingId(null)} />
        </View>
      ) : (
        <>
          {weekPlanned.length > 0 ? (
            <AppText variant="caption" style={{ color: colours.inkMuted, paddingHorizontal: 20, paddingBottom: 8 }}>
              This week: {weekDone} of {weekPlanned.length} {weekPlanned.length === 1 ? 'workout' : 'workouts'}
            </AppText>
          ) : null}
        </>
      )}

      {viewMode === 'agenda' ? (
        <SectionList
          ref={agendaRef}
          sections={agendaSections}
          keyExtractor={(day) => day.iso}
          style={styles.agenda}
          stickySectionHeadersEnabled={true}
          onLayout={() => {
            if (!didScrollToToday) {
              setDidScrollToToday(true);
              requestAnimationFrame(scrollAgendaToToday);
            }
          }}
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 88 }}
          renderSectionHeader={({ section }) => (
            <DaySectionHeader
              day={section.day}
              onAdd={
                section.day.kind === 'empty'
                  ? (from) => openDay(section.day, from)
                  : undefined
              }
            />
          )}
          renderItem={({ item }) =>
            item.kind === 'empty' ? (
              <View />
            ) : (
              <AgendaDay
                day={item}
                moving={movingId !== null && item.plan?.id === movingId}
                reminderLabel={
                  reminderPrefs?.sessionReminders &&
                  item.plan?.status === 'planned' &&
                  !item.completed &&
                  isPlannedSessionKind(item.kind)
                    ? formatReminderClock(reminderTimeForDay(item, reminderPrefs))
                    : null
                }
                onPress={(from) => openDay(item, from)}
                onReminderPress={(from) => openReminderTime(item, from)}
                disabled={busy}
              />
            )
          }
          ListFooterComponent={
            <View style={styles.footer}>
              {!range.enrolment ? (
                <TextButton label="Browse routines" onPress={() => router.push('/programmes' as Href)} />
              ) : null}
              <TextButton label="My workouts" onPress={() => router.push('/workouts' as Href)} />
            </View>
          }
        />
      ) : (
        <ScrollView style={styles.agenda} contentContainerStyle={{ paddingBottom: tabBarHeight + 88 }}>
          <View style={styles.weekdayRow}>
            {CALENDAR_WEEKDAYS.map((label) => (
              <AppText key={label} variant="eyebrow" style={[styles.weekdayLabel, { color: colours.inkMuted }]}>
                {label}
              </AppText>
            ))}
          </View>
          {months.map((month) => (
            <MonthBlock
              key={`${month.year}-${month.month}`}
              label={month.label}
              year={month.year}
              month={month.month}
              daysByIso={daysByIso}
              selectedIso={selectedDay?.iso ?? todayIso}
              movingId={movingId}
              onPressDay={(iso, from) => {
                const day = daysByIso.get(iso);
                if (day) openDay(day, from);
              }}
            />
          ))}
        </ScrollView>
      )}

      <Pressable
        ref={fabRef}
        collapsable={false}
        onPress={handleAddPress}
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: tabBarHeight + 16,
            backgroundColor: colours.ink,
            borderRadius: radius.full,
          },
          shadow,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add to the planner">
        <Ionicons name="add" size={28} color={colours.onBrand} />
      </Pressable>

      <OverflowMenu visible={sheet !== null} anchor={anchor} onClose={closeSheets}>
        {sheet === 'fab' ? (
          <>
            <MenuHeader label="Add to your planner" detail="Pick what to add, then choose a day." />
            <MenuRow label="Add a custom workout" onPress={() => void startFabAddWorkout()} />
            <MenuRow label="Mark a rest day" onPress={startFabRest} />
            <MenuRow
              label="My workouts"
              onPress={() => {
                closeSheets();
                router.push('/workouts' as Href);
              }}
            />
          </>
        ) : null}

        {sheet === 'day' && selectedDay ? (
          <>
            <MenuHeader
              label={formatAgendaHeading(selectedDay)}
              detail={selectedDay.title ?? 'Nothing planned yet'}
            />
            {selectedDay.kind !== 'empty' && selectedDay.kind !== 'rest' && (
              <MenuRow label="Open session" onPress={() => handleOpen(selectedDay)} />
            )}
            {selectedDay.plan && selectedDay.kind !== 'rest' && (
              <MenuRow label="Move to another day" onPress={startMove} />
            )}
            {selectedDay.isOptional && selectedDay.plan?.status === 'planned' ? (
              <MenuRow label={weekRingCopy.skip} onPress={() => void handleSkip()} />
            ) : null}
            {selectedDay.plan?.status === 'planned' && isPlannedSessionKind(selectedDay.kind) ? (
              <MenuRow
                label={
                  reminderPrefs
                    ? `Reminder · ${formatReminderClock(reminderTimeForDay(selectedDay, reminderPrefs))}`
                    : 'Reminder time'
                }
                onPress={() => openReminderTime(selectedDay)}
              />
            ) : null}
            <MenuRow label="Add a custom workout" onPress={openWorkouts} />
            {selectedDay.kind !== 'rest' ? (
              <MenuRow label="Mark rest day" onPress={handleRest} />
            ) : (
              <MenuRow label="Clear rest day" onPress={handleClear} />
            )}
            {selectedDay.plan && selectedDay.plan.status === 'planned' && (
              <MenuRow label="Remove from this day" danger onPress={handleClear} />
            )}
          </>
        ) : null}

        {sheet === 'workouts' ? (
          <>
            <MenuHeader
              label="Add a workout"
              detail={
                selectedDay
                  ? `This replaces anything already planned on ${selectedDay.weekday}.`
                  : 'Then pick which day to put it on.'
              }
            />
            {workouts.length === 0 ? (
              <MenuHeader label="Save a workout first from My workouts, then add it here." />
            ) : (
              workouts.map((workout) => (
                <MenuRow
                  key={workout.id}
                  label={workout.is_starter ? `${workout.name} · starter` : workout.name}
                  onPress={() => handleAddWorkout(workout)}
                />
              ))
            )}
          </>
        ) : null}

        {sheet === 'reminder-time' && selectedDay?.plan ? (
          <>
            <MenuHeader
              label="Reminder time"
              detail={`${selectedDay.title ?? 'This session'} · ${formatAgendaHeading(selectedDay)}`}
            />
            {lastSessionTime ? (
              <MenuRow
                label={`Last session · ${formatReminderClock(lastSessionTime)}`}
                selected={
                  reminderPrefs
                    ? reminderTimeForDay(selectedDay, reminderPrefs) === lastSessionTime
                    : false
                }
                onPress={() => void handleReminderTime(lastSessionTime)}
              />
            ) : null}
            {reminderChoices(selectedDay)
              .filter((time) => time !== lastSessionTime)
              .map((time) => (
                <MenuRow
                  key={time}
                  label={formatReminderClock(time)}
                  selected={
                    reminderPrefs ? reminderTimeForDay(selectedDay, reminderPrefs) === time : false
                  }
                  onPress={() => void handleReminderTime(time)}
                />
              ))}
          </>
        ) : null}

        {sheet === 'pick-day' ? (
          <>
            <MenuHeader
              label={pickDayReason === 'rest' ? 'Mark a rest day' : 'Pick a day'}
              detail={
                pendingWorkout
                  ? `Add ${pendingWorkout.name} to one of the next two weeks.`
                  : 'Choose a day in the next two weeks.'
              }
            />
            {upcomingPlannerDays().map((day) => (
              <MenuRow
                key={day.iso}
                label={day.isToday ? `${day.label} · today` : day.label}
                onPress={() => void handlePickDay(day.iso)}
              />
            ))}
          </>
        ) : null}
      </OverflowMenu>
    </View>
  );
}

function DaySectionHeader({
  day,
  onAdd,
}: {
  day: PlannerDayView;
  onAdd?: (from: AnchorHandle | null) => void;
}) {
  const headerRef = useRef<AnchorHandle>(null);
  return (
    <View ref={headerRef} collapsable={false}>
      <StickyDayHeader
        title={formatStickyDayHeading(day)}
        today={day.isToday}
        onAdd={onAdd ? () => onAdd(headerRef.current) : undefined}
      />
    </View>
  );
}

function AgendaDay({
  day,
  moving,
  reminderLabel,
  onPress,
  onReminderPress,
  disabled,
}: {
  day: PlannerDayView;
  moving: boolean;
  reminderLabel: string | null;
  onPress: (from: AnchorHandle | null) => void;
  onReminderPress: (from: AnchorHandle | null) => void;
  disabled: boolean;
}) {
  const { colours, radius } = useTheme();
  const rowRef = useRef<AnchorHandle>(null);
  const chipRef = useRef<AnchorHandle>(null);
  const quiet = day.kind === 'rest';
  const optional = day.isOptional && !quiet;
  const eyebrow =
    day.kind === 'cardio'
      ? weekRingCopy.eyebrow_cardio
      : day.kind === 'recovery'
        ? weekRingCopy.eyebrow_recovery
        : day.kind === 'routine'
          ? weekRingCopy.eyebrow_strength
          : day.kind === 'custom'
            ? 'Custom'
            : undefined;
  const eyebrowColor =
    day.kind === 'cardio'
      ? SESSION_TYPE_COLOURS.cardio
      : day.kind === 'recovery'
        ? SESSION_TYPE_COLOURS.recovery
        : undefined;

  return (
    <Pressable
      ref={rowRef}
      collapsable={false}
      onPress={() => onPress(rowRef.current)}
      disabled={disabled}
      style={({ pressed }) => [
        quiet ? styles.quietRow : styles.sessionRow,
        {
          backgroundColor: moving
            ? colours.brandSoft
            : quiet
              ? colours.bg
              : optional
                ? colours.surfaceMuted
                : colours.surface,
        },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${formatAgendaHeading(day)}. ${day.title ?? (day.kind === 'rest' ? 'Rest day' : 'Nothing planned')}`}>
      {quiet ? (
        <AppText variant="bodySm" style={{ color: colours.inkMuted }}>Rest day</AppText>
      ) : (
        <ListRow
          eyebrow={eyebrow}
          eyebrowColor={eyebrowColor}
          title={day.title ?? 'Session'}
          subtitle={day.subtitle ?? undefined}
          showChevron
          style={{ backgroundColor: 'transparent' }}
          left={
            <View
              style={[
                styles.tick,
                {
                  borderColor: day.completed ? colours.success : colours.border,
                  backgroundColor: day.completed ? colours.success : colours.surface,
                  borderRadius: radius.full,
                },
              ]}>
              {day.completed ? <Ionicons name="checkmark" size={14} color={colours.onBrand} /> : null}
            </View>
          }
          right={
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              {day.isOptional ? (
                <View
                  style={{
                    backgroundColor: colours.surfaceMuted,
                    borderRadius: radius.full,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}>
                  <AppText variant="caption" style={{ color: colours.inkMuted }}>
                    {weekRingCopy.optional}
                  </AppText>
                </View>
              ) : null}
              {reminderLabel ? (
                <View ref={chipRef} collapsable={false}>
                  <ReminderTimeChip
                    timeLabel={reminderLabel}
                    onPress={() => onReminderPress(chipRef.current)}
                  />
                </View>
              ) : null}
            </View>
          }
        />
      )}
    </Pressable>
  );
}

function MonthBlock({
  label,
  year,
  month,
  daysByIso,
  selectedIso,
  movingId,
  onPressDay,
}: {
  label: string;
  year: number;
  month: number;
  daysByIso: Map<string, PlannerDayView>;
  selectedIso: string;
  movingId: string | null;
  onPressDay: (iso: string, from: AnchorHandle | null) => void;
}) {
  const { colours } = useTheme();
  const first = startOfMonth(new Date(year, month, 1));
  const lead = (first.getDay() + 6) % 7;
  const lastDate = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: lastDate }, (_, index) => toIso(new Date(year, month, index + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={styles.monthBlock}>
      <AppText variant="title1" style={{ color: colours.ink, marginBottom: 12 }}>{label}</AppText>
      <View style={styles.monthGrid}>
        {cells.map((iso, index) => {
          if (!iso) {
            return <View key={`empty-${index}`} style={styles.monthCell} />;
          }
          const day = daysByIso.get(iso);
          const isToday = day?.isToday ?? false;
          const isSelected = iso === selectedIso;
          const hasWorkout = day ? isPlannedSessionKind(day.kind) : false;
          const isMoving = movingId !== null && day?.plan?.id === movingId;
          return (
            <MonthCell
              key={iso}
              iso={iso}
              day={day}
              isToday={isToday}
              isSelected={isSelected}
              hasWorkout={hasWorkout}
              isMoving={isMoving}
              onPressDay={onPressDay}
            />
          );
        })}
      </View>
    </View>
  );
}

function MonthCell({
  iso,
  day,
  isToday,
  isSelected,
  hasWorkout,
  isMoving,
  onPressDay,
}: {
  iso: string;
  day: PlannerDayView | undefined;
  isToday: boolean;
  isSelected: boolean;
  hasWorkout: boolean;
  isMoving: boolean;
  onPressDay: (iso: string, from: AnchorHandle | null) => void;
}) {
  const { colours, radius } = useTheme();
  const cellRef = useRef<AnchorHandle>(null);
  return (
    <Pressable
      ref={cellRef}
      collapsable={false}
      onPress={() => onPressDay(iso, cellRef.current)}
      style={styles.monthCell}
      accessibilityRole="button"
      accessibilityLabel={`${day?.weekday ?? ''} ${day?.dayNumber ?? ''}${hasWorkout ? ', session planned' : ''}`}>
      <View
        style={[
          styles.dateBubble,
          { borderRadius: radius.full },
          isToday && { backgroundColor: colours.ink },
          (isSelected && !isToday) || isMoving
            ? { borderWidth: 1.5, borderColor: colours.brand }
            : null,
        ]}>
        <AppText
          variant="bodySm"
          style={[
            { color: isToday ? colours.onBrand : colours.ink },
            day?.isPast && !isToday && { color: colours.inkMuted },
          ]}>
          {day?.dayNumber ?? Number(iso.slice(8))}
        </AppText>
      </View>
      <View
        style={[styles.dot, { backgroundColor: hasWorkout ? colours.accent : 'transparent' }]}
      />
    </Pressable>
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
    padding: 32,
    gap: 12,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 12,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  stripDay: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  stripCircle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  agenda: {
    flex: 1,
  },
  moveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quietRow: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  sessionRow: {
    backgroundColor: 'transparent',
  },
  tick: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  monthBlock: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCell: {
    width: '14.285%',
    alignItems: 'center',
    paddingVertical: 6,
    minHeight: 56,
  },
  dateBubble: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 8,
    alignItems: 'flex-start',
  },
  pressed: {
    opacity: 0.8,
  },
});
