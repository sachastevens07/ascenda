import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { SlideInLeft, SlideInRight, SlideOutLeft, SlideOutRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, PrimaryButton, ProgressBar, TextButton } from '@/components/ui';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/constants/theme';

const TRANSITION_MS = 250;

export function OnboardingShell({
  children,
  screenKey,
  direction,
  progress,
  showProgress,
  showBack,
  backIsCancel,
  onBack,
  primaryLabel,
  primaryDisabled,
  primaryLoading,
  onPrimary,
  secondaryLabel,
  onSecondary,
  skipLabel,
  onSkip,
  footerNote,
}: {
  children: ReactNode;
  screenKey: string;
  direction: number;
  progress: number;
  showProgress: boolean;
  showBack: boolean;
  backIsCancel?: boolean;
  onBack: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  skipLabel?: string;
  onSkip?: () => void;
  footerNote?: string;
}) {
  const insets = useSafeAreaInsets();
  const { colours } = useTheme();
  const entering = direction >= 0 ? SlideInRight.duration(TRANSITION_MS) : SlideInLeft.duration(TRANSITION_MS);
  const exiting = direction >= 0 ? SlideOutLeft.duration(TRANSITION_MS) : SlideOutRight.duration(TRANSITION_MS);

  return (
    <View style={[styles.screen, { backgroundColor: colours.bg, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        {showBack ? (
          backIsCancel ? (
            <TextButton label="Cancel" onPress={onBack} />
          ) : (
            <IconButton icon="chevron-back" onPress={onBack} accessibilityLabel="Back" />
          )
        ) : (
          <View style={styles.backSpacer} />
        )}
      </View>
      {showProgress ? (
        <ProgressBar progress={progress} style={styles.progress} />
      ) : null}

      <View style={styles.slideClip}>
        <Animated.View
          key={screenKey}
          entering={entering}
          exiting={exiting}
          style={styles.slidePane}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {footerNote ? (
          <AppText variant="caption" style={{ color: colours.inkMuted, marginBottom: 8, textAlign: 'center' }}>
            {footerNote}
          </AppText>
        ) : null}
        {primaryLabel ? (
          <PrimaryButton
            label={primaryLabel}
            onPress={onPrimary}
            disabled={primaryDisabled}
            loading={primaryLoading}
          />
        ) : null}
        {skipLabel && onSkip ? (
          <TextButton label={skipLabel} onPress={onSkip} style={styles.skip} />
        ) : null}
        {secondaryLabel && onSecondary ? (
          <TextButton label={secondaryLabel} onPress={onSecondary} style={styles.skip} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    minHeight: 44,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  backSpacer: { width: 44, height: 44 },
  progress: { marginHorizontal: 24, marginBottom: 8 },
  slideClip: { flex: 1, overflow: 'hidden' },
  slidePane: { flex: 1 },
  content: { paddingHorizontal: 24, paddingBottom: 24, flexGrow: 1 },
  footer: { paddingHorizontal: 24, paddingTop: 8, gap: 4 },
  skip: { alignSelf: 'center', marginTop: 8 },
});
