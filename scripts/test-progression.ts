/**
 * Re-tests the double-progression rule after B2 v2.
 * Mirrors getWeightSuggestion in src/lib/programmes.ts (holdIncrease + lighter skipped elsewhere).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

type SetType = 'normal' | 'warmup' | 'drop';
type LoggedSet = {
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  completed: boolean;
  set_type: SetType;
};

function workingSets(sets: LoggedSet[]): LoggedSet[] {
  return sets.filter((set) => set.set_type === 'normal');
}

function heaviest(sets: LoggedSet[]): number | null {
  const weights = sets.flatMap((set) => (set.weight_kg === null ? [] : [set.weight_kg]));
  return weights.length > 0 ? Math.max(...weights) : null;
}

function suggest(input: {
  repMax: number;
  increaseKg: number | null;
  previous: LoggedSet[];
  holdIncrease?: boolean;
}): 'increase' | 'same-weight' | 'find-starting-weight' {
  const working = workingSets(input.previous);
  const firstSet = working.find((set) => set.set_number === 1) ?? working[0];
  const hitTop = firstSet !== undefined && (firstSet.reps ?? 0) >= input.repMax;
  const lastKg = heaviest(working);
  if (lastKg === null) return 'find-starting-weight';
  const baseKg = firstSet?.weight_kg ?? null;
  if (input.holdIncrease || !hitTop || baseKg === null || !input.increaseKg) return 'same-weight';
  const kg = Math.max(0, Number((baseKg + input.increaseKg).toFixed(2)));
  return kg === baseKg ? 'same-weight' : 'increase';
}

function set(reps: number, kg: number, type: SetType = 'normal'): LoggedSet {
  return { set_number: 1, weight_kg: kg, reps, completed: true, set_type: type };
}

test('hitting the top of the range suggests an increase', () => {
  assert.equal(
    suggest({
      repMax: 10,
      increaseKg: 2.5,
      previous: [set(10, 20), { ...set(10, 20), set_number: 2 }],
    }),
    'increase'
  );
});

test('below the top of the range stays at the same weight', () => {
  assert.equal(
    suggest({
      repMax: 10,
      increaseKg: 2.5,
      previous: [set(8, 20)],
    }),
    'same-weight'
  );
});

test('warmup and drop sets never earn an increase', () => {
  assert.equal(
    suggest({
      repMax: 10,
      increaseKg: 2.5,
      previous: [set(10, 20, 'warmup'), set(10, 20, 'drop')],
    }),
    'find-starting-weight'
  );
});

test('steady check-in or two Harder in a row holds the increase', () => {
  assert.equal(
    suggest({
      repMax: 10,
      increaseKg: 2.5,
      previous: [set(10, 20)],
      holdIncrease: true,
    }),
    'same-weight'
  );
});

test('lighter sessions are skipped by fetchPreviousSets, so the last normal day still drives the next suggestion', () => {
  const lastNormal = [set(10, 20)];
  assert.equal(suggest({ repMax: 10, increaseKg: 2.5, previous: lastNormal }), 'increase');
});
