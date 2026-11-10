import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { showDialog } from '@/components/Dialog';
import {
  AppText,
  Chip,
  ChipScroller,
  DetailLayout,
  EmptyState,
  IconButton,
  IngredientRow,
  MenuRow,
  MethodStep,
  NutritionCard,
  OverflowMenu,
  RecipeStatsRow,
  RelatedLearn,
  ServingsStepper,
  dietaryLabel,
  filterLabel,
  measureAnchor,
  recipeMetaLine,
  type AnchorHandle,
  type AnchorRect,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { foodCopy } from '@/lib/copy';
import {
  RECIPE_DISCLAIMER,
  allergenLine,
  mealTypeName,
  recipeBySlug,
  scaleIngredients,
} from '@/lib/food';
import { useFoodFavourites } from '@/lib/foodFavourites';
import { fetchHideMacros } from '@/lib/foodPrefs';
import { addRecipeToShoppingList } from '@/lib/shoppingList';

export default function FoodRecipeScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colours, spacing } = useTheme();
  const recipe = recipeBySlug(slug);
  const { isFavourite, toggle } = useFoodFavourites();
  const [servings, setServings] = useState(recipe?.servings ?? 1);
  const [ticked, setTicked] = useState<string[]>([]);
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [hideMacros, setHideMacros] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const menuRef = useRef<AnchorHandle>(null);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      fetchHideMacros()
        .then((hidden) => {
          if (isCurrent) setHideMacros(hidden);
        })
        .catch(() => {});
      return () => {
        isCurrent = false;
      };
    }, [])
  );

  useEffect(() => {
    setServings(recipe?.servings ?? 1);
    setTicked([]);
    setNutritionOpen(false);
  }, [recipe?.slug, recipe?.servings]);

  const ingredients = useMemo(
    () => (recipe ? scaleIngredients(recipe, servings) : []),
    [recipe, servings]
  );

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/food' as Href);
  }

  function toggleTick(key: string) {
    setTicked((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  function openMenu() {
    measureAnchor(menuRef.current, (rect) => {
      setMenuAnchor(rect);
      setMenuOpen(true);
    });
  }

  async function shareRecipe() {
    if (!recipe) return;
    setMenuOpen(false);
    try {
      await Share.share({
        message: `${recipe.title}\n${recipe.summary}\n${recipeMetaLine(recipe)}`,
      });
    } catch {
      showDialog(foodCopy.share_failed);
    }
  }

  async function addToList() {
    if (!recipe) return;
    setMenuOpen(false);
    try {
      const result = await addRecipeToShoppingList(recipe, servings);
      showDialog(
        result === 'updated' ? foodCopy.list_updated_title : foodCopy.list_saved_title,
        result === 'updated' ? foodCopy.list_updated_body : foodCopy.list_saved_body,
        [
          { text: foodCopy.list_title, onPress: () => router.push('/food/list' as Href) },
          { text: 'OK', style: 'cancel' },
        ]
      );
    } catch {
      showDialog(foodCopy.list_saved_title, foodCopy.list_saved_body);
    }
  }

  if (!recipe) {
    return (
      <View style={[styles.screen, { backgroundColor: colours.bg }]}>
        <View style={styles.missingBar}>
          <IconButton icon="chevron-back" variant="muted" accessibilityLabel="Back" onPress={goBack} />
        </View>
        <EmptyState
          icon="restaurant-outline"
          title={foodCopy.recipe_missing_title}
          body={foodCopy.recipe_missing_body}
        />
      </View>
    );
  }

  const saved = isFavourite(recipe.slug);
  const allergens = allergenLine(recipe);
  const tags = [
    ...recipe.verifiedClaims.map((claim) => filterLabel(claim)),
    ...recipe.dietaryTags.map((tag) => dietaryLabel(tag)),
  ];
  const showNutrition = Boolean(recipe.nutrition) && !hideMacros;
  const facts = [
    { icon: 'timer-outline' as const, value: `${recipe.prepMinutes} min`, label: foodCopy.stat_prep },
    ...(recipe.cookMinutes > 0
      ? [{ icon: 'flame-outline' as const, value: `${recipe.cookMinutes} min`, label: foodCopy.stat_cook }]
      : []),
    { icon: 'people-outline' as const, value: String(servings), label: foodCopy.stat_serves },
    ...(showNutrition && recipe.nutrition
      ? [
          {
            icon: 'nutrition-outline' as const,
            value: String(Math.round(recipe.nutrition.calories)),
            label: foodCopy.stat_kcal,
          },
        ]
      : []),
  ];

  return (
    <View style={styles.screen}>
      <DetailLayout
        cover={null}
        coverSlug={recipe.coverImageSlug}
        letter={recipe.title.slice(0, 1)}
        title={recipe.title}
        eyebrow={mealTypeName(recipe.mealType)}
        onBack={goBack}
        menu={
          <View style={styles.heroActions}>
            <IconButton
              icon={saved ? 'heart' : 'heart-outline'}
              variant="overlay"
              accessibilityLabel={saved ? foodCopy.favourite_remove : foodCopy.favourite_add}
              onPress={() => void toggle(recipe.slug)}
            />
            <View ref={menuRef} collapsable={false}>
              <IconButton
                icon="ellipsis-horizontal"
                variant="overlay"
                accessibilityLabel={foodCopy.menu_a11y}
                onPress={openMenu}
              />
            </View>
          </View>
        }>
        <View style={{ gap: spacing.md }}>
          <RecipeStatsRow items={facts} />
          {recipe.summary ? (
            <AppText variant="body" style={{ color: colours.ink }}>
              {recipe.summary}
            </AppText>
          ) : null}

          <ServingsStepper
            servings={servings}
            onChange={(value) => setServings(Math.min(12, Math.max(1, value)))}
          />

          {tags.length > 0 ? (
            <ChipScroller>
              {tags.map((label) => (
                <Chip key={label} label={label} />
              ))}
            </ChipScroller>
          ) : null}

          {allergens || recipe.checkLabelNotes.length > 0 ? (
            <View>
              <AppText variant="bodySm" style={{ color: colours.ink }}>
                {allergens ? `${foodCopy.allergens}: ${allergens}` : foodCopy.allergens}
              </AppText>
              {recipe.checkLabelNotes.map((note) => (
                <AppText key={note} variant="caption" style={{ color: colours.inkMuted, marginTop: 4 }}>
                  {note}
                </AppText>
              ))}
            </View>
          ) : null}

          {ingredients.length > 0 ? (
            <View>
              <AppText variant="title3" style={{ color: colours.ink, marginBottom: 4 }}>
                {foodCopy.ingredients}
              </AppText>
              {ingredients.map((ingredient) => (
                <IngredientRow
                  key={ingredient.ingredientKey}
                  ingredient={ingredient}
                  ticked={ticked.includes(ingredient.ingredientKey)}
                  onToggle={() => toggleTick(ingredient.ingredientKey)}
                />
              ))}
            </View>
          ) : null}

          {recipe.methodSteps.length > 0 ? (
            <View>
              <AppText variant="title3" style={{ color: colours.ink, marginBottom: 4 }}>
                {foodCopy.method}
              </AppText>
              {recipe.methodSteps.map((step, index) => (
                <MethodStep key={`${index}-${step.slice(0, 24)}`} index={index + 1} text={step} />
              ))}
            </View>
          ) : null}

          {showNutrition && recipe.nutrition ? (
            <NutritionCard
              nutrition={recipe.nutrition}
              open={nutritionOpen}
              onToggle={() => setNutritionOpen((open) => !open)}
            />
          ) : null}

          {recipe.nutrition && hideMacros ? (
            <AppText variant="caption" style={{ color: colours.inkMuted }}>
              {foodCopy.nutrition_hidden}
            </AppText>
          ) : null}

          {RECIPE_DISCLAIMER ? (
            <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
              {RECIPE_DISCLAIMER}
            </AppText>
          ) : null}

          <RelatedLearn category="fuelling" style={{ marginTop: spacing.sm }} />
        </View>
      </DetailLayout>

      <OverflowMenu visible={menuOpen} anchor={menuAnchor} onClose={() => setMenuOpen(false)}>
        <MenuRow label={foodCopy.share} onPress={() => void shareRecipe()} />
        <MenuRow label={foodCopy.add_to_list} onPress={addToList} />
      </OverflowMenu>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  missingBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
