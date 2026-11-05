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
const PRIMARY_MUSCLES = new Set([
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'core',
]);
const ROUTINE_DIFFICULTIES = new Set(['beginner', 'intermediate', 'experienced']);
const LEARN_CATEGORY_MAP: Record<string, string> = {
  getting_started: 'getting_started',
  gym_confidence: 'gym_confidence',
  technique: 'technique',
  programmes: 'programmes',
  how_programmes_work: 'programmes',
  recovery: 'recovery',
  recovery_and_sleep: 'recovery',
  fuelling: 'fuelling',
  mindset: 'mindset',
  myths: 'myths',
};
const ROUTINE_GOAL_MAP: Record<string, string> = {
  strength: 'strength',
  glutes_legs: 'glutes_legs',
  general: 'general',
  confidence: 'confidence',
  gym_confidence: 'confidence',
  build_strength: 'strength',
  glutes_and_legs: 'glutes_legs',
  upper_body_strength: 'strength',
  fitness_stamina: 'general',
  strong_for_life: 'general',
  back_to_training: 'confidence',
};

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
  type?: string | null;
};

type ImageRow = { id: string; url: string | null };
type QuoteRow = { id: string; text: string; attribution: string | null; is_active: boolean | null };
type LearnRow = { id: string; slug: string; title: string; category: string };

type Guide = {
  slug: string;
  primary: string | null;
  cues: string[];
  location: string;
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

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function quoteId(sortOrder: number): string {
  return `q-${String(sortOrder).padStart(3, '0')}`;
}

function mapMuscle(raw: string): string | null {
  const n = norm(raw);
  if (PRIMARY_MUSCLES.has(n)) return n;
  if (n.includes('glute')) return 'glutes';
  if (n.includes('quad')) return 'quads';
  if (n.includes('hamstring')) return 'hamstrings';
  if (n.includes('adductor')) return 'adductors';
  if (n.includes('calf')) return 'calves';
  if (n.includes('chest') || n.includes('pec')) return 'chest';
  if (n.includes('back') || n.includes('lat') || n.includes('trap')) return 'back';
  if (n.includes('shoulder') || n.includes('deltoid')) return 'shoulders';
  if (n.includes('bicep')) return 'biceps';
  if (n.includes('tricep')) return 'triceps';
  if (n.includes('core') || n.includes('oblique') || n.includes('ab')) return 'core';
  return null;
}

function mapRoutineGoal(raw: string): string | null {
  return ROUTINE_GOAL_MAP[raw] ?? null;
}

function mapLearnCategory(raw: string): string | null {
  return LEARN_CATEGORY_MAP[raw] ?? null;
}

function mapRoutineEquipment(summary: string, tags: string[]): 'full_gym' | 'dumbbells' | 'home' {
  const blob = `${summary} ${tags.join(' ')}`.toLowerCase();
  if (blob.includes("can't get to the gym") || blob.includes('cannot get to the gym')) return 'home';
  if (/\b(machine|barbell|cable|full gym)\b/.test(blob)) return 'full_gym';
  if (blob.includes('dumbbell')) return 'dumbbells';
  return 'full_gym';
}

function mapDifficulty(level: string): string | null {
  if (ROUTINE_DIFFICULTIES.has(level)) return level;
  if (level === 'advanced') return 'experienced';
  if (level === 'beginner_to_intermediate') return 'beginner';
  return null;
}

function clampMinutes(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function preview(items: string[], total: number): string {
  if (items.length === 0) return '';
  return items.join(', ') + (total > items.length ? '…' : '');
}

async function probe(client: SupabaseClient, table: string, columns: string): Promise<string | null> {
  const { error } = await client.from(table).select(columns).limit(1);
  return error ? error.message : null;
}

async function fetchAll<T extends Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  columns: string
): Promise<{ rows: T[]; error: string | null; hidden: boolean }> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(columns).range(from, from + 999);
    if (error) return { rows, error: error.message, hidden: false };
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) {
      return { rows, error: null, hidden: rows.length === 0 };
    }
  }
}

function line(message = ''): void {
  console.log(message);
}

function hiddenNote(table: string, error: string | null, hidden: boolean): boolean {
  if (error) {
    line(`  Remote read failed: ${error}`);
    return true;
  }
  if (hidden) {
    line(`  Remote returned 0 rows and no error.`);
    line(`  Select on ${table} is granted to signed-in users only, so this key cannot see existing rows.`);
    line('  Those 0 rows do not mean the table is empty. No write is planned from this read.');
    return true;
  }
  return false;
}

function loadGuides(): Map<string, Guide> {
  const files = ['lower-body.json', 'upper-body.json', 'core-and-carries.json'];
  const map = new Map<string, Guide>();
  for (const file of files) {
    const body = readJson(join('exercise-guides', file));
    for (const item of asArray(body.guides)) {
      const slug = text(item.slug);
      const muscles = Array.isArray(item.primary_muscles)
        ? (item.primary_muscles as unknown[]).map((value) => String(value))
        : [];
      const cues = Array.isArray(item.form_cues)
        ? (item.form_cues as unknown[]).map((value) => String(value).trim()).filter(Boolean)
        : [];
      map.set(slug, {
        slug,
        primary: muscles.map((value) => mapMuscle(value)).find((value) => value) ?? null,
        cues: cues.slice(0, 3),
        location: text(item.where_to_find).trim(),
      });
    }
  }
  return map;
}

function canInsertExercise(item: Json, guide: Guide | undefined): boolean {
  const equipment = text(item.equipment);
  return Boolean(
    guide &&
      guide.primary &&
      guide.cues.length === 3 &&
      guide.location &&
      EXERCISE_EQUIPMENT.has(equipment)
  );
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
  line('Upsert by slug. Never delete rows. Old routines not in /content would be set is_active = false.');
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
    ['content/exercise-guides', 'guide copy itself. Cues and location_hint are used to plan new exercise inserts'],
    ['content/achievements', 'achievement definitions (H6 is still computed in the app)'],
  ];
  for (const [folder, why] of deferred) line(`  ${folder}: ${why}`);
  line();

  await reportImages(client);
  await reportExercises(client);
  await reportRoutines(client);
  await reportQuotes(client);
  await reportLearn(client);
  await reportChallenges(client);

  line();
  line('Nothing was written.');
}

async function reportImages(client: SupabaseClient): Promise<void> {
  line('images  ←  content/images/catalogue.json');
  const images = asArray(readJson('images/catalogue.json').images);
  const error = await probe(client, 'images', 'id, url, storage_path, alt_text, licence_source');
  line(`  Content slugs: ${images.length}`);
  if (error) {
    line(`  Table not usable: ${error}`);
    line('  Paste supabase/images_x1.sql first. The app shows placeholders until then.');
    line();
    return;
  }
  const remote = await fetchAll<ImageRow>(client, 'images', 'id, url');
  if (hiddenNote('images', remote.error, remote.hidden)) {
    line(`  Plan when a service role can read: upsert ${images.length} slugs with empty url and licence_source.`);
    line('  Existing url and licence_source are never overwritten. alt_text can update.');
    line();
    return;
  }
  const byId = new Set(remote.rows.map((row) => row.id));
  const missing = images.filter((item) => !byId.has(text(item.slug)));
  const withUrl = remote.rows.filter((row) => row.url).length;
  line(`  Remote rows: ${remote.rows.length}`);
  line(`  Remote rows with a url: ${withUrl}`);
  line(`  Would insert: ${missing.length}`);
  line('  Would update alt_text only. url and licence_source stay as they are.');
  line();
}

async function reportExercises(client: SupabaseClient): Promise<void> {
  line('exercises  ←  content/exercises/strength-catalogue.json');
  const catalogue = asArray(readJson('exercises/strength-catalogue.json').exercises);
  const extra = asArray(readJson('routines/strong-foundations-6-weeks.json').exercise_catalogue);
  const bySlug = new Map<string, Json>();
  for (const item of [...catalogue, ...extra]) {
    const slug = text(item.slug);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, item);
  }
  const items = [...bySlug.values()];
  const guides = loadGuides();
  const zoneError = await probe(client, 'exercises', 'id, name, equipment, zone');
  const columns = zoneError && /zone/i.test(zoneError) ? 'id, name, equipment' : 'id, name, equipment, zone';
  const remote = await fetchAll<ExerciseRow>(client, 'exercises', columns);

  line(`  Content rows: ${items.length} (${catalogue.length} catalogue, plus any extra from routine files)`);
  line(`  Guides keyed by slug: ${guides.size}`);

  if (hiddenNote('exercises', remote.error, remote.hidden)) {
    const ready = items.filter((item) => canInsertExercise(item, guides.get(text(item.slug))));
    const blocked = items.length - ready.length;
    line('  When a service role can read: match slug to id, else match name and keep the existing id so session history stays linked.');
    line(`  New rows ready to insert (guide supplies primary_muscle, 3 cues, location_hint): ${ready.length}`);
    line(`  New rows still blocked (missing guide fields or equipment check): ${blocked}`);
    line('  Not written from the catalogue: pattern, alternatives, media. MuscleWiki columns are left as they are.');
    line();
    return;
  }

  const remoteById = new Map(remote.rows.map((row) => [row.id, row]));
  const remoteByName = new Map<string, ExerciseRow[]>();
  for (const row of remote.rows) {
    const key = norm(row.name);
    const list = remoteByName.get(key) ?? [];
    list.push(row);
    remoteByName.set(key, list);
  }

  let matchedSlug = 0;
  let matchedName = 0;
  let unchanged = 0;
  let wouldUpdate = 0;
  let wouldInsert = 0;
  let insertBlocked = 0;
  const relinks: string[] = [];
  const badEquipment: string[] = [];
  const insertSlugs: string[] = [];
  const blockedSlugs: string[] = [];

  for (const item of items) {
    const slug = text(item.slug);
    const name = text(item.name);
    const equipment = text(item.equipment);
    const row = remoteById.get(slug) ?? (remoteByName.get(norm(name)) ?? [])[0];
    if (!row) {
      if (canInsertExercise(item, guides.get(slug))) {
        wouldInsert += 1;
        if (insertSlugs.length < 12) insertSlugs.push(slug);
      } else {
        insertBlocked += 1;
        if (blockedSlugs.length < 12) blockedSlugs.push(slug);
      }
      continue;
    }
    if (remoteById.has(slug)) matchedSlug += 1;
    else {
      matchedName += 1;
      relinks.push(`${slug} → keep id ${row.id} (matched by name "${row.name}")`);
    }
    const equipmentOk = EXERCISE_EQUIPMENT.has(equipment);
    if (!equipmentOk) badEquipment.push(`${slug}: ${equipment || '(blank)'}`);
    const nameChanged = row.name !== name;
    const equipmentChanged = equipmentOk && row.equipment !== equipment;
    const zoneChanged = 'zone' in row && typeof item.zone === 'number' && row.zone !== item.zone;
    if (nameChanged || equipmentChanged || zoneChanged) wouldUpdate += 1;
    else unchanged += 1;
  }

  line(`  Remote rows: ${remote.rows.length}`);
  line(`  Matched by slug (id): ${matchedSlug}`);
  line(`  Matched by name, existing id kept: ${matchedName}`);
  line(`  Would update name, equipment or zone: ${wouldUpdate}`);
  line(`  Unchanged: ${unchanged}`);
  line(`  Would insert (guide-backed): ${wouldInsert}`);
  line(`  Inserts blocked (need primary_muscle, 3 cues, location_hint): ${insertBlocked}`);
  if (insertSlugs.length > 0) {
    line(`  New slugs (first ${insertSlugs.length}): ${preview(insertSlugs, wouldInsert)}`);
  }
  if (blockedSlugs.length > 0) {
    line(`  Blocked slugs (first ${blockedSlugs.length}): ${preview(blockedSlugs, insertBlocked)}`);
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
  line('routines  ←  content/routines/*.json and content/stretches/stretch-routines.json');
  const files = readdirSync(join(CONTENT, 'routines')).filter((name) => name.endsWith('.json'));
  const strength = files.map((file) => {
    const body = readJson(join('routines', file)).routine as Json;
    const tags = asArray(body.tags).map((item) => text(item)).filter(Boolean);
    const displayTags = asArray(body.display_tags).map((item) => text(item)).filter(Boolean);
    return {
      slug: text(body.slug),
      name: text(body.name),
      goal: text(body.goal),
      mappedGoal: mapRoutineGoal(text(body.goal)),
      difficulty: mapDifficulty(text(body.level)),
      type: text(body.type) === 'stretch' ? 'stretch' : 'strength',
      description: text(body.short_description),
      lengthWeeks: num(body.length_weeks),
      daysPerWeek: num(body.days_per_week),
      sessionMinutes: num(body.session_minutes),
      equipment: mapRoutineEquipment(text(body.equipment_summary), tags),
      cover: text(body.cover_image_slug),
      featured: text(body.equipment_summary).toLowerCase().includes("can't get to the gym") ? false : true,
      tags: (displayTags.length > 0 ? displayTags : tags).slice(0, 2),
    };
  });
  const stretches = asArray(readJson('stretches/stretch-routines.json').stretch_routines).map((body) => ({
    slug: text(body.slug),
    name: text(body.name),
    goal: 'general',
    mappedGoal: 'general',
    difficulty: 'beginner',
    type: 'stretch',
    description: text(body.short_description),
    lengthWeeks: 1,
    daysPerWeek: 1,
    sessionMinutes: clampMinutes(num(body.duration_minutes) ?? 10, 5, 120),
    equipment: 'full_gym' as const,
    cover: text(body.cover_image_slug),
    featured: true,
    tags: asArray(body.display_tags).map((item) => text(item)).filter(Boolean).slice(0, 2),
  }));
  const content = [...strength, ...stretches];
  const unmappedGoals = strength.filter((item) => !item.mappedGoal);
  const badDifficulty = content.filter((item) => !item.difficulty);

  const typeProbe = await probe(client, 'routines', 'type');
  const activeProbe = await probe(client, 'routines', 'is_active');
  const hasType = typeProbe === null;
  const hasActive = activeProbe === null;
  const remote = await fetchAll<RoutineRow>(
    client,
    'routines',
    hasType ? 'id, slug, name, type' : 'id, slug, name'
  );

  line(`  Content strength routines: ${strength.length}`);
  line(`  Content stretch routines: ${stretches.length}`);
  line(`  Goal mapping: ${strength.length - unmappedGoals.length} of ${strength.length} map onto strength | glutes_legs | general | confidence`);
  line('  Difficulty map: beginner_to_intermediate → beginner, advanced → experienced.');
  if (unmappedGoals.length > 0) {
    line(`  Unmapped goals (row upsert skipped): ${unmappedGoals.map((item) => `${item.slug}=${item.goal}`).join(', ')}`);
  }
  if (badDifficulty.length > 0) {
    line(`  Unmapped difficulty (row upsert skipped): ${badDifficulty.map((item) => item.slug).join(', ')}`);
  }
  line(`  is_active column: ${hasActive ? 'present' : 'missing (paste supabase/routines_is_active.sql)'}`);
  line(`  type column: ${hasType ? 'present' : `not confirmed (${typeProbe ?? 'unknown'})`}`);

  if (hiddenNote('routines', remote.error, remote.hidden)) {
    line(`  Plan when a service role can read: upsert ${content.length - unmappedGoals.length - badDifficulty.length} catalogue rows by slug (id = slug).`);
    line('  Stretch rows use type = stretch. Strength rows use type = strength.');
    line('  Old routines whose slug is not in /content would be set is_active = false. No delete.');
    line('  Do not live-run that flip until week/day rows load (W1). New /content routines have no sessions in the database yet.');
    line('  Week, phase, block, step and weekly_schedule data is not loaded. Those columns are W1 / G2 / N2.');
    line();
    return;
  }

  const contentSlugs = new Set(content.map((item) => item.slug));
  const stale = remote.rows.filter((row) => !contentSlugs.has(row.slug) && !contentSlugs.has(row.id));
  const existing = new Set(remote.rows.flatMap((row) => [row.slug, row.id]));
  const wouldInsert = content.filter(
    (item) => item.mappedGoal && item.difficulty && !existing.has(item.slug)
  );
  const wouldUpdate = content.filter(
    (item) => item.mappedGoal && item.difficulty && existing.has(item.slug)
  );

  line(`  Remote routines: ${remote.rows.length}`);
  line(`  Would insert catalogue rows: ${wouldInsert.length}`);
  line(`  Would update catalogue rows: ${wouldUpdate.length}`);
  if (hasActive) {
    line(`  Would set is_active = false on ${stale.length} routine(s) whose slug is not in /content. No delete.`);
  } else {
    line(`  Would set is_active = false on ${stale.length} routine(s) not in /content, after supabase/routines_is_active.sql.`);
  }
  if (stale.length > 0) {
    line(`  Not in /content: ${stale.map((row) => row.slug || row.id).join(', ')}`);
  }
  if (wouldInsert.length > 0) {
    line(`  New slugs: ${wouldInsert.map((item) => item.slug).join(', ')}`);
  }
  line('  Do not live-run the is_active flip until week/day rows load (W1). New /content routines have no sessions in the database yet.');
  line('  Week, phase, block, step and weekly_schedule data is not loaded. Those columns are W1 / G2 / N2.');
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

  const remote = await fetchAll<QuoteRow>(client, 'quotes', 'id, text, attribution, is_active');
  if (hiddenNote('quotes', remote.error, remote.hidden)) {
    line('  Plan: upsert by q-NNN from sort_order (not the numeric content id), so the app order matches /content.');
    line('  Match existing rows by text first and keep that id. Deactivate leftovers with is_active = false. No delete.');
    line();
    return;
  }

  const byId = new Map(remote.rows.map((row) => [row.id, row]));
  const byText = new Map(remote.rows.map((row) => [norm(row.text), row]));
  const keep = new Set<string>();
  let matchedText = 0;
  let matchedId = 0;
  let wouldInsert = 0;
  let wouldUpdate = 0;

  for (const item of quotes) {
    const preferred = quoteId(num(item.sort_order) ?? 0);
    const body = text(item.text);
    const byExactText = byText.get(norm(body));
    const row = byExactText ?? byId.get(preferred);
    if (!row) {
      wouldInsert += 1;
      keep.add(preferred);
      continue;
    }
    keep.add(row.id);
    if (byExactText) matchedText += 1;
    else matchedId += 1;
    const nextActive = item.is_active !== false;
    if (row.text !== body || (row.attribution ?? 'Ascenda') !== (text(item.attribution) || 'Ascenda') || row.is_active !== nextActive) {
      wouldUpdate += 1;
    }
  }
  const stale = remote.rows.filter((row) => !keep.has(row.id));

  line(`  Remote rows: ${remote.rows.length}`);
  line(`  Matched by text, existing id kept: ${matchedText}`);
  line(`  Matched by q-NNN from sort_order: ${matchedId}`);
  line(`  Would insert: ${wouldInsert}`);
  line(`  Would update text, attribution or is_active: ${wouldUpdate}`);
  line(`  Would set is_active = false on ${stale.length} leftover quote(s). No delete.`);
  line('  Numeric content ids are never written. sort_order is not a column yet, so q-NNN follows sort_order.');
  line();
}

async function reportLearn(client: SupabaseClient): Promise<void> {
  line('learn_articles  ←  content/learn/articles.json');
  const file = readJson('learn/articles.json');
  const articles = asArray(file.articles);
  const categories = asArray(file.categories).map((item) => text(item.id));
  const error = await probe(client, 'learn_articles', 'id, slug, title, category');
  line(`  Content articles: ${articles.length}`);
  line(`  Content categories: ${categories.join(', ')}`);
  if (error) {
    line(`  Table not usable: ${error}`);
    line('  Skipped. The app still uses the bundled 16 articles.');
    line();
    return;
  }

  const mapped = articles.map((item) => ({
    slug: text(item.slug),
    category: mapLearnCategory(text(item.category)),
    raw: text(item.category),
  }));
  const unknown = [...new Set(mapped.filter((item) => !item.category).map((item) => item.raw))];
  const ready = mapped.filter((item) => item.category);
  const remote = await fetchAll<LearnRow>(client, 'learn_articles', 'id, slug, title, category');
  const linksProbe = await probe(client, 'learn_links', 'article_id, routine_id, exercise_id');

  if (unknown.length > 0) {
    line(`  Unmapped categories: ${unknown.join(', ')}`);
  } else {
    line('  Category map: how_programmes_work → programmes, recovery_and_sleep → recovery.');
  }

  if (hiddenNote('learn_articles', remote.error, remote.hidden)) {
    line(`  Plan when a service role can read: upsert ${ready.length} articles by slug (id = slug). Bodies stay as written in /content.`);
    line(`  learn_links: ${linksProbe ? `skipped (${linksProbe})` : 'related_routines and related_exercises would insert missing pairs. Existing links are not deleted.'}`);
    line();
    return;
  }

  const existing = new Set(remote.rows.flatMap((row) => [row.slug, row.id]));
  const insert = ready.filter((item) => !existing.has(item.slug)).length;
  const update = ready.filter((item) => existing.has(item.slug)).length;
  line(`  Remote articles: ${remote.rows.length}`);
  line(`  Would insert: ${insert}`);
  line(`  Would update: ${update}`);
  line(`  learn_links: ${linksProbe ? `skipped (${linksProbe})` : 'related_routines and related_exercises would insert missing pairs. Existing links are not deleted.'}`);
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
  line('  Upsert skipped. The live table requires start_date, end_date and routine_id.');
  line('  /content has none of those: the window lives on the join (H8), and a challenge runs alongside any routine.');
  line('  Existing challenge rows are left as they are. No countdown fields are added.');
  line();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
