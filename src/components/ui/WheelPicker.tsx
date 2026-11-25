import { useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';

const ITEM = 52;
const VISIBLE = 5;

/** Vertical snap wheel (iOS picker style). Scroll or tap a row; the middle row is the value. */
export function WheelPicker<T extends string | number>({
  options,
  value,
  onChange,
  format,
  accessibilityLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  format: (value: T) => string;
  accessibilityLabel?: string;
}) {
  const { colours, radius } = useTheme();
  const listRef = useRef<ScrollViewInstance>(null);
  const ready = useRef(false);
  const pad = ITEM * Math.floor(VISIBLE / 2);

  useEffect(() => {
    const index = Math.max(0, options.indexOf(value));
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ y: index * ITEM, animated: false });
      ready.current = true;
    });
    // Only on mount: after that the wheel itself drives the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function settle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!ready.current) return;
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM);
    const next = options[Math.min(options.length - 1, Math.max(0, index))];
    if (next !== undefined && next !== value) onChange(next);
  }

  return (
    <View
      style={[styles.wrap, { height: ITEM * VISIBLE }]}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        const index = options.indexOf(value);
        const next =
          event.nativeEvent.actionName === 'increment' ? options[index + 1] : options[index - 1];
        if (next !== undefined) {
          onChange(next);
          listRef.current?.scrollTo({ y: options.indexOf(next) * ITEM, animated: true });
        }
      }}>
      <View
        pointerEvents="none"
        style={[
          styles.highlight,
          { top: pad, height: ITEM, backgroundColor: colours.brandSoft, borderRadius: radius.md },
        ]}
      />
      <ScrollView
        ref={listRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        contentContainerStyle={{ paddingVertical: pad }}>
        {options.map((item) => {
          const selected = item === value;
          const distance = Math.abs(options.indexOf(item) - options.indexOf(value));
          return (
            <Pressable
              key={String(item)}
              onPress={() => {
                onChange(item);
                listRef.current?.scrollTo({ y: options.indexOf(item) * ITEM, animated: true });
              }}
              style={styles.item}
              importantForAccessibility="no">
              <AppText
                variant={selected ? 'title2' : 'title3'}
                style={{
                  color: selected ? colours.brand : colours.inkMuted,
                  opacity: selected ? 1 : distance === 1 ? 0.7 : 0.35,
                  textAlign: 'center',
                }}
                numberOfLines={1}>
                {format(item)}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  item: {
    height: ITEM,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
