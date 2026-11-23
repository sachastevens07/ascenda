import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarHeight } from '@/components/PillTabBar';
import {
  AppText,
  ArticleCard,
  CarouselList,
  FuelSuggestionCard,
  IconButton,
  MealTypeTile,
  RecipeCard,
  SectionHeader,
  CoachButton,
  TabAvatar,
  openRecipe,
} from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { openCoach } from '@/lib/coach';
import { aiCopy, foodCopy } from '@/lib/copy';
import {
  MEAL_TYPE_TILES,
  mealTypeName,
  recipeBySlug,
  visibleCollections,
  type Recipe,
  type VisibleCollection,
} from '@/lib/food';
import { useFoodFavourites } from '@/lib/foodFavourites';
import { pickTodaysFuelSuggestion, type FuelSuggestion } from '@/lib/foodSuggestions';
import { articlesInCategory, fetchLearnArticles, type LearnArticle } from '@/lib/learn';
import { loadPlannerWeek } from '@/lib/planner';

type FoodSection =
  | { id: 'favourites'; kind: 'favourites' }
  | { id: string; kind: 'collection'; collection: VisibleCollection }
  | { id: 'fuelling'; kind: 'fuelling' };

export default function FoodScreen() {
  const tabBarHeight = useTabBarHeight();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colours, radius } = useTheme();
  const tileWidth = width * 0.38;
  const cardWidth = width * 0.72;
  const collections = visibleCollections();
  const { slugs, isFavourite, toggle } = useFoodFavourites();
  const [fuel, setFuel] = useState<FuelSuggestion | null>(null);
  const [fuelling, setFuelling] = useState<LearnArticle[]>([]);
  const favouriteRecipes = useMemo(
    () => slugs.map((slug) => recipeBySlug(slug)).filter((item): item is Recipe => Boolean(item)),
    [slugs]
  );

  const sections = useMemo(() => {
    const rows: FoodSection[] = [];
    if (favouriteRecipes.length > 0) rows.push({ id: 'favourites', kind: 'favourites' });
    for (const collection of collections) {
      rows.push({ id: `collection:${collection.slug}`, kind: 'collection', collection });
    }
    if (fuelling.length > 0) rows.push({ id: 'fuelling', kind: 'fuelling' });
    return rows;
  }, [collections, favouriteRecipes.length, fuelling.length]);

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

  function recipeCard(recipe: Recipe) {
    return (
      <RecipeCard
        recipe={recipe}
        mealTypeName={mealTypeName(recipe.mealType)}
        saved={isFavourite(recipe.slug)}
        onToggleFavourite={() => void toggle(recipe.slug)}
        onPress={() => openRecipe(recipe.slug)}
        style={{ width: cardWidth }}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <FlatList
        data={sections}
        keyExtractor={(item) => item.id}
        extraData={slugs}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        windowSize={5}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: tabBarHeight + 24 },
        ]}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.header}>
              <TabAvatar />
              <AppText variant="display" style={{ color: colours.ink, flex: 1 }}>
                {foodCopy.title}
              </AppText>
              <CoachButton />
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
              onPress={() =>
                openCoach({
                  question: 'What can I cook with what I have?',
                  entry: 'food',
                })
              }
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

            <CarouselList
              data={MEAL_TYPE_TILES}
              keyExtractor={(tile) => tile.mealType}
              contentContainerStyle={styles.carousel}
              style={styles.carouselBleed}
              renderItem={({ item: tile }) => (
                <MealTypeTile
                  name={tile.name}
                  coverImageSlug={tile.coverImageSlug}
                  onPress={() =>
                    router.push({ pathname: '/food/meal/[mealType]', params: { mealType: tile.mealType } } as Href)
                  }
                  style={{ width: tileWidth }}
                />
              )}
            />
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'favourites') {
            return (
              <View>
                <SectionHeader
                  title={foodCopy.favourites_section}
                  actionLabel={foodCopy.see_all}
                  onAction={() => router.push('/food/favourites' as Href)}
                />
                <CarouselList
                  data={favouriteRecipes}
                  keyExtractor={(recipe) => recipe.slug}
                  contentContainerStyle={styles.carousel}
                  style={styles.carouselBleed}
                  renderItem={({ item: recipe }) => recipeCard(recipe)}
                />
              </View>
            );
          }
          if (item.kind === 'fuelling') {
            return (
              <View>
                <SectionHeader
                  title={foodCopy.fuelling_section}
                  actionLabel={foodCopy.see_all}
                  onAction={() =>
                    router.push({ pathname: '/learn/category/[category]', params: { category: 'fuelling' } } as Href)
                  }
                />
                <CarouselList
                  data={fuelling}
                  keyExtractor={(article) => article.id}
                  contentContainerStyle={styles.carousel}
                  style={styles.carouselBleed}
                  renderItem={({ item: article }) => <ArticleCard article={article} width={cardWidth} />}
                />
              </View>
            );
          }
          return (
            <View>
              <SectionHeader
                title={item.collection.name}
                actionLabel={foodCopy.see_all}
                onAction={() =>
                  router.push({
                    pathname: '/food/collection/[slug]',
                    params: { slug: item.collection.slug },
                  } as Href)
                }
              />
              <CarouselList
                data={item.collection.recipes}
                keyExtractor={(recipe) => recipe.slug}
                contentContainerStyle={styles.carousel}
                style={styles.carouselBleed}
                renderItem={({ item: recipe }) => recipeCard(recipe)}
              />
            </View>
          );
        }}
      />
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
  headerBlock: {
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
