// WP3: data-loss funnel arithmetic.
import assert from 'node:assert/strict';
import test from 'node:test';
import { dataLossPct, expectedFrames, funnelCounts, isValidSample, nominalFpsOrDefault, sumFunnels } from '../../src/core/metrics/funnel.ts';
import { Flags } from '../../src/core/types.ts';
import type { GazeSample } from '../../src/core/types.ts';

function sample(flags: number, rawDeg: [number, number] | null = [0, 0]): GazeSample {
  return {
    frameIndex: 0, tCaptureMs: 0, estimator: 'geometric', rawDeg, correctedDeg: rawDeg, rawPx: null, correctedPx: null, filteredPx: null,
    perEngineDeg: {}, flags, confidence: 1, distanceMm: 600,
  };
}

test('expected frames: sampleMs/1000 × nominal fps, 30 when the rate is unknown', () => {
  assert.equal(expectedFrames(1000, 30), 30);
  assert.equal(expectedFrames(1000, 29.97), 29.97);
  assert.equal(expectedFrames(500, Number.NaN), 15);
  assert.equal(nominalFpsOrDefault(0), 30);
  assert.equal(nominalFpsOrDefault(60), 60);
});

test('validity: no invalid flag and a finite raw angle', () => {
  assert.equal(isValidSample(sample(0)), true);
  assert.equal(isValidSample(sample(Flags.EXTRAPOLATED | Flags.OFFSCREEN)), true);
  for (const f of [Flags.NO_FACE, Flags.BLINK, Flags.OUT_OF_RANGE, Flags.DROPPED, Flags.ENGINE_ERROR, Flags.NOT_FULLSCREEN, Flags.HIDDEN]) {
    assert.equal(isValidSample(sample(f)), false, `flag ${f}`);
  }
  assert.equal(isValidSample(sample(0, null)), false);
  assert.equal(isValidSample(sample(0, [Number.NaN, 0])), false);
  assert.equal(isValidSample(undefined), false);
});

test('each stage is a subset of the one before', () => {
  const entries = [
    { sample: undefined, valid: false },
    { sample: sample(Flags.DROPPED), valid: false },
    { sample: sample(Flags.NO_FACE | Flags.BLINK), valid: false },
    { sample: sample(Flags.BLINK), valid: false },
    { sample: sample(Flags.OUT_OF_RANGE), valid: false },
    { sample: sample(Flags.HIDDEN), valid: false },
    { sample: sample(0), valid: true },
    { sample: sample(0), valid: false }, // valid for itself but not for every estimator
    { sample: sample(Flags.OFFSCREEN), valid: true },
  ];
  const f = funnelCounts(10, entries);
  assert.deepEqual(f, { expected: 10, delivered: 9, processed: 7, face: 6, open: 5, inRange: 4, valid: 2 });
  assert.ok(Math.abs(dataLossPct(f) - 80) < 1e-12);
});

test('data loss = 1 − valid/expected, clamped at zero, NaN without expected frames; pooling sums', () => {
  const base = { delivered: 0, processed: 0, face: 0, open: 0, inRange: 0 };
  assert.equal(dataLossPct({ ...base, expected: 30, valid: 24 }), 20);
  assert.equal(dataLossPct({ ...base, expected: 30, valid: 31 }), 0);
  assert.equal(dataLossPct({ ...base, expected: 30, valid: 0 }), 100);
  assert.ok(Number.isNaN(dataLossPct({ ...base, expected: 0, valid: 0 })));
  const a = { expected: 30, delivered: 30, processed: 29, face: 28, open: 27, inRange: 26, valid: 25 };
  const b = { expected: 15, delivered: 14, processed: 14, face: 14, open: 10, inRange: 10, valid: 5 };
  assert.deepEqual(sumFunnels([a, b]), { expected: 45, delivered: 44, processed: 43, face: 42, open: 37, inRange: 36, valid: 30 });
  assert.deepEqual(sumFunnels([]), { expected: 0, delivered: 0, processed: 0, face: 0, open: 0, inRange: 0, valid: 0 });
});
