/**
 * Import local photos whose filenames match image-manifest slugs.
 *
 * Copies into assets-src/images (gitignored), resizes with sharp,
 * uploads to the routine-covers bucket, and marks the slug ready.
 *
 * npm run images:import
 * Optional folder: node scripts/images-import-local.ts "C:\\path\\to\\folder"
 */
import { createClient } from '@supabase/supabase-js';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const MANIFEST = join(ROOT, 'content', 'images', 'image-manifest.json');
const LOCAL_DIR = join(ROOT, 'assets-src', 'images');
const BUCKET = 'routine-covers';
const MAX_BYTES = 2_000_000;

const ALIASES: Record<string, string> = {
  'hero-food (1)': 'hero-food',
  'glutes-challenge-cover': 'glute-challenge-cover',
  'gym-confidence-cover': 'strong-foundations-cover',
  'one-spot-2-days-cover': 'two-day-start-cover',
  'one-spot-cover__2_': 'one-spot-cover',
  'full-body-routine-cover': 'quick-ascent-cover',
  'upper-body-routine-cover': 'upper-body-cover',
  'busy-gym-6-weeks-cover': 'busy-gym-cover',
  'full-body-2-days-cover': 'twice-a-week-strong-cover',
  'days-away-cover': 'home-dumbbell-cover',
  'upper-lower-cover': 'four-day-foundation-cover',
  'joint-friendly-cover': 'strong-for-life-cover',
  'four-weeks-strong-cover': 'challenge-four-weeks-strong',
  'barbell-strength-cover': 'higher-ground-cover',
};

type ManifestEntry = {
  slug: string;
  used_in?: string[];
  kind?: string;
  shot?: string;
  orientation?: string;
  brief?: string;
  search_terms?: string[];
  same_as?: string | null;
  status?: string;
  file?: string | null;
  photographer?: string | null;
  photographer_url?: string | null;
  source_url?: string | null;
  licence_source?: string | null;
  model_release?: string | null;
  alt_text?: string | null;
  ai_score?: number | null;
  ai_notes?: string | null;
};

type Manifest = { counts?: Record<string, number>; images?: ManifestEntry[]; [key: string]: unknown };

function loadEnv(file: string): void {
  let raw = '';
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
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

function stem(name: string): string {
  return basename(name, extname(name)).replace(
    /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    '',
  );
}

function extraEntry(slug: string): ManifestEntry | null {
  if (slug === 'four-day-foundation-cover') {
    return {
      slug,
      used_in: ['Routine card and detail: The Four-Day Foundation'],
      kind: 'people',
      shot: 'in_action',
      orientation: 'landscape 4:3',
      brief: 'Woman training on an upper or lower day in a bright gym, focused, dumbbells or a machine nearby.',
      search_terms: ['woman gym upper lower split'],
      same_as: null,
      status: 'needed',
      file: null,
      photographer: null,
      source_url: null,
      licence_source: null,
      model_release: null,
    };
  }
  if (slug === 'twice-a-week-strong-cover') {
    return {
      slug,
      used_in: ['Routine card and detail: Twice a Week Strong'],
      kind: 'people',
      shot: 'in_action',
      orientation: 'landscape 4:3',
      brief: 'Woman mid full-body lift, such as a hip thrust or Romanian deadlift, focused and capable.',
      search_terms: ['woman gym hip thrust romanian deadlift'],
      same_as: null,
      status: 'needed',
      file: null,
      photographer: null,
      source_url: null,
      licence_source: null,
      model_release: null,
    };
  }
  return null;
}

async function main(): Promise<void> {
  loadEnv(join(ROOT, '.env.local'));
  loadEnv(join(ROOT, '.env'));
  const sourceDir = process.argv[2] || LOCAL_DIR;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    console.log('Add EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.');
    process.exitCode = 1;
    return;
  }

  const sharp = (await import('sharp')).default;
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
  const images = Array.isArray(manifest.images) ? manifest.images : [];
  const bySlug = new Map(images.map((item) => [item.slug, item]));
  mkdirSync(LOCAL_DIR, { recursive: true });

  const files = readdirSync(sourceDir).filter((name) => /\.(jpe?g|png|webp)$/i.test(name));
  const mapped: { file: string; slug: string; path: string }[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const raw = stem(file);
    const slug = ALIASES[raw] ?? raw;
    if (!bySlug.has(slug)) {
      const extra = extraEntry(slug);
      if (extra) {
        images.push(extra);
        bySlug.set(slug, extra);
      } else {
        skipped.push(file);
        continue;
      }
    }
    mapped.push({ file, slug, path: join(sourceDir, file) });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  let uploaded = 0;
  const done: string[] = [];

  for (const item of mapped) {
    const entry = bySlug.get(item.slug);
    if (!entry) continue;
    const localPath = join(LOCAL_DIR, `${item.slug}.jpg`);
    if (item.path !== localPath) {
      copyFileSync(item.path, localPath);
    }
    const size = pixelSize(entry.orientation);
    let bytes = await sharp(readFileSync(item.path))
      .rotate()
      .resize(size.width, size.height, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    let quality = 74;
    while (bytes.length > MAX_BYTES && quality >= 50) {
      bytes = await sharp(readFileSync(item.path))
        .rotate()
        .resize(size.width, size.height, { fit: 'cover', position: 'attention' })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      quality -= 8;
    }
    if (bytes.length > MAX_BYTES) {
      console.log(`${item.slug}: still over 2 MB after compression, skipped`);
      continue;
    }
    const storagePath = `${item.slug}.jpg`;
    const upload = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (upload.error) {
      console.log(`${item.slug}: upload failed (${upload.error.message})`);
      continue;
    }
    const publicUrl = `${supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl.split('?')[0]}?v=${Date.now()}`;
    const alt = entry.brief?.trim() || entry.alt_text || item.slug;
    const row = {
      id: item.slug,
      slug: item.slug,
      kind: entry.kind ?? null,
      shot: entry.shot ?? null,
      orientation: entry.orientation ?? null,
      brief: entry.brief ?? null,
      same_as: entry.same_as ?? null,
      status: 'ready',
      url: publicUrl,
      storage_path: storagePath,
      alt_text: alt,
      photographer: 'Generated for Strivella',
      photographer_url: null,
      source_url: 'generated-for-ascenda',
      licence_source: 'Generated for Strivella',
      model_release: 'not applicable',
      ai_score: null,
      ai_notes: `Imported from ${item.file}`,
    };
    const saved = await supabase.from('images').upsert(row, { onConflict: 'id' });
    if (saved.error) {
      console.log(`${item.slug}: file uploaded, images row failed (${saved.error.message})`);
      continue;
    }
    entry.status = 'ready';
    entry.file = `${item.slug}.jpg`;
    entry.photographer = 'Generated for Strivella';
    entry.photographer_url = null;
    entry.source_url = 'generated-for-ascenda';
    entry.licence_source = 'Generated for Strivella';
    entry.model_release = 'not applicable';
    entry.alt_text = alt;
    entry.ai_notes = `Imported from ${item.file}`;
    uploaded += 1;
    done.push(`${item.file} → ${item.slug} (${size.width}×${size.height}, ${Math.round(bytes.length / 1024)} KB)`);
    console.log(done[done.length - 1]);
  }

  if (manifest.counts) {
    manifest.counts.total = images.length;
    manifest.counts.needs_sourcing = images.filter((item) => item.status !== 'ready' && !item.same_as).length;
  }
  manifest.images = images;
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n${uploaded} imported.`);
  if (skipped.length) {
    console.log(`Skipped (no matching slug): ${skipped.join(', ')}`);
  }
}

main().catch((error: unknown) => {
  console.log(error instanceof Error ? error.message : 'Import failed.');
  process.exitCode = 1;
});
