/**
 * Hide recipe nutrition (AGENTS.md F3). On-device until food_f2.sql adds profiles.hide_macros.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

const KEY = 'hide_macros';

function isMissingColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  return /hide_macros/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

export async function fetchHideMacros(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    const local = stored === '1';
    const { data, error } = await supabase.from('profiles').select('hide_macros').maybeSingle();
    if (error) return local;
    const value = (data as { hide_macros?: boolean | null } | null)?.hide_macros;
    if (typeof value === 'boolean') {
      if (local && !value) {
        await saveHideMacros(true);
        return true;
      }
      return value;
    }
    return local;
  } catch {
    return false;
  }
}

export async function saveHideMacros(hidden: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, hidden ? '1' : '0');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('profiles').update({ hide_macros: hidden }).eq('user_id', user.id);
  if (error && !isMissingColumn(error)) throw new Error(error.message);
}
