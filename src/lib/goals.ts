/**
 * Goal values and copy from content/onboarding/onboarding.json (N4).
 * Bundled. content:sync does not write onboarding into the database.
 */
import onboarding from '../../content/onboarding/onboarding.json';

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

function screenById(id: string): Json {
  return asArray(asRecord(onboarding).screens).map(asRecord).find((item) => text(item.id) === id) ?? {};
}

const GOALS_SCREEN = screenById('goals');
const INSIGHT_SCREEN = screenById('insight_goals');

export const MAX_MAIN_GOALS = 3;

/** Content ids, in the order written in onboarding.json. */
export const GOALS = [
  'build_strength',
  'build_muscle',
  'glutes_and_legs',
  'upper_body_strength',
  'feel_toned',
  'gym_confidence',
  'fitness_stamina',
  'mobility',
  'better_posture',
  'more_energy',
  'stress_relief',
  'strong_for_life',
  'back_to_training',
  'lose_body_fat',
] as const;

export type Goal = (typeof GOALS)[number];

const GOAL_SET = new Set<string>(GOALS);

/** Older saved ids → content ids. */
const GOAL_ALIASES: Record<string, Goal> = {
  strength: 'build_strength',
  muscle: 'build_muscle',
  glutes_legs: 'glutes_and_legs',
  upper_body: 'upper_body_strength',
  toned: 'feel_toned',
  stamina: 'fitness_stamina',
  general: 'fitness_stamina',
  posture: 'better_posture',
  energy: 'more_energy',
  wellbeing: 'stress_relief',
  longevity: 'strong_for_life',
  return: 'back_to_training',
  lose_fat: 'lose_body_fat',
};

const FALLBACK_LABELS: Record<Goal, string> = {
  build_strength: 'Build strength',
  build_muscle: 'Build muscle',
  glutes_and_legs: 'Glutes and legs',
  upper_body_strength: 'Upper body strength',
  feel_toned: 'Feel toned and defined',
  gym_confidence: 'Gym confidence',
  fitness_stamina: 'Get fitter and improve stamina',
  mobility: 'Mobility and flexibility',
  better_posture: 'Better posture',
  more_energy: 'More energy',
  stress_relief: 'Stress relief and mental wellbeing',
  strong_for_life: 'Strong for life (bones and joints)',
  back_to_training: 'Get back into training after a break',
  lose_body_fat: 'Lose body fat',
};

function labelsFromContent(): Record<Goal, string> {
  const labels = { ...FALLBACK_LABELS };
  for (const item of asArray(GOALS_SCREEN.options).map(asRecord)) {
    const goal = parseGoal(item.value);
    const label = text(item.label);
    if (goal && label) labels[goal] = label;
  }
  return labels;
}

export const GOAL_LABELS: Record<Goal, string> = labelsFromContent();

const insightBodies = asRecord(INSIGHT_SCREEN.body_by_main_goal);

export const GOAL_COPY: Record<Goal, string> = {
  build_strength: text(insightBodies.build_strength) || FALLBACK_LABELS.build_strength,
  build_muscle: text(insightBodies.build_muscle) || FALLBACK_LABELS.build_muscle,
  glutes_and_legs: text(insightBodies.glutes_and_legs) || FALLBACK_LABELS.glutes_and_legs,
  upper_body_strength: text(insightBodies.upper_body_strength) || FALLBACK_LABELS.upper_body_strength,
  feel_toned: text(insightBodies.feel_toned) || FALLBACK_LABELS.feel_toned,
  gym_confidence: text(insightBodies.gym_confidence) || FALLBACK_LABELS.gym_confidence,
  fitness_stamina: text(insightBodies.fitness_stamina) || FALLBACK_LABELS.fitness_stamina,
  mobility: text(insightBodies.mobility) || FALLBACK_LABELS.mobility,
  better_posture: text(insightBodies.better_posture) || FALLBACK_LABELS.better_posture,
  more_energy: text(insightBodies.more_energy) || FALLBACK_LABELS.more_energy,
  stress_relief: text(insightBodies.stress_relief) || FALLBACK_LABELS.stress_relief,
  strong_for_life: text(insightBodies.strong_for_life) || FALLBACK_LABELS.strong_for_life,
  back_to_training: text(insightBodies.back_to_training) || FALLBACK_LABELS.back_to_training,
  lose_body_fat:
    text(insightBodies.lose_body_fat) ||
    'Building strength is a great foundation. We focus on getting you strong and consistent, with no calorie targets.',
};

export const GOAL_SCREEN_TITLE = text(GOALS_SCREEN.title) || 'What would you love to achieve?';
export const GOAL_HELPER = text(GOALS_SCREEN.helper) || 'Pick up to 3. Your first pick is your main goal.';
export const GOAL_MAIN_LABEL = text(GOALS_SCREEN.main_label) || 'Main';
export const GOAL_LIMIT_HINT = text(GOALS_SCREEN.limit_hint) || 'You can pick up to 3. Tap one to swap it out.';
export const GOAL_INSIGHT_TITLE = text(INSIGHT_SCREEN.title) || 'Great choices, {name}';

const LEGACY_GOALS = ['strength', 'glutes_legs', 'general'] as const;
type LegacyGoal = (typeof LEGACY_GOALS)[number];

/** Ids the previous N4 constraint still accepts. */
const N4_STORED: Record<Goal, string> = {
  build_strength: 'strength',
  build_muscle: 'muscle',
  glutes_and_legs: 'glutes_legs',
  upper_body_strength: 'upper_body',
  feel_toned: 'toned',
  gym_confidence: 'gym_confidence',
  fitness_stamina: 'stamina',
  mobility: 'mobility',
  better_posture: 'posture',
  more_energy: 'energy',
  stress_relief: 'wellbeing',
  strong_for_life: 'longevity',
  back_to_training: 'return',
  lose_body_fat: 'lose_fat',
};

export function parseGoal(value: unknown): Goal | null {
  const raw = String(value);
  if (GOAL_SET.has(raw)) return raw as Goal;
  return GOAL_ALIASES[raw] ?? null;
}

export function parseMainGoals(value: unknown): Goal[] {
  const raw = Array.isArray(value) ? value : [];
  const unique: Goal[] = [];
  for (const item of raw) {
    const goal = parseGoal(item);
    if (goal && !unique.includes(goal)) unique.push(goal);
    if (unique.length === MAX_MAIN_GOALS) break;
  }
  return unique;
}

/** Three-value column used before the expanded N4 list. */
export function toLegacyGoal(goal: Goal): LegacyGoal {
  if (goal === 'glutes_and_legs') return 'glutes_legs';
  if (
    goal === 'build_strength' ||
    goal === 'build_muscle' ||
    goal === 'upper_body_strength' ||
    goal === 'strong_for_life' ||
    goal === 'feel_toned' ||
    goal === 'lose_body_fat'
  ) {
    return 'strength';
  }
  return 'general';
}

/** Previous N4 ids, for a constraint that has not been updated yet. */
export function toStoredN4Goals(goals: Goal[]): string[] {
  return goals.map((goal) => N4_STORED[goal]);
}

export function formatGoalsLabel(goals: Goal[]): string {
  if (goals.length === 0) return '';
  return goals
    .map((goal, index) => (index === 0 && goals.length > 1 ? `${GOAL_LABELS[goal]} (main)` : GOAL_LABELS[goal]))
    .join(', ');
}

/** Tap to add, tap main to remove, tap another pick to make it main. */
export function toggleMainGoal(
  selected: Goal[],
  value: Goal
): { next: Goal[]; hint: string | null } {
  const index = selected.indexOf(value);
  if (index === 0) {
    return { next: selected.slice(1), hint: null };
  }
  if (index > 0) {
    return { next: [value, ...selected.filter((item) => item !== value)], hint: null };
  }
  if (selected.length >= MAX_MAIN_GOALS) {
    return { next: selected, hint: GOAL_LIMIT_HINT };
  }
  return { next: [...selected, value], hint: null };
}

export function fillGoalCopy(template: string, name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return template.replace(/,?\s*\{name\}/g, '').replace(/\s+/g, ' ').trim();
  }
  return template.replace(/\{name\}/g, trimmed);
}
