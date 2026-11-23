import { router, type Href } from 'expo-router';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import {
  AppText,
  Chip,
  ChipScroller,
  IconButton,
  PhotoFill,
  PrimaryButton,
  TextButton,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { fetchFinishedSessionMeta } from '@/lib/activityStats';
import {
  allEffortLabels,
  beginCustomCardioSession,
  describeCardioError,
  effortLabel,
  formatSettings,
  isSessionInProgressError,
  type CardioMachineId,
  type CardioSettings,
} from '@/lib/cardio';
import {
  buildCardioPlan,
  builderMachineLabel,
  cardioBuilderSpec,
  cardioPlanLength,
  formatPlanMinutes,
  isEffortTipBeginner,
  machineImageSlug,
  settingsForEffort,
  type ExtraCardioBlock,
} from '@/lib/cardioBuilderContent';
import { cardioCopy, fillCopy } from '@/lib/copy';
import { saveCustomCardioWorkout } from '@/lib/customWorkouts';
import { confirmFirstSessionSafety } from '@/lib/firstSession';
import { ensureSubscribed, useSubscriptionGate } from '@/lib/paywall';
import { routeForActiveSession } from '@/lib/startLogger';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { useWorkout } from '@/lib/workout';

const spec = cardioBuilderSpec;
const defaults = spec.buildIntervals.defaults;
const steppers = spec.buildIntervals.steppers;

type Step = 'machine' | 'build';

export default function BuildIntervalsScreen() {
  const allowed = useSubscriptionGate();
  const insets = useSafeAreaInsets();
  const { colours, spacing, radius } = useTheme();
  const workout = useWorkout();
  const { profile } = useProfile();
  const answers = getQuizAnswers(profile);
  const [step, setStep] = useState<Step>('machine');
  const [machineId, setMachineId] = useState<CardioMachineId | null>(null);
  const [workSeconds, setWorkSeconds] = useState(defaults.workSeconds);
  const [workEffort, setWorkEffort] = useState(defaults.workEffort);
  const [recoverSeconds, setRecoverSeconds] = useState(defaults.recoverSeconds);
  const [recoverEffort, setRecoverEffort] = useState(defaults.recoverEffort);
  const [repeats, setRepeats] = useState(defaults.repeats);
  const [includeWarmup, setIncludeWarmup] = useState(spec.quickStart.warmup.defaultOn);
  const [extraBlocks, setExtraBlocks] = useState<ExtraCardioBlock[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [workSettings, setWorkSettings] = useState<CardioSettings | undefined>();
  const [recoverSettings, setRecoverSettings] = useState<CardioSettings | undefined>();
  const [effortTarget, setEffortTarget] = useState<EffortTarget | null>(null);
  const [busy, setBusy] = useState<'start' | 'save' | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [startedOn, setStartedOn] = useState<string | null>(profile?.onboarding_completed_at ?? null);

  useEffect(() => {
    track('cardio_builder_opened');
  }, []);

  useEffect(() => {
    let isCurrent = true;
    fetchFinishedSessionMeta()
      .then((sessions) => {
        if (isCurrent) setStartedOn(sessions[0]?.date ?? profile?.onboarding_completed_at ?? null);
      })
      .catch(() => {
        if (isCurrent) setStartedOn(profile?.onboarding_completed_at ?? null);
      });
    return () => {
      isCurrent = false;
    };
  }, [profile?.onboarding_completed_at]);

  const beginner = isEffortTipBeginner(answers?.gym_experience ?? profile?.gym_experience, startedOn);

  const planInput = useMemo(
    () =>
      machineId
        ? {
            machineId,
            style: 'intervals' as const,
            minutes: 20,
            includeWarmup,
            workSeconds,
            workEffort,
            recoverSeconds,
            recoverEffort,
            repeats,
            extraBlocks,
            workSettings,
            recoverSettings,
          }
        : null,
    [
      extraBlocks,
      includeWarmup,
      machineId,
      recoverEffort,
      recoverSeconds,
      recoverSettings,
      repeats,
      workEffort,
      workSeconds,
      workSettings,
    ]
  );

  const length = planInput ? cardioPlanLength(planInput, spec) : { seconds: 0, capped: false };
  const plan = planInput ? buildCardioPlan(planInput) : null;

  if (!allowed) {
    return <View style={[styles.screen, { backgroundColor: colours.bg }]} />;
  }

  function goBack() {
    if (step === 'build') {
      setStep('machine');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/programmes', params: { section: 'cardio' } } as Href);
  }

  function openActive(id: string, source?: string) {
    router.push(routeForActiveSession(id, source));
  }

  async function handleStart() {
    if (!ensureSubscribed()) return;
    if (!plan) return;
    setBusy('start');
    try {
      const allowedSafety = await confirmFirstSessionSafety();
      if (!allowedSafety) return;
      const key = plan.slug;
      const started = await beginCustomCardioSession(plan, savedKey === key ? savedId : null);
      track('custom_cardio_started', { style: plan.style, minutes: plan.duration_minutes });
      workout.publish(
        {
          sessionId: started.id,
          dayName: plan.name,
          startedAt: Date.parse(started.started_at),
          source: 'cardio',
        },
        null
      );
      router.replace({ pathname: '/cardio/play', params: { sessionId: started.id } } as Href);
    } catch (error) {
      if (isSessionInProgressError(error) && error.activeId) {
        showDialog(cardioCopy.in_progress_title, cardioCopy.in_progress_body, [
          { text: cardioCopy.open_it, onPress: () => openActive(error.activeId, error.activeSource) },
          { text: 'OK', style: 'cancel' },
        ]);
        return;
      }
      showDialog(cardioCopy.not_found, describeCardioError(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    if (!plan) return;
    if (savedKey === plan.slug) {
      showDialog(spec.quickStart.saved);
      return;
    }
    setBusy('save');
    try {
      const saved = await saveCustomCardioWorkout(plan);
      setSavedId(saved.id);
      setSavedKey(plan.slug);
      track('custom_cardio_saved');
      showDialog(spec.quickStart.saved);
    } catch (error) {
      showDialog(cardioCopy.not_found, describeCardioError(error));
    } finally {
      setBusy(null);
    }
  }

  function clampBlockSeconds(value: number): number {
    return Math.min(steppers.secondsMax, Math.max(steppers.secondsMin, value));
  }

  function bumpSeconds(value: number, delta: number): number {
    return clampBlockSeconds(value + delta * steppers.secondsStep);
  }

  function bumpMinutes(value: number, delta: number): number {
    return clampBlockSeconds(value + delta * 60);
  }

  function addBlock() {
    if (!machineId || length.capped) return;
    setShowAdvanced(true);
    setExtraBlocks((current) => [
      ...current,
      { machineId, seconds: defaults.workSeconds, effort: defaults.workEffort },
    ]);
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={goBack} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + (step === 'build' ? 140 : 32),
          gap: spacing.md,
        }}>
        <AppText variant="display" style={{ color: colours.ink }}>
          {step === 'machine' ? spec.buildIntervals.machineTitle : spec.buildIntervals.title}
        </AppText>

        {step === 'machine' ? (
          <View style={styles.machineGrid}>
            {spec.machinesOrder.map((id, index, list) => {
              const selected = machineId === id;
              const label = builderMachineLabel(id);
              const lastOdd = index === list.length - 1 && list.length % 2 === 1;
              return (
                <Fragment key={id}>
                  {lastOdd ? <View style={styles.machineSpacer} /> : null}
                  <Pressable
                    onPress={() => {
                      setMachineId(id);
                      setWorkSettings(undefined);
                      setRecoverSettings(undefined);
                      setStep('build');
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={label}
                    style={styles.machineCell}>
                    <View
                      style={[
                        styles.machineInner,
                        {
                          backgroundColor: colours.surfaceMuted,
                          borderRadius: radius.lg,
                          borderColor: selected ? colours.brand : 'transparent',
                        },
                      ]}>
                      <View style={styles.machinePhoto}>
                        <PhotoFill slug={machineImageSlug(id)} kind="equipment" label={label} />
                      </View>
                      <AppText
                        variant="bodyStrong"
                        style={{ color: colours.ink, paddingVertical: 10, textAlign: 'center' }}
                        numberOfLines={1}>
                        {label}
                      </AppText>
                    </View>
                  </Pressable>
                </Fragment>
              );
            })}
          </View>
        ) : null}

        {step === 'build' && machineId && plan ? (
          <View style={{ gap: spacing.md }}>
            <SessionTimeline intervals={plan.intervals} />
            <AppText variant="title3" style={{ color: colours.ink }}>
              {fillCopy(spec.buildIntervals.totalLabel, { minutes: formatPlanMinutes(length.seconds) })}
            </AppText>
            {length.capped ? (
              <AppText variant="bodySm" style={{ color: colours.accent }}>
                {spec.buildIntervals.capMessage}
              </AppText>
            ) : null}

            <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
              <BlockSteppers
                title={spec.buildIntervals.workLabel}
                seconds={workSeconds}
                effort={workEffort}
                onMinusMinutes={() => setWorkSeconds((value) => bumpMinutes(value, -1))}
                onPlusMinutes={() => setWorkSeconds((value) => bumpMinutes(value, 1))}
                onMinusSeconds={() => setWorkSeconds((value) => bumpSeconds(value, -1))}
                onPlusSeconds={() => setWorkSeconds((value) => bumpSeconds(value, 1))}
                onEffort={() => setEffortTarget({ kind: 'work' })}
                plusDisabled={length.capped}
              />
              <SettingsExpander
                machineId={machineId}
                effort={workEffort}
                value={workSettings}
                onChange={setWorkSettings}
              />
              <View style={[styles.cardRule, { backgroundColor: colours.border }]} />
              <BlockSteppers
                title={spec.buildIntervals.recoverLabel}
                seconds={recoverSeconds}
                effort={recoverEffort}
                onMinusMinutes={() => setRecoverSeconds((value) => bumpMinutes(value, -1))}
                onPlusMinutes={() => setRecoverSeconds((value) => bumpMinutes(value, 1))}
                onMinusSeconds={() => setRecoverSeconds((value) => bumpSeconds(value, -1))}
                onPlusSeconds={() => setRecoverSeconds((value) => bumpSeconds(value, 1))}
                onEffort={() => setEffortTarget({ kind: 'recover' })}
                plusDisabled={length.capped}
              />
              <SettingsExpander
                machineId={machineId}
                effort={recoverEffort}
                value={recoverSettings}
                onChange={setRecoverSettings}
              />
              <View style={[styles.cardRule, { backgroundColor: colours.border }]} />
              <StepperRow
                label={spec.buildIntervals.repeatsLabel}
                value={String(repeats)}
                onMinus={() => setRepeats((value) => Math.max(steppers.repeatsMin, value - 1))}
                onPlus={() => setRepeats((value) => Math.min(steppers.repeatsMax, value + 1))}
                plusDisabled={length.capped}
              />
            </View>

            <Pressable
              onPress={() => setIncludeWarmup((value) => !value)}
              accessibilityRole="switch"
              accessibilityState={{ checked: includeWarmup }}
              style={styles.toggleRow}>
              <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
                {spec.quickStart.warmup.label}
              </AppText>
              <Switch
                value={includeWarmup}
                onValueChange={setIncludeWarmup}
                trackColor={{ false: colours.border, true: colours.brand }}
                thumbColor={colours.surface}
              />
            </Pressable>

            {showAdvanced ? (
              <View style={{ gap: spacing.sm }}>
                <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                  {spec.buildIntervals.advanced.sub}
                </AppText>
                <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
                  {spec.buildIntervals.advanced.machineChangeNote}
                </AppText>
                {extraBlocks.map((block, index) => (
                  <ExtraBlockCard
                    key={`${block.machineId}-${index}`}
                    index={index}
                    block={block}
                    plusDisabled={length.capped}
                    onChange={(next) =>
                      setExtraBlocks((current) => current.map((item, i) => (i === index ? next : item)))
                    }
                    onRemove={() => setExtraBlocks((current) => current.filter((_, i) => i !== index))}
                    onMove={(dir) =>
                      setExtraBlocks((current) => {
                        const target = index + dir;
                        if (target < 0 || target >= current.length) return current;
                        const next = [...current];
                        const hold = next[index];
                        const swap = next[target];
                        if (!hold || !swap) return current;
                        next[index] = swap;
                        next[target] = hold;
                        return next;
                      })
                    }
                    onEffort={() => setEffortTarget({ kind: 'extra', index })}
                    bumpSeconds={bumpSeconds}
                    bumpMinutes={bumpMinutes}
                  />
                ))}
              </View>
            ) : null}

            <TextButton
              label={spec.buildIntervals.advanced.label}
              onPress={addBlock}
              disabled={length.capped}
              style={{ alignSelf: 'flex-start' }}
            />
          </View>
        ) : null}
      </ScrollView>

      {step === 'build' ? (
        <View
          style={[
            styles.sticky,
            {
              paddingBottom: insets.bottom + 12,
              backgroundColor: colours.bg,
              borderTopColor: colours.border,
            },
          ]}>
          <PrimaryButton
            label={spec.buildIntervals.startButton}
            loading={busy === 'start'}
            disabled={busy !== null || !plan}
            onPress={() => void handleStart()}
          />
          <TextButton
            label={spec.buildIntervals.saveButton}
            onPress={() => void handleSave()}
            disabled={busy !== null || !plan}
            style={{ alignSelf: 'center' }}
          />
        </View>
      ) : null}

      <EffortPickerSheet
        visible={effortTarget != null}
        value={
          effortTarget?.kind === 'work'
            ? workEffort
            : effortTarget?.kind === 'recover'
              ? recoverEffort
              : effortTarget?.kind === 'extra'
                ? (extraBlocks[effortTarget.index]?.effort ?? defaults.workEffort)
                : defaults.workEffort
        }
        beginner={beginner}
        onClose={() => setEffortTarget(null)}
        onPick={(value) => {
          if (effortTarget?.kind === 'work') {
            setWorkEffort(value);
            setWorkSettings(undefined);
          } else if (effortTarget?.kind === 'recover') {
            setRecoverEffort(value);
            setRecoverSettings(undefined);
          } else if (effortTarget?.kind === 'extra') {
            const index = effortTarget.index;
            setExtraBlocks((current) =>
              current.map((item, i) => (i === index ? { ...item, effort: value, settings: undefined } : item))
            );
          }
          setEffortTarget(null);
        }}
      />
    </View>
  );
}

type EffortTarget = { kind: 'work' } | { kind: 'recover' } | { kind: 'extra'; index: number };

function SessionTimeline({
  intervals,
}: {
  intervals: { label: string; seconds: number; effort: number }[];
}) {
  const { colours, radius } = useTheme();
  return (
    <View style={styles.track} accessibilityRole="progressbar">
      {intervals.map((item, index) => (
        <View
          key={`${item.label}-${index}`}
          style={{
            flex: Math.max(item.seconds, 15),
            height: 8 + Math.round((item.effort / 10) * 20),
            borderRadius: radius.full,
            backgroundColor: item.effort >= 7 ? colours.brand : item.effort >= 5 ? colours.brandSoft : colours.surfaceMuted,
            alignSelf: 'flex-end',
          }}
        />
      ))}
    </View>
  );
}

function BlockSteppers({
  title,
  seconds,
  effort,
  onMinusMinutes,
  onPlusMinutes,
  onMinusSeconds,
  onPlusSeconds,
  onEffort,
  plusDisabled,
}: {
  title: string;
  seconds: number;
  effort: number;
  onMinusMinutes: () => void;
  onPlusMinutes: () => void;
  onMinusSeconds: () => void;
  onPlusSeconds: () => void;
  onEffort: () => void;
  plusDisabled?: boolean;
}) {
  const { colours } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="bodyStrong" style={{ color: colours.ink }}>
        {title}
      </AppText>
      <StepperRow
        label={spec.buildIntervals.minutesLabel}
        value={String(Math.floor(seconds / 60))}
        onMinus={onMinusMinutes}
        onPlus={onPlusMinutes}
        plusDisabled={plusDisabled}
      />
      <StepperRow
        label={spec.buildIntervals.secondsLabel}
        value={String(seconds % 60)}
        onMinus={onMinusSeconds}
        onPlus={onPlusSeconds}
        plusDisabled={plusDisabled}
      />
      <Pressable onPress={onEffort} accessibilityRole="button" accessibilityLabel={effortLabel(effort)}>
        <View style={styles.effortPick}>
          <AppText variant="caption" style={{ color: colours.inkSubtle }}>
            {effort}
          </AppText>
          <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
            {effortLabel(effort)}
          </AppText>
        </View>
      </Pressable>
    </View>
  );
}

function ExtraBlockCard({
  index,
  block,
  plusDisabled,
  onChange,
  onRemove,
  onMove,
  onEffort,
  bumpSeconds,
  bumpMinutes,
}: {
  index: number;
  block: ExtraCardioBlock;
  plusDisabled: boolean;
  onChange: (block: ExtraCardioBlock) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onEffort: () => void;
  bumpSeconds: (value: number, delta: number) => number;
  bumpMinutes: (value: number, delta: number) => number;
}) {
  const { colours, spacing, radius } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.lg, gap: spacing.sm }]}>
      <View style={styles.extraTop}>
        <AppText variant="bodyStrong" style={{ color: colours.ink, flex: 1 }}>
          {fillCopy(spec.buildIntervals.advanced.blockLabel, { n: index + 1 })}
        </AppText>
        <IconButton
          icon="chevron-up"
          accessibilityLabel={spec.buildIntervals.advanced.moveUp}
          onPress={() => onMove(-1)}
        />
        <IconButton
          icon="chevron-down"
          accessibilityLabel={spec.buildIntervals.advanced.moveDown}
          onPress={() => onMove(1)}
        />
      </View>
      <ChipScroller>
        {spec.machinesOrder.map((id) => (
          <Chip
            key={id}
            label={builderMachineLabel(id)}
            selected={block.machineId === id}
            onPress={() => onChange({ ...block, machineId: id, settings: undefined })}
          />
        ))}
      </ChipScroller>
      <BlockSteppers
        title={builderMachineLabel(block.machineId)}
        seconds={block.seconds}
        effort={block.effort}
        onMinusMinutes={() => onChange({ ...block, seconds: bumpMinutes(block.seconds, -1) })}
        onPlusMinutes={() => onChange({ ...block, seconds: bumpMinutes(block.seconds, 1) })}
        onMinusSeconds={() => onChange({ ...block, seconds: bumpSeconds(block.seconds, -1) })}
        onPlusSeconds={() => onChange({ ...block, seconds: bumpSeconds(block.seconds, 1) })}
        onEffort={onEffort}
        plusDisabled={plusDisabled}
      />
      <SettingsExpander
        machineId={block.machineId}
        effort={block.effort}
        value={block.settings}
        onChange={(settings) => onChange({ ...block, settings })}
      />
      <TextButton
        label={spec.buildIntervals.advanced.deleteBlock}
        onPress={onRemove}
        style={{ alignSelf: 'flex-start' }}
      />
    </View>
  );
}

function SettingsExpander({
  machineId,
  effort,
  value,
  onChange,
}: {
  machineId: CardioMachineId;
  effort: number;
  value?: CardioSettings;
  onChange: (settings: CardioSettings | undefined) => void;
}) {
  const { colours } = useTheme();
  const [open, setOpen] = useState(false);
  const settings = value ?? settingsForEffort(machineId, effort, spec);
  const speedRange = asPair(settings.speed_kmh);
  const fields = numericSettingFields(settings);
  const note = formatSettings(settings);
  return (
    <View>
      <TextButton
        label={spec.buildIntervals.settingsLabel}
        onPress={() => setOpen((current) => !current)}
        style={{ alignSelf: 'flex-start' }}
      />
      {open ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          {spec.settingsNote ? (
            <AppText variant="caption" style={{ color: colours.inkMuted }}>
              {spec.settingsNote}
            </AppText>
          ) : null}
          {speedRange ? (
            <>
              <StepperRow
                label={cardioCopy.speed_min}
                value={String(speedRange[0])}
                onMinus={() => onChange({ ...settings, speed_kmh: bumpPair(speedRange, 'min', -0.5, 1, 20) })}
                onPlus={() => onChange({ ...settings, speed_kmh: bumpPair(speedRange, 'min', 0.5, 1, 20) })}
              />
              <StepperRow
                label={cardioCopy.speed_max}
                value={String(speedRange[1])}
                onMinus={() => onChange({ ...settings, speed_kmh: bumpPair(speedRange, 'max', -0.5, 1, 20) })}
                onPlus={() => onChange({ ...settings, speed_kmh: bumpPair(speedRange, 'max', 0.5, 1, 20) })}
              />
            </>
          ) : null}
          {fields.map((field) => (
            <StepperRow
              key={field.key}
              label={field.label}
              value={String(field.value)}
              onMinus={() =>
                onChange({
                  ...settings,
                  [field.key]: Math.max(field.min, Math.round((field.value - field.step) * 10) / 10),
                })
              }
              onPlus={() =>
                onChange({
                  ...settings,
                  [field.key]: Math.min(field.max, Math.round((field.value + field.step) * 10) / 10),
                })
              }
            />
          ))}
          {settings.resistance ? (
            <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
              {cardioCopy.resistance}: {settings.resistance}
            </AppText>
          ) : null}
          {settings.level_text ? (
            <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
              {cardioCopy.level}: {settings.level_text}
            </AppText>
          ) : null}
          {note && fields.length === 0 && !speedRange ? (
            <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
              {note}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function numericSettingFields(settings: CardioSettings): {
  key: keyof CardioSettings;
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
}[] {
  const rows: {
    key: keyof CardioSettings;
    label: string;
    pair: [number, number] | number | undefined;
    step: number;
    min: number;
    max: number;
  }[] = [
    { key: 'incline_percent', label: cardioCopy.incline, pair: settings.incline_percent, step: 1, min: 0, max: 20 },
    { key: 'cadence_rpm', label: cardioCopy.cadence, pair: settings.cadence_rpm, step: 5, min: 40, max: 120 },
    { key: 'strides_per_minute', label: cardioCopy.strides, pair: settings.strides_per_minute, step: 5, min: 60, max: 180 },
    { key: 'damper', label: cardioCopy.damper, pair: settings.damper, step: 1, min: 1, max: 10 },
    { key: 'strokes_per_minute', label: cardioCopy.strokes, pair: settings.strokes_per_minute, step: 1, min: 14, max: 40 },
    { key: 'steps_per_minute', label: cardioCopy.steps, pair: settings.steps_per_minute, step: 5, min: 20, max: 90 },
  ];
  return rows.flatMap((row) => {
    const value = midpoint(row.pair);
    if (value == null) return [];
    return [{ key: row.key, label: row.label, value, step: row.step, min: row.min, max: row.max }];
  });
}

function midpoint(value: [number, number] | number | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return Math.round(((value[0] + value[1]) / 2) * 10) / 10;
}

function asPair(value: [number, number] | number | undefined): [number, number] | null {
  if (value == null) return null;
  if (typeof value === 'number') return [value, value];
  const low = Math.min(value[0], value[1]);
  const high = Math.max(value[0], value[1]);
  return [Math.round(low * 10) / 10, Math.round(high * 10) / 10];
}

function bumpPair(
  pair: [number, number],
  end: 'min' | 'max',
  delta: number,
  min: number,
  max: number
): [number, number] {
  let low = pair[0];
  let high = pair[1];
  const next = Math.min(max, Math.max(min, Math.round(( (end === 'min' ? low : high) + delta) * 10) / 10));
  if (end === 'min') {
    low = next;
    if (low > high) high = low;
  } else {
    high = next;
    if (high < low) low = high;
  }
  return [low, high];
}

function StepperRow({
  label,
  value,
  onMinus,
  onPlus,
  plusDisabled,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  plusDisabled?: boolean;
}) {
  const { colours, radius } = useTheme();
  return (
    <View style={styles.stepper}>
      <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
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
        {value ? (
          <AppText variant="title3" style={{ color: colours.ink, minWidth: 48, textAlign: 'center' }}>
            {value}
          </AppText>
        ) : null}
        <Pressable
          onPress={onPlus}
          disabled={plusDisabled}
          style={[
            styles.stepperBtn,
            { backgroundColor: colours.surfaceMuted, borderRadius: radius.full, opacity: plusDisabled ? 0.4 : 1 },
          ]}
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

function EffortPickerSheet({
  visible,
  value,
  beginner,
  onClose,
  onPick,
}: {
  visible: boolean;
  value: number;
  beginner: boolean;
  onClose: () => void;
  onPick: (value: number) => void;
}) {
  const { colours, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState(value);
  useEffect(() => {
    if (visible) setPicked(value);
  }, [visible, value]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colours.bg,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingBottom: insets.bottom + 16,
            },
          ]}>
          <AppText variant="title2" style={{ color: colours.ink, paddingHorizontal: 24, paddingTop: 20 }}>
            {spec.effortPicker.title}
          </AppText>
          <ScrollView contentContainerStyle={{ padding: 24, gap: spacing.sm }}>
            {allEffortLabels().map((item) => {
              const selected = item.value === picked;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => {
                    if (beginner && item.value >= 9 && picked !== item.value) {
                      setPicked(item.value);
                      return;
                    }
                    onPick(item.value);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.effortRow,
                    {
                      backgroundColor: selected ? colours.brandSoft : colours.surface,
                      borderRadius: radius.lg,
                    },
                  ]}>
                  <AppText variant="caption" style={{ color: colours.inkSubtle, width: 24 }}>
                    {item.value}
                  </AppText>
                  <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
                    {item.label}
                  </AppText>
                </Pressable>
              );
            })}
            {beginner && picked >= 9 ? (
              <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
                {spec.effortPicker.beginnerTip}
              </AppText>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  machineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  machineCell: {
    width: '50%',
    paddingHorizontal: 5,
    marginBottom: 10,
  },
  machineSpacer: {
    width: '25%',
  },
  machineInner: {
    overflow: 'hidden',
    borderWidth: 2,
  },
  machinePhoto: {
    width: '100%',
    aspectRatio: 4 / 3,
    overflow: 'hidden',
  },
  track: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 30,
  },
  card: {
    padding: 16,
    gap: 12,
  },
  cardRule: {
    height: StyleSheet.hairlineWidth,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
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
  effortPick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  extraTop: {
    flexDirection: 'row',
    alignItems: 'center',
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
    maxHeight: '88%',
  },
  effortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
