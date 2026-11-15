import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui';
import { chipsForContext, openCoach, type CoachContextType } from '@/lib/coach';

export function CoachChips({
  type,
  id,
  label,
}: {
  type: CoachContextType;
  id?: string | null;
  label?: string | null;
}) {
  const chips = chipsForContext(type);
  if (chips.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {chips.map((question) => (
        <Chip
          key={question}
          label={question}
          size="lg"
          onPress={() =>
            openCoach({
              context: { type, id: id ?? '', label: label ?? '' },
              question,
              entry: 'chip',
            })
          }
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
