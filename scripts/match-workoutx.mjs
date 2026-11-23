/**
 * Propose WorkoutX v2 matches for every exercise in the library
 * (supabase/exercises.sql, stretches.sql, content_routines_1.sql: 228 rows).
 * Female clip where one exists, otherwise male.
 *
 * One-off. The API key is read from the environment only. Never put it in the
 * app, .env, or this file.
 *
 *   $env:WORKOUTX_API_KEY="wx_..."
 *   node scripts/match-workoutx.mjs
 *
 * Default: keep existing confident ids and only search exercises that still
 * have none. Pass --all to rematch the whole library.
 * Pass --retry-unmatched to search again with new aliases, skipping only
 * exercises that already have a locked id.
 * Inspect a WorkoutX name (prints ids and names only, never media URLs):
 *   node scripts/match-workoutx.mjs --inspect-name "shoulder press"
 *
 * After a CSV review, lock picks in content/exercises/workoutx-overrides.json
 * and apply them without calling the API:
 *   node scripts/match-workoutx.mjs --apply-overrides
 *
 * On Windows, Node needs the system CA store (same as Expo in this repo).
 * The script turns that on itself. Do not disable TLS.
 *
 * Writes:
 *   scripts/workoutx-matches.csv          full review table
 *   content/exercises/workoutx-ids.json   confident matches only
 *   supabase/functions/exercise-media/ids.json  copy for the Edge Function
 *   supabase/workoutx_ids.sql             UPDATEs for confident matches
 *
 * Does not call WorkoutX's workout generator. Does not log media URLs or the key.
 * Search uses one name filter at a time (Free-plan safe), short aliases, then
 * prefers the female counterpart, then the male clip. Not a dump of the whole library.
 */

import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

function usingSystemCa() {
  return (
    process.execArgv.includes('--use-system-ca') ||
    String(process.env.NODE_OPTIONS || '').includes('use-system-ca')
  );
}

function enableSystemCa() {
  if (typeof tls.getCACertificates !== 'function' || typeof tls.setDefaultCACertificates !== 'function') {
    return false;
  }
  tls.setDefaultCACertificates(tls.getCACertificates('system'));
  return true;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.workoutxapp.com/v2';
const EXERCISE_SQL = [
  join(ROOT, 'supabase', 'exercises.sql'),
  join(ROOT, 'supabase', 'stretches.sql'),
  join(ROOT, 'supabase', 'content_routines_1.sql'),
];
const OUT_CSV = join(ROOT, 'scripts', 'workoutx-matches.csv');
const OUT_PROGRESS = join(ROOT, 'scripts', 'workoutx-match-progress.jsonl');
const OUT_JSON = join(ROOT, 'content', 'exercises', 'workoutx-ids.json');
const OUT_OVERRIDES = join(ROOT, 'content', 'exercises', 'workoutx-overrides.json');
const OUT_FN = join(ROOT, 'supabase', 'functions', 'exercise-media', 'ids.json');
const OUT_SQL = join(ROOT, 'supabase', 'workoutx_ids.sql');

/** Catalogue slugs that live in the library under a different id. */
const SLUG_ALIASES = {
  'chest-press-machine': 'machine-chest-press',
  'walking-lunge': 'dumbbell-walking-lunge',
  'bodyweight-glute-bridge': 'glute-bridge',
  'seated-dumbbell-shoulder-press': 'dumbbell-shoulder-press',
  'standing-dumbbell-shoulder-press': 'dumbbell-shoulder-press',
  'shoulder-press-machine': 'machine-shoulder-press',
};

const STOP = new Set(['the', 'a', 'an', 'to', 'and', 'of', 'with', 'using', 'on', 'in', 'for']);

const EQUIP_WORDS = new Set([
  'dumbbell',
  'dumbbells',
  'barbell',
  'cable',
  'cables',
  'machine',
  'machines',
  'kettlebell',
  'bodyweight',
  'body',
  'weight',
  'weighted',
  'band',
  'bands',
  'lever',
  'leverage',
  'resistance',
  'plate',
  'plates',
  'trap',
]);

const MODIFIERS = new Set([
  ...EQUIP_WORDS,
  'narrow',
  'wide',
  'close',
  'grip',
  'fly',
  'v',
  'bar',
  'rope',
  'handle',
  'handles',
  'attachment',
  'neutral',
  'pronated',
  'supinated',
  'heels',
  'elevated',
  'stance',
  'high',
  'low',
  'full',
  'front',
  'ez',
  'standing',
  'seated',
]);

const SEARCH_ALIASES = {
  'goblet squat': ['goblet squat'],
  'dumbbell box squat': ['box squat'],
  'box squat to a chair': ['box squat', 'chair squat', 'dumbbell bench squat'],
  'leg press': ['leg press', 'leg press machine'],
  'barbell back squat': ['barbell squat', 'full squat', 'back squat'],
  'smith machine squat': [
    'smith machine squat',
    'barbell smith squat',
    'smith machine back squat',
    'smith squat',
    'normal squat smith machine',
  ],
  'hack squat': ['hack squat'],
  'leg extension': ['leg extension'],
  'dumbbell romanian deadlift': ['romanian deadlift', 'dumbbell romanian'],
  'barbell romanian deadlift': ['romanian deadlift', 'barbell romanian'],
  'kettlebell deadlift': ['kettlebell deadlift'],
  'single leg romanian deadlift': ['single leg romanian', 'single leg rdl'],
  'cable pull through': ['pull through', 'cable pull through'],
  'dumbbell glute bridge': ['dumbbell glute bridge', 'weighted glute bridge', 'glute bridge dumbbell'],
  'glute bridge': [
    'glute bridge',
    'bodyweight glute bridge',
    'floor glute bridge',
    'lying glute bridge',
    'glute bridge bodyweight',
  ],
  'single leg glute bridge': ['single leg glute', 'one leg glute'],
  'dumbbell hip thrust': ['dumbbell hip thrust', 'hip thrust dumbbell'],
  'hip thrust machine': ['hip thrust machine', 'machine hip thrust', 'glute drive', 'hip thrust in smith'],
  'seated leg curl': ['seated leg curl', 'leg curl'],
  'lying leg curl': ['lying leg curl', 'prone leg curl'],
  'cable glute kickback': ['glute kickback', 'cable kickback'],
  'hip abduction machine': ['hip abduction', 'abductor'],
  'cable hip abduction': ['cable hip abduction', 'cable abduction', 'standing cable abduction'],
  'side lying hip abduction': [
    'side lying hip abduction',
    'side lying abduction',
    'lying hip abduction',
    'side lying leg lift',
  ],
  'dumbbell split squat': ['dumbbell split squat', 'split squat dumbbell', 'static lunge'],
  'dumbbell reverse lunge': ['reverse lunge'],
  'bodyweight reverse lunge': ['reverse lunge'],
  'dumbbell walking lunge': ['walking lunge', 'dumbbell walking lunge', 'walking lunges'],
  'dumbbell step up': ['step up'],
  'calf raise machine': ['calf raise machine', 'standing calf raise machine', 'seated calf raise', 'lever calf raise'],
  'dumbbell calf raise': ['dumbbell calf raise', 'standing dumbbell calf'],
  'dumbbell bench press': ['dumbbell bench press', 'dumbbell bench'],
  'dumbbell floor press': ['floor press'],
  'incline dumbbell press': ['incline dumbbell press', 'incline bench press', 'dumbbell incline press'],
  'pec deck': ['pec deck', 'peck deck'],
  'dumbbell chest fly': ['dumbbell chest fly', 'dumbbell fly', 'dumbbell flyes', 'chest fly dumbbell'],
  'incline push up': ['incline push up', 'incline pushup', 'hands elevated push up'],
  'push up': ['push up', 'push-up', 'standard push up'],
  'seated dumbbell shoulder press': ['seated dumbbell shoulder press', 'seated shoulder press'],
  'standing dumbbell shoulder press': ['standing dumbbell shoulder press', 'standing shoulder press'],
  'barbell overhead press': [
    'barbell standing shoulder press',
    'barbell shoulder press',
    'military press',
    'overhead press',
  ],
  'kettlebell overhead press': ['kettlebell shoulder press', 'kettlebell overhead press'],
  'machine shoulder press': [
    'machine shoulder press',
    'lever shoulder press',
    'shoulder press machine',
    'iso lateral shoulder press',
  ],
  't bar row': ['t bar row', 't-bar row', 'landmine row'],
  'landmine press': ['landmine press', 'landmine chest press'],
  'plank': ['front plank', 'plank'],
  'dumbbell lateral raise': ['lateral raise'],
  'cable lateral raise': ['lateral raise', 'cable lateral'],
  'one arm dumbbell row': ['dumbbell row', 'one arm row'],
  'chest supported dumbbell row': ['chest supported row', 'chest supported dumbbell', 'incline dumbbell row', 'seal row'],
  'bent over dumbbell row': ['bent over dumbbell row', 'dumbbell bent over row', 'two arm dumbbell row'],
  'barbell bent over row': ['bent over row', 'barbell row'],
  'lat pulldown': ['lat pulldown', 'lat pull down'],
  'assisted pull up': ['assisted pull up', 'assisted pull-up'],
  'seated cable row': ['seated cable row', 'cable row'],
  'single arm cable row': ['single arm cable row', 'one arm cable row'],
  'face pull': ['face pull'],
  'dumbbell reverse fly': ['reverse fly', 'rear delt'],
  'reverse pec deck': ['reverse pec deck', 'rear delt fly machine', 'reverse fly machine', 'reverse machine fly'],
  'dumbbell biceps curl': ['bicep curl', 'dumbbell curl'],
  'hammer curl': ['hammer curl'],
  'cable biceps curl': ['cable biceps curl', 'cable bicep curl', 'standing cable curl'],
  'triceps pushdown': ['triceps pushdown', 'pushdown'],
  'overhead dumbbell triceps extension': ['overhead dumbbell tricep', 'dumbbell overhead extension', 'seated overhead tricep'],
  'dumbbell triceps kickback': ['dumbbell tricep kickback', 'dumbbell kickback', 'kickback tricep'],
  'bird dog': ['bird dog'],
  'forearm plank': ['forearm plank', 'front plank', 'elbow plank', 'plank hold'],
  'pallof press': ['pallof', 'palloff'],
  'cable crunch': ['kneeling cable crunch', 'cable crunch', 'cable crunches'],
  'ez bar curl': ['ez bar curl', 'barbell ez curl', 'ez curl'],
  'ez bar skull crusher': ['barbell lying triceps skull crusher', 'skull crusher', 'ez bar skull crusher'],
  'nordic curl': ['nordic hamstring curl', 'nordic curl'],
  'assisted dip': ['assisted dip', 'assisted dips', 'chest dip machine'],
  'cable woodchop': ['cable woodchop', 'woodchop', 'woodchopper', 'cable chop'],
  'cable chest fly': ['cable chest fly', 'cable fly', 'standing cable fly'],
  'cable overhead triceps extension': [
    'cable overhead triceps extension',
    'overhead cable tricep',
    'cable overhead tricep',
  ],
  'overhead triceps extension': ['dumbbell overhead tricep', 'seated overhead tricep', 'overhead dumbbell tricep'],
  'seated calf raise': ['seated calf raise machine', 'lever seated calf', 'seated calf raise'],
  'knee push up': ['knee push up', 'kneeling push up', 'push up on knees'],
  'close grip push up': ['close grip push up', 'close-grip push up'],
  'decline push up': ['decline push up', 'decline pushup'],
  'frog pump': ['frog pump', 'frog hip thrust'],
  'hollow body hold': ['hollow hold', 'hollow body'],
  'cable hammer curl': ['cable hammer curl', 'rope hammer curl', 'hammer curl cable'],
  'standing cable leg curl': ['standing cable leg curl', 'standing leg curl', 'cable leg curl'],
  'incline machine chest press': ['incline chest press machine', 'lever incline chest', 'incline machine press'],
  'bulgarian split squat': ['dumbbell bulgarian split squat', 'bulgarian split squat', 'bulgarian dumbbell'],
  'hanging knee raise': ['hanging knee', 'knee raise'],
  'farmer carry': ['farmer carry', 'farmers walk', 'farmer walk', 'farmers carry', 'farmers walk dumbbell'],
  'suitcase carry': ['suitcase carry', 'suitcase'],
};

const EQUIP_PREFIX = new Set([
  'dumbbell',
  'dumbbells',
  'barbell',
  'kettlebell',
  'cable',
  'machine',
  'bodyweight',
  'seated',
  'standing',
  'assisted',
]);

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const MUSCLE_NAMES = 'glutes|quads|hamstrings|adductors|calves|chest|back|shoulders|biceps|triceps|core';

function parseSqlExerciseInserts(sql) {
  const rows = [];
  const lower = sql.toLowerCase();
  const needle = 'insert into public.exercises';
  const rowRe = new RegExp(
    `\\('([a-z0-9-]+)', '((?:[^']|'')*)', '(${MUSCLE_NAMES})'`,
    'g'
  );
  let idx = 0;
  while ((idx = lower.indexOf(needle, idx)) !== -1) {
    const after = sql.indexOf('values', idx);
    const nextInsert = lower.indexOf('insert into public.', after + 6);
    const end = nextInsert === -1 ? sql.length : nextInsert;
    const chunk = sql.slice(after, end);
    rowRe.lastIndex = 0;
    let match;
    while ((match = rowRe.exec(chunk))) {
      const rest = chunk.slice(match.index, match.index + 500);
      const equip = rest.match(/'(barbell|dumbbell|machine|cable|kettlebell|band|bodyweight)'/);
      rows.push({
        slug: match[1],
        name: match[2].replace(/''/g, "'"),
        equipment: equip ? equip[1] : 'bodyweight',
      });
    }
    idx += needle.length;
  }
  return rows;
}

function loadCatalogue() {
  const bySlug = new Map();
  for (const file of EXERCISE_SQL) {
    for (const row of parseSqlExerciseInserts(readFileSync(file, 'utf8'))) {
      if (row.slug && row.name && !bySlug.has(row.slug)) bySlug.set(row.slug, row);
    }
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function loadOverrides() {
  try {
    return JSON.parse(readFileSync(OUT_OVERRIDES, 'utf8'));
  } catch {
    return { accept: {}, reject: {} };
  }
}

function loadExistingMatches() {
  const map = new Map();
  try {
    const body = JSON.parse(readFileSync(OUT_JSON, 'utf8'));
    const rows = Array.isArray(body.matches) ? body.matches : [];
    for (const row of rows) {
      const slug = SLUG_ALIASES[row.slug] ?? row.slug;
      if (slug && !map.has(slug)) map.set(slug, { ...row, slug });
    }
  } catch {
    /* Missing file is fine. */
  }
  for (const [slug, row] of loadProgress()) {
    if (row.status === 'confident' && row.workoutx_id && !map.has(slug)) {
      map.set(slug, row);
    }
  }
  return map;
}

function isUnilateral(name) {
  const n = norm(name);
  return n.includes('one arm') || n.includes('single arm') || n.includes('one leg') || n.includes('single leg');
}

function clashLevel(oursName, theirsName) {
  const ours = ` ${norm(oursName)} `;
  const theirs = ` ${norm(theirsName)} `;
  const has = (haystack, phrase) => haystack.includes(` ${phrase} `);
  const severe = [
    'supine',
    'pullover',
    'figure four',
    'archer',
    'spanish',
    'clap',
    'side tap',
    'and',
  ];
  for (const phrase of severe) {
    if (has(theirs, phrase) && !has(ours, phrase)) return 'severe';
  }
  if (has(theirs, 'calf') && !has(ours, 'calf')) return 'severe';
  if (has(theirs, 'curl') && !has(ours, 'curl')) return 'severe';
  if (has(theirs, 'lunge') && !has(ours, 'lunge')) return 'severe';
  if (has(theirs, 'smith') && !has(ours, 'smith')) return 'severe';
  if (
    has(theirs, 'kickback') &&
    (has(theirs, 'glute') || has(theirs, 'leg')) &&
    (has(ours, 'tricep') || has(ours, 'triceps'))
  ) {
    return 'severe';
  }
  const mild = ['goblet', 'incline', 'decline', 'alternate', 'alternating', 'reverse grip'];
  for (const phrase of mild) {
    if (has(theirs, phrase) && !has(ours, phrase)) return 'mild';
  }
  if ((has(theirs, 'one arm') || has(theirs, 'single arm')) && !isUnilateral(oursName)) return 'mild';
  if (has(theirs, 'overhead') && !has(ours, 'overhead')) return 'mild';
  return 'none';
}

function clutterScore(name) {
  const n = norm(name);
  let score = n.split(' ').length;
  if (n.includes('view')) score += 4;
  if (n.includes('version')) score += 3;
  if (n.includes('alternate') || n.includes('alternating')) score += 2;
  return score;
}

function norm(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stem(word) {
  const special = {
    palloff: 'pallof',
    squats: 'squat',
    flies: 'fly',
    curls: 'curl',
    raises: 'raise',
    lunges: 'lunge',
    rows: 'row',
    presses: 'press',
    extensions: 'extension',
    kickbacks: 'kickback',
    crunches: 'crunch',
    pulls: 'pull',
    pushups: 'pushup',
    bridges: 'bridge',
    thrusts: 'thrust',
  };
  if (special[word]) return special[word];
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function tokens(value) {
  return new Set(
    norm(value)
      .split(' ')
      .filter((part) => part.length > 1 && !STOP.has(part))
      .map(stem)
  );
}

function movementTokens(value) {
  const set = new Set([...tokens(value)].filter((part) => !EQUIP_WORDS.has(part)));
  if (set.has('press') && (set.has('overhead') || set.has('shoulder') || set.has('military'))) {
    set.add('overhead');
    set.add('shoulder');
  }
  return set;
}

function extraTokens(ours, theirs) {
  const extra = [];
  for (const part of theirs) {
    if (!ours.has(part) && !MODIFIERS.has(part)) extra.push(part);
  }
  return extra;
}

function isSubset(small, large) {
  if (small.size === 0) return false;
  for (const part of small) if (!large.has(part)) return false;
  return true;
}

function searchQueries(item) {
  const n = norm(item.name);
  const queries = [];
  const add = (value) => {
    const text = String(value ?? '').trim();
    if (!text) return;
    if (queries.some((existing) => norm(existing) === norm(text))) return;
    queries.push(text);
  };
  for (const alias of SEARCH_ALIASES[n] ?? []) add(alias);
  add(item.name);
  const words = n.split(' ').filter(Boolean);
  const stripped = words.filter((word) => !EQUIP_PREFIX.has(word));
  if (stripped.length >= 2) add(stripped.join(' '));
  if (stripped.length > 2) add(stripped.slice(-2).join(' '));
  return queries;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jaccard(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let inter = 0;
  for (const part of left) if (right.has(part)) inter += 1;
  return inter / (left.size + right.size - inter);
}

function equipmentFamily(raw) {
  const n = norm(raw);
  if (!n) return 'other';
  if (n.includes('assisted')) return 'machine';
  if (n.includes('smith') || n.includes('leverage') || n.includes('sled') || n.includes('hack') || n.includes('machine')) {
    return 'machine';
  }
  if (n.includes('dumbbell')) return 'dumbbell';
  if (n.includes('barbell') || n.includes('ez bar') || n.includes('trap bar')) return 'barbell';
  if (n.includes('cable')) return 'cable';
  if (n.includes('kettlebell')) return 'kettlebell';
  if (n.includes('band')) return 'band';
  if (n.includes('body')) return 'bodyweight';
  return 'other';
}

function equipmentFit(ours, theirs) {
  if (ours === theirs) return 'exact';
  if ((ours === 'dumbbell' && theirs === 'kettlebell') || (ours === 'kettlebell' && theirs === 'dumbbell')) {
    return 'soft';
  }
  if (ours === 'machine' && (theirs === 'cable' || theirs === 'barbell')) return 'soft';
  if (ours === 'cable' && theirs === 'machine') return 'soft';
  return 'no';
}

function pickResults(body) {
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body)) return body;
  return [];
}

function searchUrl(params) {
  const url = new URL(`${API}/exercises`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function fetchSearch(key, name, offset = 0) {
  const url = searchUrl({ name, limit: '10', offset: String(offset) });
  let waitMs = 20000;
  for (let attempt = 1; attempt <= 8; attempt++) {
    const response = await fetch(url, { headers: { 'X-WorkoutX-Key': key } });
    if (response.status === 401) {
      throw new Error(
        'WorkoutX rejected the key (401).\n' +
          'Set a live key in this terminal only:\n' +
          '  $env:WORKOUTX_API_KEY="wx_..."\n' +
          'Do not paste the key into chat, .env, or the app.'
      );
    }
    if (response.status !== 429) return response;
    const retryAfter = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : waitMs;
    console.log(`  Rate limited (429). Waiting ${Math.round(delay / 1000)}s, then retry ${attempt}/8…`);
    await sleep(delay);
    waitMs = Math.min(Math.round(waitMs * 1.5), 120000);
  }
  throw new Error('search failed 429');
}

async function search(key, name) {
  // Free plan: one filter at a time. Second page only if the first is full.
  const first = await fetchSearch(key, name, 0);
  if (!first.ok) {
    throw new Error(`search failed ${first.status}`);
  }
  const rows = pickResults(await first.json());
  if (rows.length < 10) return rows;
  await sleep(300);
  const second = await fetchSearch(key, name, 10);
  if (!second.ok) return rows;
  rows.push(...pickResults(await second.json()));
  return rows;
}

async function searchAll(key, item) {
  const seen = new Map();
  const queries = searchQueries(item);
  for (const query of queries.slice(0, 3)) {
    const results = await search(key, query);
    await sleep(300);
    for (const row of results) {
      const id = String(row?.id ?? '');
      if (id && !seen.has(id)) seen.set(id, row);
    }
    const best = rank(item, [...seen.values()])[0];
    if (best?.status === 'confident') break;
  }
  return [...seen.values()];
}

function preferFemale(item) {
  if (item?.model === 'female') return item;
  if (item?.model !== 'female' && item?.counterpartId) {
    return { ...item, id: item.counterpartId, model: 'female', _viaCounterpart: true };
  }
  return item;
}

function scoreOne(ours, theirs) {
  const theirsName = String(theirs.name ?? '');
  const theirsEquip = equipmentFamily(theirs.equipment);
  const fit = equipmentFit(ours.equipment, theirsEquip);
  const oursMove = movementTokens(ours.name);
  const theirsMove = movementTokens(theirsName);
  const extras = extraTokens(oursMove, theirsMove);
  const similar = oursMove.size && theirsMove.size ? jaccard([...oursMove].join(' '), [...theirsMove].join(' ')) : 0;
  const equalMove = oursMove.size > 0 && oursMove.size === theirsMove.size && isSubset(oursMove, theirsMove);
  const oursInTheirs = isSubset(oursMove, theirsMove);
  const exactName = norm(ours.name) === norm(theirsName);
  const clash = clashLevel(ours.name, theirsName);

  let status = 'unmatched';
  let reason = extras.length ? `extra movement (${extras.join(' ')})` : 'name too far';
  if (clash === 'severe') {
    reason = `wrong variation (${norm(theirsName)})`;
  } else if ((exactName || (equalMove && extras.length === 0)) && fit === 'exact') {
    status = 'confident';
    reason = exactName ? 'exact name and equipment' : 'same movement and equipment';
  } else if (oursInTheirs && extras.length === 0 && fit === 'exact') {
    status = 'confident';
    reason = 'same movement and equipment';
  } else if ((equalMove || (oursInTheirs && extras.length <= 1)) && fit === 'soft') {
    status = 'doubtful';
    reason = 'same movement, equipment differs';
  } else if ((equalMove || oursInTheirs) && fit === 'exact' && extras.length <= 2) {
    status = 'confident';
    reason = extras.length ? `close name, extra ${extras.join(' ')}` : 'close name, same equipment';
  } else if (similar >= 0.7 && fit === 'exact') {
    status = 'confident';
    reason = `close name (${similar.toFixed(2)}), same equipment`;
  } else if (similar >= 0.5 && fit === 'exact') {
    status = 'doubtful';
    reason = `possible (${similar.toFixed(2)}), same equipment`;
  } else if (similar >= 0.5) {
    reason = `possible (${similar.toFixed(2)})`;
  }
  if (clash === 'mild' && status === 'confident') {
    status = 'doubtful';
    reason = 'close variation';
  }
  return { status, reason, similar, fit, theirsEquip, extraCount: extras.length, clutter: clutterScore(theirsName) };
}

function rank(ours, results) {
  const ranked = results
    .map((raw) => {
      const item = preferFemale(raw);
      const scored = scoreOne(ours, item);
      return { item, ...scored };
    })
    .sort((a, b) => {
      const order = { confident: 0, doubtful: 1, unmatched: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      if (a.item?.model === 'female' && b.item?.model !== 'female') return -1;
      if (b.item?.model === 'female' && a.item?.model !== 'female') return 1;
      const fitOrder = { exact: 0, soft: 1, no: 2 };
      if (fitOrder[a.fit] !== fitOrder[b.fit]) return fitOrder[a.fit] - fitOrder[b.fit];
      if (a.extraCount !== b.extraCount) return a.extraCount - b.extraCount;
      if (a.clutter !== b.clutter) return a.clutter - b.clutter;
      return b.similar - a.similar;
    });
  return ranked;
}

function applyOverrides(item, ranked, overrides) {
  const rejected = new Set(overrides.reject?.[item.slug] ?? []);
  const filtered = ranked.filter((row) => !rejected.has(String(row.item?.id ?? '')));
  const accept = overrides.accept?.[item.slug];
  if (!accept?.workoutx_id) return filtered;
  const found = filtered.find((row) => row.item?.id === accept.workoutx_id);
  const chosen = found
    ? { ...found, status: 'confident', reason: 'manual review' }
    : {
        item: {
          id: accept.workoutx_id,
          name: accept.workoutx_name,
          equipment: item.equipment,
          model: '',
        },
        status: 'confident',
        reason: 'manual review',
        similar: 1,
        fit: 'exact',
        extraCount: 0,
        clutter: 0,
      };
  return [chosen, ...filtered.filter((row) => row.item?.id !== accept.workoutx_id)];
}

function applyOverridesToExisting(catalogue, overrides) {
  const existing = loadExistingMatches();
  const rows = [];
  for (const item of catalogue) {
    const accept = overrides.accept?.[item.slug];
    const rejected = new Set(overrides.reject?.[item.slug] ?? []);
    if (accept?.workoutx_id) {
      rows.push({
        slug: item.slug,
        name: item.name,
        equipment: item.equipment,
        status: 'confident',
        workoutx_id: accept.workoutx_id,
        workoutx_name: accept.workoutx_name,
        workoutx_equipment: '',
        workoutx_model: '',
        score: '',
        reason: 'manual review',
      });
      continue;
    }
    const current = existing.get(item.slug);
    if (current?.workoutx_id && !rejected.has(current.workoutx_id)) {
      rows.push({
        slug: item.slug,
        name: item.name,
        equipment: item.equipment,
        status: 'confident',
        workoutx_id: current.workoutx_id,
        workoutx_name: current.workoutx_name,
        workoutx_equipment: '',
        workoutx_model: '',
        score: '',
        reason: 'kept from previous match',
      });
    }
  }
  return rows;
}

function loadProgress() {
  try {
    const text = readFileSync(OUT_PROGRESS, 'utf8');
    const map = new Map();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (row?.slug) map.set(row.slug, row);
    }
    return map;
  } catch {
    return new Map();
  }
}

function appendProgress(row) {
  appendFileSync(OUT_PROGRESS, `${JSON.stringify(row)}\n`);
}

async function writeFileRetry(path, text) {
  let last = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      writeFileSync(path, text);
      return;
    } catch (error) {
      last = error;
      await sleep(300 * attempt);
    }
  }
  throw last ?? new Error(`could not write ${path}`);
}

async function writeCsv(rows) {
  const header = [
    'slug',
    'our_name',
    'our_equipment',
    'status',
    'workoutx_id',
    'workoutx_name',
    'workoutx_equipment',
    'workoutx_model',
    'score',
    'reason',
    'alt1_id',
    'alt1_name',
    'alt2_id',
    'alt2_name',
  ];
  const csv = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.slug,
        row.name,
        row.equipment,
        row.status,
        row.workoutx_id,
        row.workoutx_name,
        row.workoutx_equipment,
        row.workoutx_model,
        row.score,
        row.reason,
        row.alt1_id,
        row.alt1_name,
        row.alt2_id,
        row.alt2_name,
      ]
        .map(csvCell)
        .join(',')
    ),
  ].join('\n');
  await writeFileRetry(OUT_CSV, `${csv}\n`);
}

async function flushOutputs(rows) {
  const confident = rows.filter((row) => row.status === 'confident' && row.workoutx_id);
  await writeCsv(rows);
  await writeJson(confident);
  await writeSql(confident);
  return confident.length;
}

async function writeJson(matches) {
  const body = {
    _format_version: 1,
    _loader_notes: [
      'WorkoutX v2 ids from scripts/match-workoutx.mjs. Female clip where one exists, otherwise male. Confident matches only. Doubtful and unmatched stay in scripts/workoutx-matches.csv for review. Never put the API key here. Store ids, never media URLs.',
    ],
    matches: matches.map((row) => ({
      slug: row.slug,
      workoutx_id: row.workoutx_id,
      workoutx_name: row.workoutx_name,
      confidence: 'high',
    })),
  };
  const text = `${JSON.stringify(body, null, 2)}\n`;
  await writeFileRetry(OUT_JSON, text);
  mkdirSync(dirname(OUT_FN), { recursive: true });
  await writeFileRetry(OUT_FN, text);
}

async function writeSql(matches) {
  const lines = [
    '-- Confident WorkoutX ids from scripts/match-workoutx.mjs.',
    '-- Paste into Supabase > SQL Editor after supabase/workoutx_m1.sql.',
    '-- Safe to run again: it only sets workoutx_id on these rows.',
    '-- Never deletes sessions, sets, or exercise rows.',
    '-- Leave doubtful matches until you approve them in scripts/workoutx-matches.csv.',
    '',
  ];
  for (const row of matches) {
    const id = row.workoutx_id.replace(/'/g, "''");
    const slug = row.slug.replace(/'/g, "''");
    lines.push(`update public.exercises set workoutx_id = '${id}' where id = '${slug}';`);
  }
  lines.push('');
  await writeFileRetry(OUT_SQL, `${lines.join('\n')}\n`);
}

function slimExercise(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id ?? null,
    name: row.name ?? null,
    model: row.model ?? row.gender ?? null,
    counterpartId: row.counterpartId ?? row.counterpart_id ?? null,
    equipment: row.equipment ?? null,
  };
}

async function searchPagesInspect(key, name) {
  const rows = [];
  for (let offset = 0; offset <= 40; offset += 10) {
    const url = new URL(`${API}/exercises`);
    url.searchParams.set('name', name);
    url.searchParams.set('limit', '10');
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, { headers: { 'X-WorkoutX-Key': key } });
    if (!response.ok) {
      console.log(`SEARCH ${name} offset=${offset} status=${response.status}`);
      break;
    }
    const body = await response.json();
    const page = Array.isArray(body?.results) ? body.results : Array.isArray(body) ? body : [];
    console.log(`SEARCH ${JSON.stringify(name)} offset=${offset} total=${body?.total ?? '?'} page=${page.length}`);
    for (const row of page) {
      rows.push(row);
      console.log(' ', JSON.stringify(slimExercise(row)));
    }
    if (page.length < 10) break;
  }
  return rows;
}

async function inspectId(key, id) {
  const getUrl = `${API}/exercises/${encodeURIComponent(id)}`;
  const getRes = await fetch(getUrl, { headers: { 'X-WorkoutX-Key': key } });
  const getBody = await getRes.json();
  const exercise = Array.isArray(getBody?.results) ? getBody.results[0] : getBody;
  console.log(`GET ${getRes.status}`);
  console.log(JSON.stringify(slimExercise(exercise), null, 2));
  const names = [];
  if (exercise?.name) names.push(exercise.name);
  const stripped = String(exercise?.name ?? '')
    .replace(/^(dumbbells?|barbell|cable|machine|kettlebell|bodyweight|seated|standing)\s+/i, '')
    .trim();
  if (stripped) names.push(stripped);
  const seen = new Set();
  for (const name of names) {
    const keyName = String(name).toLowerCase();
    if (!keyName || seen.has(keyName)) continue;
    seen.add(keyName);
    await searchPagesInspect(key, name);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const applyOnly = process.argv.includes('--apply-overrides');
  const rematchAll = process.argv.includes('--all');
  const retryUnmatched = process.argv.includes('--retry-unmatched');
  const inspectIndex = process.argv.indexOf('--inspect');
  const inspectTarget = inspectIndex >= 0 ? String(process.argv[inspectIndex + 1] ?? '').trim() : '';
  const inspectNameIndex = process.argv.indexOf('--inspect-name');
  const inspectName =
    inspectNameIndex >= 0 ? String(process.argv[inspectNameIndex + 1] ?? '').trim() : '';
  const key = (process.env.WORKOUTX_API_KEY ?? '').trim().replace(/^['"]|['"]$/g, '');
  const catalogue = loadCatalogue();
  const overrides = loadOverrides();

  if (dryRun) {
    console.log(`${catalogue.length} exercises in the library:`);
    for (const item of catalogue) console.log(`  ${item.slug}\t${item.name}\t${item.equipment}`);
    return;
  }

  if (applyOnly) {
    const rows = applyOverridesToExisting(catalogue, overrides);
    await writeJson(rows);
    await writeSql(rows);
    console.log(`Applied overrides. Confident: ${rows.length} (written to content/exercises/workoutx-ids.json)`);
    const accepted = Object.keys(overrides.accept ?? {});
    const rejected = Object.keys(overrides.reject ?? {});
    if (accepted.length) console.log(`Accepted: ${accepted.join(', ')}`);
    if (rejected.length) console.log(`Rejected ids kept out of: ${rejected.join(', ')}`);
    return;
  }

  if (!key) {
    console.error(
      'Set WORKOUTX_API_KEY in this terminal only, then re-run.\n' +
        'Do not add it to .env or the app. It belongs in the Supabase Edge Function secret.\n' +
        '  $env:WORKOUTX_API_KEY="wx_..."\n' +
        '  node scripts/match-workoutx.mjs'
    );
    process.exit(1);
  }
  if (!key.startsWith('wx_')) {
    console.error(
      'WORKOUTX_API_KEY should start with wx_. Copy a fresh key from the WorkoutX dashboard.\n' +
        'Do not paste the key into chat.'
    );
    process.exit(1);
  }

  if (inspectName) {
    await searchPagesInspect(key, inspectName);
    return;
  }

  if (inspectTarget) {
    await inspectId(key, inspectTarget);
    return;
  }

  const existing = loadExistingMatches();
  const progress = rematchAll || retryUnmatched ? new Map() : loadProgress();
  const rows = [];
  const toSearch = rematchAll
    ? catalogue.length
    : catalogue.filter(
        (item) =>
          !overrides.accept?.[item.slug]?.workoutx_id &&
          !existing.get(item.slug)?.workoutx_id &&
          !progress.has(item.slug)
      ).length;
  console.log(`Library: ${catalogue.length}. Searching ${toSearch} without a match.`);
  let searched = 0;
  for (const item of catalogue) {
    const accept = overrides.accept?.[item.slug];
    const kept = existing.get(item.slug);
    const prior = progress.get(item.slug);
    if (!rematchAll && prior) {
      rows.push(prior);
      continue;
    }
    if (!rematchAll && (accept?.workoutx_id || kept?.workoutx_id)) {
      rows.push({
        slug: item.slug,
        name: item.name,
        equipment: item.equipment,
        status: 'confident',
        workoutx_id: accept?.workoutx_id ?? kept?.workoutx_id,
        workoutx_name: accept?.workoutx_name ?? kept?.workoutx_name,
        workoutx_equipment: '',
        workoutx_model: '',
        score: '',
        reason: accept?.workoutx_id ? 'manual review' : 'kept from previous match',
        alt1_id: '',
        alt1_name: '',
        alt2_id: '',
        alt2_name: '',
      });
      continue;
    }
    searched += 1;
    if (searched === 1 || searched % 10 === 0 || searched === toSearch) {
      console.log(`  ${searched}/${toSearch}  ${item.slug}`);
    }
    let results;
    try {
      results = await searchAll(key, item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await flushOutputs(rows);
      } catch {
        /* Progress jsonl is the resume source if these files are locked. */
      }
      if (message.includes('429')) {
        console.error(
          `Rate limited after ${searched - 1} searches. Progress is saved.\n` +
            'Wait a minute, then run the same command again. It will skip ids we already have.'
        );
        process.exit(0);
      }
      throw error;
    }
    const ranked = applyOverrides(item, rank(item, results), overrides);
    const best = ranked[0] ?? null;
    const alts = ranked.slice(1, 3);
    const row = {
      slug: item.slug,
      name: item.name,
      equipment: item.equipment,
      status: best?.status ?? 'unmatched',
      workoutx_id: best?.item?.id ?? '',
      workoutx_name: best?.item?.name ?? '',
      workoutx_equipment: best?.item?.equipment ?? '',
      workoutx_model: best?.item?.model ?? '',
      score: best ? best.similar.toFixed(2) : '',
      reason: best?.reason ?? 'no results',
      alt1_id: alts[0]?.item?.id ?? '',
      alt1_name: alts[0]?.item?.name ?? '',
      alt2_id: alts[1]?.item?.id ?? '',
      alt2_name: alts[1]?.item?.name ?? '',
    };
    try {
      appendProgress(row);
    } catch {
      /* Resume still works from ids.json if this append fails. */
    }
    rows.push(row);
  }
  try {
    await flushOutputs(rows);
  } catch (error) {
    console.error(
      'Could not update workoutx-ids.json. If that file is open in the editor, close it and run:\n' +
        '  node scripts/match-workoutx.mjs --apply-overrides'
    );
    console.error(error instanceof Error ? error.message : String(error));
  }

  const confident = rows.filter((row) => row.status === 'confident' && row.workoutx_id);

  const doubtful = rows.filter((row) => row.status === 'doubtful');
  const unmatched = rows.filter((row) => row.status === 'unmatched');

  console.log(`Library: ${rows.length}`);
  console.log(`Confident: ${confident.length} (written to content/exercises/workoutx-ids.json)`);
  console.log(`Doubtful: ${doubtful.length} (review before using)`);
  console.log(`Unmatched: ${unmatched.length}`);
  console.log(`CSV: ${OUT_CSV}`);
  if (doubtful.length) {
    console.log('\nDoubtful matches:');
    for (const row of doubtful) {
      console.log(`  ${row.slug}  →  ${row.workoutx_id || '(none)'}  ${row.workoutx_name}  [${row.reason}]`);
    }
  }
  if (unmatched.length) {
    console.log('\nUnmatched:');
    for (const row of unmatched) {
      console.log(`  ${row.slug}  (${row.name}, ${row.equipment})  ${row.reason}`);
    }
  }
}

if (!usingSystemCa() && enableSystemCa()) {
  const child = spawn(process.execPath, ['--use-system-ca', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
} else {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
