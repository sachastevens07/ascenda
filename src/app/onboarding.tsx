import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import {
  BlockMessage,
  BodyweightField,
  BuildingSteps,
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
import { useTheme } from '@/constants/theme';
import { routineCoverSlug } from '@/lib/images';
import { queueOnboardingPaywall, startOnboardingRoutine } from '@/lib/onboarding';
import {
  defaultDaysFor,
  emptyOnboardingDraft,
  extrasFromDraft,
  draftFromSaved,
  experienceFromGymExperience,
  statementKeyFromStores,
  storedAgeBand,
  type OnboardingDraft,
} from '@/lib/onboardingAnswers';
import {
  ONBOARDING_SCREENS,
  QUESTION_SCREEN_IDS,
  draftPlaceholders,
  evalCondition,
  fillTemplate,
  ruleContextFromDraft,
  type OnboardingScreen,
} from '@/lib/onboardingContent';
import { defaultRoutineSlug, firstMilestone, recommendPlan, type RecommendedPlan } from '@/lib/onboardingPlan';
import { openPaywall } from '@/lib/paywall';
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

const FLOW = ONBOARDING_SCREENS.filter((screen) => screen.type !== 'paywall');
const REBUILD_IDS = new Set([
  'goals',
  'insight_goals',
  'gym_experience',
  'gym_comfort',
  'st_not_sure',
  'insight_not_alone',
  'st_stopped',
  'st_busy',
  'insight_plans',
  'cardio',
  'days_per_week',
  'which_days',
  'session_length',
  'building_plan',
  'plan_reveal',
]);
const REBUILD_FLOW = ONBOARDING_SCREENS.filter((screen) => REBUILD_IDS.has(screen.id));
const REVIEW_ID = 'review';

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
  const { profile, saveQuizAnswers, confirmAge, acceptDisclaimer } = useProfile();
  const subscription = useSubscription();
  const params = useLocalSearchParams<{ rebuild?: string | string[] }>();
  const rebuildParam = Array.isArray(params.rebuild) ? params.rebuild[0] : params.rebuild;
  const isRebuild = rebuildParam === '1';
  const screens = isRebuild ? REBUILD_FLOW : FLOW;
  const savedAnswers = getQuizAnswers(profile);
  const isEditing = savedAnswers !== null && !isRebuild;

  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    savedAnswers
      ? draftFromSaved({
          answers: savedAnswers,
          extras: profile?.onboarding_answers,
          age_band: profile?.age_band,
          cardio_preference: profile?.cardio_preference,
          bodyweight_kg: profile?.bodyweight_kg,
        })
      : emptyOnboardingDraft()
  );
  const [index, setIndex] = useState(isEditing ? -1 : 0);
  const [direction, setDirection] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [safetyChecked, setSafetyChecked] = useState(false);
  const [plan, setPlan] = useState<RecommendedPlan | null>(null);
  const [chosenSlug, setChosenSlug] = useState<string | null>(null);
  const [buildDone, setBuildDone] = useState(0);
  const [kgText, setKgText] = useState(profile?.bodyweight_kg ? String(profile.bodyweight_kg) : '');
  const [stonesText, setStonesText] = useState('');
  const [poundsText, setPoundsText] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'st_lb'>('kg');

  const screen: OnboardingScreen | { id: string; type: string } =
    index < 0 ? { id: REVIEW_ID, type: REVIEW_ID } : screens[index];
  const contentScreen = index >= 0 ? screens[index] : null;

  const questionIndex = contentScreen ? QUESTION_SCREEN_IDS.indexOf(contentScreen.id) : -1;
  const progress = isRebuild
    ? (index + 1) / Math.max(screens.length, 1)
    : questionIndex >= 0
      ? (questionIndex + 1) / QUESTION_SCREEN_IDS.length
      : isEditing
        ? 1
        : 0;
  const showProgress = isRebuild
    ? Boolean(contentScreen && contentScreen.type !== 'building')
    : Boolean(contentScreen && QUESTION_SCREEN_IDS.includes(contentScreen.id));

  const vars = useMemo(() => {
    const defaultSlug = defaultRoutineSlug(draft);
    const milestone = firstMilestone(plan?.recommended.slug ?? defaultSlug);
    return draftPlaceholders(draft, {
      first_milestone_week: milestone?.week ?? '',
      first_milestone_title: milestone?.title ?? '',
      routine_name: plan?.recommended.name ?? '',
      routine_subtitle: plan?.recommended.subtitle ?? '',
      'routine.session_minutes': plan?.recommended.overlay.session_minutes ?? '',
      'routine.length_weeks': plan?.recommended.overlay.length_weeks ?? '',
    });
  }, [draft, plan]);

  const title = contentScreen ? fillTemplate(contentScreen.title, vars) : 'Your answers';
  const body = contentScreen ? fillTemplate(contentScreen.body, vars) : '';
  const helper = contentScreen ? fillTemplate(contentScreen.helper, vars) : '';

  useEffect(() => {
    if (contentScreen?.id !== 'building_plan') return;
    const next = recommendPlan(draft, chosenSlug ?? undefined);
    setPlan(next);
    setChosenSlug(next?.recommended.slug ?? null);
    setBuildDone(0);
    const steps = contentScreen.steps.length || 4;
    const total = (contentScreen.duration_seconds || 3) * 1000;
    const tick = total / steps;
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      setBuildDone(count);
      if (count >= steps) {
        clearInterval(timer);
        setTimeout(() => {
          setDirection(1);
          setIndex((current) => current + 1);
        }, 120);
      }
    }, tick);
    return () => clearInterval(timer);
  }, [contentScreen?.id]);

  function move(delta: number) {
    setError(null);
    setDirection(delta);
    if (isEditing && index >= 0 && delta > 0) {
      setIndex(-1);
      return;
    }
    let next = index + delta;
    if (delta < 0 && screens[index]?.id === 'plan_reveal') {
      const backId = isRebuild ? 'session_length' : 'bodyweight';
      const bodyIndex = screens.findIndex((item) => item.id === backId);
      if (bodyIndex >= 0) next = bodyIndex;
    }
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
    if (contentScreen.type === 'building') return false;
    return true;
  }

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
      await queueOnboardingPaywall(recommended?.recommended.slug ?? '');
      await startOnboardingRoutine({
        recommendedId: recommended?.recommended.slug,
      }).catch(() => {});
      router.replace('/');
      if (!subscription.isLoading && !subscription.isPro) {
        openPaywall('onboarding');
      }
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
    if (contentScreen.type === 'plan_reveal') return contentScreen.button || 'Continue';
    return contentScreen.button || contentScreen.primary_button || 'Continue';
  })();

  const showBack =
    isRebuild || isEditing || (index > 0 && contentScreen?.type !== 'building');

  function jumpTo(id: string) {
    const next = screens.findIndex((item) => item.id === id);
    if (next >= 0) {
      setDirection(1);
      setIndex(next);
    }
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
          return;
        }
        move(-1);
      }}
      primaryLabel={primaryLabel}
      primaryDisabled={!canContinue() || isSaving}
      primaryLoading={isSaving}
      onPrimary={() => void handlePrimary()}
      secondaryLabel={contentScreen?.type === 'welcome' ? contentScreen.secondary_link : undefined}
      onSecondary={
        contentScreen?.type === 'welcome'
          ? () => void supabase.auth.signOut()
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
      footerNote={error ?? contentScreen?.privacy_note ?? undefined}>
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
            onChange={(value) => setDraft((current) => ({ ...current, display_name: value }))}
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
        </>
      ) : null}

      {contentScreen?.type === 'chips' ? (
        <>
          <ScreenHeading title={title} />
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
        </>
      ) : null}

      {contentScreen?.type === 'cards' ? (
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
        <>
          <ScreenHeading title={title} />
          <BuildingSteps steps={contentScreen.steps} doneCount={buildDone} />
        </>
      ) : null}

      {contentScreen?.type === 'plan_reveal' && plan ? (
        <PlanReveal
          screen={contentScreen}
          plan={plan}
          vars={vars}
          chosenSlug={chosenSlug ?? plan.recommended.slug}
          onChoose={(slug) => {
            const next = recommendPlan(draft, slug);
            setChosenSlug(slug);
            setPlan(next);
          }}
        />
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

function PlanReveal({
  screen,
  plan,
  vars,
  chosenSlug,
  onChoose,
}: {
  screen: OnboardingScreen;
  plan: RecommendedPlan;
  vars: Record<string, string | number | null | undefined>;
  chosenSlug: string;
  onChoose: (slug: string) => void;
}) {
  const { colours, radius, shadow } = useTheme();
  const coverSlug = routineCoverSlug({
    slug: plan.recommended.slug,
    name: plan.recommended.name,
  });
  return (
    <View>
      <HeroImage
        imageSlug={coverSlug}
        eyebrow={screen.eyebrow}
        title={fillTemplate(screen.title, vars)}
        height={200}
        style={{ marginHorizontal: -24, marginBottom: 16 }}
      />
      <AppText variant="body" style={{ color: colours.inkMuted, marginBottom: 16 }}>
        {fillTemplate(plan.recommended.subtitle, vars)}
      </AppText>
      <AppText variant="title3" style={{ color: colours.ink, marginBottom: 8 }}>
        {screen.why_title}
      </AppText>
      {plan.why.map((line) => (
        <AppText key={line} variant="body" style={{ color: colours.ink, marginBottom: 6 }}>
          {line}
        </AppText>
      ))}
      <AppText variant="title3" style={{ color: colours.ink, marginTop: 16, marginBottom: 8 }}>
        {screen.week_title}
      </AppText>
      {plan.recommended.overlay.cardio_balanced && plan.recommended.overlay.schedule_label ? (
        <AppText variant="body" style={{ color: colours.inkMuted }}>
          {plan.recommended.overlay.schedule_label}
        </AppText>
      ) : (
        <>
          <AppText variant="body" style={{ color: colours.inkMuted }}>
            {fillTemplate(screen.week_template, vars)}
          </AppText>
          {screen.week_extra ? (
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 6 }}>
              {screen.week_extra}
            </AppText>
          ) : null}
        </>
      )}
      <AppText variant="title3" style={{ color: colours.ink, marginTop: 16, marginBottom: 8 }}>
        {screen.timeline_title}
      </AppText>
      {plan.milestones.map((item) => (
        <View
          key={`${item.week}-${item.title}`}
          style={{
            backgroundColor: colours.surface,
            borderRadius: radius.lg,
            padding: 12,
            marginBottom: 8,
            ...shadow,
          }}>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            Week {item.week}
          </AppText>
          <AppText variant="bodyStrong" style={{ color: colours.ink, marginTop: 4 }}>
            {item.title}
          </AppText>
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
            {item.description}
          </AppText>
        </View>
      ))}
      <AppText variant="caption" style={{ color: colours.inkMuted, marginBottom: 16 }}>
        {screen.estimate_label}
      </AppText>
      {plan.alternatives.length > 0 ? (
        <>
          <AppText variant="title3" style={{ color: colours.ink, marginBottom: 8 }}>
            {screen.alternatives_title}
          </AppText>
          <CardChoiceList
            options={plan.alternatives.map((item) => ({
              value: item.slug,
              label: item.name,
              sub: item.subtitle,
            }))}
            value={chosenSlug}
            onChange={onChoose}
          />
        </>
      ) : null}
    </View>
  );
}
