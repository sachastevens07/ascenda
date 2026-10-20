import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colours } from '@/constants/theme';
import {
  CONFIDENCE_LABELS,
  CONFIDENCE_LEVELS,
  DAYS_PER_WEEK_OPTIONS,
  EQUIPMENT_ACCESS,
  EQUIPMENT_ACCESS_LABELS,
  EXPERIENCE_LABELS,
  EXPERIENCE_LEVELS,
  GOALS,
  GOAL_LABELS,
  formatDaysPerWeek,
  getQuizAnswers,
  useProfile,
  type QuizAnswers,
} from '@/lib/profile';
import { supabase } from '@/lib/supabase';

type AnswerKey = keyof QuizAnswers;
type AnswerValue = QuizAnswers[AnswerKey];
type Draft = Partial<QuizAnswers>;

type Option = { value: AnswerValue; label: string; description?: string };

type Question = {
  key: AnswerKey;
  /** Short name used on the review step. */
  name: string;
  title: string;
  subtitle?: string;
  options: Option[];
};

const QUESTIONS: Question[] = [
  {
    key: 'goal',
    name: 'Goal',
    title: "What's your main goal?",
    subtitle: 'You can change this any time.',
    options: GOALS.map((value) => ({
      value,
      label: GOAL_LABELS[value],
      description: {
        strength: 'Lift heavier on the big moves.',
        glutes_legs: 'Build a stronger lower body.',
        general: 'Feel fitter and more capable all round.',
      }[value],
    })),
  },
  {
    key: 'experience',
    name: 'Experience',
    title: 'How much lifting have you done?',
    options: EXPERIENCE_LEVELS.map((value) => ({
      value,
      label: EXPERIENCE_LABELS[value],
      description: {
        new: "Never, or hardly ever. That's absolutely fine.",
        some: "I've used weights before, on and off.",
        confident: 'I train regularly and know the main lifts.',
      }[value],
    })),
  },
  {
    key: 'days_per_week',
    name: 'Days per week',
    title: 'How many days a week can you train?',
    subtitle: 'Pick what feels realistic. Rest days help you get stronger too.',
    options: DAYS_PER_WEEK_OPTIONS.map((value) => ({ value, label: formatDaysPerWeek(value) })),
  },
  {
    key: 'equipment',
    name: 'Where you train',
    title: 'Where will you train?',
    options: EQUIPMENT_ACCESS.map((value) => ({
      value,
      label: EQUIPMENT_ACCESS_LABELS[value],
      description: {
        full_gym: 'Barbells, machines, cables and dumbbells.',
        dumbbells: 'A set of dumbbells, and maybe a bench.',
        home: 'Little or no kit: bodyweight and maybe a band.',
      }[value],
    })),
  },
  {
    key: 'confidence',
    name: 'Gym confidence',
    title: 'How do you feel in the weights room?',
    subtitle: 'No wrong answers. This helps us keep things simple to start.',
    options: CONFIDENCE_LEVELS.map((value) => ({
      value,
      label: `${value}. ${CONFIDENCE_LABELS[value]}`,
    })),
  },
];

const REVIEW_STEP = QUESTIONS.length;

function firstUnanswered(draft: Draft): number {
  const index = QUESTIONS.findIndex((question) => draft[question.key] === undefined);
  return index === -1 ? REVIEW_STEP : index;
}

function isComplete(draft: Draft): draft is QuizAnswers {
  return firstUnanswered(draft) === REVIEW_STEP;
}

function optionLabel(question: Question, value: AnswerValue | undefined): string {
  return question.options.find((option) => option.value === value)?.label ?? '';
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { profile, saveQuizAnswers } = useProfile();
  const [savedAnswers] = useState(() => getQuizAnswers(profile));
  const isEditing = savedAnswers !== null;
  const [draft, setDraft] = useState<Draft>(savedAnswers ?? {});
  const [step, setStep] = useState(isEditing ? REVIEW_STEP : 0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = step < REVIEW_STEP ? QUESTIONS[step] : null;

  function choose(key: AnswerKey, value: AnswerValue) {
    const next = { ...draft, [key]: value } as Draft;
    setDraft(next);
    setStep(firstUnanswered(next));
  }

  async function handleSave() {
    if (!isComplete(draft)) return;
    setIsSaving(true);
    setError(null);
    try {
      await saveQuizAnswers(draft);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      setError("Sorry, we couldn't save your answers. Check your connection and try again.");
      setIsSaving(false);
    }
  }

  const showBack = isEditing || step > 0;
  const closesScreen = isEditing && !question;
  function handleBack() {
    if (closesScreen) router.back();
    else if (isEditing) setStep(REVIEW_STEP);
    else setStep(step - 1);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        {showBack ? (
          <Pressable
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={8}
            accessibilityRole="button">
            <Text style={styles.backText}>{closesScreen ? 'Cancel' : 'Back'}</Text>
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
        <Text style={styles.stepCount}>
          {question ? `${step + 1} of ${QUESTIONS.length}` : ''}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width: `${(Math.min(step, REVIEW_STEP) / REVIEW_STEP) * 100}%` }]}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {question ? (
          <>
            {step === 0 && !isEditing && (
              <Text style={styles.welcome}>Let's get you set up. Five quick questions.</Text>
            )}
            <Text style={styles.title}>{question.title}</Text>
            {question.subtitle && <Text style={styles.subtitle}>{question.subtitle}</Text>}

            <View style={styles.options}>
              {question.options.map((option) => {
                const isSelected = draft[question.key] === option.value;
                return (
                  <Pressable
                    key={String(option.value)}
                    onPress={() => choose(question.key, option.value)}
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
                    {option.description && (
                      <Text style={styles.optionDescription}>{option.description}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {step === 0 && !isEditing && (
              <Pressable
                onPress={() => supabase.auth.signOut()}
                style={styles.signOut}
                accessibilityRole="button">
                <Text style={styles.signOutText}>Not you? Sign out</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <Text style={styles.title}>{isEditing ? 'Your answers' : 'All done. Nice one!'}</Text>
            <Text style={styles.subtitle}>
              {isEditing
                ? 'Tap an answer to change it.'
                : "Here's what you told us. Tap anything to change it."}
            </Text>

            <View style={styles.options}>
              {QUESTIONS.map((item, index) => (
                <Pressable
                  key={item.key}
                  onPress={() => setStep(index)}
                  style={({ pressed }) => [styles.reviewRow, pressed && styles.optionPressed]}
                  accessibilityRole="button"
                  accessibilityHint={`Change your answer for ${item.name}`}>
                  <Text style={styles.reviewName}>{item.name}</Text>
                  <Text style={styles.reviewValue}>{optionLabel(item, draft[item.key])}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.disclaimer}>
              General fitness guidance, not medical advice. Stop if anything hurts.
            </Text>

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={({ pressed }) => [styles.button, (pressed || isSaving) && styles.buttonPressed]}
              onPress={handleSave}
              disabled={isSaving}
              accessibilityRole="button">
              {isSaving ? (
                <ActivityIndicator color={colours.surface} />
              ) : (
                <Text style={styles.buttonText}>{isEditing ? 'Save changes' : "Let's go"}</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
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
  stepCount: {
    fontSize: 15,
    color: colours.textMuted,
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
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.surface,
  },
});
