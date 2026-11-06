/**
 * Learn articles from content/learn/articles.json (AGENTS.md N6).
 * Bundled. content:sync reports the file; bodies stay in the app until a database body is set.
 */
import file from '../../content/learn/articles.json';

import { parseGoal, type Goal } from '@/lib/goals';
import type { LearnArticle, LearnCategory, LearnLink, LearnSource } from '@/lib/learn';

type Json = Record<string, unknown>;

const CATEGORY_MAP: Record<string, LearnCategory> = {
  getting_started: 'getting_started',
  gym_confidence: 'gym_confidence',
  technique: 'technique',
  programmes: 'programmes',
  how_programmes_work: 'programmes',
  recovery: 'recovery',
  recovery_and_sleep: 'recovery',
  fuelling: 'fuelling',
  mindset: 'mindset',
  myths: 'myths',
};

/** Older bundled ids → content slugs so marked-as-read and deep links still resolve. */
export const LEARN_ARTICLE_ALIASES: Record<string, string> = {
  'first-gym-session': 'your-first-gym-session',
  'how-logging-helps': 'how-to-read-your-plan',
  'starting-weights': 'choosing-your-starting-weight',
  'if-kit-is-taken': 'when-the-machine-is-taken',
  'squat-and-hinge': 'how-to-squat-with-confidence',
  'brace-and-breathe': 'how-to-brace-your-core',
  'how-routines-are-built': 'why-routines-have-phases',
  'double-progression': 'progressive-overload',
  'rest-days-count': 'rest-days-and-recovery',
  'sleep-and-training': 'sleep-and-strength',
  'eating-around-training': 'what-to-eat-before-and-after-training',
  'protein-without-the-noise': 'protein-for-training',
  'coming-back': 'coming-back-after-a-break',
  'you-will-not-bulk-overnight': 'will-lifting-make-me-bulky',
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

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mapCategory(raw: string): LearnCategory | null {
  return CATEGORY_MAP[raw] ?? null;
}

function parseSources(value: unknown): LearnSource[] {
  return asArray(value).flatMap((item) => {
    const row = asRecord(item);
    const label = text(row.label) || text(row.title);
    const url = text(row.url);
    return label && url ? [{ label, url }] : [];
  });
}

function parseArticle(raw: unknown): (LearnArticle & {
  recommended_for_goals: Goal[];
  related_routines: string[];
  related_exercises: string[];
}) | null {
  const row = asRecord(raw);
  const slug = text(row.slug);
  const title = text(row.title);
  const body = text(row.body_markdown);
  const category = mapCategory(text(row.category));
  if (!slug || !title || !body || !category) return null;
  return {
    id: slug,
    slug,
    title,
    summary: text(row.summary),
    category,
    read_minutes: num(row.read_minutes) ?? 3,
    cover_image_id: text(row.cover_image_slug) || text(row.cover_image_id) || `learn-${slug}`,
    body_markdown: typeof row.body_markdown === 'string' ? row.body_markdown : body,
    is_pro: row.is_pro === true,
    sources: parseSources(row.sources),
    reviewed_by: text(row.reviewed_by) || null,
    reviewed_at: text(row.reviewed_at) || null,
    published_at: text(row.published_at) || '2026-11-06',
    sort_order: num(row.sort_order) ?? 99,
    recommended_for_goals: asArray(row.recommended_for_goals)
      .map(parseGoal)
      .filter((goal): goal is Goal => Boolean(goal)),
    related_routines: asArray(row.related_routines).map(text).filter(Boolean),
    related_exercises: asArray(row.related_exercises).map(text).filter(Boolean),
  };
}

const PARSED = asArray(asRecord(file).articles)
  .map(parseArticle)
  .filter((item): item is NonNullable<typeof item> => Boolean(item))
  .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));

export const LEARN_ARTICLES: LearnArticle[] = PARSED.map(
  ({ recommended_for_goals: _goals, related_routines: _routines, related_exercises: _exercises, ...article }) =>
    article
);

export const LEARN_ARTICLE_GOALS: Record<string, Goal[]> = Object.fromEntries(
  PARSED.map((item) => [item.id, item.recommended_for_goals])
);

export const LEARN_LINKS: LearnLink[] = PARSED.flatMap((item) => {
  const routines = item.related_routines.map((routine_id) => ({
    article_id: item.id,
    routine_id,
    exercise_id: null,
  }));
  const exercises = item.related_exercises.map((exercise_id) => ({
    article_id: item.id,
    routine_id: null,
    exercise_id,
  }));
  return [...routines, ...exercises];
});

export function canonicalLearnArticleId(id: string | null | undefined): string | null {
  const raw = id?.trim();
  if (!raw) return null;
  return LEARN_ARTICLE_ALIASES[raw] ?? raw;
}
