import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui';
import { chipsForScreen, openAsk, type AskScreen } from '@/lib/askAscenda';

export function AskChips({
  screen,
  entityId,
}: {
  screen: AskScreen;
  entityId?: string | null;
}) {
  const chips = chipsForScreen(screen);
  if (chips.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {chips.map((label) => (
        <Chip
          key={label}
          label={label}
          size="lg"
          onPress={() => openAsk({ screen, id: entityId ?? undefined, question: label })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
