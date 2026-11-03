import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '@/constants/theme';

export type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Native host behind a `View` / `Pressable`, used to measure the trigger button. */
export type AnchorHandle = ComponentRef<typeof View>;

const ANIM_MS = 200;
const SCREEN_PAD = 12;

export function measureAnchor(view: AnchorHandle | null, onMeasure: (anchor: AnchorRect) => void): void {
  if (!view) return;
  view.measureInWindow((x: number, y: number, width: number, height: number) => {
    if (width <= 0 && height <= 0) return;
    onMeasure({ x, y, width, height });
  });
}

/** Animated menu that drops from the button that opened it. Flips up if there is no room below. */
export function AnchoredMenu({
  visible,
  anchor,
  onClose,
  children,
  minWidth = 220,
}: {
  visible: boolean;
  anchor: AnchorRect | null;
  onClose: () => void;
  children: ReactNode;
  minWidth?: number;
}) {
  const [shown, setShown] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setShown(true);
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: ANIM_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setShown(false);
    });
  }, [visible, progress]);

  const layout = useMemo(() => {
    const window = Dimensions.get('window');
    const preferred = anchor ? Math.min(anchor.width, 320) : minWidth;
    const width = Math.min(Math.max(minWidth, preferred), window.width - SCREEN_PAD * 2);
    if (!anchor) {
      return {
        top: 80,
        bottom: undefined as number | undefined,
        left: SCREEN_PAD,
        width,
        maxHeight: window.height * 0.45,
        dropDown: true,
      };
    }
    const spaceBelow = window.height - (anchor.y + anchor.height) - SCREEN_PAD * 2;
    const spaceAbove = anchor.y - SCREEN_PAD * 2;
    const dropDown = spaceBelow >= 140 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(120, Math.min(320, dropDown ? spaceBelow : spaceAbove));
    let left = anchor.x;
    if (left + width > window.width - SCREEN_PAD) left = window.width - SCREEN_PAD - width;
    if (left < SCREEN_PAD) left = SCREEN_PAD;
    if (dropDown) {
      return { top: anchor.y + anchor.height + 4, bottom: undefined, left, width, maxHeight, dropDown };
    }
    return {
      top: undefined,
      bottom: window.height - anchor.y + 4,
      left,
      width,
      maxHeight,
      dropDown,
    };
  }, [anchor, minWidth]);

  const { colours, shadow } = useTheme();

  if (!shown || !anchor) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: layout.dropDown ? [-10, 0] : [10, 0],
  });

  return (
    <Modal visible={shown} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.layer} pointerEvents="box-none">
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <Animated.View
          style={[
            styles.menu,
            shadow,
            {
              top: layout.top,
              bottom: layout.bottom,
              left: layout.left,
              width: layout.width,
              maxHeight: layout.maxHeight,
              backgroundColor: colours.surface,
              opacity: progress,
              transform: [{ translateY }],
            },
          ]}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function MenuHeader({ label, detail }: { label: string; detail?: string }) {
  const { colours } = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: colours.border }]}>
      <Text style={[styles.headerLabel, { color: colours.ink }]}>{label}</Text>
      {detail ? <Text style={[styles.headerDetail, { color: colours.inkMuted }]}>{detail}</Text> : null}
    </View>
  );
}

export function MenuRow({
  label,
  onPress,
  selected = false,
  danger = false,
  detail,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  danger?: boolean;
  detail?: string;
}) {
  const { colours } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: colours.border }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected }}>
      <View style={styles.rowTextWrap}>
        <Text
          style={[
            styles.rowLabel,
            { color: danger ? colours.danger : selected ? colours.brand : colours.ink },
            (selected || danger) && styles.rowLabelStrong,
          ]}
          numberOfLines={2}>
          {label}
        </Text>
        {detail ? <Text style={[styles.rowDetail, { color: colours.inkMuted }]}>{detail}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={colours.brand} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layer: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: 'rgba(31, 27, 36, 0.2)',
  },
  menu: {
    position: 'absolute',
    borderRadius: 18,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  headerDetail: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  row: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
  },
  rowLabelStrong: {
    fontWeight: '700',
  },
  rowDetail: {
    fontSize: 13,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
