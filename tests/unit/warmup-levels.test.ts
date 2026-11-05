// The level sets (spec §17.6.1, §17.4.4; design §2.11, §2.15): the protocol's blocks as levels,
// with the existing schedules' items, order and timings unchanged.
import assert from 'node:assert/strict';
import test from 'node:test';
import { recalibrationSchedule } from '../../src/core/calibration/drift.ts';
import { calibrationSchedule, validationSchedule } from '../../src/core/protocol/schedule.ts';
import { levelKeys, warmupPlan, withoutItems } from '../../src/core/warmup/levels.ts';

const SEED = 4242;

test('Standard: Pop (CAL13), Follow (pursuit), Turn (HEAD5), Test (VAL12)', () => {
  const plan = warmupPlan({ mode: 'full', preset: 'standard', seed: SEED });
  assert.deepEqual(plan.levels.map((l) => l.key), ['pop', 'follow', 'turn', 'test']);
  assert.deepEqual(plan.levels.map((l) => [l.number, l.of]), [[1, 4], [2, 4], [3, 4], [4, 4]]);
  assert.deepEqual(plan.levels.map((l) => l.items.length), [13, 1, 5, 12]);
  assert.deepEqual(plan.levels.map((l) => l.recording), ['calibration', 'calibration', 'calibration', 'validation']);
  // The schedules are the protocol's, item for item.
  assert.deepEqual(plan.calibration, calibrationSchedule({ preset: 'standard', seed: SEED }));
  assert.deepEqual(plan.validation, validationSchedule({ preset: 'standard', seed: SEED }));
  const calItems = plan.calibration!.items.filter((i) => i.kind !== 'instruction');
  assert.deepEqual(plan.levels.slice(0, 3).flatMap((l) => l.items), calItems);
  assert.equal(plan.levels[1]!.items[0]!.kind, 'pursuit');
  assert.ok(plan.levels[2]!.items.every((i) => i.kind === 'target' && i.headMotion === true));
  assert.equal(plan.levels[0]!.nameKey, 'warmup.level.pop.name');
  assert.equal(plan.levels[1]!.skippable, false);
});

test('Quick: Pop (CAL9) and Test (VAL6); Thorough adds Lean in, which re-latches home', () => {
  const quick = warmupPlan({ mode: 'full', preset: 'quick', seed: SEED, speed: 4 });
  assert.deepEqual(quick.levels.map((l) => [l.key, l.items.length]), [['pop', 9], ['test', 6]]);
  assert.deepEqual(quick.levels.map((l) => l.of), [2, 2]);
  assert.equal((quick.levels[0]!.items[0] as { settleMs: number }).settleMs, 150, 'durations ÷ speed');
  const thorough = warmupPlan({ mode: 'full', preset: 'thorough', seed: SEED });
  assert.deepEqual(thorough.levels.map((l) => l.key), ['pop', 'follow', 'turn', 'lean', 'test']);
  assert.deepEqual(thorough.levels.map((l) => l.rehome), [false, false, false, true, false]);
  assert.equal(thorough.levels[3]!.items.length, 13);
  assert.deepEqual(levelKeys('quick'), ['pop', 'test']);
  assert.deepEqual(levelKeys('thorough'), ['pop', 'follow', 'turn', 'lean', 'test']);
});

test('restore: one Test round on VAL6; quick-warmup: RECAL5 then VAL6', () => {
  const restore = warmupPlan({ mode: 'restore', preset: 'standard', seed: SEED });
  assert.equal(restore.calibration, null);
  assert.deepEqual(restore.levels.map((l) => [l.key, l.number, l.of, l.items.length]), [['test', 1, 1, 6]]);
  assert.deepEqual(restore.validation, validationSchedule({ preset: 'quick', seed: SEED }));
  const quick = warmupPlan({ mode: 'quick-warmup', preset: 'standard', seed: SEED, recalibration: 2 });
  assert.deepEqual(quick.levels.map((l) => [l.key, l.items.length]), [['pop', 5], ['test', 6]]);
  assert.deepEqual(quick.calibration, recalibrationSchedule({ seed: SEED, n: 2, preset: 'standard' }));
  assert.ok(quick.levels[0]!.items.every((i) => i.kind === 'target' && i.phase === 'fixation'));
});

test('under reduced motion the pursuit stays, skippable; skipping it gives the skipPursuit schedule', () => {
  const plan = warmupPlan({ mode: 'full', preset: 'standard', seed: SEED, reducedMotion: true });
  assert.equal(plan.levels[1]!.skippable, true);
  const skipped = withoutItems(plan.calibration!, new Set(['B-pursuit']), new Set(['I-pursuit']));
  assert.deepEqual(skipped, calibrationSchedule({ preset: 'standard', seed: SEED, skipPursuit: true }));
});
