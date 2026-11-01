// WP9 (spec §4.13): drift-check and quick-recalibration schedules, the offset o = mean(Ḡ − T)
// recovered from a drift recording with a planted bias, the apply-or-recalibrate rule, the sign
// of the correction, the timed prompt and the forced-check reasons.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DRIFT_CENTRE_GROUP,
  driftDecision,
  driftLimitDeg,
  driftOffset,
  driftSchedule,
  forcedDriftReasons,
  nextDriftDueMs,
  nthStreamSeed,
  recalibrationSchedule,
  type DriftContext,
} from '../../src/core/calibration/drift.ts';
import { DRIFT, FIXATION } from '../../src/core/constants.ts';
import { pxToDeg } from '../../src/core/geometry/angles.ts';
import { layoutToPx } from '../../src/core/geometry/screen.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import { scoreValidation } from '../../src/core/metrics/validation.ts';
import { RECAL5, VAL_JITTER } from '../../src/core/protocol/layouts.ts';
import { streamSeed } from '../../src/core/protocol/schedule.ts';
import type { GazeSample, Presentation, RecordedFrame, Recording, Schedule, ScreenGeometry, SessionGeometry, TargetItem, Vec2 } from '../../src/core/types.ts';

const targets = (s: Schedule) => s.items.filter((i): i is TargetItem => i.kind === 'target');

const SCREEN: ScreenGeometry = {
  viewportWpx: 1920, viewportHpx: 1080, screenWpx: 1920, screenHpx: 1080, dpr: 1, fullscreen: true, pxPerMm: 1920 / 531, pxPerMmSource: 'card',
};
const GEOMETRY: SessionGeometry = {
  screen: SCREEN,
  distance: { focalPx: 1000, focalSource: 'blind-spot', blindSpotMm: 600, blindSpotSdMm: 10, irisMm: 11.7 },
  refDistanceMm: 600,
  degreesApproximate: false,
};
const FPS = 30;

test('drift schedule: the centre and one jittered VAL12 location, settle 500 ms and sample 1000 ms', () => {
  const xs = [0.15, 0.38, 0.62, 0.85];
  const ys = [0.15, 0.5, 0.85];
  for (let seed = 0; seed < 300; seed++) {
    const s = driftSchedule({ seed, check: 1 + (seed % 4), preset: 'standard' });
    assert.equal(s.kind, 'drift');
    assert.equal(s.preset, 'standard');
    assert.equal(s.items[0]?.kind, 'instruction');
    const ts = targets(s);
    assert.equal(ts.length, 2);
    const centre = ts.find((t) => t.groupId === DRIFT_CENTRE_GROUP);
    const other = ts.find((t) => t.groupId !== DRIFT_CENTRE_GROUP);
    assert.ok(centre && other, `seed ${seed}`);
    assert.deepEqual([centre.xNorm, centre.yNorm], [0.5, 0.5]);
    const k = Number(/^val-(\d+)$/.exec(other.groupId)?.[1]);
    assert.ok(Number.isInteger(k) && k >= 0 && k < 12, other.groupId);
    assert.ok(Math.abs(other.xNorm - (xs[k % 4] as number)) <= VAL_JITTER + 1e-12);
    assert.ok(Math.abs(other.yNorm - (ys[Math.floor(k / 4)] as number)) <= VAL_JITTER + 1e-12);
    for (const t of ts) {
      assert.equal(t.phase, 'drift');
      assert.equal(t.settleMs, DRIFT.settleMs);
      assert.equal(t.sampleMs, DRIFT.sampleMs);
      assert.equal(t.maxSampleMs, DRIFT.sampleMs);
    }
    assert.equal(new Set(s.items.map((i) => i.id)).size, s.items.length);
  }
});

test('drift schedule: seeded, different from check to check, and divided by the speed factor', () => {
  assert.deepEqual(driftSchedule({ seed: 42, check: 2, preset: 'quick' }), driftSchedule({ seed: 42, check: 2, preset: 'quick' }));
  assert.equal(nthStreamSeed(42, 'drift', 1), streamSeed(42, 'drift'));
  const locations = new Set<string>();
  for (let check = 1; check <= 20; check++) {
    const other = targets(driftSchedule({ seed: 42, check, preset: 'quick' })).find((t) => t.groupId !== DRIFT_CENTRE_GROUP)!;
    locations.add(other.groupId);
  }
  assert.ok(locations.size >= 4, `only ${locations.size} distinct locations over 20 checks`);
  const fast = targets(driftSchedule({ seed: 42, check: 1, preset: 'quick', speed: 4 }));
  for (const t of fast) {
    assert.equal(t.settleMs, DRIFT.settleMs / 4);
    assert.equal(t.sampleMs, DRIFT.sampleMs / 4);
  }
  assert.throws(() => driftSchedule({ seed: 1, check: 0, preset: 'quick' }), RangeError);
  assert.throws(() => driftSchedule({ seed: 1, check: 1, preset: 'quick', speed: 0.5 }), RangeError);
});

test('quick recalibration: RECAL5 under the fixation rules, seeded, with fixation labels', () => {
  const s = recalibrationSchedule({ seed: 7, n: 1, preset: 'standard' });
  assert.equal(s.kind, 'recalibration');
  const ts = targets(s);
  assert.deepEqual(
    ts.map((t) => `${t.xNorm},${t.yNorm},${t.groupId}`).sort(),
    RECAL5.map((p) => `${p.xNorm},${p.yNorm},${p.groupId}`).sort(),
  );
  for (const t of ts) {
    assert.equal(t.phase, 'fixation');
    assert.equal(t.settleMs, FIXATION.settleMs);
    assert.equal(t.sampleMs, FIXATION.sampleMs);
    assert.equal(t.maxSampleMs, FIXATION.maxSampleMs);
  }
  assert.deepEqual(recalibrationSchedule({ seed: 7, n: 1, preset: 'standard' }), s);
  const orders = new Set(Array.from({ length: 12 }, (_, n) => targets(recalibrationSchedule({ seed: 7, n: n + 1, preset: 'standard' })).map((t) => t.groupId).join()));
  assert.ok(orders.size > 1, 'the order should vary between recalibrations');
});

/** A drift-check recording on SCREEN at 600 mm, with every frame's sample at T + bias + noise (deg). */
function plantedDrift(bias: Vec2, noiseDeg: number, seed: number, dropTarget: number | null = null): { rec: Recording; samples: GazeSample[] } {
  const schedule = driftSchedule({ seed, check: 1, preset: 'standard' });
  const items = targets(schedule);
  const presentations: Presentation[] = items.map((it, k) => {
    const onsetMs = 1000 + 2000 * k;
    return { itemId: it.id, onsetMs, offsetMs: onsetMs + it.settleMs + it.sampleMs + 20, attempt: 1, frameIntervalMs: 16.7, aborted: false };
  });
  const frames: RecordedFrame[] = [];
  const samples: GazeSample[] = [];
  const noise = gaussian(mulberry32(seed + 1));
  for (let i = 0; (i * 1000) / FPS < 1000 + 2000 * items.length; i++) {
    const t = (i * 1000) / FPS;
    frames.push({
      meta: { index: i, tCaptureMs: t, clock: 'captureTime', presentedFrames: i, cameraGap: 0, videoW: 1280, videoH: 720 },
      distanceMm: 600, yawDeg: 0, pitchDeg: 0, rollDeg: 0, eyeMidNorm: [0.5, 0.5], open: true, label: null, engines: {},
    });
    const k = presentations.findIndex((p) => t >= p.onsetMs && t < p.offsetMs);
    const item = k >= 0 ? items[k]! : null;
    const truth = item ? pxToDeg(layoutToPx(item.xNorm, item.yNorm, SCREEN), SCREEN, 600) : ([0, 0] as Vec2);
    const deg: Vec2 = [truth[0] + bias[0] + noiseDeg * noise(), truth[1] + bias[1] + noiseDeg * noise()];
    const missing = k >= 0 && k === dropTarget;
    samples.push({
      frameIndex: i, tCaptureMs: t, estimator: 'geometric',
      rawDeg: missing ? null : deg, correctedDeg: missing ? null : deg, rawPx: null, correctedPx: null, filteredPx: null,
      perEngineDeg: {}, flags: missing ? 1 : 0, confidence: 1, distanceMm: 600,
    });
  }
  return { rec: { id: 'drift-1', schedule, geometry: GEOMETRY, presentations, frames }, samples };
}

test('the offset of a drift check recovers a planted bias, and the correction removes it', () => {
  for (const [seed, bias] of [[3, [1.2, -0.7]], [11, [-0.4, 1.5]], [29, [0.05, 0.02]]] as [number, Vec2][]) {
    const { rec, samples } = plantedDrift(bias, 0.3, seed);
    const [report] = scoreValidation(rec, new Map([['geometric', samples]]), GEOMETRY, 'own', FPS);
    const m = driftOffset(report!);
    assert.equal(m.reason, 'ok');
    assert.equal(m.perTargetDeg.length, 2);
    // Each target's mean has ~30 samples of σ = 0.3°, so the mean is within 0.1° of the bias.
    assert.ok(Math.abs(m.offsetDeg![0] - bias[0]) < 0.1 && Math.abs(m.offsetDeg![1] - bias[1]) < 0.1, `${m.offsetDeg} against ${bias}`);
    const d = driftDecision(m.offsetDeg!, 1.0);
    assert.equal(d.action, 'apply');
    assert.ok(Math.abs(d.magnitudeDeg - Math.hypot(...m.offsetDeg!)) < 1e-12);
    // θ + correction: the corrected per-target means lie on the targets (up to the noise).
    for (const off of m.perTargetDeg) {
      assert.ok(Math.hypot(off[0] + d.correctionDeg[0], off[1] + d.correctionDeg[1]) < 0.15);
    }
    assert.deepEqual(d.correctionDeg, [-m.offsetDeg![0], -m.offsetDeg![1]]);
  }
});

test('a drift check with a target that has no valid sample cannot be measured', () => {
  const { rec, samples } = plantedDrift([0.5, 0.5], 0.2, 5, 1);
  const [report] = scoreValidation(rec, new Map([['geometric', samples]]), GEOMETRY, 'own', FPS);
  const m = driftOffset(report!);
  assert.equal(m.reason, 'no-data');
  assert.equal(m.offsetDeg, null);
  assert.equal(driftOffset({ targets: [] }).reason, 'no-data');
});

test('apply when |o| ≤ max(2°, 1.5 × validation accuracy), else recalibrate', () => {
  assert.equal(driftLimitDeg(1), DRIFT.applyMinDeg);
  assert.equal(driftLimitDeg(1.2), 2);
  assert.equal(driftLimitDeg(2), 3);
  assert.equal(driftLimitDeg(Number.NaN), 2);
  assert.equal(driftLimitDeg(-1), 2);
  assert.equal(driftDecision([1.2, 1.6], 1).action, 'apply'); // |o| = 2, exactly the limit
  assert.equal(driftDecision([1.2, 1.61], 1).action, 'recalibrate');
  assert.equal(driftDecision([2.4, 1.8], 2).action, 'apply'); // |o| = 3 = 1.5 × 2
  assert.equal(driftDecision([2.4, 1.81], 2).action, 'recalibrate');
  assert.equal(driftDecision([0, 0], Number.NaN).action, 'apply');
  assert.deepEqual(driftDecision([0, 0], 1).correctionDeg, [0, 0]);
  assert.ok(!Object.is(driftDecision([0, 0], 1).correctionDeg[0], -0));
  assert.throws(() => driftDecision([Number.NaN, 0], 1), RangeError);
});

test('the timed prompt is due every N minutes after the last check, and never when off', () => {
  assert.equal(nextDriftDueMs(1000, DRIFT.everyMin), 1000 + DRIFT.everyMin * 60_000);
  assert.equal(nextDriftDueMs(0, 0.5), 30_000);
  assert.equal(nextDriftDueMs(5, 0), Number.POSITIVE_INFINITY);
  assert.throws(() => nextDriftDueMs(Number.NaN, 5), RangeError);
  assert.throws(() => nextDriftDueMs(0, -1), RangeError);
});

test('forced drift checks: camera, viewport, backend or host, and worker restarts', () => {
  const base: DriftContext = {
    videoW: 1280, videoH: 720, frameRate: 30, deviceIdHash: 'abc', viewportWpx: 1920, viewportHpx: 1080, dpr: 1,
    hostKind: 'worker', delegate: 'GPU', backends: { blazegaze: 'tfjs-webgl', geometric: 'js' }, workerRestarts: 0,
  };
  assert.deepEqual(forcedDriftReasons(base, { ...base }), []);
  assert.deepEqual(forcedDriftReasons(base, { ...base, frameRate: 30.4, viewportWpx: 1920.3 }), []);
  assert.deepEqual(forcedDriftReasons(base, { ...base, videoW: 640, videoH: 480 }), ['camera']);
  assert.deepEqual(forcedDriftReasons(base, { ...base, deviceIdHash: 'def' }), ['camera']);
  assert.deepEqual(forcedDriftReasons(base, { ...base, frameRate: 15 }), ['camera']);
  assert.deepEqual(forcedDriftReasons(base, { ...base, frameRate: null }), []);
  assert.deepEqual(forcedDriftReasons(base, { ...base, viewportHpx: 1000 }), ['viewport']);
  assert.deepEqual(forcedDriftReasons(base, { ...base, dpr: 2 }), ['viewport']);
  assert.deepEqual(forcedDriftReasons(base, { ...base, delegate: 'CPU' }), ['backend']);
  assert.deepEqual(forcedDriftReasons(base, { ...base, hostKind: 'inline' }), ['backend']);
  assert.deepEqual(forcedDriftReasons(base, { ...base, backends: { blazegaze: 'tfjs-wasm', geometric: 'js' } }), ['backend']);
  assert.deepEqual(forcedDriftReasons(base, { ...base, backends: { geometric: 'js' } }), ['backend']);
  assert.deepEqual(forcedDriftReasons(base, { ...base, workerRestarts: 1 }), ['worker']);
  assert.deepEqual(forcedDriftReasons(base, { ...base, videoW: 640, dpr: 2, delegate: 'CPU', workerRestarts: 2 }), ['camera', 'viewport', 'backend', 'worker']);
});
