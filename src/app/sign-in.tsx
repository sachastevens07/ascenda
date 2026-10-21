import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colours } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'sign-up';

type Message = { kind: 'error' | 'info'; text: string };

const MIN_PASSWORD_LENGTH = 6;

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
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
        options: { data: { age_confirmed: true } },
      });
      if (error) {
        setMessage({ kind: 'error', text: error.message });
      } else if (!data.session) {
        setMessage({
          kind: 'info',
          text: 'Nearly there! Check your inbox for a confirmation email, then come back and sign in.',
        });
        setMode('sign-in');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
      if (error) {
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
            <Text style={styles.title}>Thanks for stopping by</Text>
            <Text style={styles.subtitle}>
              Ascenda is for adults aged 18 and over, so we can’t create an account for you yet. We
              haven’t saved anything about you. We’d love to train with you when you’re 18.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>First, are you 18 or over?</Text>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={() => setAgeAnswer('adult')}
              accessibilityRole="button">
              <Text style={styles.buttonText}>Yes, I’m 18 or over</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.outlineButton, pressed && styles.buttonPressed]}
              onPress={() => setAgeAnswer('under-18')}
              accessibilityRole="button">
              <Text style={styles.outlineButtonText}>No, I’m under 18</Text>
            </Pressable>
          </>
        )}
        <Pressable onPress={switchMode} style={styles.switch} accessibilityRole="button">
          <Text style={styles.switchText}>Already have an account? Sign in</Text>
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
        <Text style={styles.title}>{isSignUp ? 'Create your account' : 'Welcome back'}</Text>
        <Text style={styles.subtitle}>Walk in with a plan. Leave stronger.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
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
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
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
          <Text style={[styles.message, message.kind === 'error' && styles.messageError]}>
            {message.text}
          </Text>
        )}

        <Pressable
          style={({ pressed }) => [styles.button, (pressed || isSubmitting) && styles.buttonPressed]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          accessibilityRole="button">
          {isSubmitting ? (
            <ActivityIndicator color={colours.surface} />
          ) : (
            <Text style={styles.buttonText}>{isSignUp ? 'Create account' : 'Sign in'}</Text>
          )}
        </Pressable>

        <Pressable onPress={switchMode} style={styles.switch} accessibilityRole="button">
          <Text style={styles.switchText}>
            {isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </Text>
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
    fontSize: 32,
    fontWeight: '700',
    color: colours.text,
  },
  subtitle: {
    fontSize: 17,
    color: colours.textMuted,
    marginTop: 8,
    marginBottom: 36,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
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
    fontSize: 17,
    color: colours.text,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
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
    fontSize: 17,
    fontWeight: '700',
    color: colours.accent,
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
