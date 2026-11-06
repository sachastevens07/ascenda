import catalogue from '../../content/warmups-cooldowns/warmups-cooldowns.json';

import { EQUIPMENT, type Equipment } from '@/lib/exercises';
import { usesWeight, type ProgrammeDay, type ProgrammeExercise } from '@/lib/programmes';
import {
  formatWeightInput,
  parseWeight,
  setKey,
  type SetEntry,
} from '@/lib/workoutLog';

export type BlockPlayStatus = 'pending' | 'done' | 'skipped';

export type WarmupMove = {
  slug: string;
  name: string;
  equipment: Equipment;
  cue: string;
  oneSpotAlternative: string | null;
};

export type ResolvedBlockStep = {
  slug: string;
  name: string;
  cue: string;
  note: string | null;
  durationSeconds: number | null;
  reps: number | null;
  perSide: boolean;
  alternativeName: string | null;
  equipment: Equipment;
};

export type ResolvedBlock = {
  id: string;
  name: string;
  kind: 'warmup' | 'cooldown';
  estimatedMinutes: number;
  intro: string;
  steps: ResolvedBlockStep[];
};

export type HoldPlayStep = {
  key: string;
  name: string;
  cue: string;
  note: string | null;
  /** Null means a reps step: she taps Done when she has finished. */
  durationSeconds: number | null;
  repsLabel: string | null;
  equipment: Equipment;
  exerciseId: string;
};

type CatalogueMove = {
  slug: string;
  name: string;
  equipment: string;
  cue: string;
  one_spot_alternative: string | null;
};

type CatalogueStep = {
  slug: string;
  duration_seconds?: number;
  reps?: number;
  per_side?: boolean;
  note?: string;
};

type CatalogueTemplate = {
  id: string;
  name: string;
  kind: 'warmup' | 'cooldown';
  estimated_minutes: number;
  intro: string;
  steps: CatalogueStep[];
};

const MOVES: CatalogueMove[] = catalogue.moves as CatalogueMove[];
const TEMPLATES: CatalogueTemplate[] = catalogue.templates as CatalogueTemplate[];

const MOVE_BY_SLUG = new Map(MOVES.map((move) => [move.slug, move]));
const TEMPLATE_BY_ID = new Map(TEMPLATES.map((template) => [template.id, template]));

export const RAMP_UP = [
  { reps: 8, fraction: 0.5 },
  { reps: 5, fraction: 0.75 },
] as const;

function asEquipment(value: string): Equipment {
  return (EQUIPMENT as readonly string[]).includes(value) ? (value as Equipment) : 'machine';
}

function resolveStep(step: CatalogueStep): ResolvedBlockStep | null {
  const move = MOVE_BY_SLUG.get(step.slug);
  if (!move) return null;
  const alt = move.one_spot_alternative ? MOVE_BY_SLUG.get(move.one_spot_alternative) : null;
  return {
    slug: move.slug,
    name: move.name,
    cue: move.cue,
    note: step.note?.trim() || null,
    durationSeconds: typeof step.duration_seconds === 'number' ? step.duration_seconds : null,
    reps: typeof step.reps === 'number' ? step.reps : null,
    perSide: Boolean(step.per_side),
    alternativeName: alt?.name ?? null,
    equipment: asEquipment(move.equipment),
  };
}

export function getWarmupTemplate(id: string): ResolvedBlock | null {
  const template = TEMPLATE_BY_ID.get(id);
  if (!template) return null;
  const steps = template.steps.flatMap((step) => {
    const resolved = resolveStep(step);
    return resolved ? [resolved] : [];
  });
  if (steps.length === 0) return null;
  return {
    id: template.id,
    name: template.name,
    kind: template.kind,
    estimatedMinutes: template.estimated_minutes,
    intro: template.intro,
    steps,
  };
}

function pickTemplateId(
  kind: 'warmup' | 'cooldown',
  focus: string | null | undefined,
  dayName: string,
  sessionMinutes?: number | null
): string {
  if (sessionMinutes !== null && sessionMinutes !== undefined && sessionMinutes <= 35) {
    return `${kind}-quick`;
  }
  const hay = `${focus ?? ''} ${dayName}`.toLowerCase();
  if (/\bupper\b|\bpush\b|\bpull\b|shoulder|press/.test(hay) && !/full body|full-body/.test(hay)) {
    return `${kind}-upper-body`;
  }
  if (/\blower\b|glute|\bleg\b|squat|hinge/.test(hay)) {
    return `${kind}-lower-body`;
  }
  return `${kind}-full-body`;
}

export function blockForSession(
  kind: 'warmup' | 'cooldown',
  day: Pick<ProgrammeDay, 'name' | 'focus'>,
  sessionMinutes?: number | null
): ResolvedBlock | null {
  return getWarmupTemplate(pickTemplateId(kind, day.focus, day.name, sessionMinutes));
}

export function formatBlockStepLine(step: ResolvedBlockStep): string {
  const amount = step.durationSeconds
    ? step.durationSeconds >= 60
      ? step.durationSeconds % 60 === 0
        ? `${step.durationSeconds / 60} min`
        : `${Math.floor(step.durationSeconds / 60)} min ${step.durationSeconds % 60} s`
      : `${step.durationSeconds} s`
    : step.reps
      ? step.perSide
        ? `${step.reps} each side`
        : `${step.reps} reps`
      : null;
  return amount ? `${step.name} · ${amount}` : step.name;
}

export function playStepsFromBlock(block: ResolvedBlock): HoldPlayStep[] {
  const steps: HoldPlayStep[] = [];
  for (const [index, step] of block.steps.entries()) {
    const noteParts = [step.note, step.alternativeName ? `Busy? ${step.alternativeName}` : null].filter(
      Boolean
    ) as string[];
    const note = noteParts.join(' ') || null;
    if (step.durationSeconds && step.perSide) {
      for (const side of ['Left', 'Right'] as const) {
        steps.push({
          key: `${block.id}-${index}-${side}`,
          name: `${step.name} · ${side.toLowerCase()}`,
          cue: step.cue,
          note,
          durationSeconds: step.durationSeconds,
          repsLabel: null,
          equipment: step.equipment,
          exerciseId: step.slug,
        });
      }
      continue;
    }
    steps.push({
      key: `${block.id}-${index}`,
      name: step.name,
      cue: step.cue,
      note,
      durationSeconds: step.durationSeconds,
      repsLabel: step.reps
        ? step.perSide
          ? `${step.reps} each side`
          : `${step.reps} reps`
        : null,
      equipment: step.equipment,
      exerciseId: step.slug,
    });
  }
  return steps;
}

export function firstMainLift(day: ProgrammeDay): ProgrammeExercise | null {
  return day.exercises.find((item) => item.role === 'main') ?? day.exercises[0] ?? null;
}

export function canRampUp(item: ProgrammeExercise): boolean {
  return usesWeight(item.exercise.equipment) && (item.exercise.weight_increase_kg ?? 0) >= 0;
}

function incrementKg(item: ProgrammeExercise): number {
  const fromSlot = item.load_increment_kg;
  if (fromSlot && fromSlot > 0) return fromSlot;
  const fromExercise = item.exercise.weight_increase_kg;
  if (fromExercise && fromExercise > 0) return fromExercise;
  return 2.5;
}

export function roundRampWeight(kg: number, increment: number): number {
  const step = increment > 0 ? increment : 0.5;
  const rounded = Math.round(kg / step) * step;
  return Math.max(step, Number(rounded.toFixed(2)));
}

function rampWeight(workingKg: number | null, fraction: number, increment: number): string {
  if (workingKg === null || workingKg <= 0) return '';
  return formatWeightInput(roundRampWeight(workingKg * fraction, increment));
}

/** Two W sets on the first main lift: 8 reps at about 50%, then 5 at about 75%. */
export function applyRampUp(
  day: ProgrammeDay,
  entries: Record<string, SetEntry>,
  alreadyApplied = false
): { day: ProgrammeDay; entries: Record<string, SetEntry> } {
  const main = firstMainLift(day);
  if (!main || !canRampUp(main)) return { day, entries };
  const existing = main.warmup_sets ?? 0;
  if (alreadyApplied && existing === 0) return { day, entries };
  const nextDay: ProgrammeDay = {
    ...day,
    exercises: day.exercises.map((item) =>
      item.position === main.position
        ? { ...item, warmup_sets: Math.max(existing, RAMP_UP.length) }
        : item
    ),
  };
  const slot = nextDay.exercises.find((item) => item.position === main.position) ?? main;
  const working = parseWeight(entries[setKey(slot.exercise.id, 1)]?.weight ?? '');
  const step = incrementKg(slot);
  const nextEntries = { ...entries };
  RAMP_UP.forEach((ramp, index) => {
    const setNumber = -index;
    const key = setKey(slot.exercise.id, setNumber);
    const current = nextEntries[key];
    if (current?.completed) return;
    nextEntries[key] = {
      weight: current?.weight || rampWeight(working, ramp.fraction, step),
      reps: current?.reps || String(ramp.reps),
      completed: false,
    };
  });
  return { day: nextDay, entries: nextEntries };
}

export function warmupTemplateCount(): number {
  return TEMPLATES.length;
}

export function warmupMoveCount(): number {
  return MOVES.length;
}
