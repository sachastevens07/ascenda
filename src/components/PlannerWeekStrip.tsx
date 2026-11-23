import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText, IconButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { addDays, isPlannedSessionKind, parseIsoDate, toIso, type PlannerDayView } from '@/lib/planner';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const SLIDE_MS = 250;
const SLIDE = { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) };

function daysForWeek(
  weekStartIso: string,
  daysByIso: Map<string, PlannerDayView>
): (PlannerDayView | null)[] {
  const start = parseIsoDate(weekStartIso);
  return Array.from({ length: 7 }, (_, index) => daysByIso.get(toIso(addDays(start, index))) ?? null);
}

function shiftedWeek(weekStartIso: string, delta: number): string {
  return toIso(addDays(parseIsoDate(weekStartIso), delta * 7));
}

export function PlannerWeekStrip({
  weekStartIso,
  daysByIso,
  periodIsos,
  canPrev,
  canNext,
  selectedIso,
  onShiftWeek,
  onPressDay,
  onLockTabSwipe,
}: {
  weekStartIso: string;
  daysByIso: Map<string, PlannerDayView>;
  periodIsos?: Set<string>;
  canPrev: boolean;
  canNext: boolean;
  selectedIso: string;
  onShiftWeek: (delta: number) => void;
  onPressDay: (day: PlannerDayView) => void;
  onLockTabSwipe?: (locked: boolean) => void;
}) {
  const { colours, radius } = useTheme();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [shownIso, setShownIso] = useState(weekStartIso);
  const [busy, setBusy] = useState(false);
  const translateX = useSharedValue(0);
  const viewportRef = useRef<ElementRef<typeof View>>(null);
  const widthRef = useRef(0);
  const originX = useRef(0);
  const shownRef = useRef(shownIso);
  const busyRef = useRef(false);
  const canPrevRef = useRef(canPrev);
  const canNextRef = useRef(canNext);
  const startX = useRef(0);
  const onShiftRef = useRef(onShiftWeek);
  const onPressDayRef = useRef(onPressDay);
  const onLockRef = useRef(onLockTabSwipe);
  const shownDaysRef = useRef<(PlannerDayView | null)[]>([]);
  shownRef.current = shownIso;
  canPrevRef.current = canPrev;
  canNextRef.current = canNext;
  onShiftRef.current = onShiftWeek;
  onPressDayRef.current = onPressDay;
  onLockRef.current = onLockTabSwipe;

  useEffect(() => {
    if (busyRef.current) return;
    if (weekStartIso === shownRef.current) return;
    shownRef.current = weekStartIso;
    setShownIso(weekStartIso);
  }, [weekStartIso]);

  useLayoutEffect(() => {
    if (widthRef.current < 8) return;
    translateX.value = -widthRef.current;
  }, [shownIso, translateX]);

  const prevDays = useMemo(() => daysForWeek(shiftedWeek(shownIso, -1), daysByIso), [shownIso, daysByIso]);
  const shownDays = useMemo(() => daysForWeek(shownIso, daysByIso), [shownIso, daysByIso]);
  const nextDays = useMemo(() => daysForWeek(shiftedWeek(shownIso, 1), daysByIso), [shownIso, daysByIso]);
  shownDaysRef.current = shownDays;

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  function settle(delta: 1 | -1) {
    const next = shiftedWeek(shownRef.current, delta);
    shownRef.current = next;
    setShownIso(next);
    busyRef.current = false;
    setBusy(false);
    onShiftRef.current(delta);
  }

  function animateTo(dest: number, delta: 1 | -1 | 0) {
    translateX.value = withTiming(dest, SLIDE, (finished) => {
      if (!finished) return;
      if (delta === 0) {
        runOnJS(clearBusy)();
        return;
      }
      runOnJS(settle)(delta);
    });
  }

  function clearBusy() {
    busyRef.current = false;
    setBusy(false);
  }

  function shift(delta: 1 | -1) {
    if (busyRef.current) return;
    if (delta === 1 && !canNextRef.current) return;
    if (delta === -1 && !canPrevRef.current) return;
    const width = widthRef.current;
    if (width < 8) {
      settle(delta);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    animateTo(delta === 1 ? -2 * width : 0, delta);
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Capture on start so the tab pager cannot take the gesture on move.
        onStartShouldSetPanResponderCapture: () => !busyRef.current,
        onStartShouldSetPanResponder: () => !busyRef.current,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          !busyRef.current &&
          Math.abs(gesture.dx) > 8 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onMoveShouldSetPanResponder: (_, gesture) =>
          !busyRef.current &&
          Math.abs(gesture.dx) > 8 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          startX.current = translateX.value;
          viewportRef.current?.measureInWindow((x: number) => {
            originX.current = x;
          });
          onLockRef.current?.(true);
        },
        onPanResponderMove: (_, gesture) => {
          const width = widthRef.current;
          if (width < 8) return;
          const min = canNextRef.current ? -2 * width : -width;
          const max = canPrevRef.current ? 0 : -width;
          const next = startX.current + gesture.dx;
          translateX.value = Math.min(max, Math.max(min, next));
        },
        onPanResponderRelease: (event, gesture) => {
          onLockRef.current?.(false);
          const width = widthRef.current;
          if (width < 8) return;
          if (Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8) {
            const x = event.nativeEvent.pageX - originX.current;
            const index = Math.max(0, Math.min(6, Math.floor(x / (width / 7))));
            const day = shownDaysRef.current[index];
            if (day) onPressDayRef.current(day);
            return;
          }
          const x = translateX.value;
          const goNext =
            canNextRef.current && (x < -width - width * 0.22 || gesture.vx < -0.45);
          const goPrev =
            canPrevRef.current && (x > -width + width * 0.22 || gesture.vx > 0.45);
          busyRef.current = true;
          setBusy(true);
          if (goNext) animateTo(-2 * width, 1);
          else if (goPrev) animateTo(0, -1);
          else animateTo(-width, 0);
        },
        onPanResponderTerminate: () => {
          onLockRef.current?.(false);
          busyRef.current = true;
          setBusy(true);
          animateTo(-widthRef.current, 0);
        },
      }),
    [translateX]
  );

  return (
    <View style={styles.strip}>
      <IconButton
        icon="chevron-back"
        accessibilityLabel="Previous week"
        disabled={!canPrev || busy}
        onPress={() => shift(-1)}
      />
      <View
        ref={viewportRef}
        collapsable={false}
        style={styles.viewport}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          viewportRef.current?.measureInWindow((x: number) => {
            originX.current = x;
          });
          if (width <= 0 || width === widthRef.current) return;
          widthRef.current = width;
          setViewportWidth(width);
          if (!busyRef.current) translateX.value = -width;
        }}
        {...pan.panHandlers}>
        {viewportWidth > 0 ? (
          <Animated.View style={[styles.track, { width: viewportWidth * 3 }, trackStyle]}>
            <WeekDays
              width={viewportWidth}
              days={prevDays}
              weekKey={shiftedWeek(shownIso, -1)}
              selectedIso={selectedIso}
              periodIsos={periodIsos}
              colours={colours}
              radius={radius}
              onPressDay={onPressDay}
            />
            <WeekDays
              width={viewportWidth}
              days={shownDays}
              weekKey={shownIso}
              selectedIso={selectedIso}
              periodIsos={periodIsos}
              colours={colours}
              radius={radius}
              onPressDay={onPressDay}
            />
            <WeekDays
              width={viewportWidth}
              days={nextDays}
              weekKey={shiftedWeek(shownIso, 1)}
              selectedIso={selectedIso}
              periodIsos={periodIsos}
              colours={colours}
              radius={radius}
              onPressDay={onPressDay}
            />
          </Animated.View>
        ) : (
          <WeekDays
            width={undefined}
            days={shownDays}
            weekKey={shownIso}
            selectedIso={selectedIso}
            periodIsos={periodIsos}
            colours={colours}
            radius={radius}
            onPressDay={onPressDay}
          />
        )}
      </View>
      <IconButton
        icon="chevron-forward"
        accessibilityLabel="Next week"
        disabled={!canNext || busy}
        onPress={() => shift(1)}
      />
    </View>
  );
}

function WeekDays({
  width,
  days,
  weekKey,
  selectedIso,
  periodIsos,
  colours,
  radius,
  onPressDay,
}: {
  width: number | undefined;
  days: (PlannerDayView | null)[];
  weekKey: string;
  selectedIso: string;
  periodIsos?: Set<string>;
  colours: ReturnType<typeof useTheme>['colours'];
  radius: ReturnType<typeof useTheme>['radius'];
  onPressDay: (day: PlannerDayView) => void;
}) {
  return (
    <View style={[styles.week, width ? { width } : styles.weekFill]}>
      {days.map((day, index) => {
        const letter = WEEKDAY_LETTERS[index];
        const planned = day ? isPlannedSessionKind(day.kind) : false;
        const selected = day?.iso === selectedIso;
        const isPeriodDay = Boolean(day && periodIsos?.has(day.iso));
        return (
          <Pressable
            key={`${weekKey}-${letter}-${index}`}
            onPress={() => day && onPressDay(day)}
            disabled={!day}
            style={styles.stripDay}
            accessibilityRole="button"
            accessibilityLabel={
              day
                ? `${day.weekday} ${day.dayNumber}${isPeriodDay ? ', private mark' : ''}`
                : letter
            }>
            <AppText variant="caption" style={{ color: colours.inkMuted }}>
              {letter}
            </AppText>
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
            <View style={{ flexDirection: 'row', gap: 3, height: 5 }}>
              <View
                style={[styles.stripDot, { backgroundColor: planned ? colours.accent : 'transparent' }]}
              />
              {isPeriodDay ? (
                <View style={[styles.stripDot, { backgroundColor: colours.brand }]} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  track: {
    flexDirection: 'row',
  },
  week: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  weekFill: {
    flex: 1,
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
});
