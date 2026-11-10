/**
 * Shopping list (AGENTS.md F5). Saved on-device; syncs to shopping_list_items after food_f5.sql.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { formatIngredientAmount, recipeBySlug, scaleIngredients, type Recipe } from '@/lib/food';
import { supabase } from '@/lib/supabase';

const KEY = 'food-shopping-list';

const AISLE_ORDER = [
  'Fruit and veg',
  'Meat and fish',
  'Dairy and eggs',
  'Chilled',
  'Bakery',
  'Rice, pasta and grains',
  'Tins and jars',
  'Frozen',
  'Oils, sauces and spreads',
  'Herbs and spices',
];

export type ShoppingItem = {
  id: string;
  recipeSlug: string;
  ingredientKey: string;
  name: string;
  quantity: number;
  unit: string | null;
  amount: string;
  aisle: string;
  ticked: boolean;
};

function isMissingTable(error: { message?: string; code?: string } | null | undefined): boolean {
  return /shopping_list_items/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

function asItem(raw: unknown): ShoppingItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const recipeSlug = typeof row.recipeSlug === 'string' ? row.recipeSlug : typeof row.recipe_id === 'string' ? row.recipe_id : '';
  const ingredientKey =
    typeof row.ingredientKey === 'string'
      ? row.ingredientKey
      : typeof row.ingredient_key === 'string'
        ? row.ingredient_key
        : '';
  const name = typeof row.name === 'string' ? row.name : typeof row.ingredient === 'string' ? row.ingredient : '';
  if (!recipeSlug || !ingredientKey || !name) return null;
  const unit = typeof row.unit === 'string' && row.unit ? row.unit : null;
  const quantity = Number(row.quantity);
  const qty = Number.isFinite(quantity) ? quantity : 0;
  const storedAmount = typeof row.amount === 'string' ? row.amount : '';
  const amount =
    unit === 'g' || unit === 'ml' || !storedAmount || /^\d+(\.\d+)?$/.test(storedAmount.trim())
      ? formatIngredientAmount(qty, unit, name)
      : storedAmount;
  return {
    id: typeof row.id === 'string' && row.id ? row.id : `${recipeSlug}:${ingredientKey}`,
    recipeSlug,
    ingredientKey,
    name,
    quantity: qty,
    unit,
    amount,
    aisle: typeof row.aisle === 'string' ? row.aisle : '',
    ticked: row.ticked === true,
  };
}

async function readLocal(): Promise<ShoppingItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(asItem).filter((item): item is ShoppingItem => item != null) : [];
  } catch {
    return [];
  }
}

async function writeLocal(items: ShoppingItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

function toRow(userId: string, item: ShoppingItem) {
  return {
    user_id: userId,
    recipe_id: item.recipeSlug,
    ingredient_key: item.ingredientKey,
    ingredient: item.name,
    quantity: item.quantity,
    unit: item.unit,
    aisle: item.aisle,
    ticked: item.ticked,
  };
}

export async function fetchShoppingList(): Promise<ShoppingItem[]> {
  const local = await readLocal();
  try {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .select('id, recipe_id, ingredient_key, ingredient, quantity, unit, aisle, ticked');
    if (error || !data) return local;
    const remote = data.map(asItem).filter((item): item is ShoppingItem => item != null);
    if (remote.length === 0 && local.length > 0) {
      await pushAll(local);
      return local;
    }
    await writeLocal(remote);
    return remote;
  } catch {
    return local;
  }
}

async function pushAll(items: ShoppingItem[]): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || items.length === 0) return;
  const { error } = await supabase.from('shopping_list_items').upsert(
    items.map((item) => toRow(user.id, item)),
    { onConflict: 'user_id,recipe_id,ingredient_key' }
  );
  if (error && !isMissingTable(error)) throw new Error(error.message);
}

async function saveList(items: ShoppingItem[]): Promise<ShoppingItem[]> {
  await writeLocal(items);
  try {
    await pushAll(items);
  } catch {
    return items;
  }
  return items;
}

function shoppingRow(recipe: Recipe, ingredient: ReturnType<typeof scaleIngredients>[number]): ShoppingItem {
  return {
    id: `${recipe.slug}:${ingredient.ingredientKey}`,
    recipeSlug: recipe.slug,
    ingredientKey: ingredient.ingredientKey,
    name: ingredient.note ? `${ingredient.name}, ${ingredient.note}` : ingredient.name,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    amount: formatIngredientAmount(ingredient.quantity, ingredient.unit, ingredient.name),
    aisle: ingredient.aisle,
    ticked: false,
  };
}

export async function addRecipeToShoppingList(recipe: Recipe, servings: number): Promise<'added' | 'updated'> {
  const current = await fetchShoppingList();
  const scaled = scaleIngredients(recipe, servings);
  const already = current.some((item) => item.recipeSlug === recipe.slug);
  const without = current.filter((item) => item.recipeSlug !== recipe.slug);
  const next = [...without, ...scaled.map((ingredient) => shoppingRow(recipe, ingredient))];
  await saveList(next);
  return already ? 'updated' : 'added';
}

export async function addMissingIngredientsToShoppingList(
  recipe: Recipe,
  missingKeys: string[],
  servings = recipe.servings
): Promise<'added' | 'updated'> {
  const want = new Set(missingKeys);
  if (want.size === 0) return 'updated';
  const current = await fetchShoppingList();
  const scaled = scaleIngredients(recipe, servings).filter((ingredient) => want.has(ingredient.ingredientKey));
  const existing = new Set(
    current.filter((item) => item.recipeSlug === recipe.slug).map((item) => item.ingredientKey)
  );
  const additions = scaled
    .filter((ingredient) => !existing.has(ingredient.ingredientKey))
    .map((ingredient) => shoppingRow(recipe, ingredient));
  if (additions.length === 0) return 'updated';
  await saveList([...current, ...additions]);
  return existing.size > 0 ? 'updated' : 'added';
}

export async function toggleShoppingItem(id: string): Promise<ShoppingItem[]> {
  const current = await fetchShoppingList();
  const next = current.map((item) => (item.id === id ? { ...item, ticked: !item.ticked } : item));
  const changed = next.find((item) => item.id === id);
  await writeLocal(next);
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && changed) {
      const { error } = await supabase
        .from('shopping_list_items')
        .update({ ticked: changed.ticked })
        .eq('user_id', user.id)
        .eq('recipe_id', changed.recipeSlug)
        .eq('ingredient_key', changed.ingredientKey);
      if (error && !isMissingTable(error)) throw new Error(error.message);
    }
  } catch {
    return next;
  }
  return next;
}

export async function removeShoppingItem(id: string): Promise<ShoppingItem[]> {
  const current = await fetchShoppingList();
  const removed = current.find((item) => item.id === id);
  const next = current.filter((item) => item.id !== id);
  await writeLocal(next);
  if (!removed) return next;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return next;
    const { error } = await supabase
      .from('shopping_list_items')
      .delete()
      .eq('user_id', user.id)
      .eq('recipe_id', removed.recipeSlug)
      .eq('ingredient_key', removed.ingredientKey);
    if (error && !isMissingTable(error)) throw new Error(error.message);
  } catch {
    return next;
  }
  return next;
}

export async function removeRecipeFromShoppingList(slug: string): Promise<ShoppingItem[]> {
  const current = await fetchShoppingList();
  const next = current.filter((item) => item.recipeSlug !== slug);
  await writeLocal(next);
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return next;
    const { error } = await supabase.from('shopping_list_items').delete().eq('user_id', user.id).eq('recipe_id', slug);
    if (error && !isMissingTable(error)) throw new Error(error.message);
  } catch {
    return next;
  }
  return next;
}

export async function clearTickedShoppingItems(): Promise<ShoppingItem[]> {
  const current = await fetchShoppingList();
  const ticked = current.filter((item) => item.ticked);
  const next = current.filter((item) => !item.ticked);
  await writeLocal(next);
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || ticked.length === 0) return next;
    for (const item of ticked) {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('user_id', user.id)
        .eq('recipe_id', item.recipeSlug)
        .eq('ingredient_key', item.ingredientKey);
      if (error && !isMissingTable(error)) throw new Error(error.message);
    }
  } catch {
    return next;
  }
  return next;
}

export function shoppingRecipes(items: ShoppingItem[]): Recipe[] {
  const seen = new Set<string>();
  const recipes: Recipe[] = [];
  for (const item of items) {
    if (seen.has(item.recipeSlug)) continue;
    seen.add(item.recipeSlug);
    const recipe = recipeBySlug(item.recipeSlug);
    if (recipe) recipes.push(recipe);
  }
  return recipes;
}

export function groupShoppingByAisle(items: ShoppingItem[]): { aisle: string; items: ShoppingItem[] }[] {
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const aisle = item.aisle.trim() || '';
    const list = groups.get(aisle) ?? [];
    list.push(item);
    groups.set(aisle, list);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const ai = AISLE_ORDER.indexOf(a);
    const bi = AISLE_ORDER.indexOf(b);
    const ao = ai === -1 ? AISLE_ORDER.length : ai;
    const bo = bi === -1 ? AISLE_ORDER.length : bi;
    if (ao !== bo) return ao - bo;
    return a.localeCompare(b);
  });
  return keys.map((aisle) => ({ aisle, items: groups.get(aisle) ?? [] }));
}

export function useShoppingList() {
  const [items, setItems] = useState<ShoppingItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      fetchShoppingList()
        .then((list) => {
          if (isCurrent) setItems(list);
        })
        .catch(() => {
          if (isCurrent) setItems([]);
        });
      return () => {
        isCurrent = false;
      };
    }, [])
  );

  return { items, setItems };
}
