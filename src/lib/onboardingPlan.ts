import {
  contentRoutine,
  gymDaysNeeded,
  requiredCardioDays,
  scheduleStrengthDays,
  type ContentRoutineOverlay,
} from '@/lib/contentRoutines';
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
    gym_days_needed: gymDaysNeeded(overlay),
    schedule_strength_days: scheduleStrengthDays(overlay),
    cardio_days: requiredCardioDays(overlay),
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
  return gymDaysNeeded(overlay) <= days;
}

function fitFallbackSlug(draft: OnboardingDraft): string {
  return draft.gym_experience === 'regularly' ? 'twice-a-week-strong' : 'the-two-day-start';
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

export function firstMilestone(
  slug: string
): { week: number; title: string; description: string } | null {
  const overlay = overlayFor(slug);
  const first = overlay?.plan_reveal_milestones[0];
  return first ? { week: first.week, title: first.title, description: first.description } : null;
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

export type ProjectionPoint = { week: number; increase_kg: number };

/**
 * Week-by-week version of estimateStrength: the same conservative rule (one load increment
 * every third time she does the checkpoint lift, lighter weeks skipped), so the chart and
 * the "about +X kg" line always agree. Week 0 is her starting weight (+0).
 */
export function strengthProjection(overlay: ContentRoutineOverlay): ProjectionPoint[] | null {
  const estimate = estimateStrength(overlay);
  if (!estimate) return null;
  let increment: number | null = null;
  let exposures = 0;
  const lighter = new Set(overlay.lighter_weeks);
  const points: ProjectionPoint[] = [{ week: 0, increase_kg: 0 }];
  for (const week of weekNumbers(overlay)) {
    if (!lighter.has(week)) {
      const phase = overlay.phases.find((item) => item.weeks.includes(week));
      for (const day of phase?.days ?? []) {
        const slot = day.exercises.find((item) => item.slug === estimate.lift_slug);
        if (!slot) continue;
        exposures += 1;
        if (increment == null && slot.load_increment_kg && slot.load_increment_kg > 0) {
          increment = slot.load_increment_kg;
        }
      }
    }
    points.push({ week, increase_kg: (increment ?? 0) * Math.floor(exposures / 3) });
  }
  return points;
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
        'routine.gym_days_needed': gymDaysNeeded(overlay),
        'routine.schedule_strength_days': scheduleStrengthDays(overlay),
        'routine.cardio_days': requiredCardioDays(overlay),
        main_goal_label: main ? GOAL_LABELS[main] : '',
      })
    );
    if (lines.length >= 3) break;
  }
  return lines;
}

function applyLifeStageRoutineAdjustment(
  draft: OnboardingDraft,
  recommended: ContentRoutineOverlay,
  matched: ContentRoutineOverlay[]
): ContentRoutineOverlay {
  // life_stage is special-category health data. Use the in-memory consented
  // flag only, never onboarding_answers, and never send this off-device.
  if (
    !draft.life_stage_consented ||
    (draft.life_stage_choice !== 'perimenopause' && draft.life_stage_choice !== 'menopause')
  ) {
    return recommended;
  }
  const main = draft.main_goals[0];
  if (scheduleStrengthDays(recommended) <= 3) return recommended;
  if (main === 'build_muscle' || main === 'glutes_and_legs') return recommended;
  const lighter = matched.find((overlay) => {
    if (overlay.slug === recommended.slug) return false;
    const days = scheduleStrengthDays(overlay);
    return days >= 2 && days <= 3 && daysFit(overlay, draft.days_per_week);
  });
  return lighter ?? recommended;
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
  if (recommended && chosenSlug && !daysFit(recommended, draft.days_per_week)) {
    recommended = null;
  }
  const matched: ContentRoutineOverlay[] = [];
  const fallbackAlts: string[] = [];

  for (const rule of RECOMMEND_RULES) {
    if (!evalCondition(rule.if, ctx)) continue;
    const candidates = [rule.recommend, ...rule.alternatives];
    const fitted = candidates
      .map((slug) => pickFromRule(slug, draft))
      .filter((item): item is ContentRoutineOverlay => Boolean(item));
    for (const overlay of fitted) {
      if (!matched.some((item) => item.slug === overlay.slug)) matched.push(overlay);
    }
    if (!recommended && fitted.length > 0) {
      recommended = fitted[0];
      fallbackAlts.push(...rule.alternatives);
    }
  }

  if (!recommended || !daysFit(recommended, draft.days_per_week)) {
    recommended =
      pickFromRule(fitFallbackSlug(draft), draft) ??
      overlayFor(fitFallbackSlug(draft)) ??
      overlayFor(defaultRoutineSlug(draft));
  }
  if (!recommended) return null;

  recommended = applyLifeStageRoutineAdjustment(draft, recommended, matched);

  const altSlugs: string[] = [];
  for (const overlay of matched) {
    if (overlay.slug === recommended.slug) continue;
    if (!daysFit(overlay, draft.days_per_week)) continue;
    if (!canAutoRecommend(overlay.slug, draft) && overlay.slug !== 'summit') continue;
    altSlugs.push(overlay.slug);
    if (altSlugs.length >= 2) break;
  }
  if (altSlugs.length < 2) {
    for (const slug of fallbackAlts) {
      if (slug === recommended.slug || altSlugs.includes(slug)) continue;
      const overlay = overlayFor(slug);
      if (!overlay || !daysFit(overlay, draft.days_per_week)) continue;
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
