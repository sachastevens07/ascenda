import AsyncStorage from '@react-native-async-storage/async-storage';

import { showDialog } from '@/components/Dialog';
import { supabase } from '@/lib/supabase';

export const PROGRESS_PHOTOS_BUCKET = 'progress-photos';

export type ProgressPhoto = {
  id: string;
  storage_path: string;
  taken_on: string;
  created_at: string;
  url: string | null;
};

function isMissingPhotos(error: { message?: string; code?: string }): boolean {
  const detail = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /progress_photos|progress-photos/.test(detail)
  );
}

export function missingPhotosMessage(): string {
  return 'Progress photos need supabase/activity.sql run in the Supabase SQL editor.';
}

export function describePhotosError(error: unknown): string {
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  if (/42P01|PGRST205|progress_photos|progress-photos/i.test(detail)) {
    return missingPhotosMessage();
  }
  return detail || 'Check your connection and try again.';
}

function todayDate(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function signedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PROGRESS_PHOTOS_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function fetchProgressPhotos(): Promise<ProgressPhoto[]> {
  const { data, error } = await supabase
    .from('progress_photos')
    .select('id, storage_path, taken_on, created_at')
    .order('taken_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingPhotos(error)) throw new Error(missingPhotosMessage());
    throw new Error(error.message);
  }
  const rows = (data ?? []) as Omit<ProgressPhoto, 'url'>[];
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      url: await signedUrl(row.storage_path),
    }))
  );
}

export async function uploadProgressPhoto(localUri: string, takenOn = todayDate()): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');

  const response = await fetch(localUri);
  if (!response.ok) throw new Error('Couldn’t read that photo.');
  const blob = await response.blob();
  const mime = blob.type || 'image/jpeg';
  const extension = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(PROGRESS_PHOTOS_BUCKET)
    .upload(storagePath, blob, { contentType: mime, upsert: false });
  if (uploadError) {
    if (isMissingPhotos(uploadError)) throw new Error(missingPhotosMessage());
    throw new Error(uploadError.message);
  }

  const { error } = await supabase.from('progress_photos').insert({
    user_id: user.id,
    storage_path: storagePath,
    taken_on: takenOn,
  });
  if (error) {
    await supabase.storage.from(PROGRESS_PHOTOS_BUCKET).remove([storagePath]).catch(() => {});
    if (isMissingPhotos(error)) throw new Error(missingPhotosMessage());
    throw new Error(error.message);
  }
}

export async function deleteProgressPhoto(photo: ProgressPhoto): Promise<void> {
  const { error } = await supabase.from('progress_photos').delete().eq('id', photo.id);
  if (error) {
    if (isMissingPhotos(error)) throw new Error(missingPhotosMessage());
    throw new Error(error.message);
  }
  await supabase.storage.from(PROGRESS_PHOTOS_BUCKET).remove([photo.storage_path]).catch(() => {});
}

export async function deleteAllProgressPhotos(photos: ProgressPhoto[]): Promise<void> {
  if (photos.length === 0) return;
  const { error } = await supabase
    .from('progress_photos')
    .delete()
    .in(
      'id',
      photos.map((photo) => photo.id)
    );
  if (error) {
    if (isMissingPhotos(error)) throw new Error(missingPhotosMessage());
    throw new Error(error.message);
  }
  await supabase.storage
    .from(PROGRESS_PHOTOS_BUCKET)
    .remove(photos.map((photo) => photo.storage_path))
    .catch(() => {});
}

const ENABLED_KEY = 'photos_enabled';
const CONSENT_KEY = 'photos_consent_accepted';

function isMissingEnabledColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  return /photos_enabled/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);
}

export async function fetchPhotosEnabled(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(ENABLED_KEY);
    const local = stored === '1';
    const { data, error } = await supabase.from('profiles').select('photos_enabled').maybeSingle();
    if (error) return local;
    const value = (data as { photos_enabled?: boolean | null } | null)?.photos_enabled;
    if (typeof value === 'boolean') {
      if (local && !value) {
        await savePhotosEnabled(true);
        return true;
      }
      return value;
    }
    return local;
  } catch {
    return false;
  }
}

export async function savePhotosEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('profiles').update({ photos_enabled: enabled }).eq('user_id', user.id);
  if (error && !isMissingEnabledColumn(error)) throw new Error(error.message);
}

async function hasPhotosConsent(): Promise<boolean> {
  return (await AsyncStorage.getItem(CONSENT_KEY)) === '1';
}

async function acceptPhotosConsent(): Promise<void> {
  await AsyncStorage.setItem(CONSENT_KEY, '1');
}

/** First time she turns photos on, she must accept the privacy copy. Later toggles skip it. */
export function confirmEnablePhotos(onEnable: () => void): void {
  void hasPhotosConsent().then((ok) => {
    if (ok) {
      onEnable();
      return;
    }
    showDialog(
      'Private progress photos',
      'Photos stay in a private folder on your account. They are never sent to AI, never shown in summaries or share cards, and you can delete one or all at any time. Camera and library permission is only asked when you add a photo.',
      [
        {
          text: 'Turn on',
          onPress: () => {
            void acceptPhotosConsent().then(onEnable);
          },
        },
        { text: 'Not now', style: 'cancel' },
      ]
    );
  });
}
