import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
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
  const slideX = useRef(new Animated.Value(0)).current;
  const lastKey = useRef(screenKey);

  useEffect(() => {
    if (lastKey.current === screenKey) return;
    lastKey.current = screenKey;
    const width = Dimensions.get('window').width;
    slideX.setValue(direction >= 0 ? width : -width);
    Animated.timing(slideX, {
      toValue: 0,
      duration: TRANSITION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [direction, screenKey, slideX]);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colours.bg, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
        <Animated.View style={[styles.slidePane, { transform: [{ translateX: slideX }] }]}>
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
    </KeyboardAvoidingView>
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
