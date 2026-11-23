/**
 * Propose MuscleWiki matches for every exercise in the library
 * (supabase/exercises.sql, stretches.sql, content_routines_1.sql).
 * One GET /search call per unmatched exercise. Skips ids already approved.
 *
 * The API key is read from the environment only. Never put it in the app,
 * .env, or this file.
 *
 *   $env:MUSCLEWIKI_API_KEY="mw_..."
 *   node scripts/match-musclewiki.mjs
 *
 * On Windows, Node needs the system CA store (same as Expo in this repo).
 * The script turns that on itself. Do not disable TLS.
 *
 * Writes scripts/musclewiki-matches.csv for review. Fill approved_id, then
 * run scripts/apply-musclewiki-ids.mjs.
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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
const API = 'https://api.musclewiki.com';
const MAX_CALLS = 250;
const OUT = join(ROOT, 'scripts', 'musclewiki-matches.csv');
const APPROVED_SQL = join(ROOT, 'supabase', 'musclewiki_ids.sql');
const EXERCISE_SQL = [
  join(ROOT, 'supabase', 'exercises.sql'),
  join(ROOT, 'supabase', 'stretches.sql'),
  join(ROOT, 'supabase', 'content_routines_1.sql'),
];
const MUSCLE_NAMES = 'glutes|quads|hamstrings|adductors|calves|chest|back|shoulders|biceps|triceps|core';

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

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
      rows.push({ slug: match[1], name: match[2].replace(/''/g, "'") });
    }
    idx += needle.length;
  }
  return rows;
}

function loadCatalogue() {
  const bySlug = new Map();
  for (const file of EXERCISE_SQL) {
    try {
      for (const row of parseSqlExerciseInserts(readFileSync(file, 'utf8'))) {
        if (row.slug && row.name && !bySlug.has(row.slug)) bySlug.set(row.slug, row.name);
      }
    } catch {
      /* Missing SQL file is fine. */
    }
  }
  return bySlug;
}

function loadApprovedIds() {
  const approved = new Map();
  try {
    const sql = readFileSync(APPROVED_SQL, 'utf8');
    const re = /musclewiki_id = (\d+) where id = '([a-z0-9-]+)'/g;
    let match;
    while ((match = re.exec(sql))) {
      approved.set(match[2], match[1]);
    }
  } catch {
    /* Missing file is fine. */
  }
  try {
    const csv = readFileSync(OUT, 'utf8');
    for (const line of csv.split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const cells = [];
      let cell = '';
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
          if (char === '"' && line[i + 1] === '"') {
            cell += '"';
            i += 1;
          } else if (char === '"') quoted = false;
          else cell += char;
        } else if (char === '"') quoted = true;
        else if (char === ',') {
          cells.push(cell);
          cell = '';
        } else cell += char;
      }
      cells.push(cell);
      const slug = cells[0];
      const approvedId = (cells[8] ?? '').trim();
      if (slug && approvedId) approved.set(slug, approvedId);
    }
  } catch {
    /* Missing CSV is fine. */
  }
  return approved;
}

function pickResults(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.exercises)) return body.exercises;
  return [];
}

async function search(key, name) {
  const url = new URL('/search', API);
  url.searchParams.set('q', name);
  url.searchParams.set('gender', 'female');
  url.searchParams.set('limit', '3');
  const response = await fetch(url, { headers: { 'X-API-Key': key } });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 403 && /invalid or expired api key/i.test(detail)) {
      throw new Error(
        'MuscleWiki rejected the key (403 Invalid or expired API key).\n' +
          'Create a new key at https://api.musclewiki.com and set it in this terminal only:\n' +
          '  $env:MUSCLEWIKI_API_KEY="mw_..."\n' +
          'A free BASIC key only works in their Playground. Direct calls need TESTING or higher.\n' +
          'Do not paste the key into chat, .env, or the app.'
      );
    }
    throw new Error(`search "${name}" failed ${response.status}: ${detail.slice(0, 200)}`);
  }
  return pickResults(await response.json()).slice(0, 3).map((item) => ({
    id: item.id ?? '',
    name: item.name ?? '',
  }));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const key = (process.env.MUSCLEWIKI_API_KEY ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!dryRun && !key) {
    console.error(
      'Set MUSCLEWIKI_API_KEY in this terminal only, then re-run.\n' +
        'Do not add it to .env or the app. It belongs in the Supabase secret later.'
    );
    process.exit(1);
  }
  if (!dryRun && !key.startsWith('mw_')) {
    console.error(
      'MUSCLEWIKI_API_KEY should start with mw_. Copy a fresh key from the MuscleWiki dashboard.\n' +
        'Do not paste the key into chat.'
    );
    process.exit(1);
  }

  const names = loadCatalogue();
  const approved = loadApprovedIds();
  const ids = [...names.keys()].sort();
  const toSearch = ids.filter((id) => !approved.has(id));
  if (toSearch.length > MAX_CALLS) {
    console.error(`Would make ${toSearch.length} calls; cap is ${MAX_CALLS}.`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`${ids.length} exercises in the library, ${toSearch.length} without an approved id:`);
    for (const id of toSearch) console.log(`  ${id}\t${names.get(id)}`);
    return;
  }

  console.log(
    `Library: ${ids.length}. Already approved: ${approved.size}. Searching ${toSearch.length}.`
  );
  const rows = [
    [
      'our_id',
      'our_name',
      'mw_id_1',
      'mw_name_1',
      'mw_id_2',
      'mw_name_2',
      'mw_id_3',
      'mw_name_3',
      'approved_id',
    ].join(','),
  ];

  let calls = 0;
  for (const id of ids) {
    const name = names.get(id);
    const kept = approved.get(id);
    if (kept) {
      rows.push([id, name, '', '', '', '', '', '', kept].map(csvCell).join(','));
      continue;
    }
    const hits = await search(key, name);
    calls += 1;
    rows.push(
      [
        id,
        name,
        hits[0]?.id ?? '',
        hits[0]?.name ?? '',
        hits[1]?.id ?? '',
        hits[1]?.name ?? '',
        hits[2]?.id ?? '',
        hits[2]?.name ?? '',
        '',
      ]
        .map(csvCell)
        .join(',')
    );
    process.stdout.write(`  ${calls}/${toSearch.length} ${name}\n`);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  writeFileSync(OUT, `${rows.join('\n')}\n`);
  console.log(`Wrote ${OUT}`);
  console.log(`${calls} API calls (limit 500). Fill approved_id, then run apply-musclewiki-ids.mjs.`);
}

function run() {
  main().catch((error) => {
    const cause = error?.cause;
    if (cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      console.error(
        'TLS still failed. In this terminal run:\n' +
          '  $env:NODE_OPTIONS="--use-system-ca"\n' +
          '  node scripts/match-musclewiki.mjs'
      );
    }
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
