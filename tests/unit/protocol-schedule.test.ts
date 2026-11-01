// WP8 (spec §10.1): layouts, seeded schedules and the e2e speed factor (§4.7).
import assert from 'node:assert/strict';
import test from 'node:test';
import { FIXATION, HEAD_BLOCK, PURSUIT, VALIDATION } from '../../src/core/constants.ts';
import { CAL13, CAL9, HEAD5, RECAL5, VAL6, VAL_JITTER, nearestCalibrationGroup, val12 } from '../../src/core/protocol/layouts.ts';
import { calibrationSchedule, minAcceptedFrames, scheduleBlocks, streamSeed, validationSchedule } from '../../src/core/protocol/schedule.ts';
import { mulberry32 } from '../../src/core/maths/rng.ts';
import type { PursuitItem, Schedule, TargetItem } from '../../src/core/types.ts';

const targets = (s: Schedule) => s.items.filter((i): i is TargetItem => i.kind === 'target');

test('layouts: CAL13, CAL9, HEAD5 and RECAL5 share group ids; VAL6 is fixed', () => {
  assert.equal(CAL13.length, 13);
  assert.deepEqual(CAL13.map((p) => p.groupId), Array.from({ length: 13 }, (_, k) => `loc-${k}`));
  assert.deepEqual(CAL13[4], { xNorm: 0.5, yNorm: 0.5, groupId: 'loc-4' });
  assert.deepEqual(CAL9, CAL13.slice(0, 9));
  assert.deepEqual(HEAD5.map((p) => p.groupId), ['loc-4', 'loc-9', 'loc-10', 'loc-11', 'loc-12']);
  assert.deepEqual(RECAL5, HEAD5);
  for (const p of HEAD5) assert.ok(CAL13.includes(p));
  assert.deepEqual(VAL6.map((p) => [p.xNorm, p.yNorm]), [[0.15, 0.15], [0.85, 0.15], [0.38, 0.5], [0.62, 0.5], [0.15, 0.85], [0.85, 0.85]]);
});

test('VAL12 is jittered within ±0.02, seeded, and never within 0.05 of a calibration point', () => {
  for (let seed = 0; seed < 200; seed++) {
    const pts = val12(mulberry32(seed));
    assert.equal(pts.length, 12);
    const xs = [0.15, 0.38, 0.62, 0.85];
    const ys = [0.15, 0.5, 0.85];
    pts.forEach((p, k) => {
      assert.ok(Math.abs(p.xNorm - (xs[k % 4] as number)) <= VAL_JITTER && Math.abs(p.yNorm - (ys[Math.floor(k / 4)] as number)) <= VAL_JITTER);
      assert.equal(p.groupId, `val-${k}`);
      for (const q of [...CAL13, ...HEAD5]) assert.ok(Math.hypot(p.xNorm - q.xNorm, p.yNorm - q.yNorm) >= 0.05 - 1e-12, `seed ${seed}: ${p.groupId} near ${q.groupId}`);
    });
  }
  for (const p of VAL6) for (const q of CAL13) assert.ok(Math.hypot(p.xNorm - q.xNorm, p.yNorm - q.yNorm) >= 0.05);
  assert.deepEqual(val12(mulberry32(5)), val12(mulberry32(5)));
  assert.notDeepEqual(val12(mulberry32(5)), val12(mulberry32(6)));
});

test('the same seed gives the same schedule; another seed reorders it', () => {
  for (const preset of ['quick', 'standard', 'thorough'] as const) {
    assert.deepEqual(calibrationSchedule({ preset, seed: 42 }), calibrationSchedule({ preset, seed: 42 }));
    assert.deepEqual(validationSchedule({ preset, seed: 42 }), validationSchedule({ preset, seed: 42 }));
  }
  const a = targets(calibrationSchedule({ preset: 'standard', seed: 1 })).map((t) => t.id);
  const b = targets(calibrationSchedule({ preset: 'standard', seed: 2 })).map((t) => t.id);
  assert.notDeepEqual(a, b);
  assert.deepEqual([...a].sort(), [...b].sort());
  // Validation draws from its own stream, so its order is not the calibration's.
  assert.notEqual(streamSeed(9, 'validation'), streamSeed(9, 'calibration'));
  assert.equal(streamSeed(9, 'calibration'), 9);
});

test('presets: blocks, item counts, ids, groups and durations', () => {
  const quick = calibrationSchedule({ preset: 'quick', seed: 3 });
  assert.deepEqual(scheduleBlocks(quick).map((b) => [b.block, b.items.length]), [[1, 9]]);
  assert.equal(new Set(targets(quick).map((t) => t.groupId)).size, 9);
  for (const t of targets(quick)) {
    assert.equal(t.phase, 'fixation');
    assert.equal(t.id, `A-${t.groupId}`);
    assert.deepEqual([t.settleMs, t.sampleMs, t.maxSampleMs], [FIXATION.settleMs, FIXATION.sampleMs, FIXATION.maxSampleMs]);
  }

  const standard = calibrationSchedule({ preset: 'standard', seed: 3 });
  const blocks = scheduleBlocks(standard);
  assert.deepEqual(blocks.map((b) => [b.block, b.items.length, b.instruction?.textKey]), [
    [1, 13, 'protocol.instr.fixation'],
    [2, 1, 'protocol.instr.pursuit'],
    [3, 5, 'protocol.instr.head'],
  ]);
  const pursuit = standard.items.find((i): i is PursuitItem => i.kind === 'pursuit')!;
  assert.deepEqual([pursuit.periodMs, pursuit.holdMs, pursuit.discardMs, pursuit.ax, pursuit.ay], [PURSUIT.periodMs, PURSUIT.holdMs, PURSUIT.discardMs, 0.42, 0.42]);
  const head = targets(standard).filter((t) => t.phase === 'head');
  assert.equal(head.length, 5);
  for (const t of head) {
    assert.equal(t.headMotion, true);
    assert.deepEqual([t.settleMs, t.sampleMs, t.maxSampleMs], [HEAD_BLOCK.settleMs, HEAD_BLOCK.yawMs + HEAD_BLOCK.pitchMs, HEAD_BLOCK.maxMs]);
  }
  assert.equal(new Set(standard.items.map((i) => i.id)).size, standard.items.length, 'ids are unique');

  const thorough = calibrationSchedule({ preset: 'thorough', seed: 3 });
  const closer = targets(thorough).filter((t) => t.block === 4);
  assert.equal(closer.length, 13);
  assert.deepEqual(closer.map((t) => t.groupId).sort(), CAL13.map((p) => p.groupId).sort());
  assert.ok(thorough.items.some((i) => i.kind === 'instruction' && i.textKey === 'protocol.instr.closer'));

  const noPursuit = calibrationSchedule({ preset: 'standard', seed: 3, skipPursuit: true });
  assert.ok(!noPursuit.items.some((i) => i.kind === 'pursuit'));

  assert.equal(targets(validationSchedule({ preset: 'quick', seed: 3 })).length, 6);
  const val = targets(validationSchedule({ preset: 'standard', seed: 3 }));
  assert.equal(val.length, 12);
  for (const t of val) assert.deepEqual([t.phase, t.settleMs, t.sampleMs, t.maxSampleMs], ['validation', VALIDATION.settleMs, VALIDATION.sampleMs, VALIDATION.sampleMs]);
});

test('?speed=N divides every duration by N, and the frame minimum becomes max(3, ⌈12/N⌉)', () => {
  const s = calibrationSchedule({ preset: 'standard', seed: 3, speed: 4, pursuitPeriodMs: 20000 });
  for (const t of targets(s).filter((x) => x.phase === 'fixation')) assert.deepEqual([t.settleMs, t.sampleMs, t.maxSampleMs], [150, 250, 625]);
  const p = s.items.find((i): i is PursuitItem => i.kind === 'pursuit')!;
  assert.deepEqual([p.periodMs, p.holdMs, p.discardMs], [5000, 250, 125]);
  assert.equal(minAcceptedFrames(1), 12);
  assert.equal(minAcceptedFrames(4), 3);
  assert.equal(minAcceptedFrames(2), 6);
  assert.equal(minAcceptedFrames(100), 3);
  assert.throws(() => calibrationSchedule({ preset: 'quick', seed: 1, speed: 0.5 }), RangeError);
  assert.throws(() => calibrationSchedule({ preset: 'standard', seed: 1, pursuitPeriodMs: 1000 }), RangeError);
});

test('nearest calibration group is measured on the screen, not in normalised units', () => {
  assert.equal(nearestCalibrationGroup([0.5, 0.5]), 'loc-4');
  assert.equal(nearestCalibrationGroup([0.09, 0.07]), 'loc-0');
  assert.equal(nearestCalibrationGroup([0.36, 0.36]), 'loc-9');
  // In normalised units (0.45, 0.3) is nearest loc-9 (0.29, 0.29); on a very wide screen the horizontal
  // offset to loc-9 dominates and loc-4 (0.5, 0.5), straight below it, is nearer.
  const p: [number, number] = [0.45, 0.3];
  assert.equal(nearestCalibrationGroup(p, 1, 1), 'loc-9');
  assert.equal(nearestCalibrationGroup(p, 1920, 400), 'loc-4');
});
