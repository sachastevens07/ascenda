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
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoverPhoto } from '@/components/CoverPhoto';
import { LineChart } from '@/components/LineChart';
import { colours } from '@/constants/theme';
import { coverForRoutine } from '@/lib/images';
import { DEFAULT_STREAK_GOAL, STREAK_GOALS, type StreakGoal } from '@/lib/activityStats';
import {
  describeRecommendation,
  pickRecommendedRoutine,
  projectKeyLift,
  queueOnboardingPaywall,
  startOnboardingRoutine,
  type LiftProjection,
} from '@/lib/onboarding';
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
  GOALS,
  GOAL_LABELS,
  MAX_BODYWEIGHT_KG,
  MAX_DISPLAY_NAME,
  MIN_BODYWEIGHT_KG,
  SESSION_MINUTES_OPTIONS,
  TRAINING_LOCATION_LABELS,
  TRAINING_LOCATIONS,
  equipmentOptionsForLocation,
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
  type TrainingLocation,
} from '@/lib/profile';
import { fetchRoutine, fetchRoutines, type RoutineSummary } from '@/lib/routines';
import { useSubscription } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';

type Draft = Partial<QuizAnswers> & { focus_areas?: FocusArea[] };

type FlowStep =
  | 'welcome'
  | 'goal'
  | 'insight-goal'
  | 'experience'
  | 'location'
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
  'goal',
  'insight-goal',
  'experience',
  'location',
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
  dumbbells: 'A set of dumbbells, and maybe a bench.',
  home: 'Little or no kit: bodyweight and maybe a band.',
};

function withStoredLevel(draft: Draft): Draft {
  if (draft.confidence && draft.confidence_level === undefined) {
    return { ...draft, confidence_level: levelForConfidence(draft.confidence) };
  }
  return draft;
}

function isComplete(draft: Draft): draft is QuizAnswers {
  const ready = withStoredLevel(draft);
  return (
    ready.goal !== undefined &&
    ready.experience !== undefined &&
    ready.days_per_week !== undefined &&
    ready.equipment !== undefined &&
    ready.confidence !== undefined &&
    ready.confidence_level !== undefined &&
    ready.training_location !== undefined &&
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

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { profile, saveQuizAnswers, confirmAge, deleteAccount } = useProfile();
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<RoutineSummary | null>(null);
  const [projection, setProjection] = useState<LiftProjection | null>(null);
  const [revealState, setRevealState] = useState<'idle' | 'loading' | 'ready'>('idle');
  const slideX = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;

  const flowIndex = FLOW_STEPS.indexOf(step as FlowStep);
  const progress = flowIndex === -1 ? 0 : (flowIndex + 1) / FLOW_STEPS.length;

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
    moveTo(FLOW_STEPS[index - 1], -1);
  }

  function choose<K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K], next?: FlowStep) {
    const nextDraft = { ...draft, [key]: value } as Draft;
    if (key === 'confidence') {
      nextDraft.confidence_level = levelForConfidence(value as Confidence);
    }
    if (key === 'training_location') {
      const allowed = equipmentOptionsForLocation(value as TrainingLocation);
      if (nextDraft.equipment && !allowed.includes(nextDraft.equipment)) {
        nextDraft.equipment = undefined;
      }
    }
    setDraft(nextDraft);
    if (isEditing) {
      moveTo('review', -1);
      return;
    }
    if (next) moveTo(next, 1);
    else goNext(step as FlowStep);
  }

  async function loadReveal(answers: QuizAnswers) {
    setRevealState('loading');
    try {
      const routines = await fetchRoutines();
      const picked = pickRecommendedRoutine(routines, answers);
      setRecommended(picked);
      if (picked) {
        const detail = await fetchRoutine(picked.id).catch(() => null);
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

  if (ageStep === 'ask' || ageStep === 'under-18') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: 64, paddingBottom: insets.bottom + 24 }]}>
          {ageStep === 'ask' ? (
            <>
              <Text style={styles.title}>Are you 18 or over?</Text>
              <Text style={styles.subtitle}>Ascenda is for adults aged 18 and over.</Text>
              {error && <Text style={styles.error}>{error}</Text>}
              <Pressable
                style={({ pressed }) => [styles.button, (pressed || isSaving) && styles.buttonPressed]}
                onPress={handleConfirmAge}
                disabled={isSaving}
                accessibilityRole="button">
                {isSaving ? (
                  <ActivityIndicator color={colours.surface} />
                ) : (
                  <Text style={styles.buttonText}>Yes, I’m 18 or over</Text>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.outlineButton, pressed && styles.buttonPressed]}
                onPress={() => setAgeStep('under-18')}
                disabled={isSaving}
                accessibilityRole="button">
                <Text style={styles.outlineButtonText}>No, I’m under 18</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Thanks for being honest</Text>
              <Text style={styles.subtitle}>
                Ascenda is for adults aged 18 and over, so we need to delete this account and
                everything saved in it. We’d love to train with you when you’re 18.
              </Text>
              {error && <Text style={styles.error}>{error}</Text>}
              <Pressable
                style={({ pressed }) => [styles.dangerButton, (pressed || isSaving) && styles.buttonPressed]}
                onPress={handleDeleteAccount}
                disabled={isSaving}
                accessibilityRole="button">
                {isSaving ? (
                  <ActivityIndicator color={colours.surface} />
                ) : (
                  <Text style={styles.buttonText}>Delete my account</Text>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.outlineButton, pressed && styles.buttonPressed]}
                onPress={() => {
                  setError(null);
                  setAgeStep('ask');
                }}
                disabled={isSaving}
                accessibilityRole="button">
                <Text style={styles.outlineButtonText}>Go back</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  const showBack = isEditing || step !== 'welcome';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        {showBack ? (
          <Pressable
            onPress={goBack}
            style={styles.backButton}
            hitSlop={8}
            accessibilityRole="button">
            <Text style={styles.backText}>{isEditing && step === 'review' ? 'Cancel' : 'Back'}</Text>
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
      </View>
      {step !== 'review' && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      )}

      <View style={styles.slideClip}>
      <Animated.View style={[styles.slidePane, { transform: [{ translateX: slideX }] }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled">
        {step === 'welcome' && (
          <>
            <Text style={styles.welcome}>Welcome to Ascenda</Text>
            <Text style={styles.title}>Let’s find a plan that fits you</Text>
            <Text style={styles.subtitle}>
              A few short questions. No weight-loss pressure — just a clear first session.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={() => goNext('welcome')}
              accessibilityRole="button">
              <Text style={styles.buttonText}>Get started</Text>
            </Pressable>
            <Pressable
              onPress={() => supabase.auth.signOut()}
              style={styles.signOut}
              accessibilityRole="button">
              <Text style={styles.signOutText}>Not you? Sign out</Text>
            </Pressable>
          </>
        )}

        {step === 'goal' && (
          <ChoiceStep
            title="What’s your main goal?"
            subtitle="You can change this any time."
            options={GOALS.map((value) => ({
              value,
              label: GOAL_LABELS[value],
              description: {
                strength: 'Lift heavier on the big moves.',
                glutes_legs: 'Build a stronger lower body.',
                general: 'Feel fitter and more capable all round.',
              }[value],
            }))}
            selected={draft.goal}
            onChoose={(value) => choose('goal', value as Goal)}
          />
        )}

        {step === 'insight-goal' && (
          <InsightStep
            title="A clear goal helps you walk in"
            body="When you know what you’re there for, the next session is already decided. You can change this later."
            onContinue={() => goNext('insight-goal')}
          />
        )}

        {step === 'experience' && (
          <ChoiceStep
            title="How much lifting have you done?"
            options={EXPERIENCE_LEVELS.map((value) => ({
              value,
              label: EXPERIENCE_LABELS[value],
              description: {
                new: "Never, or hardly ever. That’s absolutely fine.",
                some: "I’ve used weights before, on and off.",
                confident: 'I train regularly and know the main lifts.',
              }[value],
            }))}
            selected={draft.experience}
            onChoose={(value) => choose('experience', value as Experience)}
          />
        )}

        {step === 'location' && (
          <ChoiceStep
            title="Where will you train?"
            options={TRAINING_LOCATIONS.map((value) => ({
              value,
              label: TRAINING_LOCATION_LABELS[value],
              description: {
                gym: 'A gym with machines, free weights or both.',
                home: 'Your own space, with whatever kit you have.',
                both: 'Some days at the gym, some days at home.',
              }[value],
            }))}
            selected={draft.training_location}
            onChoose={(value) => choose('training_location', value as TrainingLocation)}
          />
        )}

        {step === 'equipment' && (
          <ChoiceStep
            title="What kit can you use?"
            subtitle="We’ll only recommend sessions that fit this."
            options={equipmentOptionsForLocation(draft.training_location ?? 'both').map((value) => ({
              value,
              label: EQUIPMENT_ACCESS_LABELS[value],
              description: EQUIPMENT_COPY[value],
            }))}
            selected={draft.equipment}
            onChoose={(value) => choose('equipment', value as EquipmentAccess)}
          />
        )}

        {step === 'insight-gym' && (
          <InsightStep
            title="You don’t need the whole gym on day one"
            body="One quiet spot is a strong start. You can add machines and free weights when you’re ready."
            onContinue={() => goNext('insight-gym')}
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
            onChoose={(value) => choose('confidence', value as Confidence)}
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
            onChoose={(value) => choose('days_per_week', value as DaysPerWeek)}
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
            onChoose={(value) => choose('session_minutes', value as SessionMinutes)}
          />
        )}

        {step === 'focus' && (
          <FocusStep
            selected={draft.focus_areas ?? []}
            onChange={(focus_areas) => setDraft((current) => ({ ...current, focus_areas }))}
            onContinue={() => {
              if ((draft.focus_areas?.length ?? 0) === 0) {
                setError('Pick at least one area.');
                return;
              }
              if (isEditing) moveTo('review', -1);
              else goNext('focus');
            }}
            error={error}
          />
        )}

        {step === 'streak' && (
          <ChoiceStep
            title="Pick a finish line for your weekly streak"
            subtitle="A week counts when you hit the sessions you planned. Choose how many weeks in a row you’d like to aim for. You can change this later."
            options={STREAK_GOALS.map((value) => ({
              value,
              label: `${value} weeks`,
            }))}
            selected={draft.streak_goal_weeks}
            onChoose={(value) => choose('streak_goal_weeks', value as StreakGoal)}
          />
        )}

        {step === 'insight-streak' && (
          <InsightStep
            metric={`${draft.streak_goal_weeks ?? DEFAULT_STREAK_GOAL} weeks`}
            title="Consistency is what moves the needle"
            body={`People who stay consistent for ${draft.streak_goal_weeks ?? DEFAULT_STREAK_GOAL} weeks are much more likely to still be training after that — and to feel at home with their plan. That’s all a streak is: a finish line you can see, not a test. One rest week a month can keep it going.`}
            onContinue={() => goNext('insight-streak')}
          />
        )}

        {step === 'bodyweight' && (
          <>
            <Text style={styles.title}>Your bodyweight</Text>
            <Text style={styles.subtitle}>
              Optional. We only use it to show your strength relative to your bodyweight, like
              lifting your own bodyweight. Never for BMI or any health score, and only you can see
              it.
            </Text>
            <View style={styles.weightRow}>
              <TextInput
                style={styles.weightInput}
                value={bodyweight}
                onChangeText={setBodyweight}
                keyboardType="decimal-pad"
                placeholder="–"
                placeholderTextColor={colours.textMuted}
                returnKeyType="done"
                accessibilityLabel="Bodyweight in kilograms"
              />
              <Text style={styles.weightUnit}>kg</Text>
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={() => {
                if (parseBodyweight(bodyweight) === undefined) {
                  setError(
                    `Enter a bodyweight between ${MIN_BODYWEIGHT_KG} and ${MAX_BODYWEIGHT_KG} kg, or skip it.`
                  );
                  return;
                }
                if (isEditing) moveTo('review', -1);
                else goNext('bodyweight');
              }}
              accessibilityRole="button">
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setBodyweight('');
                if (isEditing) moveTo('review', -1);
                else goNext('bodyweight');
              }}
              style={styles.signOut}
              accessibilityRole="button">
              <Text style={styles.signOutText}>Skip</Text>
            </Pressable>
          </>
        )}

        {step === 'name' && (
          <>
            <Text style={styles.title}>What should we call you?</Text>
            <Text style={styles.subtitle}>First name is perfect. You can skip this.</Text>
            <TextInput
              style={styles.nameInput}
              value={nameText}
              onChangeText={setNameText}
              autoCapitalize="words"
              maxLength={MAX_DISPLAY_NAME}
              placeholder="Your name"
              placeholderTextColor={colours.textMuted}
              returnKeyType="done"
              accessibilityLabel="Your name"
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={() => {
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
              }}
              accessibilityRole="button">
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setNameText('');
                setDraft((current) => ({ ...current, display_name: '' }));
                const next = withStoredLevel({ ...draft, display_name: '' });
                if (!isEditing && isComplete(next)) void loadReveal(next);
                if (isEditing) moveTo('review', -1);
                else goNext('name');
              }}
              style={styles.signOut}
              accessibilityRole="button">
              <Text style={styles.signOutText}>Skip</Text>
            </Pressable>
          </>
        )}

        {step === 'reveal' && (
          <RevealStep
            answers={answersForRecommend}
            recommended={recommended}
            projection={projection}
            loadState={revealState}
            isSaving={isSaving}
            error={error}
            onContinue={() => void handleSave('paywall')}
            onRetry={() => answersForRecommend && void loadReveal(answersForRecommend)}
          />
        )}

        {step === 'review' && (
          <ReviewStep
            draft={draft}
            bodyweight={bodyweight}
            nameText={nameText}
            isSaving={isSaving}
            error={error}
            onJump={(next) => moveTo(next, 1)}
            onSave={() => void handleSave('home')}
          />
        )}
      </ScrollView>
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
  return (
    <>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.options}>
        {options.map((option) => {
          const isSelected = selected === option.value;
          return (
            <Pressable
              key={String(option.value)}
              onPress={() => onChoose(option.value)}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}>
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                {option.label}
              </Text>
              {option.description ? (
                <Text style={styles.optionDescription}>{option.description}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function InsightStep({
  title,
  body,
  metric,
  onContinue,
}: {
  title: string;
  body: string;
  metric?: string;
  onContinue: () => void;
}) {
  return (
    <>
      <Text style={styles.welcome}>A quick note</Text>
      {metric ? <Text style={styles.metric}>{metric}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{body}</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={onContinue}
        accessibilityRole="button">
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </>
  );
}

function FocusStep({
  selected,
  onChange,
  onContinue,
  error,
}: {
  selected: FocusArea[];
  onChange: (next: FocusArea[]) => void;
  onContinue: () => void;
  error: string | null;
}) {
  return (
    <>
      <Text style={styles.title}>Anything you want to focus on?</Text>
      <Text style={styles.subtitle}>Pick as many as you like. This helps us explain why a plan fits.</Text>
      <View style={styles.options}>
        {FOCUS_AREAS.map((value) => {
          const isSelected = selected.includes(value);
          return (
            <Pressable
              key={value}
              onPress={() =>
                onChange(
                  isSelected ? selected.filter((item) => item !== value) : [...selected, value]
                )
              }
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}>
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                {FOCUS_AREA_LABELS[value]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={onContinue}
        accessibilityRole="button">
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </>
  );
}

function RevealStep({
  answers,
  recommended,
  projection,
  loadState,
  isSaving,
  error,
  onContinue,
  onRetry,
}: {
  answers: QuizAnswers | null;
  recommended: RoutineSummary | null;
  projection: LiftProjection | null;
  loadState: 'idle' | 'loading' | 'ready';
  isSaving: boolean;
  error: string | null;
  onContinue: () => void;
  onRetry: () => void;
}) {
  return (
    <>
      <Text style={styles.welcome}>Your plan is ready</Text>
      {recommended ? (
        <CoverPhoto
          cover={coverForRoutine(recommended)}
          letter={recommended.name.slice(0, 1)}
          height={180}
          radius={22}
          style={styles.revealCover}
        />
      ) : null}
      <Text style={styles.title}>
        {recommended ? recommended.name : 'Gym Confidence: 6 weeks'}
      </Text>
      {loadState === 'loading' ? (
        <ActivityIndicator color={colours.accent} style={{ marginTop: 24 }} />
      ) : recommended ? (
        <>
          <Text style={styles.subtitle}>
            {recommended.length_weeks} weeks · {formatDaysPerWeek(recommended.days_per_week)} a week
            · about {recommended.session_minutes} minutes
          </Text>
          {answers ? (
            <Text style={styles.subtitle}>{describeRecommendation(recommended, answers)}</Text>
          ) : null}
          {recommended.is_pro ? (
            <Text style={styles.subtitle}>
              This one is Pro. If you don’t subscribe, we’ll start you on the free Gym Confidence
              plan — same first-session feeling.
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.subtitle}>
            We’ll start you on Gym Confidence: 6 weeks, the free beginner plan, unless we can load
            your match in a moment.
          </Text>
          <Pressable onPress={onRetry} style={styles.signOut} accessibilityRole="button">
            <Text style={styles.signOutText}>Try loading your plan again</Text>
          </Pressable>
        </>
      )}

      {projection && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>{projection.exerciseName}</Text>
          <Text style={styles.optionDescription}>
            Estimate, not a promise. If you hit the top of the rep range every other week, the
            progression rule looks like this.
          </Text>
          <LineChart
            points={projection.points.map((point) => ({ x: point.week, y: point.kg }))}
            formatX={(x) => `W${x}`}
            formatY={(y) => `${Math.round(y)} kg`}
            height={180}
          />
        </View>
      )}

      <Text style={styles.disclaimer}>
        General fitness guidance, not medical advice. Stop if anything hurts.
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={({ pressed }) => [styles.button, (pressed || isSaving) && styles.buttonPressed]}
        onPress={onContinue}
        disabled={isSaving || loadState === 'loading'}
        accessibilityRole="button">
        {isSaving ? (
          <ActivityIndicator color={colours.surface} />
        ) : (
          <Text style={styles.buttonText}>See your plan</Text>
        )}
      </Pressable>
    </>
  );
}

function ReviewStep({
  draft,
  bodyweight,
  nameText,
  isSaving,
  error,
  onJump,
  onSave,
}: {
  draft: Draft;
  bodyweight: string;
  nameText: string;
  isSaving: boolean;
  error: string | null;
  onJump: (step: FlowStep) => void;
  onSave: () => void;
}) {
  const rows: { name: string; value: string; step: FlowStep }[] = [
    { name: 'Goal', value: draft.goal ? GOAL_LABELS[draft.goal] : '', step: 'goal' },
    {
      name: 'Experience',
      value: draft.experience ? EXPERIENCE_LABELS[draft.experience] : '',
      step: 'experience',
    },
    {
      name: 'Where you train',
      value: draft.training_location ? TRAINING_LOCATION_LABELS[draft.training_location] : '',
      step: 'location',
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
      <Text style={styles.title}>Your answers</Text>
      <Text style={styles.subtitle}>Tap an answer to change it.</Text>
      <View style={styles.options}>
        {rows.map((row) => (
          <Pressable
            key={row.name}
            onPress={() => onJump(row.step)}
            style={({ pressed }) => [styles.reviewRow, pressed && styles.optionPressed]}
            accessibilityRole="button"
            accessibilityHint={`Change your answer for ${row.name}`}>
            <Text style={styles.reviewName}>{row.name}</Text>
            <Text style={styles.reviewValue}>{row.value || 'Not set'}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.disclaimer}>
        General fitness guidance, not medical advice. Stop if anything hurts.
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={({ pressed }) => [styles.button, (pressed || isSaving) && styles.buttonPressed]}
        onPress={onSave}
        disabled={isSaving}
        accessibilityRole="button">
        {isSaving ? (
          <ActivityIndicator color={colours.surface} />
        ) : (
          <Text style={styles.buttonText}>Save changes</Text>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colours.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    minHeight: 56,
  },
  backButton: {
    minWidth: 64,
    minHeight: 48,
    justifyContent: 'center',
  },
  backText: {
    fontSize: 17,
    fontWeight: '600',
    color: colours.accent,
  },
  slideClip: {
    flex: 1,
    overflow: 'hidden',
  },
  slidePane: {
    flex: 1,
  },
  metric: {
    fontSize: 40,
    fontWeight: '700',
    color: colours.accent,
    marginBottom: 8,
  },
  progressTrack: {
    height: 6,
    marginHorizontal: 24,
    borderRadius: 999,
    backgroundColor: colours.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colours.accent,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  welcome: {
    fontSize: 17,
    color: colours.accent,
    fontWeight: '600',
    marginBottom: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colours.text,
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 24,
    color: colours.textMuted,
    marginTop: 8,
  },
  options: {
    marginTop: 28,
    gap: 12,
  },
  option: {
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colours.border,
    backgroundColor: colours.surface,
  },
  optionSelected: {
    borderColor: colours.accent,
    backgroundColor: colours.accentSoft,
  },
  optionPressed: {
    opacity: 0.7,
  },
  optionLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: colours.text,
  },
  optionLabelSelected: {
    color: colours.accent,
  },
  optionDescription: {
    fontSize: 15,
    lineHeight: 21,
    color: colours.textMuted,
    marginTop: 4,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 28,
  },
  weightInput: {
    flex: 1,
    minHeight: 64,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colours.border,
    backgroundColor: colours.surface,
    fontSize: 24,
    fontWeight: '600',
    color: colours.text,
  },
  weightUnit: {
    fontSize: 20,
    fontWeight: '600',
    color: colours.textMuted,
  },
  nameInput: {
    minHeight: 64,
    marginTop: 28,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colours.border,
    backgroundColor: colours.surface,
    fontSize: 20,
    fontWeight: '600',
    color: colours.text,
  },
  revealCover: {
    marginTop: 16,
  },
  chartCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 22,
    backgroundColor: colours.surface,
    gap: 8,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colours.text,
  },
  reviewRow: {
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: colours.surface,
  },
  reviewName: {
    fontSize: 14,
    color: colours.textMuted,
  },
  reviewValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colours.text,
    marginTop: 2,
  },
  disclaimer: {
    fontSize: 14,
    lineHeight: 20,
    color: colours.textMuted,
    marginTop: 24,
  },
  error: {
    fontSize: 15,
    lineHeight: 21,
    color: colours.accent,
    marginTop: 16,
  },
  signOut: {
    alignItems: 'center',
    paddingVertical: 20,
    marginTop: 12,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
  },
  button: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
    marginTop: 24,
  },
  dangerButton: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.danger,
    marginTop: 24,
  },
  outlineButton: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
    marginTop: 12,
  },
  outlineButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.surface,
  },
});
