import { Stack } from 'expo-router';

import { colours, light } from '@/constants/theme';

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
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
      <Stack.Screen
        name="session"
        options={{
          headerBackTitle: 'Home',
          headerTintColor: light.brand,
          headerStyle: { backgroundColor: light.bg },
        }}
      />
      <Stack.Screen name="complete" options={{ headerBackTitle: 'Home', gestureEnabled: false }} />
    </Stack>
  );
}
