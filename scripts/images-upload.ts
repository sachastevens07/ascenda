/**
 * Upload photos you chose into Supabase storage.
 *
 * Put files in assets-src/images named <slug>.jpg (png and webp are accepted).
 * Fill licence_source, photographer and source_url on that slug in
 * content/images/image-manifest.json first. This script refuses any file
 * that is missing those, and it does not pick or download photos.
 *
 * Resize needs the sharp library. It is not installed until you agree.
 * Upload needs SUPABASE_SERVICE_ROLE_KEY in .env (never commit that key).
 *
 * npm run images:upload
 */
import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DROP = join(ROOT, 'assets-src', 'images');
const BUCKET = 'routine-covers';
const MAX_BYTES = 2_000_000;

type Entry = {
  slug: string;
  kind?: string;
  shot?: string;
  orientation?: string;
  brief?: string;
  same_as?: string | null;
  photographer?: string | null;
  source_url?: string | null;
  licence_source?: string | null;
  model_release?: string | null;
};

function loadEnv(file: string): void {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

function filled(value: string | null | undefined): value is string {
  return Boolean(value && value.trim());
}

function missingFields(entry: Entry): string[] {
  const missing: string[] = [];
  if (!filled(entry.licence_source)) missing.push('licence_source');
  if (!filled(entry.photographer)) missing.push('photographer');
  if (!filled(entry.source_url)) missing.push('source_url');
  return missing;
}

function maxWidth(orientation: string | undefined): number {
  const text = (orientation ?? '').toLowerCase();
  if (text.includes('16:9') || text.includes('landscape')) return 1600;
  if (text.includes('1:1') || text.includes('square')) return 1200;
  if (text.includes('4:5') || text.includes('3:4') || text.includes('portrait')) return 1200;
  return 1400;
}

async function jpeg(input: Buffer, width: number, quality: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(input)
    .rotate()
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

async function main(): Promise<void> {
  loadEnv(join(ROOT, '.env'));
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'content', 'images', 'image-manifest.json'), 'utf8')
  ) as { images?: Entry[] };
  const bySlug = new Map((manifest.images ?? []).map((item) => [item.slug, item]));

  let names: string[] = [];
  try {
    names = readdirSync(DROP);
  } catch {
    console.log(`No folder at assets-src/images. Create it and drop <slug>.jpg files in.`);
    process.exitCode = 1;
    return;
  }

  const files = names.filter((name) => /\.(jpe?g|png|webp)$/i.test(name) && !name.startsWith('.'));
  if (!files.length) {
    console.log('No photos in assets-src/images. Name each file <slug>.jpg and drop it there.');
    return;
  }

  const refused: string[] = [];
  const skipped: string[] = [];
  const ready: { file: string; entry: Entry }[] = [];

  for (const file of files) {
    const slug = file.replace(/\.(jpe?g|png|webp)$/i, '');
    const entry = bySlug.get(slug);
    if (!entry) {
      skipped.push(`${file}: no manifest slug "${slug}". Not uploaded.`);
      continue;
    }
    if (entry.same_as) {
      skipped.push(`${file}: ${slug} reuses ${entry.same_as}. Do not upload a separate file.`);
      continue;
    }
    const missing = missingFields(entry);
    if (missing.length) {
      refused.push(`${slug}: missing ${missing.join(', ')}`);
      continue;
    }
    ready.push({ file, entry });
  }

  if (skipped.length) {
    console.log('Skipped');
    for (const line of skipped) console.log(`  ${line}`);
    console.log();
  }
  if (refused.length) {
    console.log('Refused. Fill these in content/images/image-manifest.json, then run this again.');
    for (const line of refused) console.log(`  ${line}`);
    console.log();
  }
  if (!ready.length) {
    console.log('Nothing to upload.');
    process.exitCode = refused.length || skipped.length ? 1 : 0;
    return;
  }

  let resize: ((input: Buffer, width: number, quality: number) => Promise<Buffer>) | null = null;
  try {
    await import('sharp');
    resize = jpeg;
  } catch {
    console.log('Cannot resize yet. sharp is not installed, so nothing was uploaded.');
    console.log('These files are licensed and waiting:');
    for (const item of ready) console.log(`  ${item.entry.slug}`);
    console.log('Ask to add sharp, then run: npm install --save-dev sharp');
    process.exitCode = 1;
    return;
  }

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    console.log('Refusing to upload. SUPABASE_SERVICE_ROLE_KEY is not set.');
    console.log('Add it to .env on this machine only. Do not commit it. Nothing was uploaded.');
    process.exitCode = 1;
    return;
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  let uploaded = 0;

  for (const item of ready) {
    const slug = item.entry.slug;
    const input = readFileSync(join(DROP, item.file));
    let body = await resize(input, maxWidth(item.entry.orientation), 80);
    if (body.length > MAX_BYTES) body = await resize(input, maxWidth(item.entry.orientation), 60);
    if (body.length > MAX_BYTES) {
      console.log(`  ${slug}: still over 2 MB after compression. Not uploaded.`);
      process.exitCode = 1;
      continue;
    }
    const path = `${slug}.jpg`;
    const stored = await client.storage.from(BUCKET).upload(path, body, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (stored.error) {
      console.log(`  ${slug}: storage upload failed. ${stored.error.message}`);
      console.log('  If the bucket is missing, paste supabase/routine_covers.sql in the Supabase SQL editor.');
      process.exitCode = 1;
      continue;
    }
    const publicUrl = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const saved = await client.from('images').upsert(
      {
        id: slug,
        slug,
        kind: item.entry.kind ?? null,
        shot: item.entry.shot ?? null,
        orientation: item.entry.orientation ?? null,
        brief: item.entry.brief ?? null,
        same_as: null,
        alt_text: item.entry.brief?.trim() || slug,
        status: 'ready',
        storage_path: path,
        url: publicUrl,
        photographer: item.entry.photographer,
        source_url: item.entry.source_url,
        licence_source: item.entry.licence_source,
        model_release: item.entry.model_release ?? null,
      },
      { onConflict: 'id' }
    );
    if (saved.error) {
      console.log(`  ${slug}: file uploaded, but the images row was not updated. ${saved.error.message}`);
      console.log('  Paste supabase/images_manifest.sql if the new columns are not there yet.');
      process.exitCode = 1;
      continue;
    }
    uploaded += 1;
    console.log(`  ${slug}: ready (${Math.round(body.length / 1024)} KB)`);
  }

  console.log();
  console.log(`Uploaded ${uploaded}. Refused ${refused.length}. Skipped ${skipped.length}.`);
  if (refused.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.log(error instanceof Error ? error.message : 'Upload failed.');
  process.exitCode = 1;
});
