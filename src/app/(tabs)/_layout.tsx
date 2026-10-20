import { Tabs } from 'expo-router';

import { colours } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colours.accent,
        tabBarInactiveTintColor: colours.textMuted,
        tabBarStyle: {
          backgroundColor: colours.surface,
          borderTopColor: colours.border,
        },
        // No icon library yet, so tabs are text-only.
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
        headerStyle: { backgroundColor: colours.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 20, fontWeight: '700', color: colours.text },
        sceneStyle: { backgroundColor: colours.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
