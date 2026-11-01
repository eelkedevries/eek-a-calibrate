// WP8 (spec §10.1): mapping state serialise → restore → predict, identical; the estimators'
// flags, Combined and the geometry rule of §14.1.3 (pixels fixed, degrees re-derived).
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDataset, unitWeights } from '../../src/core/calibration/dataset.ts';
import { EstimatorSet, frameBaseFlags } from '../../src/core/calibration/estimator.ts';
import { fitCalibration, fitCandidate } from '../../src/core/calibration/fitEngine.ts';
import { restoreMapping } from '../../src/core/calibration/restore.ts';
import { pxToDeg } from '../../src/core/geometry/angles.ts';
import { layoutToPx } from '../../src/core/geometry/screen.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import { calibrationSchedule } from '../../src/core/protocol/schedule.ts';
import { Flags } from '../../src/core/types.ts';
import type { EngineFrame, FitResult, RecordedFrame, Recording, SessionGeometry, Vec2 } from '../../src/core/types.ts';
import { MAPPERS } from '../../src/engines/mappers.ts';
import { embRidge } from '../../src/engines/blazegaze/mappers.ts';
import { geoLinear } from '../../src/engines/geometric/mappers.ts';

const geometry: SessionGeometry = {
  screen: { viewportWpx: 1280, viewportHpx: 800, screenWpx: 1280, screenHpx: 800, dpr: 2, fullscreen: true, pxPerMm: 1280 / 286, pxPerMmSource: 'card', insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  distance: { focalPx: 620, focalSource: 'blind-spot', blindSpotMm: 560, blindSpotSdMm: 9, irisMm: 11.7 },
  refDistanceMm: null,
  degreesApproximate: false,
};

/**
 * A calibration recording whose engine features are noisy linear functions of the target
 * direction: geometric x[0..3] ∝ θ, a BlazeGaze prior and embedding that encode θ, and an
 * eye-pixel engine that sees only noise.
 */
function synthetic(seed: number, preset: 'quick' | 'standard' = 'standard', framesPerItem = 12): Recording {
  const schedule = calibrationSchedule({ preset, seed });
  const normal = gaussian(mulberry32(seed));
  const frames: RecordedFrame[] = [];
  const presentations: Recording['presentations'] = [];
  let t = 0;
  let index = 0;
  for (const item of schedule.items) {
    if (item.kind !== 'target') continue;
    const px = layoutToPx(item.xNorm, item.yNorm, geometry.screen);
    for (let k = 0; k < framesPerItem; k++) {
      const d = 600 + 5 * normal();
      const deg = pxToDeg(px, geometry.screen, d);
      const geo = Float32Array.from({ length: 14 }, (_, j) => (j < 4 ? (j % 2 === 0 ? deg[0] : deg[1]) * 0.02 + 0.002 * normal() : 0.01 * normal()));
      const emb = Float32Array.from({ length: 518 }, (_, j) => (j < 512 ? deg[j % 2] * 0.01 * Math.cos(j) + 0.01 * normal() : 0.1 * normal()));
      const engines: Partial<Record<'geometric' | 'blazegaze' | 'eyepixel', EngineFrame>> = {
        geometric: { engine: 'geometric', status: 'ok', x: geo, prior: null, weight: 1, computeMs: 0 },
        blazegaze: { engine: 'blazegaze', status: 'ok', x: emb, prior: [deg[0] / 40 + 0.005 * normal(), deg[1] / 40 + 0.005 * normal()], weight: 1, computeMs: 0 },
        eyepixel: { engine: 'eyepixel', status: 'ok', x: Float32Array.from({ length: 120 }, () => 0.5 + 0.1 * normal()), prior: null, weight: 1, computeMs: 0 },
      };
      const tRel = item.settleMs + (k + 0.5) * (item.sampleMs / framesPerItem);
      frames.push({
        meta: { index, tCaptureMs: t + tRel, clock: 'captureTime', presentedFrames: index, cameraGap: 0, videoW: 640, videoH: 480 },
        distanceMm: d,
        yawDeg: normal(),
        pitchDeg: normal(),
        rollDeg: 0,
        eyeMidNorm: [0.5 + 0.01 * normal(), 0.45 + 0.01 * normal()],
        open: true,
        label: { itemId: item.id, phase: item.phase, groupId: item.groupId, tRelMs: tRel, accepted: true, reject: null },
        engines,
      });
      index++;
    }
    presentations.push({ itemId: item.id, onsetMs: t, offsetMs: t + item.settleMs + item.sampleMs, attempt: 1, frameIntervalMs: 16.7, aborted: false });
    t += item.settleMs + item.sampleMs + 100;
  }
  return { id: 'syn', schedule, geometry: { ...geometry, refDistanceMm: 600 }, presentations, frames };
}

const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

test('a mapping state predicts bit for bit the same after a JSON round trip (plain and PCA mappers)', () => {
  const rec = synthetic(1);
  const ds = buildDataset([rec], 100, 600);
  const w = unitWeights(ds.rows, ds.rows.map(() => true));
  for (const spec of [geoLinear, embRidge]) {
    const fit = fitCandidate(spec, ds, w, ds.rows.length, 77, 'test-1');
    const state = fit.state;
    assert.equal(state.schema, 'eek-a-calibrate/mapping@1');
    assert.equal(state.featureVersion, 'test-1');
    assert.equal(state.B.length, (state.zMin.length + 1) * 2);
    assert.equal(state.A.length, (state.zMin.length + 1) ** 2);
    if (spec.pca) assert.equal(state.pca!.components.length, spec.pca.k * 512);
    else assert.equal(state.pca, null);
    const a = restoreMapping(state, spec);
    const b = restoreMapping(json(state), spec);
    for (const row of ds.rows.slice(0, 40)) {
      const ctx = row.ctx;
      const f = row.frame.engines[spec.engine];
      const pa = a.predictFrame(f, ctx)!;
      const pb = b.predictFrame(f, ctx)!;
      assert.deepEqual(pb, pa);
      assert.ok(Number.isFinite(pa.deg[0]) && pa.leverage > 0);
    }
    // A wrong mapper or a truncated state is refused.
    assert.throws(() => restoreMapping({ ...state, B: state.B.slice(1) }, spec), RangeError);
    assert.throws(() => restoreMapping(state, spec === geoLinear ? embRidge : geoLinear), RangeError);
  }
});

function fitOf(rec: Recording, engines: ('geometric' | 'blazegaze' | 'eyepixel')[] = ['geometric', 'blazegaze', 'eyepixel']): FitResult {
  return fitCalibration([rec], { seed: 3, engines, mappers: MAPPERS, featureVersions: { geometric: 'geo-4', blazegaze: 'bg', eyepixel: 'ep-1' } });
}

test('the fit: candidates, Combined from the engines with coverage, a selection reason, the geometry stored', () => {
  const fit = fitOf(synthetic(2));
  assert.deepEqual(Object.keys(fit.fits).sort(), ['blazegaze', 'eyepixel', 'geometric']);
  const g = fit.fits.geometric!;
  assert.ok(g.cv.meanDeg < 1, `geometric CV ${g.cv.meanDeg}`);
  assert.ok(fit.fits.eyepixel!.cv.meanDeg > 3 * g.cv.meanDeg, 'the noise engine is worse');
  assert.equal(new Set(fit.fits.blazegaze!.candidates.map((c) => c.mapper)).size, 3);
  assert.ok(fit.combined);
  assert.deepEqual(fit.combined!.members, ['blazegaze', 'geometric', 'eyepixel']);
  for (const axis of [fit.combined!.wx, fit.combined!.wy]) {
    const sum = Object.values(axis).reduce((s, v) => s + (v as number), 0);
    assert.ok(Math.abs(sum - 1) < 1e-9 && Object.values(axis).every((v) => (v as number) >= 0));
  }
  assert.ok(fit.selection.reason.length > 20);
  assert.equal(fit.selection.ranking.length, 4);
  assert.deepEqual(fit.fitGeometry!.screen, geometry.screen);
  assert.equal(fit.fitGeometry!.refDistanceMm, 600);
  assert.equal(fit.pursuitLagMs, 100, 'no pursuit in the recording: the default');
});

test('estimators: identical after a JSON round trip of the fit; flags for missing engines, range and screen', () => {
  const rec = synthetic(4);
  const fit = fitOf(rec);
  const a = new EstimatorSet(fit, MAPPERS, null);
  const b = new EstimatorSet(json(fit), MAPPERS, null);
  assert.deepEqual(a.ids(), ['combined', 'blazegaze', 'geometric', 'eyepixel']);
  const f = rec.frames[20]!;
  for (const id of a.ids()) assert.deepEqual(b.estimator(id).estimate(f, frameBaseFlags(f)), a.estimator(id).estimate(f, frameBaseFlags(f)));

  const s = a.estimator('combined').estimate(f, 0);
  assert.equal(s.flags & (Flags.ENGINE_ERROR | Flags.OUT_OF_RANGE | Flags.OFFSCREEN), 0);
  assert.ok(s.confidence > 0 && s.confidence <= 1);
  assert.deepEqual(Object.keys(s.perEngineDeg).sort(), ['blazegaze', 'eyepixel', 'geometric']);

  // An engine without an ok frame: its own estimator flags ENGINE_ERROR; Combined renormalises over the rest.
  const noBg: RecordedFrame = { ...f, engines: { ...f.engines, blazegaze: { ...f.engines.blazegaze!, status: 'crop-invalid', x: null, prior: null } } };
  const lost = a.estimator('blazegaze').estimate(noBg, 0);
  assert.ok((lost.flags & Flags.ENGINE_ERROR) !== 0 && lost.rawDeg === null && lost.confidence === 0);
  assert.equal(a.estimator('combined').estimate(noBg, 0).flags & Flags.ENGINE_ERROR, 0);
  const none: RecordedFrame = { ...f, engines: {} };
  assert.ok((a.estimator('combined').estimate(none, 0).flags & Flags.ENGINE_ERROR) !== 0);

  // No face: NO_FACE from the frame; an extreme pose: OUT_OF_RANGE.
  const noFace: RecordedFrame = { ...f, yawDeg: null, pitchDeg: null, rollDeg: null, eyeMidNorm: null, open: false };
  assert.ok((frameBaseFlags(noFace) & Flags.NO_FACE) !== 0);
  assert.ok((a.estimator('geometric').estimate(noFace, frameBaseFlags(noFace)).flags & Flags.NO_FACE) !== 0);
  const turned: RecordedFrame = { ...f, yawDeg: 40 };
  assert.ok((a.estimator('geometric').estimate(turned, 0).flags & Flags.OUT_OF_RANGE) !== 0);

  // Far outside the calibrated features: EXTRAPOLATED (a clipped primary column) and OFFSCREEN.
  const far: RecordedFrame = { ...f, engines: { geometric: { ...f.engines.geometric!, x: Float32Array.from(f.engines.geometric!.x!, (v, j) => (j < 4 ? v * 8 + 2 : v)) } } };
  const off = a.estimator('geometric').estimate(far, 0);
  assert.ok((off.flags & Flags.EXTRAPOLATED) !== 0, `flags ${off.flags}`);
  assert.ok((off.flags & Flags.OFFSCREEN) !== 0, `px ${off.correctedPx}`);
  assert.equal(frameBaseFlags({ ...f, label: { ...f.label!, accepted: false, reject: 'dropped' } }), Flags.DROPPED);
});

test('measuring the geometry after calibration keeps every pixel and re-derives the degrees (§14.1.3)', () => {
  const rec = synthetic(5, 'quick');
  const fit = fitOf(rec, ['geometric']);
  const before = new EstimatorSet(fit, MAPPERS, null).estimator('geometric');
  // The card was measured (a different scale) and the blind spot gave a longer focal length.
  const measured: SessionGeometry = {
    ...geometry,
    screen: { ...geometry.screen, pxPerMm: geometry.screen.pxPerMm * 1.12 },
    distance: { ...geometry.distance, focalPx: geometry.distance.focalPx * 1.1 },
    refDistanceMm: 600 * 1.1,
  };
  const after = new EstimatorSet(fit, MAPPERS, measured).estimator('geometric');
  for (const f of rec.frames.slice(0, 30)) {
    const s0 = before.estimate(f, 0);
    const rescaled: RecordedFrame = { ...f, distanceMm: (f.distanceMm as number) * 1.1 };
    const s1 = after.estimate(rescaled, 0);
    const px0 = s0.rawPx as Vec2;
    const px1 = s1.rawPx as Vec2;
    assert.ok(Math.abs(px0[0] - px1[0]) < 1e-9 && Math.abs(px0[1] - px1[1]) < 1e-9, 'pixels unchanged');
    const expected = pxToDeg(px0, measured.screen, rescaled.distanceMm as number);
    assert.ok(Math.abs((s1.rawDeg as Vec2)[0] - expected[0]) < 1e-9 && Math.abs((s1.rawDeg as Vec2)[1] - expected[1]) < 1e-9);
    assert.equal(s1.flags, s0.flags);
  }
});

test('drift is added to the corrected values only', () => {
  const rec = synthetic(6, 'quick');
  const set = new EstimatorSet(fitOf(rec, ['geometric']), MAPPERS, null);
  const f = rec.frames[5]!;
  const raw = set.estimator('geometric').estimate(f, 0);
  set.setDrift([0.5, -0.25]);
  const corrected = set.estimator('geometric').estimate(f, 0);
  assert.deepEqual(corrected.rawDeg, raw.rawDeg);
  assert.deepEqual(corrected.rawPx, raw.rawPx);
  assert.ok(Math.abs(corrected.correctedDeg![0] - raw.rawDeg![0] - 0.5) < 1e-12 && Math.abs(corrected.correctedDeg![1] - raw.rawDeg![1] + 0.25) < 1e-12);
  assert.ok(corrected.correctedPx![0] > raw.rawPx![0] && corrected.correctedPx![1] < raw.rawPx![1]);
  assert.throws(() => set.setDrift([Number.NaN, 0]), RangeError);
});
