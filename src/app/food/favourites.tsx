import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { RecipeBrowse } from '@/components/RecipeBrowse';
import { useTheme } from '@/constants/theme';
import { foodCopy } from '@/lib/copy';
import { recipeBySlug } from '@/lib/food';
import { useFoodFavourites } from '@/lib/foodFavourites';

export default function FoodFavouritesScreen() {
  const { colours } = useTheme();
  const { slugs } = useFoodFavourites();
  const recipes = useMemo(
    () => slugs.map((slug) => recipeBySlug(slug)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [slugs]
  );

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen options={{ title: foodCopy.favourites_title }} />
      <RecipeBrowse
        recipes={recipes}
        emptyTitle={foodCopy.empty_favourites_title}
        emptyBody={foodCopy.empty_favourites_body}
        showSearch={recipes.length > 4}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
