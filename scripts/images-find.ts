/**
 * Find and screen Unsplash photos for manifest slugs that are still needed.
 *
 * Keys live in .env.local: UNSPLASH_ACCESS_KEY and ANTHROPIC_API_KEY. Never commit them.
 * This script does not run inside the app. Results stay in assets-src/image-review,
 * which is gitignored.
 *
 * npm run images:find -- --limit 10
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const REVIEW = join(ROOT, 'assets-src', 'image-review');
const STATE_PATH = join(REVIEW, 'state.json');
const MODEL = 'claude-haiku-5-5';
const INPUT_USD_PER_TOKEN = 0.1 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.5 / 1_000_000;
const UTM = { utm_source: 'ascenda', utm_medium: 'referral' };

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
};

type ScreenFlags = {
  men_in_frame: boolean;
  visible_logo_or_text: boolean;
  body_focused_crop: boolean;
  dark_or_black_and_white: boolean;
  matches_brief: boolean;
  matches_dish: boolean;
  looks_athletic: boolean;
  looks_young: boolean;
};

type Screen = {
  pass: boolean;
  score: number;
  reasons: string;
  flags: ScreenFlags;
};

type Candidate = {
  photo_id: string;
  score: number;
  pass: boolean;
  accepted: boolean;
  reasons: string;
  flags: ScreenFlags;
  photographer: string;
  photographer_url: string;
  source_url: string;
  download_location: string;
  licence_source: 'Unsplash License';
  model_release: 'not provided';
  alt_text: string;
  file: string | null;
};

type SlugResult = {
  slug: string;
  kind: string;
  brief: string;
  orientation: string;
  queries: string[];
  pick: Candidate | null;
  backups: Candidate[];
  screened: number;
  passed: number;
};

type State = {
  updated_at: string;
  spent_usd: number;
  used_photo_ids: string[];
  slugs: Record<string, SlugResult>;
};

type UnsplashPhoto = {
  id: string;
  alt_description?: string | null;
  description?: string | null;
  urls: { raw?: string; regular?: string; small?: string };
  links: { html?: string; download_location?: string };
  user?: { name?: string; links?: { html?: string } };
};

function loadEnv(file: string): void {
  let raw = '';
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Z0-9_]+)=(.*)$/.exec(trimmed);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function unsplashKey(): string {
  return (
    process.env.UNSPLASH_ACCESS_KEY ||
    process.env.UNSPLASH_API_KEY ||
    process.env.UNSPLASH_CLIENT_ID ||
    process.env.UNSPLASH_KEY ||
    ''
  );
}

function withUtm(url: string | undefined, fallback: string): string {
  try {
    const parsed = new URL(url || fallback);
    parsed.searchParams.set('utm_source', UTM.utm_source);
    parsed.searchParams.set('utm_medium', UTM.utm_medium);
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function readState(): State {
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as State & { used_pexels_ids?: unknown[] };
    parsed.slugs ??= {};
    parsed.spent_usd ??= 0;
    const leftover = Array.isArray(parsed.used_pexels_ids) ? parsed.used_pexels_ids.map(String) : [];
    parsed.used_photo_ids = [...new Set([...(parsed.used_photo_ids ?? []), ...leftover].map(String))];
    return parsed;
  } catch {
    return { updated_at: '', spent_usd: 0, used_photo_ids: [], slugs: {} };
  }
}

function writeState(state: State): void {
  mkdirSync(REVIEW, { recursive: true });
  state.updated_at = new Date().toISOString();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function argLimit(): number {
  const index = process.argv.indexOf('--limit');
  const raw = index >= 0 ? Number(process.argv[index + 1]) : 10;
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10;
}

function onlySlugs(): Set<string> | null {
  const index = process.argv.indexOf('--only');
  if (index < 0) return null;
  const raw = process.argv[index + 1] ?? '';
  const slugs = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return slugs.length ? new Set(slugs) : null;
}

function retryFailed(state: State): void {
  const replace = process.argv.includes('--replace');
  if (!process.argv.includes('--retry-failed') && !replace) return;
  const only = onlySlugs();
  const release = new Set<string>();
  for (const [slug, result] of Object.entries(state.slugs)) {
    if (!replace && result.pick) continue;
    if (only && !only.has(slug)) continue;
    for (const item of [result.pick, ...(result.backups ?? [])]) {
      if (item?.photo_id) release.add(item.photo_id);
    }
    delete state.slugs[slug];
  }
  if (process.argv.includes('--rescreen')) {
    const keep = new Set(
      Object.values(state.slugs)
        .map((item) => item.pick?.photo_id)
        .filter((id): id is string => Boolean(id))
    );
    state.used_photo_ids = state.used_photo_ids.filter((id) => keep.has(id));
  } else if (!replace) {
    state.used_photo_ids = state.used_photo_ids.filter((id) => !release.has(id));
  }
}

function unsplashOrientation(orientation: string | undefined): 'portrait' | 'landscape' | 'squarish' {
  const text = (orientation ?? '').toLowerCase();
  if (text.includes('square') || text.includes('1:1')) return 'squarish';
  if (text.includes('portrait')) return 'portrait';
  return 'landscape';
}

function clipQuery(text: string): string {
  const stop = new Set([
    'a',
    'an',
    'the',
    'at',
    'in',
    'on',
    'of',
    'with',
    'towards',
    'toward',
    'her',
    'his',
    'their',
    'for',
    'and',
    'or',
    'to',
    'from',
    'just',
    'off',
    'under',
    'behind',
    'softly',
    'blurred',
    'looking',
    'holding',
    'plenty',
    'space',
    'above',
    'head',
    'text',
    'camera',
    'like',
    'reference',
    'headline',
    'headroom',
  ]);
  return text
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-zA-Z0-9]+/)
    .filter((word) => word && !stop.has(word.toLowerCase()))
    .slice(0, 7)
    .join(' ')
    .toLowerCase();
}

function queriesFor(entry: ManifestEntry): string[] {
  const queries: string[] = [];
  for (const term of entry.search_terms ?? []) {
    const clipped = clipQuery(term);
    if (clipped) queries.push(clipped);
  }
  const fromBrief = clipQuery((entry.brief ?? '').split(/[.]/)[0] ?? '');
  if (fromBrief && !queries.includes(fromBrief)) queries.push(fromBrief);
  let unique = [...new Set(queries)].slice(0, 2);
  if (entry.kind === 'people') {
    unique = unique.map((query) => {
      let text = query;
      if (!/\b(woman|women)\b/i.test(text)) text = `woman ${text}`;
      if (!/\bgym\b/i.test(text)) text = `${text} gym`;
      return text.replace(/\s+/g, ' ').trim();
    });
  }
  if (entry.kind === 'food' && unique.length < 2) unique.push('healthy bowl kitchen natural light');
  return unique.slice(0, 2);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function unsplashSearch(
  query: string,
  orientation: string,
  key: string,
  page = 1
): Promise<{ photos: UnsplashPhoto[]; remaining: number | null }> {
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', orientation);
  url.searchParams.set('per_page', '8');
  url.searchParams.set('page', String(page));
  url.searchParams.set('content_filter', 'high');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${key}`,
        'Accept-Version': 'v1',
      },
    });
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    if (response.status === 403 || response.status === 429) {
      const wait = Number(response.headers.get('retry-after') ?? '60');
      console.log(`  Unsplash rate limit. Waiting ${wait}s.`);
      await sleep(Math.max(wait, 1) * 1000);
      continue;
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      throw new Error(`Unsplash search failed (${response.status}). ${detail}`);
    }
    const body = (await response.json()) as { results?: UnsplashPhoto[] };
    return {
      photos: body.results ?? [],
      remaining: Number.isFinite(remaining) ? remaining : null,
    };
  }
  throw new Error('Unsplash kept rate-limiting this search.');
}

function styleText(guide: unknown): string {
  return JSON.stringify(guide, null, 2);
}

function emptyFlags(): ScreenFlags {
  return {
    men_in_frame: true,
    visible_logo_or_text: true,
    body_focused_crop: true,
    dark_or_black_and_white: true,
    matches_brief: false,
    matches_dish: false,
    looks_athletic: false,
    looks_young: false,
  };
}

function parseScreen(text: string): Screen | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Partial<Screen> & { flags?: Partial<ScreenFlags> };
    const flags = { ...emptyFlags(), ...(raw.flags ?? {}) };
    const score = Math.max(0, Math.min(10, Number(raw.score) || 0));
    return {
      pass: Boolean(raw.pass),
      score,
      reasons: typeof raw.reasons === 'string' ? raw.reasons : '',
      flags,
    };
  } catch {
    return null;
  }
}

function accepted(screen: Screen, kind: string | undefined): boolean {
  const flags = screen.flags;
  if (flags.men_in_frame || flags.visible_logo_or_text || flags.body_focused_crop) return false;
  if (kind === 'people' && (!flags.looks_athletic || !flags.looks_young)) return false;
  if (kind === 'food' && !flags.matches_dish) return false;
  if (screen.pass && flags.matches_brief) return true;
  return screen.score >= 5 && flags.matches_brief;
}

function screenUrl(photo: UnsplashPhoto): string | null {
  return photo.urls.small || photo.urls.regular || null;
}

function saveUrl(photo: UnsplashPhoto): string | null {
  if (photo.urls.regular) return photo.urls.regular;
  if (photo.urls.raw) return `${photo.urls.raw}&w=1400&fm=jpg&q=80`;
  return photo.urls.small ?? null;
}

async function screenPhoto(
  photo: UnsplashPhoto,
  entry: ManifestEntry,
  guide: string,
  apiKey: string
): Promise<{ screen: Screen; cost: number } | null> {
  const url = screenUrl(photo);
  if (!url) return null;
  const image = await fetch(url);
  if (!image.ok) return null;
  const bytes = Buffer.from(await image.arrayBuffer());
  const type = image.headers.get('content-type') ?? 'image/jpeg';
  const mediaType = type.includes('png')
    ? 'image/png'
    : type.includes('webp')
      ? 'image/webp'
      : type.includes('gif')
        ? 'image/gif'
        : 'image/jpeg';
  const prompt = [
    'You screen stock photos for a gym app for women. Reply with one JSON object and no other text.',
    'Schema: {"pass":boolean,"score":number,"reasons":string,"flags":{"men_in_frame":boolean,"visible_logo_or_text":boolean,"body_focused_crop":boolean,"dark_or_black_and_white":boolean,"matches_brief":boolean,"matches_dish":boolean,"looks_athletic":boolean,"looks_young":boolean}}',
    'score is 0 to 10.',
    'Hard rejects: men in frame including the background; brand logos, gym names, watermarks or stock UI; stomach, chest or bum as the focal point; she does not look athletic; she does not look young (about 18 to 30). Set dark_or_black_and_white true only for black and white or a very gritty low-key grade. A dim gym is fine if she is well lit.',
    'looks_athletic: she looks like she trains. Real gym clothes, capable posture, not a posed fashion or casual street portrait.',
    'looks_young: she reads as a young adult, about 18 to 30, not 40s or older.',
    'matches_brief: true if this is the right kind of photo for the slot (a woman in a real gym for people heroes; food for food). Missing a bag, bottle, laugh, towel, phone or exact pose is OK. Only reject the brief if it is clearly the wrong kind of moment, such as a food photo for a gym hero.',
    'matches_dish: for food, true if it is a similar healthy meal in natural light, not a different kind of food. For other kinds set it true.',
    'pass is true when there is no hard reject, she looks athletic and young if this is a people photo, and matches_brief is true.',
    `Kind: ${entry.kind}. Shot: ${entry.shot}. Brief: ${entry.brief}`,
    `Style guide: ${guide}`,
  ].join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2026-10-21',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: bytes.toString('base64') } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });
  if (response.status === 429) {
    console.log('  Claude rate limit. Waiting 20s.');
    await sleep(20_000);
    return screenPhoto(photo, entry, guide, apiKey);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Claude screen failed (${response.status}). ${detail.slice(0, 240)}`);
  }
  const body = (await response.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (body.content ?? [])
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n');
  const screen = parseScreen(text);
  const usage = body.usage ?? {};
  const cost =
    (usage.input_tokens ?? 0) * INPUT_USD_PER_TOKEN + (usage.output_tokens ?? 0) * OUTPUT_USD_PER_TOKEN;
  if (!screen) return null;
  return { screen, cost };
}

async function saveJpeg(slug: string, name: string, url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url}`);
  const folder = join(REVIEW, slug);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, name), Buffer.from(await response.arrayBuffer()));
}

function toCandidate(
  photo: UnsplashPhoto,
  screen: Screen,
  kind: string | undefined,
  brief: string,
  file: string | null
): Candidate {
  const profile = withUtm(photo.user?.links?.html, 'https://unsplash.com');
  const page = withUtm(photo.links.html, profile);
  return {
    photo_id: photo.id,
    score: screen.score,
    pass: screen.pass,
    accepted: accepted(screen, kind),
    reasons: screen.reasons,
    flags: screen.flags,
    photographer: photo.user?.name?.trim() || 'Unsplash photographer',
    photographer_url: profile,
    source_url: page,
    download_location: photo.links.download_location ?? '',
    licence_source: 'Unsplash License',
    model_release: 'not provided',
    alt_text: brief.trim() || photo.alt_description || photo.description || '',
    file,
  };
}

async function main(): Promise<void> {
  loadEnv(join(ROOT, '.env.local'));
  loadEnv(join(ROOT, '.env'));
  const accessKey = unsplashKey();
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!accessKey || !anthropicKey) {
    console.log('Missing UNSPLASH_ACCESS_KEY or ANTHROPIC_API_KEY.');
    console.log('Add both to .env.local (this file stays off git). UNSPLASH_API_KEY is also accepted. Nothing was searched.');
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(readFileSync(join(ROOT, 'content', 'images', 'image-manifest.json'), 'utf8')) as {
    style_guide?: unknown;
    images?: ManifestEntry[];
  };
  const guide = styleText(manifest.style_guide ?? {});
  const state = readState();
  retryFailed(state);
  const limit = argLimit();
  const only = onlySlugs();
  const queue = (manifest.images ?? []).filter((entry) => {
    if (only) return only.has(entry.slug) && !state.slugs[entry.slug];
    return entry.status === 'needed' && !entry.same_as && !state.slugs[entry.slug];
  });
  const batch = queue.slice(0, limit);
  console.log(`images:find  ${batch.length} slugs (${queue.length} still needed, skipping ones that already have a result)`);
  console.log(`Model: ${MODEL} at low effort. About $0.003 to $0.01 per slug, so this batch is roughly $${(batch.length * 0.005).toFixed(2)}.`);
  console.log('Unsplash search uses your access key. Photos are saved only under assets-src/image-review.');
  console.log();

  let index = 0;
  let stopUnsplash = false;
  for (const entry of batch) {
    if (stopUnsplash) {
      console.log(`Skipping ${entry.slug}: Unsplash hourly limit is nearly used.`);
      continue;
    }
    index += 1;
    const queries = queriesFor(entry);
    const orientation = unsplashOrientation(entry.orientation);
    console.log(`[${index}/${batch.length}] ${entry.slug}`);
    console.log(`  ${queries.join(' | ') || '(no query)'}  ·  ${orientation}`);
    const seen = new Set(
      Object.values(state.slugs)
        .map((item) => item.pick?.photo_id)
        .filter((id): id is string => Boolean(id))
    );
    const photos: UnsplashPhoto[] = [];
    for (const query of queries) {
      if (photos.length >= 8) break;
      const found = await unsplashSearch(query, orientation, accessKey, 1);
      if (found.remaining !== null) {
        console.log(`  Unsplash remaining this hour: ${found.remaining}`);
        if (found.remaining < 4) stopUnsplash = true;
      }
      await sleep(800);
      for (const photo of found.photos) {
        if (!photo.id || seen.has(photo.id) || photos.some((item) => item.id === photo.id)) continue;
        photos.push(photo);
        if (photos.length >= 8) break;
      }
      if (stopUnsplash) break;
    }
    const ranked: { photo: UnsplashPhoto; screen: Screen }[] = [];
    for (const photo of photos) {
      const result = await screenPhoto(photo, entry, guide, anthropicKey);
      await sleep(200);
      if (!result) {
        console.log(`  ${photo.id}: no usable screen`);
        continue;
      }
      state.spent_usd += result.cost;
      const ok = accepted(result.screen, entry.kind);
      ranked.push({ photo, screen: result.screen });
      console.log(
        `  ${photo.id}: ${ok ? 'pass' : 'reject'} ${result.screen.score.toFixed(1)}  $${result.cost.toFixed(4)}  running $${state.spent_usd.toFixed(2)}`
      );
    }
    ranked.sort((a, b) => b.screen.score - a.screen.score);
    const passing = ranked.filter((item) => accepted(item.screen, entry.kind));
    const chosen = passing[0] ?? null;
    const rest = ranked.filter((item) => item !== chosen).slice(0, 2);
    const saved: Candidate[] = [];
    if (chosen) {
      const url = saveUrl(chosen.photo);
      if (url) await saveJpeg(entry.slug, 'pick.jpg', url);
      saved.push(toCandidate(chosen.photo, chosen.screen, entry.kind, entry.brief ?? '', url ? 'pick.jpg' : null));
      state.used_photo_ids.push(chosen.photo.id);
    }
    let backup = 0;
    for (const item of rest) {
      backup += 1;
      const name = `backup-${backup}.jpg`;
      const url = saveUrl(item.photo);
      if (url) await saveJpeg(entry.slug, name, url);
      saved.push(toCandidate(item.photo, item.screen, entry.kind, entry.brief ?? '', url ? name : null));
    }
    const [pick, ...backups] = chosen ? saved : [null, ...saved];
    state.slugs[entry.slug] = {
      slug: entry.slug,
      kind: entry.kind ?? '',
      brief: entry.brief ?? '',
      orientation: entry.orientation ?? '',
      queries,
      pick: pick ?? null,
      backups,
      screened: ranked.length,
      passed: passing.length,
    };
    writeState(state);
    if (pick) console.log(`  pick ${pick.photo_id} by ${pick.photographer} (${pick.score.toFixed(1)})`);
    else console.log('  no photo passed the style rules');
    const left = batch.length - index;
    console.log(`  spent $${state.spent_usd.toFixed(2)}. About $${(left * 0.1).toFixed(2)} left in this batch if the rest look like this.`);
    console.log();
  }

  console.log(`Done. Spent about $${state.spent_usd.toFixed(2)}. Review with npm run images:review`);
}

main().catch((error: unknown) => {
  console.log(error instanceof Error ? error.message : 'Photo search failed.');
  process.exitCode = 1;
});
