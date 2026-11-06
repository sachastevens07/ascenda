import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchActiveSession, fetchLastFinishedSession } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

function storageKey(userId: string): string {
  return `first-session-disclaimer:${userId}`;
}

let showSheet: (() => Promise<boolean>) | null = null;

/** The first-session sheet registers here so start paths can wait for her confirmation. */
export function registerFirstSessionSheet(present: (() => Promise<boolean>) | null): void {
  showSheet = present;
}

export async function markFirstSessionDisclaimerSeen(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await AsyncStorage.setItem(storageKey(user.id), '1').catch(() => {});
}

/**
 * Returns false if she dismisses the sheet. Start paths must not create a session then.
 * Skips if she has already seen it, or already has a session (in progress or finished).
 */
export async function confirmFirstSessionSafety(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return true;
  const key = storageKey(user.id);
  try {
    if (await AsyncStorage.getItem(key)) return true;
  } catch {
    /* Show the sheet if storage is unavailable. */
  }
  const active = await fetchActiveSession().catch(() => null);
  if (active) {
    await markFirstSessionDisclaimerSeen();
    return true;
  }
  const last = await fetchLastFinishedSession().catch(() => null);
  if (last) {
    await markFirstSessionDisclaimerSeen();
    return true;
  }
  if (!showSheet) return true;
  return showSheet();
}

export class SessionStartCancelled extends Error {
  constructor() {
    super('Session start cancelled');
    this.name = 'SessionStartCancelled';
  }
}

export function isSessionStartCancelled(error: unknown): boolean {
  return error instanceof SessionStartCancelled;
}
