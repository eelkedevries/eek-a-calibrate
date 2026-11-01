// WP3: data-loss funnel arithmetic.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dataLossPct,
  expectedFrames,
  funnelCounts,
  isProcessedSample,
  isValidSample,
  lossBasisFrames,
  nominalFpsOrDefault,
  sumFunnels,
  sustainedRateHz,
} from '../../src/core/metrics/funnel.ts';
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

test('processed: a sample not flagged DROPPED', () => {
  assert.equal(isProcessedSample(sample(Flags.NO_FACE | Flags.BLINK)), true);
  assert.equal(isProcessedSample(sample(Flags.DROPPED)), false);
  assert.equal(isProcessedSample(undefined), false);
});

test('the loss basis: the rate the host sustained (median over windows), capped at the nominal rate (§16.1)', () => {
  // Every other frame processed: 15 per second in every 1 s window.
  assert.equal(sustainedRateHz([1, 2, 3].map(() => ({ processed: 15, windowS: 1 }))), 15);
  // One target stalled: the median ignores it, so that target still loses its frames.
  assert.equal(sustainedRateHz([{ processed: 0, windowS: 1 }, { processed: 30, windowS: 1 }, { processed: 30, windowS: 1 }]), 30);
  // A shortened (aborted) window counts by its length; empty windows are left out.
  assert.equal(sustainedRateHz([{ processed: 9, windowS: 0.3 }, { processed: 0, windowS: 0 }]), 30);
  assert.ok(Number.isNaN(sustainedRateHz([])));
  assert.equal(lossBasisFrames(1000, 30, 15), 15);
  assert.equal(lossBasisFrames(1000, 30, 31), 30, 'never above the nominal rate');
  assert.equal(lossBasisFrames(1000, 30, 0), 30, 'nothing processed: the nominal rate, so everything is lost');
  assert.equal(lossBasisFrames(1000, 30, Number.NaN), 30);
  const slow = { expected: 30, delivered: 30, processed: 15, face: 15, open: 14, inRange: 14, valid: 12 };
  assert.ok(Math.abs(dataLossPct(slow, lossBasisFrames(1000, 30, 15)) - 20) < 1e-12, 'compute-refused frames are not data loss');
  assert.ok(Math.abs(dataLossPct(slow) - 60) < 1e-12, 'against the nominal count by default');
  assert.ok(Number.isNaN(dataLossPct(slow, 0)));
});
