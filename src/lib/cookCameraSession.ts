import type { CookImage } from '@/lib/whatCanICook';

const MAX_PHOTOS = 4;

let photos: CookImage[] = [];

export function readCookCameraPhotos(): CookImage[] {
  return photos.slice();
}

export function writeCookCameraPhotos(next: CookImage[]): void {
  photos = next.slice(0, MAX_PHOTOS);
}

export function addCookCameraPhoto(photo: CookImage): CookImage[] {
  if (photos.length >= MAX_PHOTOS) return photos.slice();
  photos = [...photos, photo];
  return photos.slice();
}

export function cookCameraMax(): number {
  return MAX_PHOTOS;
}
