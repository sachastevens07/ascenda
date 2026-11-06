/**
 * Challenge catalogue from /content. Bundled so Home and Programmes work
 * before a live sync. content:sync reports the file; it does not write dates
 * onto the catalogue (the window lives on the join).
 */
import file from '../../content/challenges/challenges.json';

export type ChallengeRequirementType = 'sessions' | 'stretch_sessions' | 'new_exercises' | 'new_equipment';

export type ChallengeRequirement = {
  type: ChallengeRequirementType;
  count: number | 'weekly_target';
  session_types: string[];
  stretch_min_minutes: number | null;
  min_minutes: number | null;
  equipment_types: string[];
  include_any_of: string[];
  one_on_training_day: boolean;
};

export type ChallengeMission = {
  week: number;
  title: string;
  body: string;
  requirement: ChallengeRequirement;
};

export type ContentChallenge = {
  slug: string;
  name: string;
  summary: string;
  description: string;
  cover_image_slug: string;
  tags: string[];
  weekly_target_rule: 'min_3_or_days' | null;
  missions: ChallengeMission[];
  fallback_any_new_exercise: boolean;
  recommended_routines: string[];
  recommended_stretches: string[];
  completion_badge: string;
  completion_title: string;
  completion_body: string;
  featured_from: string | null;
  featured_to: string | null;
  length_weeks: number;
  is_active: boolean;
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

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseRequirement(raw: unknown): ChallengeRequirement {
  const item = asRecord(raw);
  const type = text(item.type);
  const count = item.count === 'weekly_target' ? 'weekly_target' : (num(item.count) ?? 1);
  return {
    type:
      type === 'stretch_sessions' || type === 'new_exercises' || type === 'new_equipment' ? type : 'sessions',
    count,
    session_types: asArray(item.session_types).map((value) => text(value)).filter(Boolean),
    stretch_min_minutes: num(item.stretch_min_minutes),
    min_minutes: num(item.min_minutes),
    equipment_types: asArray(item.equipment_types).map((value) => text(value)).filter(Boolean),
    include_any_of: asArray(item.include_any_of).map((value) => text(value)).filter(Boolean),
    one_on_training_day: item.one_on_training_day === true,
  };
}

function parseChallenge(raw: unknown): ContentChallenge | null {
  const item = asRecord(raw);
  const slug = text(item.slug);
  const name = text(item.name);
  if (!slug || !name) return null;
  const featured = asRecord(item.featured_window);
  return {
    slug,
    name,
    summary: text(item.summary),
    description: text(item.description),
    cover_image_slug: text(item.cover_image_slug),
    tags: asArray(item.tags).map((value) => text(value)).filter(Boolean).slice(0, 2),
    weekly_target_rule: text(item.weekly_target_rule).startsWith('min(3') ? 'min_3_or_days' : null,
    missions: asArray(item.weekly_missions).flatMap((missionRaw) => {
      const mission = asRecord(missionRaw);
      const week = num(mission.week);
      const title = text(mission.title);
      if (week == null || !title) return [];
      return [{ week, title, body: text(mission.body), requirement: parseRequirement(mission.requirement) }];
    }),
    fallback_any_new_exercise: Boolean(text(item.fallback_note)),
    recommended_routines: asArray(asRecord(item.recommended).routines).map((value) => text(value)).filter(Boolean),
    recommended_stretches: asArray(asRecord(item.recommended).stretch_routines)
      .map((value) => text(value))
      .filter(Boolean),
    completion_badge: text(asRecord(item.completion).badge) || 'challenge-complete',
    completion_title: text(asRecord(item.completion).title),
    completion_body: text(asRecord(item.completion).body),
    featured_from: text(featured.from_month_day) || null,
    featured_to: text(featured.to_month_day) || null,
    length_weeks: num(item.length_weeks) ?? asArray(item.weekly_missions).length ?? 4,
    is_active: item.is_active !== false,
  };
}

const CATALOGUE = asArray((file as { challenges?: unknown }).challenges)
  .map(parseChallenge)
  .filter((item): item is ContentChallenge => item != null && item.is_active);

export function contentChallenges(): ContentChallenge[] {
  return CATALOGUE;
}

export function contentChallenge(slug: string): ContentChallenge | null {
  return CATALOGUE.find((item) => item.slug === slug) ?? null;
}
