import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { hydrateImages, photoCredits, type PhotoCredit } from '@/lib/images';

/** Pexels asks for the photographer's name and a link back to the photo. */
export default function PhotoCreditsScreen() {
  const insets = useSafeAreaInsets();
  const { colours } = useTheme();
  const [credits, setCredits] = useState<PhotoCredit[]>([]);

  useEffect(() => {
    let live = true;
    hydrateImages().then(() => {
      if (live) setCredits(photoCredits());
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colours.bg }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}>
      <AppText variant="body" style={{ color: colours.ink, marginBottom: 16 }}>
        Photos from Pexels. Each photographer keeps their credit.
      </AppText>
      {credits.length === 0 ? (
        <AppText variant="body" style={{ color: colours.inkMuted }}>
          Credits appear here once photos are in the app.
        </AppText>
      ) : (
        credits.map((credit) => (
          <Pressable
            key={credit.slug}
            onPress={() => void Linking.openURL(credit.photographerUrl || credit.sourceUrl)}
            style={styles.row}>
            <AppText variant="bodyStrong" style={{ color: colours.ink }}>
              {credit.photographer}
            </AppText>
            <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }}>
              {credit.altText}
            </AppText>
            <AppText variant="caption" style={{ color: colours.brand, marginTop: 4 }}>
              View on Pexels
            </AppText>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  row: { paddingVertical: 12 },
});
