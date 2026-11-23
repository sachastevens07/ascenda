import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import {
  AppText,
  IconButton,
  MenuRow,
  OverflowMenu,
  PhotoFill,
  PrimaryButton,
  ProgressRing,
  TextButton,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { presentFuelSheet } from '@/components/ui/Food';
import { useTheme } from '@/constants/theme';
import {
  cardioDefFromPlan,
  cardioPlanFromSession,
  cardioSession,
  cardioSlugFromSession,
  describeCardioError,
  effortLabel,
  finishCardioSession,
  formatSegmentSeconds,
  formatSettings,
  machineLabel,
  type CardioMachineId,
  type CardioSessionDef,
  type CardioSettings,
} from '@/lib/cardio';
import { machineImageSlug } from '@/lib/cardioBuilderContent';
import { fetchCustomWorkout } from '@/lib/customWorkouts';
import { cardioCopy, fillCopy, machineCopy } from '@/lib/copy';
import { pickFuelSuggestion } from '@/lib/foodSuggestions';
import { machineGuide } from '@/lib/machineGuides';
import { useSubscriptionGate } from '@/lib/paywall';
import { maybeAskSessionReminders, syncPlannerReminders } from '@/lib/reminders';
import { discardSession, fetchSession } from '@/lib/sessions';
import { formatClock } from '@/lib/workoutLog';
import { useNow, useWorkout } from '@/lib/workout';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

const RING_SIZE = 176;

function midpoint(value: [number, number] | number | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return Math.round(((value[0] + value[1]) / 2) * 10) / 10;
}

function addSpeedValues(target: number[], value: [number, number] | number | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    target.push(value);
    return;
  }
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === 'number' && Number.isFinite(item)) target.push(item);
  }
}

function speedBounds(def: CardioSessionDef): [number, number] | null {
  const values: number[] = [];
  addSpeedValues(values, def.settings.speed_kmh);
  for (const interval of def.intervals) addSpeedValues(values, interval.settings.speed_kmh);
  if (!values.length) return null;
  return [Math.round(Math.min(...values) * 10) / 10, Math.round(Math.max(...values) * 10) / 10];
}

function settingsFrom(def: CardioSessionDef): Record<string, number | string> {
  const used: Record<string, number | string> = {};
  const source = def.settings;
  const speed = speedBounds(def);
  const incline = midpoint(source.incline_percent);
  const cadence = midpoint(source.cadence_rpm);
  const level = midpoint(source.level);
  if (speed) {
    used.speed_kmh_min = speed[0];
    used.speed_kmh_max = speed[1];
  }
  if (incline != null) used.incline_percent = incline;
  if (cadence != null) used.cadence_rpm = cadence;
  if (level != null) used.level = level;
  return used;
}

function goHome() {
  router.dismissTo('/' as Href);
}

export default function CardioPlayScreen() {
  const allowed = useSubscriptionGate();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const insets = useSafeAreaInsets();
  const { colours, spacing, radius } = useTheme();
  const workout = useWorkout();
  const menuRef = useRef<AnchorHandle>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [def, setDef] = useState<CardioSessionDef | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(true);
  const [endsAt, setEndsAt] = useState(Date.now());
  const [logOpen, setLogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const now = useNow(running && loadState === 'ready' && !logOpen, 200);
  useKeepAwake();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goHome();
      return true;
    });
    return () => sub.remove();
  }, []);

  const step = def?.intervals[index] ?? null;
  const remaining = step ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  const holdDone = Boolean(step) && remaining <= 0;
  const isLast = Boolean(def) && index >= (def?.intervals.length ?? 1) - 1;
  const nextStep = def?.intervals[index + 1] ?? null;
  const elapsedSeconds = Math.max(0, Math.round((now - startedAt) / 1000));
  const ringProgress =
    !step || step.seconds <= 0 ? 1 : Math.min(1, 1 - remaining / step.seconds);

  const startHold = useCallback((seconds: number) => {
    setEndsAt(Date.now() + seconds * 1000);
    setRunning(true);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    if (!sessionId) {
      setLoadState('not-found');
      return;
    }
    let isCurrent = true;
    (async () => {
      const session = await fetchSession(sessionId);
      if (!session) {
        if (isCurrent) setLoadState('not-found');
        return;
      }
      const fromPlan = cardioPlanFromSession(session);
      let loaded = fromPlan ? cardioDefFromPlan(fromPlan) : null;
      if (!loaded && session.custom_workout_id) {
        const workout = await fetchCustomWorkout(session.custom_workout_id);
        if (workout?.cardio_plan) loaded = cardioDefFromPlan(workout.cardio_plan);
      }
      if (!loaded) loaded = cardioSession(cardioSlugFromSession(session));
      if (!loaded) {
        if (isCurrent) setLoadState('not-found');
        return;
      }
      if (!isCurrent) return;
      setDef(loaded);
      const start = Date.parse(session.started_at) || Date.now();
      setStartedAt(start);
      setIndex(0);
      setEndsAt(Date.now() + loaded.intervals[0].seconds * 1000);
      setRunning(true);
      workout.publish(
        {
          sessionId: session.id,
          dayName: loaded.name,
          startedAt: start,
          source: 'cardio',
        },
        null
      );
      setLoadState('ready');
    })().catch(() => {
      if (isCurrent) setLoadState('error');
    });
    return () => {
      isCurrent = false;
    };
  }, [allowed, sessionId, workout.publish]);

  useEffect(() => {
    if (!holdDone || !running || logOpen) return;
    Vibration.vibrate([0, 300, 200, 300]);
    setRunning(false);
    if (isLast) setLogOpen(true);
  }, [holdDone, running, logOpen, isLast]);

  function goNext() {
    const next = def?.intervals[index + 1];
    if (!next) {
      setLogOpen(true);
      return;
    }
    setIndex((current) => current + 1);
    startHold(next.seconds);
  }

  function skipInterval() {
    if (isLast) {
      setEndsAt(Date.now());
      setRunning(false);
      setLogOpen(true);
      return;
    }
    goNext();
  }

  function togglePause() {
    if (running) {
      setRunning(false);
      setEndsAt(Date.now() + remaining * 1000);
      return;
    }
    setEndsAt(Date.now() + remaining * 1000);
    setRunning(true);
  }

  function openMenu() {
    measureAnchor(menuRef.current, (rect) => {
      setMenuAnchor(rect);
      setMenuOpen(true);
    });
  }

  function confirmDiscard() {
    showDialog(cardioCopy.discard_title, cardioCopy.discard_body, [
      {
        text: cardioCopy.discard_cta,
        style: 'destructive',
        onPress: () => void discard(),
      },
      { text: cardioCopy.keep_going, style: 'cancel' },
    ]);
  }

  async function discard() {
    if (!sessionId) return;
    try {
      await discardSession(sessionId);
      workout.end();
      router.replace({ pathname: '/programmes', params: { section: 'cardio' } } as Href);
    } catch (error) {
      showDialog('Couldn’t end it', describeCardioError(error));
    }
  }

  if (!allowed || loadState !== 'ready' || !def || !step) {
    return (
      <View style={[styles.centre, { backgroundColor: colours.bg }]}>
        {loadState === 'loading' ? (
          <ActivityIndicator color={colours.brand} />
        ) : (
          <AppText variant="body" style={{ color: colours.inkMuted, textAlign: 'center' }}>
            {loadState === 'not-found' ? cardioCopy.not_found : 'Check your connection and try again.'}
          </AppText>
        )}
      </View>
    );
  }

  const currentSettings = formatSettings(step.settings);
  const sessionSettings = formatSettings(def.settings);
  const aim = currentSettings || sessionSettings;
  const stepMachine = step.machineId ?? (def.machineId === 'mixed' ? null : def.machineId);
  const machineName = machineLabel(stepMachine ?? def.machineId);
  const machinePhoto = stepMachine && stepMachine !== 'mixed' ? machineImageSlug(stepMachine) : null;
  const switchTo = nextSwitchMachine(def.intervals, index);
  const guide = machineGuide(stepMachine ?? (def.machineId === 'mixed' ? null : def.machineId));
  const primaryLabel = holdDone && !isLast ? 'Next' : running ? cardioCopy.pause : cardioCopy.resume;

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colours.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}>
      <View style={styles.topBar}>
        <IconButton
          icon="chevron-down"
          variant="muted"
          accessibilityLabel="Minimise"
          onPress={goHome}
        />
        <View ref={menuRef} collapsable={false}>
          <IconButton
            icon="ellipsis-horizontal"
            variant="muted"
            accessibilityLabel="Cardio options"
            onPress={openMenu}
          />
        </View>
      </View>

      <View style={styles.machineRow}>
        {machinePhoto ? (
          <View style={[styles.machineThumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
            <PhotoFill slug={machinePhoto} kind="equipment" label={machineName} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            {machineName}
          </AppText>
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
            {def.name}
          </AppText>
        </View>
      </View>
      {guide ? (
        <TextButton
          label={fillCopy(machineCopy.first_time, { machine: guide.name.toLowerCase() })}
          onPress={() => router.push({ pathname: '/machines/[id]', params: { id: guide.id } } as Href)}
          style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}
        />
      ) : null}

      <View style={styles.ringWrap}>
        <AppText variant="title1" style={{ color: colours.ink, textAlign: 'center' }}>
          {step.label}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4, textAlign: 'center' }}>
          {fillCopy(cardioCopy.interval_progress, {
            current: index + 1,
            total: def.intervals.length,
          })}
        </AppText>
        <IntervalTrack intervals={def.intervals} current={index} />
        <View style={styles.ringSlot}>
          <ProgressRing progress={ringProgress} size={RING_SIZE} stroke={12}>
            <AppText variant="number" style={{ color: colours.ink, fontVariant: ['tabular-nums'] }}>
              {formatClock(remaining)}
            </AppText>
          </ProgressRing>
        </View>
      </View>
      <AppText variant="bodySm" style={[styles.elapsed, { color: colours.inkMuted }]}>
        {fillCopy(cardioCopy.elapsed, { time: formatClock(elapsedSeconds) })}
      </AppText>

      <View style={[styles.settings, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
        {aim ? (
          <AppText variant="body" style={{ color: colours.ink }}>
            {fillCopy(cardioCopy.aim_for, { settings: aim })}
          </AppText>
        ) : null}
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: aim ? 6 : 0 }}>
          {fillCopy(cardioCopy.should_feel, {
            effort: String(step.effort),
            label: effortLabel(step.effort),
          })}
        </AppText>
        {step.cue ? (
          <AppText variant="bodySm" style={{ color: colours.ink, marginTop: 6 }}>
            {step.cue}
          </AppText>
        ) : null}
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label={primaryLabel}
          onPress={() => {
            if (holdDone && !isLast) {
              goNext();
              return;
            }
            togglePause();
          }}
          disabled={isSaving}
        />
        <TextButton
          label={cardioCopy.skip_interval}
          onPress={skipInterval}
          disabled={isSaving}
          style={{ alignSelf: 'center' }}
        />
        {switchTo ? (
          <AppText variant="bodySm" style={{ color: colours.inkMuted, textAlign: 'center', marginTop: spacing.sm }}>
            {fillCopy(cardioCopy.next_interval_machine, { machine: machineLabel(switchTo) })}
          </AppText>
        ) : nextStep ? (
          <AppText variant="bodySm" style={{ color: colours.inkMuted, textAlign: 'center', marginTop: spacing.sm }}>
            {fillCopy(cardioCopy.next_interval, {
              label: nextStep.label,
              time: formatSegmentSeconds(nextStep.seconds),
            })}
          </AppText>
        ) : (
          <AppText variant="bodySm" style={{ color: colours.inkMuted, textAlign: 'center', marginTop: spacing.sm }}>
            {cardioCopy.last_interval}
          </AppText>
        )}
      </View>

      <OverflowMenu visible={menuOpen} anchor={menuAnchor} onClose={() => setMenuOpen(false)}>
        <MenuRow
          label={cardioCopy.end_session}
          onPress={() => {
            setMenuOpen(false);
            setRunning(false);
            setLogOpen(true);
          }}
        />
        <MenuRow
          label={cardioCopy.discard_cta}
          danger
          onPress={() => {
            setMenuOpen(false);
            confirmDiscard();
          }}
        />
      </OverflowMenu>

      <FinishLog
        visible={logOpen}
        def={def}
        elapsedMinutes={Math.max(1, Math.round(elapsedSeconds / 60))}
        saving={isSaving}
        onClose={() => {
          setLogOpen(false);
          if (holdDone && isLast) setRunning(false);
        }}
        onDiscard={confirmDiscard}
        onSave={async (input) => {
          if (!sessionId || isSaving) return;
          setIsSaving(true);
          try {
            const session = await fetchSession(sessionId);
            if (!session) throw new Error(cardioCopy.not_found);
            await finishCardioSession(session, def, input);
            workout.end();
            const fuel = pickFuelSuggestion({
              moment: 'after',
              sessionType: 'cardio',
              dayName: null,
              reminderTime: null,
            });
            const savedBody = fillCopy(cardioCopy.saved_body, { minutes: String(input.minutes) });
            if (fuel) {
              presentFuelSheet({
                title: cardioCopy.saved_title,
                message: savedBody,
                suggestion: fuel,
              });
            } else {
              showDialog(cardioCopy.saved_title, savedBody);
            }
            router.replace({ pathname: '/programmes', params: { section: 'cardio' } } as Href);
            void maybeAskSessionReminders();
            void syncPlannerReminders();
          } catch (error) {
            showDialog('Couldn’t save it', describeCardioError(error));
          } finally {
            setIsSaving(false);
          }
        }}
      />
    </View>
  );
}

function nextSwitchMachine(
  intervals: { machineId: CardioMachineId | null; label?: string }[],
  index: number
): CardioMachineId | null {
  const current = intervals[index]?.machineId;
  const next = intervals[index + 1];
  if (!current || current === 'mixed' || !next) return null;
  if (next.machineId && next.machineId !== 'mixed' && next.machineId !== current) return next.machineId;
  const after = intervals[index + 2];
  if (after?.machineId && after.machineId !== 'mixed' && after.machineId !== current) return after.machineId;
  return null;
}

function IntervalTrack({
  intervals,
  current,
}: {
  intervals: { label: string; effort: number }[];
  current: number;
}) {
  const { colours, radius } = useTheme();
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={fillCopy(cardioCopy.interval_progress, {
        current: current + 1,
        total: intervals.length,
      })}>
      {intervals.map((item, index) => {
        const on = index === current;
        const done = index < current;
        return (
          <View
            key={`${item.label}-${index}`}
            style={{
              flex: on ? 1.6 : 1,
              height: 8 + Math.round((item.effort / 10) * 20),
              borderRadius: radius.full,
              backgroundColor: on ? colours.brand : done ? colours.brandSoft : colours.surfaceMuted,
              alignSelf: 'flex-end',
            }}
          />
        );
      })}
    </View>
  );
}

function FinishLog({
  visible,
  def,
  elapsedMinutes,
  saving,
  onClose,
  onDiscard,
  onSave,
}: {
  visible: boolean;
  def: CardioSessionDef;
  elapsedMinutes: number;
  saving: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onSave: (input: {
    minutes: number;
    effort: number | null;
    settingsUsed: Record<string, number | string>;
    distanceKm: number | null;
    calories: number | null;
    notes: string | null;
  }) => Promise<void>;
}) {
  const { colours, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [effort, setEffort] = useState(Math.round((def.effortTarget[0] + def.effortTarget[1]) / 2));
  const [settings, setSettings] = useState(() => settingsFrom(def));
  const [distance, setDistance] = useState('');
  const [calories, setCalories] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!visible) return;
    setEffort(Math.round((def.effortTarget[0] + def.effortTarget[1]) / 2));
    setSettings(settingsFrom(def));
    setDistance('');
    setCalories('');
    setNotes('');
  }, [visible, def]);

  function bump(key: string, delta: number, min: number, max: number, step = 0.5) {
    setSettings((current) => {
      const raw = Number(current[key] ?? min);
      const next = Math.min(max, Math.max(min, Math.round((raw + delta) * 10) / 10));
      return { ...current, [key]: step === 1 ? Math.round(next) : next };
    });
  }

  function bumpSpeed(end: 'min' | 'max', delta: number) {
    setSettings((current) => {
      let low = Number(current.speed_kmh_min ?? 4);
      let high = Number(current.speed_kmh_max ?? low);
      const next = Math.min(20, Math.max(1, Math.round(((end === 'min' ? low : high) + delta) * 10) / 10));
      if (end === 'min') {
        low = next;
        if (low > high) high = low;
      } else {
        high = next;
        if (high < low) low = high;
      }
      return { ...current, speed_kmh_min: low, speed_kmh_max: high };
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalWrap}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colours.bg,
              paddingBottom: insets.bottom + 16,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
            },
          ]}>
          <ScrollView contentContainerStyle={{ padding: 24, gap: spacing.md }}>
            <AppText variant="title2" style={{ color: colours.ink }}>
              {cardioCopy.finish_title}
            </AppText>
            <View>
              <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                {cardioCopy.effort}
              </AppText>
              <View style={styles.effortRow}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => {
                  const selected = effort === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setEffort(value)}
                      style={[
                        styles.effortDot,
                        {
                          backgroundColor: selected ? colours.brand : colours.surfaceMuted,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Effort ${value}`}>
                      <AppText
                        variant="caption"
                        style={{ color: selected ? colours.onBrand : colours.ink }}>
                        {value}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.effortHints}>
                <AppText variant="caption" style={{ color: colours.inkMuted }}>
                  {cardioCopy.effort_hint_2}
                </AppText>
                <AppText variant="caption" style={{ color: colours.inkMuted }}>
                  {cardioCopy.effort_hint_5}
                </AppText>
                <AppText variant="caption" style={{ color: colours.inkMuted }}>
                  {cardioCopy.effort_hint_8}
                </AppText>
              </View>
              {effortLabel(effort) ? (
                <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
                  {effortLabel(effort)}
                </AppText>
              ) : null}
            </View>

            {settings.speed_kmh_min != null ||
            settings.incline_percent != null ||
            settings.cadence_rpm != null ||
            settings.level != null ? (
              <View style={{ gap: spacing.sm }}>
                <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                  {cardioCopy.settings_optional}
                </AppText>
                {settings.speed_kmh_min != null ? (
                  <>
                    <StepperRow
                      label={cardioCopy.speed_min}
                      value={Number(settings.speed_kmh_min)}
                      onMinus={() => bumpSpeed('min', -0.5)}
                      onPlus={() => bumpSpeed('min', 0.5)}
                    />
                    <StepperRow
                      label={cardioCopy.speed_max}
                      value={Number(settings.speed_kmh_max ?? settings.speed_kmh_min)}
                      onMinus={() => bumpSpeed('max', -0.5)}
                      onPlus={() => bumpSpeed('max', 0.5)}
                    />
                  </>
                ) : null}
                {settings.incline_percent != null ? (
                  <StepperRow
                    label={cardioCopy.incline}
                    value={Number(settings.incline_percent)}
                    onMinus={() => bump('incline_percent', -1, 0, 20, 1)}
                    onPlus={() => bump('incline_percent', 1, 0, 20, 1)}
                  />
                ) : null}
                {settings.cadence_rpm != null ? (
                  <StepperRow
                    label={cardioCopy.cadence}
                    value={Number(settings.cadence_rpm)}
                    onMinus={() => bump('cadence_rpm', -5, 40, 120, 1)}
                    onPlus={() => bump('cadence_rpm', 5, 40, 120, 1)}
                  />
                ) : null}
                {settings.level != null ? (
                  <StepperRow
                    label={cardioCopy.level}
                    value={Number(settings.level)}
                    onMinus={() => bump('level', -1, 1, 20, 1)}
                    onPlus={() => bump('level', 1, 1, 20, 1)}
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.fieldRow}>
              <Field
                label={cardioCopy.distance}
                value={distance}
                onChange={setDistance}
                keyboard="decimal-pad"
                compact
              />
              <Field
                label={cardioCopy.calories}
                value={calories}
                onChange={setCalories}
                keyboard="number-pad"
                compact
              />
            </View>
            <Field
              label={cardioCopy.notes}
              value={notes}
              onChange={setNotes}
              multiline
            />

            <PrimaryButton
              label={saving ? cardioCopy.saving : cardioCopy.save}
              loading={saving}
              disabled={saving}
              onPress={() => {
                const distanceKm = distance.trim() ? Number(distance.replace(',', '.')) : null;
                const cal = calories.trim() ? Number(calories) : null;
                const trimmedNotes = notes.trim();
                void onSave({
                  minutes: elapsedMinutes,
                  effort,
                  settingsUsed: settings,
                  distanceKm: distanceKm != null && Number.isFinite(distanceKm) ? distanceKm : null,
                  calories: cal != null && Number.isFinite(cal) ? Math.round(cal) : null,
                  notes: trimmedNotes || null,
                });
              }}
            />
            <TextButton label={cardioCopy.dont_save} onPress={onDiscard} style={{ alignSelf: 'center' }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function StepperRow({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: number;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <View style={styles.stepper}>
      <AppText variant="bodyStrong" style={{ color: colours.ink, flex: 1 }}>
        {label}
      </AppText>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={onMinus}
          style={[styles.stepperBtn, { backgroundColor: colours.surfaceMuted, borderRadius: radius.full }]}
          accessibilityRole="button"
          accessibilityLabel={`Fewer ${label}`}>
          <AppText variant="title3" style={{ color: colours.brand }}>
            −
          </AppText>
        </Pressable>
        <AppText variant="title3" style={{ color: colours.ink, minWidth: 48, textAlign: 'center' }}>
          {value}
        </AppText>
        <Pressable
          onPress={onPlus}
          style={[styles.stepperBtn, { backgroundColor: colours.surfaceMuted, borderRadius: radius.full }]}
          accessibilityRole="button"
          accessibilityLabel={`More ${label}`}>
          <AppText variant="title3" style={{ color: colours.brand }}>
            +
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboard,
  compact,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboard?: 'decimal-pad' | 'number-pad';
  compact?: boolean;
  multiline?: boolean;
}) {
  const { colours, radius } = useTheme();
  return (
    <View style={compact ? styles.fieldHalf : undefined}>
      <AppText variant="caption" style={{ color: colours.inkMuted, marginBottom: 6 }}>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        placeholder=""
        placeholderTextColor={colours.inkSubtle}
        accessibilityLabel={label}
        style={[
          styles.input,
          compact && styles.inputCompact,
          multiline && styles.inputNotes,
          { color: colours.ink, backgroundColor: colours.surface, borderRadius: radius.md },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  machineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  machineThumb: {
    width: 48,
    height: 48,
    overflow: 'hidden',
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    flexGrow: 1,
    flexShrink: 1,
  },
  ringSlot: {
    width: RING_SIZE,
    height: RING_SIZE,
    marginTop: 8,
    marginBottom: 20,
  },
  elapsed: {
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
    flexShrink: 0,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    width: '100%',
    height: 30,
    marginTop: 12,
    marginBottom: 16,
  },
  settings: {
    padding: 16,
    marginTop: 8,
  },
  actions: {
    marginTop: 16,
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(44, 24, 16, 0.4)',
  },
  sheet: {
    maxHeight: '92%',
  },
  effortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  effortDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  effortHints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldHalf: {
    flex: 1,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputCompact: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
  },
  inputNotes: {
    minHeight: 104,
    paddingTop: 10,
  },
});
