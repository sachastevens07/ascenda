/**
 * Propose WorkoutX v2 matches for every exercise in
 * content/exercises/strength-catalogue.json. Female model where available.
 *
 * One-off. The API key is read from the environment only. Never put it in the
 * app, .env, or this file.
 *
 *   $env:WORKOUTX_API_KEY="wx_..."
 *   node scripts/match-workoutx.mjs
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
 * Search uses name + model=female, limit 5, so a full run is one search per
 * catalogue row (not a dump of the whole library).
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const CATALOGUE = join(ROOT, 'content', 'exercises', 'strength-catalogue.json');
const OUT_CSV = join(ROOT, 'scripts', 'workoutx-matches.csv');
const OUT_JSON = join(ROOT, 'content', 'exercises', 'workoutx-ids.json');
const OUT_FN = join(ROOT, 'supabase', 'functions', 'exercise-media', 'ids.json');
const OUT_SQL = join(ROOT, 'supabase', 'workoutx_ids.sql');

const STOP = new Set(['the', 'a', 'an', 'to', 'and', 'of', 'with', 'using', 'on', 'in', 'for']);

const ALIASES = {
  'box squat to a chair': 'box squat',
  'seated hip abduction machine': 'hip abduction machine',
  'seated hip adduction machine': 'hip adduction machine',
  'assisted pull-up': 'assisted pull up',
  'lat pulldown': 'lat pull down',
};

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function loadCatalogue() {
  const body = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
  const rows = Array.isArray(body.exercises) ? body.exercises : [];
  return rows
    .map((item) => ({
      slug: String(item.slug ?? '').trim(),
      name: String(item.name ?? '').trim(),
      equipment: String(item.equipment ?? '').trim(),
    }))
    .filter((item) => item.slug && item.name);
}

function norm(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  return new Set(norm(value).split(' ').filter((part) => part.length > 1 && !STOP.has(part)));
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

async function search(key, name) {
  const url = new URL('/exercises', API);
  url.searchParams.set('name', name);
  url.searchParams.set('model', 'female');
  url.searchParams.set('limit', '5');
  const response = await fetch(url, { headers: { 'X-WorkoutX-Key': key } });
  if (response.status === 403) {
    const fallback = new URL('/exercises', API);
    fallback.searchParams.set('name', name);
    fallback.searchParams.set('limit', '5');
    const retry = await fetch(fallback, { headers: { 'X-WorkoutX-Key': key } });
    if (!retry.ok) {
      throw new Error(`search failed ${retry.status}`);
    }
    return pickResults(await retry.json());
  }
  if (response.status === 401) {
    throw new Error(
      'WorkoutX rejected the key (401).\n' +
        'Set a live key in this terminal only:\n' +
        '  $env:WORKOUTX_API_KEY="wx_..."\n' +
        'Do not paste the key into chat, .env, or the app.'
    );
  }
  if (!response.ok) {
    throw new Error(`search failed ${response.status}`);
  }
  return pickResults(await response.json());
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
  const oursNorm = norm(ours.name);
  const aliasNorm = ALIASES[oursNorm] ? norm(ALIASES[oursNorm]) : '';
  const theirsNorm = norm(theirsName);
  const exact = theirsNorm === oursNorm || (aliasNorm && theirsNorm === aliasNorm);
  const similar = jaccard(ours.name, theirsName);
  let status = 'unmatched';
  let reason = 'name too far';
  if (exact && fit === 'exact') {
    status = 'confident';
    reason = 'exact name and equipment';
  } else if (exact && fit === 'soft') {
    status = 'doubtful';
    reason = 'exact name, equipment differs';
  } else if (exact) {
    status = 'doubtful';
    reason = 'exact name, equipment mismatch';
  } else if (similar >= 0.8 && fit === 'exact') {
    status = 'doubtful';
    reason = `close name (${similar.toFixed(2)}), same equipment`;
  } else if (similar >= 0.7 && fit !== 'no') {
    status = 'doubtful';
    reason = `close name (${similar.toFixed(2)})`;
  } else if (similar >= 0.5) {
    reason = `possible (${similar.toFixed(2)})`;
  }
  return { status, reason, similar, fit, theirsEquip };
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
      return b.similar - a.similar;
    });
  return ranked;
}

function writeJson(matches) {
  const body = {
    _format_version: 1,
    _loader_notes: [
      'WorkoutX v2 female-model ids from scripts/match-workoutx.mjs. Confident matches only. Doubtful and unmatched stay in scripts/workoutx-matches.csv for review. Never put the API key here. Store ids, never media URLs.',
    ],
    matches: matches.map((row) => ({
      slug: row.slug,
      workoutx_id: row.workoutx_id,
      workoutx_name: row.workoutx_name,
      confidence: 'high',
    })),
  };
  const text = `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(OUT_JSON, text);
  mkdirSync(dirname(OUT_FN), { recursive: true });
  writeFileSync(OUT_FN, text);
}

function writeSql(matches) {
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
  writeFileSync(OUT_SQL, lines.join('\n'));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const key = (process.env.WORKOUTX_API_KEY ?? '').trim().replace(/^['"]|['"]$/g, '');
  const catalogue = loadCatalogue();

  if (dryRun) {
    console.log(`${catalogue.length} exercises in the strength catalogue:`);
    for (const item of catalogue) console.log(`  ${item.slug}\t${item.name}\t${item.equipment}`);
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

  const rows = [];
  for (const item of catalogue) {
    const results = await search(key, item.name);
    const ranked = rank(item, results);
    const best = ranked[0] ?? null;
    const alts = ranked.slice(1, 3);
    rows.push({
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
    });
  }

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
  writeFileSync(OUT_CSV, `${csv}\n`);

  const confident = rows.filter((row) => row.status === 'confident' && row.workoutx_id);
  writeJson(confident);
  writeSql(confident);

  const doubtful = rows.filter((row) => row.status === 'doubtful');
  const unmatched = rows.filter((row) => row.status === 'unmatched');

  console.log(`Catalogue: ${rows.length}`);
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
