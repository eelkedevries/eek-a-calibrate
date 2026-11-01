// WP5 simulation (spec §10.2): with noise-free landmarks and straight-ahead
// eye-in-head gaze across yaw ±20° and pitch ±15°, the eyes do not move in the
// head, so every change in ḡ is pose-induced (the iris lies 0.4 cm in front of
// the eye corners). An OLS correction with dc = E⁻¹e₃ must remove at least
// 80 % of that change compared with no dc.
import assert from 'node:assert/strict';
import test from 'node:test';
import { GEO_X, geometricFeatures } from '../../src/engines/geometric/features.ts';
import { DEFAULT_SCENE, headAt, onScreenNormalCm, simulateFrame } from './faceSim.ts';

/** Residuals of the per-axis OLS fit y ≈ Xβ (normal equations, Gaussian elimination with partial pivoting). */
function olsResiduals(X: number[][], y: number[]): number[] {
  const p = X[0].length;
  const A = Array.from({ length: p }, (_, i) => [...Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)), X.reduce((s, r, k) => s + r[i] * y[k], 0)]);
  for (let c = 0; c < p; c++) {
    const pivot = A.reduce((best, row, r) => (r >= c && Math.abs(row[c]) > Math.abs(A[best][c]) ? r : best), c);
    [A[c], A[pivot]] = [A[pivot], A[c]];
    assert.ok(Math.abs(A[c][c]) > 1e-12, 'singular OLS design');
    for (let r = c + 1; r < p; r++) {
      const m = A[r][c] / A[c][c];
      for (let k = c; k <= p; k++) A[r][k] -= m * A[c][k];
    }
  }
  const beta = new Array<number>(p).fill(0);
  for (let c = p - 1; c >= 0; c--) beta[c] = (A[c][p] - A[c].slice(c + 1, p).reduce((s, v, k) => s + v * beta[c + 1 + k], 0)) / A[c][c];
  return y.map((v, k) => v - X[k].reduce((s, x, j) => s + x * beta[j], 0));
}

function rms(rx: number[], ry: number[]): number {
  return Math.sqrt(rx.reduce((s, v, i) => s + v * v + ry[i] * ry[i], 0) / rx.length);
}

const placements = [
  { distanceCm: 60, offsetCm: [0, 0] as const },
  { distanceCm: 45, offsetCm: [0, 0] as const },
  { distanceCm: 80, offsetCm: [0, 0] as const },
  { distanceCm: 60, offsetCm: [8, -5] as const },
];

for (const { distanceCm, offsetCm } of placements) {
  test(`dc removes ≥ 80 % of the pose-induced change in ḡ (eyes ${distanceCm} cm from the screen, offset ${offsetCm.join(', ')} cm)`, () => {
    const gx: number[] = [];
    const gy: number[] = [];
    const dc: number[][] = [];
    for (let yaw = -20; yaw <= 20; yaw += 5) {
      for (let pitch = -15; pitch <= 15; pitch += 5) {
        const head = headAt(onScreenNormalCm(DEFAULT_SCENE.screen, distanceCm, offsetCm), yaw, pitch, 0);
        const frame = simulateFrame(DEFAULT_SCENE, head, { kind: 'eye-in-head', hDeg: 0, vDeg: 0 });
        // Preconditions on the simulator: the pose is recovered and the eyes are still in the head.
        assert.ok(Math.abs(frame.face.pose.yawDeg - yaw) < 1e-4 && Math.abs(frame.face.pose.pitchDeg - pitch) < 1e-4, `pose ${yaw}, ${pitch}`);
        for (const eye of [frame.truth.L, frame.truth.R]) assert.ok(Math.hypot(...eye.eyeInHeadDeg) < 1e-9);
        assert.equal(frame.face.eyes.open, true);

        const { x, planar } = geometricFeatures(frame.face, frame.meta.videoW, frame.meta.videoH);
        assert.equal(planar, false);
        gx.push((x[GEO_X.gxL] + x[GEO_X.gxR]) / 2);
        gy.push((x[GEO_X.gyL] + x[GEO_X.gyR]) / 2);
        dc.push([x[GEO_X.dcX], x[GEO_X.dcY]]);
      }
    }
    assert.equal(gx.length, 9 * 7);

    const without = rms(olsResiduals(gx.map(() => [1]), gx), olsResiduals(gy.map(() => [1]), gy));
    const designDc = dc.map(([a, b]) => [1, a, b]);
    const withDc = rms(olsResiduals(designDc, gx), olsResiduals(designDc, gy));
    const reduction = 1 - withDc / without;
    // The effect is real: larger than the 0.02 spread floor of columns 0–3.
    assert.ok(without > 0.02, `pose-induced RMS change in ḡ without dc is only ${without}`);
    assert.ok(reduction >= 0.8, `dc reduces the pose-induced change by ${(100 * reduction).toFixed(1)} % (RMS ${without.toFixed(5)} → ${withDc.toFixed(5)})`);
  });
}
