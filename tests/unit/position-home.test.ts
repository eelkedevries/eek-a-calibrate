// Home and the grades after Get ready (design §3.3, §3.7, §3.8).
import assert from 'node:assert/strict';
import test from 'node:test';
import { deviations, glyphEyes, grade, HomeAccumulator, lnDistRatioFromIris, pauseHeadline, type FitRange, type Home } from '../../src/core/position/home.ts';
import { classRanges } from '../../src/core/position/thresholds.ts';
import { clearSignals } from './position-helpers.ts';

const PHONE = classRanges('phone-portrait');

function homeOf(overrides: Partial<Home> = {}): Home {
  return { centring: [0, 0], scale: 0.33, yawDeg: 0, pitchDeg: 12, rollDeg: 0, tiltDeg: 80, phoneRollDeg: 0, irisPx: 24, geometry: null, ...overrides };
}

test('home is the median over the hold', () => {
  const acc = new HomeAccumulator();
  for (const [i, scale] of [0.3, 0.31, 0.5, 0.32, 0.33].entries()) acc.add(clearSignals(PHONE, { scale, yawDeg: i, centring: [0.01 * i, 0] }));
  acc.add(clearSignals(PHONE, { face: false, scale: 9 }));
  assert.equal(acc.count, 5);
  const h = acc.home()!;
  assert.equal(h.scale, 0.32);
  assert.equal(h.yawDeg, 2);
  assert.equal(h.centring[0], 0.02);
  assert.ok(h.geometry);
  acc.clear();
  assert.equal(acc.home(), null);
});

test('warm-up tolerances around home: scale ±20 %, centre ±0.10, angles ±15°, θ ±8°', () => {
  const h = homeOf();
  const g = (o: Parameters<typeof clearSignals>[1], ctx: 'warmup' | 'warmup-head' = 'warmup') => grade(deviations(clearSignals(PHONE, { tiltDeg: 80, pitchDeg: 12, ...o }), h, ctx));
  assert.equal(g({}).grade, 'good');
  assert.deepEqual([g({ scale: 0.33 * 0.85 }).grade, g({ scale: 0.33 * 0.85 }).worst?.kind], ['drifting', 'far']);
  assert.deepEqual([g({ scale: 0.33 * 0.75 }).grade, g({ scale: 0.33 * 0.75 }).worst?.kind], ['out', 'far']);
  assert.equal(g({ scale: 0.33 * 1.25 }).worst?.kind, 'close');
  assert.equal(g({ centring: [0.08, 0] }).grade, 'drifting');
  assert.equal(g({ centring: [0, 0.11] }).grade, 'out');
  assert.equal(g({ yawDeg: 16 }).grade, 'out');
  assert.equal(g({ yawDeg: 16 }).worst?.kind, 'turned');
  // Level 3 turns the head on purpose: angles and head speed are not checked there.
  assert.equal(g({ yawDeg: 16, headDegS: 50 }, 'warmup-head').grade, 'good');
  assert.equal(g({ tiltDeg: 89 }).worst?.kind, 'phone');
  assert.equal(g({ tiltDeg: 89 }).grade, 'out');
  assert.equal(g({ headDegS: 40 }).worst?.kind, 'moving');
  assert.equal(g({ lumaMean: 50 }).worst?.kind, 'light');
  // The worst deviation decides; equal grades go by priority (distance first).
  const both = g({ scale: 0.33 * 0.7, centring: [0.2, 0] });
  assert.equal(both.worst?.kind, 'far');
});

test('after the fit: the calibrated head range of §4.10 and the phone within ±6° of home', () => {
  const fit: FitRange = {
    headRange: { yawDeg: [-10, 10], pitchDeg: [2, 22], lnDistRatio: [-0.15, 0.15], eyeMidX: [0.4, 0.6], eyeMidY: [0.35, 0.55] },
    focalPx: 600,
    refDistanceMm: 350,
  };
  const iris = (mm: number) => (fit.focalPx * 11.7) / mm;
  const h = homeOf();
  const at = (o: Parameters<typeof clearSignals>[1]) => grade(deviations(clearSignals(PHONE, { yawDeg: 0, pitchDeg: 12, eyeMid: [0.5, 0.45], irisPx: iris(350), tiltDeg: 80, phoneRollDeg: 0, ...o }), h, 'look', fit));
  assert.equal(at({}).grade, 'good');
  assert.ok(Math.abs(lnDistRatioFromIris(iris(350), 600, 350)) < 1e-12);
  assert.deepEqual([at({ irisPx: iris(420) }).grade, at({ irisPx: iris(420) }).worst?.kind], ['out', 'far']);
  assert.equal(at({ irisPx: iris(290) }).worst?.kind, 'close');
  assert.equal(at({ yawDeg: 12 }).grade, 'out');
  assert.equal(at({ yawDeg: 8 }).grade, 'drifting');
  assert.equal(at({ eyeMid: [0.65, 0.45] }).worst?.kind, 'centre');
  assert.equal(at({ phoneRollDeg: 7 }).grade, 'out');
  assert.equal(at({ phoneRollDeg: 7 }).worst?.kind, 'phone');
  assert.equal(at({ tiltDeg: 84.5 }).grade, 'drifting');
});

test('the overlay headline and the glyph follow the deviation', () => {
  assert.equal(pauseHeadline('face-lost', null), 'guard.pause.lookBack');
  assert.equal(pauseHeadline('out', 'far'), 'guard.pause.closer');
  assert.equal(pauseHeadline('out', 'close'), 'guard.pause.back');
  assert.equal(pauseHeadline('out', 'turned'), 'guard.pause.turned');
  assert.equal(pauseHeadline('out', 'phone'), 'guard.pause.phone');
  assert.equal(pauseHeadline('out', 'centre'), 'guard.pause.intoView');
  assert.equal(pauseHeadline('out', null), 'guard.pause.intoView');

  const h = homeOf();
  assert.deepEqual(glyphEyes(clearSignals(PHONE), h), { dx: 0, dy: 0, spacing: 6.4 });
  // Moving right in the frame moves the dots left, as in the mirrored preview, amplified × 3.
  const moved = glyphEyes(clearSignals(PHONE, { centring: [0.05, 0] }), h);
  assert.ok(Math.abs(moved.dx - -2.4) < 1e-9);
  // Further away: the dots come together.
  assert.ok(glyphEyes(clearSignals(PHONE, { scale: 0.3 }), h).spacing < 6.4);
  assert.ok(glyphEyes(clearSignals(PHONE, { centring: [0.5, 0.5] }), h).dx >= -4.5);
});
