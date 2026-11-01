// WP2: seeded randomised PCA: byte-identical for a seed, exact on a low-rank fixture.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PCA } from '../../src/core/constants.ts';
import { matMul, orthonormaliseRowsInPlace, symmetricEigen, transpose } from '../../src/core/maths/linalg.ts';
import { fitPca, pcaScores } from '../../src/core/maths/pca.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';

/** X = 1·μᵀ + U·diag(s)·Vᵀ with orthonormal V (r × d rows): its centred rows span V exactly. */
function lowRank(n: number, d: number, s: readonly number[], seed: number) {
  const rand = mulberry32(seed);
  const normal = gaussian(rand);
  const r = s.length;
  const V = Float64Array.from({ length: r * d }, () => normal());
  orthonormaliseRowsInPlace(V, r, d);
  const mu = Float64Array.from({ length: d }, () => 10 * normal());
  const X = new Float64Array(n * d);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < d; c++) X[i * d + c] = mu[c] as number;
    for (let j = 0; j < r; j++) {
      const u = (s[j] as number) * normal();
      for (let c = 0; c < d; c++) X[i * d + c] = (X[i * d + c] as number) + u * (V[j * d + c] as number);
    }
  }
  const w = Float64Array.from({ length: n }, () => 0.1 + rand());
  return { X, w, V };
}

function projector(rows: Float64Array, r: number, d: number): Float64Array {
  return matMul(transpose(rows, r, d), rows, d, r, d);
}

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs((a[i] as number) - (b[i] as number)));
  return m;
}

const OPTS = { oversample: PCA.oversample, powerIters: PCA.powerIters };

test('the same seed gives byte-identical components', () => {
  const n = 200;
  const d = 96;
  const { X, w } = lowRank(n, d, [9, 7, 5, 4, 3, 2, 1.5, 1, 0.5, 0.25, 0.1], 3);
  const noise = gaussian(mulberry32(4));
  for (let i = 0; i < X.length; i++) X[i] = (X[i] as number) + 0.01 * noise();
  const a = fitPca(X, w, n, d, { k: 8, ...OPTS, seed: 1234 });
  const b = fitPca(X, w, n, d, { k: 8, ...OPTS, seed: 1234 });
  assert.deepEqual(Buffer.from(a.components.buffer), Buffer.from(b.components.buffer));
  assert.deepEqual(Buffer.from(a.mean.buffer), Buffer.from(b.mean.buffer));
  assert.deepEqual(Buffer.from(a.eigenvalues.buffer), Buffer.from(b.eigenvalues.buffer));
  assert.equal(a.commonScale, b.commonScale);
  const c = fitPca(X, w, n, d, { k: 8, ...OPTS, seed: 1235 });
  assert.notDeepEqual(Buffer.from(a.components.buffer), Buffer.from(c.components.buffer));
});

test('matches the exact principal subspace of a low-rank fixture', () => {
  const n = 150;
  const d = 40;
  const s = [12, 9, 6, 4, 2.5, 1];
  const { X, w, V } = lowRank(n, d, s, 7);
  const basis = fitPca(X, w, n, d, { k: s.length, ...OPTS, seed: 99 });
  const P = projector(basis.components, s.length, d);
  assert.ok(maxAbsDiff(P, projector(V, s.length, d)) < 1e-9, 'projector onto the components');
  const CCt = matMul(basis.components, transpose(basis.components, s.length, d), s.length, d, s.length);
  for (let a = 0; a < s.length; a++) for (let b = 0; b < s.length; b++) assert.ok(Math.abs((CCt[a * s.length + b] as number) - (a === b ? 1 : 0)) < 1e-12);

  // Weighted mean, total variance and the scale of the first score.
  let sumW = 0;
  for (const v of w) sumW += v;
  const mean = new Float64Array(d);
  for (let i = 0; i < n; i++) for (let c = 0; c < d; c++) mean[c] = (mean[c] as number) + ((w[i] as number) * (X[i * d + c] as number)) / sumW;
  assert.ok(maxAbsDiff(basis.mean, mean) < 1e-10);
  let totalVar = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < d; c++) totalVar += ((w[i] as number) * ((X[i * d + c] as number) - (mean[c] as number)) ** 2) / sumW;
  const sumEig = basis.eigenvalues.reduce((a, v) => a + v, 0);
  assert.ok(Math.abs(sumEig - totalVar) < 1e-9 * totalVar);
  assert.equal(basis.commonScale, Math.sqrt(basis.eigenvalues[0] as number));
  const scores = new Float64Array(s.length);
  const varScore = new Float64Array(s.length);
  for (let i = 0; i < n; i++) {
    pcaScores(basis, X, i * d, scores, 0);
    for (let j = 0; j < s.length; j++) varScore[j] = (varScore[j] as number) + ((w[i] as number) * (scores[j] as number) ** 2) / sumW;
  }
  assert.ok(Math.abs((varScore[0] as number) - 1) < 1e-10, 'the first scaled score has unit variance');
  for (let j = 0; j < s.length; j++) {
    assert.ok(Math.abs((varScore[j] as number) - (basis.eigenvalues[j] as number) / (basis.eigenvalues[0] as number)) < 1e-10);
  }
});

test('matches the exact eigen-decomposition with a decaying spectrum', () => {
  const n = 300;
  const d = 30;
  const s = [20, 15, 11, 8, 6, 0.02, 0.015, 0.01];
  const { X, w } = lowRank(n, d, s, 13);
  const basis = fitPca(X, w, n, d, { k: 5, ...OPTS, seed: 5 });
  let sumW = 0;
  for (const v of w) sumW += v;
  const C = new Float64Array(d * d);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < d; a++) {
      for (let b = 0; b < d; b++) {
        C[a * d + b] = (C[a * d + b] as number) + ((w[i] as number) * ((X[i * d + a] as number) - (basis.mean[a] as number)) * ((X[i * d + b] as number) - (basis.mean[b] as number))) / sumW;
      }
    }
  }
  const exact = symmetricEigen(C, d);
  const top = new Float64Array(5 * d);
  for (let j = 0; j < 5; j++) for (let c = 0; c < d; c++) top[j * d + c] = exact.vectors[c * d + j] as number;
  assert.ok(maxAbsDiff(projector(basis.components, 5, d), projector(top, 5, d)) < 1e-9);
  for (let j = 0; j < 5; j++) assert.ok(Math.abs((basis.eigenvalues[j] as number) - (exact.values[j] as number)) < 1e-9 * (exact.values[0] as number));
});

test('zero-weight rows are ignored and rank below k gives zero components', () => {
  const n = 60;
  const d = 25;
  const { X, w } = lowRank(n, d, [5, 3, 1], 17);
  const base = fitPca(X, w, n, d, { k: 6, ...OPTS, seed: 2 });
  for (let j = 3; j < 6; j++) {
    assert.ok(base.components.subarray(j * d, (j + 1) * d).every((v) => v === 0));
    assert.equal(base.eigenvalues[j], 0);
  }
  const X2 = new Float64Array((n + 1) * d);
  X2.set(X);
  X2.fill(1e6, n * d);
  const w2 = new Float64Array(n + 1);
  w2.set(w);
  const extra = fitPca(X2, w2, n + 1, d, { k: 6, ...OPTS, seed: 2 });
  assert.deepEqual(extra.components, base.components);
  assert.deepEqual(extra.mean, base.mean);
});

test('the default size runs and degenerate blocks throw', () => {
  const n = 220;
  const d = 512;
  const normal = gaussian(mulberry32(21));
  const X = Float64Array.from({ length: n * d }, () => normal());
  const w = new Float64Array(n).fill(1);
  const basis = fitPca(X, w, n, d, { k: PCA.k, ...OPTS, seed: 77 });
  assert.equal(basis.components.length, PCA.k * d);
  for (let j = 1; j < PCA.k; j++) assert.ok((basis.eigenvalues[j - 1] as number) >= (basis.eigenvalues[j] as number) - 1e-12);

  assert.throws(() => fitPca(new Float64Array(10 * 4).fill(3), new Float64Array(10).fill(1), 10, 4, { k: 2, ...OPTS, seed: 1 }), RangeError);
  assert.throws(() => fitPca(X, new Float64Array(n), n, d, { k: 2, ...OPTS, seed: 1 }), RangeError);
  assert.throws(() => fitPca(X, w, n, d, { k: 0, ...OPTS, seed: 1 }), RangeError);
  const bad = Float64Array.from(X);
  bad[3] = Number.NaN;
  assert.throws(() => fitPca(bad, w, n, d, { k: 2, ...OPTS, seed: 1 }), RangeError);
});
