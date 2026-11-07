import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { getQuizAnswers, useProfile } from '@/lib/profile';
import { captureInviteCode, claimPendingReferral, parseReferralCode } from '@/lib/referrals';

export default function InviteCodeScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { colours } = useTheme();
  const { session, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const parsed = parseReferralCode(code);

  useEffect(() => {
    if (authLoading || (session && profileLoading)) return;
    let cancelled = false;
    void (async () => {
      if (parsed) await captureInviteCode(parsed);
      if (cancelled) return;
      if (!session) {
        router.replace('/sign-in' as Href);
        return;
      }
      if (parsed) await claimPendingReferral();
      if (cancelled) return;
      const onboarded =
        getQuizAnswers(profile) !== null && Boolean(profile?.age_confirmed_at);
      router.replace((onboarded ? '/' : '/onboarding') as Href);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, parsed, profile, profileLoading, session]);

  return (
    <View style={[styles.centre, { backgroundColor: colours.bg }]}>
      <ActivityIndicator color={colours.brand} />
      <AppText variant="body" style={{ color: colours.inkMuted, marginTop: 16, textAlign: 'center' }}>
        Saving your invite…
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
