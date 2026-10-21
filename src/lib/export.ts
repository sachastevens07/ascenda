import { Directory } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { Platform } from 'react-native';

import { CYCLE_PHASE_LABELS, type CyclePhase } from '@/lib/cycle';
import { EQUIPMENT_LABELS, type Equipment } from '@/lib/exercises';
import { supabase } from '@/lib/supabase';
import { buildXlsx, type XlsxCell, type XlsxColumn } from '@/lib/xlsx';

/** Supabase returns at most 1000 rows per request. */
const PAGE_SIZE = 1000;

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Android's Intent.FLAG_GRANT_READ_URI_PERMISSION, so the spreadsheet app can read the file. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

type ExportRow = {
  set_number: number;
  weight_kg: number | string | null;
  reps: number | null;
  completed_at: string | null;
  exercise: { name: string; equipment: Equipment };
  session: {
    date: string;
    started_at: string;
    programme_day: { name: string } | null;
    /** Only fetched while cycle notes are on. */
    cycle_phase?: CyclePhase | null;
  };
};

/** Every ticked set from her finished sessions, in the order she did them. */
async function fetchExportRows(includeCyclePhase: boolean): Promise<ExportRow[]> {
  const sessionColumns = `date, started_at, completed_at, ${includeCyclePhase ? 'cycle_phase, ' : ''}programme_day:programme_days(name)`;
  const rows: ExportRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('sets')
      .select(
        `id, set_number, weight_kg, reps, completed_at, exercise:exercises(name, equipment), session:sessions!inner(${sessionColumns})`
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

/** Minutes after midnight in the phone's time zone. */
function localMinutes(timestamp: string): number {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

const text = (value: string): XlsxCell => ({ kind: 'text', value });
const number = (value: number | null): XlsxCell => (value === null ? null : { kind: 'number', value });

/** Wide enough for the header and the longest value, within reason. */
function textWidth(header: string, values: string[]): number {
  return Math.min(45, Math.max(header.length, ...values.map((value) => value.length)) + 3);
}

function toSpreadsheet(rows: ExportRow[], includeCyclePhase: boolean): Uint8Array {
  const sessionNames = rows.map((row) => row.session.programme_day?.name ?? '');
  const exerciseNames = rows.map((row) => row.exercise.name);
  const columns: XlsxColumn[] = [
    { header: 'Date', width: 13 },
    { header: 'Start time', width: 11 },
    { header: 'Session', width: textWidth('Session', sessionNames) },
    { header: 'Exercise', width: textWidth('Exercise', exerciseNames) },
    { header: 'Equipment', width: 12 },
    { header: 'Set', width: 6 },
    { header: 'Weight (kg)', width: 12 },
    { header: 'Reps', width: 7 },
    { header: 'Set completed', width: 15 },
    ...(includeCyclePhase ? [{ header: 'Cycle phase', width: 18 }] : []),
  ];
  const cells = rows.map((row, i): XlsxCell[] => {
    const phase = row.session.cycle_phase;
    return [
      { kind: 'date', value: row.session.date },
      { kind: 'time', value: localMinutes(row.session.started_at) },
      sessionNames[i] ? text(sessionNames[i]) : null,
      text(exerciseNames[i]),
      text(EQUIPMENT_LABELS[row.exercise.equipment]),
      number(row.set_number),
      number(row.weight_kg === null ? null : Number(row.weight_kg)),
      number(row.reps),
      row.completed_at ? { kind: 'time', value: localMinutes(row.completed_at) } : null,
      ...(includeCyclePhase ? [phase ? text(CYCLE_PHASE_LABELS[phase]) : null] : []),
    ];
  });
  return buildXlsx('Workouts', columns, cells);
}

export type ExportResult =
  | { status: 'empty' }
  | { status: 'cancelled' }
  | { status: 'saved'; fileName: string; setCount: number; uri: string };

/** Opening needs an Android intent; on iOS she opens the file from the Files app. */
export const canOpenExportedFile = Platform.OS === 'android';

/** Opens a saved export in her spreadsheet app. Rejects if no installed app can open it. */
export async function openExportedFile(uri: string): Promise<void> {
  await startActivityAsync('android.intent.action.VIEW', {
    data: uri,
    type: XLSX_MIME_TYPE,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}

/**
 * Asks her for a folder (e.g. Documents) and saves her workout history there as an Excel file.
 * Cycle phase is only included while she has cycle notes turned on.
 */
export async function exportWorkoutHistory(includeCyclePhase: boolean): Promise<ExportResult> {
  const rows = await fetchExportRows(includeCyclePhase);
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
  const file = folder.createFile(`workout-history-${stamp}.xlsx`, XLSX_MIME_TYPE);
  file.write(toSpreadsheet(rows, includeCyclePhase));
  return {
    status: 'saved',
    fileName: file.name,
    setCount: rows.length,
    uri: file.uri.startsWith('content://') ? file.uri : file.contentUri,
  };
}
