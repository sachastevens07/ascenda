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
  swapCount: number;
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

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
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

function mapBlockType(raw: string): 'warmup' | 'strength' | 'cardio' | 'cooldown' | 'stretch' | null {
  if (raw === 'cardio_finisher' || raw === 'cardio') return 'cardio';
  if (raw === 'warmup' || raw === 'strength' || raw === 'cooldown' || raw === 'stretch') return raw;
  return null;
}

function loadById(relativePath: string, key: string, idField = 'id'): Map<string, Json> {
  const map = new Map<string, Json>();
  try {
    const file = readJson(relativePath);
    for (const item of asArray(file[key])) {
      const id = text(item[idField]) || text(item.slug);
      if (id) map.set(id, item);
    }
  } catch {
    /* folder may be missing in a partial checkout */
  }
  return map;
}

function finisherSlug(schedule: Json, dayKey: string, weekNumber: number): string | null {
  const variants = ['fine', 'avoid', 'love'];
  let slots: Json[] = [];
  for (const name of variants) {
    const list = asArray(schedule[name]);
    if (list.length > 0) {
      slots = list;
      if (name === 'fine') break;
    }
  }
  const slot = slots.find((item) => text(item.day_key) === dayKey && text(item.type) === 'strength');
  if (!slot) return null;
  const skip = Array.isArray(slot.finisher_skip_weeks)
    ? (slot.finisher_skip_weeks as unknown[]).filter((value): value is number => typeof value === 'number')
    : [];
  if (skip.includes(weekNumber)) return null;
  return text(slot.finisher) || null;
}

type StructureCounts = {
  weeks: number;
  days: number;
  blocks: number;
  warmup: number;
  strength: number;
  cardio: number;
  cooldown: number;
  stretch: number;
  exercises: number;
  supportDays: number;
  scheduleVariants: number;
  missingWarmupTemplates: number;
  missingCardioSessions: number;
};

function emptyCounts(): StructureCounts {
  return {
    weeks: 0,
    days: 0,
    blocks: 0,
    warmup: 0,
    strength: 0,
    cardio: 0,
    cooldown: 0,
    stretch: 0,
    exercises: 0,
    supportDays: 0,
    scheduleVariants: 0,
    missingWarmupTemplates: 0,
    missingCardioSessions: 0,
  };
}

function addCounts(target: StructureCounts, extra: StructureCounts): void {
  for (const key of Object.keys(target) as (keyof StructureCounts)[]) {
    target[key] += extra[key];
  }
}

function planStrengthRoutine(
  file: Json,
  templates: Map<string, Json>,
  cardio: Map<string, Json>
): StructureCounts {
  const counts = emptyCounts();
  const weeks = asArray(file.weeks);
  const phases = asArray(file.phases);
  const schedule = (file.weekly_schedule ?? {}) as Json;
  counts.weeks = weeks.length;
  counts.supportDays = asArray(file.support_days).length;
  counts.scheduleVariants = ['avoid', 'fine', 'love'].filter((name) => asArray(schedule[name]).length > 0).length;

  for (const week of weeks) {
    const weekNumber = num(week.week) ?? 0;
    const phaseNumber = num(week.phase);
    const phase =
      phases.find((item) => num(item.number) === phaseNumber) ??
      phases.find((item) => asArray(item.weeks).some((value) => num(value) === weekNumber));
    const days = asArray(phase?.days);
    counts.days += days.length;
    for (const day of days) {
      const dayKey = text(day.key);
      const names = asArray(day.blocks).map((item) => (typeof item === 'string' ? item : text(item)));
      const finisher = names.includes('cardio_finisher') || names.includes('cardio')
        ? finisherSlug(schedule, dayKey, weekNumber)
        : null;
      for (const name of names) {
        const blockType = mapBlockType(name);
        if (!blockType) continue;
        if (blockType === 'cardio' && !finisher) continue;
        counts.blocks += 1;
        counts[blockType] += 1;
        if (blockType === 'warmup') {
          const templateId = text(day.warmup_id);
          if (templateId && !templates.has(templateId)) counts.missingWarmupTemplates += 1;
        }
        if (blockType === 'cooldown') {
          const templateId = text(day.cooldown_id);
          if (templateId && !templates.has(templateId)) counts.missingWarmupTemplates += 1;
        }
        if (blockType === 'cardio' && finisher && !cardio.has(finisher)) {
          counts.missingCardioSessions += 1;
        }
      }
      counts.exercises += asArray(day.exercises).length;
    }
  }
  return counts;
}

function planStretchRoutine(body: Json): StructureCounts {
  const counts = emptyCounts();
  counts.weeks = 1;
  counts.days = 1;
  counts.blocks = 1;
  counts.stretch = 1;
  counts.exercises = asArray(body.steps).length;
  return counts;
}

function planAllRoutineStructure(): StructureCounts {
  const templates = loadById('warmups-cooldowns/warmups-cooldowns.json', 'templates');
  const cardio = loadById('cardio/cardio-sessions.json', 'cardio_sessions', 'slug');
  const totals = emptyCounts();
  const files = readdirSync(join(CONTENT, 'routines')).filter((name) => name.endsWith('.json'));
  for (const file of files) {
    addCounts(totals, planStrengthRoutine(readJson(join('routines', file)), templates, cardio));
  }
  for (const body of asArray(readJson('stretches/stretch-routines.json').stretch_routines)) {
    addCounts(totals, planStretchRoutine(body));
  }
  return totals;
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
      const taken = item.if_its_taken && typeof item.if_its_taken === 'object' ? (item.if_its_taken as Json) : {};
      map.set(slug, {
        slug,
        primary: muscles.map((value) => mapMuscle(value)).find((value) => value) ?? null,
        cues: cues.slice(0, 3),
        location: text(item.where_to_find).trim(),
        swapCount: asArray(taken.swaps).map((value) => String(value).trim()).filter(Boolean).length,
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
  line('  content/onboarding: bundled in the app (X5 screens, why_lines, recommendation, strength_estimate)');
  line('  content/microcopy: bundled in the app (N1 safety surrounding strings)');
  line('  content/achievements: bundled in the app (H6 badge definitions)');
  line('  content/ai: Edge Functions, not the app database');
  line();
  reportOnboardingGoals();
  reportSafetyCopy();
  reportHardPaywall();
  reportReferrals();
  reportAnalytics();

  reportWarmups();
  reportAchievements();
  reportSingleSessions();
  reportCardio();
  reportMachineGuides();
  reportAi1();

  line('No table in the current schema, skipped');
  const deferred = [
    ['content/food', 'recipes and collections (F2)'],
  ];
  for (const [folder, why] of deferred) line(`  ${folder}: ${why}`);
  line();

  await reportImages(client);
  await reportExercises(client);
  reportGuides();
  await reportWorkoutx(client);
  await reportRoutines(client);
  await reportQuotes(client);
  await reportLearn(client);
  await reportChallenges(client);

  line();
  line('Nothing was written.');
}

function reportGuides(): void {
  line('exercise-guides  ←  content/exercise-guides/*.json');
  const files = ['lower-body.json', 'upper-body.json', 'core-and-carries.json'];
  const guides = files.flatMap((file) => asArray(readJson(join('exercise-guides', file)).guides));
  const withSwaps = guides.filter((item) => asArray(asRecord(item.if_its_taken).swaps).length > 0).length;
  line(`  Guides: ${guides.length}`);
  line(`  With if_its_taken swaps: ${withSwaps}`);
  line(`  Tip only (empty swap list): ${guides.length - withSwaps}`);
  line('  Bundled in the app for first-time guides and the swap engine.');
  line('  A live sync would update exercises.cues (first 3 form_cues) and location_hint from where_to_find.');
  line('  Swap lists stay in the app overlay. They are not a separate table.');
  line();
}

function reportSafetyCopy(): void {
  line('safety strings  ←  content/microcopy/en-GB.json strings.safety (bundled)');
  const safety = asRecord(asRecord(readJson('microcopy/en-GB.json').strings).safety);
  line(`  Onboarding title: ${text(safety.onboarding_title)}`);
  line(`  Checkbox: ${text(safety.onboarding_checkbox)}`);
  line(`  Footer: ${text(safety.footer_line)}`);
  line('  Full disclaimer body stays in src/lib/disclaimer.ts (one file). Bump DISCLAIMER_VERSION when it changes.');
  line('  Live sync does not write these strings.');
  line();
}

function reportHardPaywall(): void {
  line('hard paywall  ←  P1 (bundled). is_pro columns stay on routines, stretches, Learn and challenges.');
  line('  The app no longer uses those flags for badges, locks or limits.');
  line('  Access is the `ascenda_pro` entitlement via useSubscription.');
  line('  Server table: public.subscriptions, written only by the RevenueCat webhook.');
  line('  Live sync does not write subscriptions or is_pro.');
  line();
}

function reportReferrals(): void {
  line('referrals  ←  content/referrals/offers.json (bundled, X6)');
  const file = asRecord(readJson('referrals/offers.json'));
  line(`  Friend trial days: ${num(file.friend_trial_days) ?? 14}`);
  line(`  Apple offer code: ${text(file.apple_offer_code)}`);
  line(`  Referrer extend days: ${num(file.extend_days) ?? 30}`);
  line(`  Max rewards a year: ${num(file.max_rewards_per_year) ?? 2}`);
  line('  Bundled in the app. Live user tables (profiles.referral_code, referrals) are not written here.');
  line('  Paste supabase/referrals_x6.sql. Set REVENUECAT_SECRET_API_KEY on revenuecat-webhook.');
  line();
}

function reportAnalytics(): void {
  line('analytics  ←  H5 (bundled in src/lib/analytics.ts). Not a /content file.');
  line('  Events: onboarding_completed, disclaimer_accepted, paywall_viewed, trial_started, trial_converted, subscription_started, session_started, session_completed, set_ticked, planned_week_missed, rest_week_used (unused; rest weeks removed), streak_repaired, welcome_back_shown, welcome_back_completed, reminder_sent, reminder_opened, routine_completed, next_routine_started, learn_article_opened, ai_feature_used, ai_result_accepted, ai_result_rejected, ai_limit_reached, ai_fallback_used.');
  line('  Identify: user id + plan (none | trial | active | grace | expired). Never name, email, health, photos or free text.');
  line('  AI events are named now; call sites wait for v2.5. Never send prompt or answer text.');
  line('  Dashboards are built in the PostHog EU UI (see PROGRESS.md). Live sync does not write events.');
  line();
}

function reportOnboardingGoals(): void {
  line('onboarding v2  ←  content/onboarding/onboarding.json (bundled)');
  const file = asRecord(readJson('onboarding/onboarding.json'));
  const screens = asArray(file.screens).map(asRecord);
  const goals = screens.find((item) => text(item.id) === 'goals') ?? {};
  const options = asArray(goals.options);
  const rules = asArray(asRecord(file.recommendation).rules);
  const estimate = asRecord(file.strength_estimate);
  line(`  Screens: ${screens.length}`);
  line(`  Goal options: ${options.length}. First pick is main. Max ${num(goals.max) ?? 3}.`);
  line(`  Recommendation rules: ${rules.length}. Formula: ${text(estimate.formula) || 'from file'}`);
  line('  Stored on profiles (main_goals, gym_experience, onboarding_answers jsonb, age_band, cardio_preference).');
  line('  Live sync does not write onboarding into the database.');
  line();
}

function reportCardio(): void {
  line('cardio  ←  content/cardio/cardio-sessions.json (bundled, W2)');
  const file = asRecord(readJson('cardio/cardio-sessions.json'));
  const list = asArray(file.cardio_sessions).map(asRecord).filter((item) => item.is_active !== false);
  const styles = { steady: 0, intervals: 0, finisher: 0 };
  const machines = new Map<string, number>();
  let intervalMismatch = 0;
  let beginnerBlocked = 0;
  for (const item of list) {
    const style = text(item.style);
    if (style === 'steady' || style === 'intervals' || style === 'finisher') styles[style] += 1;
    const machine = text(item.machine_id) || 'unknown';
    machines.set(machine, (machines.get(machine) ?? 0) + 1);
    if (item.beginner_ok === false) beginnerBlocked += 1;
    const seconds = asArray(item.intervals).reduce((sum, step) => sum + (num(asRecord(step).seconds) ?? 0), 0);
    const duration = (num(item.duration_minutes) ?? 0) * 60;
    if (duration > 0 && Math.abs(seconds - duration) > 5) intervalMismatch += 1;
  }
  line(`  Sessions: ${list.length} (steady ${styles.steady}, intervals ${styles.intervals}, finisher ${styles.finisher})`);
  line(`  Machines: ${[...machines.entries()].map(([id, count]) => `${id} ${count}`).join(', ')}`);
  line(`  Beginner-blocked (intervals): ${beginnerBlocked}. Hidden for gym_experience not_yet/just_started in the first 4 weeks.`);
  if (intervalMismatch > 0) {
    line(`  Interval seconds do not match duration_minutes on ${intervalMismatch} session(s).`);
  }
  line('  Bundled in the app. Live sync does not write a cardio_sessions table.');
  line('  Logs need supabase/cardio_w2.sql (cardio_logs). Distance and calories are never estimated.');
  line();
}

function reportMachineGuides(): void {
  line('machine guides  ←  content/machine-guides/machine-guides.json (bundled, W4)');
  const list = asArray(readJson('machine-guides/machine-guides.json').machines).map(asRecord);
  const cardio = list.filter((item) => text(item.type) === 'cardio');
  const strength = list.filter((item) => text(item.type) === 'strength');
  const catalogue = new Set(
    asArray(readJson('exercises/strength-catalogue.json').exercises).map((item) => text(asRecord(item).slug)).filter(Boolean),
  );
  const aliases = {
    'chest-press-machine': 'machine-chest-press',
    'seated-dumbbell-shoulder-press': 'dumbbell-shoulder-press',
    'standing-dumbbell-shoulder-press': 'dumbbell-shoulder-press',
    'shoulder-press-machine': 'machine-shoulder-press',
    'bodyweight-glute-bridge': 'glute-bridge',
  } as Record<string, string>;
  const unknown: string[] = [];
  for (const item of strength) {
    const listed = Array.isArray(item.exercises) ? item.exercises : [];
    for (const raw of listed) {
      const slug = typeof raw === 'string' ? raw.trim() : '';
      const resolved = aliases[slug] ?? slug;
      if (resolved && !catalogue.has(resolved) && !catalogue.has(slug)) unknown.push(`${text(item.id)}:${slug}`);
    }
  }
  line(`  Machines: ${list.length} (cardio ${cardio.length}, strength ${strength.length})`);
  line(`  Cardio ids: ${cardio.map((item) => text(item.id)).filter(Boolean).join(', ') || 'none'}`);
  if (unknown.length > 0) line(`  Unknown exercise slugs: ${unknown.join(', ')}`);
  else line('  Strength exercise slugs all match the catalogue (or aliases).');
  line('  Bundled in the app. Live sync does not write a machines table.');
  line('  Gym unlocked cardio badges still come from cardio_logs (W2).');
  const missingFeatures = list.filter((item) => !text(item.visual_features));
  line(`  visual_features: ${list.length - missingFeatures.length} of ${list.length}`);
  if (missingFeatures.length > 0) {
    line(`  Missing visual_features: ${missingFeatures.map((item) => text(item.id)).join(', ')}`);
  }
  line();
}

function reportAi1(): void {
  line('AI1 scan  ←  content/ai/ai-config.json + prompts/ai1-scan-machine.md');
  const config = asRecord(asRecord(readJson('ai/ai-config.json')).features)['ai1-scan-machine'] ?? {};
  const row = asRecord(config);
  let promptPresent = false;
  try {
    promptPresent = readFileSync(join(CONTENT, 'ai/prompts/ai1-scan-machine.md'), 'utf8').length > 0;
  } catch {
    promptPresent = false;
  }
  line(`  Feature: ${text(row.feature) || 'AI1 Scan a machine'}`);
  line(`  Model: ${text(row.model) || 'claude-sonnet-5-5'}. Daily limit: ${num(row.daily_limit) ?? 20}.`);
  line(`  Prompt file: ${promptPresent ? 'present' : 'MISSING'}. Photos are discarded. Never stored.`);
  line('  Edge Function: scan-machine. Secret: ANTHROPIC_API_KEY. SQL: supabase/ai1.sql (ai_usage, ai_quota, machine_scan_misses).');
  line('  Bundled machine list for the function: supabase/functions/scan-machine/machines.json (id, name, visual_features).');
  line('  Live sync does not write AI tables. The function writes usage with the service role.');
  line();
}

function reportSingleSessions(): void {
  line('single sessions  ←  content/single-sessions/single-sessions.json (bundled, X3)');
  const file = asRecord(readJson('single-sessions/single-sessions.json'));
  const sessions = asArray(file.single_sessions).map(asRecord);
  const gym = sessions.filter((item) => text(item.where) !== 'home');
  const home = sessions.filter((item) => text(item.where) === 'home');
  const reviewed = sessions.filter((item) => text(item.reviewed_by)).length;
  line(`  Sessions: ${sessions.length} (${gym.length} gym, ${home.length} days you can't get to the gym)`);
  line(`  Coach reviewed: ${reviewed}`);
  line('  Bundled in the app. Live sync does not write a single_sessions table.');
  line("  Home-only sessions stay off Home and off the main Single sessions carousel.");
  line();
}

function reportAchievements(): void {
  line('achievements  ←  content/achievements/achievements.json (bundled, H6)');
  const file = asRecord(readJson('achievements/achievements.json'));
  const families = asArray(file.families);
  const badges = asArray(file.achievements).map(asRecord);
  const hidden = badges.filter((item) => text(item.available_from) === 'v2.3');
  line(`  Families: ${families.length}`);
  line(`  Badges: ${badges.length} (${hidden.length} cardio machine badges, visible from W2)`);
  line('  Bundled in the app. Live sync does not write a definitions table.');
  line('  user_achievements (supabase/achievements_h6.sql) keeps migrated milestone types.');
  line();
}

function reportWarmups(): void {
  line('warm-up / cool-down  ←  content/warmups-cooldowns/warmups-cooldowns.json');
  const file = readJson('warmups-cooldowns/warmups-cooldowns.json');
  const moves = asArray(file.moves);
  const templates = asArray(file.templates);
  line(`  Moves: ${moves.length}`);
  line(`  Templates: ${templates.length} (${templates.map((item) => text(item.id)).filter(Boolean).join(', ')})`);
  line('  Bundled in the app for the logger. A live sync would copy steps onto routine_day_blocks.steps.');
  line('  User tables are not touched.');
  line();
}

async function reportImages(client: SupabaseClient): Promise<void> {
  line('images  ←  content/images/image-manifest.json');
  const images = asArray(readJson('images/image-manifest.json').images);
  const columns =
    'id, slug, kind, shot, orientation, brief, same_as, status, url, storage_path, alt_text, licence_source, photographer, photographer_url, source_url, model_release, ai_score, ai_notes';
  const error = await probe(client, 'images', columns);
  line(`  Manifest slugs: ${images.length}`);
  if (error) {
    line(`  Table not usable: ${error}`);
    line('  Paste supabase/images_manifest.sql, then supabase/images_ai_columns.sql. The app shows placeholders until a photo is ready.');
    line();
    return;
  }
  const remote = await fetchAll<ImageRow>(client, 'images', 'id, url');
  if (hiddenNote('images', remote.error, remote.hidden)) {
    line(`  Plan when a service role can read: upsert ${images.length} slugs from the manifest.`);
    line('  Descriptive fields can update. url, status and licence fields are never cleared.');
    line();
    return;
  }
  const byId = new Set(remote.rows.map((row) => row.id));
  const missing = images.filter((item) => !byId.has(text(item.slug)));
  const withUrl = remote.rows.filter((row) => row.url).length;
  line(`  Remote rows: ${remote.rows.length}`);
  line(`  Remote rows with a url: ${withUrl}`);
  line(`  Would insert: ${missing.length}`);
  line('  Would update kind, shot, orientation, brief, same_as and alt_text.');
  line('  Would leave status, url, storage_path, photographer, photographer_url, source_url, licence_source, model_release, ai_score and ai_notes as they are.');
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
    line('  WorkoutX ids come from content/exercises/workoutx-ids.json, not the catalogue.');
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
  line('  WorkoutX ids come from content/exercises/workoutx-ids.json, not the catalogue.');
  line();
}

async function reportWorkoutx(client: SupabaseClient): Promise<void> {
  line('workoutx ids  ←  content/exercises/workoutx-ids.json');
  const matches = asArray(readJson('exercises/workoutx-ids.json').matches).filter((item) => {
    const slug = text(item.slug);
    const id = text(item.workoutx_id);
    return slug && /^ex_[A-Za-z0-9]+$/.test(id);
  });
  line(`  Confident matches: ${matches.length}`);
  const error = await probe(client, 'exercises', 'id, workoutx_id');
  if (error) {
    line(`  Column not usable: ${error}`);
    line('  Paste supabase/workoutx_m1.sql first. Then paste supabase/workoutx_ids.sql after you have reviewed the match CSV.');
    line('  MuscleWiki columns are left as they are.');
    line();
    return;
  }
  line('  Plan: set exercises.workoutx_id from this file. Existing MuscleWiki columns are not touched.');
  line('  Doubtful and unmatched rows stay in scripts/workoutx-matches.csv until you approve them.');
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
      featured:
        text(body.slug) === 'welcome-back-4-week-restart' ||
        text(body.equipment_summary).toLowerCase().includes("can't get to the gym")
          ? false
          : true,
      tags: (displayTags.length > 0 ? displayTags : tags).slice(0, 2),
      nextSuggestions: asArray(body.next_routine_suggestions).map((item) => text(item)).filter(Boolean),
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
  const knownSlugs = new Set(strength.map((item) => item.slug));
  const missingNext = strength.filter((item) => item.nextSuggestions.length === 0);
  const unknownNext = strength.flatMap((item) =>
    item.nextSuggestions
      .filter((slug) => !knownSlugs.has(slug))
      .map((slug) => `${item.slug} → ${slug}`)
  );

  const typeProbe = await probe(client, 'routines', 'type');
  const activeProbe = await probe(client, 'routines', 'is_active');
  const scheduleProbe = await probe(client, 'routines', 'support_days, weekly_schedule');
  const dayTypeProbe = await probe(client, 'routine_days', 'type, day_key');
  const blocksProbe = await probe(client, 'routine_day_blocks', 'id, routine_day_id, sort_order, block_type');
  const hasType = typeProbe === null;
  const hasActive = activeProbe === null;
  const structure = planAllRoutineStructure();
  const remote = await fetchAll<RoutineRow>(
    client,
    'routines',
    hasType ? 'id, slug, name, type' : 'id, slug, name'
  );

  const n2 = files.map((file) => {
    const body = readJson(join('routines', file));
    const routine = body.routine as Json;
    const phases = asArray(body.phases);
    const days = phases.flatMap((phase) => asArray(phase.days));
    const slots = days.flatMap((day) => asArray(day.exercises));
    return {
      slug: text(routine.slug),
      who: asArray(routine.who_its_for).length > 0,
      end: asArray(routine.by_the_end).length > 0,
      split: Boolean(text(routine.why_this_split)),
      how: asArray(routine.how_it_works).length > 0,
      phases: phases.filter((phase) => text(phase.name) && text(phase.goal)).length,
      phaseCount: phases.length,
      days: days.length,
      daysWithNote: days.filter((day) => text(day.coach_note) && text(day.focus)).length,
      slots: slots.length,
      slotsWithRole: slots.filter((slot) => text(slot.role) && num(slot.target_rir) != null).length,
    };
  });

  line(`  Content strength routines: ${strength.length}`);
  line(`  Content stretch routines: ${stretches.length}`);
  line(
    `  N2 copy: ${n2.filter((item) => item.who && item.end && item.split && item.how).length} of ${n2.length} have who_its_for, by_the_end, why_this_split and how_it_works`
  );
  line(
    `  N2 phases: ${n2.reduce((sum, item) => sum + item.phases, 0)} of ${n2.reduce((sum, item) => sum + item.phaseCount, 0)} have a name and goal`
  );
  line(
    `  N2 days: ${n2.reduce((sum, item) => sum + item.daysWithNote, 0)} of ${n2.reduce((sum, item) => sum + item.days, 0)} have focus and coach_note`
  );
  line(
    `  N2 strength slots: ${n2.reduce((sum, item) => sum + item.slotsWithRole, 0)} of ${n2.reduce((sum, item) => sum + item.slots, 0)} have role and target_rir`
  );
  line(`  Goal mapping: ${strength.length - unmappedGoals.length} of ${strength.length} map onto strength | glutes_legs | general | confidence`);
  line('  Difficulty map: beginner_to_intermediate → beginner, advanced → experienced.');
  if (unmappedGoals.length > 0) {
    line(`  Unmapped goals (row upsert skipped): ${unmappedGoals.map((item) => `${item.slug}=${item.goal}`).join(', ')}`);
  }
  if (badDifficulty.length > 0) {
    line(`  Unmapped difficulty (row upsert skipped): ${badDifficulty.map((item) => item.slug).join(', ')}`);
  }
  line(
    `  H4 next_routine_suggestions: ${strength.length - missingNext.length} of ${strength.length} strength routines (bundled; no database column)`
  );
  if (missingNext.length > 0) {
    line(`  Missing next_routine_suggestions: ${missingNext.map((item) => item.slug).join(', ')}`);
  }
  if (unknownNext.length > 0) {
    line(`  Unknown next_routine_suggestions: ${unknownNext.join(', ')}`);
  }
  line(`  is_active column: ${hasActive ? 'present' : 'missing (paste supabase/routines_is_active.sql)'}`);
  line(`  type column: ${hasType ? 'present' : `not confirmed (${typeProbe ?? 'unknown'})`}`);
  line(`  support_days / weekly_schedule columns: ${scheduleProbe ? `missing (paste supabase/session_blocks_w1.sql)` : 'present'}`);
  line(`  routine_days.type / day_key: ${dayTypeProbe ? `missing (${dayTypeProbe})` : 'present'}`);
  line(`  routine_day_blocks: ${blocksProbe ? `missing (paste supabase/session_blocks_w1.sql)` : 'present'}`);
  line(`  Planned weeks: ${structure.weeks}`);
  line(`  Planned days: ${structure.days} (strength days from phases; cardio and recovery days are placed on the planner from weekly_schedule in W5)`);
  line(`  Planned blocks: ${structure.blocks} (warmup ${structure.warmup}, strength ${structure.strength}, cardio ${structure.cardio}, cooldown ${structure.cooldown}, stretch ${structure.stretch})`);
  const n2Probe = await probe(client, 'routines', 'audience_bullets, by_the_end_bullets, split_note, progression_note');
  const n2WeekProbe = await probe(client, 'routine_weeks', 'phase_name, phase_goal, is_lighter_week');
  const n2DayProbe = await probe(client, 'routine_days', 'focus, coach_note, warmup, finisher');
  const n2SlotProbe = await probe(
    client,
    'routine_day_exercises',
    'role, target_rir, tempo, progression_rule, load_increment_kg, notes, alternative_exercise_ids, superset_group'
  );
  line(`  N2 routine columns: ${n2Probe ? `missing (paste supabase/n2_routines.sql) (${n2Probe})` : 'present'}`);
  line(`  N2 week columns: ${n2WeekProbe ? `missing (paste supabase/n2_routines.sql) (${n2WeekProbe})` : 'present'}`);
  line(`  N2 day columns: ${n2DayProbe ? `missing (paste supabase/n2_routines.sql) (${n2DayProbe})` : 'present'}`);
  line(`  N2 exercise columns: ${n2SlotProbe ? `missing (paste supabase/n2_routines.sql) (${n2SlotProbe})` : 'present'}`);
  line(`  Planned strength exercise slots: ${structure.exercises}`);
  line(`  support_days rows: ${structure.supportDays}. weekly_schedule variants: ${structure.scheduleVariants} (avoid / fine / love).`);
  if (structure.missingWarmupTemplates > 0) {
    line(`  Warm-up or cool-down template ids not in content/warmups-cooldowns: ${structure.missingWarmupTemplates}`);
  }
  if (structure.missingCardioSessions > 0) {
    line(`  Finisher slugs not in content/cardio: ${structure.missingCardioSessions}`);
  }

  if (hiddenNote('routines', remote.error, remote.hidden)) {
    line(`  Plan when a service role can read: upsert ${content.length - unmappedGoals.length - badDifficulty.length} catalogue rows by slug (id = slug).`);
    line('  Stretch rows use type = stretch. Strength rows use type = strength.');
    line('  Then upsert weeks, days, blocks and exercise slots. Store support_days and weekly_schedule jsonb on the routine.');
    line('  Old routines whose slug is not in /content would be set is_active = false. No delete.');
    line('  Do not live-run that flip until you confirm a live sync: the new slugs are extra rows, and hiding the current 14 plans would leave the logger with nothing to train from.');
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
  line('  Do not live-run the is_active flip until you confirm a live sync: the new slugs are extra rows, and hiding the current 14 plans would leave the logger with nothing to train from.');
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
    line('  Skipped. The app still uses the bundled articles from /content.');
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
  line('challenges  ←  content/challenges/challenges.json (bundled, H8)');
  const challenges = asArray(readJson('challenges/challenges.json').challenges).map(asRecord);
  const windowProbe = await probe(client, 'challenge_participants', 'start_date, end_date');
  const catalogueProbe = await probe(client, 'challenges', 'id, name');
  const withDates = challenges.filter((item) => text(item.start_date) || text(item.end_date));
  const showingCounts = challenges.filter((item) => item.show_participant_count === true);
  const missions = challenges.reduce((sum, item) => sum + asArray(item.weekly_missions).length, 0);
  line(`  Content challenges: ${challenges.length}`);
  line(`  Weekly missions: ${missions}`);
  line(`  Rolling starts only (no catalogue start_date/end_date): ${withDates.length === 0 ? 'yes' : `${withDates.length} still have dates`}`);
  line(`  show_participant_count all false: ${showingCounts.length === 0 ? 'yes' : 'no'}`);
  line('  Bundled in the app. The personal window is challenge_participants.start_date.');
  line(
    `  Catalogue table: ${catalogueProbe ? `missing (${catalogueProbe})` : 'present'}. Participant start_date: ${windowProbe ? `missing (paste supabase/challenges_h8.sql)` : 'present'}.`
  );
  line('  Live upsert would insert the four content slugs. Old fixed-date rows are left as they are. No delete.');
  line();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
