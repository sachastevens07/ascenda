import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { showDialog } from '@/components/Dialog';
import {
  addDays,
  loadPlannerRange,
  parseIsoDate,
  toIso,
  updatePlannerReminderTime,
  type PlannerDayView,
} from '@/lib/planner';
import { Notifications } from '@/lib/restTimer';
import { fetchLastFinishedSession } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export const DEFAULT_REMINDER_TIME = '18:00';
export const WEEKLY_SUMMARY_HOUR = 10;
export const REMINDER_HOURS = [6, 7, 8, 9, 12, 15, 17, 18, 19, 20, 21] as const;

const PREFS_KEY = 'reminder_prefs';
const ASKED_KEY = 'reminder_prompt_seen';
const TIMES_KEY = 'planner_reminder_times';
const CHANNEL_ID = 'session-reminders';
const SESSION_PREFIX = 'planner-session:';
const WEEKLY_PREFIX = 'planner-weekly:';
const TEST_ID = 'dev-session-reminder-test';
const HORIZON_DAYS = 14;
const SUNDAYS_AHEAD = 2;

const PROFILE_COLUMNS =
  'session_reminders, weekly_summary, marketing_opt_in, default_reminder_time';

export type ReminderPrefs = {
  sessionReminders: boolean;
  weeklySummary: boolean;
  marketingOptIn: boolean;
  defaultTime: string;
  times: Record<string, string>;
};

type StoredPrefs = {
  sessionReminders?: boolean;
  weeklySummary?: boolean;
  marketingOptIn?: boolean;
  defaultTime?: string;
};

function isMissingReminderSql(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`;
  return /session_reminders|weekly_summary|marketing_opt_in|default_reminder_time/i.test(detail);
}

export function parseReminderTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function hourToReminderTime(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function formatReminderClock(time: string): string {
  const parsed = parseReminderTime(time) ?? DEFAULT_REMINDER_TIME;
  const [hours, minutes] = parsed.split(':').map(Number);
  const suffix = hours >= 12 ? 'pm' : 'am';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function notificationsAvailable(): boolean {
  return Notifications !== null;
}

async function readLocalPrefs(): Promise<StoredPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredPrefs;
  } catch {
    return {};
  }
}

async function readLocalTimes(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(TIMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const times: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed)) {
      const time = parseReminderTime(value);
      if (time) times[id] = time;
    }
    return times;
  } catch {
    return {};
  }
}

async function writeLocalTimes(times: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(TIMES_KEY, JSON.stringify(times));
}

export async function fetchReminderPrefs(): Promise<ReminderPrefs> {
  const local = await readLocalPrefs();
  const times = await readLocalTimes();
  const prefs: ReminderPrefs = {
    sessionReminders: local.sessionReminders === true,
    weeklySummary: local.weeklySummary === true,
    marketingOptIn: local.marketingOptIn === true,
    defaultTime: parseReminderTime(local.defaultTime) ?? DEFAULT_REMINDER_TIME,
    times,
  };
  try {
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).maybeSingle();
    if (error || !data) return prefs;
    const row = data as {
      session_reminders?: boolean | null;
      weekly_summary?: boolean | null;
      marketing_opt_in?: boolean | null;
      default_reminder_time?: string | null;
    };
    if (typeof local.sessionReminders !== 'boolean' && typeof row.session_reminders === 'boolean') {
      prefs.sessionReminders = row.session_reminders;
    }
    if (typeof local.weeklySummary !== 'boolean' && typeof row.weekly_summary === 'boolean') {
      prefs.weeklySummary = row.weekly_summary;
    }
    if (typeof local.marketingOptIn !== 'boolean' && typeof row.marketing_opt_in === 'boolean') {
      prefs.marketingOptIn = row.marketing_opt_in;
    }
    if (!parseReminderTime(local.defaultTime)) {
      const remoteTime = parseReminderTime(row.default_reminder_time);
      if (remoteTime) prefs.defaultTime = remoteTime;
    }
    return prefs;
  } catch {
    return prefs;
  }
}

export async function saveReminderPrefs(patch: Partial<Omit<ReminderPrefs, 'times'>>): Promise<ReminderPrefs> {
  const current = await fetchReminderPrefs();
  const next: ReminderPrefs = {
    ...current,
    ...patch,
    defaultTime: parseReminderTime(patch.defaultTime) ?? current.defaultTime,
  };
  await AsyncStorage.setItem(
    PREFS_KEY,
    JSON.stringify({
      sessionReminders: next.sessionReminders,
      weeklySummary: next.weeklySummary,
      marketingOptIn: next.marketingOptIn,
      defaultTime: next.defaultTime,
    } satisfies StoredPrefs)
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { error } = await supabase
      .from('profiles')
      .update({
        session_reminders: next.sessionReminders,
        weekly_summary: next.weeklySummary,
        marketing_opt_in: next.marketingOptIn,
        default_reminder_time: next.defaultTime,
      })
      .eq('user_id', user.id);
    if (error && !isMissingReminderSql(error)) throw new Error(error.message);
  }
  return next;
}

export function reminderTimeForDay(day: PlannerDayView, prefs: ReminderPrefs): string {
  const fromPlan = parseReminderTime(day.plan?.reminder_time);
  if (fromPlan) return fromPlan;
  if (day.plan?.id && prefs.times[day.plan.id]) return prefs.times[day.plan.id];
  return prefs.defaultTime;
}

export async function fetchLastSessionReminderTime(): Promise<string | null> {
  const last = await fetchLastFinishedSession().catch(() => null);
  const stamp = last?.completed_at ?? last?.started_at;
  if (!stamp) return null;
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return null;
  return hourToReminderTime(date.getHours());
}

async function ensureSessionReminderChannel(): Promise<void> {
  if (!Notifications || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Session reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function ensureSessionReminderPermission(): Promise<boolean> {
  if (!Notifications) return false;
  await ensureSessionReminderChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function cancelPlannerNotifications(): Promise<void> {
  const api = Notifications;
  if (!api) return;
  const scheduled = await api.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(
        (item) =>
          item.identifier.startsWith(SESSION_PREFIX) || item.identifier.startsWith(WEEKLY_PREFIX)
      )
      .map((item) => api.cancelScheduledNotificationAsync(item.identifier))
  );
}

function dateAtTime(iso: string, time: string): Date {
  const parsed = parseReminderTime(time) ?? DEFAULT_REMINDER_TIME;
  const [hours, minutes] = parsed.split(':').map(Number);
  const date = parseIsoDate(iso);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function nextSundays(count: number, now = new Date()): Date[] {
  const sundays: Date[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), WEEKLY_SUMMARY_HOUR, 0, 0, 0);
  const add = (7 - cursor.getDay()) % 7;
  cursor.setDate(cursor.getDate() + add);
  if (cursor.getTime() <= now.getTime()) cursor.setDate(cursor.getDate() + 7);
  for (let index = 0; index < count; index += 1) {
    sundays.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return sundays;
}

function sessionCopy(day: PlannerDayView): { title: string; body: string } {
  const name = day.title?.trim() || 'Your session';
  return {
    title: name,
    body: `${name} is ready when you are`,
  };
}

export async function syncPlannerReminders(): Promise<void> {
  if (!Notifications) return;
  await cancelPlannerNotifications();
  const prefs = await fetchReminderPrefs();
  if (!prefs.sessionReminders && !prefs.weeklySummary) return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;
  await ensureSessionReminderChannel();

  if (prefs.sessionReminders) {
    const from = new Date();
    const range = await loadPlannerRange(from, addDays(from, HORIZON_DAYS - 1)).catch(() => null);
    for (const day of range?.days ?? []) {
      if (!day.plan || day.plan.status !== 'planned') continue;
      if (day.kind !== 'routine' && day.kind !== 'custom') continue;
      if (day.completed) continue;
      const fireAt = dateAtTime(day.iso, reminderTimeForDay(day, prefs));
      if (fireAt.getTime() <= Date.now()) continue;
      const copy = sessionCopy(day);
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `${SESSION_PREFIX}${day.plan.id}`,
          content: {
            title: copy.title,
            body: copy.body,
            data: { type: 'session-reminder' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireAt,
            channelId: CHANNEL_ID,
          },
        });
      } catch {
        break;
      }
    }
  }

  if (prefs.weeklySummary) {
    for (const sunday of nextSundays(SUNDAYS_AHEAD)) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `${WEEKLY_PREFIX}${toIso(sunday)}`,
          content: {
            title: 'Plan your week',
            body: 'Your planner is ready whenever you are.',
            data: { type: 'weekly-summary' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: sunday,
            channelId: CHANNEL_ID,
          },
        });
      } catch {
        break;
      }
    }
  }
}

async function markAsked(): Promise<void> {
  await AsyncStorage.setItem(ASKED_KEY, '1');
}

export async function enableSessionReminders(): Promise<boolean> {
  await markAsked();
  if (!Notifications) {
    showDialog(
      'Reminders need a development build',
      'This phone build cannot show session reminders. You can still pick times in the planner for when they work.'
    );
    return false;
  }
  const granted = await ensureSessionReminderPermission();
  if (!granted) {
    showDialog(
      'Reminders are off on this phone',
      'You can turn them on in your phone settings, then come back to Profile, Notifications.'
    );
    return false;
  }
  const last = await fetchLastSessionReminderTime();
  const current = await fetchReminderPrefs();
  await saveReminderPrefs({
    sessionReminders: true,
    defaultTime: current.defaultTime === DEFAULT_REMINDER_TIME && last ? last : current.defaultTime,
  });
  await syncPlannerReminders();
  return true;
}

export async function setSessionRemindersEnabled(on: boolean): Promise<boolean> {
  await markAsked();
  if (on) return enableSessionReminders();
  await saveReminderPrefs({ sessionReminders: false });
  await syncPlannerReminders();
  return true;
}

export async function setWeeklySummaryEnabled(on: boolean): Promise<boolean> {
  await markAsked();
  if (on) {
    if (!Notifications) {
      showDialog(
        'Reminders need a development build',
        'This phone build cannot show the weekly summary yet.'
      );
      return false;
    }
    const granted = await ensureSessionReminderPermission();
    if (!granted) {
      showDialog(
        'Reminders are off on this phone',
        'You can turn them on in your phone settings, then come back to Profile, Notifications.'
      );
      return false;
    }
  }
  await saveReminderPrefs({ weeklySummary: on });
  await syncPlannerReminders();
  return true;
}

export async function setMarketingOptIn(on: boolean): Promise<void> {
  await saveReminderPrefs({ marketingOptIn: on });
}

export async function setDefaultReminderTime(time: string): Promise<void> {
  const parsed = parseReminderTime(time);
  if (!parsed) return;
  await saveReminderPrefs({ defaultTime: parsed });
  await syncPlannerReminders();
}

export async function setPlannedReminderTime(planId: string, time: string): Promise<void> {
  const parsed = parseReminderTime(time);
  if (!parsed) return;
  const times = await readLocalTimes();
  times[planId] = parsed;
  await writeLocalTimes(times);
  await updatePlannerReminderTime(planId, parsed);
  await syncPlannerReminders();
}

let askLock = false;

/** After her first finished session, or next open if she already has history. */
export async function maybeAskSessionReminders(): Promise<void> {
  if (askLock || !Notifications) return;
  askLock = true;
  try {
    const asked = await AsyncStorage.getItem(ASKED_KEY);
    if (asked === '1') return;
    const last = await fetchLastFinishedSession().catch(() => null);
    if (!last) {
      askLock = false;
      return;
    }
    const prefs = await fetchReminderPrefs();
    if (prefs.sessionReminders) {
      await markAsked();
      return;
    }
    await markAsked();
    showDialog(
      'Session reminders',
      'We can nudge you on days you have something planned, at a time you pick. Nothing on rest days, and never about streaks.',
      [
        {
          text: 'Turn on',
          onPress: () => {
            void enableSessionReminders();
          },
        },
        { text: 'Not now', style: 'cancel' },
      ]
    );
  } catch {
    askLock = false;
  }
}

/** Tester helper: a sample session reminder in a few seconds. */
export async function scheduleTestSessionReminder(): Promise<boolean> {
  if (!Notifications) {
    showDialog(
      'Reminders need a development build',
      'This phone build cannot show notifications.'
    );
    return false;
  }
  const granted = await ensureSessionReminderPermission();
  if (!granted) {
    showDialog(
      'Reminders are off on this phone',
      'Turn notifications on in your phone settings, then try again.'
    );
    return false;
  }
  await ensureSessionReminderChannel();
  await Notifications.cancelScheduledNotificationAsync(TEST_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: TEST_ID,
    content: {
      title: 'Full body A',
      body: 'Full body A is ready when you are',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 8,
      channelId: CHANNEL_ID,
    },
  });
  return true;
}
