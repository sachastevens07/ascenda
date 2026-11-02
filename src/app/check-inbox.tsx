import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
      <Text style={styles.title}>Check your inbox</Text>
      <Text style={styles.subtitle}>
        {address
          ? `We’ve sent a link to ${address}. Open it on this phone to finish creating your account.`
          : 'We’ve sent a link to your email. Open it on this phone to finish creating your account.'}
      </Text>
      <Text style={styles.hint}>It can take a minute. Have a look in junk if you don’t see it.</Text>

      {message ? (
        <Text style={[styles.message, messageKind === 'error' && styles.messageError]}>{message}</Text>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}
        onPress={() => void resend()}
        disabled={busy}
        accessibilityRole="button">
        {busy ? (
          <ActivityIndicator color={colours.surface} />
        ) : (
          <Text style={styles.buttonText}>Resend email</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.replace('/sign-in' as Href)}
        style={styles.switch}
        accessibilityRole="button">
        <Text style={styles.switchText}>Use a different email</Text>
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
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
  },
  subtitle: {
    fontSize: 17,
    color: colours.textMuted,
    marginTop: 8,
    lineHeight: 24,
  },
  hint: {
    fontSize: 15,
    color: colours.textMuted,
    marginTop: 12,
    marginBottom: 28,
    lineHeight: 21,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
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
    fontSize: 17,
    fontWeight: '700',
    color: colours.surface,
  },
  switch: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  switchText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
  },
});
