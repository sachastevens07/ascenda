import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import TopTabs from 'expo-router/js-top-tabs';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { PillTabBar, TabBarHeightProvider } from '@/components/PillTabBar';
import { useTheme } from '@/constants/theme';
import { foodCopy, programmesCopy } from '@/lib/copy';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export default function TabLayout() {
  const pathname = usePathname();
  const { colours, scheme } = useTheme();
  const onHome = pathname === '/' || pathname === '/index';

  function tabIcon(filled: IoniconName, outline: IoniconName) {
    return ({ focused }: { focused: boolean }) => (
      <Ionicons
        name={focused ? filled : outline}
        size={24}
        color={focused ? colours.brand : colours.inkMuted}
      />
    );
  }

  return (
    <TabBarHeightProvider>
      <View style={{ flex: 1, backgroundColor: colours.bg }}>
        <StatusBar
          style={onHome ? 'light' : scheme === 'dark' ? 'light' : 'dark'}
        />
        <TopTabs
          tabBarPosition="bottom"
          tabBar={(props) => <PillTabBar {...props} />}>
          <TopTabs.Screen
            name="index"
            options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }}
          />
          <TopTabs.Screen
            name="programmes"
            options={{ title: programmesCopy.tab_title, tabBarIcon: tabIcon('albums', 'albums-outline') }}
          />
          <TopTabs.Screen
            name="food"
            options={{ title: foodCopy.title, tabBarIcon: tabIcon('restaurant', 'restaurant-outline') }}
          />
          <TopTabs.Screen
            name="planner"
            options={{ title: 'Planner', tabBarIcon: tabIcon('calendar', 'calendar-outline') }}
          />
          <TopTabs.Screen
            name="activity"
            options={{ title: 'Activity', tabBarIcon: tabIcon('stats-chart', 'stats-chart-outline') }}
          />
        </TopTabs>
      </View>
    </TabBarHeightProvider>
  );
}
