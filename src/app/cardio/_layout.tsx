import { Stack } from 'expo-router';

import { useTheme } from '@/constants/theme';

export default function CardioLayout() {
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
      <Stack.Screen name="[slug]" />
      <Stack.Screen name="play" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
