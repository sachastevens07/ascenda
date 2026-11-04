import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { colours } from '@/constants/theme';
import { resendSignupEmail } from '@/lib/emailAuth';

export default function CheckInboxScreen() {
  const insets = useSafeAreaInsets();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const address = (Array.isArray(email) ? email[0] : email)?.trim() ?? '';
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<'ok' | 'error'>('ok');

  async function resend() {
    if (!address) {
      setMessageKind('error');
      setMessage('Add your email on the sign-in screen, then we can send another link.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await resendSignupEmail(address);
      setMessageKind('ok');
      setMessage('Sent. Check your inbox, and junk if it isn’t there yet.');
    } catch (error) {
      setMessageKind('error');
      setMessage(
        error instanceof Error && /rate|seconds/i.test(error.message)
          ? 'Wait a minute, then try again.'
          : 'We couldn’t send that. Check the address and try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
      ]}>
      <AppText variant="display" style={styles.title}>Check your inbox</AppText>
      <AppText variant="body" style={styles.subtitle}>
        {address
          ? `We’ve sent a link to ${address}. Open it on this phone to finish creating your account.`
          : 'We’ve sent a link to your email. Open it on this phone to finish creating your account.'}
      </AppText>
      <AppText variant="bodySm" style={styles.hint}>It can take a minute. Have a look in junk if you don’t see it.</AppText>

      {message ? (
        <AppText variant="bodySm" style={[styles.message, messageKind === 'error' && styles.messageError]}>{message}</AppText>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}
        onPress={() => void resend()}
        disabled={busy}
        accessibilityRole="button">
        {busy ? (
          <ActivityIndicator color={colours.surface} />
        ) : (
          <AppText variant="bodyStrong" style={styles.buttonText}>Resend email</AppText>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.replace('/sign-in' as Href)}
        style={styles.switch}
        accessibilityRole="button">
        <AppText variant="bodyStrong" style={styles.switchText}>Use a different email</AppText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colours.background,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  title: {
    color: colours.text,
  },
  subtitle: {
    color: colours.textMuted,
    marginTop: 8,
  },
  hint: {
    color: colours.textMuted,
    marginTop: 12,
    marginBottom: 28,
  },
  message: {
    color: colours.text,
    marginBottom: 16,
  },
  messageError: {
    color: colours.danger,
  },
  button: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: colours.surface,
  },
  switch: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  switchText: {
    color: colours.accent,
  },
});
