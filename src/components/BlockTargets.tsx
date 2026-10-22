import { StyleSheet, Text, View } from 'react-native';

import { colours } from '@/constants/theme';
import { describeTargetRange, type BlockTarget, type TrainingBlock } from '@/lib/blocks';

export function BlockTargets({ block }: { block: TrainingBlock }) {
  if (block.targets.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>This block</Text>
      {block.targets.map((target) => (
        <TargetRow key={target.id} target={target} />
      ))}
    </View>
  );
}

function TargetRow({ target }: { target: BlockTarget }) {
  const filled = Math.round(target.progress * 100);
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.name}>{target.exercise.name}</Text>
        <Text style={styles.range}>{describeTargetRange(target)}</Text>
      </View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: filled }}>
        <View style={[styles.fill, { width: `${filled}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    gap: 10,
  },
  heading: {
    fontSize: 14,
    fontWeight: '600',
    color: colours.textMuted,
  },
  row: {
    gap: 6,
  },
  copy: {
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colours.text,
  },
  range: {
    fontSize: 13,
    color: colours.textMuted,
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colours.accentSoft,
  },
  fill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colours.accent,
  },
});
