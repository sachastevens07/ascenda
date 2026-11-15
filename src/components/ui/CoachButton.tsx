import { ensureSubscribed } from '@/lib/paywall';
import { COACH_UI, openCoachFromHeader } from '@/lib/coach';

import { IconButton } from './IconButton';

export function CoachButton() {
  return (
    <IconButton
      icon="sparkles-outline"
      accessibilityLabel={COACH_UI.title}
      onPress={() => {
        if (!ensureSubscribed()) return;
        void openCoachFromHeader();
      }}
    />
  );
}
