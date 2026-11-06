import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, PrimaryButton, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { progressPhotosCopy } from '@/lib/copy';
import { acceptPhotosConsent, savePhotosEnabled } from '@/lib/progressPhotos';

export default function PhotosConsentScreen() {
  const insets = useSafeAreaInsets();
  const { colours, radius, spacing } = useTheme();
  const [saving, setSaving] = useState(false);

  async function turnOn() {
    setSaving(true);
    try {
      await acceptPhotosConsent();
      await savePhotosEnabled(true);
      router.back();
    } catch (error) {
      showDialog(
        'Could not save that',
        error instanceof Error ? error.message : 'Check your connection and try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colours.bg }]}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + 32, paddingTop: spacing.lg, gap: spacing.md },
      ]}>
      <AppText variant="display" style={{ color: colours.ink }}>
        {progressPhotosCopy.consent_title}
      </AppText>
      <View
        style={{
          backgroundColor: colours.surface,
          borderRadius: radius.xl,
          padding: spacing.lg,
          gap: spacing.md,
        }}>
        {progressPhotosCopy.consent_points.map((point) => (
          <AppText key={point} variant="body" style={{ color: colours.ink }}>
            {point}
          </AppText>
        ))}
      </View>
      <PrimaryButton
        label={saving ? 'Saving…' : progressPhotosCopy.consent_cta}
        onPress={() => void turnOn()}
        loading={saving}
        disabled={saving}
      />
      <TextButton
        label={progressPhotosCopy.consent_cancel}
        onPress={() => router.back()}
        style={{ alignSelf: 'center' }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: 24,
  },
});
