/**
 * Bundle compact Coach indexes for the Edge Function.
 * node scripts/emit-coach-indexes.ts
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CONTENT = join(ROOT, 'content');
const OUT_DIR = join(ROOT, 'supabase/functions/coach');

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(CONTENT, rel), 'utf8')) as Record<string, unknown>;
}

function strings(value: unknown): string[] {
  return asArray(value).map(text).filter(Boolean);
}

const APP_HELP = [
  {
    id: 'suggested_weight',
    text: 'Suggested weights come from the double-progression rule and her log. The logger shows a chip when it is time to go up. Never give a kg number.',
  },
  {
    id: 'rir',
    text: 'Reps in reserve means stop with that many reps still left. Beginners usually stop with 2 to 3 left.',
  },
  {
    id: 'swap',
    text: 'Swap from the exercise card in the logger, or ask Coach when kit is busy. Changes apply to today only until she saves a preference.',
  },
  {
    id: 'planner',
    text: 'She can move a planned session in the Planner. Coach may propose a move. Never say it is already done.',
  },
  {
    id: 'streak',
    text: 'A week counts if she does at least one session. Hitting her weekly target is a gold week.',
  },
  {
    id: 'fuel',
    text: 'Food is framed as fuel for training. No calorie targets or food logs.',
  },
  {
    id: 'preferences',
    text: 'Saved Coach preferences live in Profile, Coach preferences. She can remove them there.',
  },
  {
    id: 'rest',
    text: 'Rest by role: main lifts 2 to 3 minutes, secondary about 90 seconds, accessories 60 to 90 seconds.',
  },
];

const OIL_KEYS = new Set(['olive_oil', 'sesame_oil']);

function emit(): void {
  mkdirSync(OUT_DIR, { recursive: true });

  const catalogue = asArray(asRecord(readJson('exercises/strength-catalogue.json')).exercises);
  const catalogueBySlug = new Map<string, Record<string, unknown>>();
  for (const item of catalogue) {
    const row = asRecord(item);
    const slug = text(row.slug);
    if (slug) catalogueBySlug.set(slug, row);
  }

  const guides: Record<string, unknown>[] = [];
  for (const file of ['exercise-guides/lower-body.json', 'exercise-guides/upper-body.json', 'exercise-guides/core-and-carries.json']) {
    for (const item of asArray(asRecord(readJson(file)).guides)) {
      const row = asRecord(item);
      const slug = text(row.slug);
      if (!slug) continue;
      const cat = catalogueBySlug.get(slug) ?? {};
      const taken = asRecord(row.if_its_taken);
      guides.push({
        id: slug,
        name: text(cat.name) || slug.replace(/-/g, ' '),
        equipment: text(cat.equipment),
        pattern: text(cat.pattern),
        aliases: strings(cat.aliases),
        setup: strings(row.setup).slice(0, 5),
        feel: text(row.where_you_should_feel_it),
        form_cues: strings(row.form_cues).slice(0, 4),
        swaps: strings(taken.swaps).slice(0, 6),
        taken_tip: text(taken.tip),
        alternatives: strings(cat.alternatives).slice(0, 6),
      });
    }
  }

  const machines = asArray(asRecord(readJson('machine-guides/machine-guides.json')).machines).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.id);
    if (!id) return [];
    return [
      {
        id,
        name: text(row.name) || id,
        type: text(row.type),
        aliases: [...strings(row.aliases), text(row.visual_features)].filter(Boolean),
        visual_features: text(row.visual_features),
        where: text(row.where_to_find),
        setup: strings(row.setup).slice(0, 6),
        start_and_stop: strings(row.start_and_stop).slice(0, 4),
        beginner: text(row.beginner_settings),
        exercises: strings(row.exercises).slice(0, 8),
      },
    ];
  });

  const articles = asArray(asRecord(readJson('learn/articles.json')).articles).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.id) || text(row.slug);
    if (!id) return [];
    const body = text(row.body_markdown).replace(/\s+/g, ' ').slice(0, 420);
    return [
      {
        id,
        title: text(row.title) || id,
        summary: text(row.summary),
        category: text(row.category),
        excerpt: body,
      },
    ];
  });

  const routineFiles = readdirSync(join(CONTENT, 'routines')).filter((name) => name.endsWith('.json'));
  const routines = routineFiles.flatMap((file) => {
    const raw = readJson(`routines/${file}`);
    const routine = asRecord(raw.routine);
    const slug = text(routine.slug);
    if (!slug) return [];
    const weekly = asRecord(raw.weekly_plan);
    const phases = asArray(raw.phases).map((item) => {
      const phase = asRecord(item);
      return {
        name: text(phase.name),
        goal: text(phase.goal),
        weeks: asArray(phase.weeks).filter((week) => typeof week === 'number'),
      };
    });
    return [
      {
        slug,
        name: text(routine.name) || slug,
        level: text(routine.level),
        goal: text(routine.goal),
        secondary_goals: strings(routine.secondary_goals),
        days_per_week: num(routine.days_per_week) ?? 3,
        gym_days_needed: num(weekly.gym_days_needed) ?? num(routine.days_per_week) ?? 3,
        session_minutes: num(routine.session_minutes) ?? 45,
        equipment_summary: text(routine.equipment_summary),
        tags: strings(routine.tags),
        schedule_label: text(routine.schedule_label),
        why_this_split: text(routine.why_this_split),
        phases,
      },
    ];
  });

  const recipesFile = readJson('food/recipes.json');
  const recipes = asArray(recipesFile.recipes).flatMap((item) => {
    const row = asRecord(item);
    const slug = text(row.slug) || text(row.id);
    if (!slug) return [];
    const ingredients = asArray(row.ingredients).map((ing) => {
      const part = asRecord(ing);
      return {
        key: text(part.ingredient_key) || text(part.key),
        name: text(part.name),
        aisle: text(part.aisle),
        note: text(part.note),
      };
    });
    return [
      {
        id: slug,
        slug,
        title: text(row.title) || slug,
        meal_type: text(row.meal_type),
        dietary_tags: strings(row.dietary_tags),
        ingredients,
      },
    ];
  });

  const ingredientMap = new Map<string, { key: string; name: string; pantry: boolean }>();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      if (!ingredient.key || ingredientMap.has(ingredient.key)) continue;
      const pantry = ingredient.aisle === 'Herbs and spices' || OIL_KEYS.has(ingredient.key);
      ingredientMap.set(ingredient.key, { key: ingredient.key, name: ingredient.name || ingredient.key, pantry });
    }
  }

  const cardio = asArray(asRecord(readJson('cardio/cardio-sessions.json')).cardio_sessions).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.id) || text(row.slug);
    if (!id) return [];
    return [
      {
        id,
        name: text(row.name) || id,
        duration_minutes: num(row.duration_minutes) ?? num(row.minutes) ?? 20,
        style: text(row.style),
        beginner_ok: row.beginner_ok !== false,
      },
    ];
  });

  const stretches = asArray(asRecord(readJson('stretches/stretch-routines.json')).stretch_routines).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.id) || text(row.slug);
    if (!id) return [];
    return [
      {
        id,
        name: text(row.name) || id,
        duration_minutes: num(row.duration_minutes) ?? num(row.minutes) ?? 10,
      },
    ];
  });

  let warmups: { id: string; kind: string; focus: string; estimated_minutes: number }[] = [];
  try {
    const file = readJson('warmups-cooldowns/warmups-cooldowns.json');
    warmups = asArray(file.templates).flatMap((item) => {
      const row = asRecord(item);
      const id = text(row.id);
      if (!id) return [];
      return [
        {
          id,
          kind: text(row.kind) || text(row.type) || 'warmup',
          focus: text(row.focus),
          estimated_minutes: num(row.estimated_minutes) ?? 5,
        },
      ];
    });
  } catch {
    warmups = [];
  }

  const singles = asArray(asRecord(readJson('single-sessions/single-sessions.json')).single_sessions).flatMap((item) => {
    const row = asRecord(item);
    const id = text(row.id) || text(row.slug);
    if (!id) return [];
    const exercises = asArray(row.exercises).flatMap((slot) => {
      const part = asRecord(slot);
      const slug = text(part.slug) || text(part.exercise_id);
      if (!slug) return [];
      return [
        {
          slug,
          role: text(part.role) || 'secondary',
          sets: num(part.sets) ?? 3,
          rep_min: num(part.rep_min) ?? 8,
          rep_max: num(part.rep_max) ?? 12,
        },
      ];
    });
    return [
      {
        id,
        name: text(row.name) || id,
        focus: text(row.focus),
        estimated_minutes: num(row.estimated_minutes) ?? num(row.minutes) ?? 30,
        home: text(row.where) === 'home' || row.home === true,
        short_description: text(row.short_description),
        exercises,
      },
    ];
  });

  const onboarding = readJson('onboarding/onboarding.json');
  const recommendation = asRecord(onboarding.recommendation);

  const indexes = {
    app_help: APP_HELP,
    exercises: guides,
    machines,
    articles,
    routines,
    recipes,
    ingredients: [...ingredientMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    cardio,
    stretches,
    warmups,
    singles: singles.filter((item) => item.home !== true),
    recommend_rules: asArray(recommendation.rules),
    why_lines: asArray(onboarding.why_lines),
  };

  writeFileSync(join(OUT_DIR, 'indexes.json'), `${JSON.stringify(indexes)}\n`);
  copyFileSync(join(CONTENT, 'ai/prompts/coach.md'), join(OUT_DIR, 'prompt.md'));
  const bytes = Buffer.byteLength(JSON.stringify(indexes));
  console.log(
    `Coach indexes: ${guides.length} exercises, ${machines.length} machines, ${articles.length} articles, ${routines.length} routines, ${recipes.length} recipes (${Math.round(bytes / 1024)} KB)`
  );
}

emit();
