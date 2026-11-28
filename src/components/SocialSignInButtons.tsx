import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { AppleAuthentication, useAppleSignInAvailable } from '@/lib/appleAuth';
import { welcomeCopy } from '@/lib/copy';
import { googleSignInAvailable } from '@/lib/googleAuth';

type Props = {
  /** 'continue' reads "Continue with …" (new accounts); 'sign-in' reads "Sign in with …". */
  kind?: 'continue' | 'sign-in';
  onApple: () => void;
  onGoogle: () => void;
  disabled?: boolean;
  /** Divider under the buttons ("or use email"). Shown only when at least one button shows. */
  dividerLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const BUTTON_HEIGHT = 52;

/**
 * Apple and Google sign-in, each shown only where it works (right build, iOS, set up).
 * Apple's own button, and Google's button drawn to Google's branding rules. Apple sits first,
 * at the same size, as App Store guideline 4.8 expects when another social sign-in is offered.
 */
export function SocialSignInButtons({ kind = 'continue', onApple, onGoogle, disabled, dividerLabel, style }: Props) {
  const apple = useAppleSignInAvailable();
  const google = googleSignInAvailable();
  const { colours, scheme } = useTheme();
  if (!apple && !google) return null;
  const isDark = scheme === 'dark';
  return (
    <View style={[{ gap: 12 }, style]} pointerEvents={disabled ? 'none' : 'auto'}>
      {apple ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            kind === 'sign-in'
              ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
          }
          buttonStyle={
            isDark
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={999}
          style={{ height: BUTTON_HEIGHT, width: '100%', opacity: disabled ? 0.6 : 1 }}
          onPress={onApple}
        />
      ) : null}
      {google ? (
        <Pressable
          onPress={onGoogle}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={kind === 'sign-in' ? welcomeCopy.google_sign_in : welcomeCopy.google_continue}
          style={({ pressed }) => ({
            height: BUTTON_HEIGHT,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: isDark ? '#8E918F' : '#747775',
            backgroundColor: isDark ? '#131314' : '#FFFFFF',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
          })}>
          <GoogleLogo size={18} />
          <AppText variant="bodyStrong" style={{ color: isDark ? '#E3E3E3' : '#1F1F1F', fontSize: 17 }}>
            {kind === 'sign-in' ? welcomeCopy.google_sign_in : welcomeCopy.google_continue}
          </AppText>
        </Pressable>
      ) : null}
      {dividerLabel ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 4 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colours.border }} />
          <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
            {dividerLabel}
          </AppText>
          <View style={{ flex: 1, height: 1, backgroundColor: colours.border }} />
        </View>
      ) : null}
    </View>
  );
}

/** Google's standard four-colour "G", as its sign-in branding guidelines require. */
function GoogleLogo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden>
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}
