import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { parseThemePreference, type ThemePreference } from '@/constants/theme';
import { DEFAULT_STREAK_GOAL, STREAK_GOALS, type StreakGoal } from '@/lib/activityStats';
import { resetAnalytics, track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { DISCLAIMER_VERSION } from '@/lib/disclaimer';
import {
  MAX_MAIN_GOALS,
  parseGoal,
  parseMainGoals,
  toLegacyGoal,
  toStoredN4Goals,
  type Goal,
} from '@/lib/goals';
import {
  parseCardioPreference,
  parseOnboardingAnswers,
  parseStoredAgeBand,
  type CardioPreference,
  type OnboardingAnswersJson,
  type StoredAgeBand,
} from '@/lib/onboardingAnswers';
import { recordLevelChange } from '@/lib/levelUp';
import { supabase } from '@/lib/supabase';

export {
  fillGoalCopy,
  formatGoalsLabel,
  GOAL_COPY,
  GOAL_HELPER,
  GOAL_INSIGHT_TITLE,
  GOAL_LABELS,
  GOAL_LIMIT_HINT,
  GOAL_MAIN_LABEL,
  GOAL_SCREEN_TITLE,
  GOALS,
  ONBOARDING_GOALS,
  toggleMainGoal,
} from '@/lib/goals';
export { MAX_MAIN_GOALS, parseGoal, parseMainGoals, toLegacyGoal };
export type { Goal };

export function userGoalsFromAnswers(answers: { goal: Goal; main_goals?: Goal[] }): Goal[] {
  if (answers.main_goals && answers.main_goals.length > 0) return answers.main_goals.slice(0, MAX_MAIN_GOALS);
  return [answers.goal];
}

export const EXPERIENCE_LEVELS = ['new', 'some', 'confident'] as const;
export type Experience = (typeof EXPERIENCE_LEVELS)[number];

export const EXPERIENCE_LABELS: Record<Experience, string> = {
  new: "I'm new to this",
  some: 'A bit',
  confident: 'I know my way around',
};

export const DAYS_PER_WEEK_OPTIONS = [1, 2, 3, 4] as const;
/** 5–6 can still exist on older profiles; the quiz now only offers 1–4. */
export type DaysPerWeek = 1 | 2 | 3 | 4 | 5 | 6;

export function formatDaysPerWeek(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

/** Where the user trains. Not the same as an exercise's `Equipment`. */
export const EQUIPMENT_ACCESS = ['full_gym', 'dumbbells', 'home'] as const;
export type EquipmentAccess = (typeof EQUIPMENT_ACCESS)[number];

export const EQUIPMENT_ACCESS_LABELS: Record<EquipmentAccess, string> = {
  full_gym: 'A full gym',
  dumbbells: 'Dumbbells at the gym',
  home: "Days I can't get to the gym",
};

export const CONFIDENCE_LEVELS = [1, 2, 3, 4, 5] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  1: 'Very nervous',
  2: 'A bit nervous',
  3: 'Somewhere in between',
  4: 'Mostly comfortable',
  5: 'Right at home',
};

/** How much of the gym she's comfortable in. Keep in step with supabase/onboarding_v1_1.sql. */
export const LEVELS = [1, 2, 3, 4] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
  1: 'Level 1: Corner',
  2: 'Level 2: Dumbbell area',
  3: 'Level 3: Machines',
  4: 'Level 4: Whole gym',
};

export const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  1: 'One quiet spot with a set of dumbbells, and maybe a mat or bench.',
  2: 'The dumbbell area: benches, cables and a bit more space.',
  3: 'The machines as well.',
  4: 'Everywhere, including the barbells and squat racks.',
};

/** Gym confidence answer to starting level: 1–2 → 1, 3 → 2, 4 → 3, 5 → 4. */
export function levelForConfidence(confidence: Confidence): Level {
  return confidence <= 2 ? 1 : ((confidence - 1) as Level);
}

/** Bodyweight is optional; these limits match the database. */
export const MIN_BODYWEIGHT_KG = 30;
export const MAX_BODYWEIGHT_KG = 300;
export const MIN_DISPLAY_NAME = 1;
export const MAX_DISPLAY_NAME = 40;

export const TRAINING_LOCATIONS = ['gym', 'home', 'both'] as const;
export type TrainingLocation = (typeof TRAINING_LOCATIONS)[number];

export const TRAINING_LOCATION_LABELS: Record<TrainingLocation, string> = {
  gym: 'The gym',
  home: 'At home',
  both: 'Both',
};

export const GYM_EXPERIENCE_LEVELS = ['not_yet', 'just_started', 'on_and_off', 'regularly'] as const;
export type GymExperience = (typeof GYM_EXPERIENCE_LEVELS)[number];

export const GYM_EXPERIENCE_LABELS: Record<GymExperience, string> = {
  not_yet: 'Not yet',
  just_started: 'Just started',
  on_and_off: 'On and off',
  regularly: 'Regularly',
};

export const SESSION_MINUTES_OPTIONS = [30, 45, 60] as const;
export type SessionMinutes = (typeof SESSION_MINUTES_OPTIONS)[number];
export const DEFAULT_SESSION_MINUTES: SessionMinutes = 45;

export const SESSION_MINUTES_LABELS: Record<SessionMinutes, string> = {
  30: '30 minutes',
  45: '45 minutes',
  60: '60+ minutes',
};

export function formatSessionMinutes(minutes: SessionMinutes): string {
  return SESSION_MINUTES_LABELS[minutes];
}

export const FOCUS_AREAS = ['glutes', 'legs', 'upper', 'core', 'full_body'] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

export const FOCUS_AREA_LABELS: Record<FocusArea, string> = {
  glutes: 'Glutes',
  legs: 'Legs',
  upper: 'Upper body',
  core: 'Core',
  full_body: 'Full body',
};

export type QuizAnswers = {
  goal: Goal;
  /** 1 to 3. First is her main goal. */
  main_goals: Goal[];
  experience: Experience;
  days_per_week: DaysPerWeek;
  equipment: EquipmentAccess;
  confidence: Confidence;
  confidence_level: Level;
  gym_experience: GymExperience;
  session_minutes: SessionMinutes;
  focus_areas: FocusArea[];
  streak_goal_weeks: StreakGoal;
  display_name: string;
};

/** One row of the `profiles` table. Quiz fields are null until the quiz is saved. */
export type Profile = {
  user_id: string;
  goal: Goal | null;
  main_goal: Goal | null;
  main_goals: Goal[];
  experience: Experience | null;
  days_per_week: DaysPerWeek | null;
  equipment: EquipmentAccess | null;
  training_location: TrainingLocation | null;
  gym_experience: GymExperience | null;
  session_minutes: SessionMinutes | null;
  focus_areas: FocusArea[];
  confidence: Confidence | null;
  gym_comfort: Confidence | null;
  confidence_level: Level | null;
  streak_goal_weeks: StreakGoal | null;
  display_name: string | null;
  /** Optional. Only for relative-strength stats; never BMI or any health score. */
  bodyweight_kg: number | null;
  /** Null until she confirms she's 18 or over. */
  age_confirmed_at: string | null;
  /** Assigned by the database from the quiz answers (see supabase/programmes.sql). */
  programme_id: string | null;
  programme: { name: string; days_per_week: number } | null;
  /** When on, Today's session stays in zone 1 (Corner). See supabase/quiet_mode.sql. */
  quiet_mode: boolean;
  onboarding_completed_at: string | null;
  /** Null until supabase/theme_preference.sql is run, or she has not saved a choice. */
  theme_preference: ThemePreference | null;
  /** Null until she accepts the current disclaimer, or the SQL has not been run. */
  disclaimer_version: number | null;
  disclaimer_accepted_at: string | null;
  /** False until supabase/disclaimer.sql has been run. */
  disclaimer_ready: boolean;
  /** X5 extras. Empty until supabase/onboarding_x5.sql is run. */
  onboarding_answers: OnboardingAnswersJson;
  age_band: StoredAgeBand | null;
  cardio_preference: CardioPreference | null;
};

const PROFILE_COLUMNS =
  'user_id, goal, experience, days_per_week, equipment, confidence, confidence_level, bodyweight_kg, age_confirmed_at, programme_id, programme:programmes(name, days_per_week), quiet_mode, onboarding_completed_at';
const ONBOARDING_V2_COLUMNS =
  'main_goal, training_location, session_minutes, focus_areas, gym_comfort, streak_goal_weeks, display_name';
const PROFILE_COLUMNS_V2 = `${PROFILE_COLUMNS}, ${ONBOARDING_V2_COLUMNS}`;
const PROFILE_COLUMNS_THEME = `${PROFILE_COLUMNS_V2}, theme_preference`;
const PROFILE_COLUMNS_DISCLAIMER = `${PROFILE_COLUMNS_THEME}, disclaimer_version, disclaimer_accepted_at`;
const PROFILE_COLUMNS_GOALS = `${PROFILE_COLUMNS_DISCLAIMER}, main_goals`;
const PROFILE_COLUMNS_G1 = `${PROFILE_COLUMNS_GOALS}, gym_experience`;
const PROFILE_COLUMNS_X5 = `${PROFILE_COLUMNS_G1}, onboarding_answers, age_band, cardio_preference`;

function isMissingOnboardingV2(error: { message?: string; code?: string }): boolean {
  return /main_goal(?!s)|training_location|session_minutes|focus_areas|gym_comfort|streak_goal_weeks|display_name/i.test(
    `${error.code ?? ''} ${error.message ?? ''}`
  );
}

function isMissingThemePreference(error: { message?: string; code?: string }): boolean {
  return /theme_preference/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingDisclaimer(error: { message?: string; code?: string }): boolean {
  return /disclaimer_version|disclaimer_accepted_at/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingMainGoals(error: { message?: string; code?: string }): boolean {
  return /main_goals/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingGymExperience(error: { message?: string; code?: string }): boolean {
  return /gym_experience/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingOnboardingX5(error: { message?: string; code?: string }): boolean {
  return /onboarding_answers|age_band|cardio_preference/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingAgeConfirmed(error: { message?: string; code?: string }): boolean {
  return /age_confirmed_at/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isUniqueViolation(error: { message?: string; code?: string }): boolean {
  return error.code === '23505' || /duplicate key|unique constraint/i.test(error.message ?? '');
}

/** Write a few of her own profile fields without selecting later columns that may not exist yet. */
async function saveOwnProfileFields(
  userId: string,
  fields: Record<string, unknown>
): Promise<'saved' | 'missing-column'> {
  const names = Object.keys(fields);
  const updated = await supabase
    .from('profiles')
    .update(fields)
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle();
  if (updated.error) {
    if (isMissingProfileColumn(updated.error, names)) return 'missing-column';
    throw updated.error;
  }
  if (updated.data) return 'saved';
  const inserted = await supabase
    .from('profiles')
    .insert({ user_id: userId, ...fields })
    .select('user_id')
    .maybeSingle();
  if (inserted.error) {
    if (isMissingProfileColumn(inserted.error, names)) return 'missing-column';
    if (isUniqueViolation(inserted.error)) return 'saved';
    throw inserted.error;
  }
  return 'saved';
}

function isMissingProfileColumn(
  error: { message?: string; code?: string },
  columns: string[]
): boolean {
  const text = `${error.code ?? ''} ${error.message ?? ''}`;
  return columns.some((column) => new RegExp(column, 'i').test(text));
}

function parseGymExperience(value: unknown): GymExperience | null {
  return (GYM_EXPERIENCE_LEVELS as readonly string[]).includes(String(value))
    ? (value as GymExperience)
    : null;
}

/** Map old where-you-train answers onto gym_experience. Home means she has not been going. */
export function gymExperienceFromLegacy(
  location: TrainingLocation | null | undefined,
  experience: Experience | null | undefined
): GymExperience {
  if (location === 'home') return 'not_yet';
  if (location === 'both') return 'on_and_off';
  if (location === 'gym') {
    if (experience === 'new') return 'just_started';
    if (experience === 'confident') return 'regularly';
    return 'on_and_off';
  }
  if (experience === 'new') return 'just_started';
  if (experience === 'confident') return 'regularly';
  if (experience === 'some') return 'on_and_off';
  return 'just_started';
}

function isGoalConstraint(error: { message?: string; code?: string }): boolean {
  return /profiles_goal_check|profiles_main_goal_check|profiles_main_goals_check/i.test(
    `${error.code ?? ''} ${error.message ?? ''}`
  );
}

function parseDisclaimerVersion(value: unknown): number | null {
  if (value == null || value === '') return null;
  const version = Number(value);
  return Number.isFinite(version) ? version : null;
}

function keepDisclaimer(next: Profile, previous: Profile | null | undefined): Profile {
  let result = next;
  if (!next.disclaimer_ready && previous) {
    result = {
      ...result,
      disclaimer_version: previous.disclaimer_version,
      disclaimer_accepted_at: previous.disclaimer_accepted_at,
      disclaimer_ready: previous.disclaimer_ready,
    };
  }
  if (result.main_goals.length === 0 && previous && previous.main_goals.length > 0) {
    result = {
      ...result,
      main_goals: previous.main_goals,
      goal: previous.main_goals[0] ?? result.goal,
      main_goal: previous.main_goals[0] ?? result.main_goal,
    };
  }
  return result;
}

function parseFocusAreas(value: unknown): FocusArea[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is FocusArea =>
    (FOCUS_AREAS as readonly string[]).includes(String(item))
  );
}

function parseSessionMinutes(value: unknown): SessionMinutes | null {
  const minutes = Number(value);
  return (SESSION_MINUTES_OPTIONS as readonly number[]).includes(minutes)
    ? (minutes as SessionMinutes)
    : null;
}

function parseStreakGoal(value: unknown): StreakGoal | null {
  const weeks = Number(value);
  return (STREAK_GOALS as readonly number[]).includes(weeks) ? (weeks as StreakGoal) : null;
}

export function trainingLocationFromEquipment(equipment: EquipmentAccess): TrainingLocation {
  if (equipment === 'full_gym') return 'gym';
  if (equipment === 'home') return 'home';
  return 'both';
}

export function focusAreasFromGoal(goal: Goal): FocusArea[] {
  if (goal === 'glutes_and_legs') return ['glutes', 'legs'];
  if (goal === 'upper_body_strength') return ['upper'];
  return ['full_body'];
}

export function focusAreasFromGoals(goals: Goal[]): FocusArea[] {
  const areas = new Set<FocusArea>();
  for (const goal of goals) {
    for (const area of focusAreasFromGoal(goal)) areas.add(area);
  }
  return areas.size > 0 ? [...areas] : ['full_body'];
}

export function equipmentOptionsForLocation(location: TrainingLocation): EquipmentAccess[] {
  if (location === 'home') return ['dumbbells', 'home'];
  if (location === 'gym') return ['full_gym', 'dumbbells'];
  return ['full_gym', 'dumbbells', 'home'];
}

/** numeric columns arrive as strings. */
function toProfile(row: unknown, disclaimerReady = false): Profile {
  const profile = row as Profile;
  const mainGoals = parseMainGoals(profile.main_goals);
  const fallbackGoal = parseGoal(profile.main_goal) ?? parseGoal(profile.goal);
  const goals = mainGoals.length > 0 ? mainGoals : fallbackGoal ? [fallbackGoal] : [];
  return {
    ...profile,
    goal: goals[0] ?? null,
    main_goal: goals[0] ?? null,
    main_goals: goals,
    training_location: profile.training_location ?? null,
    gym_experience:
      parseGymExperience(profile.gym_experience) ??
      gymExperienceFromLegacy(profile.training_location, profile.experience),
    session_minutes: parseSessionMinutes(profile.session_minutes),
    focus_areas: parseFocusAreas(profile.focus_areas),
    gym_comfort: profile.gym_comfort ?? profile.confidence ?? null,
    streak_goal_weeks: parseStreakGoal(profile.streak_goal_weeks),
    display_name: profile.display_name?.trim() ? profile.display_name.trim() : null,
    bodyweight_kg: profile.bodyweight_kg === null || profile.bodyweight_kg === undefined
      ? null
      : Number(profile.bodyweight_kg),
    quiet_mode: profile.quiet_mode === true,
    theme_preference: parseThemePreference(profile.theme_preference),
    disclaimer_version: disclaimerReady ? parseDisclaimerVersion(profile.disclaimer_version) : null,
    disclaimer_accepted_at: disclaimerReady ? (profile.disclaimer_accepted_at ?? null) : null,
    disclaimer_ready: disclaimerReady,
    onboarding_answers: parseOnboardingAnswers(profile.onboarding_answers),
    age_band: parseStoredAgeBand(profile.age_band),
    cardio_preference: parseCardioPreference(profile.cardio_preference),
  };
}

type LoadedProfile = {
  /** The user this result belongs to, so a stale result is never shown for a different account. */
  userId: string | null;
  profile: Profile | null;
  error: string | null;
};

type ProfileState = {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
  saveQuizAnswers: (
    answers: QuizAnswers,
    bodyweightKg: number | null,
    extras?: {
      onboarding_answers: OnboardingAnswersJson;
      age_band: StoredAgeBand | null;
      cardio_preference: CardioPreference | null;
    }
  ) => Promise<void>;
  saveMainGoals: (goals: Goal[]) => Promise<void>;
  confirmAge: () => Promise<void>;
  /** Deletes her account and everything in it, then signs out. */
  deleteAccount: () => Promise<void>;
  /** Quiet Mode keeps Today's session in one gym zone (the Corner). */
  setQuietMode: (enabled: boolean) => Promise<void>;
  /** Moves her level up or down and records it in confidence_history. */
  setConfidenceLevel: (level: Level) => Promise<void>;
  /** Stores the current disclaimer version. No-ops the write if the SQL has not been run. */
  acceptDisclaimer: () => Promise<void>;
  /** Dev tools: run the quiz again on this account. Does not delete sessions. */
  restartOnboarding: () => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

async function selectOwnProfile(
  userId: string,
  columns: string
): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> {
  return await supabase.from('profiles').select(columns).eq('user_id', userId).maybeSingle();
}

async function loadProfile(userId: string | null): Promise<LoadedProfile> {
  if (!userId) return { userId, profile: null, error: null };
  const withX5 = await selectOwnProfile(userId, PROFILE_COLUMNS_X5);
  if (!withX5.error) {
    return {
      userId,
      profile: withX5.data ? toProfile(withX5.data, true) : null,
      error: null,
    };
  }
  if (
    !isMissingOnboardingX5(withX5.error) &&
    !isMissingGymExperience(withX5.error) &&
    !isMissingMainGoals(withX5.error) &&
    !isMissingDisclaimer(withX5.error) &&
    !isMissingThemePreference(withX5.error) &&
    !isMissingOnboardingV2(withX5.error)
  ) {
    return { userId, profile: null, error: withX5.error.message ?? 'Couldn’t load profile' };
  }
  const withGymExperience = await selectOwnProfile(userId, PROFILE_COLUMNS_G1);
  if (!withGymExperience.error) {
    return {
      userId,
      profile: withGymExperience.data ? toProfile(withGymExperience.data, true) : null,
      error: null,
    };
  }
  if (
    !isMissingGymExperience(withGymExperience.error) &&
    !isMissingMainGoals(withGymExperience.error) &&
    !isMissingDisclaimer(withGymExperience.error) &&
    !isMissingThemePreference(withGymExperience.error) &&
    !isMissingOnboardingV2(withGymExperience.error)
  ) {
    return {
      userId,
      profile: null,
      error: withGymExperience.error.message ?? 'Couldn’t load profile',
    };
  }
  const withGoals = await selectOwnProfile(userId, PROFILE_COLUMNS_GOALS);
  if (!withGoals.error) {
    return {
      userId,
      profile: withGoals.data ? toProfile(withGoals.data, true) : null,
      error: null,
    };
  }
  const missingGoalsOptional =
    isMissingMainGoals(withGoals.error) ||
    isMissingDisclaimer(withGoals.error) ||
    isMissingThemePreference(withGoals.error) ||
    isMissingOnboardingV2(withGoals.error);
  if (!missingGoalsOptional) {
    return { userId, profile: null, error: withGoals.error.message ?? 'Couldn’t load profile' };
  }
  const withDisclaimer = await selectOwnProfile(userId, PROFILE_COLUMNS_DISCLAIMER);
  if (!withDisclaimer.error) {
    return {
      userId,
      profile: withDisclaimer.data ? toProfile(withDisclaimer.data, true) : null,
      error: null,
    };
  }
  const missingOptional =
    isMissingDisclaimer(withDisclaimer.error) ||
    isMissingThemePreference(withDisclaimer.error) ||
    isMissingOnboardingV2(withDisclaimer.error);
  if (!missingOptional) {
    return { userId, profile: null, error: withDisclaimer.error.message ?? 'Couldn’t load profile' };
  }
  const withTheme = await selectOwnProfile(userId, PROFILE_COLUMNS_THEME);
  if (!withTheme.error) {
    return { userId, profile: withTheme.data ? toProfile(withTheme.data) : null, error: null };
  }
  if (!isMissingThemePreference(withTheme.error) && !isMissingOnboardingV2(withTheme.error)) {
    return { userId, profile: null, error: withTheme.error.message ?? 'Couldn’t load profile' };
  }
  const full = await selectOwnProfile(userId, PROFILE_COLUMNS_V2);
  if (!full.error) return { userId, profile: full.data ? toProfile(full.data) : null, error: null };
  if (!isMissingOnboardingV2(full.error)) return { userId, profile: null, error: full.error.message ?? 'Couldn’t load profile' };
  const base = await selectOwnProfile(userId, PROFILE_COLUMNS);
  if (base.error) return { userId, profile: null, error: base.error.message ?? 'Couldn’t load profile' };
  return { userId, profile: base.data ? toProfile(base.data) : null, error: null };
}

/** Writes the Appearance choice. No-ops if she is signed out or the column is not in the database yet. */
export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('profiles')
    .update({ theme_preference: preference })
    .eq('user_id', user.id);
  if (error && isMissingThemePreference(error)) return;
  if (error) throw error;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<LoadedProfile | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    loadProfile(userId).then((result) => {
      if (isCurrent) setLoaded(result);
    });
    return () => {
      isCurrent = false;
    };
  }, [userId, attempt]);

  const reload = useCallback(() => {
    setLoaded(null);
    setAttempt((count) => count + 1);
  }, []);

  const saveQuizAnswers = useCallback(
    async (
      answers: QuizAnswers,
      bodyweightKg: number | null,
      extras?: {
        onboarding_answers: OnboardingAnswersJson;
        age_band: StoredAgeBand | null;
        cardio_preference: CardioPreference | null;
      }
    ) => {
      if (!userId) throw new Error('You need to be signed in.');
      const previousLevel = loaded?.userId === userId ? loaded.profile?.confidence_level : null;
      const completedAt = new Date().toISOString();
      const mainGoals = userGoalsFromAnswers(answers);
      const main = mainGoals[0] ?? answers.goal;
      const legacyGoal = toLegacyGoal(main);
      const legacy = {
        user_id: userId,
        goal: legacyGoal,
        experience: answers.experience,
        days_per_week: answers.days_per_week,
        equipment: answers.equipment,
        confidence: answers.confidence,
        confidence_level: answers.confidence_level,
        bodyweight_kg: bodyweightKg,
        onboarding_completed_at: completedAt,
      };
      const payload = {
        ...legacy,
        goal: main,
        main_goal: main,
        main_goals: mainGoals,
        gym_experience: answers.gym_experience,
        session_minutes: answers.session_minutes,
        focus_areas: answers.focus_areas,
        gym_comfort: answers.confidence,
        streak_goal_weeks: answers.streak_goal_weeks,
        display_name: answers.display_name.trim() || null,
      };
      const previous = loaded?.userId === userId ? loaded.profile : null;
      const withGymExperience = await supabase.from('profiles').upsert(payload).select(PROFILE_COLUMNS_G1).single();
      if (!withGymExperience.error) {
        setLoaded({
          userId,
          profile: keepDisclaimer(toProfile(withGymExperience.data, true), previous),
          error: null,
        });
      } else if (isMissingGymExperience(withGymExperience.error)) {
        const { gym_experience: _ignoredExperience, ...withoutExperience } = payload;
        const withGoals = await supabase.from('profiles').upsert(withoutExperience).select(PROFILE_COLUMNS_GOALS).single();
        if (withGoals.error && !(isGoalConstraint(withGoals.error) && !isMissingMainGoals(withGoals.error))) {
          if (isMissingMainGoals(withGoals.error) || isMissingOnboardingV2(withGoals.error)) {
            const { main_goals: _ignored, ...withoutGoals } = withoutExperience;
            const v2Payload = { ...withoutGoals, goal: legacyGoal, main_goal: legacyGoal };
            const full = await supabase.from('profiles').upsert(v2Payload).select(PROFILE_COLUMNS_V2).single();
            if (full.error && isMissingOnboardingV2(full.error)) {
              const base = await supabase.from('profiles').upsert(legacy).select(PROFILE_COLUMNS).single();
              if (base.error) throw base.error;
              setLoaded({
                userId,
                profile: {
                  ...keepDisclaimer(toProfile(base.data), previous),
                  main_goals: mainGoals,
                  goal: main,
                  main_goal: main,
                  gym_experience: answers.gym_experience,
                },
                error: null,
              });
            } else if (full.error) {
              throw full.error;
            } else {
              setLoaded({
                userId,
                profile: {
                  ...keepDisclaimer(toProfile(full.data), previous),
                  main_goals: mainGoals,
                  goal: main,
                  main_goal: main,
                  gym_experience: answers.gym_experience,
                },
                error: null,
              });
            }
          } else {
            throw withGoals.error;
          }
        } else if (withGoals.error && isGoalConstraint(withGoals.error) && !isMissingMainGoals(withGoals.error)) {
          const stored = toStoredN4Goals(mainGoals);
          const retry = await supabase
            .from('profiles')
            .upsert({
              ...withoutExperience,
              goal: stored[0] ?? legacyGoal,
              main_goal: stored[0] ?? legacyGoal,
              main_goals: stored,
            })
            .select(PROFILE_COLUMNS_GOALS)
            .single();
          if (retry.error) throw retry.error;
          setLoaded({
            userId,
            profile: {
              ...keepDisclaimer(toProfile(retry.data, true), previous),
              main_goals: mainGoals,
              goal: main,
              main_goal: main,
              gym_experience: answers.gym_experience,
            },
            error: null,
          });
        } else if (!withGoals.error) {
          setLoaded({
            userId,
            profile: {
              ...keepDisclaimer(toProfile(withGoals.data, true), previous),
              gym_experience: answers.gym_experience,
            },
            error: null,
          });
        }
      } else if (isGoalConstraint(withGymExperience.error) && !isMissingMainGoals(withGymExperience.error)) {
        const stored = toStoredN4Goals(mainGoals);
        const retry = await supabase
          .from('profiles')
          .upsert({
            ...payload,
            goal: stored[0] ?? legacyGoal,
            main_goal: stored[0] ?? legacyGoal,
            main_goals: stored,
          })
          .select(PROFILE_COLUMNS_G1)
          .single();
        if (retry.error) throw retry.error;
        setLoaded({
          userId,
          profile: {
            ...keepDisclaimer(toProfile(retry.data, true), previous),
            main_goals: mainGoals,
            goal: main,
            main_goal: main,
          },
          error: null,
        });
      } else if (isMissingMainGoals(withGymExperience.error) || isMissingOnboardingV2(withGymExperience.error)) {
        const { main_goals: _ignored, ...withoutGoals } = payload;
        const v2Payload = { ...withoutGoals, goal: legacyGoal, main_goal: legacyGoal };
        const full = await supabase.from('profiles').upsert(v2Payload).select(PROFILE_COLUMNS_V2).single();
        if (full.error && isMissingOnboardingV2(full.error)) {
          const base = await supabase.from('profiles').upsert(legacy).select(PROFILE_COLUMNS).single();
          if (base.error) throw base.error;
          setLoaded({
            userId,
            profile: {
              ...keepDisclaimer(toProfile(base.data), previous),
              main_goals: mainGoals,
              goal: main,
              main_goal: main,
            },
            error: null,
          });
        } else if (full.error) {
          throw full.error;
        } else {
          setLoaded({
            userId,
            profile: {
              ...keepDisclaimer(toProfile(full.data), previous),
              main_goals: mainGoals,
              goal: main,
              main_goal: main,
            },
            error: null,
          });
        }
      } else {
        throw withGymExperience.error;
      }
      if (extras) {
        const outcome = await saveOwnProfileFields(userId, extras);
        if (outcome === 'missing-column') {
          await saveOwnProfileFields(userId, { onboarding_answers: extras.onboarding_answers });
          await saveOwnProfileFields(userId, { age_band: extras.age_band });
          await saveOwnProfileFields(userId, { cardio_preference: extras.cardio_preference });
        }
      }
      if (!previous?.onboarding_completed_at) track('onboarding_completed');
      if (previousLevel && previousLevel !== answers.confidence_level) {
        await recordLevelChange(previousLevel, answers.confidence_level).catch(() => {});
      }
    },
    [userId, loaded]
  );

  const saveMainGoals = useCallback(
    async (goals: Goal[]) => {
      const previous = loaded?.userId === userId ? loaded.profile : null;
      const answers = getQuizAnswers(previous);
      if (!answers) throw new Error('Finish onboarding first, then you can change your goals.');
      const next = parseMainGoals(goals);
      if (next.length === 0) throw new Error('Pick at least one goal.');
      await saveQuizAnswers(
        { ...answers, goal: next[0], main_goals: next, focus_areas: focusAreasFromGoals(next) },
        previous?.bodyweight_kg ?? null
      );
    },
    [userId, loaded, saveQuizAnswers]
  );

  const confirmAge = useCallback(async () => {
    if (!userId) throw new Error('You need to be signed in.');
    const acceptedAt = new Date().toISOString();
    let outcome: 'saved' | 'missing-column' = 'saved';
    try {
      outcome = await saveOwnProfileFields(userId, { age_confirmed_at: acceptedAt });
    } catch (error) {
      if (!isMissingAgeConfirmed(error as { message?: string; code?: string })) throw error;
      outcome = 'missing-column';
    }
    const previous = loaded?.userId === userId ? loaded.profile : null;
    const result = outcome === 'saved' ? await loadProfile(userId) : { profile: previous };
    const next = result.profile ?? previous;
    if (next) {
      setLoaded({
        userId,
        profile: {
          ...keepDisclaimer(next, previous),
          age_confirmed_at: acceptedAt,
        },
        error: null,
      });
    }
  }, [userId, loaded]);

  const deleteAccount = useCallback(async () => {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) throw error;
    resetAnalytics();
    await supabase.auth.signOut();
  }, []);

  const setQuietMode = useCallback(
    async (enabled: boolean) => {
      if (!userId) throw new Error('You need to be signed in.');
      const { data, error } = await supabase
        .from('profiles')
        .update({ quiet_mode: enabled })
        .eq('user_id', userId)
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw error;
      const previous = loaded?.userId === userId ? loaded.profile : null;
      setLoaded({ userId, profile: keepDisclaimer(toProfile(data), previous), error: null });
    },
    [userId, loaded]
  );

  const setConfidenceLevel = useCallback(
    async (level: Level) => {
      if (!userId) throw new Error('You need to be signed in.');
      const from = loaded?.userId === userId ? loaded.profile?.confidence_level : null;
      if (!from || from === level) return;
      const { data, error } = await supabase
        .from('profiles')
        .update({ confidence_level: level })
        .eq('user_id', userId)
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw error;
      const previous = loaded?.userId === userId ? loaded.profile : null;
      setLoaded({ userId, profile: keepDisclaimer(toProfile(data), previous), error: null });
      await recordLevelChange(from, level).catch(() => {});
    },
    [userId, loaded]
  );

  const acceptDisclaimer = useCallback(async () => {
    if (!userId) throw new Error('You need to be signed in.');
    const acceptedAt = new Date().toISOString();
    const payload = {
      disclaimer_version: DISCLAIMER_VERSION,
      disclaimer_accepted_at: acceptedAt,
    };
    let outcome: 'saved' | 'missing-column' = 'saved';
    try {
      outcome = await saveOwnProfileFields(userId, payload);
    } catch (error) {
      if (!isMissingDisclaimer(error as { message?: string; code?: string })) throw error;
      outcome = 'missing-column';
    }
    const previous = loaded?.userId === userId ? loaded.profile : null;
    const result = outcome === 'saved' ? await loadProfile(userId) : { profile: previous };
    const next = result.profile ?? previous;
    if (next) {
      setLoaded({
        userId,
        profile: {
          ...keepDisclaimer(next, previous),
          disclaimer_version: DISCLAIMER_VERSION,
          disclaimer_accepted_at: acceptedAt,
          disclaimer_ready: outcome === 'saved',
        },
        error: null,
      });
    }
    track('disclaimer_accepted', { version: DISCLAIMER_VERSION });
  }, [userId, loaded]);

  const restartOnboarding = useCallback(async () => {
    if (!userId) throw new Error('You need to be signed in.');
    const attempts: Record<string, unknown>[] = [
      {
        onboarding_completed_at: null,
        age_confirmed_at: null,
        disclaimer_version: null,
        disclaimer_accepted_at: null,
        onboarding_answers: {},
        age_band: null,
        cardio_preference: null,
      },
      {
        onboarding_completed_at: null,
        age_confirmed_at: null,
        disclaimer_version: null,
        disclaimer_accepted_at: null,
      },
      { onboarding_completed_at: null, age_confirmed_at: null },
      { onboarding_completed_at: null },
    ];
    let saved = false;
    for (const fields of attempts) {
      const outcome = await saveOwnProfileFields(userId, fields);
      if (outcome === 'saved') {
        saved = true;
        break;
      }
    }
    if (!saved) {
      throw new Error('Couldn’t reset onboarding. Check your connection and try again.');
    }
    const previous = loaded?.userId === userId ? loaded.profile : null;
    if (previous) {
      setLoaded({
        userId,
        profile: {
          ...previous,
          onboarding_completed_at: null,
          age_confirmed_at: null,
          disclaimer_version: null,
          disclaimer_accepted_at: null,
          onboarding_answers: {},
          age_band: null,
          cardio_preference: null,
        },
        error: null,
      });
    } else {
      setLoaded(null);
    }
  }, [userId, loaded]);

  const isLoading = loaded === null || loaded.userId !== userId;

  return (
    <ProfileContext.Provider
      value={{
        profile: isLoading ? null : (loaded?.profile ?? null),
        isLoading,
        error: isLoading ? null : (loaded?.error ?? null),
        reload,
        saveQuizAnswers,
        saveMainGoals,
        confirmAge,
        deleteAccount,
        setQuietMode,
        setConfidenceLevel,
        acceptDisclaimer,
        restartOnboarding,
      }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileState {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('useProfile must be used inside ProfileProvider');
  return value;
}

/** The saved quiz answers, or null if the quiz hasn't been completed. */
export function getQuizAnswers(profile: Profile | null): QuizAnswers | null {
  if (!profile?.onboarding_completed_at) return null;
  const goals =
    profile.main_goals.length > 0
      ? profile.main_goals
      : profile.goal
        ? [profile.goal]
        : [];
  const goal = goals[0];
  const { experience, days_per_week, equipment, confidence, confidence_level } = profile;
  if (!goal || !experience || !days_per_week || !equipment || !confidence || !confidence_level) {
    return null;
  }
  return {
    goal,
    main_goals: goals,
    experience,
    days_per_week,
    equipment,
    confidence,
    confidence_level,
    gym_experience:
      profile.gym_experience ?? gymExperienceFromLegacy(profile.training_location, experience),
    session_minutes: profile.session_minutes ?? DEFAULT_SESSION_MINUTES,
    focus_areas: profile.focus_areas.length > 0 ? profile.focus_areas : focusAreasFromGoals(goals),
    streak_goal_weeks: profile.streak_goal_weeks ?? DEFAULT_STREAK_GOAL,
    display_name: profile.display_name ?? '',
  };
}
