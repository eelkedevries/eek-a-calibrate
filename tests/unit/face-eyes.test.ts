// WP4 (spec §10.1): EAR4/EAR6 and openQ, iris diameter, the eyes-open rule,
// blink masking ±1 frame, and the landmark tables; checked on synthetic
// landmarks and against the browser on the committed fixture.
import assert from 'node:assert/strict';
import test from 'node:test';
import { eyesOpenRule, maskBlinks } from '../../src/core/face/blink.ts';
import { ear4, ear6, eyeMeasures, eyeMidNorm, interOcularPx, irisDiameterPx, openQuality } from '../../src/core/face/eyeMeasures.ts';
import {
  BLENDSHAPE_COUNT,
  BLENDSHAPE_INDEX,
  BLENDSHAPE_NAMES,
  CONTOUR_L,
  CONTOUR_R,
  EAR4_L,
  EAR4_R,
  EAR6_L,
  EAR6_R,
  EYE_L,
  EYE_R,
  LANDMARK_COUNT,
  PEEKR_MIRROR_PAIRS,
} from '../../src/core/face/landmarkSets.ts';
import { loadLandmarkFixture } from '../fixtures/landmarks/fixture.ts';

const W = 640;
const H = 480;

function blank(): Float32Array {
  return new Float32Array(LANDMARK_COUNT * 3);
}

function put(lm: Float32Array, i: number, x: number, y: number): void {
  lm[i * 3] = x;
  lm[i * 3 + 1] = y;
}

function close(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol;
}

test('EAR6 is the Soukupová–Čech ratio in video pixels', () => {
  const lm = blank();
  // Right eye, p1…p6 = 133, 158, 160, 33, 144, 153: corners 64 px apart, lids ±8 and ±6 px.
  const [p1, p2, p3, p4, p5, p6] = EAR6_R;
  const cx = 0.4;
  const cy = 0.5;
  put(lm, p1, cx + 32 / W, cy);
  put(lm, p4, cx - 32 / W, cy);
  put(lm, p2, cx + 10 / W, cy - 8 / H);
  put(lm, p6, cx + 10 / W, cy + 8 / H);
  put(lm, p3, cx - 10 / W, cy - 6 / H);
  put(lm, p5, cx - 10 / W, cy + 6 / H);
  assert.ok(close(ear6(lm, EAR6_R, W, H), (16 + 12) / (2 * 64), 1e-6));
  // Coincident corners: undefined, not infinite.
  put(lm, p4, cx + 32 / W, cy);
  assert.ok(Number.isNaN(ear6(lm, EAR6_R, W, H)));
});

test('EAR4 follows gaze-lite (normalised coordinates) and openQ = clamp((EAR4 − 0.1)/0.2, 0, 1)', () => {
  // Binary fractions, exact in float32: corners 0.125 apart.
  const lm = blank();
  const [outer, inner, top, bottom] = EAR4_L;
  put(lm, outer, 0.625, 0.5);
  put(lm, inner, 0.5, 0.5);
  const cases: [number, number, number][] = [
    [0.0625, 0.5, 1],
    [0.03125, 0.25, 0.75],
    [0.015625, 0.125, 0.125],
    [0.0078125, 0.0625, 0],
  ];
  for (const [gap, ear, q] of cases) {
    put(lm, top, 0.5625, 0.5 - gap / 2);
    put(lm, bottom, 0.5625, 0.5 + gap / 2);
    assert.ok(close(ear4(lm, EAR4_L), ear, 1e-12), `EAR4 ${ear4(lm, EAR4_L)} for gap ${gap}`);
    assert.ok(close(openQuality(ear4(lm, EAR4_L)), q, 1e-12), `openQ for gap ${gap}`);
  }
  // Normalised, not isotropic: the same landmarks on a 4:3 and a 16:9 frame give the same EAR4.
  assert.equal(eyeMeasures(lm, new Float32Array(52), 640, 480).openQL, eyeMeasures(lm, new Float32Array(52), 1280, 720).openQL);
  assert.equal(openQuality(Number.NaN), 0);
  assert.equal(openQuality(10), 1);
  assert.equal(openQuality(0.2), 0.5);
  put(lm, inner, 0.625, 0.5);
  assert.ok(Number.isNaN(ear4(lm, EAR4_L)));
});

test('iris diameter, eye midpoint and outer-corner distance', () => {
  const lm = blank();
  // Horizontal ring diameters of 20 px (right eye) and 24 px (left eye).
  put(lm, EYE_R.ring[0], 0.3 + 10 / W, 0.4);
  put(lm, EYE_R.ring[2], 0.3 - 10 / W, 0.4);
  put(lm, EYE_L.ring[0], 0.7 + 12 / W, 0.4);
  put(lm, EYE_L.ring[2], 0.7 - 12 / W, 0.4);
  assert.ok(close(irisDiameterPx(lm, W, H), 22, 1e-4));
  put(lm, EYE_R.iris, 0.3, 0.4);
  put(lm, EYE_L.iris, 0.7, 0.44);
  const mid = eyeMidNorm(lm);
  assert.ok(close(mid[0], 0.5, 1e-7) && close(mid[1], 0.42, 1e-7));
  // Outer corners 0.3 × 640 = 192 px apart horizontally and 0.1 × 480 = 48 px vertically.
  put(lm, EYE_R.outer, 0.35, 0.4);
  put(lm, EYE_L.outer, 0.65, 0.5);
  assert.ok(close(interOcularPx(lm, W, H), Math.hypot(192, 48), 1e-4));
});

test('the eyes-open rule needs both blinks < 0.5 and both openQ > 0.2; anything non-finite fails', () => {
  assert.equal(eyesOpenRule(0.1, 0.2, 0.9, 0.8), true);
  assert.equal(eyesOpenRule(0.5, 0.2, 0.9, 0.8), false);
  assert.equal(eyesOpenRule(0.1, 0.6, 0.9, 0.8), false);
  assert.equal(eyesOpenRule(0.1, 0.2, 0.2, 0.8), false);
  assert.equal(eyesOpenRule(0.1, 0.2, 0.9, 0.19), false);
  assert.equal(eyesOpenRule(Number.NaN, 0.2, 0.9, 0.8), false);
  assert.equal(eyesOpenRule(0.1, 0.2, Number.NaN, 0.8), false);
});

test('blink masking removes one frame either side of every closed frame', () => {
  const T = true;
  const F = false;
  assert.deepEqual(maskBlinks([T, T, F, T, T]), [T, F, F, F, T]);
  assert.deepEqual(maskBlinks([F, T, T, T, F]), [F, F, T, F, F]);
  assert.deepEqual(maskBlinks([T, F, T, F, T, T, T]), [F, F, F, F, F, T, T]);
  assert.deepEqual(maskBlinks([T, T, T]), [T, T, T]);
  assert.deepEqual(maskBlinks([]), []);
  assert.deepEqual(maskBlinks([T, T, F, T, T], undefined, 0), [T, T, F, T, T]);
  assert.deepEqual(maskBlinks([T, T, T, F, T, T, T], undefined, 2), [T, F, F, F, F, F, T]);
  // By capture index: frame 12 was dropped, so 11 (closed) does not mask 13.
  assert.deepEqual(maskBlinks([T, F, T, T], [10, 11, 13, 14]), [F, F, T, T]);
  assert.deepEqual(maskBlinks([T, T, F, T], [3, 9, 10, 11]), [T, F, F, F]);
  assert.throws(() => maskBlinks([T, T], [5, 5]), RangeError);
  assert.throws(() => maskBlinks([T, T], [1]), RangeError);
  assert.throws(() => maskBlinks([T], undefined, -1), RangeError);
});

test('landmark tables are symmetric and well formed', () => {
  assert.equal(BLENDSHAPE_COUNT, 52);
  assert.equal(new Set(BLENDSHAPE_NAMES).size, 52);
  assert.equal(BLENDSHAPE_INDEX.eyeBlinkLeft, 9);
  assert.equal(BLENDSHAPE_INDEX.eyeLookUpRight, 18);
  assert.equal(CONTOUR_L.length, 16);
  assert.equal(CONTOUR_R.length, 16);
  for (const set of [CONTOUR_L, CONTOUR_R, EAR4_L, EAR4_R, EAR6_L, EAR6_R, PEEKR_MIRROR_PAIRS.flat()]) {
    for (const i of set) assert.ok(Number.isInteger(i) && i >= 0 && i < LANDMARK_COUNT);
  }
  assert.deepEqual([...EYE_R.ring, EYE_R.iris], [469, 470, 471, 472, 468]);
  assert.deepEqual([...EYE_L.ring, EYE_L.iris], [474, 475, 476, 477, 473]);
});

test('eye measures on the fixture are finite, plausible and match the browser', () => {
  const fx = loadLandmarkFixture();
  assert.deepEqual(fx.blendshapeNames, [...BLENDSHAPE_NAMES]);
  const m = eyeMeasures(fx.landmarks, fx.blendshapes, fx.videoW, fx.videoH);
  for (const [key, value] of Object.entries(m)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), key);
  }
  const ref = fx.computed.eyes;
  for (const key of ['earL', 'earR', 'openQL', 'openQR', 'blinkL', 'blinkR', 'irisDiamPx', 'interOcularPx'] as const) {
    assert.ok(close(m[key], ref[key] as number, 1e-9), `${key}: ${m[key]} vs ${String(ref[key])}`);
  }
  assert.equal(m.open, ref.open);
  // The fixture face looks at the camera with open eyes; its iris is a few per cent of the frame width.
  assert.equal(m.open, true);
  assert.ok(m.irisDiamPx > 5 && m.irisDiamPx < 60, `iris ${m.irisDiamPx}`);
  assert.ok(m.earL > 0.1 && m.earR > 0.1);
});
