import { Stack } from 'expo-router';

import { useTheme } from '@/constants/theme';

export default function RecapLayout() {
  const { colours } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: '',
        headerTintColor: colours.brand,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colours.bg },
      }}>
      <Stack.Screen name="[month]" options={{ title: 'Month report', headerBackTitle: 'Home' }} />
    </Stack>
  );
}
