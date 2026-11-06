import { contentRoutine } from '@/lib/contentRoutines';
import { programmesCopy } from '@/lib/copy';
import {
  draftFromSaved,
  type OnboardingDraft,
} from '@/lib/onboardingAnswers';
import { recommendPlan } from '@/lib/onboardingPlan';
import { getQuizAnswers, type Profile } from '@/lib/profile';
import {
  isGymBackupRoutine,
  isWelcomeBackRoutine,
  type RoutineSummary,
} from '@/lib/routines';
import {
  featuredSingleSessions,
  listSingleSessions,
  type SingleSession,
} from '@/lib/singleSessions';

export type TrainingStyleId =
  | 'gym_confidence'
  | 'strength'
  | 'glutes'
  | 'upper'
  | 'full_body'
  | 'cardio'
  | 'stretch'
  | 'busy_gym'
  | 'cant_get_to_gym';

export type TrainingStyle = {
  id: TrainingStyleId;
  label: string;
  wide?: boolean;
  coverSlug: string;
};

export const TRAINING_STYLES: TrainingStyle[] = [
  { id: 'gym_confidence', label: programmesCopy.style_gym_confidence, wide: true, coverSlug: 'learn-category-gym-confidence' },
  { id: 'strength', label: programmesCopy.style_strength, coverSlug: 'higher-ground-cover' },
  { id: 'glutes', label: programmesCopy.style_glutes, coverSlug: 'glutes-legs-cover' },
  { id: 'upper', label: programmesCopy.style_upper, coverSlug: 'upper-body-cover' },
  { id: 'full_body', label: programmesCopy.style_full_body, coverSlug: 'the-climb-cover' },
  { id: 'cardio', label: programmesCopy.style_cardio, coverSlug: 'strong-and-fit-cover' },
  { id: 'stretch', label: programmesCopy.style_stretch, coverSlug: 'morning-mobility-cover' },
  { id: 'busy_gym', label: programmesCopy.style_busy_gym, coverSlug: 'busy-gym-cover' },
  { id: 'cant_get_to_gym', label: programmesCopy.style_cant_get_to_gym, coverSlug: 'home-dumbbell-cover' },
];

function tagsOf(routine: RoutineSummary): string[] {
  return routine.tags.map((tag) => tag.toLowerCase());
}

export function routineMatchesStyle(routine: RoutineSummary, style: TrainingStyleId): boolean {
  if (isWelcomeBackRoutine(routine)) return false;
  const tags = tagsOf(routine);
  const overlay = contentRoutine(routine.slug) ?? contentRoutine(routine.id);
  switch (style) {
    case 'gym_confidence':
      return routine.goal === 'confidence';
    case 'strength':
      return routine.goal === 'strength';
    case 'glutes':
      return routine.goal === 'glutes_legs' || tags.some((tag) => tag.includes('glute'));
    case 'upper':
      return tags.some((tag) => tag.includes('upper')) || /upper/i.test(routine.name);
    case 'full_body':
      return tags.some((tag) => tag.includes('full body'));
    case 'cardio':
      return overlay?.cardio_balanced === true;
    case 'busy_gym':
      return tags.some((tag) => tag.includes('busy gym'));
    case 'cant_get_to_gym':
      return isGymBackupRoutine(routine);
    case 'stretch':
      return routine.type === 'stretch';
  }
}

export function singleMatchesStyle(session: SingleSession, style: TrainingStyleId): boolean {
  switch (style) {
    case 'gym_confidence':
      return session.category === 'start_here' || session.category === 'machines';
    case 'strength':
      return session.category === 'strength' || session.category === 'quick';
    case 'glutes':
      return session.category === 'glutes';
    case 'upper':
      return session.category === 'arms' || session.category === 'posture' || session.focus === 'upper';
    case 'full_body':
      return session.focus === 'full_body' && session.where === 'gym';
    case 'cardio':
      return session.type === 'cardio';
    case 'busy_gym':
      return session.category === 'busy_gym';
    case 'cant_get_to_gym':
      return session.where === 'home' || session.category === 'cant_get_to_gym';
    case 'stretch':
      return session.type === 'stretch';
  }
}

export function startHereRoutines(routines: RoutineSummary[]): RoutineSummary[] {
  return routines.filter(
    (routine) =>
      routine.type !== 'stretch' &&
      !isGymBackupRoutine(routine) &&
      !isWelcomeBackRoutine(routine) &&
      routine.difficulty === 'beginner' &&
      (routine.goal === 'confidence' || tagsOf(routine).some((tag) => tag.includes('beginner')))
  );
}

export function browseableRoutines(routines: RoutineSummary[]): RoutineSummary[] {
  return routines.filter(
    (routine) => routine.type !== 'stretch' && !isWelcomeBackRoutine(routine)
  );
}

export function draftFromProfile(profile: Profile | null): OnboardingDraft | null {
  const answers = getQuizAnswers(profile);
  if (!answers) return null;
  return draftFromSaved({
    answers,
    extras: profile?.onboarding_answers,
    age_band: profile?.age_band,
    cardio_preference: profile?.cardio_preference,
    bodyweight_kg: profile?.bodyweight_kg,
  });
}

export function recommendedBrowseRoutine(
  routines: RoutineSummary[],
  profile: Profile | null
): RoutineSummary | null {
  const draft = draftFromProfile(profile);
  if (!draft) return null;
  const plan = recommendPlan(draft);
  if (!plan) return null;
  const slug = plan.recommended.slug;
  return (
    routines.find((routine) => routine.id === slug || routine.slug === slug) ??
    startHereRoutines(routines)[0] ??
    null
  );
}

export function stylesWithContent(
  routines: RoutineSummary[],
  singles: SingleSession[] = listSingleSessions()
): TrainingStyle[] {
  return TRAINING_STYLES.filter((style) => {
    if (style.id === 'stretch') return true;
    const hasRoutine = browseableRoutines(routines).some((routine) =>
      routineMatchesStyle(routine, style.id)
    );
    const hasSingle = singles.some((session) => singleMatchesStyle(session, style.id));
    return hasRoutine || hasSingle;
  });
}

export { featuredSingleSessions };
