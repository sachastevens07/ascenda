import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AcceptDisclaimerScreen } from '@/components/AcceptDisclaimerScreen';
import { DialogProvider } from '@/components/Dialog';
import { FirstSessionDisclaimerProvider } from '@/components/FirstSessionDisclaimer';
import { AppText } from '@/components/ui/AppText';
import { fontAssets } from '@/constants/fonts';
import { ThemeProvider, useTheme } from '@/constants/theme';
import {
  identifyUser,
  resetAnalytics,
  startAnalytics,
} from '@/lib/analytics';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DevToolsProvider, useDevTools } from '@/lib/devFlags';
import { needsDisclaimerAcceptance } from '@/lib/disclaimer';
import { ProfileProvider, getQuizAnswers, useProfile } from '@/lib/profile';
import { registerReminderAnalytics } from '@/lib/reminders';
import { SubscriptionProvider, useSubscription } from '@/lib/subscription';
import { hydrateDefaultRestSeconds } from '@/lib/restTimer';
import { supabase } from '@/lib/supabase';
import { hydrateWeightUnit } from '@/lib/units';
import { WorkoutProvider } from '@/lib/workout';

SplashScreen.preventAutoHideAsync().catch(() => {});

function FontGate({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts(fontAssets);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;
  return children;
}

export default function RootLayout() {
  return (
    <FontGate>
      <ThemeProvider>
        <DevToolsProvider>
          <AuthProvider>
            <SubscriptionProvider>
              <AnalyticsBootstrap />
              <ProfileProvider>
                <ThemeCloudSync />
                <PrefsHydrate />
                <ThemedStatusBar />
                <WorkoutProvider>
                  <DialogProvider>
                    <FirstSessionDisclaimerProvider>
                      <RootNavigator />
                    </FirstSessionDisclaimerProvider>
                  </DialogProvider>
                </WorkoutProvider>
              </ProfileProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </DevToolsProvider>
      </ThemeProvider>
    </FontGate>
  );
}

function AnalyticsBootstrap() {
  const { session, isLoading } = useAuth();
  const { isPro, trialEndsAt } = useSubscription();
  const hadUser = useRef(false);

  useEffect(() => {
    startAnalytics();
    return registerReminderAnalytics();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      if (hadUser.current) resetAnalytics();
      hadUser.current = false;
      return;
    }
    hadUser.current = true;
    const plan = trialEndsAt ? 'trial' : isPro ? 'pro' : 'free';
    identifyUser(session.user.id, plan);
  }, [session, isLoading, isPro, trialEndsAt]);

  return null;
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

function PrefsHydrate() {
  const { session } = useAuth();

  useEffect(() => {
    void hydrateWeightUnit();
    void hydrateDefaultRestSeconds();
  }, [session?.user.id]);

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
  const needsDisclaimerGate = isOnboarded && needsDisclaimerAcceptance(profile.profile);

  if (session && needsDisclaimerGate) {
    return <AcceptDisclaimerScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session && isOnboarded && !needsDisclaimerGate}>
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
        <Stack.Screen name="learn" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            gestureEnabled: true,
            animation: 'slide_from_bottom',
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!!session && needsDisclaimerGate}>
        <Stack.Screen name="accept-disclaimer" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !needsDisclaimerGate}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen
          name="safety"
          options={{
            headerShown: true,
            title: 'Safety and disclaimer',
            headerBackTitle: 'Back',
            headerTintColor: colours.brand,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colours.bg },
          }}
        />
        <Stack.Screen
          name="terms"
          options={{
            headerShown: true,
            title: 'Terms of use',
            headerBackTitle: 'Back',
            headerTintColor: colours.brand,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colours.bg },
          }}
        />
        <Stack.Screen
          name="privacy"
          options={{
            headerShown: true,
            title: 'Privacy policy',
            headerBackTitle: 'Back',
            headerTintColor: colours.brand,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colours.bg },
          }}
        />
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
      <AppText variant="title2" style={{ color: colours.ink }}>
        We couldn't load your profile
      </AppText>
      <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 8, marginBottom: 24 }}>
        Check your connection and try again.
      </AppText>
      {showDevTools ? (
        <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: -12, marginBottom: 24 }}>
          {detail}
        </AppText>
      ) : null}
      <Pressable
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colours.brand, borderRadius: radius.full },
          pressed && styles.buttonPressed,
        ]}
        onPress={onRetry}
        accessibilityRole="button">
        <AppText variant="bodyStrong" style={{ color: colours.onBrand }}>
          Try again
        </AppText>
      </Pressable>
      <Pressable
        style={styles.link}
        onPress={() => supabase.auth.signOut()}
        accessibilityRole="button">
        <AppText variant="bodyStrong" style={{ color: colours.brand }}>
          Sign out
        </AppText>
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
  button: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  link: {
    alignItems: 'center',
    paddingVertical: 20,
  },
});
