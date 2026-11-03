import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { parseThemePreference, type ThemePreference } from '@/constants/theme';
import { DEFAULT_STREAK_GOAL, STREAK_GOALS, type StreakGoal } from '@/lib/activityStats';
import { useAuth } from '@/lib/auth';
import { DISCLAIMER_VERSION } from '@/lib/disclaimer';
import { recordLevelChange } from '@/lib/levelUp';
import { supabase } from '@/lib/supabase';

// Allowed values. Keep these lists in step with supabase/profiles.sql.
export const GOALS = ['strength', 'glutes_legs', 'general'] as const;
export type Goal = (typeof GOALS)[number];

export const GOAL_LABELS: Record<Goal, string> = {
  strength: 'Get stronger',
  glutes_legs: 'Glutes and legs',
  general: 'General fitness',
};

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
  dumbbells: 'Dumbbells only',
  home: 'At home',
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
  experience: Experience;
  days_per_week: DaysPerWeek;
  equipment: EquipmentAccess;
  confidence: Confidence;
  confidence_level: Level;
  training_location: TrainingLocation;
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
  experience: Experience | null;
  days_per_week: DaysPerWeek | null;
  equipment: EquipmentAccess | null;
  training_location: TrainingLocation | null;
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
};

const PROFILE_COLUMNS =
  'user_id, goal, experience, days_per_week, equipment, confidence, confidence_level, bodyweight_kg, age_confirmed_at, programme_id, programme:programmes(name, days_per_week), quiet_mode, onboarding_completed_at';
const ONBOARDING_V2_COLUMNS =
  'main_goal, training_location, session_minutes, focus_areas, gym_comfort, streak_goal_weeks, display_name';
const PROFILE_COLUMNS_V2 = `${PROFILE_COLUMNS}, ${ONBOARDING_V2_COLUMNS}`;
const PROFILE_COLUMNS_THEME = `${PROFILE_COLUMNS_V2}, theme_preference`;
const PROFILE_COLUMNS_DISCLAIMER = `${PROFILE_COLUMNS_THEME}, disclaimer_version, disclaimer_accepted_at`;

function isMissingOnboardingV2(error: { message?: string; code?: string }): boolean {
  return /main_goal|training_location|session_minutes|focus_areas|gym_comfort|streak_goal_weeks|display_name/i.test(
    `${error.code ?? ''} ${error.message ?? ''}`
  );
}

function isMissingThemePreference(error: { message?: string; code?: string }): boolean {
  return /theme_preference/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingDisclaimer(error: { message?: string; code?: string }): boolean {
  return /disclaimer_version|disclaimer_accepted_at/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function parseDisclaimerVersion(value: unknown): number | null {
  if (value == null || value === '') return null;
  const version = Number(value);
  return Number.isFinite(version) ? version : null;
}

function keepDisclaimer(next: Profile, previous: Profile | null | undefined): Profile {
  if (next.disclaimer_ready) return next;
  if (!previous) return next;
  return {
    ...next,
    disclaimer_version: previous.disclaimer_version,
    disclaimer_accepted_at: previous.disclaimer_accepted_at,
    disclaimer_ready: previous.disclaimer_ready,
  };
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
  return goal === 'glutes_legs' ? ['glutes', 'legs'] : ['full_body'];
}

export function equipmentOptionsForLocation(location: TrainingLocation): EquipmentAccess[] {
  if (location === 'home') return ['dumbbells', 'home'];
  if (location === 'gym') return ['full_gym', 'dumbbells'];
  return ['full_gym', 'dumbbells', 'home'];
}

/** numeric columns arrive as strings. */
function toProfile(row: unknown, disclaimerReady = false): Profile {
  const profile = row as Profile;
  return {
    ...profile,
    main_goal: profile.main_goal ?? profile.goal ?? null,
    training_location: profile.training_location ?? null,
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
  saveQuizAnswers: (answers: QuizAnswers, bodyweightKg: number | null) => Promise<void>;
  confirmAge: () => Promise<void>;
  /** Deletes her account and everything in it, then signs out. */
  deleteAccount: () => Promise<void>;
  /** Quiet Mode keeps Today's session in one gym zone (the Corner). */
  setQuietMode: (enabled: boolean) => Promise<void>;
  /** Moves her level up or down and records it in confidence_history. */
  setConfidenceLevel: (level: Level) => Promise<void>;
  /** Stores the current disclaimer version. No-ops the write if the SQL has not been run. */
  acceptDisclaimer: () => Promise<void>;
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
    async (answers: QuizAnswers, bodyweightKg: number | null) => {
      if (!userId) throw new Error('You need to be signed in.');
      const previousLevel = loaded?.userId === userId ? loaded.profile?.confidence_level : null;
      const completedAt = new Date().toISOString();
      const legacy = {
        user_id: userId,
        goal: answers.goal,
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
        main_goal: answers.goal,
        training_location: answers.training_location,
        session_minutes: answers.session_minutes,
        focus_areas: answers.focus_areas,
        gym_comfort: answers.confidence,
        streak_goal_weeks: answers.streak_goal_weeks,
        display_name: answers.display_name.trim() || null,
      };
      const full = await supabase.from('profiles').upsert(payload).select(PROFILE_COLUMNS_V2).single();
      const previous = loaded?.userId === userId ? loaded.profile : null;
      if (full.error && isMissingOnboardingV2(full.error)) {
        const base = await supabase.from('profiles').upsert(legacy).select(PROFILE_COLUMNS).single();
        if (base.error) throw base.error;
        setLoaded({ userId, profile: keepDisclaimer(toProfile(base.data), previous), error: null });
      } else if (full.error) {
        throw full.error;
      } else {
        setLoaded({ userId, profile: keepDisclaimer(toProfile(full.data), previous), error: null });
      }
      if (previousLevel && previousLevel !== answers.confidence_level) {
        await recordLevelChange(previousLevel, answers.confidence_level).catch(() => {});
      }
    },
    [userId, loaded]
  );

  const confirmAge = useCallback(async () => {
    if (!userId) throw new Error('You need to be signed in.');
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ user_id: userId, age_confirmed_at: new Date().toISOString() })
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;
    const previous = loaded?.userId === userId ? loaded.profile : null;
    setLoaded({ userId, profile: keepDisclaimer(toProfile(data), previous), error: null });
  }, [userId, loaded]);

  const deleteAccount = useCallback(async () => {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) throw error;
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
    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('user_id', userId)
      .select(PROFILE_COLUMNS_DISCLAIMER)
      .single();
    if (error && isMissingDisclaimer(error)) {
      const previous = loaded?.userId === userId ? loaded.profile : null;
      if (previous) {
        setLoaded({
          userId,
          profile: {
            ...previous,
            disclaimer_version: DISCLAIMER_VERSION,
            disclaimer_accepted_at: acceptedAt,
            disclaimer_ready: false,
          },
          error: null,
        });
      }
      return;
    }
    if (error) throw error;
    setLoaded({ userId, profile: toProfile(data, true), error: null });
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
        confirmAge,
        deleteAccount,
        setQuietMode,
        setConfidenceLevel,
        acceptDisclaimer,
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
  const { goal, experience, days_per_week, equipment, confidence, confidence_level } = profile;
  if (!goal || !experience || !days_per_week || !equipment || !confidence || !confidence_level) {
    return null;
  }
  return {
    goal,
    experience,
    days_per_week,
    equipment,
    confidence,
    confidence_level,
    training_location:
      profile.training_location ?? trainingLocationFromEquipment(equipment),
    session_minutes: profile.session_minutes ?? DEFAULT_SESSION_MINUTES,
    focus_areas: profile.focus_areas.length > 0 ? profile.focus_areas : focusAreasFromGoal(goal),
    streak_goal_weeks: profile.streak_goal_weeks ?? DEFAULT_STREAK_GOAL,
    display_name: profile.display_name ?? '',
  };
}
