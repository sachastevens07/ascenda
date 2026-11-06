import AsyncStorage from '@react-native-async-storage/async-storage';

import { GOAL_LABELS, userGoalsFromAnswers, type Goal, type QuizAnswers } from '@/lib/profile';
import { usesWeight } from '@/lib/programmes';
import {
  fetchActiveEnrolment,
  fetchRoutines,
  pickFeaturedRoutines,
  startRoutine,
  type Routine,
  type RoutineSummary,
} from '@/lib/routines';

export const FREE_STARTER_ROUTINE_ID = 'strong-foundations-6-weeks';
const STARTER_FALLBACKS = [
  'strong-foundations-6-weeks',
  'the-two-day-start',
  'gym-confidence-6',
  'full-body-3',
];
const ONBOARDING_PAYWALL_KEY = 'pending-onboarding-paywall';

export async function queueOnboardingPaywall(recommendedId: string): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_PAYWALL_KEY, recommendedId);
}

/** Returns the queued recommended id, or null if none. Clears the flag. */
export async function consumeOnboardingPaywall(): Promise<string | null> {
  const value = await AsyncStorage.getItem(ONBOARDING_PAYWALL_KEY);
  if (value === null) return null;
  await AsyncStorage.removeItem(ONBOARDING_PAYWALL_KEY);
  return value;
}

function recommendationMatchesGoal(
  routineGoal: Routine['goal'] | RoutineSummary['goal'],
  goal: Goal
): boolean {
  if (goal === 'glutes_and_legs') return routineGoal === 'glutes_legs';
  if (goal === 'gym_confidence' || goal === 'back_to_training') return routineGoal === 'confidence';
  if (
    goal === 'build_strength' ||
    goal === 'build_muscle' ||
    goal === 'upper_body_strength' ||
    goal === 'strong_for_life' ||
    goal === 'feel_toned' ||
    goal === 'lose_body_fat'
  ) {
    return routineGoal === 'strength';
  }
  return routineGoal === 'general';
}

export function pickRecommendedRoutine(
  routines: RoutineSummary[],
  answers: QuizAnswers
): RoutineSummary | null {
  return pickFeaturedRoutines(routines, answers, 3)[0] ?? null;
}

export function describeRecommendation(routine: RoutineSummary, answers: QuizAnswers): string {
  const reasons: string[] = [];
  if (
    (routine.id === FREE_STARTER_ROUTINE_ID || routine.id === 'gym-confidence-6') &&
    (answers.gym_experience === 'not_yet' ||
      answers.gym_experience === 'just_started' ||
      answers.experience === 'new' ||
      answers.confidence <= 2)
  ) {
    reasons.push('You said the gym still feels new, so this starts in one quiet spot.');
  }
  const goals = userGoalsFromAnswers(answers);
  const matching = goals.filter((goal) => recommendationMatchesGoal(routine.goal, goal));
  if (matching[0] === goals[0]) {
    reasons.push(`It matches your main goal: ${GOAL_LABELS[matching[0]].toLowerCase()}.`);
  } else if (matching[0]) {
    reasons.push(`It fits ${GOAL_LABELS[matching[0]].toLowerCase()}, one of your goals.`);
  }
  if (routine.days_per_week === answers.days_per_week) {
    reasons.push(
      answers.days_per_week === 1
        ? 'It’s one day a week, like you asked.'
        : `It’s ${answers.days_per_week} days a week, like you asked.`
    );
  }
  if (
    (answers.experience === 'new' ||
      answers.gym_experience === 'not_yet' ||
      answers.gym_experience === 'just_started') &&
    routine.difficulty === 'beginner'
  ) {
    reasons.push('The sessions stay beginner-friendly.');
  }
  if (routine.equipment === answers.equipment && routine.equipment !== 'home') {
    reasons.push('It uses the kit you said you have at the gym.');
  }
  if (answers.session_minutes && Math.abs(routine.session_minutes - answers.session_minutes) <= 15) {
    reasons.push(`Sessions are about ${routine.session_minutes} minutes.`);
  }
  if (reasons.length === 0) {
    reasons.push('It fits the days, kit and goal you just told us.');
  }
  return reasons.join(' ');
}

const STARTING_KG: Record<string, number> = {
  barbell: 40,
  dumbbell: 12,
  machine: 20,
  cable: 15,
  kettlebell: 12,
};

export type LiftProjection = {
  exerciseName: string;
  points: { week: number; kg: number }[];
};

/** Conservative estimate: the key lift increases when set 1 hits the top, assumed every other week. */
export function projectKeyLift(routine: Routine): LiftProjection | null {
  const firstDay = routine.weeks[0]?.days[0];
  const lift = firstDay?.exercises.find((item) => usesWeight(item.exercise.equipment));
  if (!lift) return null;
  const step = lift.exercise.weight_increase_kg;
  if (step === null || step <= 0) return null;
  const startKg = STARTING_KG[lift.exercise.equipment] ?? 16;
  const points: { week: number; kg: number }[] = [];
  let kg = startKg;
  for (let week = 1; week <= routine.length_weeks; week += 1) {
    points.push({ week, kg: Math.round(kg * 10) / 10 });
    if (week % 2 === 0) kg = Math.round((kg + step) * 100) / 100;
  }
  return { exerciseName: lift.exercise.name, points };
}

function pickStarterId(
  routines: RoutineSummary[],
  preferredId: string | undefined
): string | null {
  const ids = [preferredId, ...STARTER_FALLBACKS].filter((id): id is string => Boolean(id));
  for (const id of ids) {
    if (routines.some((item) => item.id === id)) return id;
  }
  return routines[0]?.id ?? null;
}

/** Starts the recommended routine after the plan reveal. */
export async function startOnboardingRoutine(input: {
  recommendedId?: string;
}): Promise<void> {
  const routines = await fetchRoutines().catch(() => []);
  const startId = pickStarterId(routines, input.recommendedId);
  if (!startId) return;

  const existing = await fetchActiveEnrolment().catch(() => null);
  if (existing?.routine_id === startId) return;
  await startRoutine(startId).catch(() => {});
}
