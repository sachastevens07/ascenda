import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  PrimaryButton,
  ProgressRing,
  TextButton,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  cardioSession,
  cardioSlugFromSession,
  describeCardioError,
  effortLabel,
  finishCardioSession,
  formatEffortTarget,
  formatSegmentSeconds,
  formatSettings,
  machineLabel,
  type CardioSessionDef,
  type CardioSettings,
} from '@/lib/cardio';
import { cardioCopy, fillCopy } from '@/lib/copy';
import { useSubscriptionGate } from '@/lib/paywall';
import { maybeAskSessionReminders, syncPlannerReminders } from '@/lib/reminders';
import { discardSession, fetchSession } from '@/lib/sessions';
import { formatClock } from '@/lib/workoutLog';
import { useNow, useWorkout } from '@/lib/workout';

type LoadState = 'loading' | 'error' | 'not-found' | 'ready';

const RING_SIZE = 200;

function midpoint(value: [number, number] | number | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return Math.round(((value[0] + value[1]) / 2) * 10) / 10;
}

function settingsFrom(source: CardioSettings): Record<string, number | string> {
  const used: Record<string, number | string> = {};
  const speed = midpoint(source.speed_kmh);
  const incline = midpoint(source.incline_percent);
  const cadence = midpoint(source.cadence_rpm);
  const level = midpoint(source.level);
  if (speed != null) used.speed_kmh = speed;
  if (incline != null) used.incline_percent = incline;
  if (cadence != null) used.cadence_rpm = cadence;
  if (level != null) used.level = level;
  return used;
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
      const slug = cardioSlugFromSession(session);
      const loaded = cardioSession(slug);
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
  const machineName = machineLabel(step.machineId ?? def.machineId);
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
          onPress={() => router.back()}
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

      <AppText variant="eyebrow" style={{ color: colours.accent }}>
        {machineName}
      </AppText>
      <AppText variant="title1" style={{ color: colours.ink, marginTop: spacing.xs }}>
        {def.name}
      </AppText>
      <TextButton
        label={fillCopy(cardioCopy.first_time, { machine: machineName.toLowerCase() })}
        onPress={() => showDialog(cardioCopy.first_time_title, cardioCopy.first_time_body)}
        style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}
      />

      <View style={styles.ringWrap}>
        <ProgressRing progress={ringProgress} size={RING_SIZE} stroke={12}>
          <AppText variant="number" style={{ color: colours.ink, fontVariant: ['tabular-nums'] }}>
            {formatClock(remaining)}
          </AppText>
        </ProgressRing>
        <AppText variant="eyebrow" style={{ color: colours.accent, marginTop: spacing.md }}>
          {fillCopy(cardioCopy.interval_eyebrow, {
            label: step.label,
            time: formatSegmentSeconds(remaining || step.seconds),
          })}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
          {fillCopy(cardioCopy.elapsed, { time: formatClock(elapsedSeconds) })}
        </AppText>
      </View>

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
        {nextStep ? (
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
            showDialog(
              cardioCopy.saved_title,
              fillCopy(cardioCopy.saved_body, { minutes: String(input.minutes) })
            );
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
  }) => Promise<void>;
}) {
  const { colours, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [minutes, setMinutes] = useState(elapsedMinutes);
  const [effort, setEffort] = useState(Math.round((def.effortTarget[0] + def.effortTarget[1]) / 2));
  const [settings, setSettings] = useState(() => settingsFrom(def.settings));
  const [distance, setDistance] = useState('');
  const [calories, setCalories] = useState('');

  useEffect(() => {
    if (!visible) return;
    setMinutes(elapsedMinutes);
    setEffort(Math.round((def.effortTarget[0] + def.effortTarget[1]) / 2));
    setSettings(settingsFrom(def.settings));
    setDistance('');
    setCalories('');
  }, [visible, elapsedMinutes, def]);

  function bump(key: string, delta: number, min: number, max: number, step = 0.5) {
    setSettings((current) => {
      const raw = Number(current[key] ?? min);
      const next = Math.min(max, Math.max(min, Math.round((raw + delta) * 10) / 10));
      return { ...current, [key]: step === 1 ? Math.round(next) : next };
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
            <StepperRow
              label={cardioCopy.minutes}
              value={minutes}
              onMinus={() => setMinutes((value) => Math.max(1, value - 1))}
              onPlus={() => setMinutes((value) => Math.min(def.maxMinutes, value + 1))}
            />
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
              <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
                {fillCopy(cardioCopy.should_feel, {
                  effort: formatEffortTarget([effort, effort]),
                  label: effortLabel(effort),
                })}
              </AppText>
            </View>

            {settings.speed_kmh != null ||
            settings.incline_percent != null ||
            settings.cadence_rpm != null ||
            settings.level != null ? (
              <View style={{ gap: spacing.sm }}>
                <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                  {cardioCopy.settings_optional}
                </AppText>
                {settings.speed_kmh != null ? (
                  <StepperRow
                    label={cardioCopy.speed}
                    value={Number(settings.speed_kmh)}
                    onMinus={() => bump('speed_kmh', -0.5, 1, 20)}
                    onPlus={() => bump('speed_kmh', 0.5, 1, 20)}
                  />
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

            <Field
              label={cardioCopy.distance}
              value={distance}
              onChange={setDistance}
              keyboard="decimal-pad"
            />
            <Field
              label={cardioCopy.calories}
              value={calories}
              onChange={setCalories}
              keyboard="number-pad"
            />

            <PrimaryButton
              label={saving ? cardioCopy.saving : cardioCopy.save}
              loading={saving}
              disabled={saving}
              onPress={() => {
                const distanceKm = distance.trim() ? Number(distance.replace(',', '.')) : null;
                const cal = calories.trim() ? Number(calories) : null;
                void onSave({
                  minutes,
                  effort,
                  settingsUsed: settings,
                  distanceKm: distanceKm != null && Number.isFinite(distanceKm) ? distanceKm : null,
                  calories: cal != null && Number.isFinite(cal) ? Math.round(cal) : null,
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboard: 'decimal-pad' | 'number-pad';
}) {
  const { colours, radius } = useTheme();
  return (
    <View>
      <AppText variant="bodySm" style={{ color: colours.inkMuted, marginBottom: 6 }}>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard}
        placeholder=""
        placeholderTextColor={colours.inkSubtle}
        style={[
          styles.input,
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
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    flex: 1,
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
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
});
