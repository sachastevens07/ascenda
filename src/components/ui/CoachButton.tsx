import { useTheme } from '@/constants/theme';
import { ensureSubscribed } from '@/lib/paywall';
import { COACH_UI, openCoachFromHeader } from '@/lib/coach';

import { IconButton } from './IconButton';

export function CoachButton({ onPress }: { onPress?: () => void } = {}) {
  const { colours, radius } = useTheme();
  return (
    <IconButton
      icon="sparkles"
      size={20}
      color={colours.brand}
      accessibilityLabel={COACH_UI.title}
      onPress={() => {
        if (!ensureSubscribed()) return;
        if (onPress) {
          onPress();
          return;
        }
        void openCoachFromHeader();
      }}
      style={{
        width: 40,
        height: 40,
        borderRadius: radius.full,
        backgroundColor: colours.brandSoft,
      }}
    />
  );
}
