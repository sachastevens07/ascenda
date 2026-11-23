import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Chip, PrimaryButton, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import {
  CHECKIN,
  visibleCheckinOptions,
  type CheckinAdjustmentId,
  type CheckinOption,
} from '@/lib/checkin';
import type { LifeStage } from '@/lib/profile';

/**
 * Logger check-in. The picked option never leaves this component.
 * Parent callbacks never receive an option id or label.
 */
export function CheckinCard({
  lifeStage,
  onPeriodDay = false,
  onDismiss,
  onDecline,
  onAccept,
}: {
  lifeStage: LifeStage | null | undefined;
  onPeriodDay?: boolean;
  onDismiss: () => void;
  onDecline: () => void;
  onAccept: (input: { adjustment: CheckinAdjustmentId }) => void;
}) {
  const { colours, radius, spacing } = useTheme();
  const [offer, setOffer] = useState<CheckinOption | null>(null);
  const options = visibleCheckinOptions(lifeStage, onPeriodDay);

  function pick(option: CheckinOption) {
    if (option.adjustment === 'none' || !option.offer) {
      onDismiss();
      return;
    }
    setOffer(option);
  }

  function accept() {
    if (!offer) return;
    const adjustment = offer.adjustment;
    setOffer(null);
    onAccept({ adjustment });
  }

  function decline() {
    setOffer(null);
    onDecline();
  }

  if (offer?.offer) {
    return (
      <View style={{ backgroundColor: colours.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm }}>
        <AppText variant="title3" style={{ color: colours.ink }}>
          {offer.offer.title}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
          {offer.offer.body}
        </AppText>
        <PrimaryButton label={offer.offer.accept} onPress={accept} style={{ marginTop: spacing.sm }} />
        <TextButton label={offer.offer.decline} onPress={decline} style={{ alignSelf: 'flex-start' }} />
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: colours.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm }}>
      <AppText variant="title3" style={{ color: colours.ink }}>
        {CHECKIN.title}
      </AppText>
      <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
        {CHECKIN.helper}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        {options.map((option) => (
          <Chip key={option.id} label={option.label} size="lg" onPress={() => pick(option)} />
        ))}
      </View>
      <TextButton label={CHECKIN.skip} onPress={onDismiss} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}
