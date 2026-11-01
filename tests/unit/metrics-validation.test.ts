// WP3: validation metrics: RMS-S2S, SD, BCEA, baseline and gain, verdicts, own and
// intersection modes, on synthetic recordings with planted errors.
import assert from 'node:assert/strict';
import test from 'node:test';
import { VERDICT } from '../../src/core/constants.ts';
import { angularSeparationDeg, degToPx, pxToDeg } from '../../src/core/geometry/angles.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import {
  BCEA_K,
  BCEA_MIN_SAMPLES,
  bcea68,
  dispersion,
  medianFrameIntervalMs,
  rmsS2SDeg,
  scoreValidation,
  targetRegion,
  targetWindows,
  verdictFor,
  type TimedDeg,
} from '../../src/core/metrics/validation.ts';
import { Flags } from '../../src/core/types.ts';
import type {
  EstimatorId,
  GazeSample,
  Presentation,
  RecordedFrame,
  Recording,
  ScreenGeometry,
  SessionGeometry,
  TargetItem,
  Vec2,
} from '../../src/core/types.ts';

const SCREEN: ScreenGeometry = {
  viewportWpx: 1920, viewportHpx: 1080, screenWpx: 1920, screenHpx: 1080, dpr: 1, fullscreen: true, pxPerMm: 1920 / 531, pxPerMmSource: 'card',
};
const GEOMETRY: SessionGeometry = {
  screen: SCREEN,
  distance: { focalPx: 1000, focalSource: 'blind-spot', blindSpotMm: 600, blindSpotSdMm: 10, irisMm: 11.7 },
  refDistanceMm: 600,
  degreesApproximate: false,
};
const VAL6: Vec2[] = [[0.15, 0.15], [0.85, 0.15], [0.38, 0.5], [0.62, 0.5], [0.15, 0.85], [0.85, 0.85]];
const FPS = 30;

function buildRecording(points: readonly Vec2[], abortFirstAtMs: number | null = null): Recording {
  const items: TargetItem[] = points.map(([xNorm, yNorm], k) => ({
    kind: 'target', id: `val-${k}`, phase: 'validation', block: 0, xNorm, yNorm, groupId: `val-${k}`, settleMs: 600, sampleMs: 1000, maxSampleMs: 1000,
  }));
  const presentations: Presentation[] = items.map((it, k) => {
    const onsetMs = 500 + 2000 * k;
    return { itemId: it.id, onsetMs, offsetMs: k === 0 && abortFirstAtMs !== null ? onsetMs + abortFirstAtMs : onsetMs + 1700, attempt: 1, frameIntervalMs: 16.7, aborted: k === 0 && abortFirstAtMs !== null };
  });
  const frames: RecordedFrame[] = [];
  const end = 500 + 2000 * points.length;
  for (let i = 0; (i * 1000) / FPS < end; i++) {
    frames.push({
      meta: { index: i, tCaptureMs: (i * 1000) / FPS, clock: 'captureTime', presentedFrames: i, cameraGap: 0, videoW: 1280, videoH: 720 },
      distanceMm: 600, yawDeg: 0, pitchDeg: 0, rollDeg: 0, eyeMidNorm: [0.5, 0.5], open: true, label: null, engines: {},
    });
  }
  return { id: 'rec', schedule: { seed: 1, preset: 'quick', kind: 'validation', items }, geometry: GEOMETRY, presentations, frames };
}

/** The target in degrees for a frame shown during a presentation, else null. */
function targetAt(rec: Recording, t: number): Vec2 | null {
  for (const p of rec.presentations) {
    if (t < p.onsetMs || t >= p.offsetMs) continue;
    const item = rec.schedule.items.find((it) => it.id === p.itemId) as TargetItem;
    return pxToDeg([item.xNorm * SCREEN.viewportWpx, item.yNorm * SCREEN.viewportHpx], SCREEN, 600);
  }
  return null;
}

type Planner = (f: RecordedFrame, target: Vec2 | null) => { deg: Vec2 | null; flags?: number } | null;

function samplesFor(rec: Recording, estimator: EstimatorId, plan: Planner): GazeSample[] {
  const out: GazeSample[] = [];
  for (const f of rec.frames) {
    const p = plan(f, targetAt(rec, f.meta.tCaptureMs));
    if (p === null) continue;
    out.push({
      frameIndex: f.meta.index, tCaptureMs: f.meta.tCaptureMs, estimator, rawDeg: p.deg, correctedDeg: p.deg, rawPx: null, correctedPx: null, filteredPx: null,
      perEngineDeg: {}, flags: p.flags ?? 0, confidence: 1, distanceMm: 600,
    });
  }
  return out;
}

const offsetBy = (d: Vec2): Planner => (_f, target) => ({ deg: target === null ? [0, 0] : [target[0] + d[0], target[1] + d[1]] });

test('k = −ln(1 − 0.68) ≈ 1.1394', () => {
  assert.ok(Math.abs(BCEA_K - 1.1394) < 5e-5);
  assert.equal(BCEA_K, -Math.log(1 - 0.68));
});

test('RMS-S2S ≈ σ√2 per axis on seeded Gaussian data', () => {
  const sigma = 0.5;
  const n = 20000;
  const g = gaussian(mulberry32(42));
  const dt = 1000 / 30;
  const xOnly: TimedDeg[] = [];
  const both: TimedDeg[] = [];
  for (let i = 0; i < n; i++) {
    xOnly.push({ tMs: i * dt, deg: [sigma * g(), 0] });
    both.push({ tMs: i * dt, deg: [sigma * g(), sigma * g()] });
  }
  const perAxis = rmsS2SDeg(xOnly, 1.5 * dt);
  assert.ok(Math.abs(perAxis / (sigma * Math.SQRT2) - 1) < 0.02, `per axis ${perAxis}`);
  const twoD = rmsS2SDeg(both, 1.5 * dt);
  assert.ok(Math.abs(twoD / (sigma * Math.SQRT2 * Math.SQRT2) - 1) < 0.02, `2-D ${twoD}`);
});

test('RMS-S2S pairs only consecutive samples within 1.5 median frame intervals', () => {
  const dt = 1000 / 30;
  const pts: TimedDeg[] = [0, 1, 2, 4, 5].map((k) => ({ tMs: k * dt, deg: [k < 3 ? 0 : 5, 0] }));
  assert.ok(Math.abs(medianFrameIntervalMs(pts.map((p) => p.tMs)) - dt) < 1e-9);
  assert.equal(rmsS2SDeg(pts, 1.5 * dt), 0, 'the jump across the missing frame is not a pair');
  assert.ok(Math.abs(rmsS2SDeg(pts, 3 * dt) - Math.sqrt(25 / 4)) < 1e-12);
  assert.ok(Number.isNaN(rmsS2SDeg(pts.slice(0, 1), 1.5 * dt)));
  assert.ok(Number.isNaN(rmsS2SDeg(pts, Number.NaN)));
  assert.ok(Number.isNaN(medianFrameIntervalMs([5])));
});

test('SD and BCEA against analytic values', () => {
  // x = (−1, −1, 1, 1), y = (−2, 0, 0, 2): σx² = 4/3, σy² = 8/3, ρ = 1/√2, so
  // BCEA = 2kπ·√(4/3)·√(8/3)·√(1/2) = 8πk/3 and SD = √(4/3 + 8/3) = 2.
  const d = dispersion([[-1, -2], [-1, 0], [1, 0], [1, 2]]);
  assert.ok(Math.abs(d.sdXDeg - Math.sqrt(4 / 3)) < 1e-12);
  assert.ok(Math.abs(d.sdYDeg - Math.sqrt(8 / 3)) < 1e-12);
  assert.ok(Math.abs(d.rho - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(d.sdDeg - 2) < 1e-12);
  assert.ok(Math.abs(d.bcea68Deg2 - (8 * Math.PI * BCEA_K) / 3) < 1e-12);
  // Uncorrelated: BCEA = 2kπσxσy.
  const u = dispersion([[1, 0], [-1, 0], [0, 3], [0, -3]]);
  assert.ok(Math.abs(u.rho) < 1e-15);
  assert.ok(Math.abs(u.bcea68Deg2 - 2 * BCEA_K * Math.PI * Math.sqrt(2 / 3) * Math.sqrt(18 / 3)) < 1e-12);
  // A degenerate cloud: zero area, undefined correlation.
  const line = dispersion([[0, 1], [1, 1], [2, 1]]);
  assert.equal(line.bcea68Deg2, 0);
  assert.ok(Number.isNaN(line.rho));
  assert.equal(bcea68(0, 2, Number.NaN), 0);
  assert.ok(Number.isNaN(dispersion([[1, 1]]).sdDeg));
});

test('two samples have an SD but no correlation or BCEA (they always lie on a line)', () => {
  assert.equal(BCEA_MIN_SAMPLES, 3);
  for (const pts of [[[0, 0], [1, 0.5]], [[0, 0], [1, 0]]] as Vec2[][]) {
    const d = dispersion(pts);
    assert.ok(Number.isFinite(d.sdDeg) && d.sdDeg > 0);
    assert.ok(Number.isNaN(d.rho) && Number.isNaN(d.bcea68Deg2), `${JSON.stringify(d)}`);
  }
  assert.ok(Number.isFinite(dispersion([[0, 0], [1, 0.5], [0.3, 0.9]]).bcea68Deg2));
});

test('BCEA₆₈ of Gaussian data covers 68 % of it and matches the population value', () => {
  const g = gaussian(mulberry32(9));
  const [sx, sy, rho] = [1, 0.5, 0.6];
  const pts: Vec2[] = [];
  for (let i = 0; i < 50000; i++) {
    const a = g();
    const b = g();
    pts.push([sx * a, sy * (rho * a + Math.sqrt(1 - rho * rho) * b)]);
  }
  const d = dispersion(pts);
  const truth = 2 * BCEA_K * Math.PI * sx * sy * Math.sqrt(1 - rho * rho);
  assert.ok(Math.abs(d.bcea68Deg2 / truth - 1) < 0.03, `${d.bcea68Deg2} vs ${truth}`);
  // Inside the ellipse: Mahalanobis² ≤ 2k.
  let inside = 0;
  for (const [x, y] of pts) {
    const zx = x / d.sdXDeg;
    const zy = y / d.sdYDeg;
    if ((zx * zx - 2 * d.rho * zx * zy + zy * zy) / (1 - d.rho * d.rho) <= 2 * BCEA_K) inside++;
  }
  assert.ok(Math.abs(inside / pts.length - 0.68) < 0.01, `coverage ${inside / pts.length}`);
});

test('central and peripheral targets follow the VAL12 and VAL6 split, with jitter', () => {
  for (const x of [0.15, 0.38, 0.62, 0.85]) {
    for (const y of [0.15, 0.5, 0.85]) {
      for (const j of [-0.02, 0, 0.02]) {
        const central = (x === 0.38 || x === 0.62) && y === 0.5;
        assert.equal(targetRegion(x + j, y - j), central ? 'central' : 'peripheral', `${x}, ${y}`);
      }
    }
  }
  assert.equal(targetRegion(0.5, 0.5), 'central');
});

test('a planted constant offset: accuracy, offset, pixels, precision, loss and rate', () => {
  const rec = buildRecording(VAL6);
  const samples = new Map<EstimatorId, GazeSample[]>([['geometric', samplesFor(rec, 'geometric', offsetBy([1, 0]))]]);
  const [r] = scoreValidation(rec, samples, GEOMETRY, 'own', FPS);
  assert.ok(r !== undefined);
  assert.equal(r.targets.length, 6);
  for (const t of r.targets) {
    const target = pxToDeg(t.targetPx, SCREEN, 600);
    const shifted: Vec2 = [target[0] + 1, target[1]];
    assert.ok(Math.abs(t.accuracyDeg - angularSeparationDeg(target, shifted)) < 1e-9);
    assert.ok(Math.abs(t.medianErrorDeg - t.accuracyDeg) < 1e-9);
    assert.ok(Math.abs(t.offsetDeg[0] - 1) < 1e-9 && Math.abs(t.offsetDeg[1]) < 1e-9);
    const px = degToPx(shifted, SCREEN, 600);
    assert.ok(Math.abs(t.accuracyPx - Math.hypot(px[0] - t.targetPx[0], px[1] - t.targetPx[1])) < 1e-6);
    assert.ok(t.rmsS2SDeg < 1e-12 && t.sdDeg < 1e-12 && t.bcea68Deg2 < 1e-12);
    assert.deepEqual(t.funnel, { expected: 30, delivered: 30, processed: 30, face: 30, open: 30, inRange: 30, valid: 30 });
    assert.equal(t.dataLossPct, 0);
  }
  assert.deepEqual(r.targets.map((t) => t.region), ['peripheral', 'peripheral', 'central', 'central', 'peripheral', 'peripheral']);
  const accs = r.targets.map((t) => t.accuracyDeg);
  assert.ok(Math.abs(r.accuracyMeanDeg - accs.reduce((a, b) => a + b) / 6) < 1e-12);
  assert.ok(Math.abs(r.accuracyCentralDeg - ((accs[2] as number) + (accs[3] as number)) / 2) < 1e-12);
  assert.equal(r.samplingHz, 30);
  assert.equal(r.dataLossPct, 0);
  assert.ok(Number.isNaN(r.latencyMs), 'no receivedMs, no latency');
  assert.equal(r.aoiGrid, 4);
  assert.equal(r.verdict, 'good');
  assert.equal(r.estimator, 'geometric');
  assert.equal(r.mode, 'own');
  const diag = Math.hypot(1920, 1080);
  assert.ok(Math.abs(r.accuracyPctDiag - (100 * r.targets.reduce((a, t) => a + t.accuracyPx, 0)) / 6 / diag) < 1e-9);
});

test('constant baseline and tracking gain; a constant predictor is not tracking', () => {
  const rec = buildRecording(VAL6);
  const centroid = pxToDeg([960, 540], SCREEN, 600);
  const baseline = VAL6.map(([x, y]) => angularSeparationDeg(pxToDeg([x * 1920, y * 1080], SCREEN, 600), centroid)).reduce((a, b) => a + b) / 6;
  const good = scoreValidation(rec, new Map([['peekr', samplesFor(rec, 'peekr', offsetBy([0.5, 0.5]))]]), GEOMETRY, 'own', FPS)[0];
  assert.ok(good !== undefined);
  assert.ok(Math.abs(good.baselineDeg - baseline) < 1e-9, `${good.baselineDeg} vs ${baseline}`);
  assert.ok(Math.abs(good.trackingGain - baseline / good.accuracyMeanDeg) < 1e-9);
  const constant = scoreValidation(rec, new Map([['peekr', samplesFor(rec, 'peekr', () => ({ deg: centroid }))]]), GEOMETRY, 'own', FPS)[0];
  assert.ok(constant !== undefined);
  assert.ok(Math.abs(constant.accuracyMeanDeg - baseline) < 1e-9);
  assert.ok(Math.abs(constant.trackingGain - 1) < 1e-9);
  assert.equal(constant.verdict, 'not-tracking');
});

test('the funnel counts each loss at its stage; aborted presentations lose their frames', () => {
  const rec = buildRecording(VAL6);
  const window0 = targetWindows(rec)[0];
  assert.ok(window0 !== undefined);
  const inWindow = rec.frames.filter((f) => f.meta.tCaptureMs >= window0.startMs && f.meta.tCaptureMs < window0.endMs).map((f) => f.meta.index);
  assert.equal(inWindow.length, 30);
  const plantedFlags = new Map<number, number>();
  const plan: [number, number][] = [[Flags.BLINK, 3], [Flags.NO_FACE, 2], [Flags.DROPPED, 1], [Flags.OUT_OF_RANGE, 1], [Flags.ENGINE_ERROR, 1], [Flags.EXTRAPOLATED, 2]];
  let k = 0;
  for (const [flag, count] of plan) for (let c = 0; c < count; c++) plantedFlags.set(inWindow[k++] as number, flag);
  const missing = inWindow[k] as number;
  const samples = samplesFor(rec, 'geometric', (f, target) =>
    f.meta.index === missing ? null : { deg: target ?? [0, 0], flags: plantedFlags.get(f.meta.index) ?? 0 },
  );
  const [r] = scoreValidation(rec, new Map([['geometric', samples]]), GEOMETRY, 'own', FPS);
  assert.ok(r !== undefined);
  const t0 = r.targets[0];
  assert.ok(t0 !== undefined);
  // 30 delivered; no sample (1) and DROPPED (1) are not processed; then NO_FACE (2), BLINK (3),
  // OUT_OF_RANGE (1); ENGINE_ERROR (1) is invalid; EXTRAPOLATED stays valid.
  assert.deepEqual(t0.funnel, { expected: 30, delivered: 30, processed: 28, face: 26, open: 23, inRange: 22, valid: 21 });
  assert.ok(Math.abs(t0.dataLossPct - 30) < 1e-9);
  assert.ok(Math.abs(r.dataLossPct - (100 * (1 - (21 + 150) / 180))) < 1e-9);
  assert.ok(Math.abs(r.samplingHz - 171 / 6) < 1e-9);

  const aborted = buildRecording(VAL6, 900);
  const [ra] = scoreValidation(aborted, new Map([['geometric', samplesFor(aborted, 'geometric', offsetBy([0, 0]))]]), GEOMETRY, 'own', FPS);
  assert.ok(ra !== undefined);
  assert.equal(ra.targets[0]?.funnel.delivered, 9, 'the window ends at the aborted offset');
  assert.ok(Math.abs((ra.targets[0]?.dataLossPct as number) - 70) < 1e-9);
});

test('frames refused for lack of time are not data loss and do not break RMS-S2S pairs (§16.1)', () => {
  const rec = buildRecording(VAL6);
  const g = gaussian(mulberry32(7));
  const noisy = (every: number): Planner => (f, target) =>
    f.meta.index % every !== 0 ? { deg: null, flags: Flags.DROPPED } : { deg: target === null ? [0, 0] : [target[0] + 1 + 0.3 * g(), target[1] + 0.3 * g()] };
  const [all] = scoreValidation(rec, new Map([['geometric', samplesFor(rec, 'geometric', noisy(1))]]), GEOMETRY, 'own', FPS);
  for (const every of [2, 3]) {
    const [r] = scoreValidation(rec, new Map([['geometric', samplesFor(rec, 'geometric', noisy(every))]]), GEOMETRY, 'own', FPS);
    assert.ok(all !== undefined && r !== undefined);
    assert.ok(r.dataLossPct < 1e-9, `1 in ${every}: loss ${r.dataLossPct} %`);
    assert.ok(r.targets.every((t) => t.funnel.expected === 30 && t.funnel.processed <= 15 && t.dataLossPct < 1e-9), 'the funnel keeps the nominal count');
    assert.ok(Math.abs(r.samplingHz - 30 / every) < 0.6, `rate ${r.samplingHz}`);
    assert.ok(Number.isFinite(r.rmsS2SDeg) && Math.abs(r.rmsS2SDeg / all.rmsS2SDeg - 1) < 0.3, `RMS-S2S ${r.rmsS2SDeg} vs ${all.rmsS2SDeg}`);
    assert.equal(r.aoiGrid, all.aoiGrid);
    assert.equal(r.verdict, all.verdict);
  }
  // A stall within one target still counts there: the sustained rate is a median over targets.
  const stall = scoreValidation(
    rec,
    new Map([['geometric', samplesFor(rec, 'geometric', (f, target) => (targetAt(rec, f.meta.tCaptureMs) !== null && f.meta.tCaptureMs >= 1100 && f.meta.tCaptureMs < 1600 ? { deg: null, flags: Flags.DROPPED } : offsetBy([0, 0])(f, target)))]]),
    GEOMETRY,
    'own',
    FPS,
  )[0];
  assert.ok(stall !== undefined);
  assert.ok(Math.abs((stall.targets[0]?.dataLossPct as number) - 50) < 4, `stalled target ${stall.targets[0]?.dataLossPct} %`);
  assert.ok(stall.targets.slice(1).every((t) => t.dataLossPct === 0));
  // Nothing processed at all: everything is lost.
  const [dead] = scoreValidation(rec, new Map([['geometric', samplesFor(rec, 'geometric', () => ({ deg: null, flags: Flags.DROPPED }))]]), GEOMETRY, 'own', FPS);
  assert.equal(dead?.dataLossPct, 100);
});

test('own and intersection modes', () => {
  const rec = buildRecording(VAL6);
  const bad = new Set(rec.frames.filter((f) => f.meta.index % 6 === 0).map((f) => f.meta.index));
  const samples = new Map<EstimatorId, GazeSample[]>([
    ['eyepixel', samplesFor(rec, 'eyepixel', offsetBy([2, 0]))],
    ['blazegaze', samplesFor(rec, 'blazegaze', (f, t) => ({ deg: t ?? [0, 0], flags: bad.has(f.meta.index) ? Flags.ENGINE_ERROR : 0 }))],
    ['combined', samplesFor(rec, 'combined', offsetBy([1, 0]))],
  ]);
  const own = scoreValidation(rec, samples, GEOMETRY, 'own', FPS);
  assert.deepEqual(own.map((r) => r.estimator), ['combined', 'blazegaze', 'eyepixel'], 'Combined first, then rank order');
  const inter = scoreValidation(rec, samples, GEOMETRY, 'intersection', FPS);
  const valid = (rs: typeof own) => rs.map((r) => r.targets.reduce((a, t) => a + t.funnel.valid, 0));
  assert.deepEqual(valid(own), [180, 150, 180]);
  assert.deepEqual(valid(inter), [150, 150, 150]);
  assert.ok(inter.every((r) => r.mode === 'intersection'));
  assert.ok(Math.abs((own[2] as { accuracyMeanDeg: number }).accuracyMeanDeg - (inter[2] as { accuracyMeanDeg: number }).accuracyMeanDeg) < 1e-9, 'constant offset: same accuracy on fewer frames');
});

test('latency from the received times; no valid data; missing distance; duplicate samples', () => {
  const rec = buildRecording(VAL6.slice(0, 2));
  const received = new Map(rec.frames.map((f) => [f.meta.index, f.meta.tCaptureMs + 40]));
  const [withLatency] = scoreValidation(rec, new Map([['geometric', samplesFor(rec, 'geometric', offsetBy([0, 0]))]]), GEOMETRY, 'own', FPS, { receivedMs: received });
  assert.ok(Math.abs((withLatency?.latencyMs as number) - 40) < 1e-9);

  const [none] = scoreValidation(rec, new Map([['geometric', samplesFor(rec, 'geometric', () => ({ deg: null, flags: Flags.NO_FACE }))]]), GEOMETRY, 'own', FPS);
  assert.ok(none !== undefined);
  assert.ok(Number.isNaN(none.accuracyMeanDeg));
  assert.ok(none.targets.every((t) => Number.isNaN(t.accuracyDeg) && t.funnel.valid === 0));
  assert.equal(none.dataLossPct, 100);
  assert.equal(none.verdict, 'not-tracking');
  assert.equal(none.aoiGrid, 0);

  const noDistance: Recording = { ...rec, frames: rec.frames.map((f) => ({ ...f, distanceMm: null })) };
  const unmeasured = samplesFor(noDistance, 'geometric', offsetBy([0, 0])).map((s) => ({ ...s, distanceMm: null }));
  assert.throws(() => scoreValidation(noDistance, new Map([['geometric', unmeasured]]), { ...GEOMETRY, refDistanceMm: null }, 'own', FPS), RangeError);
  // With D_ref available it is the fallback.
  assert.doesNotThrow(() => scoreValidation(noDistance, new Map([['geometric', unmeasured]]), GEOMETRY, 'own', FPS));

  const twice = samplesFor(rec, 'geometric', offsetBy([0, 0]));
  twice.push({ ...(twice[0] as GazeSample) });
  assert.throws(() => scoreValidation(rec, new Map([['geometric', twice]]), GEOMETRY, 'own', FPS), RangeError);
});

test('verdict table, with % of the diagonal when degrees are approximate', () => {
  const v = (accuracyMeanDeg: number, lossPct: number, trackingGain = 5, accuracyPctDiag = 3, degreesApproximate = false) =>
    verdictFor({ accuracyMeanDeg, dataLossPct: lossPct, trackingGain, accuracyPctDiag, degreesApproximate });
  assert.equal(VERDICT.minGain, 1.5);
  assert.equal(v(1, 0, 1.49), 'not-tracking');
  assert.equal(v(1, 0, Number.NaN), 'not-tracking');
  assert.equal(v(1, 0, 1.5), 'good');
  assert.equal(v(2.5, 20), 'good');
  assert.equal(v(2.51, 20), 'acceptable');
  assert.equal(v(2.5, 20.1), 'acceptable');
  assert.equal(v(4.0, 35), 'acceptable');
  assert.equal(v(4.01, 10), 'poor');
  assert.equal(v(1, 35.1), 'poor');
  assert.equal(v(Number.NaN, 0), 'poor');
  assert.equal(v(99, 0, 5, 5.99, true), 'good');
  assert.equal(v(99, 0, 5, 6, true), 'acceptable');
  assert.equal(v(99, 21, 5, 5, true), 'acceptable');
  assert.equal(v(99, 0, 5, 9.99, true), 'acceptable');
  assert.equal(v(0.1, 0, 5, 10, true), 'poor');
  assert.equal(v(0.1, 0, 1.2, 1, true), 'not-tracking');
});

test('the report notes approximate degrees and uses % of the diagonal', () => {
  const rec = buildRecording(VAL6);
  const approx: SessionGeometry = { ...GEOMETRY, degreesApproximate: true };
  const [r] = scoreValidation(rec, new Map([['geometric', samplesFor(rec, 'geometric', offsetBy([1, 0]))]]), approx, 'own', FPS);
  assert.ok(r !== undefined);
  assert.equal(r.degreesApproximate, true);
  assert.ok(r.accuracyPctDiag < 6);
  assert.equal(r.verdict, 'good');
});
