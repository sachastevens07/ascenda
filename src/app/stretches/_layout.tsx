import { Stack } from 'expo-router';

import { useTheme } from '@/constants/theme';

export default function StretchesLayout() {
  const { colours } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        title: '',
        headerTintColor: colours.brand,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colours.bg },
      }}>
      <Stack.Screen name="[id]" />
      <Stack.Screen name="play" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
