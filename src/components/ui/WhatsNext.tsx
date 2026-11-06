import { Image, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import { routineActionsCopy } from '@/lib/copy';

import { PrimaryButton, TextButton } from './Buttons';

export function WhatsNextCard({
  title,
  body,
  image,
  starting = false,
  primaryLabel,
  onPrimary,
  onSeeRoutine,
  seeRoutineLabel = routineActionsCopy.whats_next_cta,
  style,
}: {
  title: string;
  body: string;
  image?: ImageSourcePropType | null;
  starting?: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  onSeeRoutine?: () => void;
  seeRoutineLabel?: string;
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
            {routineActionsCopy.whats_next_eyebrow}
          </AppText>
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
          <TextButton label={seeRoutineLabel} onPress={onSeeRoutine} style={{ alignSelf: 'flex-start' }} />
        ) : null}
      </View>
    </View>
  );
}
