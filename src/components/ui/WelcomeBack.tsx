import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

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
  const { colours, radius, spacing, type } = useTheme();
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
      <Text style={[type.title2, { color: colours.ink }]}>Welcome back</Text>
      <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: spacing.sm }]} numberOfLines={1}>
        {body}
      </Text>
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
