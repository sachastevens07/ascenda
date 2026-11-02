import { Stack } from 'expo-router';

import { colours } from '@/constants/theme';

export default function RoutinesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: '',
        headerTintColor: colours.accent,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colours.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ headerBackTitle: 'Routines' }} />
      <Stack.Screen name="session" options={{ headerBackTitle: 'Home' }} />
    </Stack>
  );
}
