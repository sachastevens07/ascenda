import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

const NOTE_KEY = 'exercise-note';
const REST_KEY = 'exercise-rest';
const MAX_NOTE_LENGTH = 280;

export const EXERCISE_REST_OPTIONS = [60, 90, 120, 150, 180] as const;

export type ExercisePrefs = {
  notes: Record<string, string>;
  rest: Record<string, number>;
};

function noteKey(userId: string, exerciseId: string): string {
  return `${NOTE_KEY}:${userId}:${exerciseId}`;
}

function restKey(userId: string, exerciseId: string): string {
  return `${REST_KEY}:${userId}:${exerciseId}`;
}

function isMissingPrefsTable(error: { message?: string; code?: string } | null | undefined): boolean {
  return /42P01|exercise_notes|exercise_rest_prefs/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

function clipNote(value: string): string {
  return value.trim().slice(0, MAX_NOTE_LENGTH);
}

async function currentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function fetchExercisePrefs(exerciseIds: string[]): Promise<ExercisePrefs> {
  const notes: Record<string, string> = {};
  const rest: Record<string, number> = {};
  if (exerciseIds.length === 0) return { notes, rest };

  const userId = await currentUserId();
  if (userId) {
    const stored = await AsyncStorage.multiGet(
      exerciseIds.flatMap((id) => [noteKey(userId, id), restKey(userId, id)])
    );
    for (const [key, value] of stored) {
      if (!value) continue;
      const noteMatch = key.startsWith(`${NOTE_KEY}:${userId}:`);
      const restMatch = key.startsWith(`${REST_KEY}:${userId}:`);
      const exerciseId = key.slice(key.lastIndexOf(':') + 1);
      if (noteMatch) notes[exerciseId] = value;
      if (restMatch) {
        const seconds = Number.parseInt(value, 10);
        if (Number.isFinite(seconds) && seconds > 0) rest[exerciseId] = seconds;
      }
    }
  }

  const noteQuery = supabase
    .from('exercise_notes')
    .select('exercise_id, note')
    .in('exercise_id', exerciseIds);
  const restQuery = supabase
    .from('exercise_rest_prefs')
    .select('exercise_id, rest_seconds')
    .in('exercise_id', exerciseIds);
  const [noteResult, restResult] = await Promise.all([noteQuery, restQuery]);

  if (!noteResult.error) {
    for (const row of noteResult.data ?? []) {
      const id = (row as { exercise_id: string }).exercise_id;
      const text = clipNote((row as { note: string }).note ?? '');
      if (text) notes[id] = text;
    }
  } else if (!isMissingPrefsTable(noteResult.error)) {
    throw noteResult.error;
  }

  if (!restResult.error) {
    for (const row of restResult.data ?? []) {
      const id = (row as { exercise_id: string }).exercise_id;
      const seconds = Number((row as { rest_seconds: number }).rest_seconds);
      if (Number.isFinite(seconds) && seconds > 0) rest[id] = seconds;
    }
  } else if (!isMissingPrefsTable(restResult.error)) {
    throw restResult.error;
  }

  return { notes, rest };
}

export async function saveExerciseNote(exerciseId: string, note: string): Promise<void> {
  const userId = await currentUserId();
  const text = clipNote(note);
  if (userId) {
    const key = noteKey(userId, exerciseId);
    if (text) await AsyncStorage.setItem(key, text);
    else await AsyncStorage.removeItem(key);
  }

  if (text) {
    const { error } = await supabase.from('exercise_notes').upsert(
      {
        ...(userId ? { user_id: userId } : {}),
        exercise_id: exerciseId,
        note: text,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,exercise_id' }
    );
    if (error && !isMissingPrefsTable(error)) throw error;
    return;
  }

  let query = supabase.from('exercise_notes').delete().eq('exercise_id', exerciseId);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error && !isMissingPrefsTable(error)) throw error;
}

export async function saveExerciseRestPref(exerciseId: string, restSeconds: number): Promise<void> {
  const seconds = Math.round(restSeconds);
  if (!Number.isFinite(seconds) || seconds < 15 || seconds > 600) return;
  const userId = await currentUserId();
  if (userId) await AsyncStorage.setItem(restKey(userId, exerciseId), String(seconds));
  const { error } = await supabase.from('exercise_rest_prefs').upsert(
    {
      ...(userId ? { user_id: userId } : {}),
      exercise_id: exerciseId,
      rest_seconds: seconds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,exercise_id' }
  );
  if (error && !isMissingPrefsTable(error)) throw error;
}
