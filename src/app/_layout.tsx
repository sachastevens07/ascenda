import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DialogProvider } from '@/components/Dialog';
import { colours } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ProfileProvider, getQuizAnswers, useProfile } from '@/lib/profile';
import { SubscriptionProvider } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';
import { WorkoutProvider } from '@/lib/workout';

export default function RootLayout() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <ProfileProvider>
          <WorkoutProvider>
            <StatusBar style="dark" />
            <DialogProvider>
              <RootNavigator />
            </DialogProvider>
          </WorkoutProvider>
        </ProfileProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useAuth();
  const profile = useProfile();

  if (isLoading || (session && profile.isLoading)) {
    return <View style={styles.blank} />;
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
            headerTintColor: colours.accent,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colours.background },
          }}
        />
        <Stack.Screen
          name="exercise/[id]"
          options={{
            headerShown: true,
            title: '',
            headerBackTitle: 'Back',
            headerTintColor: colours.accent,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colours.background },
          }}
        />
        <Stack.Screen
          name="session/[id]"
          options={{
            headerShown: true,
            title: '',
            headerBackTitle: 'Home',
            headerTintColor: colours.accent,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colours.background },
          }}
        />
        <Stack.Screen
          name="programme"
          options={{
            headerShown: true,
            title: '',
            headerBackTitle: 'Profile',
            headerTintColor: colours.accent,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colours.background },
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
  return (
    <View style={styles.error}>
      <Text style={styles.errorTitle}>We couldn't load your profile</Text>
      <Text style={styles.errorText}>Check your connection and try again.</Text>
      {__DEV__ && <Text style={styles.errorDetail}>{detail}</Text>}
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={onRetry}
        accessibilityRole="button">
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
      <Pressable
        style={styles.link}
        onPress={() => supabase.auth.signOut()}
        accessibilityRole="button">
        <Text style={styles.linkText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  blank: {
    flex: 1,
    backgroundColor: colours.background,
  },
  error: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colours.background,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colours.text,
  },
  errorText: {
    fontSize: 17,
    color: colours.textMuted,
    marginTop: 8,
    marginBottom: 24,
  },
  errorDetail: {
    fontSize: 13,
    color: colours.textMuted,
    marginTop: -12,
    marginBottom: 24,
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
  link: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
    color: colours.accent,
  },
});
