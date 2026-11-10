/**
 * AI6 ranking. Score = matched non-pantry / total non-pantry.
 * Pantry is salt, pepper, oil, dried spices and herbs. Optional notes are excluded.
 * The Edge Function uses the same rule on supabase/functions/what-can-i-cook/recipes.json.
 */
import {
  RECIPES,
  recipeMatchesFilter,
  type Recipe,
  type RecipeFilter,
  type RecipeIngredient,
} from '@/lib/food';

const OIL_KEYS = new Set(['olive_oil', 'sesame_oil']);

export type CookIngredient = {
  key: string;
  name: string;
  label: string;
  pantry: boolean;
};

export type CookMatch = {
  recipe: Recipe;
  have: number;
  need: number;
  missing: RecipeIngredient[];
  score: number;
};

export function isOptionalIngredient(ingredient: RecipeIngredient): boolean {
  return (ingredient.note ?? '').toLowerCase() === 'optional';
}

export function isPantryIngredient(ingredient: RecipeIngredient): boolean {
  if (ingredient.aisle === 'Herbs and spices') return true;
  return OIL_KEYS.has(ingredient.ingredientKey);
}

function ingredientLabel(name: string, key: string): string {
  const base = name.split(',')[0].replace(/\s*\([^)]*\)/g, '').trim();
  if (base.length > 0 && base.length <= 32) return base;
  return key.replace(/_/g, ' ');
}

export const COOK_INGREDIENTS: CookIngredient[] = (() => {
  const map = new Map<string, CookIngredient>();
  for (const recipe of RECIPES) {
    for (const ingredient of recipe.ingredients) {
      if (map.has(ingredient.ingredientKey)) continue;
      map.set(ingredient.ingredientKey, {
        key: ingredient.ingredientKey,
        name: ingredient.name,
        label: ingredientLabel(ingredient.name, ingredient.ingredientKey),
        pantry: isPantryIngredient(ingredient),
      });
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
})();

const COOK_INGREDIENT_KEYS = new Set(COOK_INGREDIENTS.map((item) => item.key));

export function knownCookIngredientKey(value: string): boolean {
  return COOK_INGREDIENT_KEYS.has(value);
}

function normaliseToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchIngredientToken(token: string): string | null {
  const compact = normaliseToken(token);
  if (!compact) return null;
  const asKey = compact.replace(/\s+/g, '_');
  const exactKey = COOK_INGREDIENTS.find((item) => item.key === asKey);
  if (exactKey) return exactKey.key;
  const exactLabel = COOK_INGREDIENTS.find((item) => {
    const label = item.label.toLowerCase();
    const name = item.name.toLowerCase();
    const words = item.key.replace(/_/g, ' ');
    return label === compact || name === compact || words === compact;
  });
  if (exactLabel) return exactLabel.key;
  const stemmed = compact.endsWith('es')
    ? compact.slice(0, -2)
    : compact.endsWith('s')
      ? compact.slice(0, -1)
      : compact;
  let best: CookIngredient | null = null;
  for (const item of COOK_INGREDIENTS) {
    const label = item.label.toLowerCase();
    const words = item.key.replace(/_/g, ' ');
    if (label === stemmed || words === stemmed) return item.key;
    const hit =
      (compact.length >= 3 && (label.includes(compact) || words.includes(compact))) ||
      (label.length >= 3 && compact.includes(label));
    if (!hit) continue;
    if (!best || label.length > best.label.length) best = item;
  }
  return best?.key ?? null;
}

/** Map a typed list to catalogue keys so Type mode works without the Edge Function. */
export function ingredientKeysFromText(raw: string): { keys: string[]; unrecognised: string[] } {
  const parts = raw
    .split(/[,;\n]+|\s+and\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const keys: string[] = [];
  const seen = new Set<string>();
  const unrecognised: string[] = [];
  for (const part of parts) {
    const key = matchIngredientToken(part);
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    } else if (!key) {
      unrecognised.push(part);
    }
  }
  return { keys, unrecognised: unrecognised.slice(0, 10) };
}

export function rankRecipesForIngredients(haveKeys: Iterable<string>, recipes = RECIPES): CookMatch[] {
  const have = new Set([...haveKeys].filter((key) => COOK_INGREDIENT_KEYS.has(key)));
  const matches: CookMatch[] = [];
  for (const recipe of recipes) {
    const required = recipe.ingredients.filter((ingredient) => !isOptionalIngredient(ingredient));
    const nonPantry = required.filter((ingredient) => !isPantryIngredient(ingredient));
    if (nonPantry.length === 0) continue;
    const matchedNonPantry = nonPantry.filter((ingredient) => have.has(ingredient.ingredientKey));
    if (matchedNonPantry.length === 0) continue;
    const missing = nonPantry.filter((ingredient) => !have.has(ingredient.ingredientKey));
    matches.push({
      recipe,
      have: required.filter((ingredient) => isPantryIngredient(ingredient) || have.has(ingredient.ingredientKey))
        .length,
      need: required.length,
      missing,
      score: matchedNonPantry.length / nonPantry.length,
    });
  }
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
    return a.recipe.title.localeCompare(b.recipe.title);
  });
  return matches;
}

export function topCookMatches(matches: CookMatch[], filters: RecipeFilter[]): CookMatch[] {
  const filtered =
    filters.length === 0
      ? matches
      : matches.filter((match) => filters.every((filter) => recipeMatchesFilter(match.recipe, filter)));
  return filtered.slice(0, 5);
}
