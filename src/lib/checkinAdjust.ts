/**
 * B2 v2 today-only session adjustments. Never persist which option she picked.
 */
import { fetchBusyGymSlots } from '@/lib/busyGymFix';
import { cardioSession, gentleCardioFinisher, type CardioSessionDef } from '@/lib/cardio';
import {
  adjustmentMarksLighter,
  CHECKIN,
  COMFORT_RULES,
  JOINT_FRIENDLY_RULES,
  type CheckinAdjustmentId,
} from '@/lib/checkin';
import { catalogueFamily, preferredSwapIds } from '@/lib/contentGuides';
import type { Equipment } from '@/lib/exercises';
import {
  getWeightSuggestion,
  type ProgrammeDay,
  type ProgrammeExercise,
  type SlotExercise,
} from '@/lib/programmes';
import type { ExerciseRole } from '@/lib/routineStandard';
import type { LoggedSet } from '@/lib/sessions';
import {
  applyCheckinLighter,
  applySessionPlan,
  sessionPlanFromDay,
  type SessionPlan,
} from '@/lib/workoutLog';

const KEY_ROLES: ExerciseRole[] = ['main', 'secondary'];
const MACHINE_LIKE = new Set<Equipment>(['machine', 'cable']);

export type CheckinAdjustmentResult = {
  day: ProgrammeDay;
  plan: SessionPlan;
  marksLighter: boolean;
  holdIncrease: boolean;
  extraWarmup: boolean;
  finisherSlug: string | null;
};

function roleOf(item: ProgrammeExercise): ExerciseRole | undefined {
  return item.role;
}

function pickAlt(
  item: ProgrammeExercise,
  byId: Map<string, SlotExercise>,
  fits: (alt: SlotExercise) => boolean
): SlotExercise | null {
  const used = new Set([item.exercise.id]);
  for (const id of preferredSwapIds(item.exercise.id, item.alternative_exercise_ids)) {
    if (used.has(id)) continue;
    const alt = byId.get(id);
    if (!alt || used.has(alt.id)) continue;
    used.add(alt.id);
    if (fits(alt)) return alt;
  }
  return null;
}

function swapOrOptional(
  item: ProgrammeExercise,
  alt: SlotExercise | null
): ProgrammeExercise {
  if (alt && alt.id !== item.exercise.id) {
    return { ...item, exercise: alt, original: item.original ?? item.exercise, optional: false };
  }
  return { ...item, optional: true };
}

function comfortItem(item: ProgrammeExercise, byId: Map<string, SlotExercise>): ProgrammeExercise {
  const family = catalogueFamily(item.exercise.id) ?? '';
  if (COMFORT_RULES.avoidFamilies.includes(family)) {
    const alt = pickAlt(
      item,
      byId,
      (row) => !COMFORT_RULES.avoidFamilies.includes(catalogueFamily(row.id) ?? '')
    );
    return swapOrOptional(item, alt);
  }
  const heavy =
    COMFORT_RULES.heavyBraceFamilies.includes(family) &&
    COMFORT_RULES.heavyBraceEquipment.includes(item.exercise.equipment);
  if (!heavy) return item;
  const alt = pickAlt(
    item,
    byId,
    (row) => !COMFORT_RULES.heavyBraceEquipment.includes(row.equipment)
  );
  return swapOrOptional(item, alt);
}

function jointItem(item: ProgrammeExercise, byId: Map<string, SlotExercise>): ProgrammeExercise {
  if (MACHINE_LIKE.has(item.exercise.equipment)) return item;
  const prefer = new Set(
    JOINT_FRIENDLY_RULES.preferEquipment.length > 0
      ? JOINT_FRIENDLY_RULES.preferEquipment
      : ['machine', 'cable']
  );
  const alt = pickAlt(item, byId, (row) => prefer.has(row.equipment));
  return swapOrOptional(item, alt);
}

export function lowImpactCardioFinisher(slug: string | null | undefined): CardioSessionDef | null {
  const original = cardioSession(slug);
  const incline = cardioSession('incline-walk-finisher-10') ?? cardioSession('incline-walk-20');
  const bike = cardioSession('easy-bike-20');
  if (!original) return incline ?? bike ?? null;
  if (original.machineId === 'treadmill' || original.machineId === 'stair_climber') {
    return incline ?? gentleCardioFinisher(slug);
  }
  return gentleCardioFinisher(slug) ?? bike ?? original;
}

function finisherForAdjustment(
  adjustment: CheckinAdjustmentId,
  currentSlug: string | null
): string | null {
  if (adjustment === 'lighter' || adjustment === 'cool' || adjustment === 'steady') {
    return gentleCardioFinisher(currentSlug)?.slug ?? currentSlug;
  }
  if (adjustment === 'joint-friendly') {
    return lowImpactCardioFinisher(currentSlug)?.slug ?? currentSlug;
  }
  return currentSlug;
}

async function loadAlts(day: ProgrammeDay): Promise<Map<string, SlotExercise>> {
  const ids = day.exercises.flatMap((item) => [
    item.exercise.id,
    ...preferredSwapIds(item.exercise.id, item.alternative_exercise_ids),
  ]);
  const byId = await fetchBusyGymSlots(ids);
  for (const item of day.exercises) {
    if (!byId.has(item.exercise.id)) byId.set(item.exercise.id, item.exercise);
  }
  return byId;
}

function withExtraRest(day: ProgrammeDay, extra: number): ProgrammeDay {
  if (extra <= 0) return day;
  return {
    ...day,
    exercises: day.exercises.map((item) => ({
      ...item,
      rest_seconds: (item.rest_seconds ?? 90) + extra,
    })),
  };
}

function keyLiftsOnly(day: ProgrammeDay): ProgrammeDay {
  const kept = day.exercises.filter((item) => {
    const role = roleOf(item);
    return role == null || KEY_ROLES.includes(role);
  });
  return { ...day, exercises: kept.length > 0 ? kept : day.exercises.slice(0, 1) };
}

export async function applyCheckinAdjustment(input: {
  day: ProgrammeDay;
  adjustment: CheckinAdjustmentId;
  previous: Record<string, LoggedSet[]>;
  finisherSlug?: string | null;
}): Promise<CheckinAdjustmentResult> {
  const marksLighter = adjustmentMarksLighter(input.adjustment);
  let day = input.day;
  let holdIncrease = false;
  let extraWarmup = false;
  let easePlan: SessionPlan | null = null;

  if (input.adjustment === 'lighter') {
    const light = applyCheckinLighter(day, { scaleWeights: true });
    day = light.day;
    easePlan = light.plan;
  } else if (input.adjustment === 'short') {
    day = keyLiftsOnly(day);
  } else if (input.adjustment === 'comfort') {
    const byId = await loadAlts(day);
    day = { ...day, exercises: day.exercises.map((item) => comfortItem(item, byId)) };
  } else if (input.adjustment === 'joint-friendly') {
    const byId = await loadAlts(day);
    day = { ...day, exercises: day.exercises.map((item) => jointItem(item, byId)) };
    extraWarmup = true;
  } else if (input.adjustment === 'cool') {
    day = withExtraRest(day, CHECKIN.extraRestSeconds);
  } else if (input.adjustment === 'steady') {
    holdIncrease = true;
  } else if (input.adjustment === 'push') {
    day = {
      ...day,
      exercises: day.exercises.map((item) => {
        if (item.role !== 'main') return item;
        const suggestion = getWeightSuggestion(item, input.previous[item.exercise.id] ?? []);
        return suggestion.kind === 'increase' ? { ...item, notes: item.notes ?? undefined } : item;
      }),
    };
  }

  const plan = easePlan ?? sessionPlanFromDay(day, undefined, null, {
    holdIncrease,
    extraWarmup,
    checkinResolved: true,
    lighterChosen: marksLighter,
    checkinFinisherSlug: finisherForAdjustment(input.adjustment, input.finisherSlug ?? null),
  });
  plan.holdIncrease = holdIncrease;
  plan.extraWarmup = extraWarmup;
  plan.checkinResolved = true;
  plan.lighterChosen = marksLighter;
  plan.checkinFinisherSlug = finisherForAdjustment(input.adjustment, input.finisherSlug ?? null);

  return {
    day: applySessionPlan(day, plan),
    plan,
    marksLighter,
    holdIncrease,
    extraWarmup,
    finisherSlug: plan.checkinFinisherSlug ?? null,
  };
}
