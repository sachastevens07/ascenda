import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, PrimaryButton, TextButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { fillCopy, loggerCopy } from '@/lib/copy';
import {
  formatBlockStepLine,
  type BlockPlayStatus,
  type ResolvedBlock,
} from '@/lib/warmupBlocks';

export function SessionBlockCard({
  block,
  status,
  onStart,
  onSkip,
}: {
  block: ResolvedBlock;
  status: BlockPlayStatus;
  onStart: () => void;
  onSkip: () => void;
}) {
  const { colours, radius } = useTheme();
  const done = status === 'done' || status === 'skipped';
  const [open, setOpen] = useState(!done);

  useEffect(() => {
    if (done) setOpen(false);
  }, [done]);
  const title =
    block.kind === 'warmup'
      ? fillCopy(loggerCopy.warmup_block, { minutes: block.estimatedMinutes })
      : fillCopy(loggerCopy.cooldown_block, { minutes: block.estimatedMinutes });
  const startLabel = block.kind === 'warmup' ? 'Start warm-up' : 'Start cool-down';

  return (
    <View style={[styles.card, { backgroundColor: colours.surface, borderRadius: radius.lg }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          style={styles.headerMain}
          accessibilityRole="button"
          accessibilityLabel={open ? `Hide ${title}` : `Show ${title}`}>
          <Ionicons
            name={status === 'done' ? 'checkmark-circle' : status === 'skipped' ? 'remove-circle-outline' : 'ellipse-outline'}
            size={22}
            color={status === 'done' ? colours.success : colours.inkMuted}
          />
          <View style={styles.flex}>
            <AppText variant="eyebrow" style={{ color: colours.accent }}>
              {title}
            </AppText>
            {status === 'skipped' ? (
              <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: 2 }}>
                {loggerCopy.block_skipped}
              </AppText>
            ) : status === 'done' ? (
              <AppText variant="bodySm" style={{ color: colours.success, marginTop: 2 }}>
                Done
              </AppText>
            ) : null}
          </View>
          {status === 'pending' ? null : (
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colours.brand} />
          )}
        </Pressable>
        {status === 'pending' ? (
          <TextButton label={loggerCopy.block_skip} onPress={onSkip} />
        ) : null}
      </View>

      {open ? (
        <View style={styles.body}>
          <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
            {block.intro}
          </AppText>
          {block.steps.map((step, index) => (
            <AppText key={`${step.slug}-${index}`} variant="body" style={{ color: colours.ink }}>
              {formatBlockStepLine(step)}
            </AppText>
          ))}
          {status === 'pending' ? <PrimaryButton label={startLabel} onPress={onStart} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  body: {
    marginTop: 10,
    gap: 8,
  },
});
