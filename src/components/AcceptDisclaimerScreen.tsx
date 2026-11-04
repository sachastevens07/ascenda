import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DisclaimerBody, DisclaimerCheckbox } from '@/components/ui/Disclaimer';
import { AppText } from '@/components/ui/AppText';
import { PrimaryButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useProfile } from '@/lib/profile';

/** Shown on next open when the stored disclaimer version does not match the current text. */
export function AcceptDisclaimerScreen() {
  const insets = useSafeAreaInsets();
  const { colours, radius, spacing, shadow } = useTheme();
  const { profile, acceptDisclaimer } = useProfile();
  const [checked, setChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updated = profile?.disclaimer_version != null;

  async function handleContinue() {
    if (!checked) return;
    setIsSaving(true);
    setError(null);
    try {
      await acceptDisclaimer();
    } catch {
      setError('Sorry, that didn’t save. Check your connection and try again.');
      setIsSaving(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingTop: insets.top }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <AppText variant="display" style={{ color: colours.ink }}>
          Train safely
        </AppText>
        <AppText variant="body" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
          {updated
            ? 'The safety guidance has been updated. Please read it again before you continue.'
            : 'Please read this before you train.'}
        </AppText>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colours.surface,
              borderRadius: radius.xl,
              marginTop: spacing.md,
            },
            shadow,
          ]}>
          <DisclaimerBody hideTitle />
        </View>
        <View style={{ marginTop: spacing.lg }}>
          <DisclaimerCheckbox checked={checked} onToggle={() => setChecked((value) => !value)} />
        </View>
        {error ? (
          <AppText variant="bodySm" style={{ color: colours.danger, marginTop: spacing.md }}>
            {error}
          </AppText>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <PrimaryButton
          label="Continue"
          onPress={() => void handleContinue()}
          disabled={!checked}
          loading={isSaving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  card: {
    padding: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
