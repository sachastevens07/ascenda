import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { WorkoutBar } from '@/components/WorkoutBar';
import { colours } from '@/constants/theme';

const PILL_PADDING = 4;

export type PillTabBarProps = MaterialTopTabBarProps;

type TabBarHeight = { height: number; setHeight: (height: number) => void };
type TabFrame = { x: number; width: number };

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
  const [tabFrames, setTabFrames] = useState<TabFrame[]>([]);
  const { setHeight } = useContext(TabBarHeightContext);

  const tabCount = state.routes.length;
  const framesReady = tabFrames.length === tabCount && tabFrames.every((frame) => frame.width > 0);
  const indexes = state.routes.map((_, index) => index);
  const translateX = framesReady
    ? position.interpolate({
        inputRange: indexes,
        outputRange: tabFrames.map((frame) => frame.x),
      })
    : 0;
  const indicatorWidth = framesReady
    ? position.interpolate({
        inputRange: indexes,
        outputRange: tabFrames.map((frame) => frame.width),
      })
    : 0;

  function rememberFrame(index: number, x: number, width: number) {
    setTabFrames((current) => {
      const prev = current[index];
      if (prev && prev.x === x && prev.width === width && current.length === tabCount) return current;
      const next = current.length === tabCount ? current.slice() : Array.from({ length: tabCount }, () => ({ x: 0, width: 0 }));
      next[index] = { x, width };
      return next;
    });
  }

  return (
    <View
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}
      pointerEvents="box-none"
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
      <WorkoutBar />
      <View style={styles.pill}>
        <View style={styles.pillInner}>
          {framesReady && (
            <Animated.View
              style={[
                styles.indicator,
                { width: indicatorWidth, transform: [{ translateX }] },
              ]}
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
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  rememberFrame(index, x, width);
                }}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}>
                {tabBarIcon?.({ focused, color: colour })}
                <Text
                  style={[styles.label, { color: colour }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}>
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
    paddingHorizontal: 10,
  },
  pill: {
    padding: PILL_PADDING,
    borderRadius: 28,
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
    borderRadius: 22,
    backgroundColor: colours.accentSoft,
  },
  tab: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 1,
    gap: 2,
    zIndex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});
