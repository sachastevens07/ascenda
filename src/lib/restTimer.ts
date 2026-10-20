import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const DEFAULT_REST_SECONDS = 90;
export const REST_ADJUST_SECONDS = 15;

const CHANNEL_ID = 'rest-timer';

Notifications.setNotificationHandler({
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

/** Schedules the "rest over" alert. Returns its id, or null if notifications aren't allowed. */
export async function scheduleRestOver(seconds: number): Promise<string | null> {
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
  if (id) await Notifications.cancelScheduledNotificationAsync(id);
}
