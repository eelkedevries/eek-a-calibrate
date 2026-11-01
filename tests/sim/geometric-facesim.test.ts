// WP5 (spec §10.2): the face simulator's ground truth, on which the WP5 and
// WP8 simulation tests rest — pose and matrix, iris geometry, screen ground
// truth, eyeLook* blendshapes and seeded landmark noise.
import assert from 'node:assert/strict';
import test from 'node:test';
import { matrixPacking } from '../../src/core/face/headPose.ts';
import { BLENDSHAPE_INDEX } from '../../src/core/face/landmarkSets.ts';
import { GEO_X, geometricFeatures } from '../../src/engines/geometric/features.ts';
import { DEFAULT_SCENE, EYE_MODEL, headAt, normalSource, onScreenNormalCm, screenPointCm, screenPxOfPoint, simulateFrame } from './faceSim.ts';

const scene = DEFAULT_SCENE;
const straight = { kind: 'eye-in-head', hDeg: 0, vDeg: 0 } as const;

test('the synthetic matrix is column-major [s·R | t] and the production decomposition recovers the pose', () => {
  const head = headAt(onScreenNormalCm(scene.screen, 55, [3, -2]), 17, -9, 6, 1.05);
  const { face, truth } = simulateFrame(scene, head, straight);
  assert.equal(matrixPacking(face.matrix), 'column-major');
  assert.ok(Math.abs(face.pose.yawDeg - 17) < 1e-4 && Math.abs(face.pose.pitchDeg + 9) < 1e-4 && Math.abs(face.pose.rollDeg - 6) < 1e-4);
  assert.ok(Math.abs(face.pose.scale - 1.05) < 1e-5);
  for (let i = 0; i < 9; i++) assert.ok(Math.abs(face.pose.R[i] - truth.rotation[i]) < 1e-6);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(face.pose.t[i] - head.tCm[i]) < 1e-4);
  assert.equal(face.landmarks.length, 478 * 3);
  assert.ok(face.landmarks.every(Number.isFinite));
});

test('the iris is 11.7 mm across, so irisDiamPx follows the pinhole model', () => {
  for (const d of [45, 60, 80]) {
    const { face, truth } = simulateFrame(scene, headAt(onScreenNormalCm(scene.screen, d), 0, 0, 0), straight);
    // Straight gaze at a frontal head: the ring is fronto-parallel, eyeballRadius in front of the eyeball centre.
    const zIris = truth.L.eyeballCm[2] - EYE_MODEL.eyeballRadiusCm;
    const expected = (scene.camera.focalPx * 2 * EYE_MODEL.irisRadiusCm) / zIris;
    assert.ok(Math.abs(face.eyes.irisDiamPx / expected - 1) < 0.01, `${d} cm: ${face.eyes.irisDiamPx} px, expected ${expected}`);
  }
});

test('screen ground truth: both gaze rays hit the fixated CSS point', () => {
  for (const [x, y] of [[960, 540], [100, 80], [1830, 1000], [1500, 200]]) {
    assert.deepEqual(screenPxOfPoint(scene.screen, screenPointCm(scene.screen, x, y)).map((v) => Math.round(v * 1e9) / 1e9), [x, y]);
    const head = headAt(onScreenNormalCm(scene.screen, 62, [-4, 3]), -12, 8, -3);
    const { truth } = simulateFrame(scene, head, { kind: 'screen', xPx: x, yPx: y });
    for (const eye of [truth.L, truth.R, { screenPx: truth.screenPx }]) {
      assert.ok(eye.screenPx && Math.abs(eye.screenPx[0] - x) < 1e-6 && Math.abs(eye.screenPx[1] - y) < 1e-6, `${x}, ${y}: ${eye.screenPx}`);
    }
  }
  // A frontal head on the screen-centre normal looking straight ahead looks at the centre.
  const { truth } = simulateFrame(scene, headAt(onScreenNormalCm(scene.screen, 60), 0, 0, 0), straight);
  assert.ok(truth.screenPx && Math.abs(truth.screenPx[0] - 960) < 1e-6 && Math.abs(truth.screenPx[1] - 540) < 1e-6);
});

test('eyeLook* blendshapes are clamp(angle / 30°) and agree with the iris offsets', () => {
  const head = headAt(onScreenNormalCm(scene.screen, 60), 0, 0, 0);
  const { face, meta } = simulateFrame(scene, head, { kind: 'eye-in-head', hDeg: 15, vDeg: -6 });
  const b = (name: keyof typeof BLENDSHAPE_INDEX) => face.blendshapes[BLENDSHAPE_INDEX[name]];
  const close = (a: number, e: number) => Math.abs(a - e) < 1e-6;
  // Towards the subject's left is "out" for the left eye and "in" for the right eye.
  assert.ok(close(b('eyeLookOutLeft'), 0.5) && close(b('eyeLookInRight'), 0.5));
  assert.ok(close(b('eyeLookInLeft'), 0) && close(b('eyeLookOutRight'), 0));
  assert.ok(close(b('eyeLookDownLeft'), 0.2) && close(b('eyeLookDownRight'), 0.2) && close(b('eyeLookUpLeft'), 0) && close(b('eyeLookUpRight'), 0));
  assert.ok(close(simulateFrame(scene, head, { kind: 'eye-in-head', hDeg: -45, vDeg: 0 }).face.blendshapes[BLENDSHAPE_INDEX.eyeLookOutRight], 1));

  const { x } = geometricFeatures(face, meta.videoW, meta.videoH);
  const { x: x0 } = geometricFeatures(simulateFrame(scene, head, straight).face, meta.videoW, meta.videoH);
  assert.ok(close(x[GEO_X.bsXL], 0.5) && close(x[GEO_X.bsYL], 0.2) && close(x[GEO_X.bsXR], 0.5) && close(x[GEO_X.bsYR], 0.2));
  // The iris moves towards the subject's left (+gx) and down (−gy) relative to straight gaze.
  for (const [gx, gy] of [[GEO_X.gxL, GEO_X.gyL], [GEO_X.gxR, GEO_X.gyR]]) assert.ok(x[gx] - x0[gx] > 0.05 && x[gy] - x0[gy] < -0.02);
});

test('landmark noise is seeded and has the requested σ', () => {
  const head = headAt(onScreenNormalCm(scene.screen, 60), 5, 3, 0);
  const clean = simulateFrame(scene, head, straight).face.landmarks;
  const a = simulateFrame(scene, head, straight, { noisePx: 0.5, normal: normalSource(11) }).face.landmarks;
  const b = simulateFrame(scene, head, straight, { noisePx: 0.5, normal: normalSource(11) }).face.landmarks;
  assert.deepEqual(a, b);
  let ss = 0;
  let n = 0;
  for (let i = 0; i < clean.length; i += 3) {
    ss += ((a[i] - clean[i]) * scene.camera.width) ** 2 + ((a[i + 1] - clean[i + 1]) * scene.camera.height) ** 2;
    n += 2;
  }
  assert.ok(Math.abs(Math.sqrt(ss / n) - 0.5) < 0.05, `σ = ${Math.sqrt(ss / n)}`);
  assert.throws(() => simulateFrame(scene, head, straight, { noisePx: 0.5 }), /normal source/);
});
