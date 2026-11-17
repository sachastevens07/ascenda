/** Deterministic Coach tools. The model only chooses inputs. */

export type Json = Record<string, unknown>;

export function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type ExerciseIndex = {
  id: string;
  name: string;
  equipment: string;
  pattern: string;
  aliases: string[];
  setup: string[];
  feel: string;
  form_cues: string[];
  swaps: string[];
  taken_tip: string;
  alternatives: string[];
};

export type MachineIndex = {
  id: string;
  name: string;
  type: string;
  aliases: string[];
  visual_features?: string;
  where: string;
  setup: string[];
  start_and_stop: string[];
  beginner: string;
  exercises: string[];
};

export type ArticleIndex = {
  id: string;
  title: string;
  summary: string;
  category: string;
  excerpt: string;
};

export type RoutineIndex = {
  slug: string;
  name: string;
  level: string;
  goal: string;
  secondary_goals: string[];
  days_per_week: number;
  gym_days_needed: number;
  session_minutes: number;
  equipment_summary: string;
  tags: string[];
  schedule_label: string;
  why_this_split: string;
  phases: { name: string; goal: string; weeks: number[] }[];
};

export type RecipeIndex = {
  id: string;
  slug: string;
  title: string;
  meal_type: string;
  dietary_tags: string[];
  ingredients: { key: string; name: string; aisle: string; note: string }[];
};

export type Indexes = {
  app_help: { id: string; text: string }[];
  exercises: ExerciseIndex[];
  machines: MachineIndex[];
  articles: ArticleIndex[];
  routines: RoutineIndex[];
  recipes: RecipeIndex[];
  ingredients: { key: string; name: string; pantry: boolean }[];
  cardio: { id: string; name: string; duration_minutes: number; style: string; beginner_ok: boolean }[];
  stretches: { id: string; name: string; duration_minutes: number }[];
  warmups: { id: string; kind: string; focus: string; estimated_minutes: number }[];
  singles: {
    id: string;
    name: string;
    focus: string;
    estimated_minutes: number;
    home: boolean;
    short_description: string;
    exercises: { slug: string; role: string; sets: number; rep_min: number; rep_max: number }[];
  }[];
  recommend_rules: { if: string; recommend: string; alternatives: string[] }[];
  why_lines: { if: string; text: string }[];
};

export type CoachContext = {
  type: 'exercise' | 'machine' | 'session_today' | 'routine' | 'recipe' | 'article' | 'none';
  id: string;
  label: string;
};

export type SessionExercise = {
  exercise_id: string;
  name: string;
  role: string;
  equipment: string;
  pattern: string;
  sets: number;
  remaining_sets: number;
  rep_min: number;
  rep_max: number;
};

export type CoachPreference = {
  kind: 'avoid_exercise' | 'no_equipment_at_my_gym';
  exercise_id: string | null;
  equipment: string | null;
};

const EQUIPMENT_WORDS: [RegExp, string][] = [
  [/squat rack|power rack|barbell rack|\brack\b|barbell|smith/, 'barbell'],
  [/cable/, 'cable'],
  [/dumbbell/, 'dumbbell'],
  [/kettlebell/, 'kettlebell'],
  [/\bband\b|resistance band/, 'band'],
  [/bodyweight|no equipment/, 'bodyweight'],
  [/bench/, 'bench'],
  [/machine|leg press|hack squat|adductor|abductor|extension|lat pulldown|chest press/, 'machine'],
];

export function mapEquipmentToken(raw: string): string {
  const q = raw.toLowerCase().trim();
  if (!q) return q;
  for (const [pattern, value] of EQUIPMENT_WORDS) {
    if (pattern.test(q)) return value;
  }
  return q.replace(/\s+/g, '_');
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((item) => item.length > 2);
}

function scoreHay(hay: string, words: string[]): number {
  const lower = hay.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (lower.includes(word)) score += word.length > 5 ? 2 : 1;
  }
  return score;
}

export function exerciseById(indexes: Indexes, id: string): ExerciseIndex | null {
  const slug = id.trim();
  return indexes.exercises.find((item) => item.id === slug) ?? null;
}

export function compactIndex(indexes: Indexes): string {
  const exercises = (indexes.exercises ?? [])
    .map((item) => `${item.id}|${item.name}|${item.equipment}|${item.pattern}`)
    .join('\n');
  const machines = (indexes.machines ?? []).map((item) => `${item.id}|${item.name}|${item.type}`).join('\n');
  const ingredients = (indexes.ingredients ?? []).map((item) => `${item.key}|${item.name}`).join('\n');
  return `<exercise_index>\n${exercises}\n</exercise_index>\n<machine_index>\n${machines}\n</machine_index>\n<ingredient_list>\n${ingredients}\n</ingredient_list>`;
}

export function contextRecord(indexes: Indexes, context: CoachContext, session?: SessionExercise[]): Json {
  if (context.type === 'exercise') {
    const guide = exerciseById(indexes, context.id);
    return { ...context, guide };
  }
  if (context.type === 'machine') {
    const guide = indexes.machines.find((item) => item.id === context.id) ?? null;
    return { ...context, guide };
  }
  if (context.type === 'routine') {
    const routine = indexes.routines.find((item) => item.slug === context.id) ?? null;
    return { ...context, routine };
  }
  if (context.type === 'recipe') {
    const recipe = indexes.recipes.find((item) => item.slug === context.id || item.id === context.id) ?? null;
    return { ...context, recipe: recipe ? { ...recipe, ingredients: recipe.ingredients.map((part) => part.key) } : null };
  }
  if (context.type === 'article') {
    const article = indexes.articles.find((item) => item.id === context.id) ?? null;
    return { ...context, article };
  }
  if (context.type === 'session_today') {
    return { ...context, exercises: session ?? [] };
  }
  return { ...context };
}

export function retrieve(indexes: Indexes, message: string, context: CoachContext): { type: string; id: string; record: Json }[] {
  const words = tokens(`${message} ${context.label} ${context.id}`);
  const hits: { type: string; id: string; record: Json; score: number }[] = [];
  for (const item of indexes.exercises) {
    const hay = `${item.id} ${item.name} ${(item.aliases ?? []).join(' ')} ${item.feel} ${item.pattern}`;
    const score = scoreHay(hay, words);
    if (score > 0) hits.push({ type: 'exercise', id: item.id, record: item as unknown as Json, score });
  }
  for (const item of indexes.machines) {
    const hay = `${item.id} ${item.name} ${item.aliases.join(' ')} ${item.visual_features ?? ''} ${item.where} ${item.setup.join(' ')}`;
    const score = scoreHay(hay, words);
    if (score > 0) hits.push({ type: 'machine', id: item.id, record: item as unknown as Json, score });
  }
  for (const item of indexes.articles) {
    const hay = `${item.id} ${item.title} ${item.summary} ${item.category}`;
    const score = scoreHay(hay, words);
    if (score > 0) hits.push({ type: 'article', id: item.id, record: item as unknown as Json, score });
  }
  for (const item of indexes.routines) {
    const hay = `${item.slug} ${item.name} ${item.goal} ${item.why_this_split}`;
    const score = scoreHay(hay, words);
    if (score > 0) hits.push({ type: 'routine', id: item.slug, record: item as unknown as Json, score });
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const out: { type: string; id: string; record: Json }[] = [];
  const seen = new Set<string>();
  if (context.type === 'exercise' || context.type === 'machine' || context.type === 'article' || context.type === 'routine') {
    const record = contextRecord(indexes, context);
    out.push({ type: context.type, id: context.id, record });
    seen.add(`${context.type}:${context.id}`);
  }
  for (const hit of hits) {
    const key = `${hit.type}:${hit.id}`;
    if (seen.has(key)) continue;
    out.push({ type: hit.type, id: hit.id, record: hit.record });
    seen.add(key);
    if (out.length >= 3) break;
  }
  return out.slice(0, 3);
}

export function lookupTool(
  indexes: Indexes,
  input: Json
): { ok: true; items: Json[] } | { ok: false; error: string } {
  const type = text(input.type) || 'any';
  const id = text(input.id);
  const query = text(input.query);
  if (id) {
    if (type === 'exercise' || type === 'any') {
      const item = exerciseById(indexes, id);
      if (item) return { ok: true, items: [item as unknown as Json] };
    }
    if (type === 'machine' || type === 'any') {
      const item = indexes.machines.find((row) => row.id === id);
      if (item) return { ok: true, items: [item as unknown as Json] };
    }
    if (type === 'article' || type === 'any') {
      const item = indexes.articles.find((row) => row.id === id);
      if (item) return { ok: true, items: [item as unknown as Json] };
    }
    if (type === 'routine' || type === 'any') {
      const item = indexes.routines.find((row) => row.slug === id);
      if (item) return { ok: true, items: [item as unknown as Json] };
    }
    if (type === 'stretch' || type === 'any') {
      const item = indexes.stretches.find((row) => row.id === id);
      if (item) return { ok: true, items: [item as unknown as Json] };
    }
    if (type === 'cardio' || type === 'any') {
      const item = indexes.cardio.find((row) => row.id === id);
      if (item) return { ok: true, items: [item as unknown as Json] };
    }
    return { ok: false, error: `Unknown ${type} id ${id}` };
  }
  if (!query) return { ok: false, error: 'Provide an id or query' };
  const fakeContext: CoachContext = { type: 'none', id: '', label: query };
  const hits = retrieve(indexes, query, fakeContext)
    .filter((item) => type === 'any' || item.type === type)
    .slice(0, 3)
    .map((item) => ({ type: item.type, id: item.id, ...item.record }));
  if (hits.length === 0) return { ok: false, error: 'No matching guides' };
  return { ok: true, items: hits };
}

function restFor(role: string): number {
  if (role === 'main') return 150;
  if (role === 'secondary') return 90;
  if (role === 'accessory') return 75;
  if (role === 'core') return 60;
  return 45;
}

function estimateMinutes(rows: { role: string; sets: number }[]): number {
  let seconds = 0;
  for (const row of rows) seconds += row.sets * (40 + restFor(row.role));
  return Math.max(1, Math.ceil(seconds / 60));
}

export function adjustTodayTool(
  indexes: Indexes,
  input: Json,
  remaining: SessionExercise[],
  prefs: CoachPreference[]
): { ok: true; card: Json } | { ok: false; error: string } {
  if (remaining.length === 0) return { ok: false, error: 'No remaining exercises in today\'s session' };
  const blocked = new Set(
    asArray(input.unavailable_equipment).map((item) => mapEquipmentToken(text(item))).filter(Boolean)
  );
  for (const pref of prefs) {
    if (pref.kind === 'no_equipment_at_my_gym' && pref.equipment) blocked.add(mapEquipmentToken(pref.equipment));
  }
  const avoid = new Set(prefs.filter((item) => item.kind === 'avoid_exercise' && item.exercise_id).map((item) => item.exercise_id as string));
  for (const id of asArray(input.remove_exercise_ids).map(text)) if (id) avoid.add(id);
  const swapAsked = new Set(asArray(input.swap_exercise_ids).map(text).filter(Boolean));
  const minutesLeft = num(input.minutes_left);
  const energy = text(input.energy) === 'low' || text(input.energy) === 'high' ? text(input.energy) : 'normal';

  const kept: (SessionExercise & { replaces: string })[] = [];
  const used = new Set<string>();
  for (const item of remaining) {
    if (avoid.has(item.exercise_id) && !swapAsked.has(item.exercise_id)) continue;
    const taken = blocked.has(mapEquipmentToken(item.equipment)) || swapAsked.has(item.exercise_id) || avoid.has(item.exercise_id);
    if (!taken) {
      used.add(item.exercise_id);
      kept.push({ ...item, replaces: item.exercise_id });
      continue;
    }
    const guide = exerciseById(indexes, item.exercise_id);
    const swapIds = [...(guide?.swaps ?? []), ...(guide?.alternatives ?? [])];
    const alt = swapIds
      .map((id) => exerciseById(indexes, id))
      .find((row) => row && !used.has(row.id) && !avoid.has(row.id) && !blocked.has(mapEquipmentToken(row.equipment)));
    if (!alt) continue;
    used.add(alt.id);
    kept.push({
      ...item,
      exercise_id: alt.id,
      name: alt.name,
      equipment: alt.equipment,
      pattern: alt.pattern,
      replaces: item.exercise_id,
    });
  }

  const scaled = kept.map((item) => ({
    ...item,
    // Low energy does not change sets here. The app applies lightenSessionPlan (check-in rules).
    sets: item.remaining_sets || item.sets,
  }));
  const cap = (minutesLeft ?? 45) + 3;
  const dropOrder = (role: string) =>
    role === 'core' ? 0 : role === 'accessory' ? 1 : role === 'finisher' ? 2 : role === 'secondary' ? 3 : 4;
  let next = scaled.slice();
  const fits = (rows: typeof next) => estimateMinutes(rows) <= cap;
  while (next.length > 0 && minutesLeft != null && !fits(next)) {
    const dropIndex = [...next.keys()]
      .filter((index) => dropOrder(next[index].role) < 4)
      .sort((a, b) => dropOrder(next[a].role) - dropOrder(next[b].role) || b - a)[0];
    if (dropIndex == null) break;
    if (next[dropIndex].role === 'secondary' && next[dropIndex].sets > 1) {
      next = next.map((row, index) => (index === dropIndex ? { ...row, sets: row.sets - 1 } : row));
      continue;
    }
    if (next[dropIndex].role === 'main') {
      if (next[dropIndex].sets > 1) {
        next = next.map((row, index) => (index === dropIndex ? { ...row, sets: row.sets - 1 } : row));
        continue;
      }
      break;
    }
    next = next.filter((_, index) => index !== dropIndex);
  }

  const exercises = next.map((row, index) => ({
    exercise_id: row.exercise_id,
    name: row.name,
    replaces: row.replaces,
    sets: row.sets,
    rep_min: row.rep_min,
    rep_max: row.rep_max,
    role: row.role,
    order: index + 1,
  }));
  return {
    ok: true,
    card: {
      id: `adjust-${Date.now()}`,
      type: 'session_change',
      buttons: ['Use this', 'Not now'],
      before: remaining.map((item) => ({ exercise_id: item.exercise_id, name: item.name, sets: item.remaining_sets || item.sets })),
      after: exercises,
      energy,
      lighter: energy === 'low',
      summary:
        exercises.length === 0
          ? 'Nothing we can swap in from the list. Try marking less as taken, or swap one lift yourself.'
          : energy === 'low'
            ? 'A lighter version of today. Tap Use this and Ascenda will ease the sets and suggestions, the same way as the check-in.'
            : 'Swapped taken kit where we could, and trimmed the rest to fit the time you have.',
    },
  };
}

function kitFilter(equipment: string, kit: string): boolean {
  const eq = equipment.toLowerCase();
  if (kit === 'no_equipment') return eq === 'bodyweight' || eq === 'band';
  if (kit === 'dumbbells_and_bench') return ['dumbbell', 'bench', 'bodyweight', 'band'].includes(eq);
  if (kit === 'machines') return eq === 'machine' || eq === 'cable' || eq === 'bodyweight';
  return true;
}

function mapKit(value: string): string {
  if (value === 'dumbbells') return 'dumbbells_and_bench';
  if (value === 'busy_gym') return 'dumbbells_and_bench';
  if (value === 'bodyweight') return 'no_equipment';
  return value || 'full_gym';
}

export function buildSessionTool(
  indexes: Indexes,
  input: Json,
  prefs: CoachPreference[],
  recentIds: string[]
): { ok: true; card: Json } | { ok: false; error: string } {
  const minutes = num(input.minutes) ?? 30;
  const focus = text(input.focus) || 'full_body';
  const kit = mapKit(text(input.equipment));
  const energy = text(input.energy) === 'low' || text(input.energy) === 'high' ? text(input.energy) : 'normal';
  const avoid = new Set([
    ...asArray(input.avoid_exercise_ids).map(text).filter(Boolean),
    ...prefs.filter((item) => item.kind === 'avoid_exercise' && item.exercise_id).map((item) => item.exercise_id as string),
    ...recentIds,
  ]);
  const blockedEq = new Set(
    prefs.filter((item) => item.kind === 'no_equipment_at_my_gym' && item.equipment).map((item) => mapEquipmentToken(item.equipment as string))
  );
  const includeFinisher = input.include_finisher === true && minutes >= 45;

  if (focus === 'cardio') {
    const session = [...indexes.cardio]
      .filter((item) => energy === 'low' ? item.style !== 'intervals' : true)
      .sort((a, b) => Math.abs(a.duration_minutes - minutes) - Math.abs(b.duration_minutes - minutes))[0];
    if (!session) return { ok: false, error: 'No cardio session matched' };
    return {
      ok: true,
      card: {
        id: `build-${session.id}`,
        type: 'session',
        buttons: ['Start', 'Save to My workouts'],
        name: session.name,
        estimated_minutes: session.duration_minutes,
        blocks: [{ block_type: 'cardio', cardio_session_id: session.id, exercises: [] }],
      },
    };
  }
  if (focus === 'recovery') {
    const session = [...indexes.stretches].sort(
      (a, b) => Math.abs(a.duration_minutes - Math.min(minutes, 20)) - Math.abs(b.duration_minutes - Math.min(minutes, 20))
    )[0];
    if (!session) return { ok: false, error: 'No stretch session matched' };
    return {
      ok: true,
      card: {
        id: `build-${session.id}`,
        type: 'session',
        buttons: ['Start', 'Save to My workouts'],
        name: session.name,
        estimated_minutes: session.duration_minutes,
        blocks: [{ block_type: 'stretch', stretch_routine_id: session.id, exercises: [] }],
      },
    };
  }

  const patterns =
    focus === 'upper'
      ? ['push', 'pull', 'core']
      : focus === 'lower'
        ? ['squat', 'hinge', 'single_leg', 'glutes']
        : focus === 'glutes_and_legs'
          ? ['squat', 'hinge', 'glutes', 'single_leg']
          : ['squat', 'hinge', 'push', 'pull', 'core'];
  const pool = indexes.exercises.filter((item) => {
    if (avoid.has(item.id)) return false;
    if (blockedEq.has(mapEquipmentToken(item.equipment))) return false;
    if (!kitFilter(item.equipment, kit)) return false;
    return true;
  });
  const picked: ExerciseIndex[] = [];
  for (const pattern of patterns) {
    const hit = pool.find((item) => item.pattern === pattern && !picked.some((row) => row.id === item.id));
    if (hit) picked.push(hit);
  }
  if (picked.length < 3) {
    for (const item of pool) {
      if (picked.some((row) => row.id === item.id)) continue;
      picked.push(item);
      if (picked.length >= 5) break;
    }
  }
  const single = indexes.singles
    .filter((item) => !item.home)
    .sort((a, b) => {
      const focusScore = (row: typeof a) => (row.focus.includes(focus.replace('_', ' ')) || row.focus.includes(focus) ? 0 : 1);
      return focusScore(a) - focusScore(b) || Math.abs(a.estimated_minutes - minutes) - Math.abs(b.estimated_minutes - minutes);
    })[0];
  const exercises =
    picked.length >= 3
      ? picked.slice(0, 6).map((item, index) => ({
          exercise_id: item.id,
          name: item.name,
          role: index === 0 ? 'main' : index < 3 ? 'secondary' : 'accessory',
          sets: energy === 'low' ? 2 : 3,
          rep_min: 8,
          rep_max: 12,
        }))
      : (single?.exercises ?? []).filter((item) => !avoid.has(item.slug)).map((item) => ({
          exercise_id: item.slug,
          name: exerciseById(indexes, item.slug)?.name ?? item.slug,
          role: item.role,
          sets: energy === 'low' ? Math.max(2, item.sets - 1) : item.sets,
          rep_min: item.rep_min,
          rep_max: item.rep_max,
        }));
  if (exercises.length === 0) return { ok: false, error: 'Could not build a session from the library' };
  const warmup = indexes.warmups.find((item) => item.kind === 'warmup' && (item.focus === focus || item.focus === 'full_body'));
  const cooldown = indexes.warmups.find((item) => item.kind === 'cooldown');
  const blocks: Json[] = [
    { block_type: 'warmup', template_id: warmup?.id ?? null, exercises: [] },
    { block_type: 'strength', template_id: null, exercises },
  ];
  if (includeFinisher) {
    const finisher = indexes.cardio.find((item) => item.style === 'finisher' || item.duration_minutes <= 12);
    if (finisher) blocks.push({ block_type: 'cardio', cardio_session_id: finisher.id, exercises: [] });
  }
  blocks.push({ block_type: 'cooldown', template_id: cooldown?.id ?? null, exercises: [] });
  const name = `${focus.replace(/_/g, ' ')}, ${minutes} min`;
  return {
    ok: true,
    card: {
      id: `build-${Date.now()}`,
      type: 'session',
      buttons: ['Start', 'Save to My workouts'],
      name: name.slice(0, 30),
      estimated_minutes: estimateMinutes(exercises),
      blocks,
    },
  };
}

function equipmentFocusOk(routine: RoutineIndex, focus: string): boolean {
  if (!focus || focus === 'any') return true;
  const hay = `${routine.equipment_summary} ${routine.tags.join(' ')}`.toLowerCase();
  if (focus === 'machines') return hay.includes('machine');
  if (focus === 'dumbbells_and_bench') return hay.includes('dumbbell');
  if (focus === 'barbell') return hay.includes('barbell') || hay.includes('full gym');
  return true;
}

export function recommendRoutineTool(
  indexes: Indexes,
  input: Json
): { ok: true; card: Json } | { ok: false; error: string } {
  const days = Math.min(6, Math.max(2, num(input.days_per_week) ?? 3));
  const goals = asArray(input.goals).map(text).filter(Boolean);
  const experience = text(input.gym_experience);
  const comfort = num(input.gym_comfort) ?? 3;
  const focus = text(input.equipment_focus) || 'any';
  const fitted = indexes.routines.filter((item) => item.gym_days_needed <= days && equipmentFocusOk(item, focus));
  if (fitted.length === 0) return { ok: false, error: 'No routine fits those gym days' };
  const score = (item: RoutineIndex) => {
    let value = 0;
    if (goals.some((goal) => item.goal === goal || item.secondary_goals.includes(goal))) value += 5;
    if (goals.some((goal) => /glute/.test(goal) && (item.goal.includes('glute') || item.slug.includes('glute')))) value += 4;
    if (experience === 'not_yet' || experience === 'just_started') value += item.level === 'beginner' ? 3 : 0;
    if (experience === 'regularly') value += item.level === 'intermediate' || item.level === 'advanced' ? 2 : 0;
    if (comfort <= 2 && (item.level === 'beginner' || /machine|dumbbell/i.test(item.equipment_summary))) value += 3;
    if (item.gym_days_needed === days) value += 2;
    return value;
  };
  const ranked = [...fitted].sort((a, b) => score(b) - score(a) || a.slug.localeCompare(b.slug));
  const top = ranked.slice(0, 3);
  const why = [
    top[0].schedule_label,
    top[0].why_this_split.slice(0, 180),
    `Fits ${days} gym days a week.`,
  ].filter(Boolean);
  return {
    ok: true,
    card: {
      id: `routine-${top[0].slug}`,
      type: 'routine_options',
      buttons: ['Preview', 'Start on Monday'],
      options: top.map((item) => ({
        slug: item.slug,
        name: item.name,
        schedule_label: item.schedule_label,
        gym_days_needed: item.gym_days_needed,
      })),
      why_lines: why.slice(0, 3),
    },
  };
}

function matchIngredient(indexes: Indexes, token: string): string | null {
  const compact = token.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  const asKey = compact.replace(/\s+/g, '_');
  const exact = indexes.ingredients.find((item) => item.key === asKey || item.name.toLowerCase() === compact);
  if (exact) return exact.key;
  const hit = indexes.ingredients.find(
    (item) => item.name.toLowerCase().includes(compact) || item.key.replace(/_/g, ' ').includes(compact)
  );
  return hit?.key ?? null;
}

export function findRecipesTool(
  indexes: Indexes,
  input: Json
): { ok: true; card: Json } | { ok: false; error: string } {
  const keys = asArray(input.ingredient_keys)
    .map(text)
    .flatMap((item) => {
      const known = indexes.ingredients.some((row) => row.key === item) ? item : matchIngredient(indexes, item);
      return known ? [known] : [];
    });
  const unique = [...new Set(keys)];
  if (unique.length === 0) return { ok: false, error: 'None of those ingredients are in the list' };
  const dietary = asArray(input.dietary_tags).map(text).filter(Boolean);
  const meal = text(input.meal_type);
  const pantry = new Set(indexes.ingredients.filter((item) => item.pantry).map((item) => item.key));
  const have = new Set(unique);
  const matches = indexes.recipes.flatMap((recipe) => {
    if (meal && meal !== 'any' && recipe.meal_type !== meal) return [];
    if (dietary.some((tag) => !recipe.dietary_tags.includes(tag))) return [];
    const required = recipe.ingredients.filter((item) => (item.note ?? '').toLowerCase() !== 'optional' && item.key);
    const nonPantry = required.filter((item) => !pantry.has(item.key));
    if (nonPantry.length === 0) return [];
    const matched = nonPantry.filter((item) => have.has(item.key));
    if (matched.length === 0) return [];
    const missing = nonPantry.filter((item) => !have.has(item.key));
    return [
      {
        slug: recipe.slug,
        title: recipe.title,
        have: required.filter((item) => pantry.has(item.key) || have.has(item.key)).length,
        need: required.length,
        missing: missing.map((item) => item.name || item.key),
        score: matched.length / nonPantry.length,
      },
    ];
  });
  matches.sort((a, b) => b.score - a.score || a.missing.length - b.missing.length || a.title.localeCompare(b.title));
  const top = matches.slice(0, 5);
  if (top.length === 0) return { ok: false, error: 'No recipes matched those ingredients' };
  return {
    ok: true,
    card: {
      id: `recipes-${Date.now()}`,
      type: 'recipes',
      buttons: ['Open', 'Add missing to shopping list'],
      recipes: top,
    },
  };
}

export function lungeExerciseIds(indexes: Indexes): string[] {
  return indexes.exercises.filter((item) => /lunge/.test(item.id) || /lunge/i.test(item.name)).map((item) => item.id);
}

export function fallbackLinks(
  indexes: Indexes,
  message: string,
  context: CoachContext
): { type: string; id: string }[] {
  return retrieve(indexes, message, context).map((item) => ({ type: item.type, id: item.id })).slice(0, 3);
}
