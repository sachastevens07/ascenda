/**
 * Propose MuscleWiki matches for every exercise in supabase/exercises.sql.
 * One GET /search call per exercise. Stops before 500 API calls.
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
const MAX_CALLS = 400;
const OUT = join(ROOT, 'scripts', 'musclewiki-matches.csv');

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseExerciseNames(sql) {
  const names = new Map();
  const pattern = /^\('([a-z0-9-]+)', '((?:[^']|'')*)',/gm;
  let match;
  while ((match = pattern.exec(sql))) {
    names.set(match[1], match[2].replace(/''/g, "'"));
  }
  return names;
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

  const names = parseExerciseNames(readFileSync(join(ROOT, 'supabase', 'exercises.sql'), 'utf8'));
  const ids = [...names.keys()].sort();
  if (ids.length > MAX_CALLS) {
    console.error(`Would make ${ids.length} calls; cap is ${MAX_CALLS}.`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`${ids.length} exercises in the library:`);
    for (const id of ids) console.log(`  ${id}\t${names.get(id)}`);
    return;
  }

  console.log(`Searching MuscleWiki for ${ids.length} library exercises…`);
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
    process.stdout.write(`  ${calls}/${ids.length} ${name}\n`);
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
