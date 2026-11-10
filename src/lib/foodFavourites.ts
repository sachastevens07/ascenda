/**
 * Favourite recipes. Saved on-device, and synced to recipe_favourites after food_f2.sql.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase';

const KEY = 'food-favourite-slugs';

function isMissingTable(error: { message?: string; code?: string } | null | undefined): boolean {
  return /recipe_favourites/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

async function readLocal(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function writeLocal(slugs: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(slugs));
}

export async function fetchFavouriteSlugs(): Promise<string[]> {
  const local = await readLocal();
  try {
    const { data, error } = await supabase.from('recipe_favourites').select('recipe_id');
    if (error || !data) return local;
    const remote = data
      .map((row) => (row as { recipe_id?: string }).recipe_id)
      .filter((id): id is string => Boolean(id));
    const merged = [...new Set([...remote, ...local])];
    if (merged.join('|') !== local.join('|')) await writeLocal(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function toggleFavourite(slug: string): Promise<string[]> {
  const current = await fetchFavouriteSlugs();
  const exists = current.includes(slug);
  const next = exists ? current.filter((id) => id !== slug) : [...current, slug];
  await writeLocal(next);
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return next;
    if (exists) {
      const { error } = await supabase
        .from('recipe_favourites')
        .delete()
        .eq('user_id', user.id)
        .eq('recipe_id', slug);
      if (error && !isMissingTable(error)) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('recipe_favourites')
        .upsert({ user_id: user.id, recipe_id: slug }, { onConflict: 'user_id,recipe_id' });
      if (error && !isMissingTable(error)) throw new Error(error.message);
    }
  } catch {
    return next;
  }
  return next;
}

export function useFoodFavourites() {
  const [slugs, setSlugs] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      fetchFavouriteSlugs()
        .then((ids) => {
          if (isCurrent) setSlugs(ids);
        })
        .catch(() => {
          if (isCurrent) setSlugs([]);
        });
      return () => {
        isCurrent = false;
      };
    }, [])
  );

  async function toggle(slug: string): Promise<void> {
    const next = await toggleFavourite(slug);
    setSlugs(next);
  }

  return {
    slugs,
    isFavourite: (slug: string) => slugs.includes(slug),
    toggle,
  };
}
