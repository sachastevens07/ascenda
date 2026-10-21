import { Directory } from 'expo-file-system';

import { EQUIPMENT_LABELS, type Equipment } from '@/lib/exercises';
import { supabase } from '@/lib/supabase';

/** Supabase returns at most 1000 rows per request. */
const PAGE_SIZE = 1000;

const HEADERS = ['Date', 'Start time', 'Session', 'Exercise', 'Equipment', 'Set', 'Weight (kg)', 'Reps'];

type ExportRow = {
  set_number: number;
  weight_kg: number | string | null;
  reps: number | null;
  completed_at: string | null;
  exercise: { name: string; equipment: Equipment };
  session: { date: string; started_at: string; programme_day: { name: string } | null };
};

/** Every ticked set from her finished sessions, in the order she did them. */
async function fetchExportRows(): Promise<ExportRow[]> {
  const rows: ExportRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('sets')
      .select(
        'id, set_number, weight_kg, reps, completed_at, exercise:exercises(name, equipment), session:sessions!inner(date, started_at, completed_at, programme_day:programme_days(name))'
      )
      .eq('completed', true)
      .not('session.completed_at', 'is', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as ExportRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows.sort(
    (a, b) =>
      a.session.started_at.localeCompare(b.session.started_at) ||
      (a.completed_at ?? '').localeCompare(b.completed_at ?? '') ||
      a.set_number - b.set_number
  );
}

/** "09:05" in the phone's time zone. */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: ExportRow[]): string {
  const lines = [HEADERS, ...rows.map((row) => [
    row.session.date,
    formatTime(row.session.started_at),
    row.session.programme_day?.name ?? '',
    row.exercise.name,
    EQUIPMENT_LABELS[row.exercise.equipment],
    row.set_number,
    row.weight_kg === null ? '' : Number(row.weight_kg),
    row.reps ?? '',
  ])];
  // The byte-order mark makes Excel read the file as UTF-8.
  return '\uFEFF' + lines.map((line) => line.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export type ExportResult =
  | { status: 'empty' }
  | { status: 'cancelled' }
  | { status: 'saved'; fileName: string; setCount: number };

/** Asks her for a folder (e.g. Downloads) and saves her workout history there as a CSV file. */
export async function exportWorkoutHistory(): Promise<ExportResult> {
  const rows = await fetchExportRows();
  if (rows.length === 0) return { status: 'empty' };

  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    // The picker rejects when she backs out without choosing a folder.
    return { status: 'cancelled' };
  }

  const today = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const file = folder.createFile(`workout-history-${stamp}.csv`, 'text/csv');
  file.write(toCsv(rows));
  return { status: 'saved', fileName: file.name, setCount: rows.length };
}
