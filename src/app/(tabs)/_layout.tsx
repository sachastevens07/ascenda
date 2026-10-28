import Ionicons from '@expo/vector-icons/Ionicons';
import TopTabs from 'expo-router/js-top-tabs';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillTabBar, TabBarHeightProvider } from '@/components/PillTabBar';
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
          tabBar={(props) => <PillTabBar {...props} />}>
          <TopTabs.Screen
            name="index"
            options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }}
          />
          <TopTabs.Screen
            name="planner"
            options={{ title: 'Planner', tabBarIcon: tabIcon('calendar', 'calendar-outline') }}
          />
          <TopTabs.Screen
            name="activity"
            options={{ title: 'Activity', tabBarIcon: tabIcon('stats-chart', 'stats-chart-outline') }}
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
