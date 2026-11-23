import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, DisclaimerCheckbox, PrimaryButton, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { PERIOD_LOG, grantPeriodLogConsent } from '@/lib/periodLog';

export default function PeriodLogConsentScreen() {
  const insets = useSafeAreaInsets();
  const { colours, radius, spacing } = useTheme();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  async function accept() {
    if (!checked || saving) return;
    setSaving(true);
    try {
      await grantPeriodLogConsent();
      router.back();
    } catch (error) {
      showDialog(
        PERIOD_LOG.consentTitle,
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
        {PERIOD_LOG.consentTitle}
      </AppText>
      <View
        style={{
          backgroundColor: colours.surface,
          borderRadius: radius.xl,
          padding: spacing.lg,
          gap: spacing.md,
        }}>
        {PERIOD_LOG.consentBody.map((line) => (
          <AppText key={line} variant="body" style={{ color: colours.ink }}>
            {line}
          </AppText>
        ))}
      </View>
      <DisclaimerCheckbox
        label={PERIOD_LOG.consentCheckbox}
        checked={checked}
        onToggle={() => setChecked((value) => !value)}
      />
      <PrimaryButton
        label={saving ? 'Saving…' : PERIOD_LOG.acceptButton}
        onPress={() => void accept()}
        loading={saving}
        disabled={saving || !checked}
      />
      <TextButton
        label={PERIOD_LOG.declineButton}
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
