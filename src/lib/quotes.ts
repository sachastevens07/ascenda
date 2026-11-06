/**
 * Daily quotes from content/quotes/quotes.json (AGENTS.md N7).
 * Bundled. Pick by UTC date: days since 2026-01-01, modulo the active list.
 * Database rows win when the quotes table has been seeded.
 */
import file from '../../content/quotes/quotes.json';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

export type DailyQuote = {
  id: string;
  text: string;
  attribution: string;
};

const HIDE_KEY = 'hide_quote';
const EPOCH_UTC = Date.UTC(2026, 0, 1);

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function quoteId(sortOrder: number): string {
  return `q-${String(sortOrder).padStart(3, '0')}`;
}

function parseQuote(raw: unknown): (DailyQuote & { sort_order: number }) | null {
  const row = asRecord(raw);
  const body = text(row.text);
  const sort = num(row.sort_order);
  if (!body || sort == null || row.is_active === false) return null;
  return {
    id: quoteId(sort),
    text: body,
    attribution: text(row.attribution) || 'Ascenda',
    sort_order: sort,
  };
}

/** Original quotes in the Ascenda voice, ordered by content sort_order. */
export const DAILY_QUOTES: DailyQuote[] = asArray(asRecord(file).quotes)
  .map(parseQuote)
  .filter((item): item is NonNullable<typeof item> => Boolean(item))
  .sort((a, b) => a.sort_order - b.sort_order)
  .map(({ sort_order: _sort, ...item }) => item);

function isMissingHideColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  return /hide_quote/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

/** Active quotes from the database, or the bundled list if SQL has not been run. */
export async function fetchDailyQuotes(): Promise<DailyQuote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, text, attribution, is_active')
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (error || !data || data.length < DAILY_QUOTES.length) {
    return DAILY_QUOTES;
  }
  const rows = (data as { id: string; text: string; attribution: string | null }[])
    .map((row) => ({
      id: row.id,
      text: row.text.trim(),
      attribution: (row.attribution ?? 'Ascenda').trim() || 'Ascenda',
    }))
    .filter((row) => row.id && row.text);
  return rows.length > 0 ? rows : DAILY_QUOTES;
}

/** Same quote for everyone that UTC day. Index = days since 1 Jan 2026, modulo the list. */
export function pickDailyQuote(quotes: DailyQuote[] = DAILY_QUOTES, now = new Date()): DailyQuote {
  const list = quotes.length > 0 ? quotes : DAILY_QUOTES;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = Math.floor((today - EPOCH_UTC) / 86_400_000);
  const index = ((day % list.length) + list.length) % list.length;
  return list[index];
}

export async function fetchHideQuote(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(HIDE_KEY);
    const local = stored === '1';
    const { data, error } = await supabase.from('profiles').select('hide_quote').maybeSingle();
    if (error) return local;
    const value = (data as { hide_quote?: boolean | null } | null)?.hide_quote;
    if (typeof value === 'boolean') {
      if (local && !value) {
        await saveHideQuote(true);
        return true;
      }
      return value;
    }
    return local;
  } catch {
    return false;
  }
}

export async function saveHideQuote(hidden: boolean): Promise<void> {
  await AsyncStorage.setItem(HIDE_KEY, hidden ? '1' : '0');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('profiles').update({ hide_quote: hidden }).eq('user_id', user.id);
  if (error && !isMissingHideColumn(error)) throw new Error(error.message);
}
