import { View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { AppleAuthentication, useAppleSignInAvailable } from '@/lib/appleAuth';

type Props = {
  /** 'continue' reads "Continue with Apple"; 'sign-in' reads "Sign in with Apple". */
  kind?: 'continue' | 'sign-in';
  onPress: () => void;
  disabled?: boolean;
  /** Text for the divider under the button ("or use email"). Omit for no divider. */
  dividerLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Apple's own button (required by Apple's guidelines), shown only where Sign in with Apple works:
 * iOS 13+, on a build that includes expo-apple-authentication. Renders nothing elsewhere.
 */
export function AppleSignInButton({ kind = 'continue', onPress, disabled, dividerLabel, style }: Props) {
  const available = useAppleSignInAvailable();
  const { colours, scheme } = useTheme();
  const isDark = scheme === 'dark';
  if (!available) return null;
  return (
    <View style={style} pointerEvents={disabled ? 'none' : 'auto'}>
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
        style={{ height: 52, width: '100%', opacity: disabled ? 0.6 : 1 }}
        onPress={onPress}
      />
      {dividerLabel ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 }}>
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
