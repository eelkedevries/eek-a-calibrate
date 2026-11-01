// WP3: focal length, iris distance, the running 1000 ms median, and the blind-spot test.
import assert from 'node:assert/strict';
import test from 'node:test';
import { BLIND_SPOT, DISTANCE } from '../../src/core/constants.ts';
import {
  assessBlindSpot,
  BLIND_SPOT_DIRECTION,
  blindSpotDistanceMm,
  blindSpotSquarePx,
  dotSpeedPxPerS,
} from '../../src/core/geometry/blindSpot.ts';
import {
  DistanceTracker,
  distanceFromIris,
  focalFromAssumedFov,
  focalFromBlindSpot,
  focalFromIrisSamples,
  lnDistRatio,
  refDistanceMm,
} from '../../src/core/geometry/distance.ts';

const RAD = Math.PI / 180;

test('focal length from the blind-spot distance and the iris, and from an assumed 60° field of view', () => {
  assert.equal(DISTANCE.irisMm, 11.7);
  assert.equal(focalFromBlindSpot(600, 23.4), 1200);
  assert.equal(focalFromIrisSamples(600, [23.4, Number.NaN, 22, 0, 24.8, -1]), 1200);
  assert.throws(() => focalFromIrisSamples(600, [Number.NaN, 0]), RangeError);
  assert.ok(Math.abs(focalFromAssumedFov(1280, 720) - 640 / Math.tan(30 * RAD)) < 1e-9);
  assert.ok(Math.abs(focalFromAssumedFov(1280, 720) - 1108.5125) < 1e-4);
  assert.throws(() => focalFromBlindSpot(0, 23.4), RangeError);
  assert.throws(() => focalFromAssumedFov(1280, 720, 180), RangeError);
  assert.throws(() => focalFromAssumedFov(1280, 720, 0), RangeError);
});

test('the assumed field of view spans the long side of the video, so portrait frames give the same focal length (§14.1.2)', () => {
  assert.equal(DISTANCE.assumedHfovDeg, 60);
  // A camera held upright delivers its landscape frame turned through 90°: same long side, same f_px.
  assert.equal(focalFromAssumedFov(480, 640), focalFromAssumedFov(640, 480));
  assert.equal(focalFromAssumedFov(540, 960), focalFromAssumedFov(960, 540));
  assert.ok(Math.abs(focalFromAssumedFov(480, 640) - 320 / Math.tan(30 * RAD)) < 1e-9);
  assert.ok(Math.abs(focalFromAssumedFov(480, 640) - 554.25626) < 1e-5);
  // Not the short side: that would make portrait distances 25 % short.
  assert.ok(Math.abs(focalFromAssumedFov(480, 640) - 240 / Math.tan(30 * RAD)) > 100);
  // A square frame, and another field of view on the long side.
  assert.ok(Math.abs(focalFromAssumedFov(720, 720) - 360 / Math.tan(30 * RAD)) < 1e-9);
  assert.ok(Math.abs(focalFromAssumedFov(720, 1280, 90) - 640) < 1e-9);
  for (const bad of [0, -1, Number.NaN, Infinity]) {
    assert.throws(() => focalFromAssumedFov(bad, 480), RangeError);
    assert.throws(() => focalFromAssumedFov(640, bad), RangeError);
  }
  // With an assumed f_px, D_t / D_ref (and so the distance compensation) does not depend on it.
  const near = distanceFromIris(focalFromAssumedFov(480, 640), 30);
  const ref = distanceFromIris(focalFromAssumedFov(480, 640), 24);
  assert.ok(Math.abs(near / ref - 24 / 30) < 1e-12);
});

test('iris distance D = f·11.7 / iris px inverts the focal-length formula', () => {
  const f = focalFromBlindSpot(650, 21);
  assert.ok(Math.abs(distanceFromIris(f, 21) - 650) < 1e-9);
  assert.ok(Math.abs(distanceFromIris(f, 42) - 325) < 1e-9);
  assert.ok(Number.isNaN(distanceFromIris(f, 0)));
  assert.ok(Number.isNaN(distanceFromIris(f, Number.NaN)));
});

test('D_ref is the median of usable distances; lnDistRatio', () => {
  assert.equal(refDistanceMm([600, null, 640, Number.NaN, 580, 0]), 600);
  assert.equal(refDistanceMm([null, Number.NaN]), null);
  assert.equal(lnDistRatio(600, 600), 0);
  assert.ok(Math.abs(lnDistRatio(660, 600) - Math.log(1.1)) < 1e-15);
});

test('DistanceTracker: running median over the last 1000 ms of open-eye frames', () => {
  const f = focalFromBlindSpot(600, 24);
  const tracker = new DistanceTracker({ focalPx: f, irisMm: 11.7 });
  assert.equal(tracker.distanceMm, null);
  // 25 Hz keeps the window edges on whole milliseconds.
  const dt = 40;
  let t = 0;
  // 2.4 s at 600 mm (24 px), with an outlier frame the median ignores.
  for (let i = 0; i < 60; i++, t += dt) {
    const d = tracker.push(t, i === 30 ? 60 : 24, true) as number;
    if (i === 30) assert.ok(Math.abs(d - 600) < 1e-9);
  }
  assert.equal(tracker.size, 25, 'frames in (t − 1000, t]');
  // Leaning in to 480 mm (30 px): the median switches once more than half the window is new.
  const switched: number[] = [];
  for (let i = 0; i < 30; i++, t += dt) {
    const d = tracker.push(t, 30, true) as number;
    if (Math.abs(d - 480) < 1e-9) switched.push(i);
  }
  assert.equal(switched[0], 12, 'the 13th new frame tips the median of 25');
  // Closed-eye frames do not enter the window, whatever their iris value.
  const before = tracker.distanceMm;
  for (let i = 0; i < 5; i++, t += dt) assert.equal(tracker.push(t, 5, false), before);
  // A closed run longer than the window empties it.
  for (let i = 0; i < 35; i++, t += dt) tracker.push(t, 5, false);
  assert.equal(tracker.distanceMm, null);
  assert.ok(Math.abs((tracker.push(t, 24, true) as number) - 600) < 1e-9);
  assert.throws(() => tracker.push(t - 1, 24, true), RangeError);
  tracker.reset();
  assert.equal(tracker.distanceMm, null);
  assert.ok(Math.abs((tracker.push(0, 24, true) as number) - 600) < 1e-9);
  assert.throws(() => new DistanceTracker({ focalPx: 0, irisMm: 11.7 }), RangeError);
});

test('blind spot: square at (0.85 W, 0.5 H), dot moving left, D_bs = d / tan 13.5°', () => {
  assert.deepEqual(blindSpotSquarePx(1920, 1080), [1632, 540]);
  assert.equal(BLIND_SPOT_DIRECTION, -1);
  assert.ok(Math.abs(blindSpotDistanceMm(600 * Math.tan(13.5 * RAD)) - 600) < 1e-9);
  // Before the distance is known: 1.5°/s at the assumed 600 mm (spec v0.3 corrected v0.1's 2.5 mm/s).
  assert.ok(Math.abs(dotSpeedPxPerS(4, null) - 600 * Math.tan(1.5 * RAD) * 4) < 1e-12);
  assert.ok(Math.abs(dotSpeedPxPerS(4, 600) - 600 * Math.tan(1.5 * RAD) * 4) < 1e-12);
});

test('blind spot: acceptance needs five trials, 300–1200 mm and SD ≤ 15 % of the median', () => {
  const pxPerMm = 3.6;
  const offsetPx = (d: number): number => d * Math.tan(BLIND_SPOT.angleDeg * RAD) * pxPerMm;
  const good = assessBlindSpot([590, 600, 610, 595, 640].map(offsetPx), pxPerMm);
  assert.equal(good.accepted, true);
  assert.equal(good.reason, 'ok');
  assert.ok(Math.abs(good.distanceMm - 600) < 1e-9, 'the median trial');
  assert.equal(good.trialDistancesMm.length, 5);
  assert.ok(Math.abs(good.trialDistancesMm[4] as number - 640) < 1e-9);
  assert.ok(good.sdMm > 0 && Math.abs(good.relSd - good.sdMm / good.distanceMm) < 1e-15);

  assert.equal(assessBlindSpot([600, 600, 600, 600].map(offsetPx), pxPerMm).reason, 'too-few-trials');
  assert.equal(assessBlindSpot([250, 260, 255, 250, 252].map(offsetPx), pxPerMm).reason, 'out-of-range');
  assert.equal(assessBlindSpot([1250, 1260, 1255, 1250, 1252].map(offsetPx), pxPerMm).reason, 'out-of-range');
  const noisy = assessBlindSpot([400, 600, 800, 500, 700].map(offsetPx), pxPerMm);
  assert.equal(noisy.reason, 'inconsistent');
  assert.equal(noisy.accepted, false);
  assert.throws(() => assessBlindSpot([100, Number.NaN, 100, 100, 100], pxPerMm), RangeError);
  assert.ok(Number.isNaN(assessBlindSpot([], pxPerMm).distanceMm));
});
