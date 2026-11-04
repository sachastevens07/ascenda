import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { getQuizAnswers, useProfile } from '@/lib/profile';

function initials(name: string | null | undefined, email: string | undefined): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts[0]) {
    return parts[0].length >= 2 ? parts[0].slice(0, 2).toUpperCase() : parts[0][0].toUpperCase();
  }
  const local = email?.split('@')[0] ?? '';
  return local.slice(0, 2).toUpperCase() || '?';
}

export function TabAvatar() {
  const { colours, radius } = useTheme();
  const { profile } = useProfile();
  const { session } = useAuth();
  const answers = getQuizAnswers(profile);
  const name = answers?.display_name?.trim() || profile?.display_name;
  const email = session?.user.email;

  return (
    <Pressable
      onPress={() => router.push('/profile' as Href)}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      style={({ pressed }) => [
        styles.avatar,
        { backgroundColor: colours.brandSoft, borderRadius: radius.full },
        pressed && styles.pressed,
      ]}>
      <AppText variant="caption" style={{ color: colours.brand }}>
        {initials(name, email)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
