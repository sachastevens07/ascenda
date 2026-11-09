import * as ImagePicker from 'expo-image-picker';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, IconButton, PrimaryButton, SafetyNotice, SecondaryButton } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { trackAi } from '@/lib/analytics';
import { aiCopy, machineCopy } from '@/lib/copy';
import { machineGuide } from '@/lib/machineGuides';
import { ensureSubscribed, useSubscriptionGate } from '@/lib/paywall';
import {
  reportScanMiss,
  scanMachinePhoto,
  type ScanMatch,
} from '@/lib/scanMachine';

type Phase = 'idle' | 'checking' | 'choices';

export default function ScanMachineScreen() {
  const insets = useSafeAreaInsets();
  const { colours, spacing, radius } = useTheme();
  const allowed = useSubscriptionGate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [choices, setChoices] = useState<string[]>([]);
  const [guess, setGuess] = useState<string | null>(null);
  const [peopleTip, setPeopleTip] = useState(false);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/machines' as Href);
  }

  function browse() {
    router.replace('/machines' as Href);
  }

  function openGuide(id: string, peopleVisible = peopleTip) {
    trackAi('ai_result_accepted', 'scan_machine');
    router.replace({
      pathname: '/machines/[id]',
      params: { id, scanned: '1', people: peopleVisible ? '1' : '0' },
    } as Href);
  }

  async function pick(source: 'camera' | 'library') {
    if (!ensureSubscribed()) return;
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showDialog(
        source === 'camera' ? 'Camera is off' : 'Photos are off',
        'Turn the permission on in your phone settings if you want to scan a machine.'
      );
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.45,
            exif: false,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.45,
            exif: false,
            base64: true,
          });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setPhase('checking');
    setPeopleTip(false);
    try {
      const base64 = asset.base64 ?? '';
      if (!base64) {
        showDialog(aiCopy.scan_title, aiCopy.error);
        setPhase('idle');
        return;
      }
      const mediaType = (asset.mimeType ?? '').includes('png') ? 'image/png' : 'image/jpeg';
      const outcome = await scanMachinePhoto(base64, mediaType);
      if (outcome.kind === 'limit') {
        showDialog(aiCopy.scan_title, aiCopy.limit, [{ text: 'OK', onPress: browse }]);
        setPhase('idle');
        return;
      }
      if (outcome.kind === 'timeout') {
        showDialog(aiCopy.scan_title, aiCopy.timeout, [{ text: machineCopy.browse, onPress: browse }]);
        setPhase('idle');
        return;
      }
      if (outcome.kind !== 'match') {
        showDialog(aiCopy.scan_title, `${aiCopy.error} ${aiCopy.fallback}`, [
          { text: machineCopy.browse, onPress: browse },
        ]);
        setPhase('idle');
        return;
      }
      applyMatch(outcome.result);
    } catch {
      showDialog(aiCopy.scan_title, `${aiCopy.error} ${aiCopy.fallback}`, [
        { text: machineCopy.browse, onPress: browse },
      ]);
      setPhase('idle');
    }
  }

  function applyMatch(result: ScanMatch) {
    setPeopleTip(result.peopleVisible);
    if (!result.isGymEquipment) {
      showDialog(aiCopy.scan_title, aiCopy.not_equipment);
      setPhase('idle');
      return;
    }
    const options = [result.machineId, ...result.alternatives].filter(
      (id, index, list): id is string => Boolean(id) && list.indexOf(id) === index
    );
    if (result.confidence === 'high' && result.machineId) {
      openGuide(result.machineId, result.peopleVisible);
      return;
    }
    if (options.length === 0) {
      showDialog(aiCopy.scan_title, aiCopy.fallback, [{ text: machineCopy.browse, onPress: browse }]);
      setPhase('idle');
      return;
    }
    setGuess(result.machineId);
    setChoices(options.slice(0, 3));
    setPhase('choices');
  }

  if (!allowed) {
    return <View style={[styles.screen, { backgroundColor: colours.bg }]} />;
  }

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colours.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}>
      <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={goBack} />
      <AppText variant="eyebrow" style={{ color: colours.accent, marginTop: spacing.md }}>
        {aiCopy.scan_title}
      </AppText>
      <AppText variant="title1" style={{ color: colours.ink, marginTop: spacing.xs }}>
        {aiCopy.scan_title}
      </AppText>
      <AppText variant="body" style={{ color: colours.ink, marginTop: spacing.md }}>
        {aiCopy.scan_tip}
      </AppText>
      <AppText variant="bodySm" style={{ color: colours.inkMuted, marginTop: spacing.sm }}>
        {aiCopy.scan_privacy}
      </AppText>

      {phase === 'checking' ? (
        <View style={styles.centre}>
          <ActivityIndicator color={colours.brand} />
          <AppText variant="body" style={{ color: colours.inkMuted, marginTop: spacing.md }}>
            {aiCopy.checking}
          </AppText>
        </View>
      ) : phase === 'choices' ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <AppText variant="title2" style={{ color: colours.ink }}>
            {aiCopy.is_it}
          </AppText>
          {peopleTip ? (
            <AppText variant="bodySm" style={{ color: colours.inkMuted }}>
              {aiCopy.people_tip}
            </AppText>
          ) : null}
          {choices.map((id) => {
            const guide = machineGuide(id);
            if (!guide) return null;
            return (
              <Pressable
                key={id}
                onPress={() => openGuide(id)}
                style={({ pressed }) => [
                  styles.choice,
                  { backgroundColor: colours.surface, borderRadius: radius.lg },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button">
                <AppText variant="bodyStrong" style={{ color: colours.ink }}>
                  {guide.name}
                </AppText>
              </Pressable>
            );
          })}
          <TextLink
            label={aiCopy.none}
            onPress={() => {
              void reportScanMiss(guess);
              browse();
            }}
          />
        </View>
      ) : (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <PrimaryButton label={aiCopy.camera} onPress={() => void pick('camera')} />
          <SecondaryButton label={aiCopy.library} appearance="outline" onPress={() => void pick('library')} />
          <TextLink label={machineCopy.browse} onPress={browse} />
        </View>
      )}

      <AppText variant="caption" style={{ color: colours.inkMuted, marginTop: spacing.lg }}>
        {machineCopy.ai_label}
      </AppText>
      <SafetyNotice style={{ marginTop: spacing.sm }} />
    </View>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colours } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
      <AppText variant="bodyStrong" style={{ color: colours.brand, textAlign: 'center', paddingVertical: 8 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choice: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  pressed: {
    opacity: 0.85,
  },
});
