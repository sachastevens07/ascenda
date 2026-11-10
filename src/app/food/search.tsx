import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { RecipeBrowse } from '@/components/RecipeBrowse';
import { useTheme } from '@/constants/theme';
import { foodCopy } from '@/lib/copy';
import { RECIPES } from '@/lib/food';

export default function FoodSearchScreen() {
  const { colours } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen options={{ title: foodCopy.search_title }} />
      <RecipeBrowse recipes={RECIPES} emptyTitle={foodCopy.empty_search_title} emptyBody={foodCopy.empty_search_body} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
