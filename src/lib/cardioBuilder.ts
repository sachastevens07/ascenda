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
  style: QuickStartStyle,
  minutes: number,
  spec: CardioBuilderSpec,
  machineName: string
): string {
  const template = style === 'intervals' ? spec.naming.intervals : spec.naming.steady;
  return fill(template, { machine: machineName, minutes });
}

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

/** Pure builder for W8 Quick start. Coach can reuse this later. */
export function buildQuickCardioPlan(
  input: BuildQuickCardioPlanInput,
  spec: CardioBuilderSpec,
  machineName: string
): CardioPlan {
  const style = input.style === 'intervals' ? 'intervals' : 'steady';
  const minutes = clampMinutes(input.minutes, spec);
  const type = spec.quickStart.types.find((item) => item.id === style) ?? spec.quickStart.types[0];
  const warmupSpec = spec.quickStart.warmup;
  const labels = spec.quickStart.blockLabels;
  const totalSeconds = minutes * 60;
  let warmupSeconds = input.includeWarmup ? warmupSpec.secondsEach : 0;
  if (warmupSeconds * 2 >= totalSeconds) warmupSeconds = 0;
  const middleSeconds = Math.max(0, totalSeconds - warmupSeconds * 2);

  const intervals: CardioPlanInterval[] = [];
  if (warmupSeconds > 0) {
    intervals.push(interval(labels.warmup, warmupSeconds, warmupSpec.effort, input.machineId, spec));
  }
  if (style === 'intervals' && type) {
    intervals.push(...fillIntervalBlocks(middleSeconds, type, input.machineId, spec));
  } else {
    const effort = type?.effort ?? 5;
    intervals.push(interval(type?.label ?? '', middleSeconds, effort, input.machineId, spec));
  }
  if (warmupSeconds > 0) {
    intervals.push(interval(labels.cooldown, warmupSeconds, warmupSpec.effort, input.machineId, spec));
  }

  const efforts = intervals.map((item) => item.effort);
  const effortLow = efforts.length ? Math.min(...efforts) : 5;
  const effortHigh = efforts.length ? Math.max(...efforts) : 5;
  const name = nameQuickCardioPlan(input.machineId, style, minutes, spec, machineName);
  const slug = `custom-${input.machineId}-${style}-${minutes}`;
  const middle = intervals.find((item) => item.label === type?.label) ?? intervals[0];

  return {
    slug,
    name,
    summary: type?.sub,
    machine_id: input.machineId,
    style,
    duration_minutes: minutes,
    max_minutes: minutes,
    effort_target: effortLow === effortHigh ? effortLow : [effortLow, effortHigh],
    settings_guidance: middle?.settings ?? settingsForEffort(input.machineId, 5, spec),
    intervals,
    beginner_ok: style === 'steady',
    counts_towards_weekly_target: minutes >= 10,
  };
}
