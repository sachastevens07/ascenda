import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { openCoach, type CoachContextType } from '@/lib/coach';
import { aiCopy } from '@/lib/copy';
import { ensureSubscribed } from '@/lib/paywall';

/** One large "Ask AI" button that opens Coach with this screen as context (replaces the suggested-question chips). */
export function AskAiButton({
  type,
  id,
  label,
  entry,
  style,
}: {
  type: CoachContextType;
  id: string;
  label: string;
  entry: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();
  return (
    <Pressable
      onPress={() => {
        if (!ensureSubscribed()) return;
        openCoach({ context: { type, id, label }, entry });
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colours.brandSoft },
        pressed && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={aiCopy.ask_ai}>
      <Ionicons name="sparkles" size={22} color={colours.brand} />
      <AppText variant="title3" style={{ color: colours.brand }}>
        {aiCopy.ask_ai}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 999,
    paddingHorizontal: 20,
  },
  pressed: {
    opacity: 0.85,
  },
});
