import { Stack } from 'expo-router';

import { useTheme } from '@/constants/theme';

export default function MachinesLayout() {
  const { colours } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        title: '',
        headerTintColor: colours.brand,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colours.bg },
      }}
    />
  );
}
