import * as Linking from 'expo-linking';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colours } from '@/constants/theme';
import { completeSessionFromUrl, describeAuthLinkError } from '@/lib/emailAuth';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const url = Linking.useURL();
  const [error, setError] = useState<string | null>(null);

  // Signed in (by this screen or by the root link handler): go to the app.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace('/' as Href);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Never spin forever: no link, a slow network or a stuck request all end in a clear message.
  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (data.session) {
        router.replace('/' as Href);
        return;
      }
      setError((current) => current ?? 'Signing in took too long. Open the newest email and tap the link again, or sign in with your password.');
    }, url ? 15000 : 4000);
    return () => clearTimeout(timer);
  }, [url]);

  useEffect(() => {
    let isCurrent = true;
    if (!url) return;
    completeSessionFromUrl(url)
      .then((handled) => {
        if (!isCurrent) return;
        if (handled) {
          router.replace('/' as Href);
        } else {
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
        <AppText variant="title2" style={styles.title}>We couldn’t open that link</AppText>
        <AppText variant="body" style={styles.body}>{error}</AppText>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => router.replace('/sign-in' as Href)}
          accessibilityRole="button">
          <AppText variant="bodyStrong" style={styles.buttonText}>Back to sign in</AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colours.accent} size="large" />
      <AppText variant="body" style={styles.body}>Signing you in…</AppText>
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
    color: colours.text,
  },
  body: {
    color: colours.textMuted,
    marginTop: 12,
    marginBottom: 28,
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
});
