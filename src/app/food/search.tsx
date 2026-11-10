import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { EmptyState, RecipeListRow, openRecipe } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { foodCopy } from '@/lib/copy';
import { mealTypeName, searchRecipes } from '@/lib/food';

export default function FoodSearchScreen() {
  const { colours, radius, type } = useTheme();
  const [query, setQuery] = useState('');
  const recipes = useMemo(() => searchRecipes(query), [query]);
  const searching = query.trim().length > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen options={{ title: foodCopy.search_title }} />
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
          autoFocus
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {query !== '' ? (
          <Pressable onPress={() => setQuery('')} hitSlop={12} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={20} color={colours.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      {searching && recipes.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title={foodCopy.empty_search_title}
          body={foodCopy.empty_search_body}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
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
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
  },
  list: {
    paddingBottom: 32,
  },
});
