// WP4 (spec §10.1): headPoseFromMatrix round-trips synthetic rotations in both
// packings, rejects malformed matrices, and agrees with the browser on the
// committed landmark fixture.
import assert from 'node:assert/strict';
import test from 'node:test';
import { headPoseFromMatrix, matrixPacking } from '../../src/core/face/headPose.ts';
import { loadLandmarkFixture } from '../fixtures/landmarks/fixture.ts';

const RAD = Math.PI / 180;

/** R = Ry(yaw)·Rx(pitch)·Rz(roll), row-major. */
function rotation(yawDeg: number, pitchDeg: number, rollDeg: number): number[] {
  const [cy, sy] = [Math.cos(yawDeg * RAD), Math.sin(yawDeg * RAD)];
  const [cp, sp] = [Math.cos(pitchDeg * RAD), Math.sin(pitchDeg * RAD)];
  const [cr, sr] = [Math.cos(rollDeg * RAD), Math.sin(rollDeg * RAD)];
  return [
    cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp,
    cp * sr, cp * cr, -sp,
    -sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp,
  ];
}

/** The 4×4 [s·R | t; 0 0 0 1] packed column-major (MediaPipe) or row-major. */
function pack(R: number[], s: number, t: number[], order: 'column-major' | 'row-major'): number[] {
  const m = (r: number, c: number): number => (r < 3 ? (c < 3 ? s * R[r * 3 + c] : t[r]) : c === 3 ? 1 : 0);
  const out: number[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out.push(order === 'row-major' ? m(i, j) : m(j, i));
  return out;
}

const CASES: [number, number, number][] = [
  [0, 0, 0],
  [20, 0, 0],
  [-20, 0, 0],
  [0, 15, 0],
  [0, -15, 0],
  [0, 0, 10],
  [25, -12, 7],
  [-31, 18, -9],
  [60, 40, 30],
  [-75, -60, 120],
];

test('round-trips synthetic rotations in both packings', () => {
  for (const order of ['column-major', 'row-major'] as const) {
    for (const [yaw, pitch, roll] of CASES) {
      const R = rotation(yaw, pitch, roll);
      const s = 1.07;
      const t = [3.5, -2.25, -48];
      const data = pack(R, s, t, order);
      assert.equal(matrixPacking(data), order);
      const pose = headPoseFromMatrix(data);
      assert.ok(pose, `${order} ${yaw}/${pitch}/${roll}`);
      const label = `${order} yaw ${yaw} pitch ${pitch} roll ${roll}`;
      assert.ok(Math.abs(pose.yawDeg - yaw) < 1e-9, `${label}: yaw ${pose.yawDeg}`);
      assert.ok(Math.abs(pose.pitchDeg - pitch) < 1e-9, `${label}: pitch ${pose.pitchDeg}`);
      assert.ok(Math.abs(pose.rollDeg - roll) < 1e-9, `${label}: roll ${pose.rollDeg}`);
      assert.ok(Math.abs(pose.scale - s) < 1e-12, label);
      pose.R.forEach((v, i) => assert.ok(Math.abs(v - R[i]) < 1e-12, `${label}: R[${i}]`));
      pose.t.forEach((v, i) => assert.equal(v, t[i]));
    }
  }
});

test('identity looks straight into the camera; positive yaw turns towards the subject’s left', () => {
  const ident = headPoseFromMatrix(pack(rotation(0, 0, 0), 1, [0, 0, -50], 'column-major'))!;
  assert.deepEqual([ident.yawDeg, ident.pitchDeg, ident.rollDeg].map((v) => v + 0), [0, 0, 0]);
  // +x is the subject's left in MediaPipe's metric space: a positive yaw swings the face normal (+z) towards +x.
  const turned = headPoseFromMatrix(pack(rotation(10, 0, 0), 1, [0, 0, -50], 'column-major'))!;
  assert.ok(turned.R[2] > 0 && turned.yawDeg > 0);
});

test('rejects missing, malformed and degenerate matrices', () => {
  assert.equal(headPoseFromMatrix(null), null);
  assert.equal(headPoseFromMatrix(undefined), null);
  assert.equal(headPoseFromMatrix([1, 0, 0]), null);
  const good = pack(rotation(5, 5, 5), 1, [1, 2, -40], 'column-major');
  assert.equal(headPoseFromMatrix(good.map((v, i) => (i === 5 ? Number.NaN : v))), null);
  assert.equal(headPoseFromMatrix(good.map((v, i) => (i === 14 ? Infinity : v))), null);
  assert.equal(headPoseFromMatrix(pack(rotation(0, 0, 0), 0, [1, 2, -40], 'column-major')), null);
});

test('matches the browser on the landmark fixture', () => {
  const fx = loadLandmarkFixture();
  assert.equal(matrixPacking(fx.matrix), 'column-major');
  const pose = headPoseFromMatrix(fx.matrix)!;
  const ref = fx.computed.pose;
  for (const key of ['yawDeg', 'pitchDeg', 'rollDeg', 'scale'] as const) {
    assert.ok(Math.abs(pose[key] - ref[key]) < 1e-9, `${key}: ${pose[key]} vs ${ref[key]}`);
  }
  pose.R.forEach((v, i) => assert.ok(Math.abs(v - ref.R[i]) < 1e-12));
  // R stays orthonormal to float32 precision.
  const R = pose.R;
  const dot = (a: number, b: number) => R[a] * R[b] + R[a + 3] * R[b + 3] + R[a + 6] * R[b + 6];
  assert.ok(Math.abs(dot(0, 0) - 1) < 1e-5 && Math.abs(dot(0, 1)) < 1e-5 && Math.abs(dot(1, 2)) < 1e-5);
});
