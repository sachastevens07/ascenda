import { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { CoverPlaceholder } from '@/components/ui/Cards';
import { useTheme } from '@/constants/theme';
import { coverSources } from '@/lib/images';
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
  const sources = coverSources(cover);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const source = sources[index] ?? null;

  useEffect(() => {
    setIndex(0);
    setReady(false);
  }, [cover?.id, cover?.url, cover?.storage_path]);

  return (
    <View style={[styles.frame, { height, borderRadius: radius, backgroundColor: colours.surfaceMuted }, style]}>
      {!ready ? <CoverPlaceholder /> : null}
      {source ? (
        <Image
          source={source}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel={cover?.alt_text || letter}
          onLoad={() => setReady(true)}
          onError={() => {
            setReady(false);
            setIndex((current) => current + 1);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
