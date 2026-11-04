import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';
import {
  GOAL_LABELS,
  GOALS,
  MAX_MAIN_GOALS,
  toggleMainGoal,
  type Goal,
} from '@/lib/profile';

export function GoalChipGroup({
  selected,
  onChange,
}: {
  selected: Goal[];
  onChange: (next: Goal[]) => void;
}) {
  const { colours, radius } = useTheme();
  const [hint, setHint] = useState<string | null>(null);
  const atMax = selected.length >= MAX_MAIN_GOALS;

  return (
    <View>
      <View style={styles.cloud}>
        {GOALS.map((value) => {
          const index = selected.indexOf(value);
          const isSelected = index >= 0;
          const isMain = index === 0;
          const lockedOut = atMax && !isSelected;
          return (
            <Pressable
              key={value}
              onPress={() => {
                const result = toggleMainGoal(selected, value);
                setHint(result.hint);
                if (result.next !== selected) onChange(result.next);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={
                isMain ? `${GOAL_LABELS[value]}, main goal` : GOAL_LABELS[value]
              }
              style={({ pressed }) => [
                styles.chip,
                {
                  borderRadius: radius.full,
                  backgroundColor: isSelected ? colours.brandSoft : colours.surfaceMuted,
                  borderWidth: isSelected ? 1.5 : 0,
                  borderColor: colours.brand,
                  opacity: lockedOut ? 0.45 : pressed ? 0.8 : 1,
                },
              ]}>
              {isMain ? (
                <AppText variant="eyebrow" style={{ color: colours.accent }}>
                  Main
                </AppText>
              ) : null}
              <AppText variant={isSelected ? 'bodyStrong' : 'body'} style={{ color: isSelected ? colours.brand : colours.ink }}>
                {GOAL_LABELS[value]}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {hint ? (
        <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 12 }}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 28,
  },
  chip: {
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
