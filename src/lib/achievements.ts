import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  achievementFamilies,
  canonicalAchievementId,
  visibleAchievementDefs,
  type AchievementDef,
  type AchievementFamilyId,
  type BadgeTier,
} from '@/lib/achievementCatalogue';
import type { FinishedSessionMeta, WeeklyStreak } from '@/lib/activityStats';
import { STREAK_GOALS } from '@/lib/activityStats';
import { resolveExerciseSlug } from '@/lib/contentGuides';
import type { Equipment } from '@/lib/exercises';
import type { GymBadge } from '@/lib/gymUnlocked';
import type { ProgressSet } from '@/lib/progress';
import { getPersonalBests } from '@/lib/progress';
import { usesWeight } from '@/lib/programmes';
import { supabase } from '@/lib/supabase';
import { cardioMachinesFromLogs, fetchCardioLogs } from '@/lib/cardio';
import { fetchBackOnTrack } from '@/lib/welcomeBack';

export type AchievementFamily = AchievementFamilyId;
export type { BadgeTier };

export type StoredUnlock = {
  at: string | null;
  times: number;
};

export type AchievementExtras = {
  swapsUsed: number;
  guidesOpened: number;
  checkpointsCompleted: number;
  challengesCompleted: number;
  welcomeBackSessions: number;
  welcomeBackAt: string | null;
  stored: Record<string, StoredUnlock>;
  knownEquipment: Equipment[];
  cardioMachines: string[];
};

export const EMPTY_ACHIEVEMENT_EXTRAS: AchievementExtras = {
  swapsUsed: 0,
  guidesOpened: 0,
  checkpointsCompleted: 0,
  challengesCompleted: 0,
  welcomeBackSessions: 0,
  welcomeBackAt: null,
  stored: {},
  knownEquipment: [],
  cardioMachines: [],
};

export type AchievementBadge = GymBadge & {
  family: AchievementFamily;
  threshold?: number;
  progress?: number;
  tier?: BadgeTier;
  times?: number;
  repeatable?: boolean;
  showProgress?: boolean;
  howToEarn?: string;
  celebration?: string;
};

export type AchievementGroup = {
  family: AchievementFamily;
  title: string;
  badges: AchievementBadge[];
};

const HIDE_KEY = 'hide_achievements';
const GUIDES_KEY = 'guides_opened';
const WHOLE_GYM_EQUIPMENT: Equipment[] = ['dumbbell', 'machine', 'cable', 'kettlebell', 'barbell'];

type Metrics = {
  sessions_completed: number;
  gold_weeks: number;
  personal_bests: number;
  checkpoints_completed: number;
  swaps_used: number;
  guides_opened: number;
  welcome_back_sessions_completed: number;
  current_run_weeks: number;
  streak_goal_weeks: number;
  weeks_trained: number;
  routines_completed: number;
  challenges_completed: number;
  stretch_sessions_completed: number;
  total_volume_kg: number;
  distinct_exercises_logged: number;
  distinct_equipment_types_logged: Set<string>;
  exercises_logged: Set<string>;
  cardio_machines_logged: Set<string>;
};

function isMissingHideColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  return /hide_achievements/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

export async function fetchHideAchievements(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(HIDE_KEY);
    const local = stored === '1';
    const { data, error } = await supabase.from('profiles').select('hide_achievements').maybeSingle();
    if (error) return local;
    const value = (data as { hide_achievements?: boolean | null } | null)?.hide_achievements;
    if (typeof value === 'boolean') {
      if (local && !value) {
        await saveHideAchievements(true);
        return true;
      }
      return value;
    }
    return local;
  } catch {
    return false;
  }
}

export async function saveHideAchievements(hidden: boolean): Promise<void> {
  await AsyncStorage.setItem(HIDE_KEY, hidden ? '1' : '0');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('profiles')
    .update({ hide_achievements: hidden })
    .eq('user_id', user.id);
  if (error && !isMissingHideColumn(error)) throw new Error(error.message);
}

export async function recordGuideOpened(exerciseId: string): Promise<void> {
  if (!exerciseId) return;
  try {
    const raw = await AsyncStorage.getItem(GUIDES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const ids = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    if (ids.includes(exerciseId)) return;
    ids.push(exerciseId);
    await AsyncStorage.setItem(GUIDES_KEY, JSON.stringify(ids));
  } catch {
    /* Opening a guide still works if storage is off. */
  }
}

async function fetchGuidesOpened(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(GUIDES_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return 0;
    return parsed.filter((item) => typeof item === 'string').length;
  } catch {
    return 0;
  }
}

async function fetchSwapCount(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('exercise_swaps')
      .not('completed_at', 'is', null);
    if (error) return 0;
    let count = 0;
    for (const row of data ?? []) {
      const swaps = (row as { exercise_swaps?: Record<string, string> | null }).exercise_swaps ?? {};
      count += Object.keys(swaps).length;
    }
    if (count > 0) return count;
    const always = await supabase.from('user_exercise_swaps').select('position', { count: 'exact', head: true });
    return always.count ?? 0;
  } catch {
    return 0;
  }
}

async function fetchCheckpointCount(): Promise<number> {
  try {
    const { data, error } = await supabase.from('checkpoint_results').select('enrolment_id, week');
    if (error) return 0;
    const seen = new Set<string>();
    for (const row of data ?? []) {
      const item = row as { enrolment_id?: string; week?: number };
      if (!item.enrolment_id || item.week == null) continue;
      seen.add(`${item.enrolment_id}:${item.week}`);
    }
    return seen.size;
  } catch {
    return 0;
  }
}

async function fetchChallengeCount(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select('challenge_id, completed_at')
      .not('completed_at', 'is', null);
    if (error) return 0;
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

function mergeStored(into: Record<string, StoredUnlock>, id: string, at: string | null, times = 1): void {
  const current = into[id];
  if (!current) {
    into[id] = { at, times };
    return;
  }
  current.times = Math.max(current.times, times);
  if (at && (!current.at || at < current.at)) current.at = at;
}

async function fetchStoredUnlocks(): Promise<Record<string, StoredUnlock>> {
  const stored: Record<string, StoredUnlock> = {};
  try {
    const earned = await supabase.from('user_achievements').select('achievement_id, achieved_at, times');
    if (!earned.error) {
      for (const row of earned.data ?? []) {
        const item = row as { achievement_id?: string; achieved_at?: string; times?: number };
        const id = canonicalAchievementId(item.achievement_id ?? '');
        if (!id) continue;
        const at = item.achieved_at ? String(item.achieved_at).slice(0, 10) : null;
        mergeStored(stored, id, at, Number(item.times) > 0 ? Number(item.times) : 1);
      }
    }
  } catch {
    /* Table arrives with supabase/achievements_h6.sql. */
  }
  try {
    const { data, error } = await supabase.from('milestones').select('type, achieved_at');
    if (error) return stored;
    for (const row of data ?? []) {
      const item = row as { type?: string; achieved_at?: string };
      const id = canonicalAchievementId(item.type ?? '');
      if (!id) continue;
      const at = item.achieved_at ? String(item.achieved_at).slice(0, 10) : null;
      mergeStored(stored, id, at, 1);
    }
  } catch {
    return stored;
  }
  return stored;
}

export async function fetchAchievementExtras(knownEquipment: Equipment[] = []): Promise<AchievementExtras> {
  const [swapsUsed, guidesOpened, checkpointsCompleted, challengesCompleted, welcome, stored, cardioLogs] =
    await Promise.all([
      fetchSwapCount(),
      fetchGuidesOpened(),
      fetchCheckpointCount(),
      fetchChallengeCount(),
      fetchBackOnTrack().catch(() => ({ unlocked: false, at: null as string | null, times: 0 })),
      fetchStoredUnlocks(),
      fetchCardioLogs().catch(() => []),
    ]);
  const times = Math.max(welcome.times, welcome.unlocked ? 1 : 0);
  if (times > 0) mergeStored(stored, 'back-on-track', welcome.at, times);
  return {
    swapsUsed,
    guidesOpened,
    checkpointsCompleted,
    challengesCompleted,
    welcomeBackSessions: times,
    welcomeBackAt: welcome.at,
    stored,
    knownEquipment,
    cardioMachines: [...cardioMachinesFromLogs(cardioLogs)],
  };
}

export function totalWeightLiftedKg(sets: ProgressSet[]): number {
  return sets.reduce((sum, set) => {
    if (!usesWeight(set.equipment) || set.weightKg === null) return sum;
    return sum + Math.abs(set.weightKg) * set.reps;
  }, 0);
}

function isStretchSession(session: FinishedSessionMeta): boolean {
  return session.source === 'stretch' || session.type === 'recovery';
}

function trainingSessions(sessions: FinishedSessionMeta[]): FinishedSessionMeta[] {
  return sessions.filter((session) => !isStretchSession(session));
}

function stretchSessions(sessions: FinishedSessionMeta[]): FinishedSessionMeta[] {
  return sessions.filter((session) => session.source === 'stretch' || session.type === 'recovery');
}

function nthDate(sessions: FinishedSessionMeta[], count: number): string | null {
  return sessions[count - 1]?.date ?? null;
}

function firstSetDate(sets: ProgressSet[], match: (set: ProgressSet) => boolean): string | null {
  return sets.find(match)?.date ?? null;
}

function exerciseSlugs(sets: ProgressSet[]): Set<string> {
  const slugs = new Set<string>();
  for (const set of sets) {
    slugs.add(set.exerciseId);
    slugs.add(resolveExerciseSlug(set.exerciseId));
  }
  return slugs;
}

function distinctExerciseCount(sets: ProgressSet[]): number {
  return new Set(sets.map((set) => resolveExerciseSlug(set.exerciseId))).size;
}

function loggedEquipment(sets: ProgressSet[]): Set<Equipment> {
  return new Set(sets.map((set) => set.equipment));
}

function metricNumber(name: string, metrics: Metrics): number {
  switch (name) {
    case 'sessions_completed':
      return metrics.sessions_completed;
    case 'gold_weeks':
      return metrics.gold_weeks;
    case 'personal_bests':
      return metrics.personal_bests;
    case 'checkpoints_completed':
      return metrics.checkpoints_completed;
    case 'swaps_used':
      return metrics.swaps_used;
    case 'guides_opened':
      return metrics.guides_opened;
    case 'welcome_back_sessions_completed':
      return metrics.welcome_back_sessions_completed;
    case 'current_run_weeks':
      return metrics.current_run_weeks;
    case 'streak_goal_weeks':
      return metrics.streak_goal_weeks;
    case 'weeks_trained':
      return metrics.weeks_trained;
    case 'routines_completed':
      return metrics.routines_completed;
    case 'challenges_completed':
      return metrics.challenges_completed;
    case 'stretch_sessions_completed':
      return metrics.stretch_sessions_completed;
    case 'total_volume_kg':
      return metrics.total_volume_kg;
    case 'distinct_exercises_logged':
      return metrics.distinct_exercises_logged;
    case 'distinct_equipment_types_logged':
      return metrics.distinct_equipment_types_logged.size;
    default:
      return 0;
  }
}

function metricSet(name: string, metrics: Metrics): Set<string> {
  if (name === 'distinct_equipment_types_logged') return metrics.distinct_equipment_types_logged;
  if (name === 'exercises_logged') return metrics.exercises_logged;
  if (name === 'cardio_machines_logged') return metrics.cardio_machines_logged;
  return new Set();
}

function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

export function evaluateAchievementRule(rule: string, metrics: Metrics): { ok: boolean; progress: number } {
  const containsAll = rule.match(/^(\w+)\s+contains all\s+\[(.+)\]$/i);
  if (containsAll) {
    const items = parseList(containsAll[2]);
    const set = metricSet(containsAll[1], metrics);
    const matched = items.filter((item) => set.has(item)).length;
    return { ok: items.length > 0 && matched === items.length, progress: matched };
  }
  const contains = rule.match(/^(\w+)\s+contains\s+'([^']+)'$/i);
  if (contains) {
    const hit = metricSet(contains[1], metrics).has(contains[2]);
    return { ok: hit, progress: hit ? 1 : 0 };
  }
  const gte = rule.match(/^(\w+)\s*>=\s*(\w+)$/);
  if (gte) {
    const left = metricNumber(gte[1], metrics);
    const right = /^\d+(?:\.\d+)?$/.test(gte[2]) ? Number(gte[2]) : metricNumber(gte[2], metrics);
    return { ok: left >= right, progress: left };
  }
  return { ok: false, progress: 0 };
}

function unlockedOnFor(def: AchievementDef, sets: ProgressSet[], trained: FinishedSessionMeta[], stretches: FinishedSessionMeta[], extras: AchievementExtras, streak: WeeklyStreak): string | null {
  if (def.id === 'first-full-week') return streak.firstGoldMonday;
  if (def.id === 'back-on-track') return extras.welcomeBackAt;
  if (def.id === 'first-dumbbell-lift') return firstSetDate(sets, (set) => set.equipment === 'dumbbell');
  if (def.id === 'first-machine') return firstSetDate(sets, (set) => set.equipment === 'machine');
  if (def.id === 'first-cable') return firstSetDate(sets, (set) => set.equipment === 'cable');
  if (def.id === 'first-kettlebell') return firstSetDate(sets, (set) => set.equipment === 'kettlebell');
  if (def.id === 'first-barbell-lift') return firstSetDate(sets, (set) => set.equipment === 'barbell');
  if (def.id === 'into-the-rack') {
    return firstSetDate(
      sets,
      (set) =>
        resolveExerciseSlug(set.exerciseId) === 'barbell-back-squat' ||
        /barbell back squat/i.test(set.exerciseName)
    );
  }
  if (def.id.startsWith('sessions-') || def.id === 'first-session') {
    return nthDate(trained, def.threshold ?? 1);
  }
  if (def.id === 'first-stretch' || def.id === 'stretch-habit') {
    return nthDate(stretches, def.threshold ?? 1);
  }
  if (def.id === 'first-pb' || def.id.startsWith('pbs-')) {
    const bests = getPersonalBests(sets).sort((a, b) => a.date.localeCompare(b.date));
    return bests[(def.threshold ?? 1) - 1]?.date ?? null;
  }
  if (def.id.startsWith('exercises-tried-')) {
    const byId = new Map<string, string>();
    for (const set of sets) {
      const slug = resolveExerciseSlug(set.exerciseId);
      if (!byId.has(slug)) byId.set(slug, set.date);
    }
    return [...byId.values()].sort()[(def.threshold ?? 1) - 1] ?? null;
  }
  return null;
}

function timesFor(def: AchievementDef, metrics: Metrics): number {
  if (!def.repeatable) return 1;
  if (def.id === 'back-on-track') return metrics.welcome_back_sessions_completed;
  if (def.id === 'challenge-complete') return metrics.challenges_completed;
  if (def.id === 'goal-reached') {
    return STREAK_GOALS.filter((goal) => metrics.current_run_weeks >= goal).length;
  }
  return metrics.welcome_back_sessions_completed;
}

function applyStored(badge: AchievementBadge, stored: StoredUnlock | undefined): AchievementBadge {
  if (!stored) return badge;
  const at = stored.at;
  const unlockedOn =
    badge.unlockedOn && at ? (at < badge.unlockedOn ? at : badge.unlockedOn) : badge.unlockedOn ?? at;
  return {
    ...badge,
    unlocked: true,
    unlockedOn,
    times: Math.max(badge.times ?? 1, stored.times),
    detail: badge.celebration ?? badge.detail,
  };
}

function toBadge(
  def: AchievementDef,
  metrics: Metrics,
  sets: ProgressSet[],
  trained: FinishedSessionMeta[],
  stretches: FinishedSessionMeta[],
  extras: AchievementExtras,
  streak: WeeklyStreak
): AchievementBadge {
  const result = evaluateAchievementRule(def.rule, metrics);
  const times = timesFor(def, metrics);
  const unlocked = def.repeatable ? times >= 1 && result.ok : result.ok;
  const progressEquipment =
    def.id === 'whole-gym'
      ? WHOLE_GYM_EQUIPMENT.filter(
          (item) => metrics.distinct_equipment_types_logged.has(item) || extras.knownEquipment.includes(item)
        ).length
      : result.progress;
  const celebration = def.celebration;
  const howToEarn = def.how_to_earn;
  const badge: AchievementBadge = {
    id: def.id,
    family: def.family,
    title: def.name,
    detail: unlocked ? celebration : howToEarn,
    unlocked,
    unlockedOn: unlocked
      ? unlockedOnFor(def, sets, trained, stretches, extras, streak)
      : null,
    threshold: def.threshold ?? undefined,
    progress: def.show_progress ? progressEquipment : undefined,
    tier: def.tier ?? undefined,
    times: def.repeatable ? times : undefined,
    repeatable: def.repeatable,
    showProgress: def.show_progress,
    howToEarn,
    celebration,
  };
  return applyStored(badge, extras.stored[def.id]);
}

/** Session, week, lift and gym badges from /content. History plus mapped milestones so earned awards stay. */
export function getAchievementBadges(input: {
  sessions: FinishedSessionMeta[];
  sets: ProgressSet[];
  streak: WeeklyStreak;
  completedRoutines: number;
  extras?: AchievementExtras;
}): AchievementBadge[] {
  return getAchievementGroups(input).flatMap((group) => group.badges);
}

export function getAchievementGroups(input: {
  sessions: FinishedSessionMeta[];
  sets: ProgressSet[];
  streak: WeeklyStreak;
  completedRoutines: number;
  extras?: AchievementExtras;
}): AchievementGroup[] {
  const extras = input.extras ?? EMPTY_ACHIEVEMENT_EXTRAS;
  const trained = trainingSessions(input.sessions);
  const stretches = stretchSessions(input.sessions);
  const bests = getPersonalBests(input.sets);
  const slugs = exerciseSlugs(input.sets);
  const equipment = loggedEquipment(input.sets);
  const metrics: Metrics = {
    sessions_completed: trained.length,
    gold_weeks: input.streak.goldWeeks,
    personal_bests: bests.length,
    checkpoints_completed: extras.checkpointsCompleted,
    swaps_used: extras.swapsUsed,
    guides_opened: extras.guidesOpened,
    welcome_back_sessions_completed: extras.welcomeBackSessions,
    current_run_weeks: input.streak.current,
    streak_goal_weeks: input.streak.goal,
    weeks_trained: input.streak.weeksTrained,
    routines_completed: input.completedRoutines,
    challenges_completed: extras.challengesCompleted,
    stretch_sessions_completed: stretches.length,
    total_volume_kg: totalWeightLiftedKg(input.sets),
    distinct_exercises_logged: distinctExerciseCount(input.sets),
    distinct_equipment_types_logged: new Set(equipment),
    exercises_logged: slugs,
    cardio_machines_logged: new Set(extras.cardioMachines),
  };

  const byFamily = new Map<AchievementFamily, AchievementBadge[]>();
  for (const def of visibleAchievementDefs()) {
    const badge = toBadge(def, metrics, input.sets, trained, stretches, extras, input.streak);
    const list = byFamily.get(def.family) ?? [];
    list.push(badge);
    byFamily.set(def.family, list);
  }

  return achievementFamilies()
    .map((family) => ({
      family: family.id,
      title: family.name,
      badges: byFamily.get(family.id) ?? [],
    }))
    .filter((group) => group.badges.length > 0);
}

export function countEarnedAwards(badges: AchievementBadge[]): number {
  return new Set(badges.filter((item) => item.unlocked).map((item) => item.id)).size;
}

export function nextBadgeInGroup(badges: AchievementBadge[]): AchievementBadge | null {
  return badges.find((item) => item.showProgress && !item.unlocked) ?? null;
}

export function formatBadgeProgress(badge: AchievementBadge): string | null {
  if (badge.threshold === undefined || badge.progress === undefined) return null;
  const current = Math.min(badge.progress, badge.threshold);
  return `${Math.round(current).toLocaleString('en-GB')} / ${badge.threshold.toLocaleString('en-GB')}`;
}

export function formatRepeatCount(badge: AchievementBadge): string | null {
  if (!badge.repeatable || !badge.unlocked) return null;
  const times = badge.times ?? 0;
  if (times < 2) return null;
  return `x${times}`;
}

