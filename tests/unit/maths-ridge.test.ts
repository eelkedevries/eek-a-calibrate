// WP2: weighted ridge against the closed form; unpenalised intercept; λ scaling; leverage.
import assert from 'node:assert/strict';
import test from 'node:test';
import { luSolve, matMul, SingularMatrixError, transpose } from '../../src/core/maths/linalg.ts';
import {
  leverage,
  leverages,
  predictRow,
  predictRows,
  residuals,
  resolveLambda,
  ridgeFit,
  ridgeInverse,
  withIntercept,
} from '../../src/core/maths/ridge.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import { normaliseWeights } from '../../src/core/maths/standardise.ts';

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  assert.equal(a.length, b.length);
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs((a[i] as number) - (b[i] as number)));
  return m;
}

function randomProblem(n: number, p: number, seed: number) {
  const rand = mulberry32(seed);
  const normal = gaussian(rand);
  const X = Float64Array.from({ length: n * p }, () => normal());
  const Z = withIntercept(X, n, p);
  const Y = Float64Array.from({ length: n * 2 }, () => 5 * normal() + 3);
  const w = Float64Array.from({ length: n }, () => 0.2 + rand());
  return { Z, Y, w, q: p + 1 };
}

/** Closed form by an independent route: diag(w) applied explicitly, then a general LU solve. */
function closedForm(Z: Float64Array, Y: Float64Array, w: Float64Array, n: number, q: number, lambda: number, unpen: number[]) {
  const Zt = transpose(Z, n, q);
  const WZ = Float64Array.from(Z, (v, i) => v * (w[Math.floor(i / q)] as number));
  const WY = Float64Array.from(Y, (v, i) => v * (w[Math.floor(i / 2)] as number));
  const M = matMul(Zt, WZ, q, n, q);
  for (let j = 0; j < q; j++) if (!unpen.includes(j)) M[j * q + j] = (M[j * q + j] as number) + lambda;
  return luSolve(M, q, matMul(Zt, WY, q, n, 2), 2);
}

test('a one-dimensional fit by hand', () => {
  // z = (−1, 0, 1): slope = Σzy/(Σz² + λ), intercept = mean(y) (z is centred, intercept free).
  const Z = withIntercept(Float64Array.from([-1, 0, 1]), 3, 1);
  const Y = Float64Array.from([-2, 3, 0, 5, 2, 7]);
  const fit = ridgeFit(Z, Y, Float64Array.from([1, 1, 1]), 3, 2, 2, [0]);
  assert.ok(maxAbsDiff(fit.B, [0, 5, 1, 1]) < 1e-14);
  assert.ok(maxAbsDiff(predictRow(fit.B, [1, 1], 2), [1, 6]) < 1e-14);
});

test('ridge matches the closed form and its normal equations', () => {
  for (const [n, p, lambda] of [
    [40, 3, 0.5],
    [200, 12, 7],
    [25, 30, 2],
  ] as const) {
    const { Z, Y, w, q } = randomProblem(n, p, n + p);
    const fit = ridgeFit(Z, Y, w, n, q, lambda, [0]);
    assert.ok(maxAbsDiff(fit.B, closedForm(Z, Y, w, n, q, lambda, [0])) < 1e-10);
    // Zᵀ W (Y − Z B) = Λ B
    const r = residuals(Z, Y, fit.B, n, q);
    for (let j = 0; j < q; j++) {
      for (let a = 0; a < 2; a++) {
        let g = 0;
        for (let i = 0; i < n; i++) g += (Z[i * q + j] as number) * (w[i] as number) * (r[i * 2 + a] as number);
        const expected = j === 0 ? 0 : lambda * (fit.B[j * 2 + a] as number);
        assert.ok(Math.abs(g - expected) < 1e-9, `gradient ${j},${a}: ${g} vs ${expected}`);
      }
    }
    const A = ridgeInverse(fit);
    const M = closedFormMatrix(Z, w, n, q, lambda);
    const I = matMul(M, A, q, q, q);
    for (let i = 0; i < q; i++) for (let j = 0; j < q; j++) assert.ok(Math.abs((I[i * q + j] as number) - (i === j ? 1 : 0)) < 1e-9);
  }
});

function closedFormMatrix(Z: Float64Array, w: Float64Array, n: number, q: number, lambda: number): Float64Array {
  const M = new Float64Array(q * q);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < q; a++) for (let b = 0; b < q; b++) M[a * q + b] = (M[a * q + b] as number) + (w[i] as number) * (Z[i * q + a] as number) * (Z[i * q + b] as number);
  }
  for (let j = 1; j < q; j++) M[j * q + j] = (M[j * q + j] as number) + lambda;
  return M;
}

test('the intercept is unpenalised', () => {
  const n = 60;
  const { Z, Y, w, q } = randomProblem(n, 5, 3);
  const shifted = Float64Array.from(Y, (v, i) => v + (i % 2 === 0 ? 10 : -4));
  const a = ridgeFit(Z, Y, w, n, q, 50, [0]);
  const b = ridgeFit(Z, shifted, w, n, q, 50, [0]);
  assert.ok(Math.abs((b.B[0] as number) - (a.B[0] as number) - 10) < 1e-10);
  assert.ok(Math.abs((b.B[1] as number) - (a.B[1] as number) + 4) < 1e-10);
  assert.ok(maxAbsDiff(a.B.subarray(2), b.B.subarray(2)) < 1e-10);
  // A penalised intercept does not absorb the shift exactly.
  const c = ridgeFit(Z, Y, w, n, q, 50, []);
  const d = ridgeFit(Z, shifted, w, n, q, 50, []);
  assert.ok(Math.abs((d.B[0] as number) - (c.B[0] as number) - 10) > 1e-3);
  // A huge λ leaves only the intercept: the weighted mean of Y.
  const big = ridgeFit(Z, Y, w, n, q, 1e12, [0]);
  let sw = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sw += w[i] as number;
    sy += (w[i] as number) * (Y[i * 2] as number);
  }
  assert.ok(Math.abs((big.B[0] as number) - sy / sw) < 1e-8);
  assert.ok(Math.max(...Array.from(big.B.subarray(2), Math.abs)) < 1e-8);
});

test('λ = λ_rel·Σw makes the fit invariant to the scale of the weights', () => {
  const n = 80;
  const { Z, Y, w, q } = randomProblem(n, 6, 9);
  const wn = normaliseWeights(w);
  assert.ok(Math.abs(wn.reduce((s, v) => s + v, 0) - n) < 1e-12);
  assert.equal(resolveLambda(0.3, wn), 0.3 * wn.reduce((s, v) => s + v, 0));
  assert.equal(resolveLambda(1e-5, wn, true), 1e-5);
  const w7 = Float64Array.from(wn, (v) => 7 * v);
  const a = ridgeFit(Z, Y, wn, n, q, resolveLambda(0.3, wn), [0]);
  const b = ridgeFit(Z, Y, w7, n, q, resolveLambda(0.3, w7), [0]);
  assert.ok(maxAbsDiff(a.B, b.B) < 1e-12);
  assert.throws(() => resolveLambda(-1, wn), RangeError);
});

test('leverage is zᵀAz, and the unweighted OLS hat matrix has trace p', () => {
  const n = 50;
  const { Z, Y, q } = randomProblem(n, 4, 21);
  const ones = new Float64Array(n).fill(1);
  const fit = ridgeFit(Z, Y, ones, n, q, 0, [0]);
  const A = ridgeInverse(fit);
  const h = leverages(A, Z, n, q);
  assert.ok(Math.abs(h.reduce((s, v) => s + v, 0) - q) < 1e-10);
  const z = Z.subarray(7 * q, 8 * q);
  let manual = 0;
  for (let a = 0; a < q; a++) for (let b = 0; b < q; b++) manual += (z[a] as number) * (A[a * q + b] as number) * (z[b] as number);
  assert.ok(Math.abs(leverage(A, z, q) - manual) < 1e-14);
  assert.ok(maxAbsDiff(predictRows(fit.B, Z, n, q), Float64Array.from(Y, (v, i) => v - (residuals(Z, Y, fit.B, n, q)[i] as number))) < 1e-12);
});

test('degenerate and invalid inputs throw', () => {
  const n = 20;
  const { Z, Y, w, q } = randomProblem(n, 3, 4);
  const dup = Float64Array.from(Z);
  for (let i = 0; i < n; i++) dup[i * q + 2] = dup[i * q + 1] as number;
  assert.throws(() => ridgeFit(dup, Y, w, n, q, 0, [0]), SingularMatrixError);
  assert.doesNotThrow(() => ridgeFit(dup, Y, w, n, q, 1e-6, [0]));
  assert.throws(() => ridgeFit(Z, Y, new Float64Array(n), n, q, 1, [0]), SingularMatrixError);
  const bad = Float64Array.from(Z);
  bad[5] = Number.NaN;
  assert.throws(() => ridgeFit(bad, Y, w, n, q, 1, [0]), RangeError);
  const neg = Float64Array.from(w);
  neg[0] = -1;
  assert.throws(() => ridgeFit(Z, Y, neg, n, q, 1, [0]), RangeError);
  assert.throws(() => ridgeFit(Z, Y, w, n, q, Number.NaN, [0]), RangeError);
  assert.throws(() => ridgeFit(Z, Y, w, n, q, 1, [q]), RangeError);
  assert.throws(() => ridgeFit(Z, Y.subarray(1), w, n, q, 1, [0]), RangeError);
});
