import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  ZONE_LABELS,
  ZONES,
  type Equipment,
  type Exercise,
  type Zone,
} from '@/lib/exercises';
import type { ProgressSet } from '@/lib/progress';

export type GymBadge = {
  id: string;
  title: string;
  detail: string;
  unlocked: boolean;
  unlockedOn: string | null;
};

export type GymUnlocked = {
  exerciseCount: number;
  equipmentCount: number;
  badges: GymBadge[];
};

const EQUIPMENT_FIRST: Record<Equipment, { title: string; detail: string }> = {
  barbell: { title: 'First barbell lift', detail: 'You loaded a bar.' },
  machine: { title: 'First machine', detail: 'You used a gym machine.' },
  cable: { title: 'First cable exercise', detail: 'You used a cable stack.' },
  dumbbell: { title: 'First dumbbell lift', detail: 'You picked up dumbbells.' },
  kettlebell: { title: 'First kettlebell', detail: 'You used a kettlebell.' },
  band: { title: 'First band exercise', detail: 'You used a resistance band.' },
  bodyweight: { title: 'First bodyweight move', detail: 'You trained with just you.' },
};

const ZONE_FIRST: Record<Zone, { title: string; detail: string }> = {
  1: { title: 'Corner unlocked', detail: 'You trained in one quiet spot.' },
  2: { title: 'Dumbbell area unlocked', detail: 'You used the open dumbbell floor.' },
  3: { title: 'Machines unlocked', detail: 'You used the machine area.' },
  4: { title: 'Rack unlocked', detail: 'You used the barbell or squat rack.' },
};

const EXERCISE_MILESTONES = [1, 5, 10, 25] as const;

function firstDate(sets: ProgressSet[], match: (set: ProgressSet) => boolean): string | null {
  const hit = sets.find(match);
  return hit?.date ?? null;
}

/** Distinct exercises and equipment from ticked sets in finished sessions, plus first-time badges. */
export function getGymUnlocked(
  sets: ProgressSet[],
  options?: { knownEquipment?: Equipment[] }
): GymUnlocked {
  const exerciseIds = new Set(sets.map((set) => set.exerciseId));
  const equipmentUsed = new Set(sets.map((set) => set.equipment));
  for (const equipment of options?.knownEquipment ?? []) equipmentUsed.add(equipment);
  const badges: GymBadge[] = [];

  for (const equipment of EQUIPMENT) {
    const unlockedOn = firstDate(sets, (set) => set.equipment === equipment);
    badges.push({
      id: `equipment-${equipment}`,
      title: EQUIPMENT_FIRST[equipment].title,
      detail: EQUIPMENT_FIRST[equipment].detail,
      unlocked: unlockedOn !== null,
      unlockedOn,
    });
  }

  for (const zone of ZONES) {
    const unlockedOn = firstDate(sets, (set) => set.zone === zone);
    badges.push({
      id: `zone-${zone}`,
      title: ZONE_FIRST[zone].title,
      detail: ZONE_FIRST[zone].detail,
      unlocked: unlockedOn !== null,
      unlockedOn,
    });
  }

  for (const count of EXERCISE_MILESTONES) {
    const unlocked = exerciseIds.size >= count;
    const unlockedOn = unlocked
      ? [...exerciseIds]
          .map((id) => firstDate(sets, (set) => set.exerciseId === id))
          .filter((date): date is string => date !== null)
          .sort()[count - 1] ?? null
      : null;
    badges.push({
      id: `exercises-${count}`,
      title: count === 1 ? 'First exercise' : `${count} exercises tried`,
      detail:
        count === 1
          ? 'You logged your first lift.'
          : `You’ve tried ${count} different exercises.`,
      unlocked,
      unlockedOn,
    });
  }

  return {
    exerciseCount: exerciseIds.size,
    equipmentCount: equipmentUsed.size,
    badges,
  };
}

/** Conservative setup steps from kit and zone. Coach can replace these later per exercise. */
export function setupStepsFor(
  exercise: Pick<Exercise, 'name' | 'equipment' | 'zone'>
): string[] {
  const needsBench = /bench|hip thrust|incline|decline|skull/i.test(exercise.name);
  switch (exercise.equipment) {
    case 'dumbbell':
      return [
        'Find the dumbbell rack. Pick a pair you can control for every rep.',
        needsBench
          ? 'Take the nearest free bench and set it flat, or at a slight incline if the name says incline.'
          : 'Stand a step back from the walkway so people can pass.',
        'Do one slow practice rep. If it feels shaky, choose a lighter pair.',
      ];
    case 'barbell':
      return [
        exercise.zone === 4
          ? 'Find a free squat rack or bench station. Load the same plates on both sides.'
          : 'Find a free bar. Load the same plates on both sides.',
        'Put clips on the bar before you lift.',
        'Start lighter than you think. A practice set tells you more than a guess.',
      ];
    case 'machine':
      return [
        'Find the machine. The name on the frame usually matches this exercise.',
        'Set the seat or pads so the moving part lines up with the joint you are working.',
        'Pin a light plate first and do a slow practice rep before you add load.',
      ];
    case 'cable':
      return [
        'Find a free cable stack. Clip on the handle this exercise uses.',
        'Set the pulley to the height in the form cues, then choose a light plate.',
        'Stand where the cable can travel in a straight line. Keep the stack from banging.',
      ];
    case 'kettlebell':
      return [
        'Find the kettlebells. Pick one you can hold without your grip giving out.',
        'Give yourself a clear patch of floor, away from the walkway.',
        'Practise the first part of the move slowly before you add speed.',
      ];
    case 'band':
      return [
        'Pick a band you can move through the full range without snapping it back.',
        'Anchor it only to a stable rack or door attachment, never a loose bench.',
        'Check the band is flat and fully on before you start the set.',
      ];
    case 'bodyweight':
      return [
        'Find a clear patch of floor, or the station this move uses.',
        'If you need a bench or bar, take the nearest free one.',
        'Do a slow first rep. Shorten the range if anything feels sharp.',
      ];
  }
}

export function equipmentListLabel(count: number): string {
  return count === 1 ? '1 type of equipment' : `${count} types of equipment`;
}

export function exerciseListLabel(count: number): string {
  return count === 1 ? '1 exercise tried' : `${count} exercises tried`;
}

export { EQUIPMENT_LABELS, ZONE_LABELS };
