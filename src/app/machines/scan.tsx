import { Camera, CameraView } from 'expo-camera';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
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

type Phase = 'idle' | 'camera' | 'checking' | 'choices';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.2,
  exif: false,
  base64: false,
  allowsEditing: false,
};

const MAX_BASE64_CHARS = 2_000_000;

async function readImageBase64(uri: string): Promise<string> {
  const value = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  return value.replace(/\s/g, '');
}

function pickScanSize(sizes: string[]): string | undefined {
  const parsed = sizes
    .map((value) => {
      const [width, height] = value.split('x').map(Number);
      return { value, pixels: (width || 0) * (height || 0) };
    })
    .filter((row) => row.pixels > 0)
    .sort((a, b) => a.pixels - b.pixels);
  const largeEnough = parsed.find((row) => row.pixels >= 640 * 480);
  return (largeEnough ?? parsed[0])?.value;
}

export default function ScanMachineScreen() {
  const insets = useSafeAreaInsets();
  const { colours, spacing, radius } = useTheme();
  const allowed = useSubscriptionGate();
  const cameraRef = useRef<CameraView>(null);
  const capturing = useRef(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [cameraReady, setCameraReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>();
  const [choices, setChoices] = useState<string[]>([]);
  const [guess, setGuess] = useState<string | null>(null);
  const [peopleTip, setPeopleTip] = useState(false);

  function goBack() {
    if (phase === 'camera') {
      setPhase('idle');
      setCameraReady(false);
      return;
    }
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

  async function runScan(base64: string, mediaType: 'image/jpeg' | 'image/png') {
    if (base64.length < 100 || base64.length > MAX_BASE64_CHARS) {
      showDialog(aiCopy.scan_title, aiCopy.error);
      setPhase('idle');
      return;
    }
    setPhase('checking');
    setPeopleTip(false);
    try {
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

  async function openCamera() {
    if (!ensureSubscribed()) return;
    try {
      const permission = Camera.requestCameraPermissionsAsync
        ? await Camera.requestCameraPermissionsAsync()
        : await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showDialog(
          'Camera is off',
          'Turn the permission on in your phone settings if you want to scan a machine.'
        );
        return;
      }
      capturing.current = false;
      setCameraReady(false);
      setPictureSize(undefined);
      setPhase('camera');
    } catch {
      showDialog(aiCopy.scan_title, aiCopy.error);
    }
  }

  async function onCameraReady() {
    setCameraReady(true);
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      const chosen = pickScanSize(sizes ?? []);
      if (chosen) setPictureSize(chosen);
    } catch {
      /* Device list is optional; quality still keeps the JPEG small. */
    }
  }

  async function capture() {
    if (!ensureSubscribed() || capturing.current || !cameraReady) return;
    capturing.current = true;
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.2,
        base64: true,
        exif: false,
        shutterSound: false,
      });
      const raw = photo?.base64 ?? '';
      const base64 = raw.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/i, '').replace(/\s/g, '');
      if (base64) {
        await runScan(base64, 'image/jpeg');
        return;
      }
      if (photo?.uri) {
        await runScan(await readImageBase64(photo.uri), 'image/jpeg');
        return;
      }
      showDialog(aiCopy.scan_title, aiCopy.error);
      setPhase('idle');
    } catch {
      showDialog(aiCopy.scan_title, `${aiCopy.error} ${aiCopy.fallback}`, [
        { text: machineCopy.browse, onPress: browse },
      ]);
      setPhase('idle');
    } finally {
      capturing.current = false;
    }
  }

  async function pickLibrary() {
    if (!ensureSubscribed()) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showDialog(
        'Photos are off',
        'Turn the permission on in your phone settings if you want to scan a machine.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.uri) return;
    try {
      const mediaType = (asset.mimeType ?? '').includes('png') ? 'image/png' : 'image/jpeg';
      await runScan(await readImageBase64(asset.uri), mediaType);
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

  if (phase === 'camera') {
    return (
      <View style={styles.cameraScreen}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture"
          mute
          animateShutter={false}
          pictureSize={pictureSize}
          onCameraReady={() => void onCameraReady()}
        />
        <View style={[styles.cameraTop, { paddingTop: insets.top + 8 }]}>
          <IconButton icon="close" variant="overlay" accessibilityLabel="Close camera" onPress={goBack} />
          <AppText variant="bodySm" style={styles.cameraTip}>
            {aiCopy.scan_tip}
          </AppText>
        </View>
        <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 24 }]}>
          <PrimaryButton
            label={aiCopy.take_photo}
            onPress={() => void capture()}
            disabled={!cameraReady}
          />
        </View>
      </View>
    );
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
          <PrimaryButton label={aiCopy.camera} onPress={() => void openCamera()} />
          <SecondaryButton label={aiCopy.library} appearance="outline" onPress={() => void pickLibrary()} />
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
  cameraScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraTop: {
    paddingHorizontal: 24,
    gap: 12,
  },
  cameraTip: {
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cameraBottom: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 0,
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
