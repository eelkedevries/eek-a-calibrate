// WP8 end to end (spec §10.2): a simulated Standard session (CAL13, pursuit, HEAD5, then VAL12)
// at 30 Hz through the recorder and labelling, fitRecording, the estimators and scoreValidation.
// The face simulator gives landmarks and blendshapes only (no pixels), so the geometric engine is
// the one that runs; Combined is formed from it alone.
import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceDistanceMm } from '../../src/core/calibration/dataset.ts';
import { DistanceTracker } from '../../src/core/geometry/distance.ts';
import { layoutToPx } from '../../src/core/geometry/screen.ts';
import { FrameRecorder } from '../../src/core/protocol/labelling.ts';
import { pursuitTargetAt } from '../../src/core/protocol/pursuit.ts';
import { calibrationSchedule, validationSchedule } from '../../src/core/protocol/schedule.ts';
import { Flags } from '../../src/core/types.ts';
import type { FitResult, FrameResult, PursuitItem, Recording, Schedule, SessionGeometry, TargetItem, Vec2 } from '../../src/core/types.ts';
import { geometricFeatures } from '../../src/engines/geometric/features.ts';
import { fitRecording, frameBaseFlags, restoreEstimators, scoreRecording } from '../../src/fit/fitClient.ts';
import { DEFAULT_SCENE, headAt, normalSource, onScreenNormalCm, simulateFrame, type SimHead } from './faceSim.ts';

const scene = DEFAULT_SCENE;
const FRAME_MS = 1000 / 30;
/** The eyes follow the pursuit target this far behind it. */
const PURSUIT_LAG_MS = 100;
const SEED = 20261101;

const geometry: SessionGeometry = {
  screen: {
    viewportWpx: scene.screen.widthPx,
    viewportHpx: scene.screen.heightPx,
    screenWpx: scene.screen.widthPx,
    screenHpx: scene.screen.heightPx,
    dpr: 1,
    fullscreen: true,
    pxPerMm: scene.screen.pxPerMm,
    pxPerMmSource: 'card',
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    presentationMode: 'fullscreen',
  },
  distance: { focalPx: scene.camera.focalPx, focalSource: 'blind-spot', blindSpotMm: 600, blindSpotSdMm: 12, irisMm: 11.7 },
  refDistanceMm: null,
  degreesApproximate: false,
};

interface SessionOptions {
  noisePx: number;
  seed: number;
  /** Head pose as a function of the item and the time since its onset. */
  pose?: (item: TargetItem | PursuitItem, tRelMs: number) => { yaw: number; pitch: number; roll: number; offsetCm: Vec2; distanceCm: number };
}

/** A gentle, item-dependent head wobble inside the fixation gate, and the guided sweeps of block C. */
function naturalPose(item: TargetItem | PursuitItem, tRelMs: number) {
  const s = tRelMs / 1000;
  const k = item.id.length + (item.kind === 'target' ? item.xNorm * 7 + item.yNorm * 3 : 0);
  if (item.kind === 'target' && item.headMotion) {
    const motion = Math.max(0, tRelMs - item.settleMs) / 1000;
    const yawPhase = motion < 2 ? Math.sin(Math.PI * motion) : 0;
    const pitchPhase = motion >= 2 ? Math.sin(Math.PI * (motion - 2)) : 0;
    return { yaw: 10 * yawPhase, pitch: 7 * pitchPhase, roll: 1, offsetCm: [1, -0.5] as Vec2, distanceCm: 60 };
  }
  return {
    yaw: 3 * Math.sin(0.9 * s + k),
    pitch: 2 * Math.sin(0.7 * s + 2 * k),
    roll: 1.5 * Math.sin(0.5 * s + k),
    offsetCm: [1.5 * Math.sin(0.3 * s + k), 1 * Math.cos(0.4 * s + k)] as Vec2,
    distanceCm: 60 + 2 * Math.sin(0.2 * s + k),
  };
}

function gazeTarget(item: TargetItem | PursuitItem, onsetMs: number, tMs: number, g: SessionGeometry): Vec2 {
  const p = item.kind === 'pursuit' ? pursuitTargetAt(item, onsetMs, tMs - PURSUIT_LAG_MS) : ([item.xNorm, item.yNorm] as Vec2);
  return layoutToPx(p[0], p[1], g.screen);
}

/** Runs a schedule as the screens would: each item presented for its nominal duration, frames every 33 ms. */
function simulate(schedule: Schedule, g: SessionGeometry, opts: SessionOptions, startMs: number, firstIndex: number): { rec: Recording; receivedMs: Map<number, number>; endMs: number; nextIndex: number } {
  const recorder = new FrameRecorder(`sim-${schedule.kind}`, schedule, g);
  const tracker = new DistanceTracker(g.distance);
  const normal = opts.noisePx > 0 ? normalSource(opts.seed) : undefined;
  let index = firstIndex;
  let t = startMs;
  for (const item of schedule.items) {
    if (item.kind === 'instruction') continue;
    const duration = item.kind === 'pursuit' ? item.holdMs + item.periodMs : item.settleMs + item.sampleMs;
    const onset = t;
    const p = recorder.labeller.open(item.id, onset, 1);
    for (; t < onset + duration; t += FRAME_MS) {
      const pose = (opts.pose ?? naturalPose)(item, t - onset);
      const head: SimHead = headAt(onScreenNormalCm(scene.screen, pose.distanceCm, pose.offsetCm), pose.yaw, pose.pitch, pose.roll);
      const [xPx, yPx] = gazeTarget(item, onset, t, g);
      const sim = simulateFrame(scene, head, { kind: 'screen', xPx, yPx }, { noisePx: opts.noisePx, normal, index, tCaptureMs: t });
      const x = geometricFeatures(sim.face, sim.meta.videoW, sim.meta.videoH).x;
      const r: FrameResult = {
        meta: sim.meta,
        face: sim.face,
        engines: { geometric: { engine: 'geometric', status: 'ok', x: Float32Array.from(x), prior: null, weight: 1, computeMs: 0 } },
        workerMs: 0,
        receivedMs: t + 40,
      };
      const d = tracker.push(t, sim.face.eyes.irisDiamPx, sim.face.eyes.open);
      recorder.addResult(r, { hidden: false, notFullscreen: false, distanceMm: d });
      index++;
    }
    recorder.labeller.close(p, t, FRAME_MS / 2, false);
    t += 200;
  }
  return { rec: recorder.finish(), receivedMs: recorder.receivedMs, endMs: t, nextIndex: index };
}

async function session(noisePx: number, seed = SEED) {
  const cal = simulate(calibrationSchedule({ preset: 'standard', seed }), { ...geometry }, { noisePx, seed }, 1000, 0);
  cal.rec.geometry = { ...cal.rec.geometry, refDistanceMm: referenceDistanceMm([cal.rec]) };
  const fit = await fitRecording(cal.rec, { seed, engines: ['geometric'], maxMs: 15000, featureVersions: { geometric: 'geo-4' } });
  const valGeometry = { ...geometry, refDistanceMm: fit.refDistanceMm };
  const val = simulate(validationSchedule({ preset: 'standard', seed }), valGeometry, { noisePx, seed: seed + 1 }, cal.endMs + 2000, cal.nextIndex);
  const scored = scoreRecording(fit, val.rec, fit.fitGeometry as SessionGeometry, { nominalFps: 30, receivedMs: val.receivedMs });
  return { cal, fit, val, scored };
}

const report = (s: Awaited<ReturnType<typeof session>>, mode: 'own' | 'intersection' = 'own') => {
  const r = s.scored[mode].find((x) => x.estimator === 'geometric');
  assert.ok(r, 'a geometric report');
  return r;
};

test('noise-free: validation mean accuracy < 0.5°, tracking gain > 3, lag recovered, every estimator reported', async () => {
  const s = await session(0);
  const r = report(s);
  assert.ok(r.accuracyMeanDeg < 0.5, `mean accuracy ${r.accuracyMeanDeg}°`);
  assert.ok(r.trackingGain > 3, `tracking gain ${r.trackingGain}`);
  assert.equal(r.targets.length, 12);
  assert.ok(r.dataLossPct < 5, `data loss ${r.dataLossPct} %`);
  assert.ok(Number.isFinite(r.latencyMs) && Math.abs(r.latencyMs - 40) < 1e-6, `latency ${r.latencyMs}`);
  // The planted 100 ms lag, on the 33 ms grid (clamped to [50, 250]).
  assert.ok(Math.abs(s.fit.pursuitLagMs - PURSUIT_LAG_MS) <= 33, `lag ${s.fit.pursuitLagMs} ms`);
  assert.deepEqual(s.scored.own.map((x) => x.estimator), ['combined', 'geometric']);
  assert.deepEqual(s.scored.intersection.map((x) => x.mode), ['intersection', 'intersection']);
  assert.ok(s.fit.combined && s.fit.combined.members.join() === 'geometric');
  assert.equal(s.fit.selection.estimator, 'geometric');
  assert.match(s.fit.selection.reason, /Geometric/);
  const gf = s.fit.fits.geometric!;
  assert.equal(gf.oofDeg.length, 2 * gf.rowFrameIndex.length);
  assert.ok(gf.candidates.some((c) => c.mapper === 'geo-linear') && gf.candidates.some((c) => c.mapper === 'geo-quadratic'));
  assert.ok(gf.cv.nGroups === 13, `${gf.cv.nGroups} CV groups`);
  assert.ok(s.fit.fitMs < 15000);
});

test('σ = 0.5 px landmark noise with head poses inside the range: mean accuracy < 1.5°, gain > 3', async () => {
  const s = await session(0.5);
  const r = report(s);
  assert.ok(r.accuracyMeanDeg < 1.5, `mean accuracy ${r.accuracyMeanDeg}°`);
  assert.ok(r.trackingGain > 3, `tracking gain ${r.trackingGain}`);
  const inRange = s.scored.samples.get('geometric')!.filter((x) => (x.flags & Flags.OUT_OF_RANGE) !== 0).length;
  assert.equal(inRange, 0, 'no validation frame is out of range');
});

test('out-of-range poses are flagged, and flagged frames still carry a prediction', async () => {
  const s = await session(0);
  const extreme = simulate(
    validationSchedule({ preset: 'quick', seed: SEED }),
    { ...geometry, refDistanceMm: s.fit.refDistanceMm },
    { noisePx: 0, seed: 3, pose: () => ({ yaw: 24, pitch: 0, roll: 0, offsetCm: [0, 0], distanceCm: 60 }) },
    s.val.endMs + 1000,
    s.val.nextIndex,
  );
  const est = restoreEstimators(s.fit, s.fit.fitGeometry ?? null).get('geometric')!;
  const samples = extreme.rec.frames.map((f) => est.estimate(f, frameBaseFlags(f)));
  assert.ok(samples.length > 50);
  for (const x of samples) {
    assert.ok((x.flags & Flags.OUT_OF_RANGE) !== 0, `frame ${x.frameIndex} flags ${x.flags}`);
    assert.ok(x.rawDeg !== null && x.rawPx !== null);
  }
  // A frame inside the range is not flagged.
  const inside = s.val.rec.frames.find((f) => f.label?.accepted)!;
  assert.equal(est.estimate(inside, frameBaseFlags(inside)).flags & Flags.OUT_OF_RANGE, 0);
});

test('a fixed seed gives identical FitResult JSON (apart from the measured fitMs)', async () => {
  const a = await session(0.5, 7);
  const b = await session(0.5, 7);
  const json = (f: FitResult) => JSON.stringify({ ...f, fitMs: 0 });
  assert.equal(json(a.fit), json(b.fit));
  const c = await session(0.5, 8);
  assert.notEqual(json(a.fit), json(c.fit));
});
