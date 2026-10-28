import { Stack } from 'expo-router';

import { colours } from '@/constants/theme';

export default function WorkoutsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: '',
        headerTintColor: colours.accent,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colours.background },
      }}>
      <Stack.Screen name="index" options={{ headerBackTitle: 'Home' }} />
      <Stack.Screen name="[id]" options={{ headerBackTitle: 'My workouts' }} />
    </Stack>
  );
}
