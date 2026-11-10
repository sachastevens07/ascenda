/**
 * Recipes and collections from content/food (AGENTS.md F1).
 * Bundled. content:sync reports the files; live writes wait for F2 tables.
 * nutrition_per_serving stays null until nutrition_calc.py fills it. Never guess macros.
 */
import collectionsFile from '../../content/food/collections.json';
import recipesFile from '../../content/food/recipes.json';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'smoothie'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const DIETARY_TAGS = ['vegetarian', 'vegan', 'gluten_free', 'dairy_free'] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

const MIN_CLAIM_RECIPES = 5;

export type MealTypeTile = {
  mealType: MealType;
  name: string;
  coverImageSlug: string;
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
  dietaryTags: DietaryTag[];
  verifiedClaims: string[];
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
    dietaryTags: parseDietaryTags(row.dietary_tags),
    verifiedClaims: asArray(row.verified_claims).map(text).filter(Boolean),
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
    name: mealType === 'snack' ? 'Snacks' : mealType === 'smoothie' ? 'Smoothies' : mealType[0].toUpperCase() + mealType.slice(1),
    coverImageSlug: recipes.find((recipe) => recipe.mealType === mealType)?.coverImageSlug ?? '',
  }));
}

const recipesRoot = asRecord(recipesFile);
const collectionsRoot = asRecord(collectionsFile);

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
    .filter((recipe) => !claim || recipe.verifiedClaims.includes(claim));
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

export function searchRecipes(query: string): Recipe[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return RECIPES;
  return RECIPES.filter(
    (recipe) =>
      recipe.title.toLowerCase().includes(needle) || recipe.summary.toLowerCase().includes(needle)
  );
}
