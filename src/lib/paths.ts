import {
  describeRoutineError,
  fetchCompletedEnrolmentCount,
  toSummary,
  type RoutineSummary,
  type SummaryRow,
} from '@/lib/routines';
import { supabase } from '@/lib/supabase';

export type PathStep = {
  order: number;
  routine: RoutineSummary;
  done: boolean;
  current: boolean;
};

export type RoutinePath = {
  id: string;
  name: string;
  description: string;
  cover: RoutineSummary['cover'];
  is_pro: boolean;
  sort_order: number;
  steps: PathStep[];
  nextRoutine: RoutineSummary | null;
};

const ROUTINE_NEST = `
      id, name, slug, description, goal, length_weeks, days_per_week, session_minutes,
      difficulty, equipment, is_pro, is_featured_eligible, sort_order, source_programme_id, type,
      cover:images (id, url, storage_path, alt_text, licence_source),
      routine_tags (tag)
`;
const ROUTINE_NEST_BASE = `
      id, name, slug, description, goal, length_weeks, days_per_week, session_minutes,
      difficulty, equipment, is_pro, is_featured_eligible, sort_order, source_programme_id,
      cover:images (id, url, storage_path, alt_text, licence_source),
      routine_tags (tag)
`;
const PATH_SELECT = `
  id, name, description, is_pro, sort_order,
  cover:images (id, url, storage_path, alt_text, licence_source),
  routine_path_steps (
    step_order,
    routine:routines (${ROUTINE_NEST})
  )
`;
const PATH_SELECT_BASE = `
  id, name, description, is_pro, sort_order,
  cover:images (id, url, storage_path, alt_text, licence_source),
  routine_path_steps (
    step_order,
    routine:routines (${ROUTINE_NEST_BASE})
  )
`;

function isMissingPaths(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /routine_paths|routine_path_steps/.test(detail)
  );
}

export function missingPathsMessage(): string {
  return 'Programme paths need supabase/paths.sql run in the Supabase SQL editor.';
}

export function describePathError(error: unknown): string {
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  if (/paths\.sql|routine_paths|routine_path_steps/i.test(detail)) return missingPathsMessage();
  return describeRoutineError(error) || detail || 'Check your connection and try again.';
}

type PathRow = {
  id: string;
  name: string;
  description: string;
  is_pro: boolean;
  sort_order: number;
  cover: RoutineSummary['cover'] | RoutineSummary['cover'][] | null;
  routine_path_steps: {
    step_order: number;
    routine: SummaryRow | null;
  }[] | null;
};

function oneCover<T>(cover: T | T[] | null): T | null {
  if (!cover) return null;
  return Array.isArray(cover) ? (cover[0] ?? null) : cover;
}

function toPath(row: PathRow, completedIds: Set<string>, activeId: string | null): RoutinePath {
  const ordered = [...(row.routine_path_steps ?? [])]
    .filter((step) => step.routine)
    .sort((a, b) => a.step_order - b.step_order);
  const steps: PathStep[] = ordered.map((step) => {
    const routine = toSummary(step.routine!);
    const done = completedIds.has(routine.id);
    return {
      order: step.step_order,
      routine,
      done,
      current: !done && activeId === routine.id,
    };
  });
  const nextRoutine = steps.find((step) => !step.done)?.routine ?? null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cover: oneCover(row.cover),
    is_pro: row.is_pro,
    sort_order: row.sort_order,
    steps,
    nextRoutine,
  };
}

async function completedRoutineIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('routine_enrolments')
    .select('routine_id')
    .eq('status', 'complete');
  if (error) {
    if (isMissingPaths(error) || /routine_enrolments/i.test(error.message)) return new Set();
    throw new Error(error.message);
  }
  return new Set((data ?? []).map((row) => (row as { routine_id: string }).routine_id));
}

async function activeRoutineId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('routine_enrolments')
    .select('routine_id')
    .eq('status', 'active')
    .maybeSingle();
  if (error) return null;
  return (data as { routine_id: string } | null)?.routine_id ?? null;
}

async function selectPaths(singleId?: string) {
  const run = (columns: string) => {
    const query = supabase.from('routine_paths').select(columns);
    return singleId
      ? query.eq('id', singleId).maybeSingle()
      : query.order('sort_order', { ascending: true });
  };
  const withType = await run(PATH_SELECT);
  if (!withType.error || isMissingPaths(withType.error)) return withType;
  if (!/type/i.test(withType.error.message ?? '')) return withType;
  return run(PATH_SELECT_BASE);
}

export async function fetchPaths(): Promise<RoutinePath[]> {
  const { data, error } = await selectPaths();
  if (error) {
    if (isMissingPaths(error)) return [];
    throw new Error(error.message);
  }
  const [completed, activeId] = await Promise.all([completedRoutineIds(), activeRoutineId()]);
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as unknown as PathRow[];
  return rows.map((row) => toPath(row, completed, activeId));
}

export async function fetchPath(id: string): Promise<RoutinePath | null> {
  const { data, error } = await selectPaths(id);
  if (error) {
    if (isMissingPaths(error)) return null;
    throw new Error(error.message);
  }
  if (!data || Array.isArray(data)) return null;
  const [completed, activeId] = await Promise.all([completedRoutineIds(), activeRoutineId()]);
  return toPath(data as unknown as PathRow, completed, activeId);
}

/** Next unfinished routine on any path that contains this routine. */
export async function nextRoutineOnPath(routineId: string): Promise<{
  path: RoutinePath;
  routine: RoutineSummary;
} | null> {
  const paths = await fetchPaths();
  for (const path of paths) {
    const index = path.steps.findIndex((step) => step.routine.id === routineId);
    if (index < 0) continue;
    const next = path.steps.slice(index + 1).find((step) => !step.done);
    if (next) return { path, routine: next.routine };
  }
  return null;
}

export async function hasCompletedARoutine(): Promise<boolean> {
  return (await fetchCompletedEnrolmentCount()) > 0;
}
