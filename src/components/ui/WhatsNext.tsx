import { Image, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

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
  const { colours, radius, spacing, type } = useTheme();
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
          <Text style={[type.caption, { color: colours.accent, fontWeight: '700' }]}>What’s next</Text>
          {locked ? <ProBadge compact /> : null}
        </View>
        <Text style={[type.title2, { color: colours.ink, marginTop: spacing.sm }]}>{title}</Text>
        <Text style={[type.bodySm, { color: colours.inkMuted, marginTop: spacing.xs }]}>{body}</Text>
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
