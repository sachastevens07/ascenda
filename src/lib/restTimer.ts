import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export const REST_TIMER_DEFAULTS = [60, 90, 120] as const;
export type RestTimerDefault = (typeof REST_TIMER_DEFAULTS)[number];

export const DEFAULT_REST_SECONDS: RestTimerDefault = 90;
export const REST_ADJUST_SECONDS = 15;

const REST_DEFAULT_KEY = 'rest_timer_default_seconds';

let currentRestDefault: RestTimerDefault = DEFAULT_REST_SECONDS;
const restListeners = new Set<(value: RestTimerDefault) => void>();

function isRestTimerDefault(value: number): value is RestTimerDefault {
  return (REST_TIMER_DEFAULTS as readonly number[]).includes(value);
}

function setCurrentRestDefault(value: RestTimerDefault) {
  currentRestDefault = value;
  restListeners.forEach((fn) => fn(value));
}

export function getDefaultRestSeconds(): number {
  return currentRestDefault;
}

export function formatRestTimerDefault(seconds: number): string {
  if (seconds === 60) return '1 minute';
  if (seconds === 90) return '1 minute 30 seconds';
  if (seconds === 120) return '2 minutes';
  return `${seconds} seconds`;
}

/** Short rest label for the logger chip, without the word "rest". */
export function formatRestChipTime(seconds: number): string {
  if (seconds <= 0) return 'off';
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return minutes === 1 ? '1 min' : `${minutes} min`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes === 0) return `${secs} s`;
  return `${minutes} min ${secs} s`;
}

export function useDefaultRestSeconds(): RestTimerDefault {
  const [value, setValue] = useState(currentRestDefault);
  useEffect(() => {
    restListeners.add(setValue);
    return () => {
      restListeners.delete(setValue);
    };
  }, []);
  return value;
}

function isMissingRestColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  return /rest_timer_seconds/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

export async function hydrateDefaultRestSeconds(): Promise<RestTimerDefault> {
  const value = await fetchDefaultRestSeconds();
  setCurrentRestDefault(value);
  return value;
}

export async function fetchDefaultRestSeconds(): Promise<RestTimerDefault> {
  try {
    const stored = await AsyncStorage.getItem(REST_DEFAULT_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN;
    const local = isRestTimerDefault(parsed) ? parsed : DEFAULT_REST_SECONDS;
    const { data, error } = await supabase.from('profiles').select('rest_timer_seconds').maybeSingle();
    if (error) {
      setCurrentRestDefault(local);
      return local;
    }
    const remote = (data as { rest_timer_seconds?: number | null } | null)?.rest_timer_seconds;
    if (typeof remote === 'number' && isRestTimerDefault(remote)) {
      setCurrentRestDefault(remote);
      return remote;
    }
    setCurrentRestDefault(local);
    return local;
  } catch {
    return currentRestDefault;
  }
}

export async function saveDefaultRestSeconds(seconds: RestTimerDefault): Promise<void> {
  setCurrentRestDefault(seconds);
  await AsyncStorage.setItem(REST_DEFAULT_KEY, String(seconds));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('profiles')
    .update({ rest_timer_seconds: seconds })
    .eq('user_id', user.id);
  if (error && !isMissingRestColumn(error)) throw new Error(error.message);
}

const CHANNEL_ID = 'rest-timer';

type NotificationsModule = typeof import('expo-notifications');

// Some Expo Go builds lack native modules that expo-notifications loads on import. Without
// notifications the timer still runs and vibrates in the app; it just can't alert when locked.
export const Notifications: NotificationsModule | null = (() => {
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
})();

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Asks for permission to show the rest-timer alert. On Android the channel has to exist
 * before the system will show the permission prompt.
 */
export async function ensureRestTimerPermission(): Promise<boolean> {
  if (!Notifications) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Rest timer',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 200, 300],
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Schedules the "rest over" alert. Returns its id, or null if notifications aren't available. */
export async function scheduleRestOver(seconds: number): Promise<string | null> {
  if (!Notifications) return null;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted || seconds < 1) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Rest over',
      body: 'Ready when you are. Time for your next set.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.round(seconds),
      channelId: CHANNEL_ID,
    },
  });
}

export async function cancelRestOver(id: string | null): Promise<void> {
  if (id && Notifications) await Notifications.cancelScheduledNotificationAsync(id);
}
