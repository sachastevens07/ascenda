import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LineChart } from '@/components/LineChart';
import {
  AppText,
  Chip,
  DisclaimerBody,
  DisclaimerCheckbox,
  GoalChipGroup,
  HeroImage,
  IconButton,
  ListRow,
  PrimaryButton,
  ProBadge,
  SafetyNotice,
  SecondaryButton,
  TextButton,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { DEFAULT_STREAK_GOAL, STREAK_GOALS, type StreakGoal } from '@/lib/activityStats';
import { coverForRoutine, coverSources } from '@/lib/images';
import {
  describeRecommendation,
  pickRecommendedRoutine,
  projectKeyLift,
  queueOnboardingPaywall,
  startOnboardingRoutine,
  type LiftProjection,
} from '@/lib/onboarding';
import { DISCLAIMER_VERSION } from '@/lib/disclaimer';
import { formatKg } from '@/lib/programmes';
import {
  CONFIDENCE_LABELS,
  CONFIDENCE_LEVELS,
  DAYS_PER_WEEK_OPTIONS,
  DEFAULT_SESSION_MINUTES,
  EQUIPMENT_ACCESS_LABELS,
  EXPERIENCE_LABELS,
  EXPERIENCE_LEVELS,
  FOCUS_AREA_LABELS,
  FOCUS_AREAS,
  GOAL_COPY,
  GOAL_HELPER,
  GOAL_INSIGHT_TITLE,
  GOAL_SCREEN_TITLE,
  fillGoalCopy,
  formatGoalsLabel,
  MAX_BODYWEIGHT_KG,
  MAX_DISPLAY_NAME,
  MIN_BODYWEIGHT_KG,
  GYM_EXPERIENCE_LABELS,
  GYM_EXPERIENCE_LEVELS,
  SESSION_MINUTES_OPTIONS,
  formatDaysPerWeek,
  formatSessionMinutes,
  getQuizAnswers,
  levelForConfidence,
  useProfile,
  type Confidence,
  type DaysPerWeek,
  type EquipmentAccess,
  type Experience,
  type FocusArea,
  type Goal,
  type QuizAnswers,
  type SessionMinutes,
  type GymExperience,
} from '@/lib/profile';
import { fetchRoutine, fetchRoutines, type RoutineSummary } from '@/lib/routines';
import { useSubscription } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';

type Draft = Partial<QuizAnswers> & { focus_areas?: FocusArea[] };

type FlowStep =
  | 'welcome'
  | 'safety'
  | 'goal'
  | 'insight-goal'
  | 'experience'
  | 'gym_experience'
  | 'equipment'
  | 'insight-gym'
  | 'comfort'
  | 'days'
  | 'minutes'
  | 'focus'
  | 'insight-streak'
  | 'streak'
  | 'bodyweight'
  | 'name'
  | 'reveal';

const FLOW_STEPS: FlowStep[] = [
  'welcome',
  'safety',
  'goal',
  'insight-goal',
  'experience',
  'gym_experience',
  'equipment',
  'insight-gym',
  'comfort',
  'days',
  'minutes',
  'focus',
  'streak',
  'insight-streak',
  'bodyweight',
  'name',
  'reveal',
];

const EQUIPMENT_COPY: Record<EquipmentAccess, string> = {
  full_gym: 'Barbells, machines, cables and dumbbells.',
  dumbbells: 'A dumbbell rack at the gym, and maybe a bench.',
  home: 'Bands and bodyweight, for days you cannot get to the gym.',
};

const EXPERIENCE_COPY: Record<Experience, string> = {
  new: 'Never, or hardly ever. That’s absolutely fine.',
  some: 'I’ve used weights before, on and off.',
  confident: 'I train regularly and know the main lifts.',
};

const GYM_EXPERIENCE_COPY: Record<GymExperience, string> = {
  not_yet: 'I have not walked in yet. That is a good time to start.',
  just_started: 'The first weeks. We will keep sessions simple.',
  on_and_off: 'You know a gym, and you are coming back.',
  regularly: 'You already train. We will match that.',
};

function withStoredLevel(draft: Draft): Draft {
  let next = draft;
  if (draft.confidence && draft.confidence_level === undefined) {
    next = { ...next, confidence_level: levelForConfidence(draft.confidence) };
  }
  if ((!next.main_goals || next.main_goals.length === 0) && next.goal) {
    next = { ...next, main_goals: [next.goal] };
  }
  if (next.main_goals && next.main_goals.length > 0) {
    next = { ...next, goal: next.main_goals[0] };
  }
  return next;
}

function isComplete(draft: Draft): draft is QuizAnswers {
  const ready = withStoredLevel(draft);
  return (
    ready.goal !== undefined &&
    (ready.main_goals?.length ?? 0) > 0 &&
    ready.experience !== undefined &&
    ready.days_per_week !== undefined &&
    ready.equipment !== undefined &&
    ready.confidence !== undefined &&
    ready.confidence_level !== undefined &&
    ready.gym_experience !== undefined &&
    ready.session_minutes !== undefined &&
    (ready.focus_areas?.length ?? 0) > 0 &&
    ready.streak_goal_weeks !== undefined &&
    ready.display_name !== undefined
  );
}

function parseBodyweight(text: string): number | null | undefined {
  if (text.trim() === '') return null;
  const value = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(value) || value < MIN_BODYWEIGHT_KG || value > MAX_BODYWEIGHT_KG) {
    return undefined;
  }
  return Math.round(value * 10) / 10;
}

function parseDisplayName(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  if (trimmed.length > MAX_DISPLAY_NAME) return undefined;
  return trimmed;
}

function recommendationBullets(routine: RoutineSummary, answers: QuizAnswers): string[] {
  return describeRecommendation(routine, answers)
    .split('. ')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      return trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
    })
    .filter(Boolean);
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { colours, radius, type, shadow } = useTheme();
  const { profile, saveQuizAnswers, confirmAge, deleteAccount, acceptDisclaimer } = useProfile();
  const { isPro } = useSubscription();
  const [savedAnswers] = useState(() => getQuizAnswers(profile));
  const isEditing = savedAnswers !== null;
  const [draft, setDraft] = useState<Draft>(savedAnswers ?? {});
  const [bodyweight, setBodyweight] = useState(
    profile?.bodyweight_kg == null ? '' : String(profile.bodyweight_kg)
  );
  const [nameText, setNameText] = useState(savedAnswers?.display_name ?? profile?.display_name ?? '');
  const [step, setStep] = useState<FlowStep | 'review'>(isEditing ? 'review' : 'welcome');
  const [ageStep, setAgeStep] = useState<'pending' | 'ask' | 'under-18' | null>(
    isEditing || profile?.age_confirmed_at ? null : 'pending'
  );
  const [safetyChecked, setSafetyChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<RoutineSummary | null>(null);
  const [projection, setProjection] = useState<LiftProjection | null>(null);
  const [revealState, setRevealState] = useState<'idle' | 'loading' | 'ready'>('idle');
  const slideX = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;

  const flowIndex = FLOW_STEPS.indexOf(step as FlowStep);
  const progressCount = flowIndex === -1 ? 0 : flowIndex + 1;

  function moveTo(next: FlowStep | 'review', direction: 1 | -1) {
    setError(null);
    slideX.setValue(direction * screenWidth);
    setStep(next);
    Animated.timing(slideX, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  const answersForRecommend = useMemo(() => {
    const ready = withStoredLevel({
      ...draft,
      display_name: parseDisplayName(nameText) ?? '',
      streak_goal_weeks: draft.streak_goal_weeks ?? DEFAULT_STREAK_GOAL,
      session_minutes: draft.session_minutes ?? DEFAULT_SESSION_MINUTES,
      focus_areas: draft.focus_areas ?? [],
    });
    return isComplete(ready) ? ready : null;
  }, [draft, nameText]);

  function goNext(from: FlowStep) {
    const index = FLOW_STEPS.indexOf(from);
    if (from === 'welcome' && ageStep === 'pending') {
      setAgeStep('ask');
      return;
    }
    if (from === 'welcome' && profile?.disclaimer_version === DISCLAIMER_VERSION) {
      moveTo('goal', 1);
      return;
    }
    moveTo(FLOW_STEPS[Math.min(index + 1, FLOW_STEPS.length - 1)], 1);
  }

  function goBack() {
    if (isEditing && step !== 'review') {
      moveTo('review', -1);
      return;
    }
    if (step === 'review' || step === 'welcome') {
      if (isEditing) router.back();
      return;
    }
    const index = FLOW_STEPS.indexOf(step);
    if (index <= 0) return;
    if (step === 'goal' && profile?.disclaimer_version === DISCLAIMER_VERSION) {
      moveTo('welcome', -1);
      return;
    }
    moveTo(FLOW_STEPS[index - 1], -1);
  }

  function patchAnswer<K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K]) {
    setDraft((current) => {
      const nextDraft = { ...current, [key]: value } as Draft;
      if (key === 'confidence') {
        nextDraft.confidence_level = levelForConfidence(value as Confidence);
      }
      return nextDraft;
    });
  }

  function choose<K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K], next?: FlowStep) {
    const nextDraft = { ...draft, [key]: value } as Draft;
    if (key === 'confidence') {
      nextDraft.confidence_level = levelForConfidence(value as Confidence);
    }
    setDraft(nextDraft);
    if (isEditing) {
      moveTo('review', -1);
      return;
    }
    if (next) moveTo(next, 1);
    else goNext(step as FlowStep);
  }

  function confirmChoice() {
    if (step === 'goal' && ((draft.main_goals?.length ?? 0) > 0 || draft.goal !== undefined)) {
      if (isEditing) moveTo('review', -1);
      else goNext('goal');
      return;
    }
    if (step === 'experience' && draft.experience !== undefined) choose('experience', draft.experience);
    else if (step === 'gym_experience' && draft.gym_experience !== undefined) {
      choose('gym_experience', draft.gym_experience);
    } else if (step === 'equipment' && draft.equipment !== undefined) choose('equipment', draft.equipment);
    else if (step === 'comfort' && draft.confidence !== undefined) choose('confidence', draft.confidence);
    else if (step === 'days' && draft.days_per_week !== undefined) choose('days_per_week', draft.days_per_week);
    else if (step === 'minutes' && draft.session_minutes !== undefined) {
      choose('session_minutes', draft.session_minutes);
    } else if (step === 'streak' && draft.streak_goal_weeks !== undefined) {
      choose('streak_goal_weeks', draft.streak_goal_weeks);
    }
  }

  const choiceReady =
    (step === 'goal' && ((draft.main_goals?.length ?? 0) > 0 || draft.goal !== undefined)) ||
    (step === 'experience' && draft.experience !== undefined) ||
    (step === 'gym_experience' && draft.gym_experience !== undefined) ||
    (step === 'equipment' && draft.equipment !== undefined) ||
    (step === 'comfort' && draft.confidence !== undefined) ||
    (step === 'days' && draft.days_per_week !== undefined) ||
    (step === 'minutes' && draft.session_minutes !== undefined) ||
    (step === 'streak' && draft.streak_goal_weeks !== undefined);

  async function loadReveal(answers: QuizAnswers) {
    setRevealState('loading');
    try {
      const routines = await fetchRoutines();
      const picked = pickRecommendedRoutine(routines, answers);
      setRecommended(picked);
      if (picked) {
        const detail = await fetchRoutine(picked.id, { includeLockedWeeks: isPro }).catch(() => null);
        setProjection(detail ? projectKeyLift(detail) : null);
      } else {
        setProjection(null);
      }
    } catch {
      setRecommended(null);
      setProjection(null);
    } finally {
      setRevealState('ready');
    }
  }

  async function handleSave(then: 'home' | 'paywall') {
    const bodyweightKg = parseBodyweight(bodyweight);
    const displayName = parseDisplayName(nameText);
    const answers = withStoredLevel({
      ...draft,
      display_name: displayName ?? '',
      streak_goal_weeks: draft.streak_goal_weeks ?? DEFAULT_STREAK_GOAL,
    });
    if (!isComplete(answers) || bodyweightKg === undefined || displayName === undefined) {
      setError(
        displayName === undefined
          ? `Names can be up to ${MAX_DISPLAY_NAME} characters.`
          : `Enter a bodyweight between ${MIN_BODYWEIGHT_KG} and ${MAX_BODYWEIGHT_KG} kg, or skip it.`
      );
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await saveQuizAnswers(answers, bodyweightKg);
      if (then === 'paywall') {
        await queueOnboardingPaywall(recommended?.id ?? '');
        await startOnboardingRoutine({
          recommendedId: recommended?.id,
          isPro,
        }).catch(() => {});
        router.replace('/');
        return;
      }
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      setError("Sorry, we couldn't save your answers. Check your connection and try again.");
      setIsSaving(false);
    }
  }

  async function handleContinueSafety() {
    if (!safetyChecked) return;
    setIsSaving(true);
    setError(null);
    try {
      await acceptDisclaimer();
      setIsSaving(false);
      goNext('safety');
    } catch {
      setError("Sorry, that didn't save. Check your connection and try again.");
      setIsSaving(false);
    }
  }

  async function handleConfirmAge() {
    setIsSaving(true);
    setError(null);
    try {
      await confirmAge();
      setIsSaving(false);
      setAgeStep(null);
      goNext('welcome');
    } catch {
      setError("Sorry, that didn't save. Check your connection and try again.");
      setIsSaving(false);
    }
  }

  async function handleDeleteAccount() {
    setIsSaving(true);
    setError(null);
    try {
      await deleteAccount();
    } catch {
      setError("Sorry, we couldn't delete your account. Check your connection and try again.");
      setIsSaving(false);
    }
  }

  function continueBodyweight(skip: boolean) {
    if (!skip && parseBodyweight(bodyweight) === undefined) {
      setError(
        `Enter a bodyweight between ${MIN_BODYWEIGHT_KG} and ${MAX_BODYWEIGHT_KG} kg, or skip it.`
      );
      return;
    }
    if (skip) setBodyweight('');
    if (isEditing) moveTo('review', -1);
    else goNext('bodyweight');
  }

  function continueName(skip: boolean) {
    if (skip) {
      setNameText('');
      setDraft((current) => ({ ...current, display_name: '' }));
      const next = withStoredLevel({ ...draft, display_name: '' });
      if (!isEditing && isComplete(next)) void loadReveal(next);
      if (isEditing) moveTo('review', -1);
      else goNext('name');
      return;
    }
    const parsed = parseDisplayName(nameText);
    if (parsed === undefined) {
      setError(`Names can be up to ${MAX_DISPLAY_NAME} characters.`);
      return;
    }
    setDraft((current) => ({ ...current, display_name: parsed }));
    if (isEditing) {
      moveTo('review', -1);
      return;
    }
    const next = withStoredLevel({ ...draft, display_name: parsed });
    if (isComplete(next)) void loadReveal(next);
    goNext('name');
  }

  function continueFocus() {
    if ((draft.focus_areas?.length ?? 0) === 0) {
      setError('Pick at least one area.');
      return;
    }
    if (isEditing) moveTo('review', -1);
    else goNext('focus');
  }

  if (ageStep === 'ask' || ageStep === 'under-18') {
    return (
      <View style={[styles.screen, { backgroundColor: colours.bg, paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: 48, paddingBottom: 24 }]}
          keyboardShouldPersistTaps="handled">
          {ageStep === 'ask' ? (
            <>
              <AppText variant="display" style={{ color: colours.ink }}>Are you 18 or over?</AppText>
              <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 12 }}>
                Ascenda is for adults aged 18 and over.
              </AppText>
            </>
          ) : (
            <>
              <AppText variant="display" style={{ color: colours.ink }}>Thanks for being honest</AppText>
              <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 12 }}>
                Ascenda is for adults aged 18 and over, so we need to delete this account and
                everything saved in it. We’d love to train with you when you’re 18.
              </AppText>
            </>
          )}
          {error ? <AppText variant="bodySm" style={[styles.error, { color: colours.danger }]}>{error}</AppText> : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {ageStep === 'ask' ? (
            <>
              <PrimaryButton
                label="Yes, I’m 18 or over"
                onPress={() => void handleConfirmAge()}
                loading={isSaving}
                disabled={isSaving}
              />
              <SecondaryButton
                label="No, I’m under 18"
                appearance="outline"
                onPress={() => setAgeStep('under-18')}
                disabled={isSaving}
              />
            </>
          ) : (
            <>
              <Pressable
                onPress={() => void handleDeleteAccount()}
                disabled={isSaving}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.dangerFill,
                  { backgroundColor: colours.danger, borderRadius: radius.full },
                  (pressed || isSaving) && styles.pressed,
                ]}>
                {isSaving ? (
                  <ActivityIndicator color={colours.onAccent} />
                ) : (
                  <AppText variant="bodyStrong" style={{ color: colours.onAccent }}>Delete my account</AppText>
                )}
              </Pressable>
              <SecondaryButton
                label="Go back"
                appearance="outline"
                onPress={() => {
                  setError(null);
                  setAgeStep('ask');
                }}
                disabled={isSaving}
              />
            </>
          )}
        </View>
      </View>
    );
  }

  const showBack = isEditing || step !== 'welcome';
  const showProgress = step !== 'review';

  const footer = (() => {
    if (step === 'welcome') {
      return <PrimaryButton label="Get started" onPress={() => goNext('welcome')} />;
    }
    if (step === 'safety') {
      return (
        <PrimaryButton
          label="Continue"
          onPress={() => void handleContinueSafety()}
          disabled={!safetyChecked}
          loading={isSaving}
        />
      );
    }
    if (step === 'insight-goal' || step === 'insight-gym' || step === 'insight-streak') {
      return <PrimaryButton label="Continue" onPress={() => goNext(step)} />;
    }
    if (
      step === 'goal' ||
      step === 'experience' ||
      step === 'gym_experience' ||
      step === 'equipment' ||
      step === 'comfort' ||
      step === 'days' ||
      step === 'minutes' ||
      step === 'streak'
    ) {
      return <PrimaryButton label="Continue" onPress={confirmChoice} disabled={!choiceReady} />;
    }
    if (step === 'focus') {
      return <PrimaryButton label="Continue" onPress={continueFocus} />;
    }
    if (step === 'bodyweight') {
      return (
        <>
          <PrimaryButton label="Continue" onPress={() => continueBodyweight(false)} />
          <TextButton label="Skip" onPress={() => continueBodyweight(true)} />
        </>
      );
    }
    if (step === 'name') {
      return (
        <>
          <PrimaryButton label="Continue" onPress={() => continueName(false)} />
          <TextButton label="Skip" onPress={() => continueName(true)} />
        </>
      );
    }
    if (step === 'reveal') {
      return (
        <PrimaryButton
          label="See your plan"
          onPress={() => void handleSave('paywall')}
          loading={isSaving}
          disabled={isSaving || revealState === 'loading'}
        />
      );
    }
    if (step === 'review') {
      return (
        <PrimaryButton
          label="Save changes"
          onPress={() => void handleSave('home')}
          loading={isSaving}
          disabled={isSaving}
        />
      );
    }
    return null;
  })();

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        {showBack ? (
          isEditing && step === 'review' ? (
            <TextButton label="Cancel" onPress={goBack} />
          ) : (
            <IconButton icon="chevron-back" onPress={goBack} accessibilityLabel="Back" />
          )
        ) : (
          <View style={styles.backSpacer} />
        )}
      </View>
      {showProgress ? (
        <View style={styles.segments} accessibilityRole="progressbar">
          {FLOW_STEPS.map((id, index) => (
            <View
              key={id}
              style={[
                styles.segment,
                {
                  backgroundColor: index < progressCount ? colours.brand : colours.surfaceMuted,
                  borderRadius: radius.full,
                },
              ]}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.slideClip}>
        <Animated.View style={[styles.slidePane, { transform: [{ translateX: slideX }] }]}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            {step === 'welcome' && (
              <>
                <AppText variant="eyebrow" style={{ color: colours.accent }}>Welcome to Ascenda</AppText>
                <AppText variant="display" style={{ color: colours.ink, marginTop: 12 }}>
                  Let’s find a plan that fits you
                </AppText>
                <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 12 }}>
                  A few short questions. No weight-loss pressure, just a clear first session.
                </AppText>
                <TextButton label="Not you? Sign out" onPress={() => void supabase.auth.signOut()} style={styles.inlineAction} />
              </>
            )}

            {step === 'safety' && (
              <>
                <AppText variant="display" style={{ color: colours.ink }}>Train safely</AppText>
                <View
                  style={[
                    styles.chartCard,
                    { backgroundColor: colours.surface, borderRadius: radius.xl, marginTop: 16 },
                    shadow,
                  ]}>
                  <DisclaimerBody hideTitle />
                </View>
                <View style={{ marginTop: 20 }}>
                  <DisclaimerCheckbox
                    checked={safetyChecked}
                    onToggle={() => setSafetyChecked((value) => !value)}
                  />
                </View>
                {error ? <AppText variant="bodySm" style={[styles.error, { color: colours.danger }]}>{error}</AppText> : null}
              </>
            )}

            {step === 'goal' && (
              <>
                <AppText variant="display" style={{ color: colours.ink }}>{GOAL_SCREEN_TITLE}</AppText>
                <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 12 }}>
                  {GOAL_HELPER}
                </AppText>
                <GoalChipGroup
                  selected={draft.main_goals ?? (draft.goal ? [draft.goal] : [])}
                  onChange={(next) => {
                    setDraft((current) => ({
                      ...current,
                      main_goals: next,
                      goal: next[0],
                    }));
                    setError(null);
                  }}
                />
              </>
            )}

            {step === 'insight-goal' && (
              <InsightStep
                title={fillGoalCopy(GOAL_INSIGHT_TITLE, draft.display_name ?? nameText)}
                body={
                  GOAL_COPY[(draft.main_goals?.[0] ?? draft.goal) as Goal] ??
                  'A clear goal helps you walk in. You can change this later.'
                }
              />
            )}

            {step === 'experience' && (
              <ChoiceStep
                title="How much lifting have you done?"
                options={EXPERIENCE_LEVELS.map((value) => ({
                  value,
                  label: EXPERIENCE_LABELS[value],
                  description: EXPERIENCE_COPY[value],
                }))}
                selected={draft.experience}
                onChoose={(value) => patchAnswer('experience', value as Experience)}
              />
            )}

            {step === 'gym_experience' && (
              <ChoiceStep
                title="How long have you been going to the gym?"
                options={GYM_EXPERIENCE_LEVELS.map((value) => ({
                  value,
                  label: GYM_EXPERIENCE_LABELS[value],
                  description: GYM_EXPERIENCE_COPY[value],
                }))}
                selected={draft.gym_experience}
                onChoose={(value) => patchAnswer('gym_experience', value as GymExperience)}
              />
            )}

            {step === 'equipment' && (
              <ChoiceStep
                title="What kit can you use at the gym?"
                subtitle="We recommend gym sessions that fit this. Backup sessions for days you cannot get there live in Programmes."
                options={(['full_gym', 'dumbbells', 'home'] as EquipmentAccess[]).map((value) => ({
                  value,
                  label: EQUIPMENT_ACCESS_LABELS[value],
                  description: EQUIPMENT_COPY[value],
                }))}
                selected={draft.equipment}
                onChoose={(value) => patchAnswer('equipment', value as EquipmentAccess)}
              />
            )}

            {step === 'insight-gym' && (
              <InsightStep
                title="You don’t need the whole gym on day one"
                body="One quiet spot is a strong start. You can add machines and free weights when you’re ready."
              />
            )}

            {step === 'comfort' && (
              <ChoiceStep
                title="How do you feel in the weights room?"
                subtitle="No wrong answers. This helps us keep the first weeks simple if you want that."
                options={CONFIDENCE_LEVELS.map((value) => ({
                  value,
                  label: `${value}. ${CONFIDENCE_LABELS[value]}`,
                }))}
                selected={draft.confidence}
                onChoose={(value) => patchAnswer('confidence', value as Confidence)}
              />
            )}

            {step === 'days' && (
              <ChoiceStep
                title="How many days a week can you train?"
                subtitle="Pick what feels realistic. Rest days help you get stronger too."
                options={DAYS_PER_WEEK_OPTIONS.map((value) => ({
                  value,
                  label: formatDaysPerWeek(value),
                }))}
                selected={draft.days_per_week}
                onChoose={(value) => patchAnswer('days_per_week', value as DaysPerWeek)}
              />
            )}

            {step === 'minutes' && (
              <ChoiceStep
                title="How long should a session feel?"
                subtitle="A guide for the plan, not a clock we judge you by."
                options={SESSION_MINUTES_OPTIONS.map((value) => ({
                  value,
                  label: formatSessionMinutes(value),
                }))}
                selected={draft.session_minutes}
                onChoose={(value) => patchAnswer('session_minutes', value as SessionMinutes)}
              />
            )}

            {step === 'focus' && (
              <FocusStep
                selected={draft.focus_areas ?? []}
                onChange={(focus_areas) => setDraft((current) => ({ ...current, focus_areas }))}
                error={error}
              />
            )}

            {step === 'streak' && (
              <ChoiceStep
                title="Pick a finish line for your weekly streak"
                subtitle="A week counts when you train at least once. Hitting your plan makes it a gold week."
                options={STREAK_GOALS.map((value) => ({
                  value,
                  label: `${value} weeks`,
                }))}
                selected={draft.streak_goal_weeks}
                onChoose={(value) => patchAnswer('streak_goal_weeks', value as StreakGoal)}
              />
            )}

            {step === 'insight-streak' && (
              <InsightStep
                metric={`${draft.streak_goal_weeks ?? DEFAULT_STREAK_GOAL} weeks`}
                title="A finish line you can see"
                body="That’s all a streak is: weeks in a row where you showed up, not a test. A week counts when you train at least once. Hitting your plan makes it a gold week. You can change this later in Profile."
              />
            )}

            {step === 'bodyweight' && (
              <>
                <AppText variant="display" style={{ color: colours.ink }}>Your bodyweight</AppText>
                <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 12 }}>
                  Optional. We only use it to show your strength relative to your bodyweight, like
                  lifting your own bodyweight. Never for BMI or any health score, and only you can see
                  it.
                </AppText>
                <View style={styles.weightRow}>
                  <TextInput
                    style={[
                      styles.input,
                      type.bodyStrong,
                      {
                        flex: 1,
                        color: colours.ink,
                        backgroundColor: colours.surface,
                        borderColor: colours.border,
                        borderRadius: radius.md,
                        fontVariant: ['tabular-nums'],
                      },
                    ]}
                    value={bodyweight}
                    onChangeText={setBodyweight}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 65"
                    placeholderTextColor={colours.inkMuted}
                    returnKeyType="done"
                    accessibilityLabel="Bodyweight in kilograms"
                  />
                  <AppText variant="title3" style={{ color: colours.inkMuted }}>kg</AppText>
                </View>
                {error ? <AppText variant="bodySm" style={[styles.error, { color: colours.danger }]}>{error}</AppText> : null}
              </>
            )}

            {step === 'name' && (
              <>
                <AppText variant="display" style={{ color: colours.ink }}>What should we call you?</AppText>
                <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 12 }}>
                  First name is perfect. You can skip this.
                </AppText>
                <TextInput
                  style={[
                    styles.input,
                    type.bodyStrong,
                    {
                      color: colours.ink,
                      backgroundColor: colours.surface,
                      borderColor: colours.border,
                      borderRadius: radius.md,
                      marginTop: 28,
                      fontVariant: ['tabular-nums'],
                    },
                  ]}
                  value={nameText}
                  onChangeText={setNameText}
                  autoCapitalize="words"
                  maxLength={MAX_DISPLAY_NAME}
                  placeholder="Your name"
                  placeholderTextColor={colours.inkMuted}
                  returnKeyType="done"
                  accessibilityLabel="Your name"
                />
                {error ? <AppText variant="bodySm" style={[styles.error, { color: colours.danger }]}>{error}</AppText> : null}
              </>
            )}

            {step === 'reveal' && (
              <RevealStep
                answers={answersForRecommend}
                recommended={recommended}
                projection={projection}
                loadState={revealState}
                error={error}
                onRetry={() => answersForRecommend && void loadReveal(answersForRecommend)}
              />
            )}

            {step === 'review' && (
              <ReviewStep
                draft={draft}
                bodyweight={bodyweight}
                nameText={nameText}
                error={error}
                onJump={(next) => moveTo(next, 1)}
              />
            )}
          </ScrollView>
          {footer ? (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>{footer}</View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

function ChoiceStep<T extends string | number>({
  title,
  subtitle,
  options,
  selected,
  onChoose,
}: {
  title: string;
  subtitle?: string;
  options: { value: T; label: string; description?: string }[];
  selected: T | undefined;
  onChoose: (value: T) => void;
}) {
  const { colours } = useTheme();
  const selectedOption = options.find((option) => option.value === selected);
  return (
    <>
      <AppText variant="display" style={{ color: colours.ink }}>{title}</AppText>
      {subtitle ? (
        <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 12 }}>{subtitle}</AppText>
      ) : null}
      <View style={styles.chipCloud}>
        {options.map((option) => (
          <Chip
            key={String(option.value)}
            label={option.label}
            selected={selected === option.value}
            size="lg"
            onPress={() => onChoose(option.value)}
          />
        ))}
      </View>
      {selectedOption?.description ? (
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 16 }}>
          {selectedOption.description}
        </AppText>
      ) : null}
    </>
  );
}

function InsightStep({ title, body, metric }: { title: string; body: string; metric?: string }) {
  const { colours } = useTheme();
  return (
    <View style={styles.insight}>
      <Ionicons name="checkmark-circle" size={56} color={colours.success} />
      {metric ? (
        <AppText variant="number" style={{ color: colours.accent, marginTop: 16 }}>{metric}</AppText>
      ) : null}
      <AppText variant="display" style={{ color: colours.ink, marginTop: 16, textAlign: 'center' }}>{title}</AppText>
      <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 12, textAlign: 'center' }}>{body}</AppText>
    </View>
  );
}

function FocusStep({
  selected,
  onChange,
  error,
}: {
  selected: FocusArea[];
  onChange: (next: FocusArea[]) => void;
  error: string | null;
}) {
  const { colours } = useTheme();
  return (
    <>
      <AppText variant="display" style={{ color: colours.ink }}>Anything you want to focus on?</AppText>
      <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 12 }}>
        Pick as many as you like. This helps us explain why a plan fits.
      </AppText>
      <View style={styles.chipCloud}>
        {FOCUS_AREAS.map((value) => {
          const isSelected = selected.includes(value);
          return (
            <Chip
              key={value}
              label={FOCUS_AREA_LABELS[value]}
              selected={isSelected}
              size="lg"
              onPress={() =>
                onChange(isSelected ? selected.filter((item) => item !== value) : [...selected, value])
              }
            />
          );
        })}
      </View>
      {error ? <AppText variant="bodySm" style={[styles.error, { color: colours.danger }]}>{error}</AppText> : null}
    </>
  );
}

function RevealStep({
  answers,
  recommended,
  projection,
  loadState,
  error,
  onRetry,
}: {
  answers: QuizAnswers | null;
  recommended: RoutineSummary | null;
  projection: LiftProjection | null;
  loadState: 'idle' | 'loading' | 'ready';
  error: string | null;
  onRetry: () => void;
}) {
  const { colours, radius, shadow } = useTheme();
  const cover = recommended ? coverSources(coverForRoutine(recommended))[0] ?? null : null;
  const why = recommended && answers ? recommendationBullets(recommended, answers) : [];
  return (
    <>
      <AppText variant="eyebrow" style={{ color: colours.accent, marginBottom: 12 }}>Your plan is ready</AppText>
      {recommended ? (
        <View style={{ borderRadius: radius.lg, overflow: 'hidden', marginBottom: 16 }}>
          <HeroImage
            image={cover}
            letter={recommended.name}
            title={recommended.name}
            eyebrow={recommended.is_pro ? 'Pro plan' : 'Free starter'}
            height={220}
          />
        </View>
      ) : null}
      {recommended?.is_pro ? <ProBadge locked compact style={{ alignSelf: 'flex-start', marginBottom: 8 }} /> : null}
      <AppText variant="display" style={{ color: colours.ink }}>
        {recommended ? recommended.name : 'Strong Foundations in 6 Weeks'}
      </AppText>
      {loadState === 'loading' ? (
        <ActivityIndicator color={colours.brand} style={{ marginTop: 24 }} />
      ) : recommended ? (
        <>
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 8 }}>
            {recommended.length_weeks} weeks · {formatDaysPerWeek(recommended.days_per_week)} a week
            · about {recommended.session_minutes} minutes
          </AppText>
          {why.length > 0 ? (
            <View style={styles.why}>
              <AppText variant="title3" style={{ color: colours.ink, marginBottom: 8 }}>Why this plan</AppText>
              {why.map((line) => (
                <View key={line} style={styles.whyRow}>
                  <Ionicons name="checkmark" size={18} color={colours.success} />
                  <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>{line}</AppText>
                </View>
              ))}
            </View>
          ) : null}
          {recommended.is_pro ? (
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 12 }}>
              This one is Pro. If you don’t subscribe, we’ll start you on the free Gym Confidence
              plan, with the same first-session feeling.
            </AppText>
          ) : null}
        </>
      ) : (
        <>
          <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 12 }}>
            We’ll start you on Gym Confidence: 6 weeks, the free beginner plan, unless we can load
            your match in a moment.
          </AppText>
          <TextButton label="Try loading your plan again" onPress={onRetry} style={styles.inlineAction} />
        </>
      )}

      {projection ? (
        <View style={[styles.chartCard, { backgroundColor: colours.surface, borderRadius: radius.xl }, shadow]}>
          <AppText variant="title3" style={{ color: colours.ink }}>{projection.exerciseName}</AppText>
          <AppText variant="caption" style={{ color: colours.inkMuted }}>
            Estimate, not a promise. If you hit the top of the rep range every other week, the
            progression rule looks like this.
          </AppText>
          <LineChart
            points={projection.points.map((point) => ({ x: point.week, y: point.kg }))}
            formatX={(x) => `W${x}`}
            formatY={(y) => `${Math.round(y)} kg`}
            height={180}
          />
        </View>
      ) : null}

      <SafetyNotice style={{ marginTop: 24 }} />
      {error ? <AppText variant="bodySm" style={[styles.error, { color: colours.danger }]}>{error}</AppText> : null}
    </>
  );
}

function ReviewStep({
  draft,
  bodyweight,
  nameText,
  error,
  onJump,
}: {
  draft: Draft;
  bodyweight: string;
  nameText: string;
  error: string | null;
  onJump: (step: FlowStep) => void;
}) {
  const { colours, radius, shadow } = useTheme();
  const rows: { name: string; value: string; step: FlowStep }[] = [
    {
      name: 'Goals',
      value: formatGoalsLabel(draft.main_goals ?? (draft.goal ? [draft.goal] : [])),
      step: 'goal',
    },
    {
      name: 'Experience',
      value: draft.experience ? EXPERIENCE_LABELS[draft.experience] : '',
      step: 'experience',
    },
    {
      name: 'Gym experience',
      value: draft.gym_experience ? GYM_EXPERIENCE_LABELS[draft.gym_experience] : '',
      step: 'gym_experience',
    },
    {
      name: 'Equipment',
      value: draft.equipment ? EQUIPMENT_ACCESS_LABELS[draft.equipment] : '',
      step: 'equipment',
    },
    {
      name: 'Gym comfort',
      value: draft.confidence ? `${draft.confidence}. ${CONFIDENCE_LABELS[draft.confidence]}` : '',
      step: 'comfort',
    },
    {
      name: 'Days per week',
      value: draft.days_per_week ? formatDaysPerWeek(draft.days_per_week) : '',
      step: 'days',
    },
    {
      name: 'Session length',
      value: draft.session_minutes ? formatSessionMinutes(draft.session_minutes) : '',
      step: 'minutes',
    },
    {
      name: 'Focus',
      value: (draft.focus_areas ?? []).map((item) => FOCUS_AREA_LABELS[item]).join(', '),
      step: 'focus',
    },
    {
      name: 'Streak goal',
      value: draft.streak_goal_weeks ? `${draft.streak_goal_weeks} weeks` : '',
      step: 'streak',
    },
    {
      name: 'Bodyweight (optional)',
      value: parseBodyweight(bodyweight) ? formatKg(parseBodyweight(bodyweight) ?? 0) : 'Not added',
      step: 'bodyweight',
    },
    {
      name: 'Name',
      value: nameText.trim() || 'Not added',
      step: 'name',
    },
  ];

  return (
    <>
      <AppText variant="display" style={{ color: colours.ink }}>Your answers</AppText>
      <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 8, marginBottom: 16 }}>
        Tap an answer to change it.
      </AppText>
      <View style={[{ borderRadius: radius.lg }, shadow]}>
        <View style={[styles.reviewCard, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
          {rows.map((row, index) => (
            <ListRow
              key={row.name}
              title={row.name}
              subtitle={row.value || 'Not set'}
              onPress={() => onJump(row.step)}
              style={index === rows.length - 1 ? { borderBottomWidth: 0 } : undefined}
            />
          ))}
        </View>
      </View>
      <SafetyNotice style={{ marginTop: 24 }} />
      {error ? <AppText variant="bodySm" style={[styles.error, { color: colours.danger }]}>{error}</AppText> : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    minHeight: 48,
  },
  backSpacer: {
    width: 40,
    height: 40,
  },
  segments: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  segment: {
    flex: 1,
    height: 4,
  },
  slideClip: {
    flex: 1,
    overflow: 'hidden',
  },
  slidePane: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  chipCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 28,
  },
  insight: {
    alignItems: 'center',
    paddingTop: 32,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 28,
  },
  input: {
    minHeight: 56,
    paddingHorizontal: 16,
    borderWidth: 1.5,
  },
  why: {
    marginTop: 20,
    gap: 10,
  },
  whyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  chartCard: {
    marginTop: 24,
    padding: 16,
    gap: 8,
  },
  reviewCard: {
    overflow: 'hidden',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 8,
  },
  dangerFill: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineAction: {
    alignSelf: 'flex-start',
    marginTop: 20,
    paddingHorizontal: 0,
  },
  error: {
    marginTop: 16,
  },
  pressed: {
    opacity: 0.8,
  },
});
