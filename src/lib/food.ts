/**
 * Recipes and collections from content/food (AGENTS.md F1 to F3).
 * Bundled. content:sync reports the files; live writes wait until food_f2.sql is pasted and a live sync is confirmed.
 * nutrition_per_serving stays null until nutrition_calc.py fills it. Never guess macros.
 */
import collectionsFile from '../../content/food/collections.json';
import recipesFile from '../../content/food/recipes.json';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'smoothie'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const DIETARY_TAGS = ['vegetarian', 'vegan', 'gluten_free', 'dairy_free'] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

export const VERIFIED_CLAIMS = ['high_protein', 'high_fibre'] as const;
export type VerifiedClaim = (typeof VERIFIED_CLAIMS)[number];

export const RECIPE_FILTERS = [
  'high_protein',
  'high_fibre',
  'vegetarian',
  'vegan',
  'dairy_free',
  'gluten_free',
  'quick',
] as const;
export type RecipeFilter = (typeof RECIPE_FILTERS)[number];

const MIN_CLAIM_RECIPES = 5;
const QUICK_MINUTES = 20;

export type MealTypeTile = {
  mealType: MealType;
  name: string;
  coverImageSlug: string;
};

export type RecipeIngredient = {
  ingredientKey: string;
  name: string;
  quantity: number;
  unit: string | null;
  display: string;
  note: string | null;
  aisle: string;
};

export type NutritionPerServing = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fibreG: number;
};

export type Recipe = {
  slug: string;
  title: string;
  summary: string;
  coverImageSlug: string;
  mealType: MealType;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  ingredients: RecipeIngredient[];
  methodSteps: string[];
  nutrition: NutritionPerServing | null;
  allergens: string[];
  allergenLabels: string[];
  checkLabelNotes: string[];
  dietaryTags: DietaryTag[];
  verifiedClaims: VerifiedClaim[];
};

export type RecipeCollection = {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  coverImageSlug: string;
  requiresVerifiedClaim: string | null;
  recipeSlugs: string[];
};

export type VisibleCollection = RecipeCollection & { recipes: Recipe[] };

export type ScaledIngredient = RecipeIngredient & { scaledAmount: string; scaledDisplay: string };

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

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMealType(value: unknown): MealType | null {
  const raw = text(value);
  return MEAL_TYPES.includes(raw as MealType) ? (raw as MealType) : null;
}

function parseDietaryTags(value: unknown): DietaryTag[] {
  const seen = new Set<DietaryTag>();
  for (const item of asArray(value)) {
    const tag = text(item);
    if (DIETARY_TAGS.includes(tag as DietaryTag)) seen.add(tag as DietaryTag);
  }
  return [...seen];
}

function parseVerifiedClaims(value: unknown): VerifiedClaim[] {
  const seen = new Set<VerifiedClaim>();
  for (const item of asArray(value)) {
    const tag = text(item);
    if (VERIFIED_CLAIMS.includes(tag as VerifiedClaim)) seen.add(tag as VerifiedClaim);
  }
  return [...seen];
}

function parseIngredient(raw: unknown, index: number): RecipeIngredient | null {
  const row = asRecord(raw);
  const name = text(row.name);
  if (!name) return null;
  const unit = text(row.unit) || null;
  return {
    ingredientKey: text(row.ingredient_key) || `ingredient-${index}`,
    name,
    quantity: num(row.quantity),
    unit,
    display: text(row.display) || [row.quantity, unit, name].filter(Boolean).join(' '),
    note: text(row.note) || null,
    aisle: text(row.aisle),
  };
}

function pickNumber(row: Json, keys: string[]): number | null {
  for (const key of keys) {
    const value = num(row[key]);
    if (value > 0 || row[key] === 0) return Number(row[key]);
  }
  return null;
}

function parseNutrition(raw: unknown): NutritionPerServing | null {
  if (raw == null) return null;
  const row = asRecord(raw);
  const calories = pickNumber(row, ['calories', 'kcal', 'energy_kcal']);
  const proteinG = pickNumber(row, ['protein_g', 'protein']);
  const carbsG = pickNumber(row, ['carbs_g', 'carbohydrate_g', 'carbs']);
  const fatG = pickNumber(row, ['fat_g', 'fat']);
  const fibreG = pickNumber(row, ['fibre_g', 'fiber_g', 'fibre']);
  if (calories == null && proteinG == null && carbsG == null && fatG == null && fibreG == null) {
    return null;
  }
  return {
    calories: calories ?? 0,
    proteinG: proteinG ?? 0,
    carbsG: carbsG ?? 0,
    fatG: fatG ?? 0,
    fibreG: fibreG ?? 0,
  };
}

function parseRecipe(raw: unknown): Recipe | null {
  const row = asRecord(raw);
  const slug = text(row.slug);
  const title = text(row.title);
  const mealType = parseMealType(row.meal_type);
  if (!slug || !title || !mealType) return null;
  return {
    slug,
    title,
    summary: text(row.summary),
    coverImageSlug: text(row.cover_image_slug),
    mealType,
    prepMinutes: Math.max(0, Math.round(num(row.prep_minutes))),
    cookMinutes: Math.max(0, Math.round(num(row.cook_minutes))),
    servings: Math.max(1, Math.round(num(row.servings) || 1)),
    ingredients: asArray(row.ingredients)
      .map((item, index) => parseIngredient(item, index))
      .filter((item): item is RecipeIngredient => item != null),
    methodSteps: asArray(row.method_steps).map(text).filter(Boolean),
    nutrition: parseNutrition(row.nutrition_per_serving),
    allergens: asArray(row.allergens).map(text).filter(Boolean),
    allergenLabels: asArray(row.allergen_labels).map(text).filter(Boolean),
    checkLabelNotes: asArray(row.check_label_notes).map(text).filter(Boolean),
    dietaryTags: parseDietaryTags(row.dietary_tags),
    verifiedClaims: parseVerifiedClaims(row.verified_claims),
  };
}

function parseCollection(raw: unknown): RecipeCollection | null {
  const row = asRecord(raw);
  const slug = text(row.slug);
  const name = text(row.name);
  if (!slug || !name) return null;
  const claim = text(row.requires_verified_claim);
  return {
    slug,
    name,
    description: text(row.description),
    sortOrder: num(row.sort_order),
    coverImageSlug: text(row.cover_image_slug),
    requiresVerifiedClaim: claim || null,
    recipeSlugs: asArray(row.recipe_slugs).map(text).filter(Boolean),
  };
}

function parseMealTiles(raw: unknown, recipes: Recipe[]): MealTypeTile[] {
  const fromFile = asArray(raw)
    .map((item) => {
      const row = asRecord(item);
      const mealType = parseMealType(row.meal_type);
      const name = text(row.name);
      if (!mealType || !name) return null;
      const coverImageSlug =
        recipes.find((recipe) => recipe.mealType === mealType)?.coverImageSlug ?? '';
      return { mealType, name, coverImageSlug };
    })
    .filter((item): item is MealTypeTile => item != null);
  if (fromFile.length > 0) return fromFile;
  return MEAL_TYPES.map((mealType) => ({
    mealType,
    name:
      mealType === 'snack'
        ? 'Snacks'
        : mealType === 'smoothie'
          ? 'Smoothies'
          : mealType[0].toUpperCase() + mealType.slice(1),
    coverImageSlug: recipes.find((recipe) => recipe.mealType === mealType)?.coverImageSlug ?? '',
  }));
}

const recipesRoot = asRecord(recipesFile);
const collectionsRoot = asRecord(collectionsFile);

export const RECIPE_DISCLAIMER = text(recipesRoot.disclaimer);

export const ALLERGEN_NAMES: Record<string, string> = Object.fromEntries(
  asArray(recipesRoot.allergen_list).map((item) => {
    const row = asRecord(item);
    return [text(row.id), text(row.name)];
  }).filter(([id, name]) => id && name)
);

export const RECIPES: Recipe[] = asArray(recipesRoot.recipes)
  .map(parseRecipe)
  .filter((item): item is Recipe => item != null);

const RECIPE_BY_SLUG = new Map(RECIPES.map((recipe) => [recipe.slug, recipe]));

export const MEAL_TYPE_TILES: MealTypeTile[] = parseMealTiles(recipesRoot.meal_type_tiles, RECIPES);

export const COLLECTIONS: RecipeCollection[] = asArray(collectionsRoot.collections)
  .map(parseCollection)
  .filter((item): item is RecipeCollection => item != null)
  .sort((a, b) => a.sortOrder - b.sortOrder);

export function recipeBySlug(slug: string | null | undefined): Recipe | null {
  if (!slug) return null;
  return RECIPE_BY_SLUG.get(slug) ?? null;
}

export function recipesForMealType(mealType: MealType): Recipe[] {
  return RECIPES.filter((recipe) => recipe.mealType === mealType);
}

export function mealTypeTile(mealType: MealType): MealTypeTile | null {
  return MEAL_TYPE_TILES.find((tile) => tile.mealType === mealType) ?? null;
}

export function mealTypeName(mealType: MealType): string {
  return mealTypeTile(mealType)?.name ?? mealType;
}

export function isMealType(value: string | null | undefined): value is MealType {
  return Boolean(value && MEAL_TYPES.includes(value as MealType));
}

function recipesForCollection(collection: RecipeCollection): Recipe[] {
  const claim = collection.requiresVerifiedClaim;
  return collection.recipeSlugs
    .map((slug) => RECIPE_BY_SLUG.get(slug))
    .filter((recipe): recipe is Recipe => Boolean(recipe))
    .filter((recipe) => !claim || recipe.verifiedClaims.includes(claim as VerifiedClaim));
}

export function visibleCollections(): VisibleCollection[] {
  return COLLECTIONS.map((collection) => ({
    ...collection,
    recipes: recipesForCollection(collection),
  })).filter((collection) => {
    if (collection.requiresVerifiedClaim) return collection.recipes.length >= MIN_CLAIM_RECIPES;
    return collection.recipes.length > 0;
  });
}

export function collectionBySlug(slug: string | null | undefined): VisibleCollection | null {
  if (!slug) return null;
  return visibleCollections().find((collection) => collection.slug === slug) ?? null;
}

export function recipeTotalMinutes(recipe: Recipe): number {
  return recipe.prepMinutes + recipe.cookMinutes;
}

export function recipeMatchesFilter(recipe: Recipe, filter: RecipeFilter): boolean {
  if (filter === 'quick') return recipeTotalMinutes(recipe) <= QUICK_MINUTES;
  if (filter === 'high_protein' || filter === 'high_fibre') {
    return recipe.verifiedClaims.includes(filter);
  }
  return recipe.dietaryTags.includes(filter);
}

export function availableFilters(recipes: Recipe[]): RecipeFilter[] {
  return RECIPE_FILTERS.filter((filter) => recipes.some((recipe) => recipeMatchesFilter(recipe, filter)));
}

export function filterRecipes(recipes: Recipe[], query: string, filters: RecipeFilter[]): Recipe[] {
  const needle = query.trim().toLowerCase();
  return recipes.filter((recipe) => {
    if (needle) {
      const haystack = `${recipe.title} ${recipe.summary}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return filters.every((filter) => recipeMatchesFilter(recipe, filter));
  });
}

export function searchRecipes(query: string): Recipe[] {
  return filterRecipes(RECIPES, query, []);
}

function formatNumber(value: number, places: number): string {
  const fixed = value.toFixed(places);
  return fixed.replace(/\.?0+$/, '');
}

function formatScaledAmount(quantity: number, unit: string | null, name: string): string {
  const lower = name.toLowerCase();
  if (unit === 'pinch') {
    const n = Math.max(1, Math.round(quantity));
    return n === 1 ? '1 pinch' : `${n} pinches`;
  }
  if (unit === 'tsp' || unit === 'tbsp') {
    const n = Math.round(quantity * 4) / 4;
    const shown = n < 1 ? formatNumber(n, 2) : n % 1 === 0 ? String(n) : formatNumber(n, 2);
    return `${shown}${unit}`;
  }
  if (unit === 'slice') {
    const n = Math.round(quantity * 2) / 2;
    const shown = n % 1 === 0 ? String(n) : formatNumber(n, 1);
    return shown === '1' ? '1 slice' : `${shown} slices`;
  }
  if (!unit) {
    const whole = /egg|clove|onion|pepper|avocado|banana|lemon|lime|wrap|pitta|muffin/.test(lower);
    const n = whole ? Math.max(1, Math.round(quantity)) : Math.round(quantity * 2) / 2;
    const shown = n % 1 === 0 ? String(n) : formatNumber(n, 1);
    return shown;
  }
  if (unit === 'g' || unit === 'ml') {
    const n = quantity >= 20 ? Math.round(quantity / 5) * 5 : Math.round(quantity);
    return `${Math.max(1, n)}${unit}`;
  }
  const n = Math.round(quantity * 2) / 2;
  const shown = n % 1 === 0 ? String(n) : formatNumber(n, 1);
  return `${shown}${unit}`;
}

export function scaleIngredients(recipe: Recipe, servings: number): ScaledIngredient[] {
  const target = Math.max(1, Math.round(servings));
  const factor = target / recipe.servings;
  return recipe.ingredients.map((ingredient) => {
    const scaled = ingredient.quantity * factor;
    const amount = formatScaledAmount(scaled, ingredient.unit, ingredient.name);
    const note = ingredient.note ? `, ${ingredient.note}` : '';
    const scaledDisplay =
      target === recipe.servings ? ingredient.display : `${amount} ${ingredient.name}${note}`;
    return {
      ...ingredient,
      quantity: scaled,
      scaledAmount: amount,
      scaledDisplay,
    };
  });
}

export function allergenLine(recipe: Recipe): string | null {
  const labels =
    recipe.allergenLabels.length > 0
      ? recipe.allergenLabels
      : recipe.allergens.map((id) => ALLERGEN_NAMES[id] ?? id).filter(Boolean);
  if (labels.length === 0) return null;
  return labels.join(', ');
}
