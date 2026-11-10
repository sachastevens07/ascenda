import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, EmptyState, RecipeListRow, openRecipe } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { foodCopy } from '@/lib/copy';
import { collectionBySlug, mealTypeName } from '@/lib/food';

export default function FoodCollectionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colours } = useTheme();
  const collection = collectionBySlug(slug);
  const title = collection?.name ?? foodCopy.title;
  const recipes = collection?.recipes ?? [];

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen options={{ title }} />
      {recipes.length === 0 ? (
        <EmptyState icon="restaurant-outline" title={foodCopy.empty_collection} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {collection?.description ? (
            <AppText variant="body" style={{ color: colours.inkMuted, paddingHorizontal: 24, paddingVertical: 16 }}>
              {collection.description}
            </AppText>
          ) : null}
          {recipes.map((recipe) => (
            <RecipeListRow
              key={recipe.slug}
              recipe={recipe}
              mealTypeName={mealTypeName(recipe.mealType)}
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
