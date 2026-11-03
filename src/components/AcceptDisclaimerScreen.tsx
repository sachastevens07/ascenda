import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DisclaimerBody, DisclaimerCheckbox } from '@/components/ui/Disclaimer';
import { PrimaryButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useProfile } from '@/lib/profile';

/** Shown on next open when the stored disclaimer version does not match the current text. */
export function AcceptDisclaimerScreen() {
  const insets = useSafeAreaInsets();
  const { colours, type, radius, spacing, shadow } = useTheme();
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
        <Text style={[type.display, { color: colours.ink }]}>Train safely</Text>
        <Text style={[type.body, { color: colours.inkMuted, marginTop: spacing.sm }]}>
          {updated
            ? 'The safety guidance has been updated. Please read it again before you continue.'
            : 'Please read this before you train.'}
        </Text>
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
          <Text style={[type.bodySm, { color: colours.danger, marginTop: spacing.md }]}>{error}</Text>
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
