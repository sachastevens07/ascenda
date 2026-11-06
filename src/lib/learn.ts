import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImageSourcePropType } from 'react-native';

import { contentImage, contentSlugForTitle, hydrateImages, imageSourceForSlug } from '@/lib/images';
import {
  LEARN_ARTICLE_GOALS,
  LEARN_ARTICLES,
  LEARN_LINKS,
  canonicalLearnArticleId,
} from '@/lib/learnArticles';
import { resolveExerciseSlug } from '@/lib/contentGuides';
import type { Goal } from '@/lib/goals';
import { userGoalsFromAnswers, type QuizAnswers } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

export const LEARN_CATEGORIES = [
  'getting_started',
  'gym_confidence',
  'technique',
  'programmes',
  'recovery',
  'fuelling',
  'mindset',
  'myths',
] as const;

export type LearnCategory = (typeof LEARN_CATEGORIES)[number];

export const LEARN_CATEGORY_LABELS: Record<LearnCategory, string> = {
  getting_started: 'Getting started',
  gym_confidence: 'Gym confidence',
  technique: 'Technique',
  programmes: 'How programmes work',
  recovery: 'Recovery and sleep',
  fuelling: 'Fuelling your training',
  mindset: 'Mindset and motivation',
  myths: 'Myths busted',
};

export const LEARN_CATEGORY_COVERS: Record<LearnCategory, string> = {
  getting_started: 'learn-category-getting-started',
  gym_confidence: 'learn-category-gym-confidence',
  technique: 'learn-category-technique',
  programmes: 'learn-category-how-programmes-work',
  recovery: 'learn-category-recovery-and-sleep',
  fuelling: 'learn-category-fuelling',
  mindset: 'learn-category-mindset',
  myths: 'learn-category-myths',
};

export type LearnSource = {
  label: string;
  url: string;
};

export type LearnArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: LearnCategory;
  read_minutes: number;
  cover_image_id: string;
  body_markdown: string;
  is_pro: boolean;
  sources: LearnSource[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string;
  sort_order: number;
};

export type LearnLink = {
  article_id: string;
  routine_id: string | null;
  exercise_id: string | null;
};

const READS_KEY = 'learn_article_reads';
const OPENED_KEY = 'learn_last_opened';

function isCategory(value: string): value is LearnCategory {
  return (LEARN_CATEGORIES as readonly string[]).includes(value);
}

function parseSources(value: unknown): LearnSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const label = typeof (item as LearnSource).label === 'string' ? (item as LearnSource).label.trim() : '';
    const url = typeof (item as LearnSource).url === 'string' ? (item as LearnSource).url.trim() : '';
    return label && url ? [{ label, url }] : [];
  });
}

function bundledArticle(id: string | undefined): LearnArticle | undefined {
  if (!id) return undefined;
  const canonical = canonicalLearnArticleId(id) ?? id;
  return LEARN_ARTICLES.find((item) => item.id === id || item.slug === id || item.id === canonical || item.slug === canonical);
}

function toArticle(row: Partial<LearnArticle> & { id: string }): LearnArticle | null {
  const bundled = bundledArticle(row.id) ?? bundledArticle(row.slug);
  const category = row.category && isCategory(row.category) ? row.category : bundled?.category;
  if (!category) return null;
  const body = row.body_markdown?.trim() || bundled?.body_markdown || '';
  const title = row.title?.trim() || bundled?.title;
  if (!title || !body) return null;
  return {
    id: row.id,
    slug: row.slug?.trim() || bundled?.slug || row.id,
    title,
    summary: row.summary?.trim() || bundled?.summary || '',
    category,
    read_minutes: row.read_minutes ?? bundled?.read_minutes ?? 3,
    cover_image_id: learnCoverSlug(row.cover_image_id, bundled?.cover_image_id, row.slug?.trim() || bundled?.slug || row.id, title),
    body_markdown: body,
    is_pro: row.is_pro ?? bundled?.is_pro ?? false,
    sources: row.sources && row.sources.length > 0 ? row.sources : (bundled?.sources ?? []),
    reviewed_by: row.reviewed_by ?? bundled?.reviewed_by ?? null,
    reviewed_at: row.reviewed_at ?? bundled?.reviewed_at ?? null,
    published_at: row.published_at || bundled?.published_at || '2026-11-04',
    sort_order: row.sort_order ?? bundled?.sort_order ?? 99,
  };
}

function isMissingLearn(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /learn_articles|learn_links|article_reads/.test(detail)
  );
}

function learnCoverSlug(
  fromRow: string | undefined,
  fromBundled: string | undefined,
  slug: string,
  title: string
): string {
  const fromTitle = contentSlugForTitle(title, 'learn');
  if (fromTitle) return fromTitle;
  if (fromRow && contentImage(fromRow)) return fromRow;
  const prefixed = slug.startsWith('learn-') ? slug : `learn-${slug}`;
  if (contentImage(prefixed)) return prefixed;
  if (fromBundled && contentImage(fromBundled)) return fromBundled;
  return prefixed;
}

export function learnImage(coverImageId: string | null | undefined): ImageSourcePropType | null {
  return imageSourceForSlug(coverImageId);
}

export function articleImage(article: Pick<LearnArticle, 'cover_image_id' | 'category'>): ImageSourcePropType | null {
  return learnImage(article.cover_image_id);
}

export function formatReadMinutes(minutes: number): string {
  return minutes === 1 ? '1 min read' : `${minutes} min read`;
}

export function isLearnCategory(value: string | undefined): value is LearnCategory {
  return Boolean(value && isCategory(value));
}

/** Overlay: bundled /content articles always show. Database rows win when body or title is set. */
export async function fetchLearnArticles(): Promise<LearnArticle[]> {
  await hydrateImages();
  const bundled = LEARN_ARTICLES.map((item) => toArticle(item)).filter((item): item is LearnArticle => Boolean(item));
  const { data, error } = await supabase
    .from('learn_articles')
    .select(
      'id, slug, title, summary, category, read_minutes, cover_image_id, body_markdown, is_pro, sources, reviewed_by, reviewed_at, published_at, sort_order'
    )
    .order('sort_order', { ascending: true });
  if (error || !data) {
    if (error && !isMissingLearn(error)) {
      return bundled;
    }
    return bundled;
  }
  const fromDb = (data as Partial<LearnArticle>[]).flatMap((row) => {
    if (!row.id) return [];
    const article = toArticle({
      ...row,
      id: row.id,
      sources: parseSources(row.sources),
    });
    return article ? [article] : [];
  });
  const byId = new Map(bundled.map((item) => [item.id, item]));
  for (const item of fromDb) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
}

export async function fetchLearnArticle(id: string): Promise<LearnArticle | null> {
  const list = await fetchLearnArticles();
  const wanted = canonicalLearnArticleId(id) ?? id;
  return (
    list.find((item) => item.id === id || item.slug === id || item.id === wanted || item.slug === wanted) ?? null
  );
}

export async function fetchLearnLinks(): Promise<LearnLink[]> {
  const bundled = LEARN_LINKS;
  const { data, error } = await supabase.from('learn_links').select('article_id, routine_id, exercise_id');
  if (error || !data) return bundled;
  const keyOf = (link: LearnLink) =>
    `${link.article_id}|${link.routine_id ?? ''}|${link.exercise_id ?? ''}`;
  const byKey = new Map(bundled.map((link) => [keyOf(link), link]));
  for (const row of data as LearnLink[]) {
    if (!row.article_id || (!row.routine_id && !row.exercise_id)) continue;
    byKey.set(keyOf(row), row);
  }
  return [...byKey.values()];
}

export function articlesInCategory(articles: LearnArticle[], category: LearnCategory): LearnArticle[] {
  return articles.filter((item) => item.category === category);
}

export function featuredArticle(articles: LearnArticle[], readIds: Set<string>): LearnArticle | null {
  const unreadStart = articles.find((item) => item.category === 'getting_started' && !readIds.has(item.id));
  return unreadStart ?? articles.find((item) => item.category === 'getting_started') ?? articles[0] ?? null;
}

function goalWeight(goals: Goal[], goal: Goal): number {
  const index = goals.indexOf(goal);
  if (index < 0) return 0;
  return index === 0 ? 4 : index === 1 ? 2 : 1;
}

export function recommendArticles(
  articles: LearnArticle[],
  answers: QuizAnswers | null,
  options?: { excludeIds?: string[]; limit?: number }
): LearnArticle[] {
  const exclude = new Set(options?.excludeIds ?? []);
  const goals = answers ? userGoalsFromAnswers(answers) : [];
  const scored = articles
    .filter((item) => !exclude.has(item.id) && !exclude.has(item.slug))
    .map((item) => {
      const tagged = LEARN_ARTICLE_GOALS[item.id] ?? LEARN_ARTICLE_GOALS[item.slug] ?? [];
      const fromGoals = tagged.reduce((sum, goal) => sum + goalWeight(goals, goal), 0);
      const gettingStarted = item.category === 'getting_started' ? 1 : 0;
      return { item, score: fromGoals + gettingStarted };
    })
    .sort((a, b) => b.score - a.score || a.item.sort_order - b.item.sort_order);
  const limit = options?.limit ?? 4;
  const picked = scored.filter((entry) => entry.score > 0).slice(0, limit);
  if (picked.length >= limit) return picked.map((entry) => entry.item);
  const extra = scored.filter((entry) => !picked.includes(entry)).slice(0, limit - picked.length);
  return [...picked, ...extra].map((entry) => entry.item);
}

function matchKeys(values: Array<string | null | undefined>): Set<string> {
  const keys = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    keys.add(trimmed);
    keys.add(resolveExerciseSlug(trimmed));
  }
  return keys;
}

export function relatedArticles(
  articles: LearnArticle[],
  links: LearnLink[],
  options: {
    routineId?: string | null;
    routineSlug?: string | null;
    exerciseId?: string | null;
    exerciseSlug?: string | null;
    excludeId?: string;
    limit?: number;
  }
): LearnArticle[] {
  const routineKeys = matchKeys([options.routineId, options.routineSlug]);
  const exerciseKeys = matchKeys([options.exerciseId, options.exerciseSlug]);
  const ids = new Set(
    links
      .filter((link) => {
        if (link.routine_id && routineKeys.has(link.routine_id)) return true;
        if (link.exercise_id && (exerciseKeys.has(link.exercise_id) || exerciseKeys.has(resolveExerciseSlug(link.exercise_id)))) {
          return true;
        }
        return false;
      })
      .map((link) => link.article_id)
  );
  const exclude = options.excludeId ? canonicalLearnArticleId(options.excludeId) : null;
  const limit = options.limit ?? 3;
  return articles
    .filter((item) => (ids.has(item.id) || ids.has(item.slug)) && item.id !== exclude && item.slug !== exclude)
    .slice(0, limit);
}

function expandReadIds(ids: Set<string>): Set<string> {
  const next = new Set(ids);
  for (const id of ids) {
    const canonical = canonicalLearnArticleId(id);
    if (canonical) next.add(canonical);
  }
  return next;
}

export async function fetchReadArticleIds(): Promise<Set<string>> {
  const local = expandReadIds(await readLocalIds(READS_KEY));
  const { data, error } = await supabase.from('article_reads').select('article_id');
  if (error || !data) return local;
  const ids = new Set(local);
  for (const row of data as { article_id: string }[]) {
    if (row.article_id) ids.add(row.article_id);
  }
  return expandReadIds(ids);
}

export async function markArticleRead(articleId: string): Promise<void> {
  const canonical = canonicalLearnArticleId(articleId) ?? articleId;
  const ids = await readLocalIds(READS_KEY);
  ids.add(canonical);
  ids.add(articleId);
  await AsyncStorage.setItem(READS_KEY, JSON.stringify([...ids]));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('article_reads').upsert({
    user_id: user.id,
    article_id: canonical,
    read_at: new Date().toISOString(),
  });
  if (error && !isMissingLearn(error)) {
    return;
  }
}

export async function recordArticleOpened(articleId: string): Promise<void> {
  await AsyncStorage.setItem(OPENED_KEY, articleId);
}

export async function fetchLastOpenedArticleId(): Promise<string | null> {
  return AsyncStorage.getItem(OPENED_KEY);
}

export function continueReadingArticle(
  articles: LearnArticle[],
  lastOpenedId: string | null,
  readIds: Set<string>
): LearnArticle | null {
  const wanted = canonicalLearnArticleId(lastOpenedId) ?? lastOpenedId;
  if (!wanted || readIds.has(wanted) || (lastOpenedId && readIds.has(lastOpenedId))) return null;
  return (
    articles.find((item) => item.id === lastOpenedId || item.slug === lastOpenedId || item.id === wanted || item.slug === wanted) ??
    null
  );
}

async function readLocalIds(key: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

export type ArticleBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; items: string[] };

export function parseArticleBody(markdown: string): ArticleBlock[] {
  const chunks = markdown.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  const blocks: ArticleBlock[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.every((line) => line.startsWith('- ') || line.startsWith('* '))) {
      blocks.push({ type: 'list', items: lines.map((line) => line.slice(2).trim()) });
      continue;
    }
    if (lines.every((line) => /^\d+\.\s/.test(line))) {
      blocks.push({
        type: 'list',
        items: lines.map((line) => line.replace(/^\d+\.\s/, '').trim()),
      });
      continue;
    }
    const first = lines[0];
    if (first.startsWith('## ')) {
      blocks.push({ type: 'heading', text: first.slice(3).trim() });
      const rest = lines.slice(1).join(' ').trim();
      if (rest) blocks.push({ type: 'paragraph', text: rest });
      continue;
    }
    if (first.startsWith('> ')) {
      blocks.push({ type: 'quote', text: lines.map((line) => line.replace(/^>\s?/, '')).join(' ') });
      continue;
    }
    blocks.push({ type: 'paragraph', text: lines.join(' ') });
  }
  return blocks;
}
