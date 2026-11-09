/**
 * Print every manifest slug that still needs a photo, grouped by kind,
 * plus any slug used in /content or src that is missing from the manifest.
 *
 * npm run images:report
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CONTENT = join(ROOT, 'content');
const SRC = join(ROOT, 'src');

type Entry = {
  slug: string;
  kind?: string;
  same_as?: string | null;
  status?: string;
  used_in?: string[];
};

type Manifest = { images?: Entry[] };

const manifest = JSON.parse(readFileSync(join(CONTENT, 'images', 'image-manifest.json'), 'utf8')) as Manifest;
const images = Array.isArray(manifest.images) ? manifest.images : [];
const bySlug = new Map(images.map((item) => [item.slug, item]));

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else out.push(path);
  }
}

function collectContentSlugs(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const files: string[] = [];
  walk(CONTENT, files);
  const keys = new Set(['cover_image_slug', 'image_slug', 'cover_image_id']);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    if (file.includes(`${join('content', 'images')}`)) continue;
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const where = relative(ROOT, file);
    visit(data, (key, value) => {
      if (!keys.has(key) || typeof value !== 'string' || !value.trim()) return;
      const list = found.get(value) ?? [];
      list.push(where);
      found.set(value, list);
    });
  }
  return found;
}

function visit(value: unknown, onKey: (key: string, value: unknown) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, onKey);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    onKey(key, child);
    visit(child, onKey);
  }
}

function collectCodeSlugs(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const files: string[] = [];
  walk(SRC, files);
  const pattern =
    /(?:imageSourceForSlug|presentationForSlug)\(\s*['"]([^'"]+)['"]|imageSlug=\{?['"]([^'"]+)['"]|coverSlug[=:]\s*['"]([^'"]+)['"]|slug=\{?['"]((?:hero|onboarding|equip|machine|learn|recipe|cardio|collection)-[^'"]+)['"]|['"](learn-category-[a-z0-9_-]+)['"]|return '(hero-[a-z0-9-]+)'/g;
  for (const file of files) {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
    const text = readFileSync(file, 'utf8');
    const where = relative(ROOT, file);
    for (const match of text.matchAll(pattern)) {
      const slug = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
      if (!slug) continue;
      const list = found.get(slug) ?? [];
      list.push(where);
      found.set(slug, list);
    }
  }
  return found;
}

function addUse(map: Map<string, string[]>, slug: string, where: string): void {
  const list = map.get(slug) ?? [];
  if (!list.includes(where)) list.push(where);
  map.set(slug, list);
}

const used = new Map<string, string[]>();
for (const [slug, places] of collectContentSlugs()) {
  for (const place of places) addUse(used, slug, place);
}
for (const [slug, places] of collectCodeSlugs()) {
  for (const place of places) addUse(used, slug, place);
}

const missing = [...used.keys()].filter((slug) => !bySlug.has(slug)).sort();
const needed = images.filter((item) => item.status !== 'ready' && !item.same_as);
const kinds = ['people', 'equipment', 'food'] as const;

console.log('images:report');
console.log(`${images.length} slugs in content/images/image-manifest.json`);
console.log(`${needed.length} still need their own photo`);
console.log();

for (const kind of kinds) {
  const rows = needed.filter((item) => item.kind === kind);
  console.log(`${kind} (${rows.length})`);
  for (const item of rows) {
    const where = (item.used_in ?? []).join('; ');
    console.log(`  ${item.slug}${where ? `  ·  ${where}` : ''}`);
  }
  console.log();
}

const other = needed.filter((item) => !kinds.includes(item.kind as (typeof kinds)[number]));
if (other.length) {
  console.log(`other (${other.length})`);
  for (const item of other) console.log(`  ${item.slug}  ·  kind ${item.kind ?? 'missing'}`);
  console.log();
}

const waiting = images.filter((item) => item.same_as && bySlug.get(item.same_as)?.status !== 'ready');
if (waiting.length) {
  console.log(`reuses another photo, and that photo is not ready yet (${waiting.length})`);
  for (const item of waiting) console.log(`  ${item.slug}  →  ${item.same_as}`);
  console.log();
}

function isMarketingPeople(item: Entry): boolean {
  if (item.kind !== 'people') return false;
  const slug = item.slug;
  const where = (item.used_in ?? []).join(' ').toLowerCase();
  if (slug.startsWith('hero-home') || slug === 'hero-paywall' || slug === 'hero-locked-home' || slug.startsWith('onboarding-')) {
    return true;
  }
  return /paywall|onboarding|home hero|welcome hero/.test(where);
}

const marketing = images.filter(isMarketingPeople);
if (marketing.length) {
  console.log('consider paid stock with model release before marketing use');
  console.log('People photos on the paywall, onboarding and home heroes:');
  for (const item of marketing) console.log(`  ${item.slug}`);
  console.log();
}

const brokenSameAs = images.filter((item) => item.same_as && !bySlug.has(item.same_as));
if (brokenSameAs.length) {
  console.log('same_as points at a slug that is not in the manifest');
  for (const item of brokenSameAs) console.log(`  ${item.slug}  →  ${item.same_as}`);
  console.log();
}

if (missing.length) {
  console.log(`used in /content or src, missing from the manifest (${missing.length})`);
  for (const slug of missing) {
    const places = [...new Set(used.get(slug) ?? [])].slice(0, 4).join(', ');
    console.log(`  ${slug}  ·  ${places}`);
  }
  process.exitCode = 1;
} else {
  console.log('Every slug used in /content or src is in the manifest.');
}
