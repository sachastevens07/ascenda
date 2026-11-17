import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Chip, PrimaryButton, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { CHECKIN, offerBodyForShortTime, type CheckinOption } from '@/lib/checkin';

/**
 * Logger check-in. The picked option never leaves this component.
 * Parent callbacks never receive an option id or label.
 */
export function CheckinCard({
  onDismiss,
  onDeclineLighter,
  onAcceptLighter,
}: {
  onDismiss: () => void;
  onDeclineLighter: () => void;
  onAcceptLighter: () => void;
}) {
  const { colours, radius, spacing } = useTheme();
  const [offer, setOffer] = useState<{ shortTime: boolean } | null>(null);

  function pick(option: CheckinOption) {
    if (!option.offers_lighter) {
      onDismiss();
      return;
    }
    setOffer({ shortTime: option.id === CHECKIN.shortTimeOptionId });
  }

  function accept() {
    setOffer(null);
    onAcceptLighter();
  }

  function decline() {
    setOffer(null);
    onDeclineLighter();
  }

  if (offer) {
    return (
      <View style={{ backgroundColor: colours.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm }}>
        <AppText variant="title3" style={{ color: colours.ink }}>
          {CHECKIN.offerTitle}
        </AppText>
        <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
          {offerBodyForShortTime(offer.shortTime)}
        </AppText>
        <PrimaryButton label={CHECKIN.offerAccept} onPress={accept} style={{ marginTop: spacing.sm }} />
        <TextButton label={CHECKIN.offerDecline} onPress={decline} style={{ alignSelf: 'flex-start' }} />
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
        {CHECKIN.options.map((option) => (
          <Chip key={option.id} label={option.label} size="lg" onPress={() => pick(option)} />
        ))}
      </View>
      <TextButton label={CHECKIN.skip} onPress={onDismiss} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}
