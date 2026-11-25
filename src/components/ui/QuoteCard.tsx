import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AnchoredMenu, MenuRow, measureAnchor, type AnchorHandle, type AnchorRect } from '@/components/AnchoredMenu';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import type { DailyQuote } from '@/lib/quotes';


export function QuoteCard({
  quote,
  onHide,
  eyebrow,
  style,
}: {
  quote: DailyQuote;
  onHide: () => void;
  eyebrow?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing } = useTheme();
  const menuRef = useRef<AnchorHandle>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);

  function openMenu() {
    measureAnchor(menuRef.current, (rect) => {
      setAnchor(rect);
      setMenuOpen(true);
    });
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colours.brandSoft, borderRadius: radius.xl, padding: spacing.lg },
        style,
      ]}>
      <View style={styles.top}>
        <AppText variant="eyebrow" style={{ color: colours.brand, flex: 1 }}>
          {eyebrow ?? ''}
        </AppText>
        <View ref={menuRef} collapsable={false}>
          <Pressable
            onPress={openMenu}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Quote options"
            style={({ pressed }) => [styles.menu, pressed && { opacity: 0.6 }]}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colours.brand} />
          </Pressable>
        </View>
      </View>
      <AppText variant="displaySm" italic style={{ color: colours.ink, marginTop: spacing.sm }}>
        {quote.text}
      </AppText>
      <AppText variant="caption" style={{ color: colours.brand, marginTop: spacing.sm }}>
        {quote.attribution}
      </AppText>
      <AnchoredMenu visible={menuOpen} anchor={anchor} onClose={() => setMenuOpen(false)}>
        <MenuRow
          label="Hide daily quote"
          onPress={() => {
            setMenuOpen(false);
            onHide();
          }}
        />
      </AnchoredMenu>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menu: {
    padding: 2,
  },
});
