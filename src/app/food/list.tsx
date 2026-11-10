import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import { showDialog } from '@/components/Dialog';
import { Chip, ChipScroller, EmptyState, ShoppingListRow, StickyDayHeader, TextButton, openRecipe } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { foodCopy } from '@/lib/copy';
import type { Recipe } from '@/lib/food';
import {
  clearTickedShoppingItems,
  groupShoppingByAisle,
  removeRecipeFromShoppingList,
  removeShoppingItem,
  shoppingRecipes,
  toggleShoppingItem,
  useShoppingList,
} from '@/lib/shoppingList';

export default function FoodShoppingListScreen() {
  const { colours } = useTheme();
  const { items, setItems } = useShoppingList();
  const recipes = useMemo(() => shoppingRecipes(items), [items]);
  const sections = useMemo(
    () =>
      groupShoppingByAisle(items).map((group) => ({
        title: group.aisle || foodCopy.list_aisle_other,
        data: group.items,
      })),
    [items]
  );
  const hasTicked = items.some((item) => item.ticked);

  function confirmRemoveRecipe(recipe: Recipe) {
    showDialog(foodCopy.list_remove_recipe, recipe.title, [
      {
        text: foodCopy.list_remove_recipe,
        style: 'destructive',
        onPress: () => void removeRecipeFromShoppingList(recipe.slug).then(setItems),
      },
      { text: 'Keep', style: 'cancel' },
    ]);
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen options={{ title: foodCopy.list_title }} />
      {items.length === 0 ? (
        <EmptyState icon="basket-outline" title={foodCopy.list_empty_title} body={foodCopy.list_empty_body} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          ListHeaderComponent={
            <View style={styles.header}>
              {recipes.length > 0 ? (
                <ChipScroller>
                  {recipes.map((recipe) => (
                    <Chip
                      key={recipe.slug}
                      label={recipe.title}
                      onPress={() => openRecipe(recipe.slug)}
                      onLongPress={() => confirmRemoveRecipe(recipe)}
                    />
                  ))}
                </ChipScroller>
              ) : null}
              {hasTicked ? (
                <TextButton
                  label={foodCopy.list_clear_ticked}
                  onPress={() => void clearTickedShoppingItems().then(setItems)}
                  style={{ alignSelf: 'flex-start', marginHorizontal: 20, marginBottom: 8 }}
                />
              ) : null}
            </View>
          }
          renderSectionHeader={({ section }) => <StickyDayHeader title={section.title} />}
          renderItem={({ item }) => (
            <ShoppingListRow
              item={item}
              onToggle={() => void toggleShoppingItem(item.id).then(setItems)}
              onRemove={() => void removeShoppingItem(item.id).then(setItems)}
            />
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingTop: 8,
    gap: 8,
  },
  list: {
    paddingBottom: 32,
  },
});
