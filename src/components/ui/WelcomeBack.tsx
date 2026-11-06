import { type Ref } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { AnchorHandle } from '@/components/AnchoredMenu';
import { useTheme } from '@/constants/theme';

import { PrimaryButton, TextButton } from './Buttons';

export function WelcomeBackCard({
  eyebrow,
  title,
  body,
  cta,
  seeOptions,
  starting = false,
  onStartLighter,
  onSeeOptions,
  optionsRef,
  style,
}: {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  seeOptions: string;
  starting?: boolean;
  onStartLighter: () => void;
  onSeeOptions: () => void;
  optionsRef?: Ref<AnchorHandle>;
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
      <AppText variant="eyebrow" style={{ color: colours.accent }}>
        {eyebrow}
      </AppText>
      <AppText variant="title2" style={{ color: colours.ink, marginTop: 6 }}>
        {title}
      </AppText>
      <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
        {body}
      </AppText>
      <PrimaryButton
        label={starting ? 'Starting…' : cta}
        onPress={onStartLighter}
        loading={starting}
        disabled={starting}
        style={{ marginTop: spacing.md }}
      />
      <View ref={optionsRef} collapsable={false}>
        <TextButton label={seeOptions} onPress={onSeeOptions} style={{ alignSelf: 'flex-start' }} />
      </View>
    </View>
  );
}
