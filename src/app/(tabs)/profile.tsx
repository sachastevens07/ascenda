import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { showDialog } from '@/components/Dialog';
import { useTabBarHeight } from '@/components/PillTabBar';
import { colours } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { deleteAllCycleNotes } from '@/lib/cycle';
import { canOpenExportedFile, exportWorkoutHistory, openExportedFile } from '@/lib/export';
import {
  CONFIDENCE_LABELS,
  EQUIPMENT_ACCESS_LABELS,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  formatDaysPerWeek,
  getQuizAnswers,
  useProfile,
} from '@/lib/profile';
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
    return 'Logging, your history, the library, export and cycle notes are free. Pro adds your programme, weight suggestions, swaps and charts.';
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
  const { profile, setCycleTracking } = useProfile();
  const subscription = useSubscription();
  const answers = getQuizAnswers(profile);
  const cycleNotesOn = profile?.cycle_tracking_enabled ?? false;
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingCycle, setIsSavingCycle] = useState(false);
  const tabBarHeight = useTabBarHeight();

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
      const result = await exportWorkoutHistory(cycleNotesOn);
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

  async function changeCycleTracking(enabled: boolean, deleteNotes = false) {
    setIsSavingCycle(true);
    try {
      if (deleteNotes) await deleteAllCycleNotes();
      if (enabled !== cycleNotesOn) await setCycleTracking(enabled);
      if (deleteNotes) showDialog('Cycle notes deleted', 'Your workouts are all still here.');
    } catch {
      showDialog('That didn’t save', 'Check your connection and try again.');
    } finally {
      setIsSavingCycle(false);
    }
  }

  function confirmTurnOnCycleNotes() {
    showDialog(
      'Turn on cycle notes?',
      'Cycle notes are optional health information. Only you can see them, and we never share them. ' +
        'They’re only used to show you patterns in your own sessions: they don’t change your training ' +
        'and aren’t medical advice. You can turn them off or delete them at any time.',
      [
        { text: 'Turn on', onPress: () => changeCycleTracking(true) },
        { text: 'Not now', style: 'cancel' },
      ]
    );
  }

  function confirmTurnOffCycleNotes() {
    showDialog(
      'Turn off cycle notes?',
      'You can keep your notes (hidden until you turn this back on) or delete them now.',
      [
        { text: 'Keep my notes', onPress: () => changeCycleTracking(false) },
        { text: 'Delete my notes', style: 'destructive', onPress: () => changeCycleTracking(false, true) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  function confirmDeleteCycleNotes() {
    showDialog(
      'Delete all cycle notes?',
      'This removes the cycle phase from every session. Your workouts stay.',
      [
        { text: 'Delete', style: 'destructive', onPress: () => changeCycleTracking(true, true) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  const answerRows = answers
    ? [
        { name: 'Goal', value: GOAL_LABELS[answers.goal] },
        { name: 'Experience', value: EXPERIENCE_LABELS[answers.experience] },
        { name: 'Days per week', value: formatDaysPerWeek(answers.days_per_week) },
        { name: 'Where you train', value: EQUIPMENT_ACCESS_LABELS[answers.equipment] },
        { name: 'Gym confidence', value: `${answers.confidence}. ${CONFIDENCE_LABELS[answers.confidence]}` },
      ]
    : [];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: tabBarHeight + 24 }]}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.label}>Signed in as</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Your plan</Text>
        <Text style={styles.cardTitle}>{subscription.isPro ? 'Pro' : 'Free'}</Text>
        <Text style={styles.label}>{describePlan(subscription)}</Text>
        <Pressable
          style={({ pressed }) => [styles.button, styles.cardButton, pressed && styles.buttonPressed]}
          onPress={subscription.isPro ? handleManageSubscription : () => router.push('/paywall')}
          accessibilityRole="button">
          <Text style={styles.buttonText}>
            {subscription.isPro ? 'Manage subscription' : 'See Pro'}
          </Text>
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

      {profile?.programme && (
        <View style={styles.card}>
          <Text style={styles.label}>Your programme</Text>
          <Text style={styles.cardTitle}>{profile.programme.name}</Text>
          <Text style={styles.label}>
            {formatDaysPerWeek(profile.programme.days_per_week)} a week
          </Text>
          <Pressable
            style={({ pressed }) => [styles.button, styles.cardButton, pressed && styles.buttonPressed]}
            onPress={() => router.push(subscription.isPro ? '/programme' : '/paywall')}
            accessibilityRole="button">
            <Text style={styles.buttonText}>
              {subscription.isPro ? 'View programme' : 'View programme with Pro'}
            </Text>
          </Pressable>
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
        <Text style={styles.cardTitle}>Cycle notes</Text>
        <Text style={styles.label}>
          {cycleNotesOn
            ? 'On. Add a cycle phase to a session from the workout screen, and see your own patterns on Progress. Only you can see them.'
            : 'Optional and off. Tag sessions with where you are in your cycle and see patterns in your own training. Only you can see them.'}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.button, styles.cardButton, (pressed || isSavingCycle) && styles.buttonPressed]}
          onPress={cycleNotesOn ? confirmTurnOffCycleNotes : confirmTurnOnCycleNotes}
          disabled={isSavingCycle}
          accessibilityRole="button">
          <Text style={styles.buttonText}>
            {isSavingCycle ? 'Saving…' : cycleNotesOn ? 'Turn off cycle notes' : 'Turn on cycle notes'}
          </Text>
        </Pressable>
        {cycleNotesOn && (
          <Pressable
            style={styles.link}
            onPress={confirmDeleteCycleNotes}
            disabled={isSavingCycle}
            accessibilityRole="button">
            <Text style={styles.dangerLinkText}>Delete all cycle notes</Text>
          </Pressable>
        )}
      </View>

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
  buttonPressed: {
    opacity: 0.7,
  },
  link: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 4,
  },
  devText: {
    fontSize: 14,
    color: colours.textMuted,
    textAlign: 'center',
  },
  dangerLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.danger,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
});
