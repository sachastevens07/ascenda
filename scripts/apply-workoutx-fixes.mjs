/**
 * Apply content/exercises/workoutx-matches.json.
 * Looks up each named demo in WorkoutX v2 (IDs in the JSON are Gym Visual,
 * not WorkoutX). Prefers a female clip, then male.
 *
 *   node scripts/apply-workoutx-fixes.mjs --dry-run
 *   node scripts/apply-workoutx-fixes.mjs --apply-content
 *   $env:WORKOUTX_API_KEY="wx_..."
 *   node scripts/apply-workoutx-fixes.mjs
 *
 * Does not log media URLs or the key.
 */

import { spawn } from 'node:child_process';
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const CONTENT = join(ROOT, 'content');
const API = 'https://api.workoutxapp.com/v2';
const FIXES = join(CONTENT, 'exercises', 'workoutx-matches.json');
const OUT_JSON = join(CONTENT, 'exercises', 'workoutx-ids.json');
const OUT_FN = join(ROOT, 'supabase', 'functions', 'exercise-media', 'ids.json');
const OUT_SQL = join(ROOT, 'supabase', 'workoutx_ids.sql');
const OUT_OVERRIDES = join(CONTENT, 'exercises', 'workoutx-overrides.json');
const EXERCISE_SQL = [
  join(ROOT, 'supabase', 'exercises.sql'),
  join(ROOT, 'supabase', 'stretches.sql'),
  join(ROOT, 'supabase', 'content_routines_1.sql'),
];
const MUSCLE_NAMES = 'glutes|quads|hamstrings|adductors|calves|chest|back|shoulders|biceps|triceps|core';

const NAME_ALIASES = {
  'dumbbell lat raise': 'dumbbell-lateral-raise',
  'bent over rear delt fly': 'rear-delt-fly',
  'lying twist': 'supine-twist',
  'pigeon stretch': 'supported-pigeon',
  'bodyweight calf raises': 'bodyweight-calf-raise',
  'worlds greatest stretch': 'worlds-greatest-stretch',
  '90 90 hip stretch': 'ninety-ninety-hip-stretch',
  'kettlebell farmers carry': 'kettlebell-farmers-carry',
  'childs pose': 'childs-pose',
  'single leg rdl': 'single-leg-romanian-deadlift',
  'side lying inner thigh raise': 'side-lying-adduction',
  'reverse pec deck': 'reverse-pec-deck',
  'machine shoulder press': 'machine-shoulder-press',
  'shoulder press machine': 'machine-shoulder-press',
  'cable hip abduction': 'cable-hip-abduction',
  'standing cable hip abduction': 'cable-hip-abduction',
  'low lunge with reach': 'low-lunge-reach',
  'calf wall stretch': 'calf-stretch-wall',
  'doorway chest stretch': 'chest-stretch-wall',
  'kneeling hip flexor stretch': 'half-kneeling-hip-flexor-stretch',
  'standing hip circles': 'hip-circles',
  'open book stretch': 'open-book',
  'wrist and forearm stretch': 'wrist-and-forearm-stretch',
  'standing quad stretch': 'side-lying-quad-stretch',
  'seated hamstring stretch': 'lying-hamstring-stretch',
  'standing cable hip adduction': 'cable-hip-adduction',
  'glute bridge': 'bodyweight-glute-bridge',
  'dumbbell walking lunge': 'walking-lunge',
};

const MERGE_MAP = {
  'cable-triceps-pushdown': 'triceps-pushdown',
  plank: 'forearm-plank',
  'kettlebell-farmers-carry': 'farmer-carry',
  'rear-delt-fly': 'dumbbell-reverse-fly',
  'standing-calf-raise': 'calf-raise-machine',
};

/** In current routines, singles, stretches or warm-ups: keep. */
const KEEP_IN_PLANS = new Set([
  'chin-tuck',
  'dumbbell-floor-press',
  'legs-up-the-wall',
  'seated-spinal-twist',
  'suitcase-carry',
  'wall-angel',
  'butterfly-stretch',
  'single-leg-romanian-deadlift',
  'supported-deep-squat',
]);

/** Library-only rows from both remove lists. Strip demos. Do not delete session history. */
const RETIRE_SLUGS = [
  'ninety-ninety-hip-stretch',
  'banded-clamshell',
  'bear-plank',
  'cable-squat',
  'cable-woodchop',
  'deficit-reverse-lunge',
  'donkey-kick',
  'dumbbell-sumo-squat',
  'kettlebell-suitcase-carry',
  'pike-push-up',
  'single-arm-cable-chest-press',
  'single-leg-box-squat',
  'sliding-leg-curl',
  'banded-glute-bridge',
  'close-grip-bench-press',
  'close-grip-lat-pulldown',
  'close-grip-push-up',
  'decline-push-up',
  'dumbbell-shrug',
  'kettlebell-floor-press',
  'prone-press-up',
  'side-lying-adduction',
  'single-leg-calf-raise',
  'single-leg-hip-thrust',
  't-bar-row',
];

const KEEP_NO_DEMO_EXTRA = [
  'chin-tuck',
  'legs-up-the-wall',
  'seated-spinal-twist',
  'wall-angel',
];

const GOBLET_KEEP = {
  slug: 'goblet-squat',
  workoutx_id: 'ex_42XRWI',
  workoutx_name: 'Narrow Stance Heels Elevated Dumbbell Goblet Squats',
  confidence: 'high',
};

const DROP_WRONG = [
  'push-up',
  'chin-up',
];

const REMOVE_REPLACEMENTS = {
  'ninety-ninety-hip-stretch': {
    with: 'hip-90-90-switch',
    why: 'Not in current stretch JSON. Current hips sessions already use 90/90 hip switch. Old SQL stretch days would swap to that.',
  },
  'banded-clamshell': {
    with: 'fire-hydrant',
    why: 'Same glute pattern. Only used in old programme templates, not current routines.',
  },
  'bear-plank': {
    with: 'forearm-plank',
    why: 'Closest core hold. Not in current /content plans.',
  },
  'cable-squat': {
    with: 'goblet-squat',
    why: 'Same squat pattern. Not in current /content plans.',
  },
  'cable-woodchop': {
    with: 'pallof-press',
    why: 'Anti-rotation core instead of chop. Not in current /content plans.',
  },
  'chin-tuck': {
    with: 'neck-side-stretch',
    why: 'Desk reset already has neck side stretch. Replacing the chin tuck with a second neck-side-stretch round keeps the session length. Alternative: thread-the-needle.',
  },
  'deficit-reverse-lunge': {
    with: 'dumbbell-reverse-lunge',
    why: 'Same lunge without the deficit. Not in current /content plans.',
  },
  'donkey-kick': {
    with: 'banded-kickback',
    why: 'Same glute kickback pattern. Only in old programmes plus a leftover demo id.',
  },
  'dumbbell-floor-press': {
    with: 'dumbbell-bench-press',
    why: 'Listed alternative. Used in Home Dumbbell Full Body and as a bench-press swap.',
  },
  'dumbbell-sumo-squat': {
    with: 'goblet-squat',
    why: 'Closest squat still in the library. Not in current /content plans.',
  },
  'kettlebell-suitcase-carry': {
    with: 'farmer-carry',
    why: 'Suitcase carry is also on the remove list, so both kettlebell and dumbbell suitcase map to farmer carry.',
  },
  'legs-up-the-wall': {
    with: 'seated-forward-fold',
    why: 'Wind-down already has happy baby and slow breathing. Seated forward fold keeps a quiet hold so the session is not shorter.',
  },
  'pike-push-up': {
    with: 'knee-push-up',
    why: 'Bodyweight push that stays in the library. Not in current /content plans.',
  },
  'seated-spinal-twist': {
    with: 'supine-twist',
    why: 'Same rotation, lying down. Used in Back unwind (which already has a lying twist) and Quick cool-down.',
  },
  'single-arm-cable-chest-press': {
    with: 'chest-press-machine',
    why: 'Same press pattern. Not in current /content plans.',
  },
  'single-leg-box-squat': {
    with: 'dumbbell-box-squat',
    why: 'Box squat still in the library. Not in current /content plans.',
  },
  'sliding-leg-curl': {
    with: 'lying-leg-curl',
    why: 'Same hamstring curl. Only in old programmes plus a leftover demo id.',
  },
  'suitcase-carry': {
    with: 'farmer-carry',
    why: 'Listed alternative. Used in Busy Gym, Summit, Twice a Week Strong, Strength and Stamina, Strong for Life, and a core single session. Check any day that already has a farmer carry so it does not double up.',
  },
  'wall-angel': {
    with: 'kneeling-lat-stretch',
    why: 'Shoulders and Upper Back already has arm circles and open-book. Kneeling lat stretch keeps an upper-back opener.',
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function norm(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSqlExerciseInserts(sql) {
  const rows = [];
  const lower = sql.toLowerCase();
  const needle = 'insert into public.exercises';
  const rowRe = new RegExp(`\\('([a-z0-9-]+)', '((?:[^']|'')*)', '(${MUSCLE_NAMES})'`, 'g');
  let idx = 0;
  while ((idx = lower.indexOf(needle, idx)) !== -1) {
    const after = sql.indexOf('values', idx);
    const nextInsert = lower.indexOf('insert into public.', after + 6);
    const end = nextInsert === -1 ? sql.length : nextInsert;
    const chunk = sql.slice(after, end);
    rowRe.lastIndex = 0;
    let match;
    while ((match = rowRe.exec(chunk))) {
      rows.push({ slug: match[1], name: match[2].replace(/''/g, "'") });
    }
    idx += needle.length;
  }
  return rows;
}

function addRow(bySlug, slug, name) {
  if (!slug || bySlug.has(slug)) return;
  bySlug.set(slug, { slug, name: name || slug });
}

function loadCatalogue() {
  const bySlug = new Map();
  const catalogue = JSON.parse(readFileSync(join(CONTENT, 'exercises', 'strength-catalogue.json'), 'utf8'));
  for (const row of catalogue.exercises ?? []) addRow(bySlug, row.slug, row.name);
  const stretches = JSON.parse(readFileSync(join(CONTENT, 'stretches', 'stretch-routines.json'), 'utf8'));
  for (const row of stretches.moves ?? []) addRow(bySlug, row.slug, row.name);
  const warmups = JSON.parse(readFileSync(join(CONTENT, 'warmups-cooldowns', 'warmups-cooldowns.json'), 'utf8'));
  for (const row of warmups.moves ?? []) addRow(bySlug, row.slug, row.name);
  for (const file of EXERCISE_SQL) {
    try {
      for (const row of parseSqlExerciseInserts(readFileSync(file, 'utf8'))) {
        addRow(bySlug, row.slug, row.name);
      }
    } catch {
      /* Missing SQL file is fine. */
    }
  }
  return bySlug;
}

function resolveSlug(appName, catalogue) {
  const alias = NAME_ALIASES[norm(appName)] ?? NAME_ALIASES[String(appName ?? '').toLowerCase()];
  if (alias && catalogue.has(alias)) return alias;
  const wanted = norm(appName);
  for (const [slug, row] of catalogue) {
    if (norm(row.name) === wanted) return slug;
  }
  for (const [slug] of catalogue) {
    if (norm(slug.replace(/-/g, ' ')) === wanted) return slug;
  }
  return alias ?? null;
}

function searchQueries(workoutxName) {
  const cleaned = String(workoutxName ?? '')
    .replace(/[()]/g, ' ')
    .replace(/в°/g, ' ')
    .replace(/°/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stop = new Set(['with', 'the', 'and', 'on', 'of', 'a', 'an', 'to', 'in', 'for', 'male', 'female', 'version', 'v', '2', 'v2']);
  const queries = [];
  const add = (value) => {
    const next = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (next.length >= 2) queries.push(next);
  };
  add(cleaned);
  add(cleaned.replace(/\b(male|female|version 2|v 2|v2)\b/gi, ' '));
  add(cleaned.replace(/^(lever|sled|band|resistance band|ez barbell|weighted|assisted)\s+/i, ''));
  if (/hug keens/i.test(cleaned)) add('hug knees to chest');
  if (/leg press/i.test(cleaned)) add('leg press');
  if (/farmers walk/i.test(cleaned)) add('farmers walk');
  if (/push-up$/i.test(cleaned) || /^push-up$/i.test(cleaned)) add('push-up');
  if (/chin-up$/i.test(cleaned) || /^chin-up$/i.test(cleaned)) add('chin-up');
  const words = cleaned.split(' ').filter((word) => word && !stop.has(word.toLowerCase()));
  if (words.length >= 2) add(words.slice(-2).join(' '));
  if (words.length >= 3) add(words.slice(0, 3).join(' '));
  return [...new Set(queries)];
}

function pickResults(body) {
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body)) return body;
  return [];
}

function exerciseModel(row) {
  const rec = row ?? {};
  if (rec.isFemale === true) return 'female';
  const value = String(rec.model ?? rec.gender ?? '')
    .trim()
    .toLowerCase();
  if (value.startsWith('f') || value === 'woman' || value === 'women') return 'female';
  if (value.startsWith('m') || value === 'man' || value === 'men') return 'male';
  return value;
}

function nameScore(wanted, theirs) {
  const a = norm(wanted);
  const b = norm(theirs);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const as = new Set(a.split(' '));
  const bs = new Set(b.split(' '));
  let hit = 0;
  for (const part of as) if (bs.has(part)) hit += 1;
  let score = hit / Math.max(as.size, bs.size);
  if (b.includes(a) || a.includes(b)) score = Math.max(score, 0.85);
  const extra = [...bs].filter((part) => !as.has(part));
  const penaltyWords = new Set([
    'band',
    'plate',
    'overhead',
    'bulgarian',
    'assisted',
    'cable',
    'narrow',
    'heels',
    'elevated',
    'left',
    'right',
  ]);
  const penalties = extra.filter((part) => penaltyWords.has(part)).length;
  score -= penalties * 0.25;
  if (extra.includes('band') && !as.has('band') && !as.has('resistance')) score -= 0.3;
  return Math.max(0, score);
}

function pickBest(wantedName, rows) {
  const ranked = rows
    .map((row) => ({
      row,
      score: nameScore(wantedName, row?.name),
      female: exerciseModel(row) === 'female',
    }))
    .filter((item) => item.score >= 0.6 && typeof item.row?.id === 'string' && /^ex_[A-Za-z0-9]+$/.test(item.row.id))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.female !== right.female) return left.female ? -1 : 1;
      return 0;
    });
  return ranked[0] ?? null;
}

async function fetchSearch(key, name) {
  const url = new URL(`${API}/exercises`);
  url.searchParams.set('name', name);
  url.searchParams.set('limit', '10');
  const response = await fetch(url, { headers: { 'X-WorkoutX-Key': key } });
  if (response.status === 401) {
    throw new Error('WorkoutX rejected the key (401). Set WORKOUTX_API_KEY in this terminal only.');
  }
  if (response.status === 429) {
    const retryAfter = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 20000;
    console.log(`  Rate limited. Waiting ${Math.round(delay / 1000)}s…`);
    await sleep(delay);
    return fetchSearch(key, name);
  }
  if (!response.ok) throw new Error(`search failed ${response.status}`);
  return pickResults(await response.json());
}

async function searchName(key, workoutxName) {
  const seen = new Map();
  for (const query of searchQueries(workoutxName)) {
    const page = await fetchSearch(key, query);
    await sleep(300);
    for (const row of page) {
      const id = String(row?.id ?? '');
      if (id && !seen.has(id)) seen.set(id, row);
    }
    const best = pickBest(workoutxName, [...seen.values()]);
    if (best && best.score >= 0.85) return best;
  }
  return pickBest(workoutxName, [...seen.values()]);
}

function listJsonFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsonFiles(path));
    else if (entry.name.endsWith('.json')) out.push(path);
  }
  return out;
}

function collectSlugHits(slug) {
  const hits = [];
  const needle = `"${slug}"`;
  for (const file of listJsonFiles(CONTENT)) {
    if (file.includes('workoutx-matches.json') || file.includes('musclewiki-ids.json')) continue;
    const text = readFileSync(file, 'utf8');
    if (!text.includes(needle)) continue;
    const rel = file.slice(CONTENT.length + 1).replaceAll('\\', '/');
    const count = text.split(needle).length - 1;
    hits.push(`${rel} (${count})`);
  }
  return hits;
}

function writeIds(matches, clearSlugs = []) {
  const matchSlugs = new Set(matches.map((row) => row.slug));
  const noDemo = [...new Set(clearSlugs)].filter((slug) => slug && !matchSlugs.has(slug)).sort();
  const body = {
    _format_version: 1,
    _loader_notes: [
      'WorkoutX v2 ids from content/exercises/workoutx-matches.json, looked up by name. Female clip where one exists, otherwise male. Never put the API key here. Store ids, never media URLs. no_demo slugs must not fall back to a database id.',
    ],
    no_demo: noDemo,
    matches: matches.sort((a, b) => a.slug.localeCompare(b.slug)),
  };
  const json = `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(OUT_JSON, json);
  copyFileSync(OUT_JSON, OUT_FN);
  const clears = noDemo
    .map((slug) => `update public.exercises set workoutx_id = null where id = '${slug}';`)
    .join('\n');
  const sets = matches
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((row) => `update public.exercises set workoutx_id = '${row.workoutx_id}' where id = '${row.slug}';`)
    .join('\n');
  const sql = `-- Confident WorkoutX ids from scripts/apply-workoutx-fixes.mjs.
-- Paste into Supabase > SQL Editor after supabase/workoutx_m1.sql.
-- Safe to run again. Clears no-demo and merged-away ids, then sets the rest.
-- Never deletes sessions, sets, or exercise rows.

${clears ? `${clears}\n\n` : ''}${sets}
`;
  writeFileSync(OUT_SQL, sql);
}

function loadIds() {
  const existing = JSON.parse(readFileSync(OUT_JSON, 'utf8'));
  const bySlug = new Map();
  for (const row of existing.matches ?? []) {
    if (row.slug && row.workoutx_id) bySlug.set(row.slug, row);
  }
  return bySlug;
}

function stripFromIds(bySlug, slugs) {
  for (const slug of slugs) bySlug.delete(slug);
}

function rewriteJsonSlugs(map) {
  const skip = new Set(['workoutx-matches.json', 'workoutx-ids.json', 'workoutx-overrides.json', 'musclewiki-ids.json']);
  let files = 0;
  for (const file of listJsonFiles(CONTENT)) {
    if ([...skip].some((name) => file.endsWith(name))) continue;
    const before = readFileSync(file, 'utf8');
    let after = before;
    for (const [from, to] of Object.entries(map)) {
      after = after.replaceAll(`"${from}"`, `"${to}"`);
    }
    if (after === before) continue;
    writeFileSync(file, after);
    files += 1;
    console.log(`  rewrote slugs in ${file.slice(CONTENT.length + 1)}`);
  }
  return files;
}

function filterRetiredStrings(value) {
  const retire = new Set(RETIRE_SLUGS);
  if (Array.isArray(value)) {
    return value
      .map((item) => filterRetiredStrings(item))
      .filter((item) => item !== undefined && !(typeof item === 'string' && retire.has(item)));
  }
  if (value && typeof value === 'object') {
    if (typeof value.slug === 'string' && retire.has(value.slug)) return undefined;
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      const next = filterRetiredStrings(child);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return value;
}

function scrubRetiredFromContent() {
  const skip = new Set(['workoutx-matches.json', 'workoutx-ids.json', 'workoutx-overrides.json', 'musclewiki-ids.json']);
  let files = 0;
  for (const file of listJsonFiles(CONTENT)) {
    if ([...skip].some((name) => file.endsWith(name))) continue;
    const before = readFileSync(file, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(before);
    } catch {
      continue;
    }
    const afterObj = filterRetiredStrings(parsed);
    const after = `${JSON.stringify(afterObj, null, 2)}\n`;
    if (after === before) continue;
    writeFileSync(file, after);
    files += 1;
    console.log(`  removed retired slugs from ${file.slice(CONTENT.length + 1)}`);
  }
  return files;
}

function applyRemovals(mapped) {
  const bySlug = loadIds();
  stripFromIds(bySlug, [...RETIRE_SLUGS, ...KEEP_NO_DEMO_EXTRA, ...DROP_WRONG]);
  bySlug.set(GOBLET_KEEP.slug, GOBLET_KEEP);

  const noDemo = [
    ...mapped.filter((item) => item.action === 'no demo' && item.slug).map((item) => item.slug),
    ...KEEP_NO_DEMO_EXTRA,
  ];
  if (noDemo.includes('open-book')) noDemo.push('open-book-stretch');
  const mergeFrom = Object.keys(MERGE_MAP);
  stripFromIds(bySlug, [...noDemo, ...mergeFrom, ...RETIRE_SLUGS]);
  bySlug.set(GOBLET_KEEP.slug, GOBLET_KEEP);

  const matches = [...bySlug.values()].filter((row) => /^ex_[A-Za-z0-9]+$/.test(row.workoutx_id ?? ''));
  writeIds(matches, [...new Set([...noDemo, ...mergeFrom, ...RETIRE_SLUGS, ...DROP_WRONG])]);

  const overrides = JSON.parse(readFileSync(OUT_OVERRIDES, 'utf8'));
  overrides.accept = overrides.accept ?? {};
  overrides.reject = overrides.reject ?? {};
  for (const slug of [...RETIRE_SLUGS, ...KEEP_NO_DEMO_EXTRA, ...mergeFrom, ...DROP_WRONG]) {
    delete overrides.accept[slug];
  }
  overrides.accept['goblet-squat'] = {
    workoutx_id: GOBLET_KEEP.workoutx_id,
    workoutx_name: GOBLET_KEEP.workoutx_name,
  };
  overrides.reject['goblet-squat'] = [...new Set([...(overrides.reject['goblet-squat'] ?? []), 'ex_3BK5ZX'])];
  overrides.reject['push-up'] = [...new Set([...(overrides.reject['push-up'] ?? []), 'ex_TTFQPO'])];
  overrides.reject['chin-up'] = [...new Set([...(overrides.reject['chin-up'] ?? []), 'ex_SC4LWW'])];
  overrides.reject['walking-lunge'] = [...new Set([...(overrides.reject['walking-lunge'] ?? []), 'ex_OWTS3V'])];
  overrides.no_demo = [...new Set(noDemo)].sort();
  overrides.merge = MERGE_MAP;
  overrides.retired = [...RETIRE_SLUGS].sort();
  overrides.keep_in_plans = [...KEEP_IN_PLANS].sort();
  writeFileSync(OUT_OVERRIDES, `${JSON.stringify(overrides, null, 2)}\n`);

  console.log(
    `Removals: retired ${RETIRE_SLUGS.length} library-only exercises, kept ${KEEP_IN_PLANS.size} in-plan exercises, restored goblet squat, dropped ${DROP_WRONG.length} wrong clips. Demos left: ${matches.length}.`
  );
}

function applyContent(mapped) {
  const bySlug = loadIds();
  const noDemo = mapped.filter((item) => item.action === 'no demo' && item.slug).map((item) => item.slug);
  if (noDemo.includes('open-book')) noDemo.push('open-book-stretch');
  const mergeFrom = mapped.filter((item) => item.action === 'merge' && item.slug).map((item) => item.slug);
  stripFromIds(bySlug, [...noDemo, ...mergeFrom]);
  const matches = [...bySlug.values()].filter((row) => /^ex_[A-Za-z0-9]+$/.test(row.workoutx_id ?? ''));
  writeIds(matches, [...noDemo, ...mergeFrom]);

  const overrides = JSON.parse(readFileSync(OUT_OVERRIDES, 'utf8'));
  for (const slug of [...noDemo, ...mergeFrom]) {
    if (overrides.accept) delete overrides.accept[slug];
  }
  overrides.no_demo = [...new Set(noDemo)].sort();
  overrides.merge = MERGE_MAP;
  writeFileSync(OUT_OVERRIDES, `${JSON.stringify(overrides, null, 2)}\n`);

  const rewritten = rewriteJsonSlugs(MERGE_MAP);
  console.log(`Content: stripped ${noDemo.length} no-demo ids, ${mergeFrom.length} merge-from ids. Rewrote ${rewritten} content files. Total demos left: ${matches.length}.`);
}

function report(mapped, unmapped) {
  const useRows = mapped.filter((item) => item.action === 'use' || item.action === 'use (close match)');
  const noDemo = mapped.filter((item) => item.action === 'no demo');
  const merges = mapped.filter((item) => item.action === 'merge');
  const removes = mapped.filter((item) => item.action === 'remove' && item.match !== 'remove (match exists)');
  const removeKeep = mapped.filter((item) => item.match === 'remove (match exists)');

  console.log(`Fixes: ${mapped.length}. Unmapped names: ${unmapped.length}`);
  if (unmapped.length) {
    for (const name of unmapped) console.log(`  UNMAPPED  ${name}`);
  }
  console.log(
    `use ${useRows.filter((item) => item.action === 'use').length}, close ${useRows.filter((item) => item.action === 'use (close match)').length}, no demo ${noDemo.length}, merge ${merges.length}, remove ${removes.length}, remove (match exists) ${removeKeep.length}`
  );

  console.log('\nMerges (Standing calf raise is the machine in our library, so it maps to Calf raise machine):');
  for (const item of merges) {
    const keep = MERGE_MAP[item.slug] ?? '(unknown keep)';
    const hits = item.slug ? collectSlugHits(item.slug) : [];
    console.log(`  ${item.app_name}  (${item.slug})  →  ${keep}`);
    console.log(`    ${item.note}`);
    console.log(`    in /content: ${hits.length ? hits.join(', ') : 'not used in current content JSON'}`);
  }

  console.log('\nNo demo (keep the exercise, strip the animation):');
  for (const item of noDemo) {
    console.log(`  ${item.app_name}  (${item.slug ?? 'UNMAPPED'})`);
  }

  console.log('\nRemove (no match). Proposed replacements, not applied:');
  for (const item of removes) {
    const plan = item.slug ? REMOVE_REPLACEMENTS[item.slug] : null;
    const hits = item.slug ? collectSlugHits(item.slug) : [];
    console.log(`  ${item.app_name}  (${item.slug ?? 'UNMAPPED'})`);
    console.log(`    replace with: ${plan ? `${plan.with}  —  ${plan.why}` : 'needs a pick'}`);
    console.log(`    in /content: ${hits.length ? hits.join(', ') : 'library only (not in current plans)'}`);
  }

  console.log('\nRemove (match exists). Left in place. Say keep or remove for each:');
  for (const item of removeKeep) {
    const hits = item.slug ? collectSlugHits(item.slug) : [];
    console.log(`  ${item.app_name}  (${item.slug ?? 'UNMAPPED'})  →  ${item.workoutx_name}`);
    console.log(`    ${item.note}`);
    console.log(`    in /content: ${hits.length ? hits.join(', ') : 'library only (not in current plans)'}`);
  }
}

function mapFixes(catalogue) {
  const fixes = JSON.parse(readFileSync(FIXES, 'utf8'));
  const mapped = [];
  const unmapped = [];
  for (const item of fixes.exercises ?? []) {
    const slug = resolveSlug(item.app_name, catalogue);
    if (!slug) unmapped.push(item.app_name);
    mapped.push({ ...item, slug });
  }
  return { mapped, unmapped };
}

async function lookup(mapped, { missingOnly = false } = {}) {
  const key = (process.env.WORKOUTX_API_KEY ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!key) {
    console.error(
      'Set WORKOUTX_API_KEY in this terminal, then re-run without --dry-run.\n' +
        '  $env:WORKOUTX_API_KEY="wx_..."\n' +
        '  node scripts/apply-workoutx-fixes.mjs --retry-missing'
    );
    process.exit(1);
  }

  const keepLookup = mapped.filter(
    (item) => item.slug && KEEP_IN_PLANS.has(item.slug) && item.match === 'remove (match exists)'
  );
  const useRows = [
    ...mapped.filter((item) => item.action === 'use' || item.action === 'use (close match)'),
    ...keepLookup,
  ];
  const bySlug = loadIds();
  const targets = missingOnly
    ? useRows.filter((item) => item.slug && !bySlug.has(item.slug))
    : useRows;
  const missing = [];
  const found = [];
  let searched = 0;
  for (const item of targets) {
    if (!item.slug || !item.workoutx_name) {
      missing.push(item.app_name);
      continue;
    }
    searched += 1;
    console.log(`  ${searched}/${targets.length}  ${item.slug}  ←  ${item.workoutx_name}`);
    const best = await searchName(key, item.workoutx_name);
    if (best && nameScore(item.workoutx_name, best.row.name) < 0.6) {
      missing.push(`${item.slug} (${item.workoutx_name})  got ${best.row.name}, skipped`);
      continue;
    }
    if (!best) {
      missing.push(`${item.slug} (${item.workoutx_name})`);
      continue;
    }
    found.push({
      slug: item.slug,
      workoutx_id: best.row.id,
      workoutx_name: best.row.name,
      confidence: item.match === 'close' ? 'close' : 'high',
      model: exerciseModel(best.row) || '',
    });
    bySlug.set(item.slug, {
      slug: item.slug,
      workoutx_id: best.row.id,
      workoutx_name: best.row.name,
      confidence: item.match === 'close' ? 'close' : 'high',
    });
  }

  const noDemo = [
    ...mapped.filter((item) => item.action === 'no demo' && item.slug).map((item) => item.slug),
    ...KEEP_NO_DEMO_EXTRA,
  ];
  if (noDemo.includes('open-book')) noDemo.push('open-book-stretch');
  const mergeFrom = mapped.filter((item) => item.action === 'merge' && item.slug).map((item) => item.slug);
  stripFromIds(bySlug, [...noDemo, ...mergeFrom, ...RETIRE_SLUGS]);
  if (!bySlug.has(GOBLET_KEEP.slug) || bySlug.get(GOBLET_KEEP.slug)?.workoutx_id === 'ex_3BK5ZX') {
    bySlug.set(GOBLET_KEEP.slug, GOBLET_KEEP);
  }
  const matches = [...bySlug.values()].filter((row) => /^ex_[A-Za-z0-9]+$/.test(row.workoutx_id ?? ''));
  writeIds(matches, [...new Set([...noDemo, ...mergeFrom, ...RETIRE_SLUGS, ...DROP_WRONG])]);

  const overrides = JSON.parse(readFileSync(OUT_OVERRIDES, 'utf8'));
  overrides.accept = overrides.accept ?? {};
  for (const row of found) {
    overrides.accept[row.slug] = {
      workoutx_id: row.workoutx_id,
      workoutx_name: row.workoutx_name,
    };
  }
  writeFileSync(OUT_OVERRIDES, `${JSON.stringify(overrides, null, 2)}\n`);

  console.log(`Locked ${found.length} demos. Total ids: ${matches.length}.`);
  if (missing.length) {
    console.log('Could not find in WorkoutX:');
    for (const row of missing) console.log(`  ${row}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const applyContentOnly = process.argv.includes('--apply-content');
  const applyRemovalsOnly = process.argv.includes('--apply-removals');
  const retryMissing = process.argv.includes('--retry-missing');
  const catalogue = loadCatalogue();
  const { mapped, unmapped } = mapFixes(catalogue);
  if (!retryMissing) report(mapped, unmapped);
  if (dryRun) return;
  if (applyRemovalsOnly) {
    applyRemovals(mapped);
    return;
  }
  if (retryMissing) {
    await lookup(mapped, { missingOnly: true });
    return;
  }
  applyContent(mapped);
  if (applyContentOnly) return;
  await lookup(mapped);
}

function run() {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

if (usingSystemCa() || enableSystemCa()) {
  run();
} else {
  const child = spawn(process.execPath, ['--use-system-ca', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}
