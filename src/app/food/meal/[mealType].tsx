import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState, RecipeListRow, openRecipe } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { foodCopy } from '@/lib/copy';
import { isMealType, mealTypeName, recipesForMealType } from '@/lib/food';

export default function FoodMealScreen() {
  const { mealType: raw } = useLocalSearchParams<{ mealType: string }>();
  const { colours } = useTheme();
  const mealType = isMealType(raw) ? raw : null;
  const title = mealType ? mealTypeName(mealType) : foodCopy.title;
  const recipes = mealType ? recipesForMealType(mealType) : [];

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen options={{ title }} />
      {recipes.length === 0 ? (
        <EmptyState icon="restaurant-outline" title={foodCopy.empty_meal} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {recipes.map((recipe) => (
            <RecipeListRow
              key={recipe.slug}
              recipe={recipe}
              mealTypeName={title}
              onPress={() => openRecipe(recipe.slug)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    paddingBottom: 32,
  },
});
