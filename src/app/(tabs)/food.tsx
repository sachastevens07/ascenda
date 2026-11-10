import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useTabBarHeight } from '@/components/PillTabBar';
import {
  AppText,
  ArticleCard,
  FuelSuggestionCard,
  IconButton,
  MealTypeTile,
  RecipeCard,
  SectionHeader,
  TabAvatar,
  openRecipe,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { aiCopy, foodCopy } from '@/lib/copy';
import { MEAL_TYPE_TILES, mealTypeName, recipeBySlug, visibleCollections } from '@/lib/food';
import { useFoodFavourites } from '@/lib/foodFavourites';
import { pickTodaysFuelSuggestion, type FuelSuggestion } from '@/lib/foodSuggestions';
import { articlesInCategory, fetchLearnArticles, type LearnArticle } from '@/lib/learn';
import { loadPlannerWeek } from '@/lib/planner';

export default function FoodScreen() {
  const tabBarHeight = useTabBarHeight();
  const { width } = useWindowDimensions();
  const { colours, radius } = useTheme();
  const tileWidth = width * 0.38;
  const cardWidth = width * 0.72;
  const collections = visibleCollections();
  const { slugs, isFavourite, toggle } = useFoodFavourites();
  const [fuel, setFuel] = useState<FuelSuggestion | null>(null);
  const [fuelling, setFuelling] = useState<LearnArticle[]>([]);
  const favouriteRecipes = useMemo(
    () => slugs.map((slug) => recipeBySlug(slug)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [slugs]
  );

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      loadPlannerWeek()
        .then((week) => {
          if (!isCurrent) return;
          const today = week.days.find((day) => day.isToday) ?? null;
          setFuel(pickTodaysFuelSuggestion(today));
        })
        .catch(() => {
          if (isCurrent) setFuel(null);
        });
      fetchLearnArticles()
        .then((articles) => {
          if (isCurrent) setFuelling(articlesInCategory(articles, 'fuelling').slice(0, 6));
        })
        .catch(() => {
          if (isCurrent) setFuelling([]);
        });
      return () => {
        isCurrent = false;
      };
    }, [])
  );

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
            icon="basket-outline"
            accessibilityLabel={foodCopy.list_a11y}
            onPress={() => router.push('/food/list' as Href)}
          />
          <IconButton
            icon="heart-outline"
            accessibilityLabel={foodCopy.favourites_a11y}
            onPress={() => router.push('/food/favourites' as Href)}
          />
        </View>

        <Pressable
          onPress={() => router.push('/food/cook' as Href)}
          accessibilityRole="button"
          accessibilityLabel={foodCopy.cook_a11y}
          style={({ pressed }) => [
            styles.cookCard,
            { backgroundColor: colours.brandSoft, borderRadius: radius.lg },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="restaurant-outline" size={22} color={colours.brand} />
          <View style={styles.cookText}>
            <AppText variant="title3" style={{ color: colours.ink }}>
              {aiCopy.cook_title}
            </AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }} numberOfLines={2}>
              {aiCopy.cook_card_body}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colours.brand} />
        </Pressable>

        {fuel ? (
          <View>
            <SectionHeader title={foodCopy.fuel_today} />
            <FuelSuggestionCard suggestion={fuel} onPress={() => openRecipe(fuel.recipe.slug)} />
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
          style={styles.carouselBleed}>
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

        {favouriteRecipes.length > 0 ? (
          <View>
            <SectionHeader
              title={foodCopy.favourites_section}
              actionLabel={foodCopy.see_all}
              onAction={() => router.push('/food/favourites' as Href)}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              style={styles.carouselBleed}>
              {favouriteRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.slug}
                  recipe={recipe}
                  mealTypeName={mealTypeName(recipe.mealType)}
                  saved
                  onToggleFavourite={() => void toggle(recipe.slug)}
                  onPress={() => openRecipe(recipe.slug)}
                  style={{ width: cardWidth }}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

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
              style={styles.carouselBleed}>
              {collection.recipes.map((recipe) => (
                <RecipeCard
                  key={recipe.slug}
                  recipe={recipe}
                  mealTypeName={mealTypeName(recipe.mealType)}
                  saved={isFavourite(recipe.slug)}
                  onToggleFavourite={() => void toggle(recipe.slug)}
                  onPress={() => openRecipe(recipe.slug)}
                  style={{ width: cardWidth }}
                />
              ))}
            </ScrollView>
          </View>
        ))}

        {fuelling.length > 0 ? (
          <View>
            <SectionHeader
              title={foodCopy.fuelling_section}
              actionLabel={foodCopy.see_all}
              onAction={() =>
                router.push({ pathname: '/learn/category/[category]', params: { category: 'fuelling' } } as Href)
              }
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              style={styles.carouselBleed}>
              {fuelling.map((article) => (
                <ArticleCard key={article.id} article={article} width={cardWidth} />
              ))}
            </ScrollView>
          </View>
        ) : null}
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
  carouselBleed: {
    marginHorizontal: -24,
  },
  carousel: {
    gap: 12,
    paddingHorizontal: 24,
  },
  cookCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  cookText: {
    flex: 1,
  },
  pressed: {
    opacity: 0.88,
  },
});
