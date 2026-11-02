import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { useTabBarHeight } from '@/components/PillTabBar';
import { colours } from '@/constants/theme';
import { fetchCustomWorkouts, type CustomWorkout } from '@/lib/customWorkouts';
import {
  CALENDAR_WEEKDAYS,
  addCustomWorkoutToPlanner,
  addDays,
  clearPlannerDay,
  describePlannerError,
  formatAgendaHeading,
  loadPlannerRange,
  monthsInHorizon,
  movePlannedSession,
  plannerHorizon,
  setRestDay,
  startOfMonth,
  startOfWeekMonday,
  toIso,
  type PlannerDayView,
  type PlannerRange,
} from '@/lib/planner';
import { fetchActiveSession, startCustomSession } from '@/lib/sessions';

type LoadState = 'loading' | 'error' | 'ready';
type SheetMode = 'day' | 'workouts' | null;
type ViewMode = 'agenda' | 'month';

export default function PlannerScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const agendaRef = useRef<FlatList<PlannerDayView>>(null);
  const [range, setRange] = useState<PlannerRange | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [errorMessage, setErrorMessage] = useState('We couldn’t load your planner. Check your connection and try again.');
  const [viewMode, setViewMode] = useState<ViewMode>('agenda');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<PlannerDayView | null>(null);
  const [sheet, setSheet] = useState<SheetMode>(null);
  const [workouts, setWorkouts] = useState<CustomWorkout[]>([]);
  const [busy, setBusy] = useState(false);
  const [didScrollToToday, setDidScrollToToday] = useState(false);

  const horizon = useMemo(() => plannerHorizon(), []);
  const todayIso = toIso(new Date());

  const reload = useCallback(async () => {
    const next = await loadPlannerRange(horizon.from, horizon.to);
    setRange(next);
    setLoadState('ready');
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

  const weekDays = useMemo(() => {
    const monday = toIso(startOfWeekMonday(new Date()));
    const sunday = toIso(addDays(startOfWeekMonday(new Date()), 6));
    return (range?.days ?? []).filter((day) => day.iso >= monday && day.iso <= sunday);
  }, [range]);

  const months = useMemo(() => monthsInHorizon(horizon.from, horizon.to), [horizon.from, horizon.to]);
  const weekPlanned = weekDays.filter((day) => day.kind === 'routine' || day.kind === 'custom');
  const weekDone = weekPlanned.filter((day) => day.completed).length;
  const movingDay = movingId ? (range?.days.find((day) => day.plan?.id === movingId) ?? null) : null;

  function closeSheets() {
    setSheet(null);
  }

  async function runAction(work: () => Promise<unknown>, failTitle: string): Promise<boolean> {
    setBusy(true);
    try {
      await work();
      await reload();
      setSheet(null);
      return true;
    } catch (error) {
      showDialog(failTitle, describePlannerError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openDay(day: PlannerDayView) {
    if (movingId) {
      void runAction(() => movePlannedSession(movingId, day.iso), 'Couldn’t move it').then((ok) => {
        if (ok) setMovingId(null);
      });
      return;
    }
    setSelectedDay(day);
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
    if (!selectedDay) return;
    await runAction(() => addCustomWorkoutToPlanner(workout.id, selectedDay.iso), 'Couldn’t add it');
  }

  async function handleRest() {
    if (!selectedDay) return;
    await runAction(() => setRestDay(selectedDay.iso), 'Couldn’t mark rest');
  }

  async function handleClear() {
    if (!selectedDay) return;
    await runAction(() => clearPlannerDay(selectedDay.iso), 'Couldn’t update that day');
  }

  function startMove() {
    if (!selectedDay?.plan) return;
    setMovingId(selectedDay.plan.id);
    setSheet(null);
  }

  function handleAddPress() {
    const day = selectedDay ?? daysByIso.get(todayIso) ?? agendaDays[0];
    if (!day) return;
    setSelectedDay(day);
    setSheet('day');
  }

  async function handleOpen(day: PlannerDayView) {
    if (!day.plan) return;
    setSheet(null);

    if (day.plan.routine_day_id) {
      if (!range?.enrolment) {
        showDialog('Start this from Home', 'Open Home to begin this routine session.');
        return;
      }
      router.push({
        pathname: '/routines/session',
        params: {
          routineId: range.enrolment.routine_id,
          dayId: day.plan.routine_day_id,
          enrolmentId: range.enrolment.id,
        },
      } as Href);
      return;
    }

    if (!day.plan.custom_workout_id) return;

    setBusy(true);
    try {
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
    const index = agendaDays.findIndex((day) => day.isToday);
    if (index < 0) return;
    agendaRef.current?.scrollToIndex({ index, viewPosition: 0, animated: false });
  }

  if (loadState !== 'ready' || !range) {
    return (
      <View style={styles.centre}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.accent} />
        ) : (
          <>
            <Text style={styles.message}>{errorMessage}</Text>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
              onPress={() => {
                setLoadState('loading');
                setAttempt((count) => count + 1);
              }}
              accessibilityRole="button">
              <Text style={styles.outlineButtonText}>Try again</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.top, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <Text style={styles.title}>Planner</Text>
        <Pressable
          onPress={() => setViewMode((mode) => (mode === 'agenda' ? 'month' : 'agenda'))}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={viewMode === 'agenda' ? 'Show monthly calendar' : 'Show list'}>
          <Ionicons
            name={viewMode === 'agenda' ? 'calendar-outline' : 'list-outline'}
            size={22}
            color={colours.text}
          />
        </Pressable>
      </View>

      {movingDay ? (
        <View style={styles.moveBanner}>
          <Text style={styles.moveText}>Tap a day to move {movingDay.title ?? 'this session'}.</Text>
          <Pressable
            onPress={() => setMovingId(null)}
            style={({ pressed }) => [styles.moveCancel, pressed && styles.pressed]}
            accessibilityRole="button">
            <Text style={styles.moveCancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : weekPlanned.length > 0 ? (
        <Text style={styles.progress}>
          This week: {weekDone} of {weekPlanned.length} {weekPlanned.length === 1 ? 'workout' : 'workouts'}
        </Text>
      ) : (
        <Text style={styles.lead}>
          {range.enrolment
            ? 'Scroll to see the next three months. Tap a day to add, move or rest.'
            : 'Start a routine to fill the days, or add a custom workout to any date.'}
        </Text>
      )}

      {viewMode === 'agenda' ? (
        <FlatList
          ref={agendaRef}
          data={agendaDays}
          keyExtractor={(day) => day.iso}
          onLayout={() => {
            if (!didScrollToToday) {
              setDidScrollToToday(true);
              requestAnimationFrame(scrollAgendaToToday);
            }
          }}
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 88 }}
          renderItem={({ item }) => (
            <AgendaDay
              day={item}
              moving={movingId !== null && item.plan?.id === movingId}
              onPress={() => openDay(item)}
              disabled={busy}
            />
          )}
          ListFooterComponent={
            <View style={styles.footer}>
              {!range.enrolment && (
                <Pressable
                  style={({ pressed }) => [styles.link, pressed && styles.pressed]}
                  onPress={() => router.push('/programmes' as Href)}
                  accessibilityRole="button">
                  <Text style={styles.linkText}>Browse routines</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.link, pressed && styles.pressed]}
                onPress={() => router.push('/workouts' as Href)}
                accessibilityRole="button">
                <Text style={styles.linkText}>My workouts</Text>
              </Pressable>
              <Text style={styles.disclaimer}>
                General fitness guidance, not medical advice. Stop if anything hurts.
              </Text>
            </View>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: tabBarHeight + 88 }}>
          <View style={styles.weekdayRow}>
            {CALENDAR_WEEKDAYS.map((label) => (
              <Text key={label} style={styles.weekdayLabel}>
                {label}
              </Text>
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
              onPressDay={(iso) => {
                const day = daysByIso.get(iso);
                if (day) openDay(day);
              }}
            />
          ))}
        </ScrollView>
      )}

      <Pressable
        onPress={handleAddPress}
        style={({ pressed }) => [
          styles.fab,
          { bottom: tabBarHeight + 16 },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add to a day">
        <Ionicons name="add" size={28} color={colours.surface} />
      </Pressable>

      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={closeSheets}>
        <Pressable style={styles.backdrop} onPress={closeSheets} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {sheet === 'day' && selectedDay ? (
            <>
              <Text style={styles.sheetTitle}>{formatAgendaHeading(selectedDay)}</Text>
              <Text style={styles.sheetLead}>
                {selectedDay.title ?? 'Nothing planned yet.'}
                {selectedDay.exercises.length > 0 ? ` ${selectedDay.exercises.join(', ')}.` : ''}
              </Text>
              {selectedDay.kind !== 'empty' && selectedDay.kind !== 'rest' && (
                <SheetAction label="Open session" onPress={() => handleOpen(selectedDay)} />
              )}
              {selectedDay.plan && selectedDay.kind !== 'rest' && (
                <SheetAction label="Move to another day" onPress={startMove} />
              )}
              <SheetAction label="Add a custom workout" onPress={openWorkouts} />
              {selectedDay.kind !== 'rest' ? (
                <SheetAction label="Mark rest day" onPress={handleRest} />
              ) : (
                <SheetAction label="Clear rest day" onPress={handleClear} />
              )}
              {selectedDay.plan && selectedDay.plan.status === 'planned' && (
                <SheetAction label="Remove from this day" danger onPress={handleClear} />
              )}
            </>
          ) : null}

          {sheet === 'workouts' ? (
            <>
              <Text style={styles.sheetTitle}>Add a workout</Text>
              <Text style={styles.sheetLead}>
                {selectedDay
                  ? `This replaces anything already planned on ${selectedDay.weekday}.`
                  : 'Pick a saved workout.'}
              </Text>
              <ScrollView>
                {workouts.length === 0 ? (
                  <Text style={styles.sheetLead}>
                    Save a workout first from My workouts, then add it here.
                  </Text>
                ) : (
                  workouts.map((workout) => (
                    <SheetAction
                      key={workout.id}
                      label={workout.is_starter ? `${workout.name} · starter` : workout.name}
                      onPress={() => handleAddWorkout(workout)}
                    />
                  ))
                )}
              </ScrollView>
            </>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function AgendaDay({
  day,
  moving,
  onPress,
  disabled,
}: {
  day: PlannerDayView;
  moving: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  const kicker =
    day.kind === 'routine' ? 'Routine' : day.kind === 'custom' ? 'Custom' : day.kind === 'rest' ? 'Rest' : null;

  return (
    <View>
      <View style={[styles.dayHeading, day.isToday && styles.dayHeadingToday]}>
        <Text style={[styles.dayHeadingText, day.isToday && styles.dayHeadingTextToday]}>
          {formatAgendaHeading(day)}
        </Text>
      </View>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [styles.sessionRow, moving && styles.sessionMoving, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${formatAgendaHeading(day)}. ${day.title ?? 'Add a workout'}`}>
        <View style={[styles.tick, day.completed && styles.tickDone]}>
          {day.completed ? <Ionicons name="checkmark" size={16} color={colours.surface} /> : null}
        </View>
        <View style={styles.sessionBody}>
          {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
          <Text style={[styles.sessionTitle, day.kind === 'empty' && styles.sessionEmpty]} numberOfLines={1}>
            {day.title ?? 'Add a workout'}
          </Text>
          {day.subtitle ? (
            <Text style={styles.sessionMeta} numberOfLines={1}>
              {day.subtitle}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colours.textMuted} />
      </Pressable>
    </View>
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
  onPressDay: (iso: string) => void;
}) {
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
      <Text style={styles.monthTitle}>{label}</Text>
      <View style={styles.monthGrid}>
        {cells.map((iso, index) => {
          if (!iso) {
            return <View key={`empty-${index}`} style={styles.monthCell} />;
          }
          const day = daysByIso.get(iso);
          const isToday = day?.isToday ?? false;
          const isSelected = iso === selectedIso;
          const hasWorkout = day?.kind === 'routine' || day?.kind === 'custom';
          const isMoving = movingId !== null && day?.plan?.id === movingId;
          return (
            <Pressable
              key={iso}
              onPress={() => onPressDay(iso)}
              style={styles.monthCell}
              accessibilityRole="button"
              accessibilityLabel={`${day?.weekday ?? ''} ${day?.dayNumber ?? ''}${hasWorkout ? ', session planned' : ''}`}>
              <View
                style={[
                  styles.dateBubble,
                  isToday && styles.dateBubbleToday,
                  isSelected && !isToday && styles.dateBubbleSelected,
                  isMoving && styles.dateBubbleSelected,
                ]}>
                <Text
                  style={[
                    styles.dateNumber,
                    day?.isPast && !isToday && styles.dateNumberPast,
                    isToday && styles.dateNumberToday,
                  ]}>
                  {day?.dayNumber ?? Number(iso.slice(8))}
                </Text>
              </View>
              <View style={[styles.dot, hasWorkout ? styles.dotOn : styles.dotOff]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SheetAction({
  label,
  onPress,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.sheetRow} accessibilityRole="button">
      <Text style={[styles.sheetRowText, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colours.background,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: colours.background,
  },
  message: {
    fontSize: 17,
    lineHeight: 24,
    color: colours.textMuted,
    textAlign: 'center',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: {
    fontSize: 15,
    fontWeight: '600',
    color: colours.accent,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    color: colours.textMuted,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  moveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colours.accentSoft,
  },
  moveText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: colours.text,
  },
  moveCancel: {
    minHeight: 44,
    justifyContent: 'center',
  },
  moveCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: colours.accent,
  },
  dayHeading: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: colours.background,
  },
  dayHeadingToday: {
    backgroundColor: colours.text,
  },
  dayHeadingText: {
    fontSize: 15,
    fontWeight: '700',
    color: colours.textMuted,
  },
  dayHeadingTextToday: {
    color: colours.surface,
  },
  sessionRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colours.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colours.border,
  },
  sessionMoving: {
    backgroundColor: colours.accentSoft,
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colours.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickDone: {
    borderColor: colours.accent,
    backgroundColor: colours.accent,
  },
  sessionBody: {
    flex: 1,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colours.accent,
    marginBottom: 2,
  },
  sessionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.text,
  },
  sessionEmpty: {
    fontWeight: '600',
    color: colours.textMuted,
  },
  sessionMeta: {
    fontSize: 14,
    color: colours.textMuted,
    marginTop: 2,
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colours.textMuted,
  },
  monthBlock: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  monthTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 12,
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
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBubbleToday: {
    backgroundColor: colours.text,
  },
  dateBubbleSelected: {
    borderWidth: 1.5,
    borderColor: colours.accent,
  },
  dateNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.text,
  },
  dateNumberPast: {
    color: colours.textMuted,
  },
  dateNumberToday: {
    color: colours.surface,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 4,
  },
  dotOn: {
    backgroundColor: colours.accent,
  },
  dotOff: {
    backgroundColor: 'transparent',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.text,
  },
  footer: {
    paddingTop: 16,
    paddingHorizontal: 24,
  },
  link: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
  },
  outlineButton: {
    minHeight: 52,
    alignSelf: 'stretch',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  outlineButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    textAlign: 'center',
    marginTop: 8,
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
  },
  sheetLead: {
    fontSize: 15,
    lineHeight: 22,
    color: colours.textMuted,
    marginTop: 6,
    marginBottom: 8,
  },
  sheetRow: {
    minHeight: 56,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colours.border,
  },
  sheetRowText: {
    fontSize: 17,
    color: colours.text,
  },
  dangerText: {
    color: colours.danger,
    fontWeight: '600',
  },
});
