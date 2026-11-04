import { View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';

import { PrimaryButton, TextButton } from './Buttons';

export function WelcomeBackCard({
  body,
  starting = false,
  onStartLighter,
  onSeeOptions,
  style,
}: {
  body: string;
  starting?: boolean;
  onStartLighter: () => void;
  onSeeOptions: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colours.accentSoft,
          borderRadius: radius.xl,
          padding: spacing.lg,
        },
        style,
      ]}>
      <AppText variant="title2" style={{ color: colours.ink }}>
        Welcome back
      </AppText>
      <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.sm }} numberOfLines={1}>
        {body}
      </AppText>
      <PrimaryButton
        label={starting ? 'Starting…' : 'Start a lighter session'}
        onPress={onStartLighter}
        loading={starting}
        disabled={starting}
        style={{ marginTop: spacing.md }}
      />
      <TextButton label="See other options" onPress={onSeeOptions} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}
