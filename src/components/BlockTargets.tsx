import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colours } from '@/constants/theme';
import { describeTargetRange, type BlockTarget, type TrainingBlock } from '@/lib/blocks';

export function BlockTargets({ block }: { block: TrainingBlock }) {
  if (block.targets.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <AppText variant="bodySm" style={{ color: colours.textMuted }}>
        This block
      </AppText>
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
        <AppText variant="bodyStrong" style={{ color: colours.text }}>
          {target.exercise.name}
        </AppText>
        <AppText variant="caption" style={{ color: colours.textMuted }}>
          {describeTargetRange(target)}
        </AppText>
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
  row: {
    gap: 6,
  },
  copy: {
    gap: 2,
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
