/**
 * B3 v2 life-stage adjustments. Read profiles.life_stage on the device only.
 * Never send this field to Coach, PostHog, RevenueCat or notifications.
 */
import onboarding from '../../content/onboarding/onboarding.json';

import {
  contentDayFor,
  contentPhaseForWeek,
  type ContentRoutineOverlay,
} from '@/lib/contentRoutines';
import type { LifeStage } from '@/lib/profile';
import type { PlacedSlot } from '@/lib/completeWeek';
import { WEEKDAYS, type Weekday } from '@/lib/onboardingAnswers';

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const root = asRecord(onboarding);
const rules = asRecord(asRecord(root.recommendation).life_stage_adjustments);
const bones = asRecord(rules.strong_bones_note);
const impact = asRecord(rules.impact_finisher);
const impactChoice = asRecord(impact.impact);
const walkChoice = asRecord(impact.lower_impact);
const balance = asRecord(rules.lower_body_warmup_balance_step);

export function isLifeStageActive(value: LifeStage | null | undefined): boolean {
  return value === 'perimenopause' || value === 'menopause';
}

export function strongBonesNote(): { title: string; body: string } | null {
  const title = text(bones.title);
  const body = text(bones.body);
  if (!title || !body) return null;
  return { title, body };
}

export type ImpactFinisherChoice = {
  id: string;
  label: string;
  body: string;
  cardioSlug: string | null;
};

export type ImpactFinisherCopy = {
  title: string;
  body: string;
  skip: string;
  minutes: number;
  impact: ImpactFinisherChoice;
  lowerImpact: ImpactFinisherChoice;
};

function parseChoice(row: Json, fallbackId: string): ImpactFinisherChoice {
  return {
    id: text(row.id) || fallbackId,
    label: text(row.label) || fallbackId,
    body: text(row.body),
    cardioSlug: text(row.cardio_slug) || null,
  };
}

export function impactFinisherCopy(): ImpactFinisherCopy {
  return {
    title: text(impact.title) || 'Optional finisher',
    body: text(impact.body),
    skip: text(impact.skip) || 'Skip',
    minutes: num(impact.minutes) ?? 3,
    impact: parseChoice(impactChoice, 'impact'),
    lowerImpact: parseChoice(walkChoice, 'lower_impact'),
  };
}

export type BalanceWarmupStep = {
  slug: string;
  name: string;
  durationSeconds: number;
  perSide: boolean;
  cue: string;
  note: string | null;
};

export function balanceWarmupStep(): BalanceWarmupStep {
  return {
    slug: text(balance.slug) || 'single-leg-stand',
    name: text(balance.name) || 'Single-leg stand',
    durationSeconds: num(balance.duration_seconds) ?? 20,
    perSide: balance.per_side !== false,
    cue: text(balance.cue),
    note: text(balance.note) || null,
  };
}

export function isLowerBodyFocus(focus: string | null | undefined, name = ''): boolean {
  const hay = `${focus ?? ''} ${name}`.toLowerCase();
  if (!hay.trim()) return false;
  if (/\bupper\b/.test(hay) && !/\blower\b/.test(hay) && !/full body|full-body/.test(hay)) {
    return false;
  }
  return /leg|glute|squat|hinge|hip|lower|full body|full-body/.test(hay);
}

export function isHardLowerBodyFocus(focus: string | null | undefined, name = ''): boolean {
  const hay = `${focus ?? ''} ${name}`.toLowerCase();
  if (/full body|full-body/.test(hay)) return false;
  if (/\bupper\b/.test(hay) && !/\blower\b/.test(hay)) return false;
  return /leg|glute|squat|hinge|hip|lower/.test(hay);
}

function focusForDayKey(
  overlay: ContentRoutineOverlay,
  weekNumber: number,
  dayKey: string | null
): { focus: string; name: string } {
  if (!dayKey) return { focus: '', name: '' };
  const day = contentDayFor(overlay, weekNumber, { name: '', day_key: dayKey });
  return { focus: day?.focus ?? '', name: day?.name ?? '' };
}

function isHardLowerSlot(
  overlay: ContentRoutineOverlay,
  weekNumber: number,
  slot: PlacedSlot
): boolean {
  if (slot.type !== 'strength' || !slot.day_key) return false;
  const { focus, name } = focusForDayKey(overlay, weekNumber, slot.day_key);
  return isHardLowerBodyFocus(focus, name);
}

function nextWeekday(day: Weekday): Weekday | null {
  const index = WEEKDAYS.indexOf(day);
  if (index < 0 || index >= WEEKDAYS.length - 1) return null;
  return WEEKDAYS[index + 1];
}

/**
 * When her week has room, keep a rest day between two hard lower-body sessions.
 * Never shortens the routine: days are only moved, never dropped.
 */
export function separateHardLowerDays(
  slots: PlacedSlot[],
  overlay: ContentRoutineOverlay,
  weekNumber: number
): PlacedSlot[] {
  if (overlay.lighter_weeks?.includes(weekNumber)) return slots;
  const byDay = new Map(slots.map((slot) => [slot.weekday, slot]));
  const ordered = WEEKDAYS.map((weekday) => byDay.get(weekday)).filter(Boolean) as PlacedSlot[];

  function restSlot(weekday: Weekday): PlacedSlot {
    return {
      weekday,
      type: 'rest',
      day_key: null,
      cardio_slug: null,
      stretch_slug: null,
      optional: false,
      name: null,
      minutes: null,
      finisher_slug: null,
      anytime: false,
    };
  }

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const current = ordered[i];
    const following = ordered[i + 1];
    if (!isHardLowerSlot(overlay, weekNumber, current)) continue;
    if (!isHardLowerSlot(overlay, weekNumber, following)) continue;
    const later = following;
    const swapWith = ordered.slice(i + 2).find((slot) => slot.type === 'strength' && !isHardLowerSlot(overlay, weekNumber, slot));
    if (swapWith) {
      const laterWeekday = later.weekday;
      const swapWeekday = swapWith.weekday;
      const movedLater = { ...later, weekday: swapWeekday };
      const movedSwap = { ...swapWith, weekday: laterWeekday };
      byDay.set(laterWeekday, movedSwap);
      byDay.set(swapWeekday, movedLater);
      return WEEKDAYS.map((weekday) => byDay.get(weekday) ?? restSlot(weekday));
    }
    const gap = nextWeekday(later.weekday);
    if (gap) {
      const occupant = byDay.get(gap);
      if (!occupant || occupant.type === 'rest') {
        byDay.set(later.weekday, restSlot(later.weekday));
        byDay.set(gap, { ...later, weekday: gap });
        return WEEKDAYS.map((weekday) => byDay.get(weekday) ?? restSlot(weekday));
      }
    }
  }
  return WEEKDAYS.map((weekday) => byDay.get(weekday) ?? restSlot(weekday));
}

export function phaseHasLowerBody(
  overlay: ContentRoutineOverlay | null | undefined,
  weekNumber: number,
  dayName: string,
  dayKey?: string | null
): boolean {
  if (!overlay) return isHardLowerBodyFocus(null, dayName);
  const day = contentDayFor(overlay, weekNumber, { name: dayName, day_key: dayKey });
  const phase = contentPhaseForWeek(overlay, weekNumber);
  return isLowerBodyFocus(day?.focus ?? phase?.name ?? null, day?.name ?? dayName);
}
