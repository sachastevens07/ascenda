import { useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AnchoredMenu, MenuRow, measureAnchor, type AnchorHandle, type AnchorRect } from '@/components/AnchoredMenu';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import type { DailyQuote } from '@/lib/quotes';

import { IconButton } from './IconButton';

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
  const { colours, radius, spacing, shadow } = useTheme();
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
      {eyebrow ? (
        <AppText variant="eyebrow" style={{ color: colours.accent, marginBottom: spacing.xs }}>
          {eyebrow}
        </AppText>
      ) : null}
      <View style={styles.top}>
        <AppText variant="displaySm" italic style={{ color: colours.accent, marginTop: -8 }} accessibilityElementsHidden>
          “
        </AppText>
        <View ref={menuRef} collapsable={false}>
          <IconButton
            icon="ellipsis-horizontal"
            variant="muted"
            accessibilityLabel="Quote options"
            onPress={openMenu}
          />
        </View>
      </View>
      <AppText variant="displaySm" italic style={{ color: colours.ink }}>
        {quote.text}
      </AppText>
      <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
});
