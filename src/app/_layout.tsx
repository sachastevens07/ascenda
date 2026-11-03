import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DialogProvider } from '@/components/Dialog';
import { ThemeProvider, useTheme } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DevToolsProvider, useDevTools } from '@/lib/devFlags';
import { ProfileProvider, getQuizAnswers, useProfile } from '@/lib/profile';
import { SubscriptionProvider } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';
import { WorkoutProvider } from '@/lib/workout';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <DevToolsProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <ProfileProvider>
              <ThemeCloudSync />
              <ThemedStatusBar />
              <WorkoutProvider>
                <DialogProvider>
                  <RootNavigator />
                </DialogProvider>
              </WorkoutProvider>
            </ProfileProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </DevToolsProvider>
    </ThemeProvider>
  );
}

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

function ThemeCloudSync() {
  const { profile, isLoading } = useProfile();
  const { hasLocalPreference, setPreference } = useTheme();

  useEffect(() => {
    if (isLoading || hasLocalPreference) return;
    const remote = profile?.theme_preference;
    if (remote) setPreference(remote);
  }, [hasLocalPreference, isLoading, profile?.theme_preference, setPreference]);

  return null;
}

function RootNavigator() {
  const { session, isLoading } = useAuth();
  const profile = useProfile();
  const { colours } = useTheme();

  if (isLoading || (session && profile.isLoading)) {
    return <View style={[styles.blank, { backgroundColor: colours.bg }]} />;
  }

  if (session && profile.error) {
    return <ProfileError detail={profile.error} onRetry={profile.reload} />;
  }

  const isOnboarded =
    getQuizAnswers(profile.profile) !== null && !!profile.profile?.age_confirmed_at;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session && isOnboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="library"
          options={{
            headerShown: true,
            title: '',
            headerBackTitle: 'Back',
            headerTintColor: colours.brand,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colours.bg },
          }}
        />
        <Stack.Screen
          name="exercise/[id]"
          options={{
            headerShown: true,
            title: '',
            headerBackTitle: 'Back',
            headerTintColor: colours.brand,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colours.bg },
          }}
        />
        <Stack.Screen
          name="session/[id]"
          options={{
            headerShown: true,
            title: '',
            headerBackTitle: 'Home',
            headerTintColor: colours.brand,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colours.bg },
          }}
        />
        <Stack.Screen
          name="programme"
          options={{
            headerShown: true,
            title: '',
            headerBackTitle: 'Profile',
            headerTintColor: colours.brand,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colours.bg },
          }}
        />
        <Stack.Screen name="workouts" options={{ headerShown: false }} />
        <Stack.Screen name="routines" options={{ headerShown: false }} />
        <Stack.Screen name="stretches" options={{ headerShown: false }} />
        <Stack.Screen name="paths" options={{ headerShown: false }} />
        <Stack.Screen name="challenges" options={{ headerShown: false }} />
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            gestureEnabled: true,
            animation: 'slide_from_bottom',
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="check-inbox" />
        <Stack.Screen name="auth" />
      </Stack.Protected>
    </Stack>
  );
}

function ProfileError({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  const { showDevTools } = useDevTools();
  const { colours, radius } = useTheme();
  return (
    <View style={[styles.error, { backgroundColor: colours.bg }]}>
      <Text style={[styles.errorTitle, { color: colours.ink }]}>We couldn't load your profile</Text>
      <Text style={[styles.errorText, { color: colours.inkMuted }]}>Check your connection and try again.</Text>
      {showDevTools ? <Text style={[styles.errorDetail, { color: colours.inkMuted }]}>{detail}</Text> : null}
      <Pressable
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colours.brand, borderRadius: radius.full },
          pressed && styles.buttonPressed,
        ]}
        onPress={onRetry}
        accessibilityRole="button">
        <Text style={[styles.buttonText, { color: colours.onBrand }]}>Try again</Text>
      </Pressable>
      <Pressable
        style={styles.link}
        onPress={() => supabase.auth.signOut()}
        accessibilityRole="button">
        <Text style={[styles.linkText, { color: colours.brand }]}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  blank: {
    flex: 1,
  },
  error: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 17,
    marginTop: 8,
    marginBottom: 24,
  },
  errorDetail: {
    fontSize: 13,
    marginTop: -12,
    marginBottom: 24,
  },
  button: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
  },
  link: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
