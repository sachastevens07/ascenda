import { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colours } from '@/constants/theme';
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
  const sources = coverSources(cover);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const source = sources[index] ?? null;

  useEffect(() => {
    setIndex(0);
    setReady(false);
  }, [cover?.id, cover?.url, cover?.storage_path]);

  return (
    <View style={[styles.frame, { height, borderRadius: radius }, style]}>
      {!ready && (
        <View style={styles.placeholder} accessibilityElementsHidden>
          <AppText variant="display" style={{ color: colours.accent }}>
            {letter}
          </AppText>
        </View>
      )}
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
    backgroundColor: colours.accentSoft,
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
