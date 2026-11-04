import { router, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { colours, useTheme } from '@/constants/theme';
import { authRedirectUrl, isEmailNotConfirmed } from '@/lib/emailAuth';
import { supabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'sign-up';

type Message = { kind: 'error' | 'info'; text: string };

const MIN_PASSWORD_LENGTH = 6;

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { type } = useTheme();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  /** Asked before an account exists, so nothing is stored about anyone under 18. */
  const [ageAnswer, setAgeAnswer] = useState<'adult' | 'under-18' | null>(null);

  const isSignUp = mode === 'sign-up';

  async function handleSubmit() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setMessage({ kind: 'error', text: 'Please enter your email and password.' });
      return;
    }
    if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
      setMessage({
        kind: 'error',
        text: `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: { age_confirmed: true }, emailRedirectTo: authRedirectUrl() },
      });
      if (error) {
        setMessage({ kind: 'error', text: error.message });
      } else if (!data.session) {
        router.replace({ pathname: '/check-inbox', params: { email: trimmedEmail } } as Href);
        setIsSubmitting(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
      if (error) {
        if (isEmailNotConfirmed(error)) {
          router.replace({ pathname: '/check-inbox', params: { email: trimmedEmail } } as Href);
          setIsSubmitting(false);
          return;
        }
        setMessage({
          kind: 'error',
          text:
            error.message === 'Invalid login credentials'
              ? "That email and password don't match. Have another go."
              : error.message,
        });
      }
    }

    setIsSubmitting(false);
  }

  function switchMode() {
    setMode(isSignUp ? 'sign-in' : 'sign-up');
    setMessage(null);
    if (ageAnswer === 'under-18') setAgeAnswer(null);
  }

  if (isSignUp && ageAnswer !== 'adult') {
    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
        ]}>
        {ageAnswer === 'under-18' ? (
          <>
            <AppText variant="display" style={styles.title}>Thanks for stopping by</AppText>
            <AppText variant="body" style={styles.subtitle}>
              Ascenda is for adults aged 18 and over, so we can’t create an account for you yet. We
              haven’t saved anything about you. We’d love to train with you when you’re 18.
            </AppText>
          </>
        ) : (
          <>
            <AppText variant="display" style={styles.title}>Create your account</AppText>
            <AppText variant="body" style={styles.subtitle}>First, are you 18 or over?</AppText>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={() => setAgeAnswer('adult')}
              accessibilityRole="button">
              <AppText variant="bodyStrong" style={styles.buttonText}>Yes, I’m 18 or over</AppText>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, pressed && styles.buttonPressed]}
              onPress={() => setAgeAnswer('under-18')}
              accessibilityRole="button">
              <AppText variant="bodyStrong" style={styles.outlineButtonText}>No, I’m under 18</AppText>
            </Pressable>
          </>
        )}
        <Pressable onPress={switchMode} style={styles.switch} accessibilityRole="button">
          <AppText variant="bodyStrong" style={styles.switchText}>Already have an account? Sign in</AppText>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled">
        <AppText variant="display" style={styles.title}>{isSignUp ? 'Create your account' : 'Welcome back'}</AppText>
        <AppText variant="body" style={styles.subtitle}>Walk in with a plan. Leave stronger.</AppText>

        <View style={styles.field}>
          <AppText variant="bodySm" style={styles.label}>Email</AppText>
          <TextInput
            style={[styles.input, type.bodyStrong, { fontVariant: ['tabular-nums'] }]}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colours.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            editable={!isSubmitting}
          />
        </View>

        <View style={styles.field}>
          <AppText variant="bodySm" style={styles.label}>Password</AppText>
          <TextInput
            style={[styles.input, type.bodyStrong, { fontVariant: ['tabular-nums'] }]}
            value={password}
            onChangeText={setPassword}
            placeholder={isSignUp ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
            placeholderTextColor={colours.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            textContentType={isSignUp ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
            editable={!isSubmitting}
          />
        </View>

        {message && (
          <AppText variant="bodySm" style={[styles.message, message.kind === 'error' && styles.messageError]}>
            {message.text}
          </AppText>
        )}

        <Pressable
          style={({ pressed }) => [styles.button, (pressed || isSubmitting) && styles.buttonPressed]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          accessibilityRole="button">
          {isSubmitting ? (
            <ActivityIndicator color={colours.surface} />
          ) : (
            <AppText variant="bodyStrong" style={styles.buttonText}>{isSignUp ? 'Create account' : 'Sign in'}</AppText>
          )}
        </Pressable>

        <Pressable onPress={switchMode} style={styles.switch} accessibilityRole="button">
          <AppText variant="bodyStrong" style={styles.switchText}>
            {isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </AppText>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
    marginBottom: 36,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    color: colours.text,
    marginBottom: 8,
  },
  input: {
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.surface,
    color: colours.text,
  },
  message: {
    color: colours.text,
    marginBottom: 16,
  },
  messageError: {
    color: colours.accent,
  },
  button: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.accent,
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  outlineButton: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colours.accent,
    backgroundColor: colours.surface,
    marginTop: 12,
  },
  outlineButtonText: {
    color: colours.accent,
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
