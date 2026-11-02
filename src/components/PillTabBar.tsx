import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { WorkoutBar } from '@/components/WorkoutBar';
import { colours } from '@/constants/theme';

const PILL_PADDING = 6;

export type PillTabBarProps = MaterialTopTabBarProps;

type TabBarHeight = { height: number; setHeight: (height: number) => void };

const TabBarHeightContext = createContext<TabBarHeight>({ height: 0, setHeight: () => {} });

/** Wrap the tabs in this so screens can make room for the floating tab bar. */
export function TabBarHeightProvider({ children }: { children: ReactNode }) {
  const [height, setHeight] = useState(0);
  return (
    <TabBarHeightContext.Provider value={{ height, setHeight }}>{children}</TabBarHeightContext.Provider>
  );
}

/**
 * How much of the bottom of the screen the floating tab bar (and workout bar) covers.
 * Tab screens add this to the bottom padding of their scrolling content.
 */
export function useTabBarHeight(): number {
  return useContext(TabBarHeightContext).height;
}

export function PillTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  position,
  insets,
}: PillTabBarProps) {
  const [innerWidth, setInnerWidth] = useState(0);
  const { setHeight } = useContext(TabBarHeightContext);

  const tabCount = Math.max(state.routes.length, 1);
  const tabWidth = innerWidth / tabCount;
  const indexes = state.routes.map((_, index) => index);
  const translateX =
    innerWidth > 0
      ? position.interpolate({
          inputRange: indexes,
          outputRange: indexes.map((index) => index * tabWidth),
        })
      : 0;

  return (
    <View
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}
      pointerEvents="box-none"
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
      <WorkoutBar />
      <View style={styles.pill}>
        <View
          style={styles.pillInner}
          onLayout={(event) => setInnerWidth(event.nativeEvent.layout.width)}>
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
              const event = emitter.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigateToTab(route.key);
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
                <Text
                  style={[styles.label, { color: colour }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
  },
  pill: {
    padding: PILL_PADDING,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colours.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  pillInner: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
    backgroundColor: colours.accentSoft,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 2,
    gap: 2,
    zIndex: 1,
  },
  label: {
    width: '100%',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
