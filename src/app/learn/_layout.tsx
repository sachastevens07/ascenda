import { Stack } from 'expo-router';

import { useTheme } from '@/constants/theme';

export default function LearnStackLayout() {
  const { colours } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: '',
        headerBackTitle: 'Learn',
        headerTintColor: colours.brand,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colours.bg },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
