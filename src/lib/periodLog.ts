/**
 * Optional period log (L9). Special-category health data.
 *
 * Store start and end dates only, after explicit consent
 * (health_consents purpose period_log). Never send these rows to Coach,
 * PostHog, RevenueCat, notifications, share cards or recaps. Never
 * predict a next period, fertile window or pregnancy.
 */
import file from '../../content/checkin/checkin.json';

import type { HealthConsent } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

type Json = Record<string, unknown>;

export type PeriodLog = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
};

export type PeriodLogCopy = {
  purpose: string;
  consentVersion: number;
  privacyTitle: string;
  privacyOff: string;
  privacyOn: string;
  consentTitle: string;
  consentBody: string[];
  consentCheckbox: string;
  acceptButton: string;
  declineButton: string;
  turnOffTitle: string;
  turnOffBody: string;
  turnOffConfirm: string;
  turnOffCancel: string;
  started: string;
  ended: string;
  dotAccessibility: string;
  insightsTitle: string;
  insightsHelper: string;
  insightsPrivacyTitle: string;
};

type InsightNote = {
  id: string;
  when: string;
  text: string;
};

type InsightRules = {
  minCompletedPeriods: number;
  minSessionsOnPeriodDays: number;
  minutesGapPercent: number;
  lighterGapPoints: number;
  notes: InsightNote[];
};

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function int(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

const root = asRecord(file);
const period = asRecord(root.period_log);
const consent = asRecord(period.consent);
const turnOff = asRecord(period.turn_off);
const planner = asRecord(period.planner);
const insights = asRecord(period.insights);

const INSIGHT_RULES: InsightRules = {
  minCompletedPeriods: Math.max(1, int(insights.min_completed_periods, 3)),
  minSessionsOnPeriodDays: Math.max(1, int(insights.min_sessions_on_period_days, 6)),
  minutesGapPercent: Math.max(1, int(insights.minutes_gap_percent, 15)),
  lighterGapPoints: Math.max(1, int(insights.lighter_gap_points, 20)),
  notes: asArray(insights.notes).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.id);
    const body = text(row.text);
    if (!id || !body) return [];
    return [{ id, when: text(row.when), text: body }];
  }),
};

export const PERIOD_LOG: PeriodLogCopy = {
  purpose: text(period.consent_purpose) || 'period_log',
  consentVersion: Math.max(1, int(period.consent_version, 1)),
  privacyTitle: text(period.privacy_row_title) || 'Period log',
  privacyOff: text(period.privacy_row_off),
  privacyOn: text(period.privacy_row_on),
  consentTitle: text(consent.title) || 'Can we save period dates?',
  consentBody: asArray(consent.body).map(text).filter(Boolean),
  consentCheckbox: text(consent.checkbox),
  acceptButton: text(consent.accept_button) || 'Save and switch on',
  declineButton: text(consent.decline_button) || "Don't save it",
  turnOffTitle: text(turnOff.title) || 'Turn off the period log?',
  turnOffBody: text(turnOff.body),
  turnOffConfirm: text(turnOff.confirm) || 'Turn off and delete',
  turnOffCancel: text(turnOff.cancel) || 'Keep it on',
  started: text(planner.started) || 'Period started',
  ended: text(planner.ended) || 'Period ended',
  dotAccessibility: text(planner.dot_accessibility) || 'Private mark',
  insightsTitle: text(insights.title) || 'A note from your logs',
  insightsHelper: text(insights.helper),
  insightsPrivacyTitle: text(insights.privacy_row_title) || 'Notes from your logs',
};

const PERIOD_LOG_COLUMNS = 'id, user_id, start_date, end_date, created_at';
const MISSING_TABLE = 'The period log table is not set up yet. Paste supabase/period_log_l9.sql in the SQL editor.';

function isMissingPeriodLogs(error: { message?: string; code?: string }): boolean {
  return /period_logs/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function isMissingHealthConsents(error: { message?: string; code?: string }): boolean {
  return /health_consents/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function localIsoDate(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const next = new Date(year, month - 1, day + days);
  return localIsoDate(next);
}

function asPeriodLog(row: Record<string, unknown>): PeriodLog | null {
  const id = typeof row.id === 'string' ? row.id : '';
  const user_id = typeof row.user_id === 'string' ? row.user_id : '';
  const start_date = typeof row.start_date === 'string' ? row.start_date : '';
  const created_at = typeof row.created_at === 'string' ? row.created_at : '';
  if (!id || !user_id || !start_date) return null;
  return {
    id,
    user_id,
    start_date,
    end_date: typeof row.end_date === 'string' ? row.end_date : null,
    created_at,
  };
}

function asConsent(row: Record<string, unknown>): HealthConsent | null {
  const id = typeof row.id === 'string' ? row.id : '';
  const user_id = typeof row.user_id === 'string' ? row.user_id : '';
  const purpose = typeof row.purpose === 'string' ? row.purpose : '';
  const consent_version = Number(row.consent_version);
  const granted_at = typeof row.granted_at === 'string' ? row.granted_at : '';
  if (!id || !user_id || !purpose || !granted_at || !Number.isInteger(consent_version)) return null;
  return {
    id,
    user_id,
    purpose,
    consent_version,
    granted_at,
    withdrawn_at: typeof row.withdrawn_at === 'string' ? row.withdrawn_at : null,
  };
}

function openPeriod(logs: PeriodLog[]): PeriodLog | null {
  return logs.find((row) => row.end_date == null) ?? null;
}

function completedPeriodCount(logs: PeriodLog[]): number {
  return logs.filter((row) => row.end_date != null).length;
}

/** Closed ranges as stored. Open periods run through `openUntil` (usually today). */
export function isoIsPeriodDay(iso: string, logs: PeriodLog[], openUntil: string): boolean {
  return logs.some((row) => {
    if (iso < row.start_date) return false;
    const end = row.end_date ?? openUntil;
    return iso <= end;
  });
}

export function periodDaySet(logs: PeriodLog[], fromIso: string, toIso: string, openUntil: string): Set<string> {
  const days = new Set<string>();
  for (const row of logs) {
    const last = row.end_date ?? openUntil;
    let cursor = row.start_date < fromIso ? fromIso : row.start_date;
    const stop = last > toIso ? toIso : last;
    while (cursor <= stop) {
      days.add(cursor);
      cursor = shiftIso(cursor, 1);
    }
  }
  return days;
}

export function canMarkPeriodStart(iso: string, logs: PeriodLog[]): boolean {
  const open = openPeriod(logs);
  if (open && iso >= open.start_date) return false;
  return !logs.some((row) => row.end_date != null && iso >= row.start_date && iso <= row.end_date);
}

export function canMarkPeriodEnd(iso: string, logs: PeriodLog[]): boolean {
  const open = openPeriod(logs);
  return Boolean(open && iso >= open.start_date);
}

export async function fetchPeriodLogEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from('health_consents')
    .select('id, user_id, purpose, consent_version, granted_at, withdrawn_at')
    .eq('purpose', PERIOD_LOG.purpose)
    .is('withdrawn_at', null)
    .maybeSingle();
  if (error) {
    if (isMissingHealthConsents(error)) return false;
    throw error;
  }
  if (!data || typeof data !== 'object') return false;
  return Boolean(asConsent(data as Record<string, unknown>));
}

export async function grantPeriodLogConsent(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in.');
  const now = new Date().toISOString();
  const { data: existing, error: readError } = await supabase
    .from('health_consents')
    .select('id, withdrawn_at')
    .eq('user_id', user.id)
    .eq('purpose', PERIOD_LOG.purpose)
    .maybeSingle();
  if (readError) throw readError;
  if (existing && typeof existing === 'object' && 'id' in existing) {
    const { error } = await supabase
      .from('health_consents')
      .update({
        consent_version: PERIOD_LOG.consentVersion,
        granted_at: now,
        withdrawn_at: null,
      })
      .eq('id', (existing as { id: string }).id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('health_consents').insert({
    user_id: user.id,
    purpose: PERIOD_LOG.purpose,
    consent_version: PERIOD_LOG.consentVersion,
    granted_at: now,
    withdrawn_at: null,
  });
  if (error) throw error;
}

async function deleteAllPeriodLogs(): Promise<void> {
  const { error } = await supabase.from('period_logs').delete().neq('id', '');
  if (error && !isMissingPeriodLogs(error)) throw error;
}

/** Withdraws consent and deletes every period date. The consent row is kept with withdrawn_at. */
export async function withdrawPeriodLogConsent(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in.');
  await deleteAllPeriodLogs();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('health_consents')
    .update({ withdrawn_at: now })
    .eq('user_id', user.id)
    .eq('purpose', PERIOD_LOG.purpose)
    .is('withdrawn_at', null);
  if (error && !isMissingHealthConsents(error)) throw error;
}

export async function fetchPeriodLogs(): Promise<PeriodLog[]> {
  const enabled = await fetchPeriodLogEnabled();
  if (!enabled) return [];
  const { data, error } = await supabase
    .from('period_logs')
    .select(PERIOD_LOG_COLUMNS)
    .order('start_date', { ascending: false });
  if (error) {
    if (isMissingPeriodLogs(error)) return [];
    throw error;
  }
  return (data ?? []).flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const parsed = asPeriodLog(row as Record<string, unknown>);
    return parsed ? [parsed] : [];
  });
}

export async function isDateOnLoggedPeriod(iso: string): Promise<boolean> {
  const logs = await fetchPeriodLogs();
  return isoIsPeriodDay(iso, logs, localIsoDate());
}

export async function markPeriodStarted(iso: string): Promise<void> {
  const enabled = await fetchPeriodLogEnabled();
  if (!enabled) throw new Error('Switch the period log on in Profile, Privacy first.');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in.');
  const logs = await fetchPeriodLogs();
  if (logs.some((row) => row.end_date != null && iso >= row.start_date && iso <= row.end_date)) return;
  const open = openPeriod(logs);
  if (open) {
    if (iso < open.start_date) {
      const { error } = await supabase.from('period_logs').update({ start_date: iso }).eq('id', open.id);
      if (error) throw isMissingPeriodLogs(error) ? new Error(MISSING_TABLE) : error;
      return;
    }
    if (iso === open.start_date) return;
    const previousEnd = shiftIso(iso, -1);
    if (previousEnd >= open.start_date) {
      const { error } = await supabase.from('period_logs').update({ end_date: previousEnd }).eq('id', open.id);
      if (error) throw isMissingPeriodLogs(error) ? new Error(MISSING_TABLE) : error;
    }
  }
  const { error } = await supabase.from('period_logs').insert({
    user_id: user.id,
    start_date: iso,
    end_date: null,
  });
  if (error) throw isMissingPeriodLogs(error) ? new Error(MISSING_TABLE) : error;
}

export async function markPeriodEnded(iso: string): Promise<void> {
  const enabled = await fetchPeriodLogEnabled();
  if (!enabled) throw new Error('Switch the period log on in Profile, Privacy first.');
  const logs = await fetchPeriodLogs();
  const open = openPeriod(logs);
  if (!open) return;
  if (iso < open.start_date) {
    throw new Error('Pick a day on or after this period started.');
  }
  const { error } = await supabase.from('period_logs').update({ end_date: iso }).eq('id', open.id);
  if (error) throw isMissingPeriodLogs(error) ? new Error(MISSING_TABLE) : error;
}

type SessionRow = {
  date: string;
  duration_seconds: number | null;
  lighter_session: boolean;
};

async function fetchFinishedSessionRows(): Promise<SessionRow[]> {
  const withDuration = await supabase
    .from('sessions')
    .select('date, duration_seconds, lighter_session, completed_at')
    .not('completed_at', 'is', null);
  const result =
    withDuration.error && /duration_seconds/i.test(withDuration.error.message ?? '')
      ? await supabase.from('sessions').select('date, lighter_session, completed_at').not('completed_at', 'is', null)
      : withDuration;
  if (result.error) throw result.error;
  return (result.data ?? []).flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    const date = typeof record.date === 'string' ? record.date : '';
    if (!date) return [];
    return [
      {
        date,
        duration_seconds: typeof record.duration_seconds === 'number' ? record.duration_seconds : null,
        lighter_session: record.lighter_session === true,
      },
    ];
  });
}

function noteById(id: string): InsightNote | null {
  return INSIGHT_RULES.notes.find((note) => note.id === id) ?? null;
}

function fillNote(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (_, key: string) => values[key] ?? '');
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Private notes from her own logs. Empty until the thresholds in checkin.json. Never predicts. */
export async function buildPeriodInsights(logs: PeriodLog[]): Promise<string[]> {
  if (completedPeriodCount(logs) < INSIGHT_RULES.minCompletedPeriods) return [];
  const today = localIsoDate();
  const sessions = await fetchFinishedSessionRows();
  const onPeriod = sessions.filter((row) => isoIsPeriodDay(row.date, logs, today));
  if (onPeriod.length < INSIGHT_RULES.minSessionsOnPeriodDays) return [];
  const offPeriod = sessions.filter((row) => !isoIsPeriodDay(row.date, logs, today));
  const notes: string[] = [];
  const countNote = noteById('sessions_on_period_days');
  if (countNote) {
    notes.push(fillNote(countNote.text, { n: String(onPeriod.length) }));
  }
  const periodMinutes = onPeriod
    .map((row) => row.duration_seconds)
    .filter((value): value is number => value != null && value > 0)
    .map((seconds) => seconds / 60);
  const otherMinutes = offPeriod
    .map((row) => row.duration_seconds)
    .filter((value): value is number => value != null && value > 0)
    .map((seconds) => seconds / 60);
  const periodAvg = average(periodMinutes);
  const otherAvg = average(otherMinutes);
  if (periodAvg != null && otherAvg != null && otherAvg > 0 && otherMinutes.length >= 3) {
    const gap = ((periodAvg - otherAvg) / otherAvg) * 100;
    const threshold = INSIGHT_RULES.minutesGapPercent;
    const similar = noteById('minutes_similar');
    const shorter = noteById('minutes_shorter');
    const longer = noteById('minutes_longer');
    if (Math.abs(gap) < threshold && similar) notes.push(similar.text);
    else if (gap <= -threshold && shorter) notes.push(shorter.text);
    else if (gap >= threshold && longer) notes.push(longer.text);
  }
  if (onPeriod.length >= INSIGHT_RULES.minSessionsOnPeriodDays && offPeriod.length >= 3) {
    const periodLighter = onPeriod.filter((row) => row.lighter_session).length / onPeriod.length;
    const otherLighter = offPeriod.filter((row) => row.lighter_session).length / offPeriod.length;
    const points = (periodLighter - otherLighter) * 100;
    const lighter = noteById('lighter_more_often');
    if (points >= INSIGHT_RULES.lighterGapPoints && lighter) notes.push(lighter.text);
  }
  return notes;
}
