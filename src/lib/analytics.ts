import AsyncStorage from '@react-native-async-storage/async-storage';
import PostHog from 'posthog-react-native';

/**
 * Retention analytics (H5).
 *
 * Sends only the named events below. Never attach health data, body photos,
 * names, emails, weights, reps, quotes or free-text copy. Properties are
 * allowlisted; anything else is dropped.
 *
 * No API key: every call is a no-op so the app still opens.
 * Dashboards live in the PostHog project (EU), not in the app. See PROGRESS.md.
 */
export const ANALYTICS_EVENTS = [
  'onboarding_completed',
  'disclaimer_accepted',
  'paywall_viewed',
  'trial_started',
  'session_started',
  'session_completed',
  'set_ticked',
  'planned_week_missed',
  'rest_week_used',
  'streak_repaired',
  'welcome_back_shown',
  'welcome_back_completed',
  'reminder_sent',
  'reminder_opened',
  'routine_completed',
  'next_routine_started',
  'learn_article_opened',
  'dev_test_event',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsPlan = 'none' | 'trial' | 'active' | 'grace' | 'expired';

type AnalyticsValue = string | number | boolean;
type AnalyticsProps = Record<string, AnalyticsValue>;

const ALLOWED_KEYS = new Set([
  'reason',
  'source',
  'type',
  'week_start',
  'plan',
  'env',
  'article_id',
  'routine_id',
  'version',
]);

const BLOCKED_KEY =
  /weight|photo|email|name|body|quote|rep|kg|goal|text|note|message|copy|title|cue|comment|avatar/i;

const DEFAULT_HOST = 'https://eu.i.posthog.com';
const ONCE_PREFIX = 'analytics_once:';

let client: PostHog | null | undefined;

function analyticsEnv(): 'dev' | 'prod' {
  return __DEV__ ? 'dev' : 'prod';
}

function apiKey(): string {
  return process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() ?? '';
}

function host(): string {
  return process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || DEFAULT_HOST;
}

function sanitize(properties?: AnalyticsProps): AnalyticsProps | undefined {
  if (!properties) return undefined;
  const out: AnalyticsProps = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_KEYS.has(key) || BLOCKED_KEY.test(key)) continue;
    if (typeof value === 'string') {
      if (value.length === 0 || value.length > 64) continue;
      out[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function getClient(): PostHog | null {
  if (client !== undefined) return client;
  const key = apiKey();
  if (!key) {
    client = null;
    return null;
  }
  try {
    const instance = new PostHog(key, {
      host: host(),
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      disableSurveys: true,
      capturePushNotificationSubscriptions: false,
      capturePushNotificationOpened: false,
    });
    instance.register({ env: analyticsEnv() });
    client = instance;
    return instance;
  } catch {
    client = null;
    return null;
  }
}

export function isAnalyticsEnabled(): boolean {
  return Boolean(apiKey());
}

/** Creates the client if a key is present. Safe to call more than once. */
export function startAnalytics(): void {
  getClient();
}

export function track(event: AnalyticsEvent, properties?: AnalyticsProps): void {
  try {
    const instance = getClient();
    if (!instance) return;
    instance.capture(event, sanitize(properties));
  } catch {
    /* Analytics must never block logging or navigation. */
  }
}

export function identifyUser(userId: string, plan: AnalyticsPlan): void {
  try {
    const instance = getClient();
    if (!instance || !userId) return;
    instance.identify(userId, { env: analyticsEnv(), plan });
  } catch {
    /* Ignore identify failures. */
  }
}

export function resetAnalytics(): void {
  try {
    const instance = getClient();
    if (!instance) return;
    instance.reset();
    instance.register({ env: analyticsEnv() });
  } catch {
    /* Ignore reset failures. */
  }
}

/** Fires at most once per device for this key (used for trials, repairs, welcome-back). */
export async function trackOnce(
  key: string,
  event: AnalyticsEvent,
  properties?: AnalyticsProps
): Promise<void> {
  try {
    const storageKey = `${ONCE_PREFIX}${key}`;
    if (await AsyncStorage.getItem(storageKey)) return;
    await AsyncStorage.setItem(storageKey, '1');
  } catch {
    return;
  }
  track(event, properties);
}

/** N6 will call this from Learn article screens. Id only, never title or body. */
export function trackLearnArticleOpened(articleId: string): void {
  const id = articleId.trim();
  if (!id) return;
  track('learn_article_opened', { article_id: id });
}
