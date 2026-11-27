import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { showDialog } from '@/components/Dialog';
import {
  AccountField,
  BuildingShow,
  Encouragement,
  HeadingIcon,
  HoldToCommit,
  ObstaclePicker,
  ProjectionChart,
  QuestionPhoto,
  RewardScreen,
  PlanRevealV2,
  PreviewGlimpse,
  WeekPreview,
  firstSessionOf,
  sessionNamesForDays,
} from '@/components/onboarding/OnboardingExtras';
import { OnboardingShell, type ShellSections } from '@/components/onboarding/OnboardingShell';
import {
  BlockMessage,
  BodyweightField,
  CardChoiceList,
  ChipChoiceList,
  ComfortSlider,
  DayPills,
  GoalsPicker,
  NameField,
  NumberSelect,
  PhotoMultiChoice,
  ScreenHeading,
  SingleChoiceList,
  StatementScale,
  TimePickerChips,
} from '@/components/onboarding/OnboardingInputs';
import { AppText, DisclaimerBody, DisclaimerCheckbox, HeroImage, ListRow } from '@/components/ui';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { GOAL_LABELS, type Goal } from '@/lib/goals';
import { useTheme } from '@/constants/theme';
import { startOnboardingRoutine } from '@/lib/onboarding';
import { fetchActiveLifeStageConsent, persistLifeStageChoice } from '@/lib/healthConsent';
import {
  WEEKDAYS,
  WEEKDAY_LONG,
  defaultDaysFor,
  emptyOnboardingDraft,
  formatPreferredDays,
  extrasFromDraft,
  draftFromSaved,
  experienceFromGymExperience,
  parseLifeStageChoice,
  statementKeyFromStores,
  storedAgeBand,
  type LifeStageChoice,
  type OnboardingDraft,
} from '@/lib/onboardingAnswers';
import {
  LIFE_STAGE_SCREEN,
  ONBOARDING_SCREENS,
  ONBOARDING_SECTIONS,
  draftPlaceholders,
  evalCondition,
  fillTemplate,
  lifeStageConsentTarget,
  ruleContextFromDraft,
  screenRecord,
  screenText,
  type OnboardingScreen,
} from '@/lib/onboardingContent';
import {
  defaultRoutineSlug,
  firstMilestone,
  recommendPlan,
  type RecommendedPlan,
} from '@/lib/onboardingPlan';
import { contentRoutineCount } from '@/lib/contentRoutines';
import { RECIPES } from '@/lib/food';
import catalogue from '../../content/exercises/strength-catalogue.json';
import {
  GYM_EXPERIENCE_LABELS,
  MAX_BODYWEIGHT_KG,
  MIN_BODYWEIGHT_KG,
  focusAreasFromGoals,
  formatGoalsLabel,
  getQuizAnswers,
  levelForConfidence,
  useProfile,
  type QuizAnswers,
} from '@/lib/profile';
import { DEFAULT_REMINDER_TIME, saveReminderPrefs, setDefaultReminderTime } from '@/lib/reminders';
import { useSubscription } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';

/** The whole first-run flow, paywall step included (27 November 2026 redesign). */
const FLOW = ONBOARDING_SCREENS;
const MAIN_SECTIONS = ONBOARDING_SECTIONS.filter((section) => section.id !== 'setup');
const SETUP_SECTION = ONBOARDING_SECTIONS.find((section) => section.id === 'setup');
const DRAFT_KEY = 'onboarding-draft-v2';
const MIN_PASSWORD = 6;
const REBUILD_IDS = new Set([
  'goals',
  'insight_goals',
  'gym_experience',
  'gym_comfort',
  'st_not_sure',
  'insight_not_alone',
  'st_stopped',
  'st_busy',
  'cardio',
  'days_per_week',
  'which_days',
  'session_length',
  'building_plan',
  'plan_reveal',
]);
const REBUILD_FLOW = ONBOARDING_SCREENS.filter((screen) => REBUILD_IDS.has(screen.id));
const REVIEW_ID = 'review';

type RawObstacle = { value: string; label: string; icon?: string; exclusive?: boolean; maps_to?: string; response?: string };

function rawObstacleOptions(screen: OnboardingScreen): RawObstacle[] {
  const raw = Array.isArray(screen.raw.options) ? (screen.raw.options as Record<string, unknown>[]) : [];
  return raw
    .map((item) => ({
      value: String(item.value ?? ''),
      label: String(item.label ?? ''),
      icon: typeof item.icon === 'string' ? item.icon : undefined,
      exclusive: item.exclusive === true,
      maps_to: typeof item.maps_to === 'string' ? item.maps_to : undefined,
      response: typeof item.response === 'string' ? item.response : undefined,
    }))
    .filter((item) => item.value && item.label);
}

function obstacleOptions(screen: OnboardingScreen) {
  return rawObstacleOptions(screen).map(({ value, label, icon, exclusive }) => ({ value, label, icon, exclusive }));
}

/**
 * Obstacles replace the old 1-to-5 statements. Each picked obstacle with maps_to sets that
 * statement to 4 and the rest to 1, so the rules, previews, paywall and Coach keep working.
 */
function withObstacles(draft: OnboardingDraft, obstacles: string[], screen: OnboardingScreen): OnboardingDraft {
  const statements: OnboardingDraft['statements'] = {};
  for (const option of rawObstacleOptions(screen)) {
    if (!option.maps_to) continue;
    const key = option.maps_to as keyof OnboardingDraft['statements'];
    statements[key] = obstacles.includes(option.value) ? 4 : 1;
  }
  return { ...draft, obstacles, statements };
}

function exerciseCatalogueCount(): number {
  return Array.isArray(catalogue.exercises) ? catalogue.exercises.length : 0;
}

function screenFocus(screen: OnboardingScreen): { x: number; y: number } | null {
  const focus = screenRecord(screen, 'hero_focus');
  return typeof focus.x === 'number' && typeof focus.y === 'number' ? { x: focus.x, y: focus.y } : null;
}

/** "sacha smith" → "Sacha Smith". */
function capitaliseName(value: string): string {
  return value
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function quizFromDraft(draft: OnboardingDraft): QuizAnswers | null {
  const goals = draft.main_goals;
  const gym = draft.gym_experience;
  if (goals.length === 0 || !gym || !draft.display_name.trim()) return null;
  return {
    goal: goals[0],
    main_goals: goals,
    experience: experienceFromGymExperience(gym),
    days_per_week: draft.days_per_week,
    equipment: 'full_gym',
    confidence: draft.gym_comfort,
    confidence_level: levelForConfidence(draft.gym_comfort),
    gym_experience: gym,
    session_minutes: draft.session_minutes,
    focus_areas: focusAreasFromGoals(goals),
    streak_goal_weeks: draft.streak_goal_weeks,
    display_name: draft.display_name.trim(),
  };
}

function parseKg(text: string): number | null | undefined {
  if (text.trim() === '') return null;
  const value = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(value) || value < MIN_BODYWEIGHT_KG || value > MAX_BODYWEIGHT_KG) return undefined;
  return Math.round(value * 10) / 10;
}

function stonesToKg(stones: string, pounds: string): number | null | undefined {
  if (!stones.trim() && !pounds.trim()) return null;
  const st = Number.parseFloat(stones.replace(',', '.')) || 0;
  const lb = Number.parseFloat(pounds.replace(',', '.')) || 0;
  const kg = st * 6.35029318 + lb * 0.45359237;
  if (!Number.isFinite(kg) || kg < MIN_BODYWEIGHT_KG || kg > MAX_BODYWEIGHT_KG) return undefined;
  return Math.round(kg * 10) / 10;
}

export default function OnboardingScreen() {
  const { colours, radius, shadow } = useTheme();
  const { profile, saveQuizAnswers, confirmAge, acceptDisclaimer, setLifeStage } = useProfile();
  const subscription = useSubscription();
  const { session } = useAuth();
  const isAnonymous = session?.user?.is_anonymous === true;
  const params = useLocalSearchParams<{
    rebuild?: string | string[];
    screen?: string | string[];
    edit?: string | string[];
  }>();
  const editParam = Array.isArray(params.edit) ? params.edit[0] : params.edit;
  const rebuildParam = Array.isArray(params.rebuild) ? params.rebuild[0] : params.rebuild;
  const screenParam = Array.isArray(params.screen) ? params.screen[0] : params.screen;
  const isRebuild = rebuildParam === '1';
  const screens = isRebuild ? REBUILD_FLOW : FLOW;
  const savedAnswers = getQuizAnswers(profile);
  // Editing only when Profile asked for it. Answers being saved at the end of the first run
  // must not flip the flow into the review screen.
  const finishing = useRef(false);
  const isEditing =
    savedAnswers !== null && !isRebuild && (editParam === '1' || screenParam === 'life_stage');
  const strayAfterFinish = savedAnswers !== null && !isRebuild && !isEditing;
  const isLifeStageEdit = isEditing && screenParam === 'life_stage';

  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    savedAnswers
      ? draftFromSaved({
          answers: savedAnswers,
          extras: profile?.onboarding_answers,
          age_band: profile?.age_band,
          cardio_preference: profile?.cardio_preference,
          bodyweight_kg: profile?.bodyweight_kg,
          // Consented column only. Never read life_stage from onboarding_answers.
          life_stage: profile?.life_stage,
        })
      : (() => {
          const next = emptyOnboardingDraft();
          next.life_stage_choice =
            parseLifeStageChoice(LIFE_STAGE_SCREEN?.defaultValue) ?? next.life_stage_choice;
          return next;
        })()
  );
  const [index, setIndex] = useState(() => {
    if (isLifeStageEdit) {
      const start = FLOW.findIndex((item) => item.id === 'life_stage');
      return start >= 0 ? start : -1;
    }
    return isEditing ? -1 : 0;
  });
  const [direction, setDirection] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [safetyChecked, setSafetyChecked] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [lifeStageConsentDeclined, setLifeStageConsentDeclined] = useState(false);
  const [hasActiveLifeStageConsent, setHasActiveLifeStageConsent] = useState(
    () => profile?.life_stage != null
  );
  const [plan, setPlan] = useState<RecommendedPlan | null>(null);
  const [chosenSlug, setChosenSlug] = useState<string | null>(null);
  const [kgText, setKgText] = useState(profile?.bodyweight_kg ? String(profile.bodyweight_kg) : '');
  const [stonesText, setStonesText] = useState('');
  const [poundsText, setPoundsText] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'st_lb'>('kg');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountNote, setAccountNote] = useState<string | null>(null);
  const awaitingPaywall = useRef(false);
  const restored = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  const screen: OnboardingScreen | { id: string; type: string } =
    index < 0 ? { id: REVIEW_ID, type: REVIEW_ID } : screens[index];
  const contentScreen = index >= 0 ? screens[index] : null;

  const progress = isRebuild ? (index + 1) / Math.max(screens.length, 1) : isEditing ? 1 : 0;
  const sections: ShellSections | null = (() => {
    if (isRebuild || isEditing || !contentScreen) return null;
    const inSection = screens.filter((item) => item.section === contentScreen.section);
    const position = Math.max(0, inSection.findIndex((item) => item.id === contentScreen.id));
    const within = (position + 1) / Math.max(inSection.length, 1);
    if (contentScreen.section === 'setup') {
      return { labels: [SETUP_SECTION?.label ?? 'Almost done'], current: 0, within };
    }
    const current = MAIN_SECTIONS.findIndex((section) => section.id === contentScreen.section);
    return { labels: MAIN_SECTIONS.map((section) => section.label), current: Math.max(0, current), within };
  })();
  const showProgress = isRebuild
    ? Boolean(contentScreen && contentScreen.type !== 'building')
    : Boolean(contentScreen && !['building', 'paywall'].includes(contentScreen.type));

  const vars = useMemo(() => {
    const defaultSlug = defaultRoutineSlug(draft);
    const milestone = firstMilestone(plan?.recommended.slug ?? defaultSlug);
    const firstDay = plan ? firstSessionOf(plan) : null;
    const mainGoal = draft.main_goals[0] as Goal | undefined;
    return draftPlaceholders(draft, {
      main_goal_label_lower: mainGoal ? GOAL_LABELS[mainGoal].toLowerCase() : 'your goals',
      session_minutes: draft.session_minutes,
      length_weeks: plan?.recommended.overlay.length_weeks ?? '',
      sessions_per_week: draft.days_per_week,
      first_minutes: firstDay?.estimated_minutes ?? draft.session_minutes,
      first_count: firstDay?.exercises.length ?? '',
      first_milestone_week: milestone?.week ?? '',
      first_milestone_title: milestone?.title ?? '',
      routine_name: plan?.recommended.name ?? '',
      routine_subtitle: plan?.recommended.subtitle ?? '',
      'routine.session_minutes': plan?.recommended.overlay.session_minutes ?? '',
      'routine.length_weeks': plan?.recommended.overlay.length_weeks ?? '',
      'routine.schedule_strength_days': plan?.recommended.overlay.weekly_plan?.strength_days.length ?? plan?.recommended.overlay.days_per_week ?? '',
      'routine.gym_days_needed': plan?.recommended.overlay.weekly_plan?.gym_days_needed ?? '',
      'routine.cardio_days': plan?.recommended.overlay.weekly_plan?.required_cardio_days.length ?? '',
    });
  }, [draft, plan]);

  const title = contentScreen ? fillTemplate(contentScreen.title, vars) : 'Your answers';
  const body = contentScreen ? fillTemplate(contentScreen.body, vars) : '';
  const helper = contentScreen ? fillTemplate(contentScreen.helper, vars) : '';

  const buildingSteps = useMemo(() => {
    if (contentScreen?.type !== 'building') return [];
    const personal = Array.isArray(contentScreen.raw.steps_personal)
      ? (contentScreen.raw.steps_personal as { if?: string; text?: string }[])
      : [];
    const ctx = ruleContextFromDraft(draft);
    const picked = personal
      .filter((step) => typeof step.text === 'string' && (!step.if || evalCondition(step.if, ctx)))
      .map((step) => fillTemplate(step.text ?? '', vars))
      .filter((line) => line.trim().length > 0);
    const max = typeof contentScreen.raw.steps_max === 'number' ? contentScreen.raw.steps_max : 5;
    if (picked.length === 0) return contentScreen.steps;
    // Keep the last line ("Choosing your routine") and the first ones that apply.
    const last = picked[picked.length - 1];
    const head = picked.slice(0, -1).slice(0, max - 1);
    return [...head, last];
  }, [contentScreen, draft, vars]);

  useEffect(() => {
    if (contentScreen?.id !== 'building_plan') return;
    const next = recommendPlan(draft, chosenSlug ?? undefined);
    setPlan(next);
    setChosenSlug(next?.recommended.slug ?? null);
    // BuildingShow runs the animation and moves on when it finishes.
  }, [contentScreen?.id]);

  // Single-choice screens move on by themselves a moment after she picks.
  const autoArmed = useRef(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePrimaryRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!autoArmed.current) return;
    autoArmed.current = false;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      autoTimer.current = null;
      void handlePrimaryRef.current();
    }, 420);
  }, [draft]);
  useEffect(
    () => () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    },
    []
  );

  // Keep her place if the app closes mid-way (new flow only).
  useEffect(() => {
    if (isEditing || isRebuild || restored.current) return;
    restored.current = true;
    void AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { userId?: string; draft?: OnboardingDraft; index?: number };
        if (!saved.draft || saved.userId !== session?.user?.id) return;
        setDraft({ ...emptyOnboardingDraft(), ...saved.draft });
        const at = typeof saved.index === 'number' ? saved.index : 0;
        // Never resume on the paywall step, the hold or the building animation: go back to the plan.
        const resumeId = screens[at]?.type;
        const safe =
          resumeId && ['building', 'projection', 'plan_reveal', 'commit', 'save_account', 'paywall'].includes(resumeId)
            ? Math.max(0, screens.findIndex((item) => item.id === 'building_plan'))
            : at;
        setIndex(Math.min(Math.max(0, safe), screens.length - 1));
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, [isEditing, isRebuild, screens, session?.user?.id]);

  useEffect(() => {
    if (isEditing || isRebuild || !hydrated || index < 0) return;
    void AsyncStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ userId: session?.user?.id, draft, index })
    ).catch(() => {});
  }, [draft, hydrated, index, isEditing, isRebuild, session?.user?.id]);

  useEffect(() => {
    if (!contentScreen || isEditing || isRebuild) return;
    track('onboarding_step_viewed', { step: contentScreen.id });
  }, [contentScreen?.id, isEditing, isRebuild]);

  useEffect(() => {
    autoArmed.current = Boolean(
      contentScreen && contentScreen.raw.auto_advance === true && !isEditing && (hydrated || isRebuild)
    );
  }, [contentScreen?.id, hydrated, isEditing, isRebuild]);

  // Paywall step: open it once on arrival. Subscribed already: skip straight on.
  useEffect(() => {
    if (contentScreen?.type !== 'paywall') return;
    if (!subscription.isLoading && subscription.isPro) {
      move(1);
      return;
    }
    openPlanPaywall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentScreen?.id]);

  // Back from the paywall (bought or closed): carry on to the setup screens.
  useFocusEffect(
    useCallback(() => {
      if (!awaitingPaywall.current) return;
      awaitingPaywall.current = false;
      setDirection(1);
      setIndex((current) => {
        const next = current + 1;
        return next < screens.length ? next : current;
      });
    }, [screens.length])
  );

  function openPlanPaywall() {
    awaitingPaywall.current = true;
    const focus: string[] = [];
    if ((draft.statements.not_sure_what_to_do ?? 0) >= 3 || draft.gym_comfort <= 2) focus.push('guides');
    if ((draft.statements.gym_usually_busy ?? 0) >= 3) focus.push('swaps');
    if ((draft.statements.started_and_stopped ?? 0) >= 3) focus.push('flexible');
    track('paywall_viewed', { reason: 'onboarding' });
    router.push({
      pathname: '/paywall',
      params: {
        reason: 'onboarding',
        plan: plan?.recommended.name ?? '',
        name: draft.display_name.trim(),
        focus: focus.join(','),
      },
    } as Href);
  }

  useEffect(() => {
    let isCurrent = true;
    void fetchActiveLifeStageConsent()
      .then((row) => {
        if (isCurrent) setHasActiveLifeStageConsent(Boolean(row) || profile?.life_stage != null);
      })
      .catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [profile?.life_stage]);

  function shouldShowLifeStageConsent(choice: LifeStageChoice): boolean {
    return (
      Boolean(lifeStageConsentTarget(choice)) &&
      !hasActiveLifeStageConsent &&
      !lifeStageConsentDeclined
    );
  }

  /** Screens that don't apply to her right now: unmatched previews, save_account once she has one, the paywall once subscribed. */
  function isSkipped(item: OnboardingScreen | undefined, delta: number): boolean {
    if (!item) return false;
    if (item.id === 'life_stage_consent') return !shouldShowLifeStageConsent(draft.life_stage_choice);
    if (item.skip_when_hidden && item.show_if && !evalCondition(item.show_if, ruleContextFromDraft(draft))) return true;
    if (item.type === 'save_account') return !isAnonymous || delta < 0;
    if (item.type === 'paywall') return delta < 0 || (!subscription.isLoading && subscription.isPro);
    return false;
  }

  function skipConsentIndex(from: number, delta: number): number {
    let next = from + delta;
    while (next >= 0 && next < screens.length && isSkipped(screens[next], delta)) {
      next += delta;
    }
    return next;
  }

  async function saveDraftLifeStage(consented: boolean): Promise<void> {
    await persistLifeStageChoice({
      choice: draft.life_stage_choice,
      consented,
      saveLifeStage: setLifeStage,
    });
  }

  function leaveLifeStageFlow(): void {
    if (isLifeStageEdit) {
      if (router.canGoBack()) router.back();
      else router.replace('/profile' as Href);
      return;
    }
    setIndex(-1);
  }

  function move(delta: number) {
    // She tapped Continue before the auto-advance fired: don't move twice.
    if (autoTimer.current) {
      clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
    autoArmed.current = false;
    setError(null);
    setDirection(delta);
    if (isEditing && index >= 0 && delta > 0) {
      if (screens[index]?.id === 'life_stage' && shouldShowLifeStageConsent(draft.life_stage_choice)) {
        const consentIndex = screens.findIndex((item) => item.id === 'life_stage_consent');
        if (consentIndex >= 0) {
          setConsentChecked(false);
          setIndex(consentIndex);
          return;
        }
      }
      if (isLifeStageEdit) {
        leaveLifeStageFlow();
        return;
      }
      setIndex(-1);
      return;
    }
    let next = skipConsentIndex(index, delta);
    // Going back never replays Building your plan.
    if (delta < 0 && screens[index]?.id === 'projection_final') {
      const bodyIndex = screens.findIndex((item) => item.id === 'streak_goal');
      if (bodyIndex >= 0) next = bodyIndex;
    }
    if (delta > 0 && screens[index]?.id === 'life_stage' && shouldShowLifeStageConsent(draft.life_stage_choice)) {
      const consentIndex = screens.findIndex((item) => item.id === 'life_stage_consent');
      if (consentIndex >= 0) {
        setConsentChecked(false);
        next = consentIndex;
      }
    }
    if (screens[next]?.id === 'life_stage_consent') setConsentChecked(false);
    if (next < 0) {
      if (isRebuild) {
        if (router.canGoBack()) router.back();
        return;
      }
      if (isEditing) setIndex(-1);
      return;
    }
    if (next >= screens.length) {
      void finish();
      return;
    }
    setIndex(next);
  }

  function canContinue(): boolean {
    if (!contentScreen) return true;
    if (contentScreen.id === 'age') {
      return Boolean(draft.age_band && draft.age_band !== 'under_18');
    }
    if (contentScreen.type === 'text') return draft.display_name.trim().length > 0;
    if (contentScreen.id === 'goals') return draft.main_goals.length >= (contentScreen.min ?? 1);
    if (contentScreen.id === 'gym_experience') return draft.gym_experience != null;
    if (contentScreen.type === 'statement') {
      const key = statementKeyFromStores(contentScreen.stores_to);
      return key != null && draft.statements[key] != null;
    }
    if (contentScreen.id === 'cardio') return draft.cardio_preference != null;
    if (contentScreen.type === 'day_pills') return draft.preferred_days.length === draft.days_per_week;
    if (contentScreen.type === 'disclaimer') return safetyChecked;
    if (contentScreen.type === 'consent') return consentChecked;
    if (contentScreen.type === 'building') return false;
    if (contentScreen.type === 'obstacles') return draft.obstacles.length > 0;
    if (contentScreen.type === 'save_account') {
      return accountEmail.trim().length > 3 && accountPassword.length >= MIN_PASSWORD;
    }
    return true;
  }

  /** Turns the anonymous onboarding account into a real one. Same user id, so answers and purchases stay. */
  async function saveAccount(screenItem: OnboardingScreen) {
    const email = accountEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(screenText(screenItem, 'error_email'));
      return;
    }
    if (accountPassword.length < MIN_PASSWORD) {
      setError(screenText(screenItem, 'error_short_password'));
      return;
    }
    setIsSaving(true);
    setError(null);
    const { data, error: linkError } = await supabase.auth.updateUser({ email, password: accountPassword });
    setIsSaving(false);
    if (linkError) {
      const message = linkError.message.toLowerCase();
      setError(
        message.includes('already') || message.includes('registered') || message.includes('exists')
          ? screenText(screenItem, 'error_exists')
          : screenText(screenItem, 'error_generic')
      );
      return;
    }
    track('account_saved', {});
    // With email confirmation on, the address is pending until she taps the link.
    if (data.user?.new_email && !data.user.email) setAccountNote(screenText(screenItem, 'confirm_note'));
    move(1);
  }

  handlePrimaryRef.current = async () => {
    if (canContinue()) await handlePrimary();
    else autoArmed.current = true;
  };

  async function handlePrimary() {
    if (!contentScreen) {
      await finish();
      return;
    }
    if (contentScreen.id === 'age') {
      if (!draft.age_band || draft.age_band === 'under_18') return;
      setIsSaving(true);
      try {
        await confirmAge();
        setIsSaving(false);
        move(1);
      } catch {
        setIsSaving(false);
        setError("Sorry, that didn't save. Check your connection and try again.");
      }
      return;
    }
    if (contentScreen.id === 'name') {
      const name = draft.display_name.trim();
      const max = contentScreen.max_length ?? 30;
      if (!name) {
        setError('Please add a name so we know what to call you.');
        return;
      }
      if (name.length > max) {
        setError(`Names can be up to ${max} characters.`);
        return;
      }
    }
    if (contentScreen.id === 'life_stage') {
      const choice = draft.life_stage_choice;
      if (shouldShowLifeStageConsent(choice)) {
        move(1);
        return;
      }
      const consented = Boolean(lifeStageConsentTarget(choice)) && hasActiveLifeStageConsent;
      setDraft((current) => ({ ...current, life_stage_consented: consented }));
      if (isLifeStageEdit) {
        setIsSaving(true);
        try {
          await saveDraftLifeStage(consented);
          leaveLifeStageFlow();
        } catch {
          setIsSaving(false);
          setError("Sorry, that didn't save. Check your connection and try again.");
        }
        return;
      }
      move(1);
      return;
    }
    if (contentScreen.type === 'consent') {
      if (!consentChecked) return;
      setIsSaving(true);
      try {
        setDraft((current) => ({ ...current, life_stage_consented: true }));
        await saveDraftLifeStage(true);
        setHasActiveLifeStageConsent(true);
        setIsSaving(false);
        if (isEditing) {
          leaveLifeStageFlow();
          return;
        }
        move(1);
      } catch {
        setIsSaving(false);
        setError("Sorry, that didn't save. Check your connection and try again.");
      }
      return;
    }
    if (contentScreen.id === 'bodyweight') {
      const parsed = weightUnit === 'kg' ? parseKg(kgText) : stonesToKg(stonesText, poundsText);
      if (parsed === undefined) {
        setError(
          `Enter a bodyweight between ${MIN_BODYWEIGHT_KG} and ${MAX_BODYWEIGHT_KG} kg, or skip it.`
        );
        return;
      }
      setDraft((current) => ({ ...current, bodyweight_kg: parsed }));
    }
    if (contentScreen.type === 'disclaimer') {
      if (!safetyChecked) return;
      setIsSaving(true);
      try {
        await acceptDisclaimer();
        setIsSaving(false);
        await finish();
      } catch {
        setIsSaving(false);
        setError("Sorry, that didn't save. Check your connection and try again.");
      }
      return;
    }
    if (contentScreen.type === 'save_account') {
      await saveAccount(contentScreen);
      return;
    }
    if (contentScreen.type === 'paywall') {
      openPlanPaywall();
      return;
    }
    if (contentScreen.id === 'plan_reveal') {
      if (isRebuild) {
        void finish();
        return;
      }
      move(1);
      return;
    }
    move(1);
  }

  async function finish() {
    finishing.current = true;
    const answers = quizFromDraft(draft);
    if (!answers) {
      setError('Please finish the questions first.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const recommended = plan ?? recommendPlan(draft, chosenSlug ?? undefined);
      setPlan(recommended);
      await saveQuizAnswers(answers, draft.bodyweight_kg, {
        onboarding_answers: extrasFromDraft(draft),
        age_band: storedAgeBand(draft),
        cardio_preference: draft.cardio_preference,
      });
      await persistLifeStageChoice({
        choice: draft.life_stage_choice,
        consented:
          draft.life_stage_consented ||
          (Boolean(lifeStageConsentTarget(draft.life_stage_choice)) && hasActiveLifeStageConsent),
        saveLifeStage: setLifeStage,
      });
      if (!isRebuild) {
        if (draft.reminders_skipped) {
          await saveReminderPrefs({ sessionReminders: false }).catch(() => {});
        } else if (draft.reminder_time) {
          await setDefaultReminderTime(draft.reminder_time).catch(() => {});
        }
      }
      if (isRebuild) {
        const slug = recommended?.recommended.slug;
        if (slug) {
          router.replace({ pathname: '/routines/[id]', params: { id: slug } } as Href);
          return;
        }
        if (router.canGoBack()) router.back();
        else router.replace('/programmes' as Href);
        return;
      }
      if (isEditing) {
        if (router.canGoBack()) router.back();
        else router.replace('/');
        return;
      }
      await startOnboardingRoutine({
        recommendedId: recommended?.recommended.slug,
      }).catch(() => {});
      await AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      // The paywall was already shown inside the flow, before the setup screens.
      router.replace('/');
    } catch {
      setError("Sorry, we couldn't save your answers. Check your connection and try again.");
      setIsSaving(false);
    }
  }

  const blocked =
    contentScreen?.id === 'age' && draft.age_band
      ? contentScreen.blocked[draft.age_band]
      : undefined;

  const insightUsesAlt =
    contentScreen?.type === 'insight' &&
    contentScreen.show_if &&
    !evalCondition(contentScreen.show_if, ruleContextFromDraft(draft));

  const insightTitle = insightUsesAlt && contentScreen?.alt_title ? contentScreen.alt_title : title;
  const insightBody = insightUsesAlt && contentScreen?.alt_body ? contentScreen.alt_body : body;
  const extraLine =
    contentScreen?.type === 'insight'
      ? Object.entries(contentScreen.extra_if).find(([expr]) =>
          evalCondition(expr, ruleContextFromDraft(draft))
        )?.[1]
      : undefined;

  const primaryLabel = (() => {
    if (index < 0) return 'Save';
    if (!contentScreen) return 'Continue';
    if (contentScreen.type === 'welcome') return contentScreen.primary_button || "Let's build your plan";
    if (contentScreen.type === 'building') return '';
    if (contentScreen.type === 'consent') return contentScreen.accept_button;
    if (contentScreen.type === 'plan_reveal') return contentScreen.button || 'Continue';
    if (contentScreen.type === 'commit') return '';
    if (contentScreen.type === 'paywall') return 'See plans';
    return contentScreen.button || contentScreen.primary_button || 'Continue';
  })();

  const firstSetupIndex = screens.findIndex((item) => item.section === 'setup');
  const showBack =
    isRebuild ||
    isEditing ||
    (index >= 0 &&
      contentScreen?.type !== 'building' &&
      contentScreen?.type !== 'paywall' &&
      index !== firstSetupIndex);

  const buildingProof = useMemo(() => {
    if (contentScreen?.type !== 'building') return [];
    const raw = Array.isArray(contentScreen.raw.proof) ? (contentScreen.raw.proof as unknown[]).map(String) : [];
    const counts = {
      routine_count: contentRoutineCount(),
      exercise_count: exerciseCatalogueCount(),
      recipe_count: RECIPES.length,
    };
    return raw.map((line) => fillTemplate(line, counts)).filter((line) => !/\{|\b0 /.test(line));
  }, [contentScreen]);

  /** The projection line and milestones follow her main goal, not a lift. */
  function goalLine(item: OnboardingScreen): string {
    const byGoal = screenRecord(item, 'line_by_goal');
    const main = draft.main_goals[0] ?? '';
    const line = typeof byGoal[main] === 'string' ? (byGoal[main] as string) : screenText(item, 'line');
    return fillTemplate(line, vars);
  }

  function goalMilestones(item: OnboardingScreen, weeks: number): { week: number; title: string }[] {
    const byGoal = screenRecord(item, 'milestones_by_goal');
    const main = draft.main_goals[0] ?? '';
    const raw = Array.isArray(byGoal[main])
      ? (byGoal[main] as unknown[])
      : Array.isArray(item.raw.milestones_default)
        ? (item.raw.milestones_default as unknown[])
        : [];
    const titles = raw.map(String).filter(Boolean).slice(0, 3);
    const length = Math.max(3, weeks);
    const first = 2;
    const middle = Math.min(length - 1, Math.max(first + 1, Math.round(length * 0.6)));
    const at = [first, middle, length];
    return titles.map((title, index) => ({ week: at[index] ?? length, title }));
  }

  function rewardLines(item: OnboardingScreen): string[] {
    const byGoal = item.body_by_main_goal[draft.main_goals[0] ?? ''];
    if (byGoal) return [fillTemplate(byGoal, vars)];
    const template = screenText(item, 'line_template');
    if (template) {
      const obstaclesScreen = screens.find((screenItem) => screenItem.type === 'obstacles');
      const options = obstaclesScreen ? rawObstacleOptions(obstaclesScreen) : [];
      const lines = draft.obstacles
        .map((value) => options.find((option) => option.value === value)?.response)
        .filter((response): response is string => Boolean(response))
        .map((response) => fillTemplate(template, { ...vars, response }));
      if (lines.length > 0) return lines;
    }
    return item.body ? [fillTemplate(item.body, vars)] : [];
  }

  function rewardStat(item: OnboardingScreen) {
    const condition = screenText(item, 'stat_if');
    if (!item.stat || !condition) return null;
    const wanted = condition.split(/\s+or\s+/).map((value) => value.trim());
    return draft.obstacles.some((value) => wanted.includes(value)) ? item.stat : null;
  }

  function accountNoteFor(item: OnboardingScreen | null): string | undefined {
    if (accountNote && item?.section === 'setup' && item.id === screens[firstSetupIndex]?.id) return accountNote;
    return undefined;
  }

  function jumpTo(id: string) {
    const next = screens.findIndex((item) => item.id === id);
    if (next >= 0) {
      setDirection(1);
      setIndex(next);
    }
  }

  // Already onboarded and not editing (for example right after finishing): go home, never the review.
  useEffect(() => {
    if (strayAfterFinish && !finishing.current) router.replace('/');
  }, [strayAfterFinish]);

  if (strayAfterFinish) {
    return <View style={{ flex: 1, backgroundColor: colours.bg }} />;
  }

  return (
    <OnboardingShell
      screenKey={screen.id}
      direction={direction}
      progress={progress}
      showProgress={showProgress || index < 0}
      showBack={showBack}
      backIsCancel={isEditing && index < 0}
      onBack={() => {
        if (isEditing && index < 0) {
          if (router.canGoBack()) router.back();
          return;
        }
        if (index <= 0) {
          if (isRebuild && router.canGoBack()) router.back();
          // First question of a new flow: back out to the welcome screen.
          else if (!isRebuild && !isEditing && isAnonymous) void supabase.auth.signOut();
          return;
        }
        move(-1);
      }}
      primaryLabel={primaryLabel}
      primaryDisabled={!canContinue() || isSaving}
      primaryLoading={isSaving}
      onPrimary={() => void handlePrimary()}
      secondaryLabel={
        contentScreen?.type === 'welcome'
          ? contentScreen.secondary_link
          : contentScreen?.type === 'consent'
            ? contentScreen.decline_button
            : contentScreen?.type === 'save_account'
              ? screenText(contentScreen, 'have_account')
              : undefined
      }
      onSecondary={
        contentScreen?.type === 'welcome'
          ? () => void supabase.auth.signOut()
          : contentScreen?.type === 'save_account'
            ? () => {
                const item = contentScreen;
                showDialog(screenText(item, 'have_account_title'), screenText(item, 'have_account_body'), [
                  { text: 'Stay here', style: 'cancel' },
                  {
                    text: 'Log in',
                    onPress: () => {
                      void AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
                      void supabase.auth.signOut();
                    },
                  },
                ]);
              }
          : contentScreen?.type === 'consent'
            ? () => {
                setLifeStageConsentDeclined(true);
                setConsentChecked(false);
                setDraft((current) => ({ ...current, life_stage_consented: false }));
                if (isEditing) {
                  leaveLifeStageFlow();
                  return;
                }
                move(1);
              }
            : undefined
      }
      skipLabel={
        contentScreen?.type === 'time_picker' || contentScreen?.type === 'number_optional'
          ? contentScreen.skip_label
          : undefined
      }
      onSkip={() => {
        if (contentScreen?.type === 'time_picker') {
          setDraft((current) => ({ ...current, reminder_time: null, reminders_skipped: true }));
          move(1);
          return;
        }
        if (contentScreen?.type === 'number_optional') {
          setKgText('');
          setStonesText('');
          setPoundsText('');
          setDraft((current) => ({ ...current, bodyweight_kg: null }));
          move(1);
        }
      }}
      footerNote={error ?? accountNoteFor(contentScreen) ?? contentScreen?.privacy_note ?? undefined}
      sections={sections}
      primaryDelayMs={
        contentScreen && ['reward', 'preview', 'projection', 'insight'].includes(contentScreen.type) && !isEditing
          ? contentScreen.type === 'preview' || contentScreen.type === 'projection'
            ? 2400
            : 1400
          : 0
      }>
      {contentScreen && !['reward', 'commit', 'obstacles'].includes(contentScreen.type) ? (
        screenText(contentScreen, 'hero_image') ? (
          <QuestionPhoto slug={screenText(contentScreen, 'hero_image')} focus={screenFocus(contentScreen)} />
        ) : screenText(contentScreen, 'hero_icon') ? (
          <HeadingIcon name={screenText(contentScreen, 'hero_icon')} />
        ) : null
      ) : null}
      {index < 0 ? (
        <View>
          <ScreenHeading title="Your answers" helper="Tap a row to change it." />
          <ListRow title="Name" subtitle={draft.display_name || 'Not added'} onPress={() => jumpTo('name')} />
          <ListRow
            title="Goals"
            subtitle={formatGoalsLabel(draft.main_goals) || 'Not added'}
            onPress={() => jumpTo('goals')}
          />
          <ListRow
            title="Gym experience"
            subtitle={draft.gym_experience ? GYM_EXPERIENCE_LABELS[draft.gym_experience] : 'Not added'}
            onPress={() => jumpTo('gym_experience')}
          />
          <ListRow
            title="Days per week"
            subtitle={String(draft.days_per_week)}
            onPress={() => jumpTo('days_per_week')}
          />
          <ListRow
            title={LIFE_STAGE_SCREEN?.profile_row_title || LIFE_STAGE_SCREEN?.title || ''}
            subtitle={
              LIFE_STAGE_SCREEN?.options.find((option) => option.value === draft.life_stage_choice)?.label ??
              LIFE_STAGE_SCREEN?.options.find((option) => option.value === 'prefer_not')?.label
            }
            onPress={() => jumpTo('life_stage')}
          />
          {error ? (
            <AppText variant="bodySm" style={{ color: colours.danger, marginTop: 12 }}>
              {error}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {contentScreen?.type === 'welcome' ? (
        <>
          <HeroImage
            imageSlug={contentScreen.image_slug}
            title={title}
            height={220}
            style={{ marginHorizontal: -24, marginBottom: 24, borderRadius: 0 }}
          />
          <AppText variant="body" style={{ color: colours.inkMuted }}>
            {body}
          </AppText>
        </>
      ) : null}

      {contentScreen?.id === 'age' ? (
        <>
          <ScreenHeading title={title} why={contentScreen.why_we_ask} />
          <SingleChoiceList
            options={contentScreen.options}
            value={draft.age_band}
            onChange={(value) => setDraft((current) => ({ ...current, age_band: value as OnboardingDraft['age_band'] }))}
          />
          {blocked ? <BlockMessage title={blocked.inline_message_title} body={blocked.inline_message} /> : null}
        </>
      ) : null}

      {contentScreen?.type === 'text' ? (
        <>
          <ScreenHeading title={title} />
          <NameField
            value={draft.display_name}
            placeholder={contentScreen.placeholder}
            maxLength={contentScreen.max_length ?? 30}
            onChange={(value) => setDraft((current) => ({ ...current, display_name: capitaliseName(value) }))}
          />
        </>
      ) : null}

      {contentScreen?.id === 'goals' ? (
        <>
          <ScreenHeading title={title} helper={helper} />
          <GoalsPicker
            selected={draft.main_goals}
            onChange={(main_goals) => setDraft((current) => ({ ...current, main_goals }))}
          />
        </>
      ) : null}

      {contentScreen?.type === 'insight' ? (
        <>
          <HeroImage
            imageSlug={contentScreen.image_slug}
            height={180}
            style={{ marginHorizontal: -24, marginBottom: 24 }}
          />
          <ScreenHeading
            title={fillTemplate(insightTitle, vars)}
            body={
              contentScreen.id === 'insight_goals'
                ? contentScreen.body_by_main_goal[draft.main_goals[0] ?? ''] || insightBody
                : fillTemplate(insightBody, vars)
            }
          />
          {contentScreen.stat && !insightUsesAlt ? (
            <View
              style={{
                backgroundColor: colours.surface,
                borderRadius: radius.xl,
                padding: 16,
                marginBottom: 16,
                ...shadow,
              }}>
              <AppText variant="display" style={{ color: colours.accent }}>
                {contentScreen.stat.value}
              </AppText>
              <AppText variant="body" style={{ color: colours.ink, marginTop: 8 }}>
                {contentScreen.stat.text}
              </AppText>
              <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 8 }}>
                {contentScreen.stat.source}
              </AppText>
            </View>
          ) : null}
          {contentScreen.milestone_preview ? (
            <View
              style={{
                backgroundColor: colours.brandSoft,
                borderRadius: radius.lg,
                padding: 16,
              }}>
              <AppText variant="eyebrow" style={{ color: colours.accent, marginBottom: 8 }}>
                {contentScreen.milestone_preview.title}
              </AppText>
              <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                {fillTemplate(contentScreen.milestone_preview.template, vars)}
              </AppText>
            </View>
          ) : null}
          {extraLine ? (
            <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 16 }}>
              {extraLine}
            </AppText>
          ) : null}
        </>
      ) : null}

      {contentScreen?.id === 'gym_experience' ? (
        <>
          <ScreenHeading title={title} />
          <SingleChoiceList
            options={contentScreen.options}
            value={draft.gym_experience}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                gym_experience: value as NonNullable<OnboardingDraft['gym_experience']>,
              }))
            }
          />
        </>
      ) : null}

      {contentScreen?.type === 'slider' ? (
        <>
          <ScreenHeading title={title} />
          <ComfortSlider
            stops={contentScreen.stops}
            value={draft.gym_comfort}
            onChange={(gym_comfort) =>
              setDraft((current) => ({
                ...current,
                gym_comfort: gym_comfort as OnboardingDraft['gym_comfort'],
              }))
            }
          />
        </>
      ) : null}

      {contentScreen?.type === 'statement' ? (
        <>
          <ScreenHeading eyebrow={contentScreen.eyebrow} title={title} />
          <StatementScale
            options={contentScreen.options}
            value={statementKeyFromStores(contentScreen.stores_to)
              ? draft.statements[statementKeyFromStores(contentScreen.stores_to)!] ?? null
              : null}
            onChange={(value) => {
              const key = statementKeyFromStores(contentScreen.stores_to);
              if (!key) return;
              setDraft((current) => ({
                ...current,
                statements: { ...current.statements, [key]: value },
              }));
            }}
          />
        </>
      ) : null}

      {contentScreen?.type === 'photo_multi_choice' ? (
        <>
          <ScreenHeading title={title} helper={helper} />
          <PhotoMultiChoice
            options={contentScreen.options}
            selected={draft.machines_used}
            onChange={(machines_used) => setDraft((current) => ({ ...current, machines_used }))}
          />
        </>
      ) : null}

      {contentScreen?.id === 'cardio' ? (
        <>
          <ScreenHeading title={title} helper={helper} />
          <SingleChoiceList
            options={contentScreen.options}
            value={draft.cardio_preference}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                cardio_preference: value as NonNullable<OnboardingDraft['cardio_preference']>,
              }))
            }
          />
        </>
      ) : null}

      {contentScreen?.type === 'number_select' ? (
        <>
          <ScreenHeading title={title} helper={helper} />
          <NumberSelect
            min={contentScreen.min ?? 2}
            max={contentScreen.max ?? 5}
            value={draft.days_per_week}
            onChange={(days) => {
              const days_per_week = days as OnboardingDraft['days_per_week'];
              setDraft((current) => ({
                ...current,
                days_per_week,
                preferred_days: defaultDaysFor(days_per_week),
              }));
            }}
          />
          {(() => {
            const cheer = screenRecord(contentScreen, 'encouragement')[String(draft.days_per_week)] as
              | { icon?: string; title?: string; body?: string }
              | undefined;
            return cheer?.title ? (
              <Encouragement icon={cheer.icon ?? 'sparkles-outline'} title={cheer.title} body={cheer.body ?? ''} />
            ) : null;
          })()}
        </>
      ) : null}

      {contentScreen?.type === 'day_pills' ? (
        <>
          <ScreenHeading title={title} helper={helper} />
          <DayPills
            selected={draft.preferred_days}
            targetCount={draft.days_per_week}
            onChange={(preferred_days) => setDraft((current) => ({ ...current, preferred_days }))}
          />
          {!isEditing ? (
            <WeekPreview
              title={screenText(contentScreen, 'week_preview_title')}
              days={draft.preferred_days}
              restLabel={screenText(contentScreen, 'week_preview_rest') || 'Rest'}
            />
          ) : null}
        </>
      ) : null}

      {contentScreen?.type === 'chips' ? (
        <>
          <ScreenHeading title={title} />
          {screenText(contentScreen, 'style') === 'cards' ? (
            <CardChoiceList
              options={contentScreen.options}
              value={draft.session_minutes}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  session_minutes: Number(value) as OnboardingDraft['session_minutes'],
                }))
              }
            />
          ) : (
          <ChipChoiceList
            options={contentScreen.options}
            value={draft.session_minutes}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                session_minutes: Number(value) as OnboardingDraft['session_minutes'],
              }))
            }
          />
          )}
        </>
      ) : null}

      {contentScreen?.id === 'life_stage' ? (
        <>
          <ScreenHeading title={title} helper={helper} />
          <CardChoiceList
            options={contentScreen.options}
            value={draft.life_stage_choice}
            onChange={(value) => {
              const choice = parseLifeStageChoice(value) ?? 'prefer_not';
              setDraft((current) => ({
                ...current,
                life_stage_choice: choice,
                life_stage_consented: false,
              }));
              setLifeStageConsentDeclined(false);
            }}
          />
        </>
      ) : null}

      {contentScreen?.id === 'streak_goal' ? (
        <>
          <ScreenHeading title={title} helper={helper} />
          <CardChoiceList
            options={contentScreen.options}
            value={draft.streak_goal_weeks}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                streak_goal_weeks: Number(value) as OnboardingDraft['streak_goal_weeks'],
              }))
            }
          />
        </>
      ) : null}

      {contentScreen?.type === 'consent' ? (
        <>
          <ScreenHeading title={title} />
          {contentScreen.body_lines.map((line) => (
            <AppText key={line} variant="body" style={{ color: colours.ink, marginBottom: 12 }}>
              {line}
            </AppText>
          ))}
          <DisclaimerCheckbox
            label={contentScreen.checkbox}
            checked={consentChecked}
            onToggle={() => setConsentChecked((value) => !value)}
          />
        </>
      ) : null}

      {contentScreen?.type === 'time_picker' ? (
        <>
          <ScreenHeading title={title} helper={helper} />
          <TimePickerChips
            value={draft.reminders_skipped ? null : (draft.reminder_time ?? DEFAULT_REMINDER_TIME)}
            onChange={(reminder_time) =>
              setDraft((current) => ({ ...current, reminder_time, reminders_skipped: false }))
            }
          />
        </>
      ) : null}

      {contentScreen?.type === 'number_optional' ? (
        <>
          <ScreenHeading title={title} why={contentScreen.why_we_ask} />
          <BodyweightField
            kgText={kgText}
            stonesText={stonesText}
            poundsText={poundsText}
            unit={weightUnit}
            onUnit={setWeightUnit}
            onKg={setKgText}
            onStones={setStonesText}
            onPounds={setPoundsText}
          />
        </>
      ) : null}

      {contentScreen?.type === 'building' ? (
        <BuildingShow
          title={title}
          steps={buildingSteps}
          proof={buildingProof}
          proofSource={screenText(contentScreen, 'proof_source')}
          durationMs={(contentScreen.duration_seconds || 5) * 1000}
          onDone={() => {
            setDirection(1);
            setIndex((current) => current + 1);
          }}
        />
      ) : null}

      {contentScreen?.type === 'reward' ? (
        <RewardScreen
          icon={screenText(contentScreen, 'icon') || 'checkmark'}
          title={fillTemplate(contentScreen.title, vars)}
          lines={rewardLines(contentScreen)}
          stat={rewardStat(contentScreen)}
          imageSlug={screenText(contentScreen, 'hero_image') || null}
        />
      ) : null}

      {contentScreen?.type === 'obstacles' ? (
        <>
          <HeadingIcon name={screenText(contentScreen, 'hero_icon') || 'trail-sign-outline'} />
          <ScreenHeading title={fillTemplate(contentScreen.title, vars)} helper={fillTemplate(contentScreen.helper, vars)} />
          <ObstaclePicker
            options={obstacleOptions(contentScreen)}
            selected={draft.obstacles}
            max={contentScreen.max ?? 2}
            onChange={(obstacles) => setDraft((current) => withObstacles(current, obstacles, contentScreen))}
          />
        </>
      ) : null}

      {contentScreen?.type === 'projection' ? (
        <>
          <ScreenHeading eyebrow={contentScreen.eyebrow} title={fillTemplate(contentScreen.title, vars)} />
          <AppText variant="title3" style={{ color: colours.brand }}>
            {goalLine(contentScreen)}
          </AppText>
          <ProjectionChart
            weeks={plan?.recommended.overlay.length_weeks ?? 6}
            milestones={goalMilestones(contentScreen, plan?.recommended.overlay.length_weeks ?? 6)}
            startLabel={screenText(contentScreen, 'start_label')}
          />
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 14 }}>
            {screenText(contentScreen, 'note')}
          </AppText>
        </>
      ) : null}

      {contentScreen?.type === 'plan_reveal' && plan ? (
        <PlanRevealV2
          plan={plan}
          days={draft.preferred_days}
          chosenSlug={chosenSlug ?? plan.recommended.slug}
          onChoose={(slug) => {
            const next = recommendPlan(draft, slug);
            setChosenSlug(slug);
            setPlan(next);
          }}
          copy={{
            eyebrow: fillTemplate(screenText(contentScreen, 'eyebrow_personal') || contentScreen.eyebrow, vars),
            title: fillTemplate(contentScreen.title, vars),
            subtitle: fillTemplate(plan.recommended.subtitle, vars),
            statsLine: fillTemplate(screenText(contentScreen, 'stats_line'), vars),
            weekTitle: screenText(contentScreen, 'week_title_short') || contentScreen.week_title,
            restLabel: screenText(contentScreen, 'rest_label') || 'Rest',
            firstTitle: screenText(contentScreen, 'first_title'),
            firstMeta: fillTemplate(screenText(contentScreen, 'first_meta'), vars),
            moreExercises: screenText(contentScreen, 'more_exercises'),
            whyTitle: contentScreen.why_title,
            timelineTitle: contentScreen.timeline_title,
            estimateLabel: contentScreen.estimate_label,
            alternativesTitle: contentScreen.alternatives_title,
            alternativesToggle: screenText(contentScreen, 'alternatives_toggle'),
            calendarTitle: screenText(contentScreen, 'calendar_title'),
            calendarStart: screenText(contentScreen, 'calendar_start') || 'Start',
          }}
        />
      ) : null}

      {contentScreen?.type === 'preview' ? (
        <>
          <ScreenHeading
            eyebrow={contentScreen.eyebrow}
            title={fillTemplate(contentScreen.title, vars)}
            body={fillTemplate(contentScreen.body, vars)}
          />
          <PreviewGlimpse kind={contentScreen.preview} demo={screenRecord(contentScreen, 'demo')} />
        </>
      ) : null}

      {contentScreen?.type === 'commit' && plan ? (
        <CommitScreen
          screen={contentScreen}
          vars={vars}
          plan={plan}
          days={draft.preferred_days}
          onDone={() => {
            track('onboarding_committed', {});
            move(1);
          }}
        />
      ) : null}

      {contentScreen?.type === 'save_account' ? (
        <>
          <ScreenHeading
            eyebrow={contentScreen.eyebrow}
            title={fillTemplate(contentScreen.title, vars)}
            body={fillTemplate(contentScreen.body, vars)}
          />
          <AccountField
            label={screenText(contentScreen, 'email_label')}
            value={accountEmail}
            onChange={setAccountEmail}
            placeholder="you@example.com"
            email
          />
          <AccountField
            label={screenText(contentScreen, 'password_label')}
            value={accountPassword}
            onChange={setAccountPassword}
            placeholder={screenText(contentScreen, 'password_placeholder')}
            secure
          />
        </>
      ) : null}

      {contentScreen?.type === 'paywall' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
          <ActivityIndicator color={colours.brand} />
        </View>
      ) : null}

      {contentScreen?.type === 'disclaimer' ? (
        <>
          <ScreenHeading title={contentScreen.title} />
          <View
            style={{
              backgroundColor: colours.surface,
              borderRadius: radius.xl,
              marginBottom: 16,
              padding: 16,
              ...shadow,
            }}>
            <DisclaimerBody hideTitle />
          </View>
          <DisclaimerCheckbox checked={safetyChecked} onToggle={() => setSafetyChecked((value) => !value)} />
        </>
      ) : null}
    </OnboardingShell>
  );
}

function CommitScreen({
  screen,
  vars,
  plan,
  days,
  onDone,
}: {
  screen: OnboardingScreen;
  vars: Record<string, string | number | null | undefined>;
  plan: RecommendedPlan;
  days: OnboardingDraft['preferred_days'];
  onDone: () => void;
}) {
  const { colours, radius, shadow } = useTheme();
  const first = firstSessionOf(plan);
  const names = sessionNamesForDays(plan, days);
  const ordered = WEEKDAYS.filter((day) => days.includes(day));
  const firstDay = ordered[0];
  const holdMs = typeof screen.raw.hold_ms === 'number' ? screen.raw.hold_ms : 1200;
  const photo = screenText(screen, 'hero_image');
  return (
    <View>
      {photo ? <QuestionPhoto slug={photo} height={120} focus={screenFocus(screen)} /> : null}
      <ScreenHeading eyebrow={screen.eyebrow} title={fillTemplate(screen.title, vars)} />
      <View style={{ backgroundColor: colours.surface, borderRadius: radius.xl, padding: 16, gap: 14, ...shadow }}>
        <View>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            {screenText(screen, 'first_label')}
          </AppText>
          <AppText variant="title3" style={{ color: colours.ink, marginTop: 2 }}>
            {(firstDay && names[firstDay]) || first?.name || plan.recommended.name}
          </AppText>
          {firstDay ? (
            <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
              {WEEKDAY_LONG[firstDay]}
              {first?.estimated_minutes ? ` · about ${first.estimated_minutes} min` : ''}
            </AppText>
          ) : null}
        </View>
        <View>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            {screenText(screen, 'days_label')}
          </AppText>
          <AppText variant="bodyStrong" style={{ color: colours.ink, marginTop: 2 }}>
            {formatPreferredDays(days)}
          </AppText>
          <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
            {fillTemplate(screenText(screen, 'length_label'), vars)}
          </AppText>
        </View>
      </View>
      <HoldToCommit
        label={screenText(screen, 'hold_label')}
        doneLabel={screenText(screen, 'hold_done')}
        accessibilityLabel={screenText(screen, 'hold_a11y')}
        durationMs={holdMs}
        onDone={onDone}
      />
    </View>
  );
}
