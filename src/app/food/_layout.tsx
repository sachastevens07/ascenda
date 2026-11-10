import { Stack } from 'expo-router';

import { useTheme } from '@/constants/theme';

export default function FoodStackLayout() {
  const { colours } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: '',
        headerBackTitle: 'Food',
        headerTintColor: colours.brand,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colours.bg },
      }}>
      <Stack.Screen name="recipe/[slug]" options={{ headerShown: false }} />
    </Stack>
  );
}
