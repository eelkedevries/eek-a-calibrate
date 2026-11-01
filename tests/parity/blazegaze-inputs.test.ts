// WP6 parity, item 3 (spec §10.3): hv and fo are finite and equal upstream's
// training-time head vector (upstream's Python formula; see headVector) and
// computeFaceOrigin3D(faceReconstruction(...)) exactly;
// faceWidthCm is the median of the first 30 open-eye frames and then frozen;
// and the x = [emb, hv, fo] layout reaches the mapper rows of §4.8.4.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PCA } from '../../src/core/constants.ts';
import { LANDMARK_COUNT, LANDMARK_STRIDE } from '../../src/core/face/landmarkSets.ts';
import type { EngineFrame, RowContext } from '../../src/core/types.ts';
import { MAPPERS } from '../../src/engines/mappers.ts';
import { embRidge, priorAffine, priorRidgePose } from '../../src/engines/blazegaze/mappers.ts';
import {
  BG_X,
  BG_X_DIM,
  cameraModel,
  DEFAULT_Z_CM,
  FACE_WIDTH_FRAMES,
  faceOrigin,
  faceRtMatrix,
  FaceWidthTracker,
  headVector,
  newSession,
  normalisedPoints,
  pixelLandmarks,
  prepareInputs,
} from '../../src/engines/blazegaze/preprocess.ts';
import {
  computeFaceOrigin3D,
  createIntrinsicsMatrix,
  createPerspectiveMatrix,
  estimateFaceWidth,
  faceReconstruction,
  getHeadVector,
  translateMatrix,
} from '../../src/engines/blazegaze/vendor/mathUtils.ts';
import { loadLandmarkFixture } from '../fixtures/landmarks/fixture.ts';

const fx = loadLandmarkFixture();
const W = fx.videoW;
const H = fx.videoH;

/** Upstream's own path: WebEyeTrack.computeFaceOrigin3D with the vendored functions. */
function upstreamOrigin(landmarks: Float32Array, matrix: Float32Array, faceWidthCm: number, z0: number) {
  const faceRT = translateMatrix({ rows: 4, columns: 4, data: Array.from(matrix) });
  const uv = Array.from({ length: LANDMARK_COUNT }, (_, i) => [landmarks[i * LANDMARK_STRIDE], landmarks[i * LANDMARK_STRIDE + 1]] as [number, number]);
  const [T, face] = faceReconstruction(createPerspectiveMatrix(W / H), uv, faceRT, createIntrinsicsMatrix(W, H), faceWidthCm, W, H, z0);
  return { fo: computeFaceOrigin3D(face), z: T.get(2, 3) };
}

/** A rotation about the camera's y axis applied to MediaPipe's column-major matrix. */
function yawed(matrix: Float32Array, deg: number): Float32Array {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out = Float32Array.from(matrix);
  for (let col = 0; col < 3; col++) {
    const x = matrix[col * 4];
    const z = matrix[col * 4 + 2];
    out[col * 4] = c * x + s * z;
    out[col * 4 + 2] = -s * x + c * z;
  }
  return out;
}

function scaledAboutNose(landmarks: Float32Array, k: number, dx = 0, dy = 0): Float32Array {
  const out = Float32Array.from(landmarks);
  const cx = landmarks[4 * LANDMARK_STRIDE];
  const cy = landmarks[4 * LANDMARK_STRIDE + 1];
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    out[i * LANDMARK_STRIDE] = cx + (landmarks[i * LANDMARK_STRIDE] - cx) * k + dx;
    out[i * LANDMARK_STRIDE + 1] = cy + (landmarks[i * LANDMARK_STRIDE + 1] - cy) * k + dy;
  }
  return out;
}

/**
 * Upstream's Python training formula (scripts/preprocessing/utils.py and
 * webeyetrack/model_based.py get_head_vector), written independently: Euler
 * angles of the properly oriented R (MediaPipe's JS data are column-major), the
 * pitch/yaw swap, then pitch_yaw_roll_to_gaze_vector in radians.
 */
function pythonHeadVector(m: ArrayLike<number>): [number, number, number] {
  const R = (i: number, j: number) => m[j * 4 + i];
  const pitch = Math.asin(-R(2, 0));
  const yaw = Math.atan2(R(2, 1), R(2, 2));
  const roll = Math.atan2(R(1, 0), R(0, 0));
  const [hp, hy, hr] = [-yaw, pitch, roll];
  const x = Math.cos(hp) * Math.sin(hy);
  const y = Math.sin(hp);
  const z = -Math.cos(hp) * Math.cos(hy);
  const c = Math.cos(hr);
  const s = Math.sin(hr);
  return [c * x - s * y, s * x + c * y, z];
}

test('hv follows the Python training formula, not upstream JavaScript\'s transposed reading', () => {
  for (const deg of [0, 15, -25]) {
    const m = yawed(fx.matrix, deg);
    const mine = headVector(m);
    const py = pythonHeadVector(m);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(mine[k] - py[k]) < 1e-12, `component ${k} at ${deg}°`);
  }
  // Upstream JavaScript reads Rᵀ: under a head turn its hv departs from the training formula.
  const turned = yawed(fx.matrix, 25);
  const js = getHeadVector(translateMatrix({ rows: 4, columns: 4, data: Array.from(turned) }));
  const py = pythonHeadVector(turned);
  assert.ok(Math.hypot(js[0] - py[0], js[1] - py[1], js[2] - py[2]) > 0.1, 'the transposed reading differs under rotation');
});

test('hv and fo on the fixture are finite; hv matches training and fo equals upstream exactly', () => {
  const prep = prepareInputs(newSession(), fx.landmarks, fx.matrix, true, W, H);
  assert.ok(prep.hv.every(Number.isFinite) && prep.fo.every(Number.isFinite));
  assert.deepEqual(prep.hv, pythonHeadVector(fx.matrix));
  assert.ok(Math.abs(Math.hypot(...prep.hv) - 1) < 1e-12, 'hv is a unit vector');
  const fw = estimateFaceWidth(pixelLandmarks(fx.landmarks, W, H));
  assert.equal(prep.faceWidthCm, fw, 'the first open-eye frame gives upstream\'s first-frame estimate');
  assert.deepEqual(prep.fo, upstreamOrigin(fx.landmarks, fx.matrix, fw, DEFAULT_Z_CM).fo);
  // A plausible face: about 10–20 cm wide, the eyes some tens of centimetres in front of the camera.
  assert.ok(fw > 10 && fw < 20, `faceWidthCm ${fw}`);
  assert.ok(prep.fo[2] > 20 && prep.fo[2] < 120, `fo z ${prep.fo[2]}`);
});

test('the fast face reconstruction is bit-identical to upstream across poses, sizes and depth guesses', () => {
  const cases: [string, Float32Array, Float32Array][] = [
    ['fixture', fx.landmarks, fx.matrix],
    ['yaw +15°', fx.landmarks, yawed(fx.matrix, 15)],
    ['yaw −20°', fx.landmarks, yawed(fx.matrix, -20)],
    ['far face', scaledAboutNose(fx.landmarks, 0.6, 0.05, -0.04), fx.matrix],
    ['near face', scaledAboutNose(fx.landmarks, 1.4, -0.03, 0.02), yawed(fx.matrix, 8)],
  ];
  const cam = cameraModel(W, H);
  for (const [label, landmarks, matrix] of cases) {
    const fw = estimateFaceWidth(pixelLandmarks(landmarks, W, H));
    for (const z0 of [DEFAULT_Z_CM, 45, 75.25, 30.5]) {
      const mine = faceOrigin(cam, normalisedPoints(landmarks), faceRtMatrix(matrix), fw, z0);
      const up = upstreamOrigin(landmarks, matrix, fw, z0);
      assert.deepEqual(mine.fo, up.fo, `${label}, z0 ${z0}`);
      assert.equal(mine.transformZ, up.z, `${label}, z0 ${z0}`);
    }
  }
});

test('each frame starts its depth search from the previous frame\'s fo z, and resetSession restarts it', () => {
  const session = newSession();
  const first = prepareInputs(session, fx.landmarks, fx.matrix, true, W, H);
  assert.equal(session.prevZ, first.fo[2]);
  const moved = scaledAboutNose(fx.landmarks, 0.9);
  const second = prepareInputs(session, moved, fx.matrix, true, W, H);
  const expected = faceOrigin(cameraModel(W, H), normalisedPoints(moved), faceRtMatrix(fx.matrix), second.faceWidthCm, first.fo[2]);
  assert.deepEqual(second.fo, expected.fo);
  const fresh = prepareInputs(newSession(), moved, fx.matrix, true, W, H);
  const fromDefault = faceOrigin(cameraModel(W, H), normalisedPoints(moved), faceRtMatrix(fx.matrix), fresh.faceWidthCm, DEFAULT_Z_CM);
  assert.deepEqual(fresh.fo, fromDefault.fo);
});

/** The fixture with the iris rings widened by `k`, which changes estimateFaceWidth. */
function irisScaled(k: number): Float32Array {
  const out = Float32Array.from(fx.landmarks);
  for (const [centre, ring] of [[468, [469, 471]], [473, [474, 476]]] as const) {
    const c = fx.landmarks[centre * LANDMARK_STRIDE];
    for (const i of ring) out[i * LANDMARK_STRIDE] = c + (fx.landmarks[i * LANDMARK_STRIDE] - c) * k;
  }
  return out;
}

test('faceWidthCm is the median of the first 30 open-eye frames, then frozen', () => {
  assert.equal(FACE_WIDTH_FRAMES, 30);
  const session = newSession();
  const seen: number[] = [];
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  for (let k = 0; k < FACE_WIDTH_FRAMES; k++) {
    const landmarks = irisScaled(0.8 + 0.015 * ((k * 7) % 30));
    const estimate = estimateFaceWidth(pixelLandmarks(landmarks, W, H));
    // A closed-eye frame between open ones is not counted, and is given the running value.
    const closed = prepareInputs(session, irisScaled(2), fx.matrix, false, W, H);
    assert.equal(closed.faceWidthCm, seen.length ? median(seen) : estimateFaceWidth(pixelLandmarks(irisScaled(2), W, H)));
    seen.push(estimate);
    const open = prepareInputs(session, landmarks, fx.matrix, true, W, H);
    assert.equal(open.faceWidthCm, median(seen), `open frame ${k + 1}`);
    assert.equal(session.faceWidth.frozen, k + 1 === FACE_WIDTH_FRAMES);
  }
  const frozen = median(seen);
  assert.ok(new Set(seen).size > 5, 'the frames give different estimates');
  for (const k of [0.5, 1.7, 1]) {
    assert.equal(prepareInputs(session, irisScaled(k), fx.matrix, true, W, H).faceWidthCm, frozen, 'frozen after 30 open-eye frames');
  }
  assert.equal(session.faceWidth.count, FACE_WIDTH_FRAMES);

  const reset = newSession();
  const first = prepareInputs(reset, irisScaled(1.7), fx.matrix, true, W, H);
  assert.notEqual(first.faceWidthCm, frozen, 'a new session measures again');
});

test('the face-width tracker ignores unusable estimates', () => {
  const t = new FaceWidthTracker(3);
  t.add(Number.NaN);
  t.add(-1);
  t.add(Infinity);
  assert.equal(t.count, 0);
  assert.equal(t.value(14), 14);
  t.add(12);
  t.add(16);
  assert.equal(t.value(99), 14);
  t.add(13);
  assert.ok(t.frozen);
  assert.equal(t.value(99), 13);
  t.reset();
  assert.equal(t.frozen, false);
  assert.throws(() => new FaceWidthTracker(0), RangeError);
});

test('non-finite inputs throw with the reason instead of giving features', () => {
  const badMatrix = Float32Array.from(fx.matrix);
  badMatrix[5] = Number.NaN;
  assert.throws(() => prepareInputs(newSession(), fx.landmarks, badMatrix, true, W, H), /matrix/);
  const badLandmarks = Float32Array.from(fx.landmarks);
  badLandmarks[10] = Number.NaN;
  assert.throws(() => prepareInputs(newSession(), badLandmarks, fx.matrix, true, W, H), /landmarks/);
  assert.throws(() => headVector(new Float32Array(9)), RangeError);
});

test('x = [emb, hv, fo] feeds the three mapper rows of §4.8.4', () => {
  const prep = prepareInputs(newSession(), fx.landmarks, fx.matrix, true, W, H);
  const x = new Float32Array(BG_X_DIM);
  for (let i = 0; i < BG_X.hv; i++) x[i] = Math.fround(Math.sin(i));
  x.set(prep.hv, BG_X.hv);
  x.set(prep.fo, BG_X.fo);
  const frame: EngineFrame = { engine: 'blazegaze', status: 'ok', x, prior: [0.125, -0.25], weight: 1, computeMs: 5 };
  const ctx: RowContext = { yawRad: 0.1, pitchRad: -0.05, rollRad: 0, eyeMidNorm: [0.5, 0.4], lnDistRatio: 0.02 };

  assert.deepEqual(MAPPERS.blazegaze.map((m) => m.id), ['prior-affine', 'prior-ridge-pose', 'emb-ridge']);
  for (const m of MAPPERS.blazegaze) {
    const row = m.row(frame, ctx)!;
    assert.equal(row.length, m.names.length, m.id);
    assert.equal(m.floors.length, m.names.length, m.id);
    assert.equal(m.engine, 'blazegaze');
  }
  assert.deepEqual([...priorAffine.row(frame, ctx)!], [0.125, -0.25]);
  assert.deepEqual(priorAffine.lambdaRel, [1e-6]);

  const pose = [...priorRidgePose.row(frame, ctx)!];
  const f32 = (v: number) => Math.fround(v);
  assert.deepEqual(pose, [0.125, -0.25, 0.125 ** 2, 0.0625, -0.03125, ...prep.hv.map(f32), ...prep.fo.map(f32), 0.02]);
  assert.deepEqual([...priorRidgePose.floors], [0.01, 0.01, 0.001, 0.001, 0.001, 0.02, 0.02, 0.02, 0.5, 0.5, 0.5, 0.03]);
  assert.equal(priorRidgePose.row(frame, { ...ctx, lnDistRatio: Number.NaN }), null);

  const emb = embRidge.row(frame, ctx)!;
  assert.deepEqual([...emb], [...x]);
  assert.deepEqual(embRidge.pca, { start: 0, end: 512, k: PCA.k });
  assert.deepEqual([...embRidge.floors.subarray(512)], [0.02, 0.02, 0.02, 0.5, 0.5, 0.5]);

  for (const m of MAPPERS.blazegaze) {
    assert.equal(m.row({ ...frame, status: 'crop-invalid', x: null, prior: null }, ctx), null, m.id);
    assert.equal(m.row({ ...frame, prior: [Number.NaN, 0] }, ctx), null, m.id);
    assert.equal(m.row({ ...frame, engine: 'peekr' }, ctx), null, m.id);
    assert.equal(m.row({ ...frame, x: new Float32Array(10) }, ctx), null, m.id);
  }
});
