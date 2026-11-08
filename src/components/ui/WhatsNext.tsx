import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import { routineActionsCopy } from '@/lib/copy';

import { PrimaryButton, TextButton } from './Buttons';
import { PhotoFill } from './Cards';

export function WhatsNextCard({
  title,
  body,
  image,
  imageSlug,
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
  imageSlug?: string | null;
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
      {image || imageSlug ? (
        <View style={{ height: 140 }}>
          <PhotoFill slug={imageSlug} source={imageSlug ? null : image} kind="people" label={title} />
        </View>
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
