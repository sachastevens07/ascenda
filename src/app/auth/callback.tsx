import * as Linking from 'expo-linking';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colours } from '@/constants/theme';
import { completeSessionFromUrl, describeAuthLinkError } from '@/lib/emailAuth';

export default function AuthCallbackScreen() {
  const url = Linking.useURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    if (!url) return;
    completeSessionFromUrl(url)
      .then((handled) => {
        if (!isCurrent) return;
        if (!handled) {
          setError('This sign-in link is missing details. Open the newest email and try again.');
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) setError(describeAuthLinkError(caught));
      });
    return () => {
      isCurrent = false;
    };
  }, [url]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>We couldn’t open that link</Text>
        <Text style={styles.body}>{error}</Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => router.replace('/sign-in' as Href)}
          accessibilityRole="button">
          <Text style={styles.buttonText}>Back to sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colours.accent} size="large" />
      <Text style={styles.body}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colours.background,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colours.text,
  },
  body: {
    fontSize: 17,
    color: colours.textMuted,
    marginTop: 12,
    marginBottom: 28,
    lineHeight: 24,
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
});
