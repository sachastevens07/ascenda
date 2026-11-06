import { contentRoutine, type ContentRoutineOverlay } from '@/lib/contentRoutines';
import {
  NEVER_AUTO_RECOMMEND,
  RECOMMEND_RULES,
  STRENGTH_ESTIMATE_DISPLAY,
  WHY_LINES,
  evalCondition,
  fillTemplate,
  ruleContextFromDraft,
  type RuleContext,
} from '@/lib/onboardingContent';
import { GOAL_LABELS, type Goal } from '@/lib/goals';
import { exerciseNameFromSlug, type OnboardingDraft } from '@/lib/onboardingAnswers';

const BEGINNER_DEFAULT = 'strong-foundations-6-weeks';
const OTHER_DEFAULT = 'the-climb-in-8-weeks';

export type StrengthEstimate = {
  lift_slug: string;
  lift_name: string;
  estimated_increase_kg: number;
  length_weeks: number;
  line: string;
};

export type PlanChoice = {
  slug: string;
  name: string;
  subtitle: string;
  overlay: ContentRoutineOverlay;
};

export type RecommendedPlan = {
  recommended: PlanChoice;
  alternatives: PlanChoice[];
  why: string[];
  milestones: { week: number; title: string; description: string }[];
  estimate: StrengthEstimate | null;
};

function routineContext(overlay: ContentRoutineOverlay): RuleContext['routine'] {
  return {
    days_per_week: overlay.days_per_week,
    session_minutes: overlay.session_minutes,
    goal: overlay.goal,
    secondary_goals: overlay.secondary_goals,
    cardio_balanced: overlay.cardio_balanced,
  };
}

function toChoice(overlay: ContentRoutineOverlay): PlanChoice {
  return {
    slug: overlay.slug,
    name: overlay.name,
    subtitle: overlay.subtitle,
    overlay,
  };
}

function daysFit(overlay: ContentRoutineOverlay, days: number): boolean {
  if (!overlay.days_per_week) return true;
  if (overlay.days_per_week <= days) return true;
  return overlay.days_per_week - days <= 1;
}

function canAutoRecommend(slug: string, draft: OnboardingDraft): boolean {
  if (!NEVER_AUTO_RECOMMEND.has(slug)) return true;
  return draft.gym_experience === 'regularly' && draft.gym_comfort === 5;
}

function overlayFor(slug: string): ContentRoutineOverlay | null {
  return contentRoutine(slug);
}

export function defaultRoutineSlug(draft: OnboardingDraft): string {
  const gym = draft.gym_experience;
  if (gym === 'on_and_off' || gym === 'regularly') return OTHER_DEFAULT;
  return BEGINNER_DEFAULT;
}

export function firstMilestone(slug: string): { week: number; title: string } | null {
  const overlay = overlayFor(slug);
  const first = overlay?.plan_reveal_milestones[0];
  return first ? { week: first.week, title: first.title } : null;
}

export function estimateStrength(overlay: ContentRoutineOverlay): StrengthEstimate | null {
  const liftSlug = overlay.checkpoint_lifts[0];
  if (!liftSlug) return null;
  let increment: number | null = null;
  let exposures = 0;
  const lighter = new Set(overlay.lighter_weeks);
  for (const week of weekNumbers(overlay)) {
    if (lighter.has(week)) continue;
    const phase = overlay.phases.find((item) => item.weeks.includes(week));
    const days = phase?.days ?? [];
    for (const day of days) {
      const slot = day.exercises.find((item) => item.slug === liftSlug);
      if (!slot) continue;
      exposures += 1;
      if (increment == null && slot.load_increment_kg && slot.load_increment_kg > 0) {
        increment = slot.load_increment_kg;
      }
    }
  }
  if (increment == null || increment <= 0) return null;
  const estimated = increment * Math.floor(exposures / 3);
  if (estimated < 2) return null;
  const lift_name = exerciseNameFromSlug(liftSlug);
  const length_weeks = overlay.length_weeks;
  return {
    lift_slug: liftSlug,
    lift_name,
    estimated_increase_kg: estimated,
    length_weeks,
    line: fillTemplate(STRENGTH_ESTIMATE_DISPLAY, {
      estimated_increase_kg: estimated,
      lift_name,
      'routine.length_weeks': length_weeks,
    }),
  };
}

function weekNumbers(overlay: ContentRoutineOverlay): number[] {
  const fromPhases = overlay.phases.flatMap((phase) => phase.weeks);
  if (fromPhases.length > 0) return [...new Set(fromPhases)].sort((a, b) => a - b);
  return Array.from({ length: overlay.length_weeks }, (_, index) => index + 1);
}

function whyLinesFor(draft: OnboardingDraft, overlay: ContentRoutineOverlay): string[] {
  const ctx = ruleContextFromDraft(draft, routineContext(overlay));
  const lines: string[] = [];
  for (const line of WHY_LINES) {
    if (!evalCondition(line.if, ctx)) continue;
    const main = draft.main_goals[0] as Goal | undefined;
    lines.push(
      fillTemplate(line.text, {
        days_per_week: draft.days_per_week,
        'routine.session_minutes': overlay.session_minutes,
        main_goal_label: main ? GOAL_LABELS[main] : '',
      })
    );
    if (lines.length >= 3) break;
  }
  return lines;
}

function pickFromRule(
  slug: string,
  draft: OnboardingDraft
): ContentRoutineOverlay | null {
  if (!canAutoRecommend(slug, draft)) return null;
  const overlay = overlayFor(slug);
  if (!overlay) return null;
  if (!daysFit(overlay, draft.days_per_week)) return null;
  return overlay;
}

export function recommendPlan(draft: OnboardingDraft, chosenSlug?: string): RecommendedPlan | null {
  const ctx = ruleContextFromDraft(draft);
  let recommended: ContentRoutineOverlay | null = chosenSlug ? overlayFor(chosenSlug) : null;
  const matched: ContentRoutineOverlay[] = [];
  const fallbackAlts: string[] = [];

  for (const rule of RECOMMEND_RULES) {
    if (!evalCondition(rule.if, ctx)) continue;
    const overlay = pickFromRule(rule.recommend, draft);
    if (!overlay) continue;
    if (!recommended) {
      recommended = overlay;
      fallbackAlts.push(...rule.alternatives);
    }
    if (!matched.some((item) => item.slug === overlay.slug)) matched.push(overlay);
  }

  if (!recommended) {
    recommended = overlayFor(defaultRoutineSlug(draft));
  }
  if (!recommended) return null;

  const altSlugs: string[] = [];
  for (const overlay of matched) {
    if (overlay.slug === recommended.slug) continue;
    if (!canAutoRecommend(overlay.slug, draft) && overlay.slug !== 'summit') continue;
    altSlugs.push(overlay.slug);
    if (altSlugs.length >= 2) break;
  }
  if (altSlugs.length < 2) {
    for (const slug of fallbackAlts) {
      if (slug === recommended.slug || altSlugs.includes(slug)) continue;
      const overlay = overlayFor(slug);
      if (!overlay) continue;
      altSlugs.push(slug);
      if (altSlugs.length >= 2) break;
    }
  }

  const alternatives = altSlugs
    .map(overlayFor)
    .filter((item): item is ContentRoutineOverlay => Boolean(item))
    .map(toChoice);

  const estimate = estimateStrength(recommended);
  const milestones = [...recommended.plan_reveal_milestones];
  if (estimate) {
    milestones.push({
      week: recommended.length_weeks,
      title: `About +${estimate.estimated_increase_kg} kg`,
      description: estimate.line,
    });
  }

  return {
    recommended: toChoice(recommended),
    alternatives,
    why: whyLinesFor(draft, recommended),
    milestones,
    estimate,
  };
}

export function summitAllowedAsAlternative(draft: OnboardingDraft): boolean {
  return draft.gym_experience === 'regularly' && draft.gym_comfort === 5;
}
