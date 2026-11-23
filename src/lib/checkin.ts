/**
 * B2 v2 check-in copy and rules. Bundled from content/checkin/checkin.json.
 * The option she picked stays in component memory only. Never persist, log or send it.
 */
import file from '../../content/checkin/checkin.json';

import type { LifeStage } from '@/lib/profile';

type Json = Record<string, unknown>;

export const CHECKIN_ADJUSTMENTS = [
  'none',
  'push',
  'lighter',
  'comfort',
  'steady',
  'cool',
  'joint-friendly',
  'short',
] as const;
export type CheckinAdjustmentId = (typeof CHECKIN_ADJUSTMENTS)[number];

export const SESSION_FEELS = ['easier', 'as_expected', 'harder'] as const;
export type SessionFeel = (typeof SESSION_FEELS)[number];

export type CheckinOffer = {
  title: string;
  body: string;
  accept: string;
  decline: string;
};

export type CheckinOption = {
  id: string;
  label: string;
  showWhen: 'always' | 'not_menopause' | 'life_stage';
  adjustment: CheckinAdjustmentId;
  offer: CheckinOffer | null;
};

export type CheckinFeelOption = {
  id: SessionFeel;
  label: string;
};

export type ComfortAdjustment = {
  avoidFamilies: string[];
  /** Single exercises to swap even when the rest of their family is fine (e.g. forearm plank). */
  avoidExercises: string[];
  heavyBraceFamilies: string[];
  heavyBraceEquipment: string[];
};

export type JointFriendlyAdjustment = {
  preferEquipment: string[];
  /** Only these movement families are swapped (free-weight squats and lunges). */
  swapFamilies: string[];
};

export type CheckinCopy = {
  title: string;
  helper: string;
  skip: string;
  options: CheckinOption[];
  optionalLabel: string;
  loggerBadge: string;
  settingsTitle: string;
  settingsSub: string;
  feelTitle: string;
  feelHelper: string;
  feelSkip: string;
  feelOptions: CheckinFeelOption[];
  extraRestSeconds: number;
};

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseAdjustment(value: unknown): CheckinAdjustmentId {
  return (CHECKIN_ADJUSTMENTS as readonly string[]).includes(String(value))
    ? (value as CheckinAdjustmentId)
    : 'none';
}

function parseShowWhen(value: unknown): CheckinOption['showWhen'] {
  if (value === 'not_menopause' || value === 'life_stage') return value;
  return 'always';
}

function parseOffer(value: unknown): CheckinOffer | null {
  const row = asRecord(value);
  const title = text(row.title);
  const body = text(row.body);
  if (!title || !body) return null;
  return {
    title,
    body,
    accept: text(row.accept) || 'Yes, for today',
    decline: text(row.decline) || 'No thanks, keep it as planned',
  };
}

const root = asRecord(file);
const card = asRecord(root.card);
const settings = asRecord(root.settings);
const feel = asRecord(root.session_feel);
const adjustments = asRecord(root.adjustments);
const comfort = asRecord(adjustments.comfort);
const joints = asRecord(adjustments['joint-friendly']);
const cool = asRecord(adjustments.cool);

const options: CheckinOption[] = asArray(root.options).flatMap((item) => {
  const row = asRecord(item);
  const id = text(row.id);
  const label = text(row.label);
  if (!id || !label) return [];
  return [
    {
      id,
      label,
      showWhen: parseShowWhen(row.show_when),
      adjustment: parseAdjustment(row.adjustment),
      offer: parseOffer(row.offer),
    },
  ];
});

const feelOptions: CheckinFeelOption[] = asArray(feel.options).flatMap((item) => {
  const row = asRecord(item);
  const id = text(row.id);
  const label = text(row.label);
  if (!(SESSION_FEELS as readonly string[]).includes(id) || !label) return [];
  return [{ id: id as SessionFeel, label }];
});

export const CHECKIN: CheckinCopy = {
  title: text(card.title),
  helper: text(card.helper),
  skip: text(card.skip) || 'Skip',
  options,
  optionalLabel: text(root.optional_label) || 'Optional today',
  loggerBadge: text(root.logger_badge) || 'Adjusted for today',
  settingsTitle: text(settings.row_title),
  settingsSub: text(settings.row_sub),
  feelTitle: text(feel.title),
  feelHelper: text(feel.helper),
  feelSkip: text(feel.skip) || 'Skip',
  feelOptions,
  extraRestSeconds:
    typeof cool.extra_rest_seconds === 'number' && Number.isFinite(cool.extra_rest_seconds)
      ? Math.max(0, Math.round(cool.extra_rest_seconds))
      : 30,
};

export const COMFORT_RULES: ComfortAdjustment = {
  avoidFamilies: asArray(comfort.avoid_families).map(text).filter(Boolean),
  avoidExercises: asArray(comfort.avoid_exercises).map(text).filter(Boolean),
  heavyBraceFamilies: asArray(comfort.heavy_brace_families).map(text).filter(Boolean),
  heavyBraceEquipment: asArray(comfort.heavy_brace_equipment).map(text).filter(Boolean),
};

export const JOINT_FRIENDLY_RULES: JointFriendlyAdjustment = {
  preferEquipment: asArray(joints.prefer_equipment).map(text).filter(Boolean),
  swapFamilies: asArray(joints.swap_families).map(text).filter(Boolean),
};

export function adjustmentMarksLighter(adjustment: CheckinAdjustmentId): boolean {
  if (adjustment === 'none' || adjustment === 'push') return false;
  const row = asRecord(adjustments[adjustment]);
  return row.marks_lighter !== false;
}

export function visibleCheckinOptions(
  lifeStage: LifeStage | null | undefined,
  onPeriodDay = false
): CheckinOption[] {
  const options = CHECKIN.options.filter((option) => {
    if (option.showWhen === 'life_stage') {
      return lifeStage === 'perimenopause' || lifeStage === 'menopause';
    }
    if (option.showWhen === 'not_menopause') return lifeStage !== 'menopause';
    return true;
  });
  if (!onPeriodDay) return options;
  const period = options.filter((option) => option.id === 'period');
  const rest = options.filter((option) => option.id !== 'period');
  return [...period, ...rest];
}

export function parseSessionFeel(value: unknown): SessionFeel | null {
  return (SESSION_FEELS as readonly string[]).includes(String(value)) ? (value as SessionFeel) : null;
}

export function shouldShowCheckin(input: {
  isStrength: boolean;
  hideCheckin: boolean;
  resolved: boolean;
  hasTickedSet: boolean;
  alreadyLighter?: boolean;
}): boolean {
  if (!input.isStrength || input.hideCheckin || input.resolved || input.hasTickedSet) return false;
  if (input.alreadyLighter) return false;
  return CHECKIN.title.length > 0 && CHECKIN.options.length > 0;
}
