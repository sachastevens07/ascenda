import catalogue from '../../content/exercises/strength-catalogue.json';

import { GOAL_LABELS, type Goal } from '@/lib/goals';
import type { Equipment } from '@/lib/exercises';
import type { Confidence, GymExperience, QuizAnswers, SessionMinutes } from '@/lib/profile';
import type { StreakGoal } from '@/lib/activityStats';

export const AGE_BANDS = ['under_18', '18_24', '25_34', '35_44', '45_54', '55_plus'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
export type StoredAgeBand = Exclude<AgeBand, 'under_18'>;

export const CARDIO_PREFERENCES = ['love', 'fine', 'avoid'] as const;
export type CardioPreference = (typeof CARDIO_PREFERENCES)[number];

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

export const WEEKDAY_LONG: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export type OnboardingAnswersJson = {
  not_sure_what_to_do?: number;
  feel_watched?: number;
  hard_to_stay_motivated?: number;
  started_and_stopped?: number;
  gym_usually_busy?: number;
  machines_used?: string[];
  preferred_days?: string[];
  reminders_opted_out?: boolean;
};

const STATEMENT_KEYS = [
  'not_sure_what_to_do',
  'feel_watched',
  'hard_to_stay_motivated',
  'started_and_stopped',
  'gym_usually_busy',
] as const;

export type StatementKey = (typeof STATEMENT_KEYS)[number];

const STORES_TO_STATEMENT: Record<string, StatementKey> = {
  'profiles.onboarding_answers.not_sure_what_to_do': 'not_sure_what_to_do',
  'profiles.onboarding_answers.feel_watched': 'feel_watched',
  'profiles.onboarding_answers.hard_to_stay_motivated': 'hard_to_stay_motivated',
  'profiles.onboarding_answers.started_and_stopped': 'started_and_stopped',
  'profiles.onboarding_answers.gym_usually_busy': 'gym_usually_busy',
};

export function statementKeyFromStores(storesTo: string | undefined): StatementKey | null {
  if (!storesTo) return null;
  return STORES_TO_STATEMENT[storesTo] ?? null;
}

const MACHINE_EQUIPMENT: Record<string, Equipment> = {
  dumbbells: 'dumbbell',
  barbell: 'barbell',
  cable_station: 'cable',
  'leg-press': 'machine',
  'lat-pulldown': 'machine',
  'chest-press-machine': 'machine',
  'smith-machine': 'machine',
  squat_rack: 'barbell',
};

export function equipmentFromMachinesUsed(machines: string[] | undefined): Equipment[] {
  const seen = new Set<Equipment>();
  for (const machine of machines ?? []) {
    const equipment = MACHINE_EQUIPMENT[machine];
    if (equipment) seen.add(equipment);
  }
  return [...seen];
}

export function parseAgeBand(value: unknown): AgeBand | null {
  return (AGE_BANDS as readonly string[]).includes(String(value)) ? (value as AgeBand) : null;
}

export function parseStoredAgeBand(value: unknown): StoredAgeBand | null {
  const band = parseAgeBand(value);
  return band && band !== 'under_18' ? band : null;
}

export function parseCardioPreference(value: unknown): CardioPreference | null {
  return (CARDIO_PREFERENCES as readonly string[]).includes(String(value))
    ? (value as CardioPreference)
    : null;
}

export function parseOnboardingAnswers(value: unknown): OnboardingAnswersJson {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  const answers: OnboardingAnswersJson = {};
  for (const key of STATEMENT_KEYS) {
    const score = Number(row[key]);
    if (Number.isInteger(score) && score >= 1 && score <= 5) answers[key] = score;
  }
  if (Array.isArray(row.machines_used)) {
    answers.machines_used = row.machines_used.map(String).filter(Boolean);
  }
  if (Array.isArray(row.preferred_days)) {
    answers.preferred_days = row.preferred_days
      .map(String)
      .filter((day): day is Weekday => (WEEKDAYS as readonly string[]).includes(day));
  }
  if (row.reminders_opted_out === true) answers.reminders_opted_out = true;
  return answers;
}

export function experienceFromGymExperience(
  experience: GymExperience
): 'new' | 'some' | 'confident' {
  if (experience === 'regularly') return 'confident';
  if (experience === 'on_and_off') return 'some';
  return 'new';
}

export type OnboardingDraft = {
  age_band: AgeBand | null;
  display_name: string;
  main_goals: Goal[];
  gym_experience: GymExperience | null;
  gym_comfort: Confidence;
  statements: Partial<Record<StatementKey, number>>;
  machines_used: string[];
  cardio_preference: CardioPreference | null;
  days_per_week: 2 | 3 | 4 | 5;
  preferred_days: Weekday[];
  session_minutes: SessionMinutes;
  streak_goal_weeks: StreakGoal;
  reminder_time: string | null;
  reminders_skipped: boolean;
  bodyweight_kg: number | null;
};

export function emptyOnboardingDraft(): OnboardingDraft {
  return {
    age_band: null,
    display_name: '',
    main_goals: [],
    gym_experience: null,
    gym_comfort: 3,
    statements: {},
    machines_used: [],
    cardio_preference: null,
    days_per_week: 3,
    preferred_days: ['mon', 'wed', 'fri'],
    session_minutes: 45,
    streak_goal_weeks: 4,
    reminder_time: '18:00',
    reminders_skipped: false,
    bodyweight_kg: null,
  };
}

export function draftFromSaved(input: {
  answers: QuizAnswers;
  extras?: OnboardingAnswersJson;
  age_band?: StoredAgeBand | null;
  cardio_preference?: CardioPreference | null;
  bodyweight_kg?: number | null;
  reminder_time?: string | null;
}): OnboardingDraft {
  const extras = input.extras ?? {};
  const days = (input.answers.days_per_week >= 2 && input.answers.days_per_week <= 5
    ? input.answers.days_per_week
    : 3) as 2 | 3 | 4 | 5;
  const preferred = (extras.preferred_days ?? []).filter((day): day is Weekday =>
    (WEEKDAYS as readonly string[]).includes(day)
  );
  return {
    age_band: input.age_band ?? null,
    display_name: input.answers.display_name,
    main_goals: input.answers.main_goals,
    gym_experience: input.answers.gym_experience,
    gym_comfort: input.answers.confidence,
    statements: {
      not_sure_what_to_do: extras.not_sure_what_to_do,
      feel_watched: extras.feel_watched,
      hard_to_stay_motivated: extras.hard_to_stay_motivated,
      started_and_stopped: extras.started_and_stopped,
      gym_usually_busy: extras.gym_usually_busy,
    },
    machines_used: extras.machines_used ?? [],
    cardio_preference: input.cardio_preference ?? null,
    days_per_week: days,
    preferred_days: preferred.length === days ? preferred : defaultDaysFor(days),
    session_minutes: input.answers.session_minutes,
    streak_goal_weeks: input.answers.streak_goal_weeks,
    reminder_time: extras.reminders_opted_out ? null : (input.reminder_time ?? '18:00'),
    reminders_skipped: extras.reminders_opted_out === true,
    bodyweight_kg: input.bodyweight_kg ?? null,
  };
}

export function defaultDaysFor(count: 2 | 3 | 4 | 5): Weekday[] {
  if (count === 2) return ['tue', 'sat'];
  if (count === 4) return ['mon', 'tue', 'thu', 'fri'];
  if (count === 5) return ['mon', 'tue', 'wed', 'fri', 'sat'];
  return ['mon', 'wed', 'fri'];
}

export function formatPreferredDays(days: Weekday[]): string {
  const names = days.map((day) => WEEKDAY_LONG[day]);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function extrasFromDraft(draft: OnboardingDraft): OnboardingAnswersJson {
  const extras: OnboardingAnswersJson = {
    machines_used: draft.machines_used.filter((item) => item !== 'none'),
    preferred_days: draft.preferred_days,
  };
  for (const key of STATEMENT_KEYS) {
    const value = draft.statements[key];
    if (value != null) extras[key] = value;
  }
  if (draft.reminders_skipped) extras.reminders_opted_out = true;
  return extras;
}

export function storedAgeBand(draft: OnboardingDraft): StoredAgeBand | null {
  return parseStoredAgeBand(draft.age_band);
}

const NAME_BY_SLUG = new Map<string, string>();
for (const item of Array.isArray(catalogue.exercises) ? catalogue.exercises : []) {
  const row = item as { slug?: string; name?: string };
  if (row.slug && row.name) NAME_BY_SLUG.set(row.slug, row.name);
}

export function exerciseNameFromSlug(slug: string): string {
  return NAME_BY_SLUG.get(slug) ?? slug.replace(/-/g, ' ');
}

export function mainGoalLabel(goals: Goal[]): string {
  const main = goals[0];
  return main ? GOAL_LABELS[main] : '';
}
