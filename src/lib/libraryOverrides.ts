import overridesFile from '../../content/exercises/library-overrides.json';
import { STRETCHES_ENABLED } from '@/config/features';

/**
 * Exercise library fixes from the 23 Nov 2026 audit, kept as content in
 * content/exercises/library-overrides.json. Applied on top of the Supabase
 * `exercises` table, so nothing in the database is changed or deleted.
 */

type Overrides = {
  merged_into?: Record<string, string>;
  stretch_ids?: string[];
  alternatives?: Record<string, string[]>;
  fixes?: Record<string, { primary_muscle?: string; equipment?: string }>;
  advanced?: string[];
  wrong_demo?: string[];
  no_demo_hidden?: string[];
};

const data = overridesFile as Overrides;
const MERGED = data.merged_into ?? {};
const STRETCH_IDS = new Set(data.stretch_ids ?? []);
const ADVANCED = new Set(data.advanced ?? []);
const WRONG_DEMO = new Set(data.wrong_demo ?? []);
const ALTERNATIVES = data.alternatives ?? {};
const FIXES = data.fixes ?? {};
const NO_DEMO_HIDDEN = new Set(data.no_demo_hidden ?? []);

/** Words that keep their capitals inside a sentence-case name. */
const KEEP_CASE = new Map(
  [
    'EZ',
    'T',
    'Y',
    'Romanian',
    'Bulgarian',
    'Smith',
    'Pallof',
    'Arnold',
    'Nordic',
    'Turkish',
    'Copenhagen',
  ].map((word) => [word.toLowerCase(), word])
);

/** "Single-Arm Lat Pulldown" → "Single-arm lat pulldown"; "EZ-Bar Curl" → "EZ-bar curl". */
export function toSentenceCase(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const lowered = trimmed.replace(/[A-Za-z']+/g, (word) => KEEP_CASE.get(word.toLowerCase()) ?? word.toLowerCase());
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

/** The id a duplicate was merged into, or null if it isn't a duplicate. */
export function mergedInto(exerciseId: string): string | null {
  return MERGED[exerciseId] ?? null;
}

/** Hidden from the exercise library list (duplicates, no demo yet, and stretches while they're switched off). */
export function isHiddenFromLibrary(exerciseId: string): boolean {
  if (MERGED[exerciseId] || NO_DEMO_HIDDEN.has(exerciseId)) return true;
  return !STRETCHES_ENABLED && STRETCH_IDS.has(exerciseId);
}

export function isAdvancedExercise(exerciseId: string): boolean {
  return ADVANCED.has(exerciseId);
}

/** Hidden from the library and the workout builder (duplicates, and exercises with no demo yet). */
export function isHiddenFromBuilder(exerciseId: string): boolean {
  return Boolean(MERGED[exerciseId]) || NO_DEMO_HIDDEN.has(exerciseId);
}

/** Animations that show a different movement; the placeholder shows instead. */
export function hasWrongDemo(exerciseId: string): boolean {
  return WRONG_DEMO.has(exerciseId);
}

/** Swaps for library exercises that aren't in the strength catalogue. Undefined if none are set. */
export function libraryAlternatives(exerciseId: string): string[] | undefined {
  return ALTERNATIVES[exerciseId];
}

export function libraryAlternativeEntries(): [string, string[]][] {
  return Object.entries(ALTERNATIVES);
}

/** Corrected tags plus a sentence-case name. Leaves every other field as it is. */
export function applyExerciseFixes<T extends { id: string; name: string }>(row: T): T {
  const fix = FIXES[row.id] ?? {};
  return { ...row, ...fix, name: toSentenceCase(row.name) };
}
