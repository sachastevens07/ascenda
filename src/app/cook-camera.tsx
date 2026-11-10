import { Camera, CameraView } from 'expo-camera';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showDialog } from '@/components/Dialog';
import { AppText, IconButton, SecondaryButton } from '@/components/ui';
import { aiCopy, fillCopy } from '@/lib/copy';
import {
  addCookCameraPhoto,
  cookCameraMax,
  readCookCameraPhotos,
} from '@/lib/cookCameraSession';
import { ensureSubscribed, useSubscriptionGate } from '@/lib/paywall';
import type { CookImage } from '@/lib/whatCanICook';

const MAX_BASE64_CHARS = 2_000_000;

async function readImageBase64(uri: string): Promise<string> {
  const value = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  return value.replace(/\s/g, '');
}

function photoUri(photo: CookImage): string {
  return photo.uri || `data:${photo.mediaType};base64,${photo.base64}`;
}

export default function CookCameraScreen() {
  const insets = useSafeAreaInsets();
  const allowed = useSubscriptionGate();
  const cameraRef = useRef<CameraView>(null);
  const capturing = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [photos, setPhotos] = useState<CookImage[]>(() => readCookCameraPhotos());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const permission = await Camera.requestCameraPermissionsAsync();
        if (cancelled) return;
        if (!permission.granted) {
          showDialog(
            'Camera is off',
            'Turn the permission on in your phone settings if you want to photograph your fridge.'
          );
          if (router.canGoBack()) router.back();
        }
      } catch {
        if (!cancelled) {
          showDialog(aiCopy.cook_title, aiCopy.error);
          if (router.canGoBack()) router.back();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cameraReady) return;
    const timer = setTimeout(() => setCameraReady(true), 1600);
    return () => clearTimeout(timer);
  }, [cameraReady]);

  function close() {
    if (router.canGoBack()) router.back();
  }

  async function capture() {
    if (!ensureSubscribed() || capturing.current || !cameraReady) return;
    if (photos.length >= cookCameraMax()) {
      showDialog(aiCopy.cook_title, aiCopy.cook_photo_max);
      return;
    }
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
      const uri = photo?.uri;
      let next: CookImage | null = null;
      if (base64.length >= 100 && base64.length <= MAX_BASE64_CHARS) {
        next = { base64, mediaType: 'image/jpeg', uri };
      } else if (uri) {
        const fromFile = await readImageBase64(uri);
        if (fromFile.length >= 100 && fromFile.length <= MAX_BASE64_CHARS) {
          next = { base64: fromFile, mediaType: 'image/jpeg', uri };
        }
      }
      if (!next) {
        showDialog(aiCopy.cook_title, aiCopy.error);
        return;
      }
      setPhotos(addCookCameraPhoto(next));
    } catch {
      showDialog(aiCopy.cook_title, aiCopy.error);
    } finally {
      capturing.current = false;
    }
  }

  if (!allowed) {
    return <View style={styles.screen} />;
  }

  const atLimit = photos.length >= cookCameraMax();

  return (
    <View style={styles.screen}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
        mute
        animateShutter={false}
        onCameraReady={() => setCameraReady(true)}
      />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <IconButton icon="close" variant="overlay" accessibilityLabel="Close camera" onPress={close} />
        <AppText variant="bodySm" style={styles.tip}>
          {aiCopy.cook_privacy}
        </AppText>
        {photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
            {photos.map((photo, index) => (
              <Image key={`taken-${index}`} source={{ uri: photoUri(photo) }} style={styles.thumb} />
            ))}
          </ScrollView>
        ) : null}
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        {photos.length > 0 ? (
          <AppText variant="bodyStrong" style={styles.count}>
            {photos.length === 1
              ? aiCopy.cook_photo_one
              : fillCopy(aiCopy.cook_photo_attached, { count: photos.length })}
          </AppText>
        ) : null}
        <Pressable
          onPress={() => void capture()}
          disabled={!cameraReady || atLimit}
          accessibilityRole="button"
          accessibilityLabel={photos.length > 0 ? aiCopy.cook_photo_add : aiCopy.take_photo}
          style={({ pressed }) => [
            styles.shutter,
            (!cameraReady || atLimit) && styles.shutterOff,
            pressed && cameraReady && !atLimit && styles.pressed,
          ]}>
          <View style={styles.shutterInner} />
        </Pressable>
        <SecondaryButton label={aiCopy.cook_photo_done} appearance="outline" onPress={close} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  top: {
    paddingHorizontal: 24,
    gap: 12,
  },
  tip: {
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  thumbs: {
    gap: 8,
    paddingBottom: 4,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  count: {
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottom: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 0,
    gap: 8,
  },
  shutter: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  shutterOff: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
});
