import { Platform } from 'react-native';

export const DEFAULT_REST_SECONDS = 90;
export const REST_ADJUST_SECONDS = 15;

const CHANNEL_ID = 'rest-timer';

type NotificationsModule = typeof import('expo-notifications');

// Some Expo Go builds lack native modules that expo-notifications loads on import. Without
// notifications the timer still runs and vibrates in the app; it just can't alert when locked.
const Notifications: NotificationsModule | null = (() => {
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
