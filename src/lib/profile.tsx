import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth';
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

export const DAYS_PER_WEEK_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
export type DaysPerWeek = (typeof DAYS_PER_WEEK_OPTIONS)[number];

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

export type QuizAnswers = {
  goal: Goal;
  experience: Experience;
  days_per_week: DaysPerWeek;
  equipment: EquipmentAccess;
  confidence: Confidence;
  confidence_level: Level;
};

/** One row of the `profiles` table. Quiz fields are null until the quiz is saved. */
export type Profile = {
  user_id: string;
  goal: Goal | null;
  experience: Experience | null;
  days_per_week: DaysPerWeek | null;
  equipment: EquipmentAccess | null;
  confidence: Confidence | null;
  confidence_level: Level | null;
  /** Optional. Only for relative-strength stats; never BMI or any health score. */
  bodyweight_kg: number | null;
  /** Null until she confirms she's 18 or over. */
  age_confirmed_at: string | null;
  /** Assigned by the database from the quiz answers (see supabase/programmes.sql). */
  programme_id: string | null;
  programme: { name: string; days_per_week: number } | null;
  cycle_tracking_enabled: boolean;
  onboarding_completed_at: string | null;
};

const PROFILE_COLUMNS =
  'user_id, goal, experience, days_per_week, equipment, confidence, confidence_level, bodyweight_kg, age_confirmed_at, programme_id, programme:programmes(name, days_per_week), cycle_tracking_enabled, onboarding_completed_at';

/** numeric columns arrive as strings. */
function toProfile(row: unknown): Profile {
  const profile = row as Profile;
  return {
    ...profile,
    bodyweight_kg: profile.bodyweight_kg === null ? null : Number(profile.bodyweight_kg),
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
  /** Turning on records her consent (see supabase/cycle.sql). Turning off keeps her notes. */
  setCycleTracking: (enabled: boolean) => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

async function loadProfile(userId: string | null): Promise<LoadedProfile> {
  if (!userId) return { userId, profile: null, error: null };
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { userId, profile: null, error: error.message };
  return { userId, profile: data ? toProfile(data) : null, error: null };
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
      // Upsert so it still works for an account that somehow has no profile row yet.
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          user_id: userId,
          ...answers,
          bodyweight_kg: bodyweightKg,
          onboarding_completed_at: new Date().toISOString(),
        })
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw error;
      setLoaded({ userId, profile: toProfile(data), error: null });
    },
    [userId]
  );

  const confirmAge = useCallback(async () => {
    if (!userId) throw new Error('You need to be signed in.');
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ user_id: userId, age_confirmed_at: new Date().toISOString() })
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;
    setLoaded({ userId, profile: toProfile(data), error: null });
  }, [userId]);

  const deleteAccount = useCallback(async () => {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) throw error;
    await supabase.auth.signOut();
  }, []);

  const setCycleTracking = useCallback(
    async (enabled: boolean) => {
      if (!userId) throw new Error('You need to be signed in.');
      const { data, error } = await supabase
        .from('profiles')
        .update({ cycle_tracking_enabled: enabled })
        .eq('user_id', userId)
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw error;
      setLoaded({ userId, profile: toProfile(data), error: null });
    },
    [userId]
  );

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
        setCycleTracking,
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
  return { goal, experience, days_per_week, equipment, confidence, confidence_level };
}
