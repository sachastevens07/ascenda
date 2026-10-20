import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colours } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { session } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.label}>Signed in as</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      <Pressable
        style={({ pressed }) => [styles.button, (pressed || isSigningOut) && styles.buttonPressed]}
        onPress={handleSignOut}
        disabled={isSigningOut}
        accessibilityRole="button">
        <Text style={styles.buttonText}>{isSigningOut ? 'Signing out…' : 'Sign out'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 32,
    backgroundColor: colours.background,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    color: colours.textMuted,
  },
  email: {
    fontSize: 18,
    fontWeight: '600',
    color: colours.text,
    marginTop: 4,
    marginBottom: 32,
  },
  button: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
  },
});
