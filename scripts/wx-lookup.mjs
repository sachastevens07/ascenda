#!/usr/bin/env node
/**
 * One-off WorkoutX lookup for the exercises that still have no demo
 * (23 Nov 2026). Searches several wordings per exercise and writes every
 * candidate (id, name, equipment, model) to scripts/wx-lookup-results.txt
 * for Claude to review. Changes nothing in the app or the database.
 *
 * Run in the Cursor terminal (PowerShell):
 *   $env:WORKOUTX_API_KEY="wx_..."
 *   node scripts/wx-lookup.mjs
 *
 * The key lives only in that terminal. Never paste it into chat or a file.
 */
import { writeFileSync } from 'node:fs';

const API = 'https://api.workoutxapp.com/v2';

const LOOKUPS = {
  'ab-crunch-machine': ['ab crunch machine', 'seated crunch', 'crunch machine', 'lever crunch', 'abdominal crunch'],
  'assisted-dip': ['assisted dip', 'assisted triceps dip', 'assisted chest dip', 'dip machine'],
  'band-row': ['band row', 'resistance band row', 'band seated row', 'band bent over row'],
  'banded-clamshell': ['clamshell', 'clam', 'band clam'],
  'banded-glute-bridge': ['band glute bridge', 'band hip lift', 'banded bridge', 'band hip thrust'],
  'banded-hamstring-curl': ['band leg curl', 'band hamstring curl', 'resistance band leg curl'],
  'banded-lateral-walk': ['lateral walk', 'monster walk', 'band walk', 'side walk'],
  'bear-plank': ['bear plank', 'bear hold', 'bear crawl'],
  'cable-hammer-curl': ['cable hammer curl', 'rope hammer curl', 'cable rope curl'],
  'cable-overhead-triceps-extension': ['cable overhead triceps', 'overhead triceps extension', 'rope overhead', 'cable triceps extension'],
  'cable-squat': ['cable squat', 'cable goblet squat'],
  'cable-woodchop': ['woodchop', 'wood chop', 'cable chop', 'cable rotation'],
  'close-grip-bench-press': ['close grip bench press'],
  'close-grip-lat-pulldown': ['close grip lat pulldown', 'close grip pulldown', 'v bar pulldown', 'parallel grip pulldown'],
  'close-grip-push-up': ['close grip push up', 'diamond push up', 'triceps push up'],
  'decline-push-up': ['decline push up'],
  'deficit-reverse-lunge': ['deficit reverse lunge', 'deficit lunge', 'step reverse lunge'],
  'donkey-kick': ['donkey kick', 'quadruped hip extension', 'kickback bodyweight'],
  'dumbbell-shrug': ['dumbbell shrug'],
  'dumbbell-sumo-squat': ['dumbbell sumo squat', 'sumo squat', 'plie squat', 'goblet sumo'],
  'frog-pump': ['frog pump', 'frog glute bridge', 'frog bridge'],
  'glute-kickback-machine': ['glute kickback machine', 'hip extension machine', 'lever kickback', 'machine kickback'],
  'incline-machine-chest-press': ['incline chest press', 'incline machine press', 'lever incline'],
  'kettlebell-floor-press': ['kettlebell floor press'],
  'kettlebell-overhead-press': ['kettlebell overhead press', 'kettlebell press', 'kettlebell military press', 'kettlebell shoulder press'],
  'kettlebell-romanian-deadlift': ['kettlebell romanian deadlift', 'kettlebell rdl', 'kettlebell stiff leg'],
  'pike-push-up': ['pike push up', 'pike press'],
  'side-lying-adduction': ['side lying adduction', 'side lying hip adduction', 'inner thigh', 'lying adduction'],
  'single-arm-cable-chest-press': ['single arm cable chest press', 'one arm cable press', 'cable chest press'],
  'single-leg-box-squat': ['single leg box squat', 'pistol squat', 'single leg squat'],
  'single-leg-calf-raise': ['single leg calf raise', 'one leg calf raise'],
  'single-leg-hip-thrust': ['single leg hip thrust', 'single leg glute bridge', 'one leg hip thrust'],
  'sliding-leg-curl': ['sliding leg curl', 'slider leg curl', 'stability ball leg curl', 'ball leg curl'],
  'standing-cable-leg-curl': ['standing cable leg curl', 'cable leg curl', 'standing leg curl'],
  't-bar-row': ['t bar row', 't-bar row', 'landmine row'],
};

// Second pass (23 Nov 2026): wall sit and the common exercises the app doesn't have yet.
// Run with:  node scripts/wx-lookup.mjs --new
const NEW_LOOKUPS = {
  'wall-sit': ['wall sit', 'wall squat', 'wall chair'],
  'smith-machine-hip-thrust': ['smith hip thrust', 'smith machine hip thrust', 'smith glute bridge'],
  'smith-machine-split-squat': ['smith split squat', 'smith lunge', 'smith machine lunge', 'smith bulgarian'],
  'smith-machine-romanian-deadlift': ['smith romanian deadlift', 'smith deadlift', 'smith stiff leg', 'smith rdl'],
  'crunch': ['crunch', 'floor crunch'],
  'bicycle-crunch': ['bicycle crunch', 'bicycle'],
  'russian-twist': ['russian twist', 'seated twist', 'oblique twist'],
  'ab-wheel-rollout': ['ab wheel', 'ab roller', 'rollout', 'wheel rollout'],
  'cable-upright-row': ['cable upright row', 'upright row'],
  'dumbbell-upright-row': ['dumbbell upright row'],
  'seated-dumbbell-shoulder-press': ['seated dumbbell shoulder press', 'seated dumbbell press', 'dumbbell seated overhead press'],
  'standing-dumbbell-shoulder-press': ['standing dumbbell shoulder press', 'dumbbell standing overhead press', 'dumbbell standing press'],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function rowsOf(body) {
  const list = Array.isArray(body) ? body : body?.results ?? body?.data ?? body?.exercises ?? [];
  return Array.isArray(list) ? list : [];
}

async function search(key, name) {
  const url = new URL(`${API}/exercises`);
  url.searchParams.set('name', name);
  url.searchParams.set('limit', '10');
  for (let attempt = 1; attempt <= 6; attempt++) {
    const response = await fetch(url, { headers: { 'X-WorkoutX-Key': key } });
    if (response.status === 401) throw new Error('WorkoutX rejected the key (401). Set it again in this terminal.');
    if (response.status === 429) {
      const wait = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
      const ms = Number.isFinite(wait) && wait > 0 ? wait * 1000 : 20000;
      console.log(`  Rate limited, waiting ${Math.round(ms / 1000)}s...`);
      await sleep(ms);
      continue;
    }
    if (!response.ok) return [];
    return rowsOf(await response.json());
  }
  return [];
}

function describe(row) {
  const id = row.id ?? row.exerciseId ?? row._id ?? '?';
  const name = row.name ?? row.title ?? '?';
  const equipment = row.equipment ?? row.equipments ?? '';
  const model = row.model ?? row.gender ?? '';
  const female = row.counterpartId ?? row.counterpart_id ?? '';
  return `${id} | ${name} | ${Array.isArray(equipment) ? equipment.join('/') : equipment} | ${model}${female ? ` (female version ${female})` : ''}`;
}

async function main() {
  const key = (process.env.WORKOUTX_API_KEY ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!key.startsWith('wx_')) {
    console.error('Set the key in this terminal first:  $env:WORKOUTX_API_KEY="wx_..."');
    process.exit(1);
  }
  const lines = [];
  const table = process.argv.includes('--new') ? NEW_LOOKUPS : LOOKUPS;
  const slugs = Object.keys(table);
  for (const [index, slug] of slugs.entries()) {
    console.log(`${index + 1}/${slugs.length} ${slug}`);
    const seen = new Map();
    for (const term of table[slug]) {
      for (const row of await search(key, term)) {
        const text = describe(row);
        if (!seen.has(text)) seen.set(text, term);
      }
      await sleep(1200);
    }
    lines.push(`## ${slug}`);
    if (seen.size === 0) lines.push('(no results)');
    for (const [text, term] of seen) lines.push(`${text}   [searched: ${term}]`);
    lines.push('');
  }
  writeFileSync('scripts/wx-lookup-results.txt', lines.join('\n'));
  console.log('\nDone. Send Claude the file scripts/wx-lookup-results.txt');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
