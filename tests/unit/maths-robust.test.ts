// WP2: Huber IRLS, hard rejection, λ selection and the robust refit with leverage.
import assert from 'node:assert/strict';
import test from 'node:test';
import { LAMBDA_REL, ROBUST } from '../../src/core/constants.ts';
import type { Vec2 } from '../../src/core/types.ts';
import { cvScore, groupedLooResiduals, oofFromResiduals } from '../../src/core/maths/groupedLoo.ts';
import { leverages, predictRow, residuals, resolveLambda, ridgeFit, withIntercept } from '../../src/core/maths/ridge.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import { hardReject, huberReweight, residualNorms, robustRidgeFit, selectLambda, type RidgeProblem } from '../../src/core/maths/robust.ts';
import { normaliseWeights } from '../../src/core/maths/standardise.ts';
import { percentile } from '../../src/core/maths/stats.ts';

const DEG = Math.PI / 180;
/** The §4.5 exact angular separation, re-implemented here (geometry belongs to WP3). */
function ang(a: Vec2, b: Vec2): number {
  const ax = Math.tan(a[0] * DEG);
  const ay = Math.tan(a[1] * DEG);
  const bx = Math.tan(b[0] * DEG);
  const by = Math.tan(b[1] * DEG);
  return Math.atan2(Math.sqrt((ay - by) ** 2 + (bx - ax) ** 2 + (ax * by - ay * bx) ** 2), ax * bx + ay * by + 1) / DEG;
}

function linearProblem(nPerGroup: number, G: number, p: number, noise: number, seed: number) {
  const rand = mulberry32(seed);
  const normal = gaussian(rand);
  const n = nPerGroup * G;
  const X = Float64Array.from({ length: n * p }, () => normal());
  const Z = withIntercept(X, n, p);
  const q = p + 1;
  const beta = Float64Array.from({ length: q * 2 }, () => 4 * normal());
  const Y = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const [x, y] = predictRow(beta, Z.subarray(i * q, (i + 1) * q), q);
    Y[i * 2] = x + noise * normal();
    Y[i * 2 + 1] = y + noise * normal();
  }
  const groups = Int32Array.from({ length: n }, (_, i) => i % G);
  const w = normaliseWeights(Array.from({ length: n }, () => 0.5 + rand()));
  return { Z, Y, w, groups, n, q, beta };
}

test('Huber reweighting multiplies the base weight by min(1, k·s/ρ)', () => {
  const rho = Float64Array.from([1, 1, 2, 2, 3, 100]);
  const base = Float64Array.from([1, 1, 1, 1, 2, 1]);
  const { weights, scale } = huberReweight(rho, base, 1.345);
  assert.ok(Math.abs(scale - 1.4826 * 2) < 1e-15);
  const cut = 1.345 * scale;
  for (let i = 0; i < 5; i++) assert.equal(weights[i], base[i], 'inside k·s the weight is kept');
  assert.ok(Math.abs((weights[5] as number) - cut / 100) < 1e-15);
  assert.deepEqual([...huberReweight(Float64Array.from([0, 0, 0, 5]), Float64Array.from([1, 1, 1, 1])).weights], [1, 1, 1, 1]);
  assert.equal(ROBUST.huberK, 1.345);
});

test('hard rejection uses the within-group robust z of ρ', () => {
  const rho = Float64Array.from([1, 1.2, 0.9, 1.1, 1.0, 9, 5, 5, 5, 5, 6]);
  const groups = Int32Array.from([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  const w = new Float64Array(11).fill(1);
  const { weights, rejected } = hardReject(rho, groups, w, 3.5);
  assert.deepEqual([...rejected], [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
  assert.equal(weights[5], 0);
  assert.equal(weights[10], 1, 'MAD = 0 in group 1: no usable scale, nothing rejected');
  // A row with zero weight neither counts towards the group statistics nor is reported.
  const w2 = Float64Array.from(w);
  w2[5] = 0;
  assert.equal(hardReject(rho, groups, w2, 3.5).rejected[5], 0);
});

test('a planted outlier is down-weighted by Huber and rejected', () => {
  const { Z, Y, w, groups, n, q, beta } = linearProblem(20, 8, 4, 0.2, 5);
  const outlier = 37;
  Y[outlier * 2] = (Y[outlier * 2] as number) + 25;
  Y[outlier * 2 + 1] = (Y[outlier * 2 + 1] as number) - 15;
  const problem: RidgeProblem = { Z, Y, w, n, p: q, groups, unpenalised: [0], lambdaRel: LAMBDA_REL, ang };

  const plain = ridgeFit(Z, Y, w, n, q, resolveLambda(1e-4, w), [0]);
  const hub = huberReweight(residualNorms(residuals(Z, Y, plain.B, n, q), n), w);
  assert.ok((hub.weights[outlier] as number) < 0.1 * (w[outlier] as number), 'Huber down-weights the outlier');

  const fit = robustRidgeFit(problem);
  assert.equal(fit.weights[outlier], 0);
  assert.equal(fit.rejected[outlier], 1);
  const nRejected = fit.rejected.reduce((s, v) => s + v, 0);
  assert.ok(nRejected <= 3, `only gross outliers are rejected (${nRejected})`);
  const err = (B: Float64Array) => Math.max(...Array.from(B, (v, i) => Math.abs(v - (beta[i] as number))));
  assert.ok(err(fit.B) < 0.5 * err(plain.B), `robust ${err(fit.B)} vs plain ${err(plain.B)}`);
  assert.ok(err(fit.B) < 0.1);
});

test('λ selection takes the lowest CV score of the grid', () => {
  const { Z, Y, w, groups, n, q } = linearProblem(15, 6, 10, 2, 9);
  const problem: RidgeProblem = { Z, Y, w, n, p: q, groups, unpenalised: [0], lambdaRel: LAMBDA_REL, ang };
  const sel = selectLambda(problem, w);
  assert.equal(sel.candidates.length, LAMBDA_REL.length);
  const best = Math.min(...sel.candidates.map((c) => c.cv?.meanDeg ?? Infinity));
  assert.equal(sel.cv.meanDeg, best);
  for (const c of sel.candidates) {
    assert.ok(Math.abs(c.lambda - c.lambdaRel * n) < 1e-12 * c.lambda, 'λ = λ_rel·Σw with Σw = n');
    const e = groupedLooResiduals(Z, Y, w, n, q, c.lambda, groups, [0]);
    assert.ok(c.cv);
    assert.equal(c.cv.meanDeg, cvScore(oofFromResiduals(Y, e), Y, n, groups, ang).meanDeg);
  }
  const absolute = selectLambda({ ...problem, lambdaRel: [1e-5], absoluteLambda: true }, w);
  assert.equal(absolute.lambda, 1e-5);
  assert.throws(() => selectLambda({ ...problem, lambdaRel: [] }, w), RangeError);
});

test('singular λ values are recorded and skipped', () => {
  const { Z, Y, w, groups, n, q } = linearProblem(10, 4, 3, 1, 12);
  const dup = Float64Array.from(Z);
  for (let i = 0; i < n; i++) dup[i * q + 2] = dup[i * q + 1] as number;
  const problem: RidgeProblem = { Z: dup, Y, w, n, p: q, groups, unpenalised: [0], lambdaRel: [0, 0.1], ang };
  const sel = selectLambda(problem, w);
  assert.equal(sel.lambdaRel, 0.1);
  assert.equal(sel.candidates[0]?.cv, null);
  assert.match(sel.candidates[0]?.error ?? '', /singular/);
  assert.throws(() => selectLambda({ ...problem, lambdaRel: [0] }, w), /no λ gave a finite CV score/);
});

test('the robust fit reports leverage, h95 and its CV consistently', () => {
  const { Z, Y, w, groups, n, q } = linearProblem(12, 7, 5, 0.5, 14);
  const fit = robustRidgeFit({ Z, Y, w, n, p: q, groups, unpenalised: [0], lambdaRel: LAMBDA_REL, ang });
  const viaA = leverages(fit.A, Z, n, q);
  for (let i = 0; i < n; i++) assert.ok(Math.abs((fit.leverage[i] as number) - (viaA[i] as number)) < 1e-12);
  assert.equal(fit.h95, percentile(fit.leverage, 95));
  const final = ridgeFit(Z, Y, fit.weights, n, q, fit.lambda, [0]);
  for (let k = 0; k < fit.B.length; k++) assert.ok(Math.abs((fit.B[k] as number) - (final.B[k] as number)) < 1e-10);
  assert.equal(fit.lambda, resolveLambda(fit.lambdaRel, fit.weights));
  const e = groupedLooResiduals(Z, Y, fit.weights, n, q, fit.lambda, groups, [0]);
  assert.deepEqual(fit.oof, oofFromResiduals(Y, e));
  assert.equal(fit.cv.meanDeg, cvScore(fit.oof, Y, n, groups, ang).meanDeg);
  assert.ok(fit.cv.meanDeg > 0 && Number.isFinite(fit.cv.seDeg));
  assert.ok(Number.isFinite(fit.huberScale) && fit.huberScale > 0);
  const again = robustRidgeFit({ Z, Y, w, n, p: q, groups, unpenalised: [0], lambdaRel: LAMBDA_REL, ang });
  assert.deepEqual(again.B, fit.B);
});
