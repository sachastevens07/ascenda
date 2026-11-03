import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/constants/theme';

import { HeroImage } from './Cards';
import { IconButton } from './IconButton';

const SHEET_OVERLAP = 24;
const SHEET_RADIUS = 28;

export function DetailLayout({
  cover,
  letter,
  title,
  eyebrow,
  menu,
  sticky,
  onBack,
  children,
}: {
  cover: ImageSourcePropType | null;
  letter: string;
  title: string;
  eyebrow: string;
  menu?: ReactNode;
  sticky?: ReactNode;
  onBack: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { colours, spacing, shadow } = useTheme();
  const heroHeight = Math.round(windowHeight * 0.45);

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: sticky ? 16 : insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}>
        <HeroImage image={cover} letter={letter} title={title} eyebrow={eyebrow} height={heroHeight}>
          <View style={[styles.heroBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            <IconButton icon="chevron-back" variant="overlay" accessibilityLabel="Back" onPress={onBack} />
            {menu ?? <View style={styles.menuSpacer} />}
          </View>
        </HeroImage>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colours.bg,
              marginTop: -SHEET_OVERLAP,
              borderTopLeftRadius: SHEET_RADIUS,
              borderTopRightRadius: SHEET_RADIUS,
              paddingBottom: spacing.lg,
            },
          ]}>
          {children}
        </View>
      </ScrollView>
      {sticky ? (
        <View
          style={[
            styles.sticky,
            { backgroundColor: colours.bg, paddingBottom: insets.bottom + 12 },
            shadow,
          ]}>
          {sticky}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  heroBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  menuSpacer: {
    width: 44,
    height: 44,
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sticky: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});
