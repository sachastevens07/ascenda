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
