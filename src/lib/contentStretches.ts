import stretchFile from '../../content/stretches/stretch-routines.json';

type Json = Record<string, unknown>;

export const STRETCH_TIME_RANGES = ['under_5', '5_10', '10_20'] as const;
export type StretchTimeRange = (typeof STRETCH_TIME_RANGES)[number];

export const STRETCH_AREAS = ['full_body', 'lower_body', 'upper_body', 'hips', 'back'] as const;
export type StretchArea = (typeof STRETCH_AREAS)[number];

export const STRETCH_OCCASIONS = ['morning', 'pre_workout', 'post_workout', 'evening'] as const;
export type StretchOccasion = (typeof STRETCH_OCCASIONS)[number];

export type ContentStretch = {
  slug: string;
  area: StretchArea | null;
  occasions: StretchOccasion[];
  minutes: number;
  description: string;
};

const REP_SECONDS = 4;

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
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseArea(value: unknown): StretchArea | null {
  const key = text(value);
  return STRETCH_AREAS.includes(key as StretchArea) ? (key as StretchArea) : null;
}

function parseOccasion(value: unknown): StretchOccasion | null {
  const key = text(value).replace(/-/g, '_');
  if (key === 'recovery_day') return 'evening';
  return STRETCH_OCCASIONS.includes(key as StretchOccasion) ? (key as StretchOccasion) : null;
}

function parseOccasions(row: Json): StretchOccasion[] {
  const listed = asArray(row.occasions).flatMap((item) => {
    const occasion = parseOccasion(item);
    return occasion ? [occasion] : [];
  });
  if (listed.length > 0) return [...new Set(listed)];
  const fallback = parseOccasion(row.occasion);
  return fallback ? [fallback] : [];
}

function stepSeconds(raw: unknown): number {
  const step = asRecord(raw);
  const duration = num(step.duration_seconds);
  if (duration != null && duration > 0) return duration;
  const reps = num(step.reps);
  if (reps != null && reps > 0) return reps * REP_SECONDS;
  return 0;
}

function sessionSeconds(steps: unknown[]): number {
  return steps.reduce<number>((sum, step) => sum + stepSeconds(step), 0);
}

export function roundUpMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 1;
  return Math.ceil(seconds / 60);
}

export function stretchTimeRange(minutes: number): StretchTimeRange {
  if (minutes < 5) return 'under_5';
  if (minutes <= 10) return '5_10';
  return '10_20';
}

function parseStretch(raw: unknown): ContentStretch | null {
  const row = asRecord(raw);
  const slug = text(row.slug);
  if (!slug) return null;
  const fromSteps = sessionSeconds(asArray(row.steps));
  const minutes = fromSteps > 0 ? roundUpMinutes(fromSteps) : Math.max(1, num(row.duration_minutes) ?? 1);
  return {
    slug,
    area: parseArea(row.area),
    occasions: parseOccasions(row),
    minutes,
    description: text(row.short_description),
  };
}

const BY_SLUG = new Map<string, ContentStretch>();
for (const item of asArray(asRecord(stretchFile).stretch_routines)) {
  const stretch = parseStretch(item);
  if (stretch) BY_SLUG.set(stretch.slug, stretch);
}

export function contentStretch(slug: string | null | undefined): ContentStretch | null {
  if (!slug) return null;
  return BY_SLUG.get(slug) ?? null;
}

export function isStretchSlug(slug: string | null | undefined): boolean {
  return contentStretch(slug) != null;
}

export function stretchSessionMinutes(slug: string | null | undefined, fallback?: number): number {
  const fromContent = contentStretch(slug)?.minutes;
  if (fromContent != null) return fromContent;
  if (fallback != null && Number.isFinite(fallback) && fallback > 0) return Math.ceil(fallback);
  return 1;
}

export function stretchMatchesFilters(
  slug: string,
  filters: {
    time: StretchTimeRange | null;
    area: StretchArea | null;
    occasion: StretchOccasion | null;
  }
): boolean {
  const stretch = contentStretch(slug);
  if (!stretch) return !filters.time && !filters.area && !filters.occasion;
  if (filters.time && stretchTimeRange(stretch.minutes) !== filters.time) return false;
  if (filters.area && stretch.area !== filters.area) return false;
  if (filters.occasion && !stretch.occasions.includes(filters.occasion)) return false;
  return true;
}
