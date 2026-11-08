import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PhotoFill } from '@/components/ui/Cards';
import { useTheme } from '@/constants/theme';
import type { CoverImage } from '@/lib/routines';

export function CoverPhoto({
  cover,
  letter,
  height,
  radius = 0,
  style,
}: {
  cover: CoverImage | null;
  letter: string;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();

  return (
    <View style={[styles.frame, { height, borderRadius: radius, backgroundColor: colours.brandSoft }, style]}>
      <PhotoFill slug={cover?.id} kind={cover?.kind} label={cover?.alt_text || letter} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    position: 'relative',
  },
});
