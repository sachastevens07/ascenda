import type { CardioMachineId, CardioPlan, CardioPlanInterval, CardioSettings } from './cardio';

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pair(value: unknown): [number, number] | number | undefined {
  if (Array.isArray(value) && value.length >= 2) {
    const low = num(value[0]);
    const high = num(value[1]);
    if (low != null && high != null) return [low, high];
  }
  const single = num(value);
  return single == null ? undefined : single;
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

export const QUICK_START_STYLES = ['steady', 'intervals'] as const;
export type QuickStartStyle = (typeof QUICK_START_STYLES)[number];

export type CardioBuilderAction = {
  id: string;
  label: string;
};

export type QuickStartType = {
  id: QuickStartStyle;
  label: string;
  sub: string;
  effort: number | null;
  workSeconds: number;
  workEffort: number;
  recoverSeconds: number;
  recoverEffort: number;
};

export type CardioBuilderSpec = {
  entry: {
    cardTitle: string;
    cardSub: string;
    actions: CardioBuilderAction[];
    comingSoon: string;
  };
  machinesOrder: CardioMachineId[];
  quickStart: {
    title: string;
    machineTitle: string;
    typeTitle: string;
    types: QuickStartType[];
    minutesTitle: string;
    minutes: { min: number; max: number; step: number; default: number };
    minutesValue: string;
    warmup: { label: string; defaultOn: boolean; secondsEach: number; effort: number; note: string };
    startButton: string;
    saveLink: string;
    saved: string;
    blockLabels: { warmup: string; cooldown: string; easy: string };
    workLabel: string;
    recoverLabel: string;
  };
  naming: { steady: string; intervals: string; mixed: string };
  myWorkouts: { cardioChip: string; repeatLabel: string; addToPlanner: string };
  settingsDefaults: Json;
  settingsNote: string;
  effortPicker: { title: string; beginnerTip: string };
  buildIntervals: {
    title: string;
    machineTitle: string;
    workLabel: string;
    recoverLabel: string;
    repeatsLabel: string;
    defaults: {
      workSeconds: number;
      workEffort: number;
      recoverSeconds: number;
      recoverEffort: number;
      repeats: number;
    };
    steppers: {
      secondsStep: number;
      secondsMin: number;
      secondsMax: number;
      repeatsMin: number;
      repeatsMax: number;
    };
    totalLabel: string;
    timelineHint: string;
    advanced: {
      label: string;
      sub: string;
      machineChangeNote: string;
      machineChangeLabel: string;
      machineChangeSeconds: number;
      machineChangeEffort: number;
      blockLabel: string;
      deleteBlock: string;
      moveUp: string;
      moveDown: string;
    };
    settingsLabel: string;
    secondsValue: string;
    maxMinutes: number;
    capMessage: string;
    saveButton: string;
    startButton: string;
  };
};

function parseAction(raw: unknown): CardioBuilderAction | null {
  const row = asRecord(raw);
  const id = text(row.id);
  const label = text(row.label);
  if (!id || !label) return null;
  return { id, label };
}

function parseType(raw: unknown): QuickStartType | null {
  const row = asRecord(raw);
  const id = text(row.id);
  if (id !== 'steady' && id !== 'intervals') return null;
  const label = text(row.label);
  if (!label) return null;
  return {
    id,
    label,
    sub: text(row.sub),
    effort: num(row.effort),
    workSeconds: Math.round(num(row.work_seconds) ?? 60),
    workEffort: Math.round(num(row.work_effort) ?? 7),
    recoverSeconds: Math.round(num(row.recover_seconds) ?? 120),
    recoverEffort: Math.round(num(row.recover_effort) ?? 4),
  };
}

function parseMachineId(value: unknown): CardioMachineId | null {
  const id = text(value).replace(/-/g, '_');
  if (
    id === 'treadmill' ||
    id === 'bike' ||
    id === 'cross_trainer' ||
    id === 'rower' ||
    id === 'stair_climber'
  ) {
    return id;
  }
  return null;
}

export function parseCardioBuilderSpec(raw: unknown): CardioBuilderSpec {
  const file = asRecord(raw);
  const entryRaw = asRecord(file.entry);
  const quickRaw = asRecord(file.quick_start);
  const minutesRaw = asRecord(quickRaw.minutes);
  const warmupRaw = asRecord(quickRaw.warmup_cooldown);
  const namingRaw = asRecord(file.naming);
  const buildRaw = asRecord(file.build_intervals);
  const blockLabels = asRecord(quickRaw.block_labels);
  const myWorkouts = asRecord(file.my_workouts);
  return {
    entry: {
      cardTitle: text(entryRaw.card_title),
      cardSub: text(entryRaw.card_sub),
      actions: asArray(entryRaw.actions)
        .map(parseAction)
        .filter((item): item is CardioBuilderAction => item != null),
      comingSoon: text(entryRaw.coming_soon),
    },
    machinesOrder: asArray(file.machines_order)
      .map(parseMachineId)
      .filter((item): item is CardioMachineId => item != null),
    quickStart: {
      title: text(quickRaw.title),
      machineTitle: text(quickRaw.machine_title),
      typeTitle: text(quickRaw.type_title),
      types: asArray(quickRaw.types).map(parseType).filter((item): item is QuickStartType => item != null),
      minutesTitle: text(quickRaw.minutes_title),
      minutesValue: text(quickRaw.minutes_value),
      minutes: {
        min: Math.round(num(minutesRaw.min) ?? 10),
        max: Math.round(num(minutesRaw.max) ?? 60),
        step: Math.round(num(minutesRaw.step) ?? 5),
        default: Math.round(num(minutesRaw.default) ?? 20),
      },
      warmup: {
        label: text(warmupRaw.label),
        defaultOn: warmupRaw.default !== false,
        secondsEach: Math.round(num(warmupRaw.seconds_each) ?? 180),
        effort: Math.round(num(warmupRaw.effort) ?? 3),
        note: text(warmupRaw.note),
      },
      startButton: text(quickRaw.start_button),
      saveLink: text(quickRaw.save_link),
      saved: text(quickRaw.saved),
      blockLabels: {
        warmup: text(blockLabels.warmup),
        cooldown: text(blockLabels.cooldown),
        easy: text(blockLabels.easy),
      },
      workLabel: text(buildRaw.work_label),
      recoverLabel: text(buildRaw.recover_label),
    },
    naming: {
      steady: text(namingRaw.steady),
      intervals: text(namingRaw.intervals),
      mixed: text(namingRaw.mixed),
    },
    myWorkouts: {
      cardioChip: text(myWorkouts.cardio_chip),
      repeatLabel: text(myWorkouts.repeat_label),
      addToPlanner: text(myWorkouts.add_to_planner),
    },
    settingsDefaults: asRecord(file.settings_defaults),
    settingsNote: text(file.settings_note),
    effortPicker: {
      title: text(asRecord(file.effort_picker).title),
      beginnerTip: text(asRecord(file.effort_picker).beginner_tip_9_10),
    },
    buildIntervals: {
      title: text(buildRaw.title),
      machineTitle: text(buildRaw.machine_title),
      workLabel: text(buildRaw.work_label),
      recoverLabel: text(buildRaw.recover_label),
      repeatsLabel: text(buildRaw.repeats_label),
      defaults: {
        workSeconds: Math.round(num(asRecord(buildRaw.defaults).work_seconds) ?? 60),
        workEffort: Math.round(num(asRecord(buildRaw.defaults).work_effort) ?? 7),
        recoverSeconds: Math.round(num(asRecord(buildRaw.defaults).recover_seconds) ?? 120),
        recoverEffort: Math.round(num(asRecord(buildRaw.defaults).recover_effort) ?? 4),
        repeats: Math.round(num(asRecord(buildRaw.defaults).repeats) ?? 6),
      },
      steppers: {
        secondsStep: Math.round(num(asRecord(buildRaw.steppers).seconds_step) ?? 15),
        secondsMin: Math.round(num(asRecord(buildRaw.steppers).seconds_min) ?? 15),
        secondsMax: Math.round(num(asRecord(buildRaw.steppers).seconds_max) ?? 600),
        repeatsMin: Math.round(num(asRecord(buildRaw.steppers).repeats_min) ?? 1),
        repeatsMax: Math.round(num(asRecord(buildRaw.steppers).repeats_max) ?? 20),
      },
      totalLabel: text(buildRaw.total_label),
      timelineHint: text(buildRaw.timeline_hint),
      advanced: {
        label: text(asRecord(buildRaw.advanced).label),
        sub: text(asRecord(buildRaw.advanced).sub),
        machineChangeNote: text(asRecord(buildRaw.advanced).machine_change_note),
        machineChangeLabel: text(asRecord(buildRaw.advanced).machine_change_label),
        machineChangeSeconds: Math.round(num(asRecord(buildRaw.advanced).machine_change_seconds) ?? 60),
        machineChangeEffort: Math.round(num(asRecord(buildRaw.advanced).machine_change_effort) ?? 4),
        blockLabel: text(asRecord(buildRaw.advanced).block_label),
        deleteBlock: text(asRecord(buildRaw.advanced).delete_block),
        moveUp: text(asRecord(buildRaw.advanced).move_up),
        moveDown: text(asRecord(buildRaw.advanced).move_down),
      },
      settingsLabel: text(buildRaw.settings_label),
      secondsValue: text(buildRaw.seconds_value),
      maxMinutes: Math.round(num(buildRaw.max_minutes) ?? 90),
      capMessage: text(buildRaw.cap_message),
      saveButton: text(buildRaw.save_button),
      startButton: text(buildRaw.start_button),
    },
  };
}

export function quickStartMinutesOptions(spec: CardioBuilderSpec): number[] {
  const { min, max, step } = spec.quickStart.minutes;
  const values: number[] = [];
  for (let value = min; value <= max; value += step) values.push(value);
  return values;
}

export function machineImageSlug(id: CardioMachineId): string {
  return `machine-${id.replace(/_/g, '-')}`;
}

export function effortSettingsBand(effort: number): 'easy' | 'steady' | 'hard' {
  if (effort <= 4) return 'easy';
  if (effort <= 6) return 'steady';
  return 'hard';
}

function settingsFromBand(raw: unknown, machineId: CardioMachineId): CardioSettings {
  const row = asRecord(raw);
  const numericLevel = pair(row.level);
  const levelText = numericLevel == null ? text(row.level) : '';
  const settings: CardioSettings = { machine_id: machineId };
  const speed = pair(row.speed_kmh);
  const incline = pair(row.incline_percent);
  const cadence = pair(row.cadence_rpm);
  const strides = pair(row.strides_per_minute);
  const damper = pair(row.damper);
  const strokes = pair(row.strokes_per_minute);
  const steps = pair(row.steps_per_minute);
  if (speed != null) settings.speed_kmh = speed;
  if (incline != null) settings.incline_percent = incline;
  if (cadence != null) settings.cadence_rpm = cadence;
  if (strides != null) settings.strides_per_minute = strides;
  if (damper != null) settings.damper = damper;
  if (strokes != null) settings.strokes_per_minute = strokes;
  if (steps != null) settings.steps_per_minute = steps;
  if (numericLevel != null) settings.level = numericLevel;
  if (levelText) settings.level_text = levelText;
  const resistance = text(row.resistance);
  if (resistance) settings.resistance = resistance;
  const note = text(row.note);
  if (note) settings.note = note;
  return settings;
}

export function settingsForEffort(
  machineId: CardioMachineId,
  effort: number,
  spec: CardioBuilderSpec
): CardioSettings {
  const bands = asRecord(spec.settingsDefaults[machineId]);
  return settingsFromBand(bands[effortSettingsBand(effort)], machineId);
}

export function nameQuickCardioPlan(
  machineId: CardioMachineId,
  style: QuickStartStyle | 'mixed',
  minutes: number,
  spec: CardioBuilderSpec,
  machineName: string
): string {
  if (style === 'mixed' || machineId === 'mixed') {
    return fill(spec.naming.mixed, { machine: machineName, minutes });
  }
  const template = style === 'intervals' ? spec.naming.intervals : spec.naming.steady;
  return fill(template, { machine: machineName, minutes });
}

export function formatPlanMinutes(totalSeconds: number): number {
  const minutes = totalSeconds / 60;
  return Number.isInteger(minutes) ? minutes : Math.round(minutes * 10) / 10;
}

export function isEffortTipBeginner(
  gymExperience: string | null | undefined,
  startedOn: string | null | undefined,
  now = Date.now()
): boolean {
  if (gymExperience === 'not_yet' || gymExperience === 'just_started') return true;
  if (!startedOn) return false;
  const start = Date.parse(startedOn);
  if (!Number.isFinite(start)) return false;
  return now - start < 28 * 24 * 60 * 60 * 1000;
}

export type ExtraCardioBlock = {
  machineId: CardioMachineId;
  seconds: number;
  effort: number;
  settings?: CardioSettings;
};

export type PlanBlockInput = {
  machineId: CardioMachineId;
  seconds: number;
  effort: number;
  label: string;
  settings?: CardioSettings;
};

export type BuildCardioPlanInput = BuildQuickCardioPlanInput & {
  workSeconds?: number;
  workEffort?: number;
  recoverSeconds?: number;
  recoverEffort?: number;
  repeats?: number;
  extraBlocks?: ExtraCardioBlock[];
  workSettings?: CardioSettings;
  recoverSettings?: CardioSettings;
};

function clampMinutes(minutes: number, spec: CardioBuilderSpec): number {
  const { min, max, step } = spec.quickStart.minutes;
  const rounded = Math.round(minutes / step) * step;
  return Math.min(max, Math.max(min, rounded));
}

function interval(
  label: string,
  seconds: number,
  effort: number,
  machineId: CardioMachineId,
  spec: CardioBuilderSpec
): CardioPlanInterval {
  return {
    label,
    seconds,
    effort,
    settings: settingsForEffort(machineId, effort, spec),
  };
}

function fillIntervalBlocks(
  remaining: number,
  type: QuickStartType,
  machineId: CardioMachineId,
  spec: CardioBuilderSpec
): CardioPlanInterval[] {
  const workLabel = spec.quickStart.workLabel || type.label;
  const recoverLabel = spec.quickStart.recoverLabel || spec.quickStart.blockLabels.easy;
  const easyLabel = spec.quickStart.blockLabels.easy;
  const blocks: CardioPlanInterval[] = [];
  let left = remaining;
  const cycle = type.workSeconds + type.recoverSeconds;
  while (cycle > 0 && left >= cycle) {
    blocks.push(interval(workLabel, type.workSeconds, type.workEffort, machineId, spec));
    blocks.push(interval(recoverLabel, type.recoverSeconds, type.recoverEffort, machineId, spec));
    left -= cycle;
  }
  if (left > 0) {
    blocks.push(interval(easyLabel, left, type.recoverEffort, machineId, spec));
  }
  return blocks;
}

export type BuildQuickCardioPlanInput = {
  machineId: CardioMachineId;
  style: QuickStartStyle;
  minutes: number;
  includeWarmup: boolean;
};

function clampSeconds(value: number, spec: CardioBuilderSpec): number {
  const { secondsMin, secondsMax, secondsStep } = spec.buildIntervals.steppers;
  const rounded = Math.round(value / secondsStep) * secondsStep;
  return Math.min(secondsMax, Math.max(secondsMin, rounded));
}

function clampRepeats(value: number, spec: CardioBuilderSpec): number {
  const { repeatsMin, repeatsMax } = spec.buildIntervals.steppers;
  return Math.min(repeatsMax, Math.max(repeatsMin, Math.round(value)));
}

function clampEffort(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function toInterval(block: PlanBlockInput, spec: CardioBuilderSpec): CardioPlanInterval {
  const settings = {
    ...(block.settings ?? settingsForEffort(block.machineId, block.effort, spec)),
    machine_id: block.machineId,
  };
  return {
    label: block.label,
    seconds: block.seconds,
    effort: block.effort,
    settings,
  };
}

function insertSetupBlocks(blocks: PlanBlockInput[], spec: CardioBuilderSpec): PlanBlockInput[] {
  const out: PlanBlockInput[] = [];
  const change = spec.buildIntervals.advanced;
  for (const block of blocks) {
    const prev = out.at(-1);
    if (prev && prev.machineId !== block.machineId) {
      out.push({
        machineId: prev.machineId,
        seconds: change.machineChangeSeconds,
        effort: change.machineChangeEffort,
        label: change.machineChangeLabel,
      });
    }
    out.push(block);
  }
  return out;
}

function wrapWarmup(blocks: PlanBlockInput[], includeWarmup: boolean, spec: CardioBuilderSpec): PlanBlockInput[] {
  if (!includeWarmup || blocks.length === 0) return blocks;
  const warmup = spec.quickStart.warmup;
  const labels = spec.quickStart.blockLabels;
  const first = blocks[0].machineId;
  const last = blocks[blocks.length - 1]?.machineId ?? first;
  return [
    { machineId: first, seconds: warmup.secondsEach, effort: warmup.effort, label: labels.warmup },
    ...blocks,
    { machineId: last, seconds: warmup.secondsEach, effort: warmup.effort, label: labels.cooldown },
  ];
}

function capBlocks(blocks: PlanBlockInput[], maxSeconds: number, minSeconds: number): PlanBlockInput[] {
  const out: PlanBlockInput[] = [];
  let used = 0;
  for (const block of blocks) {
    if (used >= maxSeconds) break;
    const room = maxSeconds - used;
    if (block.seconds <= room) {
      out.push(block);
      used += block.seconds;
      continue;
    }
    if (room >= minSeconds) {
      out.push({ ...block, seconds: room });
    }
    break;
  }
  return out;
}

function finishPlan(
  blocks: PlanBlockInput[],
  options: {
    fallbackMachine: CardioMachineId;
    style: QuickStartStyle | 'mixed';
    summary?: string;
    beginnerOk: boolean;
  },
  spec: CardioBuilderSpec,
  machineName: string
): CardioPlan {
  const machines = [...new Set(blocks.map((item) => item.machineId))];
  const mixed = machines.length > 1;
  const machineId = mixed ? 'mixed' : (machines[0] ?? options.fallbackMachine);
  const style = mixed ? 'mixed' : options.style;
  const intervals = blocks.map((item) => toInterval(item, spec));
  const totalSeconds = intervals.reduce((sum, item) => sum + item.seconds, 0);
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  const efforts = intervals.map((item) => item.effort);
  const effortLow = efforts.length ? Math.min(...efforts) : 5;
  const effortHigh = efforts.length ? Math.max(...efforts) : 5;
  const middle = intervals.find((item) => item.label === spec.buildIntervals.workLabel) ?? intervals[0];
  const name = nameQuickCardioPlan(machineId, style, minutes, spec, machineName);
  return {
    slug: `custom-${machineId}-${style}-${minutes}`,
    name,
    summary: options.summary,
    machine_id: machineId,
    style,
    duration_minutes: minutes,
    max_minutes: spec.buildIntervals.maxMinutes,
    effort_target: effortLow === effortHigh ? effortLow : [effortLow, effortHigh],
    settings_guidance: middle?.settings ?? settingsForEffort(options.fallbackMachine, 5, spec),
    intervals,
    beginner_ok: options.beginnerOk && !mixed,
    counts_towards_weekly_target: minutes >= 10,
  };
}

function intervalsMiddle(input: BuildCardioPlanInput, spec: CardioBuilderSpec): PlanBlockInput[] {
  const workSeconds = clampSeconds(input.workSeconds ?? spec.buildIntervals.defaults.workSeconds, spec);
  const recoverSeconds = clampSeconds(
    input.recoverSeconds ?? spec.buildIntervals.defaults.recoverSeconds,
    spec
  );
  const workEffort = clampEffort(input.workEffort ?? spec.buildIntervals.defaults.workEffort);
  const recoverEffort = clampEffort(input.recoverEffort ?? spec.buildIntervals.defaults.recoverEffort);
  const repeats = clampRepeats(input.repeats ?? spec.buildIntervals.defaults.repeats, spec);
  const labels = spec.buildIntervals;
  const middle: PlanBlockInput[] = [];
  for (let i = 0; i < repeats; i += 1) {
    middle.push({
      machineId: input.machineId,
      seconds: workSeconds,
      effort: workEffort,
      label: labels.workLabel,
      settings: input.workSettings,
    });
    middle.push({
      machineId: input.machineId,
      seconds: recoverSeconds,
      effort: recoverEffort,
      label: labels.recoverLabel,
      settings: input.recoverSettings,
    });
  }
  const extras = input.extraBlocks ?? [];
  extras.forEach((item, index) => {
    if (item.machineId === 'mixed') return;
    middle.push({
      machineId: item.machineId,
      seconds: clampSeconds(item.seconds, spec),
      effort: clampEffort(item.effort),
      label: fill(labels.advanced.blockLabel, { n: index + 1 }),
      settings: item.settings,
    });
  });
  return middle;
}

function quickMiddle(input: BuildQuickCardioPlanInput, spec: CardioBuilderSpec): PlanBlockInput[] {
  const style = input.style === 'intervals' ? 'intervals' : 'steady';
  const minutes = clampMinutes(input.minutes, spec);
  const type = spec.quickStart.types.find((item) => item.id === style) ?? spec.quickStart.types[0];
  const warmupSpec = spec.quickStart.warmup;
  const labels = spec.quickStart.blockLabels;
  const totalSeconds = minutes * 60;
  let warmupSeconds = input.includeWarmup ? warmupSpec.secondsEach : 0;
  if (warmupSeconds * 2 >= totalSeconds) warmupSeconds = 0;
  const middleSeconds = Math.max(0, totalSeconds - warmupSeconds * 2);
  if (style === 'intervals' && type) {
    return fillIntervalBlocks(middleSeconds, type, input.machineId, spec).map((item) => ({
      machineId: input.machineId,
      seconds: item.seconds,
      effort: item.effort,
      label: item.label,
      settings: item.settings,
    }));
  }
  return [
    {
      machineId: input.machineId,
      seconds: middleSeconds,
      effort: type?.effort ?? 5,
      label: type?.label ?? labels.easy,
    },
  ];
}

function isIntervalsBuild(input: BuildCardioPlanInput): boolean {
  return input.repeats != null || (input.extraBlocks?.length ?? 0) > 0;
}

function plannedBlocks(input: BuildCardioPlanInput, spec: CardioBuilderSpec): PlanBlockInput[] {
  const middle = isIntervalsBuild(input) ? intervalsMiddle(input, spec) : quickMiddle(input, spec);
  return wrapWarmup(insertSetupBlocks(middle, spec), input.includeWarmup, spec);
}

export function cardioPlanLength(
  input: BuildCardioPlanInput,
  spec: CardioBuilderSpec
): { seconds: number; capped: boolean } {
  const seconds = plannedBlocks(input, spec).reduce((sum, item) => sum + item.seconds, 0);
  const maxSeconds = spec.buildIntervals.maxMinutes * 60;
  return { seconds: Math.min(seconds, maxSeconds), capped: seconds > maxSeconds };
}

/** Pure builder for W8 Quick start and Build intervals. Coach can reuse this later. */
export function buildCardioPlan(
  input: BuildCardioPlanInput,
  spec: CardioBuilderSpec,
  machineName: string
): CardioPlan {
  const type = spec.quickStart.types.find((item) => item.id === input.style) ?? spec.quickStart.types[0];
  const wrapped = plannedBlocks(input, spec);
  const maxSeconds = spec.buildIntervals.maxMinutes * 60;
  const capped = capBlocks(wrapped, maxSeconds, spec.buildIntervals.steppers.secondsMin);
  const style = isIntervalsBuild(input) ? 'intervals' : input.style === 'intervals' ? 'intervals' : 'steady';
  return finishPlan(
    capped,
    {
      fallbackMachine: input.machineId,
      style,
      summary: type?.sub,
      beginnerOk: style === 'steady',
    },
    spec,
    machineName
  );
}

export function buildQuickCardioPlan(
  input: BuildQuickCardioPlanInput,
  spec: CardioBuilderSpec,
  machineName: string
): CardioPlan {
  return buildCardioPlan(input, spec, machineName);
}
