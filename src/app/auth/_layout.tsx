import { Stack } from 'expo-router';

import { colours } from '@/constants/theme';

export default function AuthLinkLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colours.background },
      }}
    />
  );
}
