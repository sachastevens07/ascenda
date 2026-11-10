import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PhotoFill } from '@/components/ui/Cards';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/constants/theme';
import { fillCopy, foodCopy } from '@/lib/copy';
import type { DietaryTag, NutritionPerServing, Recipe, RecipeFilter, ScaledIngredient } from '@/lib/food';
import type { FuelSuggestion } from '@/lib/foodSuggestions';
import type { ShoppingItem } from '@/lib/shoppingList';

export function openRecipe(slug: string): void {
  router.push({ pathname: '/food/recipe/[slug]', params: { slug } } as Href);
}

export function openRecipeCollection(slug: string): void {
  router.push({ pathname: '/food/collection/[slug]', params: { slug } } as Href);
}

export function recipeMetaLine(recipe: Recipe): string {
  if (recipe.cookMinutes > 0) {
    return fillCopy(foodCopy.prep_cook_serves, {
      prep: recipe.prepMinutes,
      cook: recipe.cookMinutes,
      servings: recipe.servings,
    });
  }
  return fillCopy(foodCopy.prep_serves, {
    prep: recipe.prepMinutes,
    servings: recipe.servings,
  });
}

export function recipePrepLine(recipe: Recipe): string {
  const minutes = recipe.prepMinutes + recipe.cookMinutes;
  if (recipe.cookMinutes > 0 && recipe.prepMinutes > 0) {
    return `Prep ${recipe.prepMinutes} min · Cook ${recipe.cookMinutes} min`;
  }
  return minutes > 0 ? `${minutes} min` : `Prep ${recipe.prepMinutes} min`;
}

export function dietaryLabel(tag: DietaryTag): string {
  if (tag === 'vegetarian') return foodCopy.dietary_vegetarian;
  if (tag === 'vegan') return foodCopy.dietary_vegan;
  if (tag === 'gluten_free') return foodCopy.dietary_gluten_free;
  return foodCopy.dietary_dairy_free;
}

export function filterLabel(filter: RecipeFilter): string {
  if (filter === 'high_protein') return foodCopy.claim_high_protein;
  if (filter === 'high_fibre') return foodCopy.claim_high_fibre;
  if (filter === 'quick') return foodCopy.filter_quick;
  return dietaryLabel(filter);
}

export function recipeTagLabel(recipe: Recipe): string {
  if (recipe.verifiedClaims.includes('high_protein')) return foodCopy.claim_high_protein;
  if (recipe.verifiedClaims.includes('high_fibre')) return foodCopy.claim_high_fibre;
  if (recipe.dietaryTags[0]) return dietaryLabel(recipe.dietaryTags[0]);
  return '';
}

export function MealTypeTile({
  name,
  coverImageSlug,
  onPress,
  style,
}: {
  name: string;
  coverImageSlug: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, shadow } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={({ pressed }) => [style, shadow, pressed && styles.pressed]}>
      <View style={[styles.tile, { borderRadius: radius.xl, backgroundColor: colours.surfaceMuted }]}>
        <PhotoFill slug={coverImageSlug} kind="food" label={name} />
        <View style={[styles.tileFade, { backgroundColor: colours.overlay }]} />
        <AppText
          variant="displaySm"
          style={[styles.tileLabel, { color: colours.onAccent }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}>
          {name}
        </AppText>
      </View>
    </Pressable>
  );
}

function FavouriteHeart({
  saved,
  onToggle,
  overlay = false,
}: {
  saved: boolean;
  onToggle: () => void;
  overlay?: boolean;
}) {
  return (
    <IconButton
      icon={saved ? 'heart' : 'heart-outline'}
      variant={overlay ? 'overlay' : 'plain'}
      accessibilityLabel={saved ? foodCopy.favourite_remove : foodCopy.favourite_add}
      onPress={onToggle}
    />
  );
}

export function RecipeCard({
  recipe,
  mealTypeName,
  onPress,
  saved = false,
  onToggleFavourite,
  style,
}: {
  recipe: Recipe;
  mealTypeName: string;
  onPress: () => void;
  saved?: boolean;
  onToggleFavourite?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, shadow } = useTheme();
  return (
    <View style={[style, shadow]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={recipe.title}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colours.surface, borderRadius: radius.lg },
          pressed && styles.pressed,
        ]}>
        <View style={[styles.photo, { backgroundColor: colours.surfaceMuted }]}>
          <PhotoFill slug={recipe.coverImageSlug} kind="food" label={recipe.title} />
        </View>
        <View style={styles.body}>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            {mealTypeName}
          </AppText>
          <AppText variant="title3" style={{ color: colours.ink, marginTop: 4 }} numberOfLines={2}>
            {recipe.title}
          </AppText>
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 4 }} numberOfLines={1}>
            {recipeMetaLine(recipe)}
          </AppText>
        </View>
      </Pressable>
      {onToggleFavourite ? (
        <View style={styles.heart} pointerEvents="box-none">
          <FavouriteHeart saved={saved} onToggle={onToggleFavourite} overlay />
        </View>
      ) : null}
    </View>
  );
}

export function RecipeListRow({
  recipe,
  mealTypeName,
  onPress,
  saved = false,
  onToggleFavourite,
}: {
  recipe: Recipe;
  mealTypeName: string;
  onPress: () => void;
  saved?: boolean;
  onToggleFavourite?: () => void;
}) {
  const { colours, radius } = useTheme();
  const tag = recipeTagLabel(recipe) || mealTypeName;
  return (
    <View style={[styles.listRow, { borderBottomColor: colours.border, backgroundColor: colours.surface }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={recipe.title}
        style={({ pressed }) => [styles.listMain, pressed && styles.pressed]}>
        <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
          <PhotoFill slug={recipe.coverImageSlug} kind="food" label={recipe.title} />
        </View>
        <View style={styles.listText}>
          <AppText variant="eyebrow" style={{ color: colours.accent, marginBottom: 2 }}>
            {tag}
          </AppText>
          <AppText variant="title3" style={{ color: colours.ink }} numberOfLines={2}>
            {recipe.title}
          </AppText>
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }} numberOfLines={1}>
            {recipePrepLine(recipe)}
          </AppText>
        </View>
      </Pressable>
      {onToggleFavourite ? (
        <FavouriteHeart saved={saved} onToggle={onToggleFavourite} />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colours.inkMuted} />
      )}
    </View>
  );
}

export function RecipeStatsRow({
  items,
}: {
  items: { icon: ComponentProps<typeof Ionicons>['name']; value: string; label: string }[];
}) {
  const { colours, radius } = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={styles.statsRow}>
      {items.map((item) => (
        <View
          key={item.label}
          style={[styles.statTile, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
          <Ionicons name={item.icon} size={16} color={colours.brand} />
          <AppText variant="title3" style={{ color: colours.ink, marginTop: 6 }} numberOfLines={1}>
            {item.value}
          </AppText>
          <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 2 }} numberOfLines={1}>
            {item.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export function ServingsStepper({
  servings,
  onChange,
}: {
  servings: number;
  onChange: (value: number) => void;
}) {
  const { colours } = useTheme();
  return (
    <View style={styles.stepper}>
      <IconButton
        icon="remove-circle-outline"
        accessibilityLabel={foodCopy.servings_minus}
        disabled={servings <= 1}
        onPress={() => onChange(servings - 1)}
      />
      <AppText variant="bodyStrong" style={{ color: colours.ink, minWidth: 88, textAlign: 'center' }}>
        {fillCopy(foodCopy.serves, { count: servings })}
      </AppText>
      <IconButton
        icon="add-circle-outline"
        accessibilityLabel={foodCopy.servings_plus}
        disabled={servings >= 12}
        onPress={() => onChange(servings + 1)}
      />
    </View>
  );
}

export function IngredientRow({
  ingredient,
  ticked,
  onToggle,
}: {
  ingredient: ScaledIngredient;
  ticked: boolean;
  onToggle: () => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: ticked }}
      style={({ pressed }) => [styles.ingredient, pressed && styles.pressed]}>
      <View
        style={[
          styles.tick,
          {
            borderColor: ticked ? colours.brand : colours.border,
            backgroundColor: ticked ? colours.brand : 'transparent',
            borderRadius: radius.sm,
          },
        ]}>
        {ticked ? <Ionicons name="checkmark" size={14} color={colours.onBrand} /> : null}
      </View>
      <View style={styles.ingredientText}>
        <AppText
          variant="bodyStrong"
          style={{ color: colours.ink, textDecorationLine: ticked ? 'line-through' : 'none' }}>
          {ingredient.scaledAmount}
        </AppText>
        <AppText
          variant="body"
          style={{ color: colours.ink, textDecorationLine: ticked ? 'line-through' : 'none' }}>
          {ingredient.name}
          {ingredient.note ? `, ${ingredient.note}` : ''}
        </AppText>
      </View>
    </Pressable>
  );
}

export function MethodStep({ index, text }: { index: number; text: string }) {
  const { colours } = useTheme();
  return (
    <View style={styles.method}>
      <View style={[styles.stepNumber, { backgroundColor: colours.brandSoft }]}>
        <AppText variant="bodyStrong" style={{ color: colours.brand }}>
          {index}
        </AppText>
      </View>
      <AppText variant="body" style={{ color: colours.ink, flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

export function NutritionCard({
  nutrition,
  open,
  onToggle,
}: {
  nutrition: NutritionPerServing;
  open: boolean;
  onToggle: () => void;
}) {
  const { colours, radius } = useTheme();
  const rows: [string, string][] = [
    ['Energy', `${Math.round(nutrition.calories)} kcal`],
    ['Protein', `${formatGrams(nutrition.proteinG)} g`],
    ['Carbs', `${formatGrams(nutrition.carbsG)} g`],
    ['Fat', `${formatGrams(nutrition.fatG)} g`],
    ['Fibre', `${formatGrams(nutrition.fibreG)} g`],
  ];
  return (
    <View style={[styles.nutrition, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.nutritionHeader}>
        <AppText variant="title3" style={{ color: colours.ink, flex: 1 }}>
          {foodCopy.nutrition}
        </AppText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colours.inkMuted} />
      </Pressable>
      {open
        ? rows.map(([label, value]) => (
            <View key={label} style={[styles.nutritionRow, { borderTopColor: colours.border }]}>
              <AppText variant="body" style={{ color: colours.inkMuted, flex: 1 }}>
                {label}
              </AppText>
              <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                {value}
              </AppText>
            </View>
          ))
        : null}
    </View>
  );
}

export function FuelSuggestionCard({
  suggestion,
  onPress,
  style,
}: {
  suggestion: FuelSuggestion;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing, shadow } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={suggestion.recipe.title}
      style={({ pressed }) => [
        styles.fuelCard,
        { backgroundColor: colours.surface, borderRadius: radius.xl },
        shadow,
        pressed && styles.pressed,
        style,
      ]}>
      <View style={[styles.fuelThumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
        <PhotoFill slug={suggestion.recipe.coverImageSlug} kind="food" label={suggestion.recipe.title} />
      </View>
      <View style={styles.listText}>
        <AppText variant="eyebrow" style={{ color: colours.accent }}>
          {foodCopy.fuel_eyebrow}
        </AppText>
        <AppText variant="title3" style={{ color: colours.ink, marginTop: 4 }} numberOfLines={2}>
          {suggestion.copy}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.xs }} numberOfLines={1}>
          {suggestion.recipe.title}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colours.inkMuted} />
    </Pressable>
  );
}

export function ShoppingListRow({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <View style={[styles.shopRow, { borderBottomColor: colours.border, backgroundColor: colours.surface }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.ticked }}
        style={({ pressed }) => [styles.shopMain, pressed && styles.pressed]}>
        <View
          style={[
            styles.tick,
            {
              borderColor: item.ticked ? colours.brand : colours.border,
              backgroundColor: item.ticked ? colours.brand : 'transparent',
              borderRadius: radius.sm,
            },
          ]}>
          {item.ticked ? <Ionicons name="checkmark" size={14} color={colours.onBrand} /> : null}
        </View>
        <View style={styles.ingredientText}>
          <AppText
            variant="bodyStrong"
            style={{ color: colours.ink, textDecorationLine: item.ticked ? 'line-through' : 'none' }}>
            {item.amount}
          </AppText>
          <AppText
            variant="body"
            style={{ color: colours.ink, textDecorationLine: item.ticked ? 'line-through' : 'none' }}>
            {item.name}
          </AppText>
        </View>
      </Pressable>
      <IconButton icon="close" accessibilityLabel={foodCopy.list_remove_item} onPress={onRemove} />
    </View>
  );
}

function formatGrams(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, '');
}

const styles = StyleSheet.create({
  tile: {
    overflow: 'hidden',
    aspectRatio: 3 / 4,
    justifyContent: 'flex-end',
  },
  tileFade: {
    ...StyleSheet.absoluteFill,
    opacity: 0.4,
  },
  tileLabel: {
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  card: {
    overflow: 'hidden',
  },
  photo: {
    aspectRatio: 4 / 3,
    overflow: 'hidden',
  },
  heart: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  body: {
    padding: 12,
  },
  thumb: {
    width: 56,
    height: 56,
    overflow: 'hidden',
  },
  listRow: {
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listText: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ingredient: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
  },
  tick: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  ingredientText: {
    flex: 1,
  },
  method: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nutrition: {
    overflow: 'hidden',
  },
  nutritionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  nutritionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.88,
  },
  fuelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  fuelThumb: {
    width: 72,
    height: 72,
    overflow: 'hidden',
  },
  shopRow: {
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  shopMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
});
