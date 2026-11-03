import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { AnchoredMenu, MenuRow, measureAnchor, type AnchorHandle, type AnchorRect } from '@/components/AnchoredMenu';
import { useTheme } from '@/constants/theme';
import type { DailyQuote } from '@/lib/quotes';

import { IconButton } from './IconButton';

export function QuoteCard({
  quote,
  onHide,
  style,
}: {
  quote: DailyQuote;
  onHide: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing, shadow, type } = useTheme();
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
        { backgroundColor: colours.surface, borderRadius: radius.xl, padding: spacing.lg },
        shadow,
        style,
      ]}>
      <View style={styles.top}>
        <Text style={[styles.mark, { color: colours.accent }]} accessibilityElementsHidden>
          “
        </Text>
        <View ref={menuRef} collapsable={false}>
          <IconButton
            icon="ellipsis-horizontal"
            variant="muted"
            accessibilityLabel="Quote options"
            onPress={openMenu}
          />
        </View>
      </View>
      <Text style={[styles.quote, { color: colours.ink }]}>{quote.text}</Text>
      <Text style={[type.caption, { color: colours.inkMuted, marginTop: spacing.sm }]}>{quote.attribution}</Text>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  mark: {
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '700',
    marginTop: -8,
  },
  quote: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
});
