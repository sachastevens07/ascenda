import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { RecipeBrowse } from '@/components/RecipeBrowse';
import { useTheme } from '@/constants/theme';
import { foodCopy } from '@/lib/copy';
import { collectionBySlug } from '@/lib/food';

export default function FoodCollectionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colours } = useTheme();
  const collection = collectionBySlug(slug);
  const title = collection?.name ?? foodCopy.title;

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen options={{ title }} />
      <RecipeBrowse
        recipes={collection?.recipes ?? []}
        emptyTitle={foodCopy.empty_collection}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
