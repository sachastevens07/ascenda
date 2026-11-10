import { router, type Href } from 'expo-router';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useTabBarHeight } from '@/components/PillTabBar';
import {
  AppText,
  IconButton,
  MealTypeTile,
  RecipeCard,
  SectionHeader,
  TabAvatar,
  openRecipe,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { foodCopy } from '@/lib/copy';
import { MEAL_TYPE_TILES, mealTypeName, visibleCollections } from '@/lib/food';

export default function FoodScreen() {
  const tabBarHeight = useTabBarHeight();
  const { width } = useWindowDimensions();
  const { colours } = useTheme();
  const tileWidth = Math.max(148, width * 0.42);
  const cardWidth = width * 0.72;
  const collections = visibleCollections();

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}>
        <View style={styles.header}>
          <TabAvatar />
          <AppText variant="display" style={{ color: colours.ink, flex: 1 }}>
            {foodCopy.title}
          </AppText>
          <IconButton
            icon="search-outline"
            accessibilityLabel={foodCopy.search_a11y}
            onPress={() => router.push('/food/search' as Href)}
          />
          <IconButton
            icon="heart-outline"
            accessibilityLabel={foodCopy.favourites_a11y}
            onPress={() => router.push('/food/favourites' as Href)}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
          style={styles.bleed}>
          {MEAL_TYPE_TILES.map((tile) => (
            <MealTypeTile
              key={tile.mealType}
              name={tile.name}
              coverImageSlug={tile.coverImageSlug}
              onPress={() =>
                router.push({ pathname: '/food/meal/[mealType]', params: { mealType: tile.mealType } } as Href)
              }
              style={{ width: tileWidth }}
            />
          ))}
        </ScrollView>

        {collections.map((collection) => (
          <View key={collection.slug}>
            <SectionHeader
              title={collection.name}
              actionLabel={foodCopy.see_all}
              onAction={() =>
                router.push({ pathname: '/food/collection/[slug]', params: { slug: collection.slug } } as Href)
              }
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              style={styles.bleed}>
              {collection.recipes.map((recipe) => (
                <RecipeCard
                  key={recipe.slug}
                  recipe={recipe}
                  mealTypeName={mealTypeName(recipe.mealType)}
                  onPress={() => openRecipe(recipe.slug)}
                  style={{ width: cardWidth }}
                />
              ))}
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 12,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  carousel: {
    gap: 12,
    paddingRight: 8,
  },
  bleed: {
    marginHorizontal: -4,
  },
});
