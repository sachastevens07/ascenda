import { formatTrainingHours, sessionDurationSeconds, type FinishedSessionMeta } from '@/lib/activityStats';
import { resolveExerciseSlug } from '@/lib/contentGuides';
import { contentRoutine } from '@/lib/contentRoutines';
import { formatKg, usesWeight } from '@/lib/programmes';
import { getPersonalBests, type ProgressSet } from '@/lib/progress';
import { fetchEnrolment, fetchRoutine, type Routine, type RoutineEnrolment } from '@/lib/routines';
import { supabase } from '@/lib/supabase';

export type LiftCompare = {
  exerciseId: string;
  name: string;
  startKg: number;
  nowKg: number;
};

export type EnrolmentReview = {
  enrolment: RoutineEnrolment;
  sessions: number;
  durationSeconds: number;
  personalBests: number;
  lifts: LiftCompare[];
};

function isMissingCheckpoints(error: { message?: string; code?: string }): boolean {
  return /checkpoint_results/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

type WeightedSet = {
  exerciseId: string;
  name: string;
  weightKg: number;
  date: string;
};

function findExerciseInRoutine(routine: Routine, slug: string): { id: string; name: string } | null {
  const wanted = resolveExerciseSlug(slug);
  for (const week of routine.weeks) {
    for (const day of week.days) {
      for (const slot of day.exercises) {
        const id = slot.exercise.id;
        if (id === slug || id === wanted || resolveExerciseSlug(id) === wanted) {
          return { id, name: slot.exercise.name };
        }
      }
    }
  }
  return null;
}

function liftsByFrequency(routine: Routine, limit: number): { id: string; name: string }[] {
  const counts = new Map<string, { name: string; count: number; first: number }>();
  let index = 0;
  for (const week of routine.weeks) {
    for (const day of week.days) {
      for (const slot of day.exercises) {
        if (!usesWeight(slot.exercise.equipment)) continue;
        const current = counts.get(slot.exercise.id) ?? {
          name: slot.exercise.name,
          count: 0,
          first: index,
        };
        current.count += 1;
        counts.set(slot.exercise.id, current);
        index += 1;
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .slice(0, limit)
    .map(([id, value]) => ({ id, name: value.name }));
}

/** Checkpoint lifts from /content, then the weighted lifts she sees most often. */
export function pickKeyLifts(routine: Routine, limit = 3): { id: string; name: string }[] {
  const overlay = contentRoutine(routine.slug) ?? contentRoutine(routine.id);
  const fromContent: { id: string; name: string }[] = [];
  for (const slug of overlay?.checkpoint_lifts ?? []) {
    const match = findExerciseInRoutine(routine, slug);
    if (match && !fromContent.some((item) => item.id === match.id)) fromContent.push(match);
    if (fromContent.length >= limit) return fromContent;
  }
  if (fromContent.length > 0) return fromContent;
  return liftsByFrequency(routine, limit);
}

export function formatLiftCompare(lift: LiftCompare): string {
  return `${lift.name}: ${formatKg(lift.startKg)} → ${formatKg(lift.nowKg)}`;
}

async function enrolmentWeightedSets(enrolmentId: string): Promise<WeightedSet[]> {
  const { data, error } = await supabase
    .from('sets')
    .select(
      'weight_kg, exercise_id, exercise:exercises(name, equipment), session:sessions!inner(date, completed_at, routine_enrolment_id)'
    )
    .eq('completed', true)
    .eq('session.routine_enrolment_id', enrolmentId)
    .not('session.completed_at', 'is', null)
    .order('id');
  if (error) {
    if (/routine_enrolment_id/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  const rows = (data ?? []) as {
    weight_kg: number | string | null;
    exercise_id: string;
    exercise: { name: string; equipment: string } | { name: string; equipment: string }[] | null;
    session: { date: string } | { date: string }[] | null;
  }[];
  const result: WeightedSet[] = [];
  for (const row of rows) {
    const exercise = Array.isArray(row.exercise) ? row.exercise[0] : row.exercise;
    const session = Array.isArray(row.session) ? row.session[0] : row.session;
    if (!exercise || !session || row.weight_kg === null) continue;
    if (!usesWeight(exercise.equipment as never)) continue;
    result.push({
      exerciseId: row.exercise_id,
      name: exercise.name,
      weightKg: Number(row.weight_kg),
      date: session.date,
    });
  }
  return result;
}

export function compareKeyLifts(
  keys: { id: string; name: string }[],
  sets: WeightedSet[]
): LiftCompare[] {
  const lifts: LiftCompare[] = [];
  for (const key of keys) {
    const rows = sets.filter((item) => item.exerciseId === key.id);
    if (rows.length === 0) continue;
    const startKg = rows[0].weightKg;
    const nowKg = rows.reduce((max, item) => Math.max(max, item.weightKg), rows[0].weightKg);
    lifts.push({ exerciseId: key.id, name: key.name, startKg, nowKg });
  }
  return lifts;
}

async function saveCheckpointResults(
  enrolmentId: string,
  week: number,
  lifts: LiftCompare[]
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  for (const lift of lifts) {
    const { error } = await supabase.from('checkpoint_results').upsert(
      {
        user_id: user.id,
        enrolment_id: enrolmentId,
        exercise_id: lift.exerciseId,
        week,
        weight_kg: lift.nowKg,
        reps: null,
      },
      { onConflict: 'enrolment_id,week,exercise_id' }
    );
    if (error && isMissingCheckpoints(error)) return;
    if (error) throw new Error(error.message);
  }
}

/** After a session, if that day sits in a checkpoint week, save and return start vs now lines. */
export async function recordCheckpointIfNeeded(
  enrolmentId: string,
  routineDayId: string
): Promise<string[]> {
  const enrolment = await fetchEnrolment(enrolmentId);
  if (!enrolment) return [];
  const routine = await fetchRoutine(enrolment.routine_id);
  if (!routine) return [];
  const week = routine.weeks.find((item) => item.days.some((day) => day.id === routineDayId));
  if (!week?.is_checkpoint) return [];
  const keys = pickKeyLifts(routine);
  const sets = await enrolmentWeightedSets(enrolmentId);
  const lifts = compareKeyLifts(keys, sets);
  if (lifts.length > 0) {
    await saveCheckpointResults(enrolmentId, week.week_number, lifts).catch(() => {});
  }
  return lifts.map((lift) => `Checkpoint: ${formatLiftCompare(lift)}`);
}

export async function fetchEnrolmentReview(
  enrolment: RoutineEnrolment,
  sessions: FinishedSessionMeta[],
  progressSets: ProgressSet[]
): Promise<EnrolmentReview> {
  const routine = await fetchRoutine(enrolment.routine_id, { includeLockedWeeks: true }).catch(() => null);
  const owned = sessions.filter((session) => session.routine_enrolment_id === enrolment.id);
  const durationSeconds = owned.reduce((sum, session) => sum + sessionDurationSeconds(session), 0);
  const start = enrolment.start_date;
  const end = enrolment.completed_at?.slice(0, 10) ?? null;
  const inWindow = progressSets.filter((set) => {
    if (set.date < start) return false;
    if (end && set.date > end) return false;
    return true;
  });
  const keys = routine ? pickKeyLifts(routine) : [];
  const weighted = await enrolmentWeightedSets(enrolment.id);
  return {
    enrolment,
    sessions: owned.length,
    durationSeconds,
    personalBests: getPersonalBests(inWindow).length,
    lifts: compareKeyLifts(keys, weighted),
  };
}

export function describeReview(review: EnrolmentReview): string {
  const hours = formatTrainingHours(review.durationSeconds);
  const sessionLabel = review.sessions === 1 ? 'session' : 'sessions';
  const pbLabel = review.personalBests === 1 ? 'personal best' : 'personal bests';
  return `${review.sessions} ${sessionLabel}, ${hours}, ${review.personalBests} ${pbLabel}.`;
}
