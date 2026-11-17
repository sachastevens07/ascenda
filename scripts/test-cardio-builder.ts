import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildQuickCardioPlan,
  effortSettingsBand,
  nameQuickCardioPlan,
  parseCardioBuilderSpec,
  settingsForEffort,
} from '../src/lib/cardioBuilder.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = parseCardioBuilderSpec(
  JSON.parse(readFileSync(join(root, 'content/cardio/cardio-builder.json'), 'utf8'))
);

test('steady 20 minutes with warm-up stays 20 minutes', () => {
  const plan = buildQuickCardioPlan(
    { machineId: 'treadmill', style: 'steady', minutes: 20, includeWarmup: true },
    spec,
    'Treadmill'
  );
  const total = plan.intervals.reduce((sum, item) => sum + item.seconds, 0);
  assert.equal(plan.duration_minutes, 20);
  assert.equal(total, 20 * 60);
  assert.equal(plan.intervals[0]?.label, spec.quickStart.blockLabels.warmup);
  assert.equal(plan.intervals[0]?.seconds, 180);
  assert.equal(plan.intervals[0]?.effort, 3);
  assert.equal(plan.intervals.at(-1)?.label, spec.quickStart.blockLabels.cooldown);
  assert.equal(plan.intervals.at(-1)?.seconds, 180);
  assert.equal(plan.intervals[1]?.effort, 5);
  assert.equal(plan.intervals[1]?.seconds, 840);
});

test('steady without warm-up is one block', () => {
  const plan = buildQuickCardioPlan(
    { machineId: 'bike', style: 'steady', minutes: 20, includeWarmup: false },
    spec,
    'Bike'
  );
  assert.equal(plan.intervals.length, 1);
  assert.equal(plan.intervals[0]?.seconds, 1200);
  assert.equal(plan.intervals[0]?.effort, 5);
});

test('intervals fill rule repeats work and recover, then extra easy', () => {
  const plan = buildQuickCardioPlan(
    { machineId: 'rower', style: 'intervals', minutes: 20, includeWarmup: true },
    spec,
    'Rower'
  );
  const middle = plan.intervals.slice(1, -1);
  assert.equal(plan.intervals.reduce((sum, item) => sum + item.seconds, 0), 1200);
  assert.equal(middle[0]?.seconds, 60);
  assert.equal(middle[0]?.effort, 7);
  assert.equal(middle[1]?.seconds, 120);
  assert.equal(middle[1]?.effort, 4);
  const lastMiddle = middle.at(-1);
  assert.equal(lastMiddle?.label, spec.quickStart.blockLabels.easy);
  assert.equal(lastMiddle?.seconds, 120);
  assert.equal(lastMiddle?.effort, 4);
  assert.equal(middle.length, 9);
});

test('intervals skip a partial work block when a full repeat does not fit', () => {
  const plan = buildQuickCardioPlan(
    { machineId: 'bike', style: 'intervals', minutes: 10, includeWarmup: true },
    spec,
    'Bike'
  );
  const middle = plan.intervals.slice(1, -1);
  assert.equal(middle[0]?.seconds, 60);
  assert.equal(middle[1]?.seconds, 120);
  assert.equal(middle[2]?.seconds, 60);
  assert.equal(middle[2]?.effort, 4);
  assert.equal(middle.length, 3);
});

test('settings defaults follow effort bands', () => {
  assert.equal(effortSettingsBand(3), 'easy');
  assert.equal(effortSettingsBand(5), 'steady');
  assert.equal(effortSettingsBand(7), 'hard');
  const easy = settingsForEffort('treadmill', 3, spec);
  const hard = settingsForEffort('treadmill', 7, spec);
  assert.deepEqual(easy.speed_kmh, [4, 5]);
  assert.deepEqual(hard.speed_kmh, [6, 8]);
  assert.equal(hard.note, 'A power walk or easy jog');
});

test('auto-name comes from the naming templates', () => {
  assert.equal(nameQuickCardioPlan('treadmill', 'steady', 20, spec, 'Treadmill'), 'Treadmill steady, 20 min');
  assert.equal(
    nameQuickCardioPlan('cross_trainer', 'intervals', 15, spec, 'Cross-trainer'),
    'Cross-trainer intervals, 15 min'
  );
});
