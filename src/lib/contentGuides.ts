/**
 * First-time guides and "if it's taken" swaps from /content.
 * Bundled so the swap engine and exercise pages work before a live sync.
 */
import { libraryAlternativeEntries } from '@/lib/libraryOverrides';
import catalogueFile from '../../content/exercises/strength-catalogue.json';
import coreGuides from '../../content/exercise-guides/core-and-carries.json';
import lowerGuides from '../../content/exercise-guides/lower-body.json';
import upperGuides from '../../content/exercise-guides/upper-body.json';

/** Content slugs that already exist in the library under a different id. */
export const EXERCISE_SLUG_ALIASES: Record<string, string> = {
  'chest-press-machine': 'machine-chest-press',
  'seated-dumbbell-shoulder-press': 'dumbbell-shoulder-press',
  'standing-dumbbell-shoulder-press': 'dumbbell-shoulder-press',
  'shoulder-press-machine': 'machine-shoulder-press',
  'bodyweight-glute-bridge': 'glute-bridge',
};

export type ExerciseGuide = {
  slug: string;
  where_to_find: string;
  setup: string[];
  form_cues: string[];
  where_you_should_feel_it: string | null;
  common_mistakes: string[];
  if_its_taken: { swaps: string[]; tip: string };
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

function parseGuide(raw: unknown): ExerciseGuide | null {
  const item = asRecord(raw);
  const slug = text(item.slug);
  if (!slug) return null;
  const taken = asRecord(item.if_its_taken);
  return {
    slug,
    where_to_find: text(item.where_to_find),
    setup: asArray(item.setup).map(text).filter(Boolean),
    form_cues: asArray(item.form_cues).map(text).filter(Boolean),
    where_you_should_feel_it: text(item.where_you_should_feel_it) || null,
    common_mistakes: asArray(item.common_mistakes).map(text).filter(Boolean),
    if_its_taken: {
      swaps: asArray(taken.swaps).map(text).filter(Boolean),
      tip: text(taken.tip),
    },
  };
}

const GUIDES = new Map<string, ExerciseGuide>();
for (const file of [lowerGuides, upperGuides, coreGuides]) {
  for (const item of asArray(asRecord(file).guides)) {
    const guide = parseGuide(item);
    if (guide) GUIDES.set(guide.slug, guide);
  }
}

const CATALOGUE_ALTS = new Map<string, string[]>();
const CATALOGUE_FAMILY = new Map<string, string>();
for (const item of asArray(asRecord(catalogueFile).exercises)) {
  const row = asRecord(item);
  const slug = text(row.slug);
  if (!slug) continue;
  CATALOGUE_ALTS.set(
    slug,
    asArray(row.alternatives)
      .map(text)
      .filter(Boolean)
      .slice(0, 3)
  );
  const family = text(row.family);
  if (family) CATALOGUE_FAMILY.set(slug, family);
}

// Library exercises outside the catalogue get their swaps from library-overrides.json.
for (const [libraryId, alternatives] of libraryAlternativeEntries()) {
  if (!CATALOGUE_ALTS.has(libraryId)) CATALOGUE_ALTS.set(libraryId, alternatives.slice(0, 3));
}

const CATALOGUE_SLUG_FOR_LIBRARY: Record<string, string> = {};
for (const [catalogueSlug, libraryId] of Object.entries(EXERCISE_SLUG_ALIASES)) {
  CATALOGUE_SLUG_FOR_LIBRARY[libraryId] = catalogueSlug;
}

export function resolveExerciseSlug(slug: string): string {
  const trimmed = slug.trim();
  return EXERCISE_SLUG_ALIASES[trimmed] ?? trimmed;
}

function catalogueKey(exerciseId: string): string {
  if (CATALOGUE_ALTS.has(exerciseId) || CATALOGUE_FAMILY.has(exerciseId)) return exerciseId;
  const slug = resolveExerciseSlug(exerciseId);
  if (CATALOGUE_ALTS.has(slug) || CATALOGUE_FAMILY.has(slug)) return slug;
  const fromLibrary = CATALOGUE_SLUG_FOR_LIBRARY[exerciseId] ?? CATALOGUE_SLUG_FOR_LIBRARY[slug];
  if (fromLibrary) return fromLibrary;
  return slug;
}

export function catalogueFamily(exerciseId: string): string | null {
  return CATALOGUE_FAMILY.get(catalogueKey(exerciseId)) ?? null;
}

export function guideForExercise(exerciseId: string): ExerciseGuide | null {
  const slug = resolveExerciseSlug(exerciseId);
  return GUIDES.get(exerciseId) ?? GUIDES.get(slug) ?? null;
}

export function allExerciseGuides(): ExerciseGuide[] {
  return [...GUIDES.values()];
}

/**
 * "If it's taken" swaps from the strength catalogue only. Closest first, up to 3.
 * Never padded from guides, other patterns or extra lists.
 */
export function preferredSwapIds(exerciseId: string, _extra: string[] = []): string[] {
  const slug = resolveExerciseSlug(exerciseId);
  const seen = new Set<string>([exerciseId, slug, catalogueKey(exerciseId)]);
  const out: string[] = [];
  for (const raw of CATALOGUE_ALTS.get(catalogueKey(exerciseId)) ?? []) {
    const id = resolveExerciseSlug(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length === 3) break;
  }
  return out;
}
