import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { foodCopy } from '@/lib/copy';

export default function FoodFavouritesScreen() {
  const { colours } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <Stack.Screen options={{ title: foodCopy.favourites_title }} />
      <EmptyState
        icon="heart-outline"
        title={foodCopy.empty_favourites_title}
        body={foodCopy.empty_favourites_body}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
