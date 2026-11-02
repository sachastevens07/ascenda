import { Stack } from 'expo-router';

import { colours } from '@/constants/theme';

export default function StretchesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: '',
        headerTintColor: colours.accent,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colours.background },
      }}>
      <Stack.Screen name="[id]" options={{ headerBackTitle: 'Stretches' }} />
      <Stack.Screen name="play" options={{ headerBackTitle: 'Stretches', gestureEnabled: false }} />
    </Stack>
  );
}
