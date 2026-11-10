import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Chip, ChipScroller, EmptyState, RecipeListRow, filterLabel, openRecipe } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { foodCopy } from '@/lib/copy';
import { availableFilters, filterRecipes, mealTypeName, type Recipe, type RecipeFilter } from '@/lib/food';
import { useFoodFavourites } from '@/lib/foodFavourites';

export function RecipeBrowse({
  recipes,
  emptyTitle,
  emptyBody,
  showSearch = true,
}: {
  recipes: Recipe[];
  emptyTitle: string;
  emptyBody?: string;
  showSearch?: boolean;
}) {
  const { colours, radius, type } = useTheme();
  const { isFavourite, toggle } = useFoodFavourites();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<RecipeFilter[]>([]);
  const chips = useMemo(() => availableFilters(recipes), [recipes]);
  const shown = useMemo(() => filterRecipes(recipes, query, filters), [recipes, query, filters]);
  const searching = query.trim().length > 0 || filters.length > 0;

  function toggleFilter(filter: RecipeFilter) {
    setFilters((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]
    );
  }

  return (
    <View style={styles.screen}>
      {showSearch ? (
        <View
          style={[
            styles.search,
            { borderColor: colours.border, backgroundColor: colours.surface, borderRadius: radius.md },
          ]}>
          <Ionicons name="search" size={20} color={colours.inkMuted} />
          <TextInput
            style={[styles.input, type.bodyStrong, { color: colours.ink }]}
            value={query}
            onChangeText={setQuery}
            placeholder={foodCopy.search_placeholder}
            placeholderTextColor={colours.inkMuted}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query !== '' ? (
            <Pressable onPress={() => setQuery('')} hitSlop={12} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={20} color={colours.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {chips.length > 0 ? (
        <ChipScroller style={styles.chips}>
          {chips.map((filter) => (
            <Chip
              key={filter}
              label={filterLabel(filter)}
              selected={filters.includes(filter)}
              onPress={() => toggleFilter(filter)}
            />
          ))}
        </ChipScroller>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title={searching ? foodCopy.empty_search_title : emptyTitle}
          body={searching ? foodCopy.empty_search_body : emptyBody}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {shown.map((recipe) => (
            <RecipeListRow
              key={recipe.slug}
              recipe={recipe}
              mealTypeName={mealTypeName(recipe.mealType)}
              saved={isFavourite(recipe.slug)}
              onToggleFavourite={() => void toggle(recipe.slug)}
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
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
  },
  chips: {
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  list: {
    paddingBottom: 32,
  },
});
