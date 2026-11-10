import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PhotoFill } from '@/components/ui/Cards';
import { ListRow } from '@/components/ui/List';
import { useTheme } from '@/constants/theme';
import { fillCopy, foodCopy } from '@/lib/copy';
import type { DietaryTag, Recipe } from '@/lib/food';

export function openRecipe(slug: string): void {
  router.push({ pathname: '/food/recipe/[slug]', params: { slug } } as Href);
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

export function dietaryLabel(tag: DietaryTag): string {
  if (tag === 'vegetarian') return foodCopy.dietary_vegetarian;
  if (tag === 'vegan') return foodCopy.dietary_vegan;
  if (tag === 'gluten_free') return foodCopy.dietary_gluten_free;
  return foodCopy.dietary_dairy_free;
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
        <AppText variant="displaySm" style={[styles.tileLabel, { color: colours.onAccent }]} numberOfLines={2}>
          {name}
        </AppText>
      </View>
    </Pressable>
  );
}

export function RecipeCard({
  recipe,
  mealTypeName,
  onPress,
  style,
}: {
  recipe: Recipe;
  mealTypeName: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, shadow } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={recipe.title}
      style={({ pressed }) => [style, shadow, pressed && styles.pressed]}>
      <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
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
      </View>
    </Pressable>
  );
}

export function RecipeListRow({
  recipe,
  mealTypeName,
  onPress,
}: {
  recipe: Recipe;
  mealTypeName: string;
  onPress: () => void;
}) {
  const { colours, radius } = useTheme();
  return (
    <ListRow
      eyebrow={mealTypeName}
      title={recipe.title}
      subtitle={recipeMetaLine(recipe)}
      onPress={onPress}
      left={
        <View style={[styles.thumb, { backgroundColor: colours.surfaceMuted, borderRadius: radius.md }]}>
          <PhotoFill slug={recipe.coverImageSlug} kind="food" label={recipe.title} />
        </View>
      }
    />
  );
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
    padding: 14,
  },
  card: {
    overflow: 'hidden',
  },
  photo: {
    aspectRatio: 4 / 3,
    overflow: 'hidden',
  },
  body: {
    padding: 12,
  },
  thumb: {
    width: 56,
    height: 56,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.88,
  },
});
