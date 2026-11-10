/**
 * Upload photos you approved on the review page.
 *
 * Reads assets-src/image-review/choices.json and state.json.
 * Approve uses the pick. Backup 1 and backup 2 use those files.
 * Reject, and anything you have not chosen, stay needed.
 *
 * Resize needs the sharp library. It is not installed until you agree.
 * Upload needs SUPABASE_SERVICE_ROLE_KEY in .env or .env.local (never commit it).
 *
 * npm run images:upload
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const REVIEW = join(ROOT, 'assets-src', 'image-review');
const MANIFEST = join(ROOT, 'content', 'images', 'image-manifest.json');
const BUCKET = 'routine-covers';
const MAX_BYTES = 2_000_000;

type Candidate = {
  photo_id?: string;
  pexels_id?: number;
  score: number;
  reasons: string;
  photographer: string;
  photographer_url: string;
  source_url: string;
  download_location?: string;
  licence_source: string;
  model_release: string;
  alt_text: string;
  file: string | null;
  accepted?: boolean;
};

type SlugResult = {
  slug: string;
  kind?: string;
  brief?: string;
  orientation?: string;
  pick: Candidate | null;
  backups: Candidate[];
};

type ManifestEntry = {
  slug: string;
  status?: string;
  photographer?: string | null;
  photographer_url?: string | null;
  source_url?: string | null;
  licence_source?: string | null;
  model_release?: string | null;
  alt_text?: string | null;
  ai_score?: number | null;
  ai_notes?: string | null;
  kind?: string;
  shot?: string;
  orientation?: string;
  brief?: string;
  same_as?: string | null;
};

function loadEnv(file: string): void {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

function pixelSize(orientation: string | undefined): { width: number; height: number } {
  const text = (orientation ?? '').toLowerCase();
  if (text.includes('1:1') || text.includes('square')) return { width: 1200, height: 1200 };
  if (text.includes('3:4')) return { width: 1200, height: 1600 };
  if (text.includes('4:5') || text.includes('portrait')) return { width: 1000, height: 1250 };
  if (text.includes('4:3')) return { width: 1600, height: 1200 };
  return { width: 1600, height: 900 };
}

async function trackUnsplashDownload(location: string | undefined): Promise<void> {
  if (!location) return;
  const accessKey =
    process.env.UNSPLASH_ACCESS_KEY ||
    process.env.UNSPLASH_API_KEY ||
    process.env.UNSPLASH_CLIENT_ID ||
    process.env.UNSPLASH_KEY ||
    '';
  if (!accessKey) {
    console.log('  Unsplash download was not tracked (missing UNSPLASH_ACCESS_KEY).');
    return;
  }
  try {
    const response = await fetch(location, {
      headers: { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' },
    });
    if (!response.ok) console.log(`  Unsplash download track failed (${response.status}).`);
  } catch {
    console.log('  Unsplash download track failed.');
  }
}

function chosenFile(result: SlugResult, choice: string): Candidate | null {
  if (choice === 'approve') return result.pick;
  if (choice === 'backup-1') return result.backups?.[0] ?? null;
  if (choice === 'backup-2') return result.backups?.[1] ?? null;
  return null;
}

async function main(): Promise<void> {
  loadEnv(join(ROOT, '.env.local'));
  loadEnv(join(ROOT, '.env'));
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    console.log('Add SUPABASE_SERVICE_ROLE_KEY to .env.local before uploading. Nothing was uploaded.');
    process.exitCode = 1;
    return;
  }

  const state = JSON.parse(readFileSync(join(REVIEW, 'state.json'), 'utf8')) as { slugs?: Record<string, SlugResult> };
  const choices = existsSync(join(REVIEW, 'choices.json'))
    ? (JSON.parse(readFileSync(join(REVIEW, 'choices.json'), 'utf8')) as Record<string, string>)
    : {};
  const approved = Object.entries(choices).filter(([, choice]) => choice === 'approve' || choice === 'backup-1' || choice === 'backup-2');
  if (!approved.length) {
    console.log('No approved photos. Open npm run images:review and choose Approve or a backup.');
    return;
  }

  let sharp: typeof import('sharp') | null = null;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('Ask to add sharp, then run: npm install --save-dev sharp');
    console.log('Nothing was uploaded.');
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { images?: ManifestEntry[] };
  const bySlug = new Map((manifest.images ?? []).map((item) => [item.slug, item]));
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  let uploaded = 0;

  for (const [slug, choice] of approved) {
    const result = state.slugs?.[slug];
    const entry = bySlug.get(slug);
    const photo = result ? chosenFile(result, choice) : null;
    if (!result || !entry || !photo?.file) {
      console.log(`${slug}: skipped, that choice has no file`);
      continue;
    }
    if (!photo.photographer || !photo.source_url || photo.licence_source !== 'Unsplash License') {
      console.log(`${slug}: skipped, licence details are incomplete`);
      continue;
    }
    await trackUnsplashDownload(photo.download_location);
    const source = join(REVIEW, slug, photo.file);
    if (!existsSync(source)) {
      console.log(`${slug}: skipped, ${photo.file} is missing`);
      continue;
    }
    const size = pixelSize(result.orientation ?? entry.orientation);
    const bytes = await sharp(readFileSync(source))
      .rotate()
      .resize(size.width, size.height, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    if (bytes.length > MAX_BYTES) {
      console.log(`${slug}: skipped, still over 2 MB after compression (${bytes.length} bytes)`);
      continue;
    }
    const storagePath = `${slug}.jpg`;
    const upload = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (upload.error) {
      console.log(`${slug}: upload failed (${upload.error.message})`);
      continue;
    }
    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
    const row = {
      id: slug,
      slug,
      kind: entry.kind ?? null,
      shot: entry.shot ?? null,
      orientation: entry.orientation ?? null,
      brief: entry.brief ?? null,
      same_as: entry.same_as ?? null,
      status: 'ready',
      url: publicUrl,
      storage_path: storagePath,
      alt_text: photo.alt_text,
      photographer: photo.photographer,
      photographer_url: photo.photographer_url,
      source_url: photo.source_url,
      licence_source: 'Unsplash License',
      model_release: 'not provided',
      ai_score: photo.score,
      ai_notes: photo.reasons,
    };
    const saved = await supabase.from('images').upsert(row, { onConflict: 'id' });
    if (saved.error) {
      console.log(`${slug}: saved the file, but the images row failed (${saved.error.message})`);
      continue;
    }
    entry.status = 'ready';
    entry.photographer = photo.photographer;
    entry.photographer_url = photo.photographer_url;
    entry.source_url = photo.source_url;
    entry.licence_source = 'Unsplash License';
    entry.model_release = 'not provided';
    entry.alt_text = photo.alt_text;
    entry.ai_score = photo.score;
    entry.ai_notes = photo.reasons;
    uploaded += 1;
    console.log(`${slug}: ready (${size.width}×${size.height}, ${Math.round(bytes.length / 1024)} KB)`);
  }

  if (uploaded) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${uploaded} uploaded. Rejected and unmatched slugs stay needed.`);
}

main().catch((error: unknown) => {
  console.log(error instanceof Error ? error.message : 'Upload failed.');
  process.exitCode = 1;
});
