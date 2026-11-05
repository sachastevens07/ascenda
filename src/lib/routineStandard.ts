import type { SlotExercise } from '@/lib/programmes';

type RoutineDifficulty = 'beginner' | 'intermediate' | 'experienced';

export type ExerciseRole = 'main' | 'secondary' | 'accessory' | 'core' | 'finisher';
export type ProgressionRule = 'load' | 'reps' | 'time';

export type WarmupStep = {
  text: string;
  seconds?: number;
  reps?: number;
};

export type RoutineBrief = {
  audience: string[];
  byTheEnd: string[];
  splitNote: string;
  progressionNote: string;
};

export const ROLE_LABELS: Record<ExerciseRole, string> = {
  main: 'Main lift',
  secondary: 'Secondary',
  accessory: 'Accessory',
  core: 'Core',
  finisher: 'Finisher',
};

const CORE_IDS = new Set([
  'dead-bug',
  'plank',
  'side-plank',
  'cable-pallof-press',
  'bird-dog',
  'glute-bridge',
  'frog-pump',
]);

const ALTERNATIVES: Record<string, string[]> = {
  'goblet-squat': ['leg-press', 'bodyweight-squat'],
  'leg-press': ['goblet-squat', 'bodyweight-squat'],
  'dumbbell-bench-press': ['machine-chest-press', 'knee-push-up'],
  'machine-chest-press': ['dumbbell-bench-press', 'incline-push-up'],
  'one-arm-dumbbell-row': ['seated-cable-row', 'band-row'],
  'lat-pulldown': ['one-arm-dumbbell-row', 'band-lat-pulldown'],
  'dumbbell-romanian-deadlift': ['lying-leg-curl', 'banded-hamstring-curl'],
  'dumbbell-hip-thrust': ['hip-thrust-machine', 'glute-bridge'],
  'hip-thrust-machine': ['dumbbell-hip-thrust', 'glute-bridge'],
  'dumbbell-shoulder-press': ['machine-shoulder-press', 'band-shoulder-press'],
  'machine-shoulder-press': ['dumbbell-shoulder-press', 'band-shoulder-press'],
  'dumbbell-reverse-lunge': ['bodyweight-reverse-lunge', 'leg-press'],
  'incline-dumbbell-press': ['machine-chest-press', 'knee-push-up'],
  'barbell-deadlift': ['dumbbell-romanian-deadlift', 'kettlebell-deadlift'],
  'push-up': ['knee-push-up', 'incline-push-up'],
  'pull-up': ['assisted-pull-up', 'lat-pulldown'],
};

export const ROUTINE_BRIEFS: Record<string, RoutineBrief> = {
  'gym-confidence-6': {
    audience: [
      'New to the gym, or coming back and wanting a calmer start',
      'Happy to train three days a week for about 40 minutes',
      'Fine with starting in one dumbbell spot',
    ],
    byTheEnd: [
      'Know a simple full-body session you can repeat without guessing',
      'Have used dumbbells, then a few machines, then two basic free-weight lifts',
      'Have a log of weights you can add to, a little at a time',
    ],
    splitNote:
      'Three full-body days keep every pattern in the week without a split to remember. You stay in one area at first, then add kit as it feels familiar.',
    progressionNote:
      'Main lifts add load when you hit the top of the rep range on set 1. Accessories add reps first. Start with a weight you could lift three more times.',
  },
  'full-body-3': {
    audience: [
      'Want a simple three-day gym week',
      'Beginner or returning, with access to a full gym',
      'Prefer the same three days for eight weeks',
    ],
    byTheEnd: [
      'Have a repeatable squat, hinge, push, pull and single-leg pattern',
      'Know when to add a little load from your own log',
      'Have one lighter week before the last checkpoint',
    ],
    splitNote:
      'Full body three days a week covers squat, hinge, push, pull, single-leg and core in every week. The days stay the same so you can learn them well.',
    progressionNote:
      'Main lifts use double progression with a small load jump. Accessories add reps first. Week 7 is lighter. Keep two or three reps in the tank.',
  },
  'one-spot-6': {
    audience: [
      'Want to stay in the dumbbell area',
      'Prefer not to hunt for machines or a rack',
      'Training three days a week',
    ],
    byTheEnd: [
      'Have two or three dumbbell sessions you could do in a quiet corner',
      'Know how to swap if a bench is taken',
      'Have logged six weeks of the same movements',
    ],
    splitNote:
      'Full body, one spot. Every session uses dumbbells and floor work so you do not need to move around the gym.',
    progressionNote:
      'Add 1 to 2 kg on main dumbbell lifts when you hit the top of the range. Accessories add reps first.',
  },
  'busy-gym-6': {
    audience: [
      'Train when the gym is busy',
      'Happy to use machines and cables first',
      'Want a plan that always has a next option',
    ],
    byTheEnd: [
      'Know which machines cover squat, hinge, push and pull',
      'Have swaps ready if a machine is taken',
      'Have six weeks of logged machine work',
    ],
    splitNote:
      'Machine-first full body. You can queue one or two machines and still finish the session without the free-weight floor.',
    progressionNote:
      'Add a plate on machines when you hit the top of the range. Leave two or three reps in the tank. Never grind a set.',
  },
  'upper-lower-4': {
    audience: [
      'Already know the main machines and free weights',
      'Can train four days a week',
      'Want more upper and lower volume than a full-body week',
    ],
    byTheEnd: [
      'Have a clear upper and lower pair you can repeat',
      'Have practised adding load on the main lifts',
      'Have one lighter week before the last checkpoint',
    ],
    splitNote:
      'Two upper and two lower days spread the work so each session can go a little deeper. Core still sits on both halves of the week.',
    progressionNote:
      'Main lifts add 2.5 kg on barbell work or 1 to 2 kg on dumbbells when you hit the top of the range. Week 7 is lighter.',
  },
  'lower-body-3': {
    audience: [
      'Want more glute and leg work, with one upper day to keep the week balanced',
      'Comfortable in a full gym',
      'Training three days a week',
    ],
    byTheEnd: [
      'Have a lower-body session you could repeat without a script',
      'Have kept a push and pull in the week so the upper body is not ignored',
      'Have one lighter week before the last checkpoint',
    ],
    splitNote:
      'This week is deliberately lower-body heavy: two glute and leg days and one upper day. Squat, hinge and single-leg still show up twice.',
    progressionNote:
      'Hip thrusts and squats add load first. Accessories add reps. Leave about two reps in the tank.',
  },
  'full-body-2': {
    audience: [
      'Busy weeks, or a gentler two-day start',
      'Want full-body coverage without a four-day split',
      'Happy to repeat the same two days for eight weeks',
    ],
    byTheEnd: [
      'Have two sessions that cover the main patterns',
      'Know how to add a little load from your log',
      'Have taken a lighter week before the last checkpoint',
    ],
    splitNote:
      'Two full-body days keep squat, hinge, push, pull, single-leg and core in the week without extra gym trips.',
    progressionNote:
      'Go up on main lifts when set 1 hits the top of the range. Week 7 is lighter. Keep two or three reps in reserve.',
  },
  'home-strength-6': {
    audience: [
      'Days you cannot get to the gym',
      'Bands and bodyweight, in a small space',
      'Three sessions a week',
    ],
    byTheEnd: [
      'Have a band and bodyweight full-body session for days you cannot get to the gym',
      'Know how to make a move harder with tempo or a stronger band',
      'Have six weeks of showing up without kit anxiety',
    ],
    splitNote:
      'A gym backup: full body with bands and the floor. The week still covers squat, hinge, push, pull, single-leg and core.',
    progressionNote:
      'Add reps first, then a stronger band or a slower lower. Holds get a few extra seconds when they feel solid.',
  },
  'upper-body-6': {
    audience: [
      'Already know the machines',
      'Want a block that focuses on push and pull',
      'Happy that legs are not the priority this block',
    ],
    byTheEnd: [
      'Have a push day, a pull day and a mixed upper day you can repeat',
      'Have practised adding load on presses and rows',
      'Know this block is deliberately upper-focused, not a full-body week',
    ],
    splitNote:
      'This plan is deliberately focused on the upper body. Legs are not trained here. Pair it with walks or a lower-body plan later if you want more balance.',
    progressionNote:
      'Main presses and rows add load when you hit the top of the range. Arm and raise work adds reps first. Leave one or two reps in the tank.',
  },
  'glute-builder-6': {
    audience: [
      'Want a glute and leg focus, kept beginner-friendly',
      'Have a full gym',
      'Training three days a week',
    ],
    byTheEnd: [
      'Have a hip-thrust and squat session you can repeat',
      'Have kept a little upper work so the week is not only lower body',
      'Have six weeks of logged lower-body work',
    ],
    splitNote:
      'This week is deliberately glute and leg focused. Upper-body work is lighter on purpose. Hinge, squat and single-leg still appear each week.',
    progressionNote:
      'Hip thrusts and squats add load first. Accessories add reps. Start lighter than you think and leave two or three reps in the tank.',
  },
  'joint-friendly-6': {
    audience: [
      'Prefer machines and a smaller range of motion',
      'Want to skip lunges and barbell squats',
      'Will skip anything that hurts and still finish the session',
    ],
    byTheEnd: [
      'Have a machine full-body session that stays comfortable',
      'Know you can swap or skip without abandoning the week',
      'Have six weeks of training without chasing heavy singles',
    ],
    splitNote:
      'Machine-led full body with no lunges or barbell squats. The week still covers squat, hinge, push, pull and core with supported kit.',
    progressionNote:
      'Add a plate only when the top of the range feels smooth. Never train through pain. Leave three reps in the tank.',
  },
  'short-cycle-4': {
    audience: [
      'Want a short full-body block',
      'Three gym days a week for four weeks',
      'Happy to repeat or switch to a longer plan after',
    ],
    byTheEnd: [
      'Have three full-body days you could run again',
      'Have a first checkpoint of a few key lifts',
      'Know whether you want another short block or a longer plan',
    ],
    splitNote:
      'Four weeks of the same three full-body days. Short on purpose, so you can finish a block without a long commitment.',
    progressionNote:
      'Add load on main lifts when you hit the top of the range. Keep two or three reps in the tank. No maximal testing.',
  },
  'barbell-strength-8': {
    audience: [
      'The basic barbell lifts already feel familiar',
      'Want squat, bench, hip thrust and Romanian deadlift as the spine of the week',
      'Can train three days a week for about 50 minutes',
    ],
    byTheEnd: [
      'Have logged eight weeks on the same four main lifts',
      'Have a midpoint and end checkpoint to compare',
      'Have taken a lighter week before the last test week',
    ],
    splitNote:
      'Three full-ish days built around squat, hinge, push and a hip thrust. Accessories fill gaps. This is for people who already know the setup.',
    progressionNote:
      'Main barbell lifts add 2.5 kg when set 1 hits the top of the range. Accessories add reps. Week 7 is about 60 to 70 percent of the usual sets.',
  },
  'one-spot-2': {
    audience: [
      'Want the dumbbell area twice a week',
      'Prefer a quiet, repeatable pair of sessions',
      'Happy with eight weeks of the same two days',
    ],
    byTheEnd: [
      'Have two one-spot sessions you could do anywhere there are dumbbells',
      'Know how to add 1 to 2 kg from your log',
      'Have taken a lighter week before the last checkpoint',
    ],
    splitNote:
      'Two full-body dumbbell days. You stay in one spot. The week still covers squat, hinge, push, pull, single-leg and core.',
    progressionNote:
      'Add 1 to 2 kg on main dumbbell lifts when you hit the top of the range. Week 7 is lighter. Leave two or three reps in the tank.',
  },
};

const GYM_WARMUP: WarmupStep[] = [
  { text: 'Easy march, bike or row', seconds: 120 },
  { text: 'Arm circles', reps: 10 },
  { text: 'Bodyweight squat', reps: 8 },
  { text: 'First main lift: two light warm-up sets' },
];

const HOME_WARMUP: WarmupStep[] = [
  { text: 'Easy march on the spot', seconds: 120 },
  { text: 'Cat-cow or shoulder rolls', reps: 8 },
  { text: 'Glute bridge', reps: 8 },
  { text: 'First move: a lighter round of the same exercise' },
];

const ONE_SPOT_WARMUP: WarmupStep[] = [
  { text: 'Easy march in your spot', seconds: 90 },
  { text: 'Arm circles', reps: 10 },
  { text: 'Bodyweight squat', reps: 8 },
  { text: 'First lift: two light warm-up sets' },
];

function empty<T>(value: T | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function formatRir(rir: number): string {
  if (rir <= 1) return 'stop with 1 rep left in the tank';
  return `stop with ${rir} reps left in the tank`;
}

export function formatTempo(tempo: string): string {
  return tempo;
}

export function formatWarmupStep(step: WarmupStep): string {
  if (step.seconds) return `${step.text} · ${step.seconds} s`;
  if (step.reps) return `${step.text} · ${step.reps} reps`;
  return step.text;
}

export function formatProgressionRule(rule: ProgressionRule, incrementKg?: number | null): string {
  if (rule === 'reps') return 'Add reps first, then a little load.';
  if (rule === 'time') return 'Add a few seconds when the hold feels solid.';
  if (incrementKg) {
    const rounded = Number(incrementKg.toFixed(2));
    return `When you hit the top of the range, add ${rounded} kg next time.`;
  }
  return 'When you hit the top of the range, add a little load next time.';
}

export function rirForDifficulty(difficulty: RoutineDifficulty, role: ExerciseRole): number {
  if (difficulty === 'beginner') return 3;
  if (role === 'main') return difficulty === 'experienced' ? 2 : 2;
  return 2;
}

export function roleForSlot(
  position: number,
  count: number,
  exercise: Pick<SlotExercise, 'id' | 'primary_muscle'>
): ExerciseRole {
  if (CORE_IDS.has(exercise.id) || exercise.primary_muscle === 'core') return 'core';
  if (position === 1) return 'main';
  if (position === 2 && count >= 4) return 'main';
  if (position === 2) return 'secondary';
  if (position === 3 && count >= 5) return 'secondary';
  return 'accessory';
}

export function loadIncrementKg(equipment: SlotExercise['equipment']): number {
  if (equipment === 'barbell') return 2.5;
  if (equipment === 'machine' || equipment === 'cable') return 2.5;
  if (equipment === 'dumbbell' || equipment === 'kettlebell') return 2;
  return 2;
}

export function warmupForRoutine(routineId: string, equipment: string): WarmupStep[] {
  if (routineId === 'home-strength-6' || equipment === 'home') return HOME_WARMUP;
  if (
    routineId === 'gym-confidence-6' ||
    routineId.includes('one-spot') ||
    equipment === 'dumbbells'
  ) {
    return ONE_SPOT_WARMUP;
  }
  return GYM_WARMUP;
}

export function focusFromDayName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('upper') && lower.includes('lower')) return 'Full body';
  if (lower.includes('upper')) return 'Upper body';
  if (lower.includes('lower') || lower.includes('glute')) return 'Glutes and legs';
  if (lower.includes('push')) return 'Push';
  if (lower.includes('pull')) return 'Pull';
  if (lower.includes('one spot')) return 'Full body, one spot';
  return 'Full body';
}

export function coachNoteForDay(name: string, difficulty: RoutineDifficulty): string {
  const focus = focusFromDayName(name).toLowerCase();
  if (difficulty === 'beginner') {
    if (focus.includes('one spot')) {
      return 'Stay in your spot. The first set of each lift is for finding a weight you could still lift three more times.';
    }
    return 'Move kindly. Find a weight you could lift three more times, and stop if anything feels sharp.';
  }
  if (focus.includes('lower') || focus.includes('glute')) {
    return 'Own the hip hinge and the squat. Keep the last two reps tidy rather than heavy.';
  }
  if (focus.includes('upper') || focus.includes('push') || focus.includes('pull')) {
    return 'Leave a little in the tank on the main press and row. Shoulders stay down and the path stays quiet.';
  }
  return 'Same session as last time. Add load only if the top of the range felt smooth.';
}

export type PhaseCopy = {
  fromWeek: number;
  toWeek: number;
  name: string;
  goal: string;
  lighter?: boolean;
};

export function phasesForRoutine(routineId: string, lengthWeeks: number): PhaseCopy[] {
  if (routineId === 'gym-confidence-6') {
    return [
      { fromWeek: 1, toWeek: 2, name: 'Learn the movements', goal: 'Stay in one dumbbell spot and learn the session.' },
      { fromWeek: 3, toWeek: 4, name: 'Add machines', goal: 'Keep the same patterns on a few machines.' },
      { fromWeek: 5, toWeek: 6, name: 'Add free weights', goal: 'Try two simple free-weight lifts and re-test.' },
    ];
  }
  if (lengthWeeks <= 4) {
    return [
      { fromWeek: 1, toWeek: 2, name: 'Learn the movements', goal: 'Find starting weights and tidy the path.' },
      { fromWeek: 3, toWeek: lengthWeeks, name: 'Build', goal: 'Add a little when the top of the range feels smooth.' },
    ];
  }
  if (lengthWeeks >= 8) {
    return [
      { fromWeek: 1, toWeek: 2, name: 'Learn the movements', goal: 'Settle into the days and starting loads.' },
      { fromWeek: 3, toWeek: lengthWeeks - 2, name: 'Build', goal: 'Add load or reps when you earn it.' },
      {
        fromWeek: lengthWeeks - 1,
        toWeek: lengthWeeks - 1,
        name: 'Lighter week',
        goal: 'Fewer sets, same weights. Arrive fresh for the last week.',
        lighter: true,
      },
      { fromWeek: lengthWeeks, toWeek: lengthWeeks, name: 'Test', goal: 'Re-test two or three key lifts. Leave reps in the tank.' },
    ];
  }
  return [
    { fromWeek: 1, toWeek: 2, name: 'Learn the movements', goal: 'Find starting weights and learn the days.' },
    { fromWeek: 3, toWeek: lengthWeeks - 1, name: 'Build', goal: 'Add a little when the top of the range feels smooth.' },
    { fromWeek: lengthWeeks, toWeek: lengthWeeks, name: 'Test', goal: 'Repeat the key lifts and notice what has changed.' },
  ];
}

export function phaseForWeek(routineId: string, lengthWeeks: number, weekNumber: number): PhaseCopy | null {
  return (
    phasesForRoutine(routineId, lengthWeeks).find(
      (phase) => weekNumber >= phase.fromWeek && weekNumber <= phase.toWeek
    ) ?? null
  );
}

export function briefForRoutine(routineId: string, difficulty: RoutineDifficulty): RoutineBrief {
  const listed = ROUTINE_BRIEFS[routineId];
  if (listed) return listed;
  return {
    audience: [
      'Healthy adults who want a clear plan',
      `${difficulty === 'beginner' ? 'New to lifting or coming back' : 'Already comfortable with the main lifts'}`,
    ],
    byTheEnd: ['Have a repeatable week of sessions', 'Know how to add a little from your own log'],
    splitNote: 'Each day has a stated focus. Follow the week as written, and swap if a piece of kit is taken.',
    progressionNote:
      'Main lifts add load when you hit the top of the range. Accessories add reps first. Leave reps in the tank.',
  };
}

export type CoachableExercise = {
  position: number;
  exercise: SlotExercise;
  role?: ExerciseRole | null;
  target_rir?: number | null;
  tempo?: string | null;
  progression_rule?: ProgressionRule | null;
  load_increment_kg?: number | null;
  notes?: string | null;
  alternative_exercise_ids?: string[] | null;
  superset_group?: string | null;
};

export function withExerciseCoaching<T extends CoachableExercise>(
  item: T,
  count: number,
  difficulty: RoutineDifficulty
): T {
  const role = empty(item.role) ? roleForSlot(item.position, count, item.exercise) : (item.role as ExerciseRole);
  const rir = empty(item.target_rir) ? rirForDifficulty(difficulty, role) : item.target_rir;
  const rule: ProgressionRule =
    empty(item.progression_rule)
      ? role === 'main' || role === 'secondary'
        ? 'load'
        : 'reps'
      : (item.progression_rule as ProgressionRule);
  const increment =
    empty(item.load_increment_kg) && rule === 'load' ? loadIncrementKg(item.exercise.equipment) : item.load_increment_kg;
  const tempo =
    empty(item.tempo) && difficulty === 'beginner' && role === 'main' ? '3-second lowering' : item.tempo ?? null;
  const alternatives = empty(item.alternative_exercise_ids)
    ? ALTERNATIVES[item.exercise.id] ?? []
    : item.alternative_exercise_ids;
  return {
    ...item,
    role,
    target_rir: rir,
    tempo,
    progression_rule: rule,
    load_increment_kg: increment,
    alternative_exercise_ids: alternatives,
  };
}
