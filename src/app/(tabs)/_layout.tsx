import Ionicons from '@expo/vector-icons/Ionicons';
import TopTabs from 'expo-router/js-top-tabs';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillTabBar, TabBarHeightProvider, type PillTabBarProps } from '@/components/PillTabBar';
import { colours } from '@/constants/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(filled: IoniconName, outline: IoniconName) {
  return ({ focused }: { focused: boolean }) => (
    <Ionicons
      name={focused ? filled : outline}
      size={24}
      color={focused ? colours.accent : colours.textMuted}
    />
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <TabBarHeightProvider>
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colours.background }}>
        <TopTabs
          tabBarPosition="bottom"
          tabBar={(props: PillTabBarProps) => <PillTabBar {...props} />}>
          <TopTabs.Screen
            name="index"
            options={{ title: 'Today', tabBarIcon: tabIcon('today', 'today-outline') }}
          />
          <TopTabs.Screen
            name="progress"
            options={{ title: 'Progress', tabBarIcon: tabIcon('stats-chart', 'stats-chart-outline') }}
          />
          <TopTabs.Screen
            name="library"
            options={{ title: 'Library', tabBarIcon: tabIcon('barbell', 'barbell-outline') }}
          />
          <TopTabs.Screen
            name="profile"
            options={{ title: 'Profile', tabBarIcon: tabIcon('person', 'person-outline') }}
          />
        </TopTabs>
      </View>
    </TabBarHeightProvider>
  );
}
