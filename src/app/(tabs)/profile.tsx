import Constants from 'expo-constants';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { showDialog } from '@/components/Dialog';
import { useTabBarHeight } from '@/components/PillTabBar';
import { DestructiveTextButton, FreeBadge, ListRow, ProBadge, SegmentedThemePicker } from '@/components/ui';
import { useTheme, type ThemePreference } from '@/constants/theme';
import { DEFAULT_STREAK_GOAL, STREAK_GOALS, saveStreakGoal, type StreakGoal } from '@/lib/activityStats';
import { useAuth } from '@/lib/auth';
import { debugRestartBlock, ensureActiveBlock, missingBlocksMessage } from '@/lib/blocks';
import { useDevTools } from '@/lib/devFlags';
import { canOpenExportedFile, exportWorkoutHistory, openExportedFile } from '@/lib/export';
import { openPaywall } from '@/lib/paywall';
import { fetchProgramme, formatKg } from '@/lib/programmes';
import {
  CONFIDENCE_LABELS,
  EQUIPMENT_ACCESS_LABELS,
  EXPERIENCE_LABELS,
  FOCUS_AREA_LABELS,
  formatGoalsLabel,
  TRAINING_LOCATION_LABELS,
  formatDaysPerWeek,
  formatSessionMinutes,
  getQuizAnswers,
  saveThemePreference,
  useProfile,
} from '@/lib/profile';
import { formatShortDate } from '@/lib/progress';
import { currentEnrolmentWeek, fetchActiveEnrolment, type RoutineEnrolment } from '@/lib/routines';
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

function initials(name: string, email: string | undefined): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  if (parts[0]) return parts[0][0].toUpperCase();
  const local = email?.split('@')[0] ?? '';
  return local.slice(0, 2).toUpperCase() || '?';
}

export default function ProfileScreen() {
  const { colours, radius, type, preference, setPreference } = useTheme();
  const { session } = useAuth();
  const { profile, reload } = useProfile();
  const subscription = useSubscription();
  const { showDevTools, setShowDevTools } = useDevTools();
  const answers = getQuizAnswers(profile);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [enrolment, setEnrolment] = useState<RoutineEnrolment | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const tabBarHeight = useTabBarHeight();
  const email = session?.user.email ?? '';
  const displayName = answers?.display_name?.trim() || email.split('@')[0] || 'You';

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
      const next = programme ? await ensureActiveBlock(programme, 4, answers.equipment) : null;
      if (!next) {
        showDialog('Couldn’t reset', missingBlocksMessage());
        return;
      }
      showDialog('Block reset', 'Home will show week 1 of a new 8-week block.');
    } catch {
      showDialog('Couldn’t reset', missingBlocksMessage());
    }
  }

  async function handleSaveStreakGoal(goal: StreakGoal) {
    try {
      await saveStreakGoal(goal);
      reload();
    } catch (error) {
      showDialog(
        'Couldn’t save that goal',
        error instanceof Error ? error.message : 'Check your connection and try again.'
      );
    }
  }

  function handleThemeChange(value: ThemePreference) {
    setPreference(value);
    saveThemePreference(value).catch(() => {});
  }

  function handleVersionLongPress() {
    const next = !showDevTools;
    setShowDevTools(next);
    showDialog(
      next ? 'Tester tools are on' : 'Tester tools are off',
      next
        ? 'Developer rows are visible on this screen.'
        : 'This screen now matches a production build.'
    );
  }

  function requestEditStreakGoal() {
    showDialog(
      'Streak goal',
      'This is the finish line for your weekly streak. A week counts when you hit your target.',
      [
        ...STREAK_GOALS.map((goal) => ({
          text: `${goal} weeks`,
          onPress: () => void handleSaveStreakGoal(goal),
        })),
        { text: 'Not now', style: 'cancel' as const },
      ]
    );
  }

  const answerRows = answers
    ? [
        { name: 'Name', value: answers.display_name || 'Not added' },
        { name: 'Goals', value: formatGoalsLabel(answers.main_goals ?? [answers.goal]) },
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
      style={[styles.scroll, { backgroundColor: colours.bg }]}
      contentContainerStyle={[styles.container, { paddingBottom: tabBarHeight + 24 }]}>
      <Text style={[type.display, { color: colours.ink }]}>Profile</Text>

      <View style={styles.hero}>
        <View style={[styles.avatar, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
          <Text style={[styles.avatarLetters, { color: colours.brand }]}>
            {initials(displayName, email)}
          </Text>
        </View>
        <View style={styles.heroText}>
          <View style={styles.nameRow}>
            <Text style={[type.title, { color: colours.ink, flexShrink: 1 }]} numberOfLines={1}>
              {displayName}
            </Text>
            {subscription.isPro ? (
              <ProBadge compact />
            ) : (
              <FreeBadge style={{ backgroundColor: colours.brandSoft }} />
            )}
          </View>
          {email ? (
            <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: 4 }]} numberOfLines={1}>
              {email}
            </Text>
          ) : null}
        </View>
      </View>

      <SettingsGroup title="Plan and subscription">
        <SettingsRow
          title={subscription.isPro ? 'Manage subscription' : 'See Pro'}
          subtitle={describePlan(subscription)}
          right={subscription.isPro ? undefined : <ProBadge locked compact />}
          onPress={subscription.isPro ? handleManageSubscription : () => openPaywall('general')}
        />
        <SettingsRow
          title={enrolment ? enrolment.routine.name : 'Browse routines'}
          subtitle={
            enrolment
              ? `Week ${currentEnrolmentWeek(enrolment)} of ${enrolment.routine.length_weeks}`
              : 'Start a routine and Home will use it next.'
          }
          onPress={() => router.push('/programmes' as Href)}
        />
        <SettingsRow
          title="My workouts"
          subtitle="Start empty from Home, or reopen a saved session."
          onPress={() => router.push('/workouts' as Href)}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="Training">
        <SettingsRow
          title="Streak goal"
          subtitle={`${answers?.streak_goal_weeks ?? DEFAULT_STREAK_GOAL} weeks`}
          onPress={requestEditStreakGoal}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="Appearance">
        <View style={styles.appearance}>
          <Text style={[type.bodySm, { color: colours.inkMuted, marginBottom: 10 }]}>Theme</Text>
          <SegmentedThemePicker value={preference} onChange={handleThemeChange} />
        </View>
      </SettingsGroup>

      {answers ? (
        <SettingsGroup title="Your answers">
          <SettingsRow
            title={showAnswers ? 'Hide answers' : 'Your answers'}
            subtitle={showAnswers ? undefined : 'Name, goal, experience and more'}
            onPress={() => setShowAnswers((open) => !open)}
            last={!showAnswers}
          />
          {showAnswers
            ? answerRows.map((row) => (
                <SettingsRow key={row.name} title={row.name} subtitle={row.value} showChevron={false} />
              ))
            : null}
          {showAnswers ? (
            <SettingsRow
              title="Change answers"
              onPress={() => router.push('/onboarding')}
              last
            />
          ) : null}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="Data">
        <SettingsRow
          title={isExporting ? 'Preparing file…' : 'Export workout history'}
          subtitle="Every set from finished sessions, as a spreadsheet."
          onPress={() => {
            if (!isExporting) void handleExport();
          }}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="About">
        <SettingsRow
          title="Safety and disclaimer"
          onPress={() => router.push('/safety' as Href)}
          last
        />
      </SettingsGroup>

      <DestructiveTextButton
        label={isSigningOut ? 'Signing out…' : 'Sign out'}
        onPress={() => void handleSignOut()}
        disabled={isSigningOut}
        style={styles.signOut}
      />

      <Pressable
        onLongPress={handleVersionLongPress}
        delayLongPress={500}
        hitSlop={16}
        accessibilityRole="text"
        accessibilityLabel={`App version ${appVersion}`}
        style={styles.version}>
        <Text style={[type.caption, { color: colours.inkMuted, textAlign: 'center' }]}>
          Version {appVersion}
        </Text>
      </Pressable>

      {showDevTools ? (
        <SettingsGroup title="Developer">
          <SettingsRow
            title="Testing as"
            subtitle={DEV_OVERRIDE_LABELS[subscription.devOverride]}
            onPress={() => {
              const next =
                DEV_OVERRIDES[(DEV_OVERRIDES.indexOf(subscription.devOverride) + 1) % DEV_OVERRIDES.length];
              subscription.setDevOverride(next);
            }}
          />
          <SettingsRow title="Restart 8-week block" onPress={() => void handleDevRestartBlock()} last />
        </SettingsGroup>
      ) : null}
    </ScrollView>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const { colours, radius, shadow, type } = useTheme();
  return (
    <View style={styles.group}>
      <Text style={[type.eyebrow, { color: colours.inkMuted, marginBottom: 8, marginLeft: 4 }]}>{title}</Text>
      <View style={[{ borderRadius: radius.lg }, shadow]}>
        <View style={[styles.groupInner, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
          {children}
        </View>
      </View>
    </View>
  );
}

function SettingsRow({
  last = false,
  showChevron,
  style,
  ...props
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  last?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ListRow
      {...props}
      showChevron={showChevron ?? Boolean(props.onPress)}
      style={[last ? styles.rowLast : null, style]}
    />
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 20,
    paddingTop: 32,
    gap: 20,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 4,
  },
  avatar: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetters: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  group: {
    gap: 0,
  },
  groupInner: {
    overflow: 'hidden',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  appearance: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  signOut: {
    alignSelf: 'center',
    marginTop: 4,
  },
  version: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
