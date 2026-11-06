import Constants from 'expo-constants';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import {
  AppText,
  DestructiveTextButton,
  GoalChipGroup,
  IconButton,
  ListRow,
  MenuHeader,
  MenuRow,
  OverflowMenu,
  PrimaryButton,
  SegmentedThemePicker,
  measureAnchor,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme, type ThemePreference } from '@/constants/theme';
import {
  appearanceSectionTitle,
  fillCopy,
  privacySettingsCopy,
  lockedHomeCopy,
  paywallScreenCopy,
  planSettingsTitle,
  reminderCopy,
  restoreCopy,
  safetySettingsTitle,
  subscriptionStatusCopy,
} from '@/lib/copy';
import { DEFAULT_STREAK_GOAL, STREAK_GOALS, saveStreakGoal, type StreakGoal } from '@/lib/activityStats';
import {
  DEFAULT_REMINDER_TIME,
  REMINDER_HOURS,
  fetchLastSessionReminderTime,
  fetchReminderPrefs,
  formatReminderClock,
  hourToReminderTime,
  notificationsAvailable,
  scheduleTestSessionReminder,
  setDefaultReminderTime,
  setMarketingOptIn,
  setSessionRemindersEnabled,
  setWeeklySummaryEnabled,
  type ReminderPrefs,
} from '@/lib/reminders';
import { fetchHideAchievements, saveHideAchievements } from '@/lib/achievements';
import { confirmEnablePhotos, fetchPhotosEnabled, savePhotosEnabled } from '@/lib/progressPhotos';
import { isAnalyticsEnabled, track } from '@/lib/analytics';
import { countOwnedCustomWorkouts } from '@/lib/customWorkouts';
import { CONTACT_EMAIL, openContactEmail } from '@/lib/legal';
import { fetchHideQuote, saveHideQuote } from '@/lib/quotes';
import {
  REST_TIMER_DEFAULTS,
  fetchDefaultRestSeconds,
  formatRestTimerDefault,
  saveDefaultRestSeconds,
  type RestTimerDefault,
} from '@/lib/restTimer';
import { fetchHideStreak, saveHideStreak } from '@/lib/streak';
import {
  WEIGHT_UNITS,
  fetchWeightUnit,
  formatUnitName,
  saveWeightUnit,
  useWeightUnit,
  type WeightUnit,
} from '@/lib/units';
import { fetchHandOffPreview, saveHandOffPreview } from '@/lib/handOff';
import { clearOnboardingPaywall } from '@/lib/onboarding';
import { fetchWelcomeBackPreview, saveWelcomeBackPreview } from '@/lib/welcomeBack';
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
  GOAL_HELPER,
  formatGoalsLabel,
  GYM_EXPERIENCE_LABELS,
  formatDaysPerWeek,
  formatSessionMinutes,
  getQuizAnswers,
  saveThemePreference,
  useProfile,
  type Goal,
} from '@/lib/profile';
import { formatShortDate } from '@/lib/progress';
import { currentEnrolmentWeek, fetchActiveEnrolment, type RoutineEnrolment } from '@/lib/routines';
import {
  DEV_OVERRIDES,
  DEV_OVERRIDE_LABELS,
  STORE_NAME,
  hasProEntitlement,
  openManageSubscription,
  restorePurchases,
  scheduleTestBillingReminder,
  useSubscription,
  type ProStatus,
} from '@/lib/subscription';
import { supabase } from '@/lib/supabase';

function planChip({ status, trialEndsAt, expiresAt, willRenew }: ProStatus): string {
  const date = trialEndsAt ?? expiresAt;
  const formatted = date ? formatShortDate(date) : '';
  switch (status) {
    case 'trial':
      return fillCopy(subscriptionStatusCopy.chip_trial, { date: formatted });
    case 'active':
      if (!formatted) return 'Active';
      return fillCopy(
        willRenew ? subscriptionStatusCopy.chip_active : subscriptionStatusCopy.chip_active_cancelled,
        { date: formatted }
      );
    case 'grace':
      return subscriptionStatusCopy.chip_grace;
    case 'expired':
      return subscriptionStatusCopy.chip_expired;
    default:
      return 'No subscription';
  }
}

function initials(name: string, email: string | undefined): string {
  if (name && name !== 'You') {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
    if (parts[0]) return parts[0][0].toUpperCase();
  }
  const local = email?.split('@')[0] ?? '';
  return local.slice(0, 2).toUpperCase() || '?';
}

function savedWorkoutsLabel(count: number): string {
  return `${count} saved`;
}

export default function ProfileScreen() {
  const { colours, radius, preference, setPreference } = useTheme();
  const { session } = useAuth();
  const { profile, reload, deleteAccount, saveMainGoals, restartOnboarding } = useProfile();
  const subscription = useSubscription();
  const { showDevTools, setShowDevTools } = useDevTools();
  const answers = getQuizAnswers(profile);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const weightUnit = useWeightUnit();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [enrolment, setEnrolment] = useState<RoutineEnrolment | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [goalDraft, setGoalDraft] = useState<Goal[]>([]);
  const [isSavingGoals, setIsSavingGoals] = useState(false);
  const [hideStreak, setHideStreak] = useState(false);
  const [hideAchievements, setHideAchievements] = useState(false);
  const [hideQuote, setHideQuote] = useState(false);
  const [photosEnabled, setPhotosEnabled] = useState(false);
  const [welcomeBackPreview, setWelcomeBackPreview] = useState(false);
  const [handOffPreview, setHandOffPreview] = useState(false);
  const [reminderPrefs, setReminderPrefs] = useState<ReminderPrefs | null>(null);
  const [lastSessionTime, setLastSessionTime] = useState<string | null>(null);
  const [timeMenu, setTimeMenu] = useState(false);
  const [timeAnchor, setTimeAnchor] = useState<AnchorRect | null>(null);
  const [savedWorkoutCount, setSavedWorkoutCount] = useState(0);
  const [restDefault, setRestDefault] = useState<RestTimerDefault>(90);
  const timeRowRef = useRef<AnchorHandle>(null);
  const insets = useSafeAreaInsets();
  const email = session?.user.email ?? '';
  const displayName = answers?.display_name?.trim() || 'You';

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
      fetchHideStreak()
        .then((hidden) => {
          if (isCurrent) setHideStreak(hidden);
        })
        .catch(() => {});
      fetchHideAchievements()
        .then((hidden) => {
          if (isCurrent) setHideAchievements(hidden);
        })
        .catch(() => {});
      fetchHideQuote()
        .then((hidden) => {
          if (isCurrent) setHideQuote(hidden);
        })
        .catch(() => {});
      fetchPhotosEnabled()
        .then((on) => {
          if (isCurrent) setPhotosEnabled(on);
        })
        .catch(() => {});
      fetchWelcomeBackPreview()
        .then((on) => {
          if (isCurrent) setWelcomeBackPreview(on);
        })
        .catch(() => {});
      fetchHandOffPreview()
        .then((on) => {
          if (isCurrent) setHandOffPreview(on);
        })
        .catch(() => {});
      fetchReminderPrefs()
        .then((prefs) => {
          if (isCurrent) setReminderPrefs(prefs);
        })
        .catch(() => {});
      fetchLastSessionReminderTime()
        .then((time) => {
          if (isCurrent) setLastSessionTime(time);
        })
        .catch(() => {});
      fetchWeightUnit()
        .then(() => {})
        .catch(() => {});
      fetchDefaultRestSeconds()
        .then((seconds) => {
          if (isCurrent) setRestDefault(seconds);
        })
        .catch(() => {});
      countOwnedCustomWorkouts()
        .then((count) => {
          if (isCurrent) setSavedWorkoutCount(count);
        })
        .catch(() => {
          if (isCurrent) setSavedWorkoutCount(0);
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

  async function handleRestorePurchases() {
    try {
      const info = await restorePurchases();
      subscription.applyCustomerInfo(info);
      showDialog(
        restoreCopy.restore,
        hasProEntitlement(info) ? restoreCopy.success : restoreCopy.none
      );
    } catch {
      showDialog(restoreCopy.restore, restoreCopy.error);
    }
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

  async function handleDevRestartOnboarding() {
    try {
      await restartOnboarding();
      await clearOnboardingPaywall();
      router.replace('/onboarding' as Href);
    } catch (error) {
      showDialog(
        'Couldn’t restart onboarding',
        error instanceof Error ? error.message : 'Check your connection and try again.'
      );
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

  async function toggleSessionReminders() {
    if (!reminderPrefs) return;
    const next = !reminderPrefs.sessionReminders;
    setReminderPrefs({ ...reminderPrefs, sessionReminders: next });
    const ok = await setSessionRemindersEnabled(next).catch(() => false);
    const latest = await fetchReminderPrefs().catch(() => null);
    if (latest) setReminderPrefs(latest);
    else if (!ok) setReminderPrefs({ ...reminderPrefs, sessionReminders: false });
  }

  async function toggleWeeklySummary() {
    if (!reminderPrefs) return;
    const next = !reminderPrefs.weeklySummary;
    setReminderPrefs({ ...reminderPrefs, weeklySummary: next });
    const ok = await setWeeklySummaryEnabled(next).catch(() => false);
    const latest = await fetchReminderPrefs().catch(() => null);
    if (latest) setReminderPrefs(latest);
    else if (!ok) setReminderPrefs({ ...reminderPrefs, weeklySummary: false });
  }

  async function toggleMarketing() {
    if (!reminderPrefs) return;
    const next = !reminderPrefs.marketingOptIn;
    setReminderPrefs({ ...reminderPrefs, marketingOptIn: next });
    try {
      await setMarketingOptIn(next);
    } catch (error) {
      setReminderPrefs({ ...reminderPrefs, marketingOptIn: !next });
      showDialog(
        'Couldn’t save that',
        error instanceof Error ? error.message : 'Check your connection and try again.'
      );
    }
  }

  function openDefaultTimeMenu() {
    measureAnchor(timeRowRef.current, (rect) => {
      setTimeAnchor(rect);
      setTimeMenu(true);
    });
  }

  async function pickDefaultTime(time: string) {
    setTimeMenu(false);
    if (!reminderPrefs) return;
    setReminderPrefs({ ...reminderPrefs, defaultTime: time });
    try {
      await setDefaultReminderTime(time);
      const latest = await fetchReminderPrefs();
      setReminderPrefs(latest);
    } catch (error) {
      showDialog(
        'Couldn’t save that time',
        error instanceof Error ? error.message : 'Check your connection and try again.'
      );
    }
  }

  const defaultTime = reminderPrefs?.defaultTime ?? DEFAULT_REMINDER_TIME;
  const defaultTimeChoices = REMINDER_HOURS.map((hour) => hourToReminderTime(hour));

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
      'This is a finish line to aim for, not a test. A week counts when you train at least once. Hitting your plan makes it a gold week.',
      [
        ...STREAK_GOALS.map((goal) => ({
          text: `${goal} weeks`,
          onPress: () => void handleSaveStreakGoal(goal),
        })),
        { text: 'Not now', style: 'cancel' as const },
      ]
    );
  }

  function requestEditUnits() {
    showDialog(
      'Units',
      'Weights are stored in kilograms. This only changes how they look on screen.',
      [
        ...WEIGHT_UNITS.map((unit) => ({
          text: formatUnitName(unit),
          onPress: () => void handleSaveUnits(unit),
        })),
        { text: 'Not now', style: 'cancel' as const },
      ]
    );
  }

  async function handleSaveUnits(unit: WeightUnit) {
    try {
      await saveWeightUnit(unit);
    } catch (error) {
      showDialog(
        'Couldn’t save that',
        error instanceof Error ? error.message : 'Check your connection and try again.'
      );
    }
  }

  function requestEditRestTimer() {
    showDialog(
      'Rest timer default',
      'Used when a set does not have its own rest time, such as a custom workout.',
      [
        ...REST_TIMER_DEFAULTS.map((seconds) => ({
          text: formatRestTimerDefault(seconds),
          onPress: () => void handleSaveRestDefault(seconds),
        })),
        { text: 'Not now', style: 'cancel' as const },
      ]
    );
  }

  async function handleSaveRestDefault(seconds: RestTimerDefault) {
    setRestDefault(seconds);
    try {
      await saveDefaultRestSeconds(seconds);
    } catch (error) {
      showDialog(
        'Couldn’t save that',
        error instanceof Error ? error.message : 'Check your connection and try again.'
      );
    }
  }

  function requestDeleteAccount() {
    showDialog(
      'Delete your account?',
      'This removes your account and the data stored with it, including sessions, photos and saved workouts. You can create a new account later if you want.',
      [
        { text: 'Delete account', style: 'destructive', onPress: () => void handleDeleteAccount() },
        { text: 'Keep account', style: 'cancel' },
      ]
    );
  }

  async function handleDeleteAccount() {
    setIsDeleting(true);
    try {
      await deleteAccount();
    } catch (error) {
      setIsDeleting(false);
      showDialog(
        'Couldn’t delete your account',
        error instanceof Error ? error.message : 'Check your connection and try again.'
      );
    }
  }

  async function handleContact() {
    const opened = await openContactEmail().catch(() => false);
    if (!opened) {
      showDialog('Couldn’t open email', `Write to ${CONTACT_EMAIL} from your mail app.`);
    }
  }

  const answerRows = answers
    ? [
        { name: 'Name', value: answers.display_name || 'Not added' },
        { name: 'Experience', value: EXPERIENCE_LABELS[answers.experience] },
        { name: 'Gym experience', value: GYM_EXPERIENCE_LABELS[answers.gym_experience] },
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
    <View style={[styles.scroll, { backgroundColor: colours.bg }]}>
    <ScrollView
      style={[styles.scroll, { backgroundColor: colours.bg }]}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
      ]}>
      <View style={styles.top}>
        <IconButton
          icon="chevron-back"
          variant="muted"
          accessibilityLabel="Back"
          onPress={() => router.back()}
        />
        <AppText variant="title1" style={{ color: colours.ink, flex: 1 }}>Profile</AppText>
      </View>

      <View style={styles.hero}>
        <View style={[styles.avatar, { backgroundColor: colours.brandSoft, borderRadius: radius.full }]}>
          <AppText variant="title2" style={{ color: colours.brand, letterSpacing: 0.4 }}>
            {initials(displayName, email)}
          </AppText>
        </View>
        <View style={styles.heroText}>
          <View style={styles.nameRow}>
            <AppText variant="title2" style={{ color: colours.ink, flexShrink: 1 }} numberOfLines={1}>
              {displayName}
            </AppText>
          </View>
          {email ? (
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }} numberOfLines={1}>
              {email}
            </AppText>
          ) : null}
        </View>
      </View>

      <SettingsGroup title={planSettingsTitle}>
        <SettingsRow title={planChip(subscription)} />
        {subscription.isPro || subscription.status === 'expired' ? (
          <SettingsRow
            title={subscriptionStatusCopy.manage}
            subtitle={subscriptionStatusCopy.manage_help}
            onPress={handleManageSubscription}
          />
        ) : null}
        {!subscription.isPro ? (
          <SettingsRow
            title={
              subscription.status === 'expired'
                ? lockedHomeCopy.lapsed.cta
                : paywallScreenCopy.cta_trial
            }
            onPress={() => openPaywall('onboarding')}
          />
        ) : null}
        <SettingsRow title={subscriptionStatusCopy.restore} onPress={() => void handleRestorePurchases()} />
        <SettingsRow
          title={subscriptionStatusCopy.how_to_cancel_title}
          onPress={() =>
            showDialog(subscriptionStatusCopy.how_to_cancel_title, subscriptionStatusCopy.how_to_cancel_body, [
              { text: subscriptionStatusCopy.manage, onPress: handleManageSubscription },
              { text: 'Close', style: 'cancel' },
            ])
          }
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
          subtitle={savedWorkoutsLabel(savedWorkoutCount)}
          onPress={() => router.push('/workouts' as Href)}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="Training">
        <SettingsRow
          title="Streak goal"
          subtitle={`${answers?.streak_goal_weeks ?? DEFAULT_STREAK_GOAL} weeks`}
          onPress={requestEditStreakGoal}
        />
        <SettingsRow title="Units" subtitle={formatUnitName(weightUnit)} onPress={requestEditUnits} />
        <SettingsRow
          title="Rest timer default"
          subtitle={formatRestTimerDefault(restDefault)}
          onPress={requestEditRestTimer}
        />
        <SettingsRow
          title="Show streak"
          subtitle={hideStreak ? 'Hidden on Home and Activity' : 'Shown on Home and Activity'}
          onPress={() => {
            const next = !hideStreak;
            setHideStreak(next);
            saveHideStreak(next).catch((error) => {
              setHideStreak(!next);
              showDialog(
                'Couldn’t save that',
                error instanceof Error ? error.message : 'Check your connection and try again.'
              );
            });
          }}
        />
        <SettingsRow
          title={privacySettingsCopy.hide_achievements}
          subtitle={hideAchievements ? 'Hidden on Activity' : 'Shown on Activity'}
          onPress={() => {
            const next = !hideAchievements;
            setHideAchievements(next);
            saveHideAchievements(next).catch((error) => {
              setHideAchievements(!next);
              showDialog(
                'Couldn’t save that',
                error instanceof Error ? error.message : 'Check your connection and try again.'
              );
            });
          }}
          last
        />
      </SettingsGroup>

      <SettingsGroup title={appearanceSectionTitle}>
        <View style={styles.appearance}>
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginBottom: 10 }}>Theme</AppText>
          <SegmentedThemePicker value={preference} onChange={handleThemeChange} />
        </View>
        <SettingsRow
          title="Show daily quote"
          subtitle={hideQuote ? 'Hidden on Home' : 'Shown on Home'}
          onPress={() => {
            const next = !hideQuote;
            setHideQuote(next);
            saveHideQuote(next).catch((error) => {
              setHideQuote(!next);
              showDialog(
                'Couldn’t save that',
                error instanceof Error ? error.message : 'Check your connection and try again.'
              );
            });
          }}
          last
        />
      </SettingsGroup>

      {reminderPrefs ? (
        <SettingsGroup title={reminderCopy.settings.title}>
          <SettingsRow
            title={reminderCopy.settings.session_reminders}
            subtitle={
              !notificationsAvailable()
                ? reminderCopy.settings.system_off
                : reminderPrefs.sessionReminders
                  ? reminderCopy.settings.session_reminders_help
                  : 'Off'
            }
            onPress={() => void toggleSessionReminders()}
          />
          <SettingsRow
            title={reminderCopy.settings.weekly_summary}
            subtitle={reminderPrefs.weeklySummary ? 'On' : 'Off'}
            onPress={() => void toggleWeeklySummary()}
          />
          <SettingsRow
            title={reminderCopy.settings.offers}
            subtitle={
              reminderPrefs.marketingOptIn
                ? `On. ${reminderCopy.settings.offers_help}`
                : reminderCopy.settings.offers_help
            }
            onPress={() => void toggleMarketing()}
          />
          <View ref={timeRowRef} collapsable={false}>
            <SettingsRow
              title={reminderCopy.settings.default_time}
              subtitle={formatReminderClock(defaultTime)}
              onPress={openDefaultTimeMenu}
              last
            />
          </View>
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="Privacy">
        <SettingsRow
          title="Progress photos"
          subtitle={
            photosEnabled
              ? 'On. Turning this off hides the card. Photos stay until you delete them.'
              : 'Off. Switch on here if you want a private photo card on Activity.'
          }
          onPress={() => {
            if (photosEnabled) {
              setPhotosEnabled(false);
              savePhotosEnabled(false).catch((error) => {
                setPhotosEnabled(true);
                showDialog(
                  'Couldn’t save that',
                  error instanceof Error ? error.message : 'Check your connection and try again.'
                );
              });
              return;
            }
            confirmEnablePhotos(() => {
              setPhotosEnabled(true);
              savePhotosEnabled(true).catch((error) => {
                setPhotosEnabled(false);
                showDialog(
                  'Couldn’t save that',
                  error instanceof Error ? error.message : 'Check your connection and try again.'
                );
              });
            });
          }}
        />
        <SettingsRow
          title={isExporting ? 'Preparing file…' : 'Export workout history'}
          subtitle="Every set from finished sessions, as a spreadsheet."
          onPress={() => {
            if (!isExporting) void handleExport();
          }}
        />
        <SettingsRow
          title={isDeleting ? 'Deleting account…' : 'Delete account'}
          subtitle="Removes your account and the data stored with it."
          onPress={() => {
            if (!isDeleting) requestDeleteAccount();
          }}
          last
        />
      </SettingsGroup>

      {answers ? (
        <SettingsGroup title="Your answers">
          <SettingsRow
            title={showAnswers ? 'Hide answers' : 'Your answers'}
            subtitle={showAnswers ? undefined : 'Name, goals, experience and more'}
            onPress={() => {
              setShowAnswers((open) => {
                if (!open && answers) setGoalDraft(answers.main_goals);
                return !open;
              });
            }}
            last={!showAnswers}
          />
          {showAnswers ? (
            <View style={styles.goalsBlock}>
              <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                Goals
              </AppText>
              <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }}>
                {GOAL_HELPER}
              </AppText>
              <GoalChipGroup selected={goalDraft} onChange={setGoalDraft} />
              {goalDraft.length === 0 ? (
                <AppText variant="bodySm" style={{ color: colours.danger, marginTop: 8 }}>
                  Pick at least one goal.
                </AppText>
              ) : null}
              {formatGoalsLabel(goalDraft) !== formatGoalsLabel(answers.main_goals) ? (
                <PrimaryButton
                  label={isSavingGoals ? 'Saving…' : 'Save goals'}
                  loading={isSavingGoals}
                  disabled={isSavingGoals || goalDraft.length === 0}
                  onPress={() => {
                    setIsSavingGoals(true);
                    void saveMainGoals(goalDraft)
                      .catch((error) => {
                        showDialog(
                          'Couldn’t save your goals',
                          error instanceof Error ? error.message : 'Check your connection and try again.'
                        );
                      })
                      .finally(() => setIsSavingGoals(false));
                  }}
                  style={{ marginTop: 16 }}
                />
              ) : null}
            </View>
          ) : null}
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

      <SettingsGroup title="About">
        <SettingsRow
          title={safetySettingsTitle}
          onPress={() => router.push('/safety' as Href)}
        />
        <SettingsRow title="Terms" onPress={() => router.push('/terms' as Href)} />
        <SettingsRow title="Privacy policy" onPress={() => router.push('/privacy' as Href)} />
        <SettingsRow title="Contact us" subtitle={CONTACT_EMAIL} onPress={() => void handleContact()} />
        <SettingsRow title="App version" subtitle={appVersion} showChevron={false} last />
      </SettingsGroup>

      <DestructiveTextButton
        label={isSigningOut ? 'Signing out…' : 'Sign out'}
        onPress={() => void handleSignOut()}
        disabled={isSigningOut || isDeleting}
        style={styles.signOut}
      />

      <Pressable
        onLongPress={handleVersionLongPress}
        delayLongPress={500}
        hitSlop={16}
        accessibilityRole="text"
        accessibilityLabel={`App version ${appVersion}`}
        style={styles.version}>
        <AppText variant="caption" style={{ color: colours.inkMuted, textAlign: 'center' }}>
          Version {appVersion}
        </AppText>
      </Pressable>

      {showDevTools ? (
        <SettingsGroup title="Developer">
          <SettingsRow
            title="Testing as"
            subtitle={`${DEV_OVERRIDE_LABELS[subscription.devOverride]} · ${
              subscription.isPro ? 'can train' : 'sessions locked'
            }`}
            onPress={() => {
              const next =
                DEV_OVERRIDES[(DEV_OVERRIDES.indexOf(subscription.devOverride) + 1) % DEV_OVERRIDES.length];
              subscription.setDevOverride(next);
            }}
          />
          <SettingsRow
            title="Preview welcome-back"
            subtitle={welcomeBackPreview ? 'On. Home shows the welcome-back card.' : 'Off'}
            onPress={() => {
              const next = !welcomeBackPreview;
              setWelcomeBackPreview(next);
              saveWelcomeBackPreview(next).catch(() => setWelcomeBackPreview(!next));
            }}
          />
          <SettingsRow
            title="Preview what’s next"
            subtitle={handOffPreview ? 'On. Home and your current routine show the next-plan card.' : 'Off'}
            onPress={() => {
              const next = !handOffPreview;
              setHandOffPreview(next);
              saveHandOffPreview(next).catch(() => setHandOffPreview(!next));
            }}
          />
          <SettingsRow
            title="Send a test reminder"
            subtitle="A sample in about 8 seconds"
            onPress={() => {
              void scheduleTestSessionReminder().then((ok) => {
                if (ok) {
                  showDialog('Test reminder set', 'Lock the phone or leave the app. You should see it in about 8 seconds.');
                }
              });
            }}
          />
          <SettingsRow
            title="Send a test trial-ending reminder"
            subtitle="Microcopy, in about 8 seconds. Needs notification permission."
            onPress={() => {
              void scheduleTestBillingReminder('trial', subscription.priceString).then((ok) => {
                if (ok) {
                  showDialog('Test reminder set', 'Lock the phone or leave the app. You should see it in about 8 seconds.');
                } else {
                  showDialog(
                    'Couldn’t set that reminder',
                    'Reminders need a development build, and notification permission on this phone.'
                  );
                }
              });
            }}
          />
          <SettingsRow
            title="Send a test renewal reminder"
            subtitle="Annual renews-soon copy, in about 8 seconds."
            onPress={() => {
              void scheduleTestBillingReminder('renewal', subscription.priceString).then((ok) => {
                if (ok) {
                  showDialog('Test reminder set', 'Lock the phone or leave the app. You should see it in about 8 seconds.');
                } else {
                  showDialog(
                    'Couldn’t set that reminder',
                    'Reminders need a development build, and notification permission on this phone.'
                  );
                }
              });
            }}
          />
          <SettingsRow
            title="Send a test analytics event"
            subtitle={isAnalyticsEnabled() ? 'Shows in PostHog live events' : 'No PostHog key in .env'}
            onPress={() => {
              if (!isAnalyticsEnabled()) {
                showDialog(
                  'PostHog is not set up',
                  'Add EXPO_PUBLIC_POSTHOG_API_KEY to .env, then restart Expo. The app still works without it.'
                );
                return;
              }
              track('dev_test_event');
              showDialog(
                'Test event sent',
                'Open PostHog, go to Activity, and look for dev_test_event. It can take a few seconds.'
              );
            }}
          />
          <SettingsRow
            title="Restart onboarding"
            subtitle="Run the quiz again on this account"
            onPress={() =>
              showDialog(
                'Restart onboarding?',
                'You will go through the questions, plan reveal and paywall again. Your logged sessions stay.',
                [
                  { text: 'Restart', style: 'destructive', onPress: () => void handleDevRestartOnboarding() },
                  { text: 'Not now', style: 'cancel' },
                ]
              )
            }
          />
          <SettingsRow title="Restart 8-week block" onPress={() => void handleDevRestartBlock()} last />
        </SettingsGroup>
      ) : null}
    </ScrollView>
    <OverflowMenu visible={timeMenu} anchor={timeAnchor} onClose={() => setTimeMenu(false)}>
      <MenuHeader label="Default reminder time" detail="Used on planned days unless you pick a different time." />
      {lastSessionTime ? (
        <MenuRow
          label={`Last session · ${formatReminderClock(lastSessionTime)}`}
          selected={defaultTime === lastSessionTime}
          onPress={() => void pickDefaultTime(lastSessionTime)}
        />
      ) : null}
      {defaultTimeChoices
        .filter((time) => time !== lastSessionTime)
        .map((time) => (
          <MenuRow
            key={time}
            label={formatReminderClock(time)}
            selected={defaultTime === time}
            onPress={() => void pickDefaultTime(time)}
          />
        ))}
    </OverflowMenu>
    </View>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const { colours, radius, shadow } = useTheme();
  return (
    <View style={styles.group}>
      <AppText variant="eyebrow" style={{ color: colours.inkMuted, marginBottom: 8, marginLeft: 4 }}>{title}</AppText>
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
    gap: 20,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  goalsBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
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
