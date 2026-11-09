/**
 * Find and screen Pexels photos for manifest slugs that are still needed.
 *
 * Keys live in .env.local: PEXELS_API_KEY and ANTHROPIC_API_KEY. Never commit them.
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
const MODEL = 'claude-sonnet-5-5';
const INPUT_USD_PER_TOKEN = 2 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 10 / 1_000_000;

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
};

type Screen = {
  pass: boolean;
  score: number;
  reasons: string;
  flags: ScreenFlags;
};

type Candidate = {
  pexels_id: number;
  score: number;
  pass: boolean;
  accepted: boolean;
  reasons: string;
  flags: ScreenFlags;
  photographer: string;
  photographer_url: string;
  source_url: string;
  licence_source: 'Pexels License';
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
  used_pexels_ids: number[];
  slugs: Record<string, SlugResult>;
};

type PexelsPhoto = {
  id: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string;
  src: { large: string; medium: string };
};

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
    process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

function readState(): State {
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as State;
    parsed.slugs ??= {};
    parsed.used_pexels_ids ??= [];
    parsed.spent_usd ??= 0;
    return parsed;
  } catch {
    return { updated_at: '', spent_usd: 0, used_pexels_ids: [], slugs: {} };
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

function pexelsOrientation(orientation: string | undefined): 'portrait' | 'landscape' | 'square' {
  const text = (orientation ?? '').toLowerCase();
  if (text.includes('square') || text.includes('1:1')) return 'square';
  if (text.includes('portrait')) return 'portrait';
  return 'landscape';
}

function queriesFor(entry: ManifestEntry): string[] {
  const terms = (entry.search_terms ?? []).map((item) => item.trim()).filter(Boolean);
  const brief = (entry.brief ?? '').split(/[.]/)[0]?.trim() ?? '';
  const queries = [...terms];
  if (brief && !queries.some((item) => item.toLowerCase() === brief.toLowerCase())) queries.push(brief);
  const unique = [...new Set(queries.map((item) => item.replace(/\s+/g, ' ').trim()))].filter(Boolean).slice(0, 3);
  while (unique.length < 2 && brief) {
    unique.push(brief.slice(0, 80));
    break;
  }
  if (entry.kind !== 'people') return unique.slice(0, 3);
  return unique.slice(0, 3).map((query) => {
    let text = query;
    if (!/\b(woman|women)\b/i.test(text)) text += ' woman';
    if (!/\bgym\b/i.test(text)) text += ' gym';
    return text;
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pexelsSearch(query: string, orientation: string, key: string): Promise<PexelsPhoto[]> {
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', orientation);
  url.searchParams.set('per_page', '8');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { Authorization: key } });
    if (response.status === 429) {
      const wait = Number(response.headers.get('retry-after') ?? '20');
      console.log(`  Pexels rate limit. Waiting ${wait}s.`);
      await sleep(Math.max(wait, 1) * 1000);
      continue;
    }
    if (!response.ok) throw new Error(`Pexels search failed (${response.status}).`);
    const body = (await response.json()) as { photos?: PexelsPhoto[] };
    return body.photos ?? [];
  }
  throw new Error('Pexels kept rate-limiting this search.');
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
  if (!screen.pass) return false;
  const flags = screen.flags;
  if (flags.men_in_frame || flags.visible_logo_or_text || flags.body_focused_crop || flags.dark_or_black_and_white) {
    return false;
  }
  if (!flags.matches_brief) return false;
  if (kind === 'food' && !flags.matches_dish) return false;
  return true;
}

async function screenPhoto(
  photo: PexelsPhoto,
  entry: ManifestEntry,
  guide: string,
  apiKey: string
): Promise<{ screen: Screen; cost: number } | null> {
  const image = await fetch(photo.src.medium);
  if (!image.ok) return null;
  const bytes = Buffer.from(await image.arrayBuffer());
  const type = image.headers.get('content-type') ?? 'image/jpeg';
  const mediaType = type.includes('png') ? 'image/png' : type.includes('webp') ? 'image/webp' : type.includes('gif') ? 'image/gif' : 'image/jpeg';
  const prompt = [
    'You screen stock photos for a gym app. Reply with one JSON object and no other text.',
    'Schema: {"pass":boolean,"score":number,"reasons":string,"flags":{"men_in_frame":boolean,"visible_logo_or_text":boolean,"body_focused_crop":boolean,"dark_or_black_and_white":boolean,"matches_brief":boolean,"matches_dish":boolean}}',
    'score is 0 to 10. pass is true only when every style rule holds.',
    'men_in_frame: any man visible, including the background.',
    'visible_logo_or_text: brand logos, gym names, watermarks, captions or stock-site UI.',
    'body_focused_crop: stomach, chest or bum is the focal point.',
    'dark_or_black_and_white: black and white, or a gritty low-key grade. A dark gym is fine when she is well lit and the photo feels warm.',
    'matches_brief: the photo shows what the brief asks for.',
    'matches_dish: for food, this is that exact dish. For other kinds set it true.',
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

function toCandidate(photo: PexelsPhoto, screen: Screen, kind: string | undefined, brief: string, file: string | null): Candidate {
  return {
    pexels_id: photo.id,
    score: screen.score,
    pass: screen.pass,
    accepted: accepted(screen, kind),
    reasons: screen.reasons,
    flags: screen.flags,
    photographer: photo.photographer,
    photographer_url: photo.photographer_url,
    source_url: photo.url,
    licence_source: 'Pexels License',
    model_release: 'not provided',
    alt_text: brief.trim() || photo.alt || '',
    file,
  };
}

async function main(): Promise<void> {
  loadEnv(join(ROOT, '.env.local'));
  loadEnv(join(ROOT, '.env'));
  const pexelsKey = process.env.PEXELS_API_KEY ?? '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!pexelsKey || !anthropicKey) {
    console.log('Missing PEXELS_API_KEY or ANTHROPIC_API_KEY.');
    console.log('Add both to .env.local (this file stays off git). Nothing was searched.');
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(readFileSync(join(ROOT, 'content', 'images', 'image-manifest.json'), 'utf8')) as {
    style_guide?: unknown;
    images?: ManifestEntry[];
  };
  const guide = styleText(manifest.style_guide ?? {});
  const state = readState();
  const limit = argLimit();
  const queue = (manifest.images ?? []).filter(
    (entry) => entry.status === 'needed' && !entry.same_as && !state.slugs[entry.slug]
  );
  const batch = queue.slice(0, limit);
  console.log(`images:find  ${batch.length} slugs (${queue.length} still needed, skipping ones that already have a pick)`);
  console.log(`Model: ${MODEL} at low effort. About $0.05 to $0.15 per slug, so this batch is roughly $${(batch.length * 0.1).toFixed(2)}.`);
  console.log('Pexels search is included with the API key. Photos are saved only under assets-src/image-review.');
  console.log();

  let index = 0;
  for (const entry of batch) {
    index += 1;
    const queries = queriesFor(entry);
    const orientation = pexelsOrientation(entry.orientation);
    console.log(`[${index}/${batch.length}] ${entry.slug}`);
    console.log(`  ${queries.join(' | ') || '(no query)'}  ·  ${orientation}`);
    const seen = new Set<number>(state.used_pexels_ids);
    const photos: PexelsPhoto[] = [];
    for (const query of queries) {
      if (photos.length >= 8) break;
      const found = await pexelsSearch(query, orientation, pexelsKey);
      await sleep(350);
      for (const photo of found) {
        if (seen.has(photo.id) || photos.some((item) => item.id === photo.id)) continue;
        photos.push(photo);
        if (photos.length >= 8) break;
      }
    }
    const ranked: { photo: PexelsPhoto; screen: Screen }[] = [];
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
      await saveJpeg(entry.slug, 'pick.jpg', chosen.photo.src.large);
      saved.push(toCandidate(chosen.photo, chosen.screen, entry.kind, entry.brief ?? '', 'pick.jpg'));
      state.used_pexels_ids.push(chosen.photo.id);
    }
    let backup = 0;
    for (const item of rest) {
      backup += 1;
      const name = `backup-${backup}.jpg`;
      await saveJpeg(entry.slug, name, item.photo.src.large);
      saved.push(toCandidate(item.photo, item.screen, entry.kind, entry.brief ?? '', name));
      state.used_pexels_ids.push(item.photo.id);
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
    if (pick) console.log(`  pick ${pick.pexels_id} by ${pick.photographer} (${pick.score.toFixed(1)})`);
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
