import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { RecipeBrowse } from '@/components/RecipeBrowse';
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
      <RecipeBrowse recipes={recipes} emptyTitle={foodCopy.empty_meal} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
