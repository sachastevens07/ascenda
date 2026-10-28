/**
 * After you fill approved_id in scripts/musclewiki-matches.csv, this writes
 * supabase/musclewiki_ids.sql so you can paste it into the SQL editor.
 * It only sets musclewiki_id. It does not write video URLs or call MuscleWiki.
 *
 *   node scripts/apply-musclewiki-ids.mjs
 *   node scripts/apply-musclewiki-ids.mjs --auto-exact
 *
 * --auto-exact fills approved_id where our name matches a MuscleWiki name
 * (same words, ignoring order, hyphens and a trailing s). It does not guess
 * the rest. You can still edit the CSV and run again.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV = join(ROOT, 'scripts', 'musclewiki-matches.csv');
const OUT = join(ROOT, 'supabase', 'musclewiki_ids.sql');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function sqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordKey(name) {
  return normalize(name).split(' ').filter(Boolean).sort().join(' ');
}

function isExactMatch(ourName, mwName) {
  if (!ourName || !mwName) return false;
  const ours = normalize(ourName);
  const theirs = normalize(mwName);
  if (ours === theirs) return true;
  if (wordKey(ourName) === wordKey(mwName)) return true;
  if (ours.replace(/s$/, '') === theirs.replace(/s$/, '')) return true;
  return false;
}

function autoExactId(row) {
  const ourName = row[1];
  const candidates = [
    [row[2], row[3]],
    [row[4], row[5]],
    [row[6], row[7]],
  ];
  const hits = candidates.filter(([id, name]) => id && isExactMatch(ourName, name));
  return hits[0]?.[0] ?? '';
}

const autoExact = process.argv.includes('--auto-exact');
const rows = parseCsv(readFileSync(CSV, 'utf8'));
const header = rows.shift();
if (!header || header[0] !== 'our_id' || header[8] !== 'approved_id') {
  console.error('Unexpected CSV header. Run match-musclewiki.mjs first.');
  process.exit(1);
}

if (autoExact) {
  let filled = 0;
  for (const row of rows) {
    if ((row[8] ?? '').trim()) continue;
    const id = autoExactId(row);
    if (!id) continue;
    row[8] = String(id);
    filled += 1;
  }
  writeFileSync(
    CSV,
    [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
  );
  console.log(`Filled ${filled} exact name matches in ${CSV}`);
}

const approved = [];
const skipped = [];
for (const row of rows) {
  const ourId = row[0];
  const approvedId = (row[8] ?? '').trim();
  if (!ourId) continue;
  if (!approvedId) {
    skipped.push(`${ourId} (${row[1]})`);
    continue;
  }
  const id = Number(approvedId);
  if (!Number.isInteger(id) || id <= 0) {
    console.error(`Bad approved_id for ${ourId}: ${approvedId}`);
    process.exit(1);
  }
  approved.push({ ourId, id, name: row[1] });
}

if (!approved.length) {
  console.error(
    'No approved_id values yet. Fill that column, or run:\n' +
      '  node scripts/apply-musclewiki-ids.mjs --auto-exact'
  );
  process.exit(1);
}

const updates = approved
  .map(
    ({ ourId, id }) =>
      `update public.exercises set musclewiki_id = ${id} where id = ${sqlString(ourId)};`
  )
  .join('\n');

writeFileSync(
  OUT,
  `-- Approved MuscleWiki ids from scripts/musclewiki-matches.csv.
-- Paste into Supabase > SQL Editor after supabase/musclewiki.sql.
-- Safe to run again: it only sets musclewiki_id on these rows.
-- Never deletes sessions, sets, or exercise rows.

${updates}
`
);

console.log(`Wrote ${approved.length} updates to ${OUT}`);
if (skipped.length) {
  console.log(`${skipped.length} left blank (no exact name match). Edit approved_id and run again.`);
}
