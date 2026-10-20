import { useState, type ReactElement } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WorkoutBar } from '@/components/WorkoutBar';
import { colours } from '@/constants/theme';

const PILL_PADDING = 6;

type TabRoute = {
  key: string;
  name: string;
  params?: object;
};

type TabOptions = {
  title?: string;
  tabBarIcon?: (props: { focused: boolean; color: ColorValue }) => ReactElement;
};

export type PillTabBarProps = {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: TabOptions }>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string, params?: object) => void;
  };
  /** Swipe progress from the pager: 0 = first tab, 1 = second tab, and fractions in between. */
  position: Animated.AnimatedInterpolation<number>;
};

export function PillTabBar({ state, descriptors, navigation, position }: PillTabBarProps) {
  const insets = useSafeAreaInsets();
  const [innerWidth, setInnerWidth] = useState(0);

  const tabWidth = innerWidth / state.routes.length;
  const indexes = state.routes.map((_, index) => index);
  const translateX = position.interpolate({
    inputRange: indexes,
    outputRange: indexes.map((index) => index * tabWidth),
  });

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <WorkoutBar />
      <View
        style={styles.pill}
        onLayout={(event) => setInnerWidth(event.nativeEvent.layout.width - PILL_PADDING * 2)}>
        {innerWidth > 0 && (
          <Animated.View
            style={[styles.indicator, { width: tabWidth, transform: [{ translateX }] }]}
          />
        )}
        {state.routes.map((route, index) => {
          const { title, tabBarIcon } = descriptors[route.key].options;
          const focused = state.index === index;
          const colour = focused ? colours.accent : colours.textMuted;
          const label = title ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}>
              {tabBarIcon?.({ focused, color: colour })}
              <Text style={[styles.label, { color: colour }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: colours.background,
  },
  pill: {
    flexDirection: 'row',
    padding: PILL_PADDING,
    borderRadius: 999,
    backgroundColor: colours.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  indicator: {
    position: 'absolute',
    top: PILL_PADDING,
    bottom: PILL_PADDING,
    left: PILL_PADDING,
    borderRadius: 999,
    backgroundColor: colours.accentSoft,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    gap: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
