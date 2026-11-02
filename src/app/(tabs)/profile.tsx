import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { showDialog } from '@/components/Dialog';
import { useTabBarHeight } from '@/components/PillTabBar';
import { ProBadge, ProMark } from '@/components/ProBadge';
import { colours } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import {
  debugRestartBlock,
  describeBlockPosition,
  ensureActiveBlock,
  missingBlocksMessage,
  type TrainingBlock,
} from '@/lib/blocks';
import { canOpenExportedFile, exportWorkoutHistory, openExportedFile } from '@/lib/export';
import {
  CONFIDENCE_LABELS,
  EQUIPMENT_ACCESS_LABELS,
  EXPERIENCE_LABELS,
  FOCUS_AREA_LABELS,
  GOAL_LABELS,
  TRAINING_LOCATION_LABELS,
  formatDaysPerWeek,
  formatSessionMinutes,
  getQuizAnswers,
  useProfile,
} from '@/lib/profile';
import { fetchProgramme, formatKg } from '@/lib/programmes';
import { openPaywall } from '@/lib/paywall';
import { currentEnrolmentWeek, fetchActiveEnrolment, type RoutineEnrolment } from '@/lib/routines';
import { formatShortDate } from '@/lib/progress';
import {
  DEV_OVERRIDES,
  DEV_OVERRIDE_LABELS,
  STORE_NAME,
  openManageSubscription,
  useSubscription,
  type ProStatus,
} from '@/lib/subscription';
import { supabase } from '@/lib/supabase';

function describePlan({ isPro, trialEndsAt, expiresAt, willRenew }: ProStatus): string {
  if (!isPro) {
    return 'Logging, history, export, the library, two starter routines, the planner and your streak are free. Pro adds every routine, unlimited workouts, charts, a roadmap and private photos.';
  }
  if (trialEndsAt) {
    return willRenew
      ? `Free trial until ${formatShortDate(trialEndsAt)}. Then it becomes a paid plan unless you cancel.`
      : `Free trial until ${formatShortDate(trialEndsAt)}. It won’t renew.`;
  }
  if (!expiresAt) return 'Everything is unlocked.';
  return willRenew
    ? `Renews on ${formatShortDate(expiresAt)}.`
    : `Ends on ${formatShortDate(expiresAt)}. Logging and your history stay free.`;
}

export default function ProfileScreen() {
  const { session } = useAuth();
  const { profile } = useProfile();
  const subscription = useSubscription();
  const answers = getQuizAnswers(profile);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [block, setBlock] = useState<TrainingBlock | null>(null);
  const [enrolment, setEnrolment] = useState<RoutineEnrolment | null>(null);
  const tabBarHeight = useTabBarHeight();

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      fetchActiveEnrolment()
        .then((next) => {
          if (isCurrent) setEnrolment(next);
        })
        .catch(() => {
          if (isCurrent) setEnrolment(null);
        });
      return () => {
        isCurrent = false;
      };
    }, [])
  );

  useEffect(() => {
    if (!subscription.isPro || !profile?.programme_id || !answers) {
      setBlock(null);
      return;
    }
    let isCurrent = true;
    const programmeId = profile.programme_id;
    const equipment = answers.equipment;
    fetchProgramme(programmeId, equipment)
      .then((programme) => (programme ? ensureActiveBlock(programme, 4, equipment) : null))
      .then((next) => {
        if (isCurrent) setBlock(next);
      })
      .catch(() => {
        if (isCurrent) setBlock(null);
      });
    return () => {
      isCurrent = false;
    };
  }, [subscription.isPro, profile?.programme_id, answers?.equipment]);

  async function handleSignOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
  }

  function handleManageSubscription() {
    openManageSubscription(subscription.managementUrl).catch(() =>
      showDialog('Couldn’t open your subscription', `Open ${STORE_NAME} and go to Subscriptions.`)
    );
  }

  async function openFile(uri: string) {
    try {
      await openExportedFile(uri);
    } catch {
      showDialog(
        'No app to open it',
        'Install Google Sheets or Excel, or open the file from your Files app.'
      );
    }
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      const result = await exportWorkoutHistory();
      if (result.status === 'empty') {
        showDialog('Nothing to export yet', 'Finish a session and your sets will be ready to download.');
      } else if (result.status === 'saved') {
        const { fileName, setCount, uri } = result;
        showDialog(
          'Saved',
          `${fileName} (${setCount} sets) is in the folder you chose.`,
          canOpenExportedFile
            ? [
                { text: 'Open', onPress: () => openFile(uri) },
                { text: 'Done', style: 'cancel' },
              ]
            : [{ text: 'Done' }]
        );
      }
    } catch {
      showDialog('Couldn’t export', 'Check your connection and try again.');
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDevRestartBlock() {
    try {
      await debugRestartBlock();
      if (!profile?.programme_id || !answers) return;
      const programme = await fetchProgramme(profile.programme_id, answers.equipment);
      const next = programme
        ? await ensureActiveBlock(programme, 4, answers.equipment)
        : null;
      setBlock(next);
      if (!next) {
        showDialog('Couldn’t reset', missingBlocksMessage());
        return;
      }
      showDialog('Block reset', 'Home will show week 1 of a new 8-week block.');
    } catch {
      showDialog('Couldn’t reset', missingBlocksMessage());
    }
  }

  const answerRows = answers
    ? [
        { name: 'Name', value: answers.display_name || 'Not added' },
        { name: 'Goal', value: GOAL_LABELS[answers.goal] },
        { name: 'Experience', value: EXPERIENCE_LABELS[answers.experience] },
        { name: 'Where you train', value: TRAINING_LOCATION_LABELS[answers.training_location] },
        { name: 'Equipment', value: EQUIPMENT_ACCESS_LABELS[answers.equipment] },
        { name: 'Gym comfort', value: `${answers.confidence}. ${CONFIDENCE_LABELS[answers.confidence]}` },
        { name: 'Days per week', value: formatDaysPerWeek(answers.days_per_week) },
        { name: 'Session length', value: formatSessionMinutes(answers.session_minutes) },
        {
          name: 'Focus',
          value: answers.focus_areas.map((item) => FOCUS_AREA_LABELS[item]).join(', '),
        },
        { name: 'Streak goal', value: `${answers.streak_goal_weeks} weeks` },
        {
          name: 'Bodyweight (optional)',
          value: profile?.bodyweight_kg ? formatKg(profile.bodyweight_kg) : 'Not added',
        },
      ]
    : [];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: tabBarHeight + 24 }]}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.label}>Signed in as</Text>
      {answers?.display_name ? <Text style={styles.email}>{answers.display_name}</Text> : null}
      <Text style={styles.email}>{session?.user.email}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Your plan</Text>
        {subscription.isPro ? (
          <View style={styles.planTitleRow}>
            <Text style={[styles.cardTitle, styles.planTitle]}>Pro</Text>
            <ProBadge />
          </View>
        ) : (
          <Text style={styles.cardTitle}>Free</Text>
        )}
        <Text style={styles.label}>{describePlan(subscription)}</Text>
        <Pressable
          style={({ pressed }) => [styles.button, styles.cardButton, pressed && styles.buttonPressed]}
          onPress={subscription.isPro ? handleManageSubscription : () => openPaywall('general')}
          accessibilityRole="button">
          {subscription.isPro ? (
            <Text style={styles.buttonText}>Manage subscription</Text>
          ) : (
            <ProMark locked textStyle={styles.buttonText}>
              See Pro
            </ProMark>
          )}
        </Pressable>
        {__DEV__ && (
          <Pressable
            style={styles.link}
            onPress={() => {
              const next = DEV_OVERRIDES[(DEV_OVERRIDES.indexOf(subscription.devOverride) + 1) % DEV_OVERRIDES.length];
              subscription.setDevOverride(next);
            }}
            accessibilityRole="button">
            <Text style={styles.devText}>
              Development only. Testing as: {DEV_OVERRIDE_LABELS[subscription.devOverride]} (tap to change)
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Routines</Text>
        <Text style={styles.label}>
          {enrolment
            ? `${enrolment.routine.name} · week ${currentEnrolmentWeek(enrolment)} of ${enrolment.routine.length_weeks}`
            : 'Browse the six launch plans and start one. Home will use this next.'}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.button, styles.cardButton, pressed && styles.buttonPressed]}
          onPress={() => router.push('/programmes' as Href)}
          accessibilityRole="button">
          <Text style={styles.buttonText}>{enrolment ? 'View routines' : 'Open routines'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>My workouts</Text>
        <Text style={styles.label}>
          Start empty from Home, or reopen a saved session. Free for everyone.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.button, styles.cardButton, pressed && styles.buttonPressed]}
          onPress={() => router.push('/workouts' as Href)}
          accessibilityRole="button">
          <Text style={styles.buttonText}>Open My workouts</Text>
        </Pressable>
      </View>

      {profile?.programme && (
        <View style={styles.card}>
          <Text style={styles.label}>Your programme</Text>
          <Text style={styles.cardTitle}>{profile.programme.name}</Text>
          <Text style={styles.label}>
            {formatDaysPerWeek(profile.programme.days_per_week)} a week
          </Text>
          {subscription.isPro && block && (
            <Text style={styles.blockPosition}>{describeBlockPosition(block)}</Text>
          )}
          <Pressable
            style={({ pressed }) => [styles.button, styles.cardButton, pressed && styles.buttonPressed]}
            onPress={() => {
              if (subscription.isPro) router.push('/programme');
              else openPaywall('general');
            }}
            accessibilityRole="button">
            {subscription.isPro ? (
              <Text style={styles.buttonText}>View programme</Text>
            ) : (
              <ProMark locked textStyle={styles.buttonText}>
                View programme with Pro
              </ProMark>
            )}
          </Pressable>
          {__DEV__ && (
            <Pressable style={styles.devLink} onPress={handleDevRestartBlock} accessibilityRole="button">
              <Text style={styles.devText}>Development only. Restart 8-week block</Text>
            </Pressable>
          )}
        </View>
      )}

      {answers && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your answers</Text>
          {answerRows.map((row) => (
            <View key={row.name} style={styles.row}>
              <Text style={styles.label}>{row.name}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
          <Pressable
            style={({ pressed }) => [styles.button, styles.cardButton, pressed && styles.buttonPressed]}
            onPress={() => router.push('/onboarding')}
            accessibilityRole="button">
            <Text style={styles.buttonText}>Change answers</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your data</Text>
        <Text style={styles.label}>
          Save every set from your finished sessions as a spreadsheet (Excel file) in a folder you choose,
          such as Documents. It’s yours to keep.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.button, styles.cardButton, (pressed || isExporting) && styles.buttonPressed]}
          onPress={handleExport}
          disabled={isExporting}
          accessibilityRole="button">
          <Text style={styles.buttonText}>{isExporting ? 'Preparing file…' : 'Export workout history'}</Text>
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.button, (pressed || isSigningOut) && styles.buttonPressed]}
        onPress={handleSignOut}
        disabled={isSigningOut}
        accessibilityRole="button">
        <Text style={styles.buttonText}>{isSigningOut ? 'Signing out…' : 'Sign out'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colours.background,
  },
  container: {
    padding: 24,
    paddingTop: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    color: colours.textMuted,
  },
  email: {
    fontSize: 18,
    fontWeight: '600',
    color: colours.text,
    marginTop: 4,
    marginBottom: 32,
  },
  card: {
    padding: 20,
    borderRadius: 18,
    backgroundColor: colours.surface,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 8,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  planTitle: {
    marginBottom: 0,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colours.border,
  },
  rowValue: {
    fontSize: 17,
    fontWeight: '600',
    color: colours.text,
    marginTop: 2,
  },
  button: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  cardButton: {
    marginTop: 20,
  },
  blockPosition: {
    fontSize: 15,
    fontWeight: '600',
    color: colours.accent,
    marginTop: 6,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  link: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 4,
  },
  levelOption: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colours.border,
    backgroundColor: colours.background,
  },
  levelOptionSelected: {
    borderColor: colours.accent,
    backgroundColor: colours.accentSoft,
  },
  currentLevel: {
    fontSize: 13,
    fontWeight: '700',
    color: colours.accent,
    marginBottom: 4,
  },
  levelLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: colours.text,
    marginBottom: 4,
  },
  levelLabelSelected: {
    color: colours.accent,
  },
  devLink: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  devText: {
    fontSize: 14,
    color: colours.textMuted,
    textAlign: 'center',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
});
