/**
 * Builds supabase/content_routines.sql from /content.
 * Never deletes sessions, sets, enrolments or the old 14 routine ids.
 * Run: npm run content:sql
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CONTENT = join(ROOT, 'content');
const OUT_DIR = join(ROOT, 'supabase');
const EXERCISES_SQL = join(ROOT, 'supabase', 'exercises.sql');
const STRETCHES_SQL = join(ROOT, 'supabase', 'stretches.sql');
const SLOT_BATCH = 80;

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
const SLUG_ALIASES: Record<string, string> = {
  'chest-press-machine': 'machine-chest-press',
  'seated-dumbbell-shoulder-press': 'dumbbell-shoulder-press',
  'standing-dumbbell-shoulder-press': 'dumbbell-shoulder-press',
  'shoulder-press-machine': 'machine-shoulder-press',
  'bodyweight-glute-bridge': 'glute-bridge',
  'open-book': 'open-book-stretch',
  'calf-stretch-wall': 'calf-wall-stretch',
  'chest-stretch-wall': 'doorway-chest-stretch',
  'half-kneeling-hip-flexor-stretch': 'kneeling-hip-flexor-stretch',
  'hip-90-90-switch': 'ninety-ninety-hip-stretch',
  'lying-hamstring-stretch': 'seated-hamstring-stretch',
  'side-lying-quad-stretch': 'standing-quad-stretch',
  'easy-bike': 'bodyweight-squat',
  'easy-cross-trainer': 'bodyweight-squat',
};
const FALLBACK_CUES = [
  'Move with control and stop if anything feels sharp.',
  'Keep the range comfortable. Ask a gym instructor if you are unsure.',
  'Breathe steadily. Never train through pain.',
];
const FALLBACK_LOCATION = 'Ask a member of gym staff if you are not sure where this lives.';
const FREE_SLUGS = new Set(['strong-foundations-6-weeks', 'the-two-day-start']);
const UNFEATURED = new Set(['welcome-back-4-week-restart']);
/** Content stretch slugs that already exist in stretches.sql under a different id. */
const STRETCH_EXISTING_IDS: Record<string, string> = {
  'morning-mobility': 'stretch-morning',
  'after-leg-day': 'stretch-post-leg',
  'desk-reset': 'stretch-desk',
  'happy-hips': 'stretch-hips',
  'back-unwind': 'stretch-lower-back',
  'shoulders-and-upper-back': 'stretch-upper',
  'full-body-recovery-flow': 'stretch-full-body',
};

function stretchRoutineId(slug: string): string {
  return STRETCH_EXISTING_IDS[slug] ?? slug;
}

type Json = Record<string, unknown>;
type Guide = { slug: string; primary: string | null; cues: string[]; location: string };
type ExerciseSeed = {
  id: string;
  name: string;
  equipment: string;
  primary: string;
  cues: string[];
  location: string;
  weightIncreaseKg: number | null;
};
type Slot = {
  dayId: string;
  position: number;
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  rest: number;
  duration: number | null;
  role: string | null;
  rir: number | null;
  tempo: string | null;
  progression: string | null;
  increment: number | null;
  notes: string | null;
  alternatives: string[];
  superset: string | null;
};

const skippedSlots: string[] = [];
const insertedExercises: string[] = [];
const mappedSlugs: string[] = [];

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

function sqlStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlText(value: string | null | undefined): string {
  return value ? sqlStr(value) : 'null';
}

function sqlArray(values: string[]): string {
  if (values.length === 0) return `'{}'::text[]`;
  return `ARRAY[${values.map(sqlStr).join(', ')}]::text[]`;
}

function mapMuscle(raw: string): string | null {
  const n = norm(raw);
  if (PRIMARY_MUSCLES.has(n)) return n;
  if (n.includes('glute')) return 'glutes';
  if (n.includes('quad')) return 'quads';
  if (n.includes('hamstring') || n.includes('hinge')) return 'hamstrings';
  if (n.includes('adductor')) return 'adductors';
  if (n.includes('calf')) return 'calves';
  if (n.includes('chest') || n.includes('pec') || n.includes('push')) return 'chest';
  if (n.includes('back') || n.includes('lat') || n.includes('trap') || n.includes('pull')) return 'back';
  if (n.includes('shoulder') || n.includes('deltoid')) return 'shoulders';
  if (n.includes('bicep')) return 'biceps';
  if (n.includes('tricep')) return 'triceps';
  if (n.includes('core') || n.includes('oblique') || n.includes('ab')) return 'core';
  if (n.includes('squat') || n.includes('lunge')) return 'quads';
  return null;
}

function mapRoutineGoal(raw: string): string {
  return ROUTINE_GOAL_MAP[raw] ?? 'general';
}

function mapDifficulty(level: string): string {
  if (ROUTINE_DIFFICULTIES.has(level)) return level;
  if (level === 'advanced') return 'experienced';
  if (level === 'beginner_to_intermediate') return 'beginner';
  return 'beginner';
}

function mapEquipment(summary: string, tags: string[]): 'full_gym' | 'dumbbells' | 'home' {
  const blob = `${summary} ${tags.join(' ')}`.toLowerCase();
  if (blob.includes("can't get to the gym") || blob.includes('cannot get to the gym')) return 'home';
  if (/\b(machine|barbell|cable|full gym)\b/.test(blob)) return 'full_gym';
  if (blob.includes('dumbbell')) return 'dumbbells';
  return 'full_gym';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseExistingIds(file: string): { ids: Set<string>; names: Map<string, string> } {
  const ids = new Set<string>();
  const names = new Map<string, string>();
  let textFile = '';
  try {
    textFile = readFileSync(file, 'utf8');
  } catch {
    return { ids, names };
  }
  const row = /\('([a-z0-9-]+)',\s*'((?:\\'|[^'])*)'/g;
  for (const match of textFile.matchAll(row)) {
    ids.add(match[1]);
    names.set(norm(match[2].replace(/''/g, "'")), match[1]);
  }
  return { ids, names };
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

function loadCatalogue(): Map<string, Json> {
  const map = new Map<string, Json>();
  const catalogue = asArray(readJson('exercises/strength-catalogue.json').exercises);
  const extra = asArray(readJson('routines/strong-foundations-6-weeks.json').exercise_catalogue);
  for (const item of [...catalogue, ...extra]) {
    const slug = text(item.slug);
    if (slug && !map.has(slug)) map.set(slug, item);
  }
  return map;
}

function loadStretchMoves(): Map<string, Json> {
  const map = new Map<string, Json>();
  for (const move of asArray(readJson('stretches/stretch-routines.json').moves)) {
    const slug = text(move.slug);
    if (slug && !map.has(slug)) map.set(slug, move);
  }
  return map;
}

function resolveExerciseId(
  slug: string,
  existing: Set<string>,
  names: Map<string, string>,
  catalogue: Map<string, Json>
): string | null {
  if (existing.has(slug)) return slug;
  const alias = SLUG_ALIASES[slug];
  if (alias && existing.has(alias)) {
    mappedSlugs.push(`${slug} -> ${alias}`);
    return alias;
  }
  const item = catalogue.get(slug);
  const byName = item ? names.get(norm(text(item.name))) : undefined;
  if (byName) {
    mappedSlugs.push(`${slug} -> ${byName} (name)`);
    return byName;
  }
  return null;
}

function weightIncreaseFor(equipment: string): number | null {
  if (equipment === 'bodyweight' || equipment === 'band') return null;
  if (equipment === 'dumbbell' || equipment === 'kettlebell') return 2;
  if (equipment === 'cable') return 1.25;
  if (equipment === 'machine' || equipment === 'barbell') return 2.5;
  return 2;
}

function seedForSlug(
  slug: string,
  catalogue: Map<string, Json>,
  guides: Map<string, Guide>,
  stretchMoves: Map<string, Json>
): ExerciseSeed | null {
  const item = catalogue.get(slug);
  if (item) {
    const equipment = text(item.equipment);
    if (!EXERCISE_EQUIPMENT.has(equipment)) return null;
    const guide = guides.get(slug);
    const primary =
      guide?.primary ?? mapMuscle(text(item.pattern)) ?? mapMuscle(text(item.name)) ?? 'core';
    const cues = guide && guide.cues.length === 3 ? guide.cues : FALLBACK_CUES;
    const location = guide?.location || FALLBACK_LOCATION;
    return {
      id: slug,
      name: text(item.name) || slug,
      equipment,
      primary,
      cues,
      location,
      weightIncreaseKg: weightIncreaseFor(equipment),
    };
  }
  const move = stretchMoves.get(slug);
  if (!move) return null;
  let equipment = text(move.equipment);
  if (equipment === 'cardio_machine') equipment = 'bodyweight';
  if (!EXERCISE_EQUIPMENT.has(equipment)) return null;
  const cue = text(move.cue);
  const cues = cue ? [cue, FALLBACK_CUES[1], FALLBACK_CUES[2]] : FALLBACK_CUES;
  return {
    id: slug,
    name: text(move.name) || slug,
    equipment,
    primary: mapMuscle(text(move.name)) ?? 'core',
    cues,
    location: FALLBACK_LOCATION,
    weightIncreaseKg: weightIncreaseFor(equipment),
  };
}

function roleOf(value: unknown): string | null {
  const role = text(value);
  return ['main', 'secondary', 'accessory', 'core', 'finisher'].includes(role) ? role : null;
}

function progressionOf(value: unknown): string | null {
  const rule = text(value);
  return ['load', 'reps', 'time'].includes(rule) ? rule : null;
}

function applySets(sets: number, week1: boolean, lighter: boolean): number {
  let next = sets;
  if (week1) next = Math.max(2, next - 1);
  if (lighter) next = Math.max(1, Math.floor(next * 0.65));
  return clamp(next, 1, 8);
}

function durationOf(item: Json): number | null {
  const exact = num(item.duration_seconds);
  const min = num(item.duration_min_seconds);
  const max = num(item.duration_max_seconds);
  const raw = exact ?? max ?? min;
  if (raw == null) return null;
  return clamp(raw, 10, 180);
}

function header(): string {
  return `-- Part 1 of 3. Content routines from /content (strength + stretch).
-- Paste this file, then content_routines_2.sql, then content_routines_3.sql.
-- Safe to run again. Never deletes sessions, sets, enrolments, profiles
-- or the original 14 routine ids (gym-confidence-6 and friends).
-- Adds the 15 strength plans and stretch sessions, with weeks and days.
-- Exercise slots are in parts 2 and 3.
-- Adds any missing exercises used by those plans. Existing exercise
-- rows keep their id so logged history stays linked.

-- Columns the seed writes. No-ops if you have already pasted n2 / stretches.
alter table public.routines add column if not exists type text;
update public.routines set type = 'strength' where type is null;
alter table public.routines alter column type set default 'strength';
alter table public.routines drop constraint if exists routines_session_minutes_check;
alter table public.routines add constraint routines_session_minutes_check check (
  session_minutes between 5 and 120
);

alter table public.routines add column if not exists audience_bullets text[];
alter table public.routines add column if not exists by_the_end_bullets text[];
alter table public.routines add column if not exists split_note text;
alter table public.routines add column if not exists progression_note text;

alter table public.routine_weeks add column if not exists is_checkpoint boolean not null default false;
alter table public.routine_weeks add column if not exists phase_name text;
alter table public.routine_weeks add column if not exists phase_goal text;
alter table public.routine_weeks add column if not exists is_lighter_week boolean;
update public.routine_weeks set is_lighter_week = false where is_lighter_week is null;
alter table public.routine_weeks alter column is_lighter_week set default false;

alter table public.routine_days add column if not exists focus text;
alter table public.routine_days add column if not exists warmup jsonb;
alter table public.routine_days add column if not exists coach_note text;
alter table public.routine_days add column if not exists finisher text;
alter table public.routine_days add column if not exists type text;
alter table public.routine_days add column if not exists day_key text;
update public.routine_days set type = 'strength' where type is null;

alter table public.routine_day_exercises add column if not exists duration_seconds integer;
alter table public.routine_day_exercises add column if not exists role text;
alter table public.routine_day_exercises add column if not exists target_rir smallint;
alter table public.routine_day_exercises add column if not exists tempo text;
alter table public.routine_day_exercises add column if not exists progression_rule text;
alter table public.routine_day_exercises add column if not exists load_increment_kg numeric;
alter table public.routine_day_exercises add column if not exists notes text;
alter table public.routine_day_exercises add column if not exists alternative_exercise_ids text[];
alter table public.routine_day_exercises add column if not exists superset_group text;

`;
}

function emitExerciseInserts(rows: ExerciseSeed[]): string {
  if (rows.length === 0) return '-- No new exercises to insert.\n';
  const values = rows.map(
    (row) =>
      `(${sqlStr(row.id)}, ${sqlStr(row.name)}, ${sqlStr(row.primary)}, '{}'::text[], ${sqlStr(row.equipment)}, ${sqlArray(row.cues)}, ${sqlStr(row.location)}, ${row.weightIncreaseKg ?? 'null'})`
  );
  const weightedIds = rows
    .filter((row) => row.weightIncreaseKg != null)
    .map((row) => sqlStr(row.id));
  const fill =
    weightedIds.length > 0
      ? `
update public.exercises
set weight_increase_kg = case equipment
  when 'dumbbell' then 2
  when 'kettlebell' then 2
  when 'cable' then 1.25
  when 'machine' then 2.5
  when 'barbell' then 2.5
  else weight_increase_kg
end
where id in (${weightedIds.join(', ')})
  and equipment not in ('bodyweight', 'band')
  and (weight_increase_kg is null or weight_increase_kg = 0);
`
      : '';
  return `-- New exercises used by the content plans (existing ids are left alone).
-- Weighted rows need weight_increase_kg (exercises_weight_increase_check).
insert into public.exercises (id, name, primary_muscle, secondary_muscles, equipment, cues, location_hint, weight_increase_kg) values
${values.join(',\n')}
on conflict (id) do nothing;
${fill}
`;
}

function slotRow(slot: Slot): string {
  return `(${sqlStr(slot.dayId)}, ${slot.position}, ${sqlStr(slot.exerciseId)}, ${slot.sets}, ${slot.repMin}, ${slot.repMax}, ${slot.rest}, ${slot.duration ?? 'null'}, ${sqlText(slot.role)}, ${slot.rir ?? 'null'}, ${sqlText(slot.tempo)}, ${sqlText(slot.progression)}, ${slot.increment ?? 'null'}, ${sqlText(slot.notes)}, ${sqlArray(slot.alternatives)}, ${sqlText(slot.superset)})`;
}

function emitSlotInserts(slots: Slot[]): string {
  const header = `insert into public.routine_day_exercises (
  routine_day_id, position, exercise_id, sets, rep_min, rep_max, rest_seconds,
  duration_seconds, role, target_rir, tempo, progression_rule, load_increment_kg,
  notes, alternative_exercise_ids, superset_group
) values
`;
  const parts: string[] = [];
  for (let i = 0; i < slots.length; i += SLOT_BATCH) {
    parts.push(header + slots.slice(i, i + SLOT_BATCH).map(slotRow).join(',\n') + ';\n');
  }
  return parts.join('\n');
}

function emitImages(ids: { id: string; alt: string }[]): string {
  const values = ids.map(
    (item) => `(${sqlStr(item.id)}, null, null, ${sqlStr(item.alt)}, null)`
  );
  return `insert into public.images (id, url, storage_path, alt_text, licence_source) values
${values.join(',\n')}
on conflict (id) do update set
  alt_text = excluded.alt_text;

`;
}

function main(): void {
  const existing = parseExistingIds(EXERCISES_SQL);
  const stretchIds = parseExistingIds(STRETCHES_SQL);
  for (const id of stretchIds.ids) existing.ids.add(id);
  for (const [name, id] of stretchIds.names) existing.names.set(name, id);

  const guides = loadGuides();
  const catalogue = loadCatalogue();
  const stretchMoves = loadStretchMoves();
  const known = new Set(existing.ids);
  const toInsert = new Map<string, ExerciseSeed>();

  function ensureExercise(slug: string, context: string): string | null {
    const resolved = resolveExerciseId(slug, known, existing.names, catalogue);
    if (resolved) return resolved;
    if (known.has(slug)) return slug;
    const seed = seedForSlug(slug, catalogue, guides, stretchMoves);
    if (seed) {
      known.add(seed.id);
      toInsert.set(seed.id, seed);
      insertedExercises.push(seed.id);
      return seed.id;
    }
    skippedSlots.push(`${context}: ${slug}`);
    return null;
  }

  const lines: string[] = [header()];
  const imageRows: { id: string; alt: string }[] = [];
  const routineRows: string[] = [];
  const tagRows: string[] = [];
  const weekRows: string[] = [];
  const dayRows: string[] = [];
  const slots: Slot[] = [];
  const contentIds: string[] = [];

  const files = readdirSync(join(CONTENT, 'routines'))
    .filter((name) => name.endsWith('.json'))
    .sort();

  let sortOrder = 1;
  for (const file of files) {
    const body = readJson(join('routines', file));
    const routine = (body.routine ?? {}) as Json;
    const slug = text(routine.slug);
    if (!slug) continue;
    contentIds.push(slug);
    const name = text(routine.name) || slug;
    const tags = asArray(routine.display_tags).map((item) => text(item)).filter(Boolean);
    const allTags = asArray(routine.tags).map((item) => text(item)).filter(Boolean);
    const cover = text(routine.cover_image_slug) || `cover-${slug}`;
    imageRows.push({ id: cover, alt: name });
    const goal = mapRoutineGoal(text(routine.goal));
    const difficulty = mapDifficulty(text(routine.level));
    const equipment = mapEquipment(text(routine.equipment_summary), allTags);
    const isPro = !FREE_SLUGS.has(slug);
    const featured = !UNFEATURED.has(slug) && equipment !== 'home';
    const who = asArray(routine.who_its_for).map((item) => text(item)).filter(Boolean);
    const byEnd = asArray(routine.by_the_end).map((item) => text(item)).filter(Boolean);
    const week1 = routine.week1_learning !== false;
    routineRows.push(
      `(${sqlStr(slug)}, ${sqlStr(name)}, ${sqlStr(slug)}, ${sqlStr(text(routine.short_description) || name)}, ${sqlStr(cover)}, ${sqlStr(goal)}, ${num(routine.length_weeks) ?? 6}, ${num(routine.days_per_week) ?? 3}, ${clamp(num(routine.session_minutes) ?? 45, 5, 120)}, ${sqlStr(difficulty)}, ${sqlStr(equipment)}, ${isPro}, ${featured}, ${sortOrder}, 'strength', ${sqlArray(who)}, ${sqlArray(byEnd)}, ${sqlText(text(routine.why_this_split) || null)}, ${sqlText(text(routine.progression_explained) || null)})`
    );
    sortOrder += 1;
    const displayTags = (tags.length > 0 ? tags : allTags).slice(0, 2);
    for (const tag of displayTags) tagRows.push(`(${sqlStr(slug)}, ${sqlStr(tag.toLowerCase())})`);

    const phases = asArray(body.phases);
    const weeks = asArray(body.weeks);
    for (const week of weeks) {
      const weekNumber = num(week.week);
      if (!weekNumber) continue;
      const phaseNumber = num(week.phase);
      const phase =
        phases.find((item) => num(item.number) === phaseNumber) ??
        phases.find((item) => asArray(item.weeks).some((value) => num(value) === weekNumber));
      const weekId = `${slug}-w${weekNumber}`;
      const lighter = week.is_lighter_week === true;
      const checkpoint = week.is_checkpoint === true;
      weekRows.push(
        `(${sqlStr(weekId)}, ${sqlStr(slug)}, ${weekNumber}, ${checkpoint}, ${sqlText(text(phase?.name) || null)}, ${sqlText(text(phase?.goal) || null)}, ${lighter})`
      );
      const days = asArray(phase?.days);
      let dayNumber = 0;
      for (const day of days) {
        dayNumber += 1;
        if (dayNumber > 7) break;
        const dayId = `${slug}-w${weekNumber}-d${dayNumber}`;
        const dayName = text(day.name) || `Day ${dayNumber}`;
        dayRows.push(
          `(${sqlStr(dayId)}, ${sqlStr(weekId)}, ${dayNumber}, ${sqlStr(dayName)}, ${sqlText(text(day.focus) || null)}, ${sqlText(text(day.coach_note) || null)}, ${sqlStr('strength')}, ${sqlText(text(day.key) || null)})`
        );
        let position = 0;
        for (const item of asArray(day.exercises)) {
          const sourceSlug = text(item.slug);
          const exerciseId = ensureExercise(sourceSlug, `${slug} w${weekNumber} ${dayName}`);
          if (!exerciseId) continue;
          position += 1;
          const duration = durationOf(item);
          const repMin = clamp(num(item.rep_min) ?? (duration ? 1 : 8), 1, 30);
          const repMax = clamp(num(item.rep_max) ?? (duration ? 1 : Math.max(repMin, 12)), repMin, 30);
          const alternatives = asArray(item.alternatives as unknown as Json[])
            .map((value) => (typeof value === 'string' ? value : text(value)))
            .concat(Array.isArray(item.alternatives) ? (item.alternatives as unknown[]).map(String) : [])
            .map((value) => resolveExerciseId(value, known, existing.names, catalogue) ?? (known.has(value) ? value : null))
            .filter((value): value is string => Boolean(value));
          const catalogueAlts = asArray((catalogue.get(sourceSlug)?.alternatives ?? []) as unknown as Json[])
            .map((value) => (typeof value === 'string' ? value : text(value)))
            .map((value) => resolveExerciseId(value, known, existing.names, catalogue))
            .filter((value): value is string => Boolean(value));
          slots.push({
            dayId,
            position,
            exerciseId,
            sets: applySets(num(item.sets) ?? (duration ? 1 : 3), week1 && weekNumber === 1, lighter),
            repMin,
            repMax,
            rest: clamp(num(item.rest_seconds) ?? (duration ? 0 : 90), 0, 600),
            duration,
            role: roleOf(item.role),
            rir: num(item.target_rir) != null ? clamp(num(item.target_rir) as number, 0, 5) : null,
            tempo: text(item.tempo) || null,
            progression: progressionOf(item.progression_rule),
            increment: num(item.load_increment_kg),
            notes: text(item.notes) || null,
            alternatives: [...new Set([...alternatives, ...catalogueAlts])].slice(0, 4),
            superset: text(item.superset_group) || null,
          });
        }
      }
    }
  }

  const stretchFile = readJson('stretches/stretch-routines.json');
  let stretchOrder = 80;
  for (const body of asArray(stretchFile.stretch_routines)) {
    const slug = text(body.slug);
    if (!slug) continue;
    const routineId = stretchRoutineId(slug);
    contentIds.push(routineId);
    const name = text(body.name) || slug;
    const cover = text(body.cover_image_slug) || `cover-${slug}`;
    imageRows.push({ id: cover, alt: name });
    const minutes = clamp(num(body.duration_minutes) ?? 10, 5, 120);
    const tags = asArray(body.display_tags).map((item) => text(item)).filter(Boolean).slice(0, 2);
    const who = asArray(body.who_its_for).map((item) => text(item)).filter(Boolean);
    routineRows.push(
      `(${sqlStr(routineId)}, ${sqlStr(name)}, ${sqlStr(slug)}, ${sqlStr(text(body.short_description) || name)}, ${sqlStr(cover)}, 'general', 1, 1, ${minutes}, 'beginner', 'full_gym', true, true, ${stretchOrder}, 'stretch', ${sqlArray(who)}, '{}'::text[], ${sqlText(text(body.coach_note) || null)}, null)`
    );
    stretchOrder += 1;
    for (const tag of tags) tagRows.push(`(${sqlStr(routineId)}, ${sqlStr(tag.toLowerCase())})`);
    const weekId = `${routineId}-w1`;
    weekRows.push(`(${sqlStr(weekId)}, ${sqlStr(routineId)}, 1, false, null, null, false)`);
    const dayId = `${routineId}-w1-d1`;
    dayRows.push(
      `(${sqlStr(dayId)}, ${sqlStr(weekId)}, 1, ${sqlStr(name)}, null, ${sqlText(text(body.coach_note) || null)}, ${sqlStr('recovery')}, null)`
    );
    let position = 0;
    for (const step of asArray(body.steps)) {
      const sourceSlug = text(step.slug);
      const move = stretchMoves.get(sourceSlug);
      const alt = text(move?.one_spot_alternative);
      const exerciseId =
        ensureExercise(sourceSlug, `stretch ${slug}`) ??
        (alt ? ensureExercise(alt, `stretch ${slug} alt`) : null);
      if (!exerciseId) continue;
      position += 1;
      const duration = durationOf(step);
      const reps = clamp(num(step.reps) ?? 1, 1, 30);
      slots.push({
        dayId,
        position,
        exerciseId,
        sets: 1,
        repMin: reps,
        repMax: reps,
        rest: 0,
        duration: duration ?? (num(step.reps) ? null : 30),
        role: null,
        rir: null,
        tempo: null,
        progression: duration ? 'time' : 'reps',
        increment: null,
        notes: null,
        alternatives: [],
        superset: null,
      });
    }
  }

  const idList = contentIds.map(sqlStr).join(', ');
  lines.push(emitExerciseInserts([...toInsert.values()]));
  lines.push(emitImages(imageRows));
  lines.push(`insert into public.routines (
  id, name, slug, description, cover_image_id, goal, length_weeks, days_per_week,
  session_minutes, difficulty, equipment, is_pro, is_featured_eligible, sort_order,
  type, audience_bullets, by_the_end_bullets, split_note, progression_note
) values
${routineRows.join(',\n')}
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  cover_image_id = excluded.cover_image_id,
  goal = excluded.goal,
  length_weeks = excluded.length_weeks,
  days_per_week = excluded.days_per_week,
  session_minutes = excluded.session_minutes,
  difficulty = excluded.difficulty,
  equipment = excluded.equipment,
  is_pro = excluded.is_pro,
  is_featured_eligible = excluded.is_featured_eligible,
  sort_order = excluded.sort_order,
  type = excluded.type,
  audience_bullets = excluded.audience_bullets,
  by_the_end_bullets = excluded.by_the_end_bullets,
  split_note = excluded.split_note,
  progression_note = excluded.progression_note;

delete from public.routine_day_exercises
where routine_day_id in (
  select rd.id
  from public.routine_days rd
  join public.routine_weeks rw on rw.id = rd.routine_week_id
  where rw.routine_id in (${idList})
);
delete from public.routine_days
where routine_week_id in (
  select id from public.routine_weeks where routine_id in (${idList})
);
delete from public.routine_weeks where routine_id in (${idList});
delete from public.routine_tags where routine_id in (${idList});

`);

  if (tagRows.length > 0) {
    lines.push(`insert into public.routine_tags (routine_id, tag) values
${tagRows.join(',\n')};

`);
  }
  lines.push(`insert into public.routine_weeks (
  id, routine_id, week_number, is_checkpoint, phase_name, phase_goal, is_lighter_week
) values
${weekRows.join(',\n')};

insert into public.routine_days (
  id, routine_week_id, day_number, name, focus, coach_note, type, day_key
) values
${dayRows.join(',\n')};
`);

  const setup = lines.join('');
  const splitAt = Math.ceil(slots.length / 2);
  const slotFiles = [
    emitSlotInserts(slots.slice(0, splitAt)),
    emitSlotInserts(slots.slice(splitAt)),
  ];
  const outputs = [
    { name: 'content_routines_1.sql', body: setup, note: 'schema, routines, weeks and days' },
    {
      name: 'content_routines_2.sql',
      body: `-- Part 2 of 3. Run after content_routines_1.sql.\n${slotFiles[0]}`,
      note: `exercise slots 1 to ${splitAt}`,
    },
    {
      name: 'content_routines_3.sql',
      body: `-- Part 3 of 3. Run after content_routines_2.sql.\n${slotFiles[1]}`,
      note: `exercise slots ${splitAt + 1} to ${slots.length}`,
    },
  ];
  for (const file of outputs) {
    writeFileSync(join(OUT_DIR, file.name), file.body, 'utf8');
    console.log(`Wrote ${file.name} (${file.body.length} chars)  ${file.note}`);
  }
  writeFileSync(
    join(OUT_DIR, 'content_routines.sql'),
    `-- Split for the SQL editor. Paste these in order, one at a time:
--   1. supabase/content_routines_1.sql
--   2. supabase/content_routines_2.sql
--   3. supabase/content_routines_3.sql
-- Do not paste this file.
`,
    'utf8'
  );

  const uniqueMapped = [...new Set(mappedSlugs)];
  console.log(`Routines: ${contentIds.length}`);
  console.log(`Weeks: ${weekRows.length}`);
  console.log(`Days: ${dayRows.length}`);
  console.log(`Exercise slots: ${slots.length}`);
  console.log(`New exercises: ${insertedExercises.length}`);
  if (uniqueMapped.length > 0) {
    console.log(`Mapped slugs: ${uniqueMapped.length}`);
  }
  if (skippedSlots.length > 0) {
    console.log(`Skipped slots (no matching exercise): ${skippedSlots.length}`);
    for (const item of skippedSlots.slice(0, 30)) console.log(`  ${item}`);
    if (skippedSlots.length > 30) console.log(`  … ${skippedSlots.length - 30} more`);
  }
}

main();
