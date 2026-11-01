// WP5 (spec §10.1): the geometric engine — feature finiteness on the landmark
// fixture, the feature layout and names, the mapper rows and floors, and the
// §4.6.1 maths (in-plane offsets, dc = E⁻¹e₃, gaze ray) on analytic poses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { LAMBDA_REL } from '../../src/core/constants.ts';
import { eyeMeasures } from '../../src/core/face/eyeMeasures.ts';
import { headPoseFromMatrix } from '../../src/core/face/headPose.ts';
import { BLENDSHAPE_COUNT, BLENDSHAPE_INDEX, EYE_L, EYE_R, LANDMARK_COUNT } from '../../src/core/face/landmarkSets.ts';
import type { EngineFrame, FaceObservation, RowContext } from '../../src/core/types.ts';
import geometric from '../../src/engines/geometric/index.ts';
import {
  blendshapeGaze,
  depthCorrection,
  EYE_CENTRE_HEAD_CM,
  eyeInHeadGaze,
  GAZE_GAIN,
  gazeRayIntersection,
  GEO_X,
  GEO_X_DIM,
  GEO_X_NAMES,
  geometricFeatures,
  MAX_RAY_CM,
} from '../../src/engines/geometric/features.ts';
import { GEO_LINEAR_NAMES, GEO_QUADRATIC_NAMES, mappers } from '../../src/engines/geometric/mappers.ts';
import { MAPPERS } from '../../src/engines/mappers.ts';
import type { EngineContext, FrameImage } from '../../src/engines/types.ts';
import { loadLandmarkFixture } from '../fixtures/landmarks/fixture.ts';

const DEG = Math.PI / 180;
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function fixtureFace(): { face: FaceObservation; videoW: number; videoH: number } {
  const fx = loadLandmarkFixture();
  const pose = headPoseFromMatrix(fx.matrix);
  assert.ok(pose);
  const face: FaceObservation = {
    landmarks: fx.landmarks,
    blendshapes: fx.blendshapes,
    matrix: fx.matrix,
    pose,
    eyes: eyeMeasures(fx.landmarks, fx.blendshapes, fx.videoW, fx.videoH),
    quality: { ...fx.computed.quality, centring: [fx.computed.quality.centring[0], fx.computed.quality.centring[1]] },
    landmarkerMs: 0,
    delegate: 'CPU',
  };
  return { face, videoW: fx.videoW, videoH: fx.videoH };
}

function contextOf(face: FaceObservation, lnDistRatio = 0): RowContext {
  return { yawRad: face.pose.yawDeg * DEG, pitchRad: face.pose.pitchDeg * DEG, rollRad: face.pose.rollDeg * DEG, eyeMidNorm: face.eyes.eyeMidNorm, lnDistRatio };
}

const ctx: EngineContext = {
  env: { baseUrl: '/', dev: false, inWorker: false, crossOriginIsolated: false, cores: 4, webgl2: false, wasmSimd: true, offscreenCanvas: false, e2e: true },
  assetUrl: () => '',
  onProgress: () => undefined,
  signal: new AbortController().signal,
};

test('feature finiteness on the landmark fixture, through the pure extractor, the engine and both mappers', async () => {
  const { face, videoW, videoH } = fixtureFace();
  const { x, planar } = geometricFeatures(face, videoW, videoH);
  assert.equal(x.length, GEO_X_DIM);
  assert.ok(x.every(Number.isFinite), `non-finite features: ${Array.from(x)}`);
  assert.equal(planar, false);
  // A near-frontal face looking roughly at the camera: offsets well inside the eye.
  for (const i of [GEO_X.gxL, GEO_X.gyL, GEO_X.gxR, GEO_X.gyR, GEO_X.dcX, GEO_X.dcY]) assert.ok(Math.abs(x[i]) < 0.5, `${GEO_X_NAMES[i]} = ${x[i]}`);

  assert.deepEqual(geometric.probe(ctx.env), { ok: true });
  const engine = await geometric.create(ctx);
  await engine.warmUp();
  assert.equal(engine.backend, 'js');
  const frame = await engine.extract({ meta: { ...loadLandmarkFixture().meta, clock: 'captureTime' }, face, image: {} as FrameImage });
  assert.equal(frame.status, 'ok');
  assert.equal(frame.engine, 'geometric');
  assert.equal(frame.prior, null);
  assert.equal(frame.x?.length, geometric.spec.featureDim);
  assert.deepEqual(Array.from(frame.x!), Array.from(Float32Array.from(x)));
  engine.dispose();
  await assert.rejects(engine.extract({ meta: { ...loadLandmarkFixture().meta, clock: 'captureTime' }, face, image: {} as FrameImage }), /disposed/);

  for (const spec of mappers) {
    const row = spec.row(frame, contextOf(face, 0.05));
    assert.ok(row, spec.id);
    assert.equal(row.length, spec.names.length);
    assert.ok(row.every(Number.isFinite), spec.id);
  }
});

test('inputs that cannot give finite features are rejected with a reason', () => {
  const { face, videoW, videoH } = fixtureFace();
  const withLandmarks = (edit: (lm: Float32Array) => void): FaceObservation => {
    const lm = Float32Array.from(face.landmarks);
    edit(lm);
    return { ...face, landmarks: lm };
  };
  assert.throws(() => geometricFeatures(withLandmarks((lm) => (lm[EYE_L.iris * 3] = Number.NaN)), videoW, videoH), /not finite/);
  assert.throws(
    () =>
      geometricFeatures(
        withLandmarks((lm) => {
          lm[EYE_R.inner * 3] = lm[EYE_R.outer * 3];
          lm[EYE_R.inner * 3 + 1] = lm[EYE_R.outer * 3 + 1];
        }),
        videoW,
        videoH,
      ),
    /coincide/,
  );
  assert.throws(() => geometricFeatures({ ...face, landmarks: face.landmarks.subarray(0, 468 * 3) }, videoW, videoH), /478 landmarks/);
  const bs = Float32Array.from(face.blendshapes);
  bs[BLENDSHAPE_INDEX.eyeLookInLeft] = Number.NaN;
  assert.throws(() => geometricFeatures({ ...face, blendshapes: bs }, videoW, videoH), /blendshapes are missing/);
  assert.throws(() => geometricFeatures({ ...face, pose: { ...face.pose, R: [...face.pose.R.slice(0, 8), Number.NaN] } }, videoW, videoH), /rotation/);
  assert.throws(() => geometricFeatures({ ...face, pose: { ...face.pose, t: [0, 0, Number.POSITIVE_INFINITY] } }, videoW, videoH), /translation/);
  assert.throws(() => geometricFeatures({ ...face, eyes: { ...face.eyes, openQL: Number.NaN } }, videoW, videoH), /lid-opening/);
  assert.throws(() => geometricFeatures(face, 0, videoH), /frame size/);
});

/** One eye: corners ±w/2 about c along the head's +x̂ image direction for R = I, iris at c + (dx, dy). Aspect 1. */
function eyeLandmarks(w: number, dx: number, dy: number): Float32Array {
  const lm = new Float32Array(LANDMARK_COUNT * 3);
  const put = (i: number, x: number, y: number) => {
    lm[i * 3] = x;
    lm[i * 3 + 1] = y;
  };
  put(EYE_R.outer, 0.5 - w / 2, 0.5);
  put(EYE_R.inner, 0.5 + w / 2, 0.5);
  put(EYE_R.iris, 0.5 + dx, 0.5 + dy);
  return lm;
}

function rotation(yawDeg: number, pitchDeg: number, rollDeg: number): number[] {
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(yawDeg * DEG), Math.sin(yawDeg * DEG), Math.cos(pitchDeg * DEG), Math.sin(pitchDeg * DEG), Math.cos(rollDeg * DEG), Math.sin(rollDeg * DEG)];
  // R_y(yaw)·R_x(pitch)·R_z(roll), row-major.
  return [
    cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp,
    cp * sr, cp * cr, -sp,
    -sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp,
  ];
}

test('§4.6.1 maths: in-plane offsets, dc = E⁻¹e₃ and the planar fallback on analytic poses', () => {
  // Frontal: g is the iris offset over the corner distance, +x towards the subject's left (image right), +y up.
  const g0 = eyeInHeadGaze(eyeLandmarks(0.1, 0.01, -0.02), EYE_R.outer, EYE_R.inner, EYE_R.iris, 1, IDENTITY);
  assert.equal(g0.planar, false);
  assert.ok(Math.abs(g0.gx - 0.1) < 1e-6 && Math.abs(g0.gy - 0.2) < 1e-6, `${g0.gx}, ${g0.gy}`);
  assert.ok(depthCorrection(IDENTITY)!.every((v) => v === 0));

  // Pure yaw ψ: dc = (tan ψ, 0); pure pitch θ: dc = (0, −tan θ); roll leaves dc at zero.
  for (const a of [-20, -7, 12, 25]) {
    const dy = depthCorrection(rotation(a, 0, 0))!;
    assert.ok(Math.abs(dy[0] - Math.tan(a * DEG)) < 1e-12 && Math.abs(dy[1]) < 1e-12, `yaw ${a}: ${dy}`);
    const dp = depthCorrection(rotation(0, a, 0))!;
    assert.ok(Math.abs(dp[0]) < 1e-12 && Math.abs(dp[1] + Math.tan(a * DEG)) < 1e-12, `pitch ${a}: ${dp}`);
    const dr = depthCorrection(rotation(0, 0, a))!;
    assert.ok(Math.abs(dr[0]) < 1e-12 && Math.abs(dr[1]) < 1e-12, `roll ${a}: ${dr}`);
  }

  // Under weak perspective an iris a depth c in front of the corners biases g by (c/w)·dc exactly.
  const R = rotation(15, -10, 4);
  const [e1x, e1y, e2x, e2y, e3x, e3y] = [R[0], -R[3], R[1], -R[4], R[2], -R[5]];
  const k = 0.05; // image units per cm
  const [a, b, c, width] = [0.1, -0.05, 0.4, 2.66];
  const lm = new Float32Array(LANDMARK_COUNT * 3);
  const put = (i: number, x: number, y: number) => {
    lm[i * 3] = x;
    lm[i * 3 + 1] = y;
  };
  put(EYE_R.outer, 0.5 - (k * width * e1x) / 2, 0.5 - (k * width * e1y) / 2);
  put(EYE_R.inner, 0.5 + (k * width * e1x) / 2, 0.5 + (k * width * e1y) / 2);
  put(EYE_R.iris, 0.5 + k * (a * e1x + b * e2x + c * e3x), 0.5 + k * (a * e1y + b * e2y + c * e3y));
  const g = eyeInHeadGaze(lm, EYE_R.outer, EYE_R.inner, EYE_R.iris, 1, R);
  const dc = depthCorrection(R)!;
  assert.ok(Math.abs(g.gx - (a + c * dc[0]) / width) < 1e-5 && Math.abs(g.gy - (b + c * dc[1]) / width) < 1e-5, `${g.gx}, ${g.gy}`);

  // Roll invariance: the same eye rotated in the image plane with the head gives the same g.
  const lmRoll = new Float32Array(LANDMARK_COUNT * 3);
  const rr = 30 * DEG;
  for (const i of [EYE_R.outer, EYE_R.inner, EYE_R.iris]) {
    const src = eyeLandmarks(0.1, 0.01, -0.02);
    const [x, y] = [src[i * 3] - 0.5, src[i * 3 + 1] - 0.5];
    // Image y is down, so a head roll of +30° turns image points by −30°.
    lmRoll[i * 3] = 0.5 + Math.cos(rr) * x + Math.sin(rr) * y;
    lmRoll[i * 3 + 1] = 0.5 - Math.sin(rr) * x + Math.cos(rr) * y;
  }
  const gRoll = eyeInHeadGaze(lmRoll, EYE_R.outer, EYE_R.inner, EYE_R.iris, 1, rotation(0, 0, 30));
  assert.ok(Math.abs(gRoll.gx - g0.gx) < 1e-6 && Math.abs(gRoll.gy - g0.gy) < 1e-6, `${gRoll.gx}, ${gRoll.gy}`);

  // Beyond about 78° of yaw |det E| < 0.2: the planar fallback, and no depth correction.
  const R85 = rotation(85, 0, 0);
  assert.equal(depthCorrection(R85), null);
  const gp = eyeInHeadGaze(eyeLandmarks(0.1, 0.01, -0.02), EYE_R.outer, EYE_R.inner, EYE_R.iris, 1, R85);
  assert.equal(gp.planar, true);
  assert.ok(Math.abs(gp.gx - 0.1) < 1e-6 && Math.abs(gp.gy - 0.2) < 1e-6);
});

test('§4.6.1 gaze ray and blendshape signs', () => {
  const t = [1, -2, -60];
  const [ex, ey, ez] = [t[0] + EYE_CENTRE_HEAD_CM[0], t[1] + EYE_CENTRE_HEAD_CM[1], t[2] + EYE_CENTRE_HEAD_CM[2]];
  const [rx, ry] = gazeRayIntersection(IDENTITY, t, 0.1, -0.05);
  assert.ok(Math.abs(rx - (ex + -ez * GAZE_GAIN * 0.1)) < 1e-9 && Math.abs(ry - (ey + -ez * GAZE_GAIN * -0.05)) < 1e-9);
  assert.ok(Math.abs(GAZE_GAIN - 2.66 / 1.2) < 1e-15);
  // A ray turned away from the camera plane stays bounded.
  const [bx, by] = gazeRayIntersection(rotation(0, 100, 0), t, 0, 0);
  assert.ok(Math.abs(bx) <= MAX_RAY_CM && Math.abs(by) <= MAX_RAY_CM);

  const scores = new Float32Array(BLENDSHAPE_COUNT);
  scores[BLENDSHAPE_INDEX.eyeLookOutLeft] = 0.5;
  scores[BLENDSHAPE_INDEX.eyeLookInRight] = 0.375;
  scores[BLENDSHAPE_INDEX.eyeLookDownLeft] = 0.25;
  scores[BLENDSHAPE_INDEX.eyeLookUpRight] = 0.125;
  assert.deepEqual(blendshapeGaze(scores), [0.5, 0.25, 0.375, -0.125]);
});

test('feature layout and names', () => {
  assert.deepEqual(GEO_X_NAMES, ['gxL', 'gyL', 'gxR', 'gyR', 'dcX', 'dcY', 'bsXL', 'bsYL', 'bsXR', 'bsYR', 'openQL', 'openQR', 'rayX', 'rayY']);
  assert.equal(geometric.spec.featureDim, GEO_X_DIM);
  assert.equal(geometric.spec.featureVersion, 'geo-4');
  assert.equal(geometric.spec.id, 'geometric');
  assert.deepEqual(geometric.spec.mappers, ['geo-linear', 'geo-quadratic']);
  assert.deepEqual(geometric.spec.assets, []);
  assert.equal(MAPPERS.geometric, mappers);
  assert.deepEqual(mappers.map((m) => m.id), ['geo-linear', 'geo-quadratic']);

  assert.equal(GEO_LINEAR_NAMES.length, 24);
  assert.equal(GEO_QUADRATIC_NAMES.length, 27);
  assert.deepEqual(GEO_QUADRATIC_NAMES.slice(0, 24), GEO_LINEAR_NAMES);
  for (const names of [GEO_LINEAR_NAMES, GEO_QUADRATIC_NAMES]) assert.equal(new Set(names).size, names.length);
  // Columns 0–11 are x[0–11] under the same names.
  assert.deepEqual(GEO_LINEAR_NAMES.slice(0, 12), GEO_X_NAMES.slice(0, 12));
});

test('mapper rows and floors', () => {
  const [linear, quadratic] = mappers;
  const floors24 = [
    ...Array(4).fill(0.02), 0.03, 0.03, ...Array(4).fill(0.03), 0.02, 0.02, 0.052, 0.052, 0.052, 0.01, 0.01, 0.03, 0.5, 0.5, ...Array(4).fill(0.002),
  ];
  assert.deepEqual(Array.from(linear.floors), floors24);
  assert.deepEqual(Array.from(quadratic.floors), [...floors24, 0.002, 0.002, 0.002]);
  for (const m of mappers) {
    assert.equal(m.engine, 'geometric');
    assert.equal(m.floors.length, m.names.length);
    assert.deepEqual(m.primary, [0, 1, 2, 3]);
    assert.equal(m.standardise, true);
    assert.deepEqual(m.lambdaRel, LAMBDA_REL);
    assert.equal(m.absoluteLambda, undefined);
    assert.equal(m.pca, undefined);
  }
  assert.equal(linear.complexity, 2);
  assert.equal(quadratic.complexity, 4);

  // Binary fractions, so every product below is exact.
  const x = Float32Array.from([0.125, -0.25, 0.375, 0.5, 0.0625, -0.03125, 0.25, -0.5, 0.75, -0.125, 0.875, 1, 12.5, -3.25]);
  const frame: EngineFrame = { engine: 'geometric', status: 'ok', x, prior: null, weight: 1, computeMs: 0 };
  const c: RowContext = { yawRad: 0.25, pitchRad: -0.125, rollRad: 0.0625, eyeMidNorm: [0.625, 0.375], lnDistRatio: -0.5 };
  const gx = (0.125 + 0.375) / 2;
  const gy = (-0.25 + 0.5) / 2;
  const expected = [
    ...Array.from(x.subarray(0, 12)),
    0.25, -0.125, 0.0625,
    0.125, -0.125,
    -0.5,
    12.5, -3.25,
    gx * 0.25, gy * -0.125, gx * -0.5, gy * -0.5,
  ];
  assert.deepEqual(Array.from(linear.row(frame, c)!), expected);
  assert.deepEqual(Array.from(quadratic.row(frame, c)!), [...expected, gx * gx, gy * gy, gx * gy]);

  // No row for a frame that is not a finite, ok geometric frame, or for a non-finite context.
  const bad: EngineFrame[] = [
    { ...frame, status: 'error' },
    { ...frame, status: 'no-face', x: null },
    { ...frame, engine: 'eyepixel' },
    { ...frame, x: x.subarray(0, 13) },
    { ...frame, x: Float32Array.from(x, (v, i) => (i === 7 ? Number.NaN : v)) },
  ];
  for (const m of mappers) {
    for (const f of bad) assert.equal(m.row(f, c), null);
    assert.equal(m.row(frame, { ...c, lnDistRatio: Number.NaN }), null);
    assert.equal(m.row(frame, { ...c, eyeMidNorm: [Number.NaN, 0.5] }), null);
  }
});
