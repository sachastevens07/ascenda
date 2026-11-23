import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ListRenderItem,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import { imageCatalogGeneration, subscribeImageCatalog } from '@/lib/images';

/** Horizontal list that only mounts cards near the screen. Use for photo carousels. */
export function CarouselList<T>({
  data,
  keyExtractor,
  renderItem,
  contentContainerStyle,
  style,
}: {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: ListRenderItem<T>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const [catalog, setCatalog] = useState(imageCatalogGeneration);
  useEffect(() => subscribeImageCatalog(() => setCatalog(imageCatalogGeneration())), []);

  return (
    <FlatList
      data={data}
      extraData={catalog}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      horizontal
      showsHorizontalScrollIndicator={false}
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={5}
      contentContainerStyle={contentContainerStyle}
      style={style}
    />
  );
}

export function ChipScroller({
  children,
  style,
  contentContainerStyle,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.chips, contentContainerStyle]}
      style={style}>
      {children}
      <View style={styles.chipsEnd} accessibilityElementsHidden />
    </ScrollView>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();
  return (
    <View style={[styles.section, style]}>
      <AppText variant="title2" style={{ color: colours.ink, flex: 1 }}>
        {title}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <AppText variant="bodyStrong" style={{ color: colours.accent }}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  eyebrow,
  eyebrowColor,
  left,
  right,
  onPress,
  showChevron = true,
  style,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  eyebrowColor?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();
  const inner = (
    <View
      style={[
        styles.row,
        { borderBottomColor: colours.border, backgroundColor: colours.surface },
        style,
      ]}>
      {left}
      <View style={styles.rowText}>
        {eyebrow ? (
          <AppText variant="eyebrow" style={{ color: eyebrowColor ?? colours.accent, marginBottom: 2 }}>
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="title3" style={{ color: colours.ink }} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
      {showChevron ? <Ionicons name="chevron-forward" size={20} color={colours.inkMuted} /> : null}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => pressed && styles.pressed}>
      {inner}
    </Pressable>
  );
}

export function StickyDayHeader({
  title,
  today = false,
  privateDot = false,
  onAdd,
  style,
}: {
  title: string;
  today?: boolean;
  privateDot?: boolean;
  onAdd?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();
  const ink = today ? colours.onBrand : colours.inkMuted;
  const body = (
    <View
      style={[
        styles.sticky,
        today ? { backgroundColor: colours.ink } : { backgroundColor: colours.surfaceMuted },
        style,
      ]}>
      <AppText variant="eyebrow" style={{ color: ink, flex: 1 }} numberOfLines={1}>
        {title}
      </AppText>
      {privateDot ? (
        <View
          accessibilityLabel="Private mark"
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: today ? colours.onBrand : colours.brand,
          }}
        />
      ) : null}
      {onAdd ? <Ionicons name="add" size={18} color={ink} /> : null}
    </View>
  );
  if (!onAdd) return body;
  return (
    <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add to ${title}`}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: 8,
    paddingVertical: 4,
    paddingRight: 24,
    alignItems: 'center',
  },
  chipsEnd: {
    width: 8,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  row: {
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
  },
  sticky: {
    height: 32,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 2,
    elevation: 3,
  },
  pressed: {
    opacity: 0.8,
  },
});
