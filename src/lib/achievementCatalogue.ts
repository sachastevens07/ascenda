/**
 * H6 badge definitions from /content. Bundled, not a database table.
 */
import catalogueFile from '../../content/achievements/achievements.json';

export type AchievementFamilyId =
  | 'first_times'
  | 'sessions'
  | 'weeks'
  | 'consistency'
  | 'personal_bests'
  | 'programmes'
  | 'gym_unlocked'
  | 'stretch'
  | 'weight_lifted';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type AchievementFamilyDef = {
  id: AchievementFamilyId;
  name: string;
  sort_order: number;
  description: string;
};

export type AchievementDef = {
  id: string;
  family: AchievementFamilyId;
  name: string;
  how_to_earn: string;
  celebration: string;
  rule: string;
  icon: string;
  tier: BadgeTier | null;
  threshold: number | null;
  repeatable: boolean;
  show_progress: boolean;
  progress_unit: string | null;
  available_from: string | null;
};

type Json = Record<string, unknown>;

const FAMILIES: AchievementFamilyId[] = [
  'first_times',
  'sessions',
  'weeks',
  'consistency',
  'personal_bests',
  'programmes',
  'gym_unlocked',
  'stretch',
  'weight_lifted',
];

/** Cardio first-time badges wait for W2. */
export const SHIPPED_PHASE = 'v2.2';

/**
 * Older Awards ids and `milestones.type` values → H6 ids.
 * Zone and one-off exercise-count badges that H6 dropped are omitted on purpose.
 */
const LEGACY_IDS: Record<string, string> = {
  'session-1': 'first-session',
  first_session: 'first-session',
  'first-session': 'first-session',
  'week-1': 'first-full-week',
  gold_week: 'first-full-week',
  'gold-week': 'first-full-week',
  first_full_week: 'first-full-week',
  'first-full-week': 'first-full-week',
  'pb-1': 'first-pb',
  first_pb: 'first-pb',
  'first-pb': 'first-pb',
  'back-on-track': 'back-on-track',
  back_on_track: 'back-on-track',
  welcome_back: 'back-on-track',
  consistent: 'consistent-8',
  'consistent-8': 'consistent-8',
  'stretch-habit': 'stretch-habit',
  stretch_habit: 'stretch-habit',
  'session-5': 'sessions-5',
  'sessions-5': 'sessions-5',
  'session-10': 'sessions-10',
  'sessions-10': 'sessions-10',
  'session-25': 'sessions-25',
  'sessions-25': 'sessions-25',
  'session-50': 'sessions-50',
  'sessions-50': 'sessions-50',
  'session-100': 'sessions-100',
  'sessions-100': 'sessions-100',
  'session-250': 'sessions-250',
  'sessions-250': 'sessions-250',
  'weeks-4': 'weeks-4',
  'weeks-12': 'weeks-12',
  'weeks-26': 'weeks-26',
  'weeks-52': 'weeks-52',
  'pb-10': 'pbs-10',
  'pbs-10': 'pbs-10',
  'pb-50': 'pbs-50',
  'pbs-50': 'pbs-50',
  'routine-1': 'programmes-1',
  'programmes-1': 'programmes-1',
  'routine-3': 'programmes-3',
  'programmes-3': 'programmes-3',
  'routine-10': 'programmes-10',
  'programmes-10': 'programmes-10',
  'weight-1000': 'lifted-1000',
  'lifted-1000': 'lifted-1000',
  'weight-10000': 'lifted-10000',
  'lifted-10000': 'lifted-10000',
  'weight-50000': 'lifted-50000',
  'lifted-50000': 'lifted-50000',
  'equipment-dumbbell': 'first-dumbbell-lift',
  'first-dumbbell-lift': 'first-dumbbell-lift',
  'equipment-machine': 'first-machine',
  'first-machine': 'first-machine',
  'equipment-cable': 'first-cable',
  'first-cable': 'first-cable',
  'equipment-kettlebell': 'first-kettlebell',
  'first-kettlebell': 'first-kettlebell',
  'equipment-barbell': 'first-barbell-lift',
  'first-barbell-lift': 'first-barbell-lift',
  'exercises-10': 'exercises-tried-10',
  'exercises-tried-10': 'exercises-tried-10',
  'exercises-25': 'exercises-tried-25',
  'exercises-tried-25': 'exercises-tried-25',
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

function isFamily(value: string): value is AchievementFamilyId {
  return (FAMILIES as string[]).includes(value);
}

function isTier(value: string): value is BadgeTier {
  return value === 'bronze' || value === 'silver' || value === 'gold' || value === 'platinum';
}

function parseFamily(item: Json): AchievementFamilyDef | null {
  const id = text(item.id);
  if (!isFamily(id)) return null;
  return {
    id,
    name: text(item.name) || id,
    sort_order: Number(item.sort_order) || 0,
    description: text(item.description),
  };
}

function parseAchievement(item: Json): AchievementDef | null {
  const id = text(item.id);
  const family = text(item.family);
  if (!id || !isFamily(family)) return null;
  const tierRaw = text(item.tier);
  const threshold = item.threshold == null ? null : Number(item.threshold);
  return {
    id,
    family,
    name: text(item.name) || id,
    how_to_earn: text(item.how_to_earn),
    celebration: text(item.celebration),
    rule: text(item.rule),
    icon: text(item.icon),
    tier: isTier(tierRaw) ? tierRaw : null,
    threshold: Number.isFinite(threshold) ? threshold : null,
    repeatable: Boolean(item.repeatable),
    show_progress: Boolean(item.show_progress),
    progress_unit: text(item.progress_unit) || null,
    available_from: text(item.available_from) || null,
  };
}

const file = asRecord(catalogueFile);
const families = asArray(file.families)
  .map((item) => parseFamily(asRecord(item)))
  .filter((item): item is AchievementFamilyDef => item !== null)
  .sort((a, b) => a.sort_order - b.sort_order);

const achievements = asArray(file.achievements)
  .map((item) => parseAchievement(asRecord(item)))
  .filter((item): item is AchievementDef => item !== null);

const byId = new Map(achievements.map((item) => [item.id, item]));

export function achievementFamilies(): AchievementFamilyDef[] {
  return families;
}

export function allAchievementDefs(): AchievementDef[] {
  return achievements;
}

/** Hide `available_from: v2.3` until cardio ships. */
export function visibleAchievementDefs(phase = SHIPPED_PHASE): AchievementDef[] {
  return achievements.filter((item) => !item.available_from || item.available_from <= phase);
}

export function canonicalAchievementId(raw: string): string | null {
  const mapped = LEGACY_IDS[raw] ?? (byId.has(raw) ? raw : null);
  if (!mapped) return null;
  return byId.has(mapped) ? mapped : null;
}
