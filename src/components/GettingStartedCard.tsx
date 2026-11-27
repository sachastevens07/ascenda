import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { showDialog } from '@/components/Dialog';
import { AppText, PrimaryButton, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { fillCopy, gettingStartedCopy as copy } from '@/lib/copy';
import type { GettingStartedId, GettingStartedItem } from '@/lib/gettingStarted';

type Props = {
  items: GettingStartedItem[];
  onPressItem: (id: GettingStartedId) => void;
  onHide: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Home "Your first steps": a short checklist that ticks itself off as she uses the app. */
export function GettingStartedCard({ items, onPressItem, onHide, style }: Props) {
  const { colours, radius } = useTheme();
  const done = items.filter((item) => item.done).length;
  const allDone = done === items.length;

  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(items.length ? done / items.length : 0, { duration: 700 });
  }, [done, items.length, fill]);
  const barStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={[{ backgroundColor: colours.surface, borderRadius: radius.xl, padding: 16 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            {copy.eyebrow}
          </AppText>
          <AppText variant="title3" style={{ color: colours.ink, marginTop: 2 }}>
            {allDone ? copy.done_title : copy.title}
          </AppText>
        </View>
        {!allDone ? (
          <TextButton
            label={copy.hide}
            onPress={() =>
              showDialog(copy.hide_title, copy.hide_body, [
                { text: copy.hide_cancel, style: 'cancel' },
                { text: copy.hide_confirm, onPress: onHide },
              ])
            }
          />
        ) : null}
      </View>

      <View style={{ marginTop: 10, marginBottom: 6 }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colours.border, overflow: 'hidden' }}>
          <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: colours.success }, barStyle]} />
        </View>
        <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: 6 }}>
          {fillCopy(copy.progress, { done, total: items.length })}
        </AppText>
      </View>

      {allDone ? (
        <>
          <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 4, marginBottom: 14 }}>
            {copy.done_body}
          </AppText>
          <PrimaryButton label={copy.done_button} onPress={onHide} size="compact" />
        </>
      ) : (
        items.map((item, index) => (
          <ChecklistRow key={item.id} item={item} order={index} onPress={() => onPressItem(item.id)} />
        ))
      )}
    </View>
  );
}

function ChecklistRow({ item, order, onPress }: { item: GettingStartedItem; order: number; onPress: () => void }) {
  const { colours } = useTheme();
  const pop = useSharedValue(1);
  useEffect(() => {
    if (!item.justDone) return;
    pop.value = withDelay(
      250 + order * 120,
      withSequence(withSpring(1.3, { damping: 6, stiffness: 260 }), withSpring(1, { damping: 10 }))
    );
  }, [item.justDone, order, pop]);
  const tickStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <Pressable
      onPress={item.done ? undefined : onPress}
      disabled={item.done}
      accessibilityRole="button"
      accessibilityState={{ checked: item.done, disabled: item.done }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Animated.View
        style={[
          {
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: item.done ? 0 : 1.5,
            borderColor: colours.border,
            backgroundColor: item.done ? colours.success : 'transparent',
          },
          tickStyle,
        ]}>
        {item.done ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
      </Animated.View>
      <View style={{ flex: 1 }}>
        <AppText
          variant="bodyStrong"
          style={{
            color: item.done ? colours.inkMuted : colours.ink,
            textDecorationLine: item.done ? 'line-through' : 'none',
          }}>
          {item.title}
        </AppText>
        {!item.done ? (
          <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
            {item.body}
          </AppText>
        ) : null}
      </View>
      {!item.done ? <Ionicons name="chevron-forward" size={18} color={colours.inkMuted} /> : null}
    </Pressable>
  );
}
