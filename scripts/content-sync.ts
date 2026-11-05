/**
 * Upsert /content into Supabase by slug.
 * Never deletes rows. Never reads or writes sessions, sets, enrolments or profiles.
 * --dry-run prints the plan and writes nothing.
 *
 * Onboarding, microcopy and content/ai are not loaded here.
 * Tables that do not exist yet are skipped. Later roadmap steps extend this file.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CONTENT = join(ROOT, 'content');
const DRY_RUN = process.argv.includes('--dry-run');

const EXERCISE_EQUIPMENT = new Set([
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'kettlebell',
  'band',
  'bodyweight',
]);
const ROUTINE_GOALS = new Set(['strength', 'glutes_legs', 'general', 'confidence']);
const LEARN_CATEGORIES = new Set([
  'getting_started',
  'gym_confidence',
  'technique',
  'programmes',
  'recovery',
  'fuelling',
  'mindset',
  'myths',
]);

type Json = Record<string, unknown>;

type ExerciseRow = {
  id: string;
  name: string;
  equipment: string;
  zone?: number | null;
};

type RoutineRow = {
  id: string;
  slug: string;
  name: string;
  goal?: string;
};

function loadEnv(file: string): void {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

function readJson(relativePath: string): Json {
  return JSON.parse(readFileSync(join(CONTENT, relativePath), 'utf8')) as Json;
}

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? (value as Json[]) : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(invalid url)';
  }
}

async function probe(client: SupabaseClient, table: string, columns: string): Promise<string | null> {
  const { error } = await client.from(table).select(columns).limit(1);
  return error ? error.message : null;
}

async function fetchAll<T extends Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  columns: string
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(columns).range(from, from + 999);
    if (error) return { rows, error: error.message };
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) return { rows, error: null };
  }
}

function line(message = ''): void {
  console.log(message);
}

async function main(): Promise<void> {
  loadEnv(join(ROOT, '.env'));
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (!DRY_RUN) {
    line('Refusing to write. Run: npm run content:sync -- --dry-run');
    line('A live sync also needs a service role key, which is not in .env. Nothing was written.');
    process.exitCode = 1;
    return;
  }
  if (!url || !key) {
    line('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
    process.exitCode = 1;
    return;
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  line('content:sync --dry-run');
  line(`Remote: ${hostOf(url)}`);
  line('Key: publishable. This run only reads. It does not write.');
  line('User tables (sessions, sets, enrolments, profiles) are not touched.');
  line();

  line('Not loaded (by design)');
  line('  content/onboarding: bundled in the app');
  line('  content/microcopy: bundled in the app');
  line('  content/ai: Edge Functions, not the app database');
  line();

  line('No table in the current schema, skipped');
  const deferred = [
    ['content/cardio', 'cardio sessions (W2)'],
    ['content/food', 'recipes and collections (F2)'],
    ['content/machine-guides', 'machine guides (W4)'],
    ['content/warmups-cooldowns', 'warm-up and cool-down blocks (G2)'],
    ['content/single-sessions', 'single sessions (X3)'],
    ['content/exercise-guides', 'first-time guides (loaded with N2 once a column or table exists)'],
    ['content/achievements', 'achievement definitions (H6 is still computed in the app)'],
  ];
  for (const [folder, why] of deferred) line(`  ${folder}: ${why}`);
  line();

  await reportExercises(client);
  await reportRoutines(client);
  await reportQuotes(client);
  await reportLearn(client);
  await reportChallenges(client);

  line();
  line('Nothing was written.');
}

async function reportExercises(client: SupabaseClient): Promise<void> {
  line('exercises  ←  content/exercises/strength-catalogue.json');
  const catalogue = asArray(readJson('exercises/strength-catalogue.json').exercises);
  const zoneError = await probe(client, 'exercises', 'id, name, equipment, zone');
  const columns = zoneError && /zone/i.test(zoneError) ? 'id, name, equipment' : 'id, name, equipment, zone';
  const remote = await fetchAll<ExerciseRow>(client, 'exercises', columns);
  if (remote.error || remote.rows.length === 0) {
    line(`  Content rows: ${catalogue.length}`);
    if (remote.error) line(`  Remote read failed: ${remote.error}`);
    else {
      line('  Remote returned 0 rows and no error.');
      line('  Select is granted to signed-in users only, so this key cannot see the library. Those 0 rows do not mean the table is empty.');
    }
    line('  No insert or update is planned. A real diff needs a signed-in session or a service role key.');
    line('  When that read works: match slug to id, else match name and keep the existing id so session history stays linked.');
    line('  New exercises stay blocked until primary_muscle, 3 cues and location_hint can be filled from the guides.');
    line();
    return;
  }

  const byId = new Map(remote.rows.map((row) => [row.id, row]));
  const byName = new Map<string, ExerciseRow[]>();
  for (const row of remote.rows) {
    const key = norm(row.name);
    const list = byName.get(key) ?? [];
    list.push(row);
    byName.set(key, list);
  }

  let matchedSlug = 0;
  let matchedName = 0;
  let unchanged = 0;
  let wouldUpdate = 0;
  let wouldInsert = 0;
  const relinks: string[] = [];
  const badEquipment: string[] = [];
  const insertSlugs: string[] = [];

  for (const item of catalogue) {
    const slug = text(item.slug);
    const name = text(item.name);
    const equipment = text(item.equipment);
    const bySlug = byId.get(slug);
    const named = byName.get(norm(name)) ?? [];
    const row = bySlug ?? named[0];
    if (!row) {
      wouldInsert += 1;
      if (insertSlugs.length < 12) insertSlugs.push(slug);
      continue;
    }
    if (bySlug) matchedSlug += 1;
    else {
      matchedName += 1;
      relinks.push(`${slug} → keep id ${row.id} (matched by name "${row.name}")`);
    }
    const equipmentOk = EXERCISE_EQUIPMENT.has(equipment);
    if (!equipmentOk) badEquipment.push(`${slug}: ${equipment || '(blank)'}`);
    const nameChanged = row.name !== name;
    const equipmentChanged = equipmentOk && row.equipment !== equipment;
    const zoneChanged =
      'zone' in row &&
      typeof item.zone === 'number' &&
      row.zone !== item.zone;
    if (nameChanged || equipmentChanged || zoneChanged) wouldUpdate += 1;
    else unchanged += 1;
  }

  line(`  Content rows: ${catalogue.length}`);
  line(`  Remote rows: ${remote.rows.length}`);
  line(`  Matched by slug (id): ${matchedSlug}`);
  line(`  Matched by name, existing id kept: ${matchedName}`);
  line(`  Would update name, equipment or zone: ${wouldUpdate}`);
  line(`  Unchanged: ${unchanged}`);
  line(`  Would insert: ${wouldInsert}`);
  line('  Inserts blocked. exercises.name is not enough: primary_muscle, exactly 3 cues and location_hint are required, and those live in the exercise guides.');
  if (insertSlugs.length > 0) {
    line(`  New slugs (first ${insertSlugs.length}): ${insertSlugs.join(', ')}${wouldInsert > insertSlugs.length ? '…' : ''}`);
  }
  if (relinks.length > 0) {
    line('  History stays on the existing id:');
    for (const item of relinks) line(`    ${item}`);
  }
  if (badEquipment.length > 0) {
    line('  Equipment not in the current check, so that field would be left alone:');
    for (const item of badEquipment) line(`    ${item}`);
  }
  line('  Not written from the catalogue: pattern, alternatives, media. MuscleWiki columns are left as they are.');
  line();
}

async function reportRoutines(client: SupabaseClient): Promise<void> {
  line('routines  ←  content/routines/*.json');
  const files = readdirSync(join(CONTENT, 'routines')).filter((name) => name.endsWith('.json'));
  const content = files.map((file) => {
    const body = readJson(join('routines', file)).routine as Json;
    return {
      slug: text(body.slug),
      name: text(body.name),
      goal: text(body.goal),
    };
  });
  const remote = await fetchAll<RoutineRow>(client, 'routines', 'id, slug, name, goal');
  const activeProbe = await probe(client, 'routines', 'is_active');
  const hasActive = activeProbe === null;
  if (remote.error || remote.rows.length === 0) {
    line(`  Content routines: ${content.length}`);
    if (remote.error) line(`  Remote read failed: ${remote.error}`);
    else {
      line('  Remote returned 0 rows and no error.');
      line('  Select is granted to signed-in users only, so this key cannot see routines. Those 0 rows do not mean the table is empty.');
    }
    line(`  is_active column: ${hasActive ? 'present' : `not confirmed (${activeProbe ?? 'no rows to check'})`}`);
    line('  No routine would be marked inactive, and no routine row would be upserted, from this read.');
    line(`  ${content.filter((item) => !ROUTINE_GOALS.has(item.goal)).length} of ${content.length} content goals are outside the current check (${[...ROUTINE_GOALS].join(', ')}).`);
    line('  Week, phase, block and weekly_schedule data is not loaded. Those columns are W1.');
    line();
    return;
  }
  const contentSlugs = new Set(content.map((item) => item.slug));
  const stale = remote.rows.filter((row) => !contentSlugs.has(row.slug) && !contentSlugs.has(row.id));
  const goalBlocked = content.filter((item) => !ROUTINE_GOALS.has(item.goal));

  line(`  Content routines: ${content.length}`);
  line(`  Remote routines: ${remote.rows.length}`);
  line(`  is_active column: ${hasActive ? 'present' : 'missing'}`);
  if (hasActive) {
    line(`  Would set is_active = false on ${stale.length} routine(s) whose slug is not in /content. No delete.`);
  } else {
    line(`  Would set is_active = false on ${stale.length} routine(s) not in /content, but the column does not exist.`);
    line('  No migration is included. Say if you want one. Nothing is deleted.');
  }
  if (stale.length > 0) {
    line(`  Not in /content: ${stale.map((row) => row.slug || row.id).join(', ')}`);
  }
  line(`  Row upsert skipped for ${goalBlocked.length} of ${content.length}. Content goals are not in the current check (${[...ROUTINE_GOALS].join(', ')}).`);
  line('  Week, phase, block and weekly_schedule data is not loaded. Those columns are W1.');
  line();
}

async function reportQuotes(client: SupabaseClient): Promise<void> {
  line('quotes  ←  content/quotes/quotes.json');
  const quotes = asArray(readJson('quotes/quotes.json').quotes);
  const error = await probe(client, 'quotes', 'id, text, attribution, is_active');
  line(`  Content quotes: ${quotes.length}`);
  if (error) {
    line(`  Table not usable: ${error}`);
    line('  Skipped.');
    line();
    return;
  }
  const sample = quotes[0];
  const idKind = sample ? typeof sample.id : 'none';
  line(`  Content id type: ${idKind}. The live seed uses text ids such as q-001, and quotes have no slug.`);
  line('  Upserting these ids would add a second list beside the current seed. Skipped until a later step agrees the id.');
  line();
}

async function reportLearn(client: SupabaseClient): Promise<void> {
  line('learn_articles  ←  content/learn/articles.json');
  const file = readJson('learn/articles.json');
  const articles = asArray(file.articles);
  const categories = asArray(file.categories).map((item) => text(item.id));
  const error = await probe(client, 'learn_articles', 'id, slug, title, category');
  line(`  Content articles: ${articles.length}`);
  if (error) {
    line(`  Table not usable: ${error}`);
    line('  Skipped. The app still uses the bundled 16 articles.');
    line();
    return;
  }
  const unknown = [...new Set(articles.map((item) => text(item.category)))].filter(
    (category) => category && !LEARN_CATEGORIES.has(category)
  );
  line(`  Content categories: ${categories.join(', ')}`);
  if (unknown.length > 0) {
    line(`  Upsert skipped. These categories are not in the current check: ${unknown.join(', ')}.`);
  } else {
    line(`  Would upsert ${articles.length} articles by slug. Bodies stay as written in /content.`);
  }
  line();
}

async function reportChallenges(client: SupabaseClient): Promise<void> {
  line('challenges  ←  content/challenges/challenges.json');
  const challenges = asArray(readJson('challenges/challenges.json').challenges);
  const error = await probe(client, 'challenges', 'id, name, start_date, end_date');
  line(`  Content challenges: ${challenges.length}`);
  if (error) {
    line(`  Table not usable: ${error}`);
    line('  Skipped.');
    line();
    return;
  }
  line('  Upsert skipped. The live table requires start_date and end_date. /content has neither: the window is stored on the join (H8).');
  line('  Existing challenge rows are left as they are. No countdown fields are added.');
  line();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
