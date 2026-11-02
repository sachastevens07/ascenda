import { Stack } from 'expo-router';

import { colours } from '@/constants/theme';

export default function ChallengesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: '',
        headerTintColor: colours.accent,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colours.background },
      }}>
      <Stack.Screen name="[id]" options={{ headerBackTitle: 'Home' }} />
    </Stack>
  );
}
