/**
 * Home "Your first steps" checklist (27 November 2026).
 * Small first actions, each rewarded with a tick. Signals come from data the app already keeps:
 * finished sessions, opened exercise guides, Learn reads and reminder settings, plus one local
 * flag for having looked at the Planner. Everything here is on the device except what those
 * features already store.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchGuidesOpened } from '@/lib/achievements';
import { gettingStartedCopy } from '@/lib/copy';
import { fetchReadArticleIds } from '@/lib/learn';
import { fetchReminderPrefs } from '@/lib/reminders';

export type GettingStartedId = 'first_session' | 'guide' | 'planner' | 'reminders' | 'learn';

export type GettingStartedItem = {
  id: GettingStartedId;
  title: string;
  body: string;
  done: boolean;
  /** Ticked since she last saw the card, so it can celebrate once. */
  justDone: boolean;
};

// Keyed by user, so a new account on the same phone gets its own checklist.
let currentUser = 'anon';
const plannerKey = () => `getting_started_planner_seen:${currentUser}`;
const dismissedKey = () => `getting_started_dismissed:${currentUser}`;
const seenKey = () => `getting_started_seen_done:${currentUser}`;
/** The card is for her first weeks only. */
export const GETTING_STARTED_DAYS = 30;

export async function markPlannerSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(plannerKey(), '1');
  } catch {
    /* Storage off: the step just stays unticked. */
  }
}

export async function dismissGettingStarted(): Promise<void> {
  try {
    await AsyncStorage.setItem(dismissedKey(), '1');
  } catch {
    /* Nothing else to do. */
  }
}

async function readSeenDone(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(seenKey());
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

/** Remember which ticks she has already seen, so each one celebrates once. */
export async function rememberSeenDone(ids: GettingStartedId[]): Promise<void> {
  try {
    await AsyncStorage.setItem(seenKey(), JSON.stringify(ids));
  } catch {
    /* Fine: the tick just animates again next time. */
  }
}

function withinFirstWeeks(onboardingCompletedAt: string | null | undefined): boolean {
  if (!onboardingCompletedAt) return true;
  const started = Date.parse(onboardingCompletedAt);
  if (Number.isNaN(started)) return true;
  return Date.now() - started < GETTING_STARTED_DAYS * 24 * 60 * 60 * 1000;
}

/** Null when the card shouldn't show: hidden by her, or past her first weeks. */
export async function fetchGettingStarted(input: {
  userId: string | null | undefined;
  sessionsDone: number;
  onboardingCompletedAt: string | null | undefined;
}): Promise<GettingStartedItem[] | null> {
  if (input.userId) currentUser = input.userId;
  if (!withinFirstWeeks(input.onboardingCompletedAt)) return null;
  let dismissed = false;
  let plannerSeen = false;
  try {
    const [d, p] = await Promise.all([AsyncStorage.getItem(dismissedKey()), AsyncStorage.getItem(plannerKey())]);
    dismissed = d === '1';
    plannerSeen = p === '1';
  } catch {
    /* Treat as not set. */
  }
  if (dismissed) return null;

  const [guides, reads, reminders, seen] = await Promise.all([
    fetchGuidesOpened().catch(() => 0),
    fetchReadArticleIds().catch(() => new Set<string>()),
    fetchReminderPrefs().catch(() => null),
    readSeenDone(),
  ]);
  const done: Record<GettingStartedId, boolean> = {
    first_session: input.sessionsDone > 0,
    guide: guides > 0,
    planner: plannerSeen,
    reminders: reminders?.sessionReminders === true,
    learn: reads.size > 0,
  };
  return gettingStartedCopy.items
    .filter((item): item is typeof item & { id: GettingStartedId } => item.id in done)
    .map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      done: done[item.id],
      justDone: done[item.id] && !seen.has(item.id),
    }));
}
