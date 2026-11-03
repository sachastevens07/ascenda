import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, TextButton } from '@/components/ui/Buttons';
import { useTheme } from '@/constants/theme';
import {
  DISCLAIMER_CHECK_HEADING,
  DISCLAIMER_CHECK_ITEMS,
  DISCLAIMER_CHECKBOX_LABEL,
  DISCLAIMER_CLOSE,
  DISCLAIMER_INTRO,
  DISCLAIMER_LIMITS_BODY,
  DISCLAIMER_LIMITS_HEADING,
  DISCLAIMER_STOP_BODY,
  DISCLAIMER_STOP_HEADING,
  DISCLAIMER_TITLE,
  FIRST_SESSION_BULLETS,
  FIRST_SESSION_TITLE,
  SAFETY_NOTICE_LABEL,
} from '@/lib/disclaimer';

export function DisclaimerBody({ hideTitle = false }: { hideTitle?: boolean }) {
  const { colours, type, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      {hideTitle ? null : (
        <Text style={[type.title2, { color: colours.ink }]}>{DISCLAIMER_TITLE}</Text>
      )}
      <Text style={[type.body, { color: colours.ink }]}>{DISCLAIMER_INTRO}</Text>
      <Text style={[type.title3, { color: colours.ink }]}>{DISCLAIMER_CHECK_HEADING}</Text>
      <View style={{ gap: 8 }}>
        {DISCLAIMER_CHECK_ITEMS.map((item) => (
          <Text key={item} style={[type.body, { color: colours.ink }]}>
            {`\u2022 ${item}`}
          </Text>
        ))}
      </View>
      <Text style={[type.title3, { color: colours.ink }]}>{DISCLAIMER_STOP_HEADING}</Text>
      <Text style={[type.body, { color: colours.ink }]}>{DISCLAIMER_STOP_BODY}</Text>
      <Text style={[type.title3, { color: colours.ink }]}>{DISCLAIMER_LIMITS_HEADING}</Text>
      <Text style={[type.body, { color: colours.ink }]}>{DISCLAIMER_LIMITS_BODY}</Text>
      <Text style={[type.body, { color: colours.ink }]}>{DISCLAIMER_CLOSE}</Text>
    </View>
  );
}

export function DisclaimerCheckbox({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  const { colours, type, radius } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={DISCLAIMER_CHECKBOX_LABEL}
      style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}>
      <View
        style={[
          styles.box,
          {
            borderColor: checked ? colours.brand : colours.border,
            backgroundColor: checked ? colours.brand : colours.surface,
            borderRadius: radius.sm,
          },
        ]}>
        {checked ? <Ionicons name="checkmark" size={16} color={colours.onBrand} /> : null}
      </View>
      <Text style={[type.body, { color: colours.ink, flex: 1 }]}>{DISCLAIMER_CHECKBOX_LABEL}</Text>
    </Pressable>
  );
}

export function SafetyNotice({ style }: { style?: object }) {
  const { colours, type } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/safety' as Href)}
      accessibilityRole="link"
      accessibilityLabel={SAFETY_NOTICE_LABEL}
      style={({ pressed }) => [pressed && styles.pressed, style]}>
      <Text style={[type.caption, { color: colours.inkMuted }]}>
        Train within your limits.{' '}
        <Text style={{ color: colours.brand, fontWeight: '700' }}>Read the safety guidance</Text>
      </Text>
    </Pressable>
  );
}

export function DisclaimerSheet({
  visible,
  onUnderstand,
  onDismiss,
}: {
  visible: boolean;
  onUnderstand: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colours, type, radius, spacing, shadow } = useTheme();
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (visible) setShowFull(false);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}>
      <View style={[styles.overlay, { backgroundColor: colours.overlay }]}>
        <Pressable style={styles.dismissHit} onPress={onDismiss} accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colours.surface,
              borderRadius: radius.xl,
              paddingBottom: Math.max(insets.bottom, 16),
            },
            shadow,
          ]}>
          <Text style={[type.title2, { color: colours.ink }]}>{FIRST_SESSION_TITLE}</Text>
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.sm }}
            showsVerticalScrollIndicator={false}>
            {showFull ? (
              <DisclaimerBody />
            ) : (
              FIRST_SESSION_BULLETS.map((item) => (
                <Text key={item} style={[type.body, { color: colours.ink }]}>
                  {`\u2022 ${item}`}
                </Text>
              ))
            )}
          </ScrollView>
          <TextButton
            label={showFull ? 'Back to summary' : 'Read the full safety guidance'}
            onPress={() => setShowFull((open) => !open)}
            style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
          />
          <PrimaryButton label="I understand" onPress={onUnderstand} style={{ marginTop: spacing.sm }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  box: {
    width: 24,
    height: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  pressed: {
    opacity: 0.8,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  dismissHit: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 20,
    zIndex: 1,
  },
  sheetScroll: {
    maxHeight: 360,
  },
});
