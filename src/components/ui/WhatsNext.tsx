import { Image, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';

import { ProBadge } from './Badges';
import { PrimaryButton, TextButton } from './Buttons';

export function WhatsNextCard({
  title,
  body,
  image,
  locked = false,
  starting = false,
  primaryLabel,
  onPrimary,
  onSeeRoutine,
  style,
}: {
  title: string;
  body: string;
  image?: ImageSourcePropType | null;
  locked?: boolean;
  starting?: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  onSeeRoutine?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colours.surface,
          borderRadius: radius.xl,
          overflow: 'hidden',
        },
        style,
      ]}>
      {image ? (
        <Image source={image} style={{ width: '100%', height: 140 }} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : null}
      <View style={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AppText variant="eyebrow" style={{ color: colours.accent }}>
            What’s next
          </AppText>
          {locked ? <ProBadge compact /> : null}
        </View>
        <AppText variant="title2" style={{ color: colours.ink, marginTop: spacing.sm }}>
          {title}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.xs }}>
          {body}
        </AppText>
        <PrimaryButton
          label={starting ? 'Starting…' : primaryLabel}
          onPress={onPrimary}
          loading={starting}
          disabled={starting}
          style={{ marginTop: spacing.md }}
        />
        {onSeeRoutine ? (
          <TextButton label="See this routine" onPress={onSeeRoutine} style={{ alignSelf: 'flex-start' }} />
        ) : null}
      </View>
    </View>
  );
}
