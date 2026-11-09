import catalogueFile from '../../content/exercises/strength-catalogue.json';
import guidesFile from '../../content/machine-guides/machine-guides.json';

import { resolveExerciseSlug } from '@/lib/contentGuides';

export const MACHINE_TYPES = ['cardio', 'strength'] as const;
export type MachineType = (typeof MACHINE_TYPES)[number];

export type MachineGuide = {
  id: string;
  name: string;
  type: MachineType;
  imageSlug: string;
  whereToFind: string;
  setup: string[];
  startAndStop: string[];
  useKind: 'start' | 'use';
  beginnerSettings: string;
  commonMistakes: string[];
  etiquette: string[];
  exerciseSlugs: string[];
};

export type MachineExercise = {
  slug: string;
  name: string;
};

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

function strings(value: unknown): string[] {
  return asArray(value).map(text).filter(Boolean);
}

const exerciseNames = new Map<string, string>();
for (const item of asArray(asRecord(catalogueFile).exercises)) {
  const row = asRecord(item);
  const slug = text(row.slug);
  const name = text(row.name);
  if (slug && name) exerciseNames.set(slug, name);
}

function parseGuide(raw: unknown): MachineGuide | null {
  const row = asRecord(raw);
  const id = text(row.id);
  const name = text(row.name);
  const type = row.type === 'cardio' || row.type === 'strength' ? row.type : null;
  if (!id || !name || !type) return null;
  const start = strings(row.start_and_stop);
  const use = strings(row.how_to_use);
  return {
    id,
    name,
    type,
    imageSlug: text(row.image_slug) || `machine-${id.replace(/_/g, '-')}`,
    whereToFind: text(row.where_to_find),
    setup: strings(row.setup),
    startAndStop: start.length > 0 ? start : use,
    useKind: start.length > 0 ? 'start' : 'use',
    beginnerSettings: text(row.beginner_settings),
    commonMistakes: strings(row.common_mistakes),
    etiquette: strings(row.etiquette),
    exerciseSlugs: strings(row.exercises).map(resolveExerciseSlug),
  };
}

const guides = asArray(asRecord(guidesFile).machines)
  .map(parseGuide)
  .filter((item): item is MachineGuide => item !== null);

const byId = new Map(guides.map((item) => [item.id, item]));

const byExercise = new Map<string, MachineGuide>();
for (const raw of asArray(asRecord(guidesFile).machines)) {
  const row = asRecord(raw);
  const guide = byId.get(text(row.id));
  if (!guide) continue;
  for (const slug of [...strings(row.exercises), ...guide.exerciseSlugs]) {
    if (!byExercise.has(slug)) byExercise.set(slug, guide);
  }
}

export function allMachineGuides(): MachineGuide[] {
  return guides;
}

export function cardioMachineGuides(): MachineGuide[] {
  return guides.filter((item) => item.type === 'cardio');
}

export function strengthMachineGuides(): MachineGuide[] {
  return guides.filter((item) => item.type === 'strength');
}

export function machineGuide(id: string | null | undefined): MachineGuide | null {
  if (!id) return null;
  return byId.get(id) ?? byId.get(id.replace(/-/g, '_')) ?? null;
}

export function machineGuideForExercise(exerciseId: string | null | undefined): MachineGuide | null {
  if (!exerciseId) return null;
  const slug = resolveExerciseSlug(exerciseId);
  return byExercise.get(exerciseId) ?? byExercise.get(slug) ?? null;
}

export function machineExercises(guide: MachineGuide): MachineExercise[] {
  return guide.exerciseSlugs.map((slug) => ({
    slug,
    name: exerciseNames.get(slug) ?? slug.replace(/-/g, ' '),
  }));
}
