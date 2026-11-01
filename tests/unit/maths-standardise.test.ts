// WP2: weighted standardisation with floors, the PCA block, clipping and the extrapolation flag.
import assert from 'node:assert/strict';
import test from 'node:test';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import { pcaScores } from '../../src/core/maths/pca.ts';
import {
  clipRow,
  fitFeatureTransform,
  normaliseWeights,
  transformRow,
  transformRows,
  weightedColumnStats,
} from '../../src/core/maths/standardise.ts';

test('weights are normalised to Σw = n', () => {
  const w = normaliseWeights([1, 3, 0, 4]);
  assert.deepEqual([...w], [0.5, 1.5, 0, 2]);
  assert.throws(() => normaliseWeights([0, 0]), RangeError);
  assert.throws(() => normaliseWeights([1, -1, 3]), RangeError);
  assert.throws(() => normaliseWeights([1, Number.NaN]), RangeError);
});

test('weighted means and SDs, with floors applied', () => {
  // Column 0 varies (σ above its floor), column 1 is constant (σ = 0), column 2 varies a little.
  const X = Float64Array.from([1, 5, 0.1, 2, 5, 0.1, 4, 5, 0.12]);
  const w = Float64Array.from([1, 1, 2]);
  const floors = [0.5, 0.25, 0.03];
  const { mu, sigma, scale } = weightedColumnStats(X, w, 3, 3, floors);
  const m0 = (1 + 2 + 8) / 4;
  const s0 = Math.sqrt(((1 - m0) ** 2 + (2 - m0) ** 2 + 2 * (4 - m0) ** 2) / 4);
  assert.ok(Math.abs((mu[0] as number) - m0) < 1e-15);
  assert.ok(Math.abs((sigma[0] as number) - s0) < 1e-15);
  assert.equal(scale[0], sigma[0]);
  assert.equal(mu[1], 5);
  assert.equal(sigma[1], 0);
  assert.equal(scale[1], 0.25, 'a constant column takes its floor');
  assert.ok((sigma[2] as number) < 0.03);
  assert.equal(scale[2], 0.03);
});

test('the transform standardises, clips to 1.5 ranges and flags only primary columns', () => {
  const n = 50;
  const rand = mulberry32(3);
  const X = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    X[i * 3] = rand();
    X[i * 3 + 1] = 10 + 2 * rand();
    X[i * 3 + 2] = 0.001 * rand();
  }
  const w = normaliseWeights(Array.from({ length: n }, () => 0.5 + rand()));
  const t = fitFeatureTransform(X, w, n, 3, { floors: [0.01, 0.01, 0.05], standardise: true, primary: [0] }, 1);
  assert.equal(t.pOut, 3);
  assert.equal(t.pca, null);
  assert.deepEqual([...t.primaryOut], [0]);
  assert.equal(t.scale[2], 0.05, 'floor on the low-variance column');
  const Z = transformRows(t, X, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 3; j++) {
      const expected = ((X[i * 3 + j] as number) - (t.mu[j] as number)) / (t.scale[j] as number);
      assert.ok(Math.abs((Z[i * 3 + j] as number) - expected) < 1e-15);
      assert.ok((Z[i * 3 + j] as number) >= (t.zMin[j] as number) && (Z[i * 3 + j] as number) <= (t.zMax[j] as number));
    }
  }

  const r0 = (t.zMax[0] as number) - (t.zMin[0] as number);
  const r1 = (t.zMax[1] as number) - (t.zMin[1] as number);
  const inside = Float64Array.from([(t.zMax[0] as number) + 0.4 * r0, t.zMin[1] as number, 0]);
  const copy = Float64Array.from(inside);
  assert.equal(clipRow(inside, t.zMin, t.zMax, t.primaryOut), false);
  assert.deepEqual(inside, copy, 'within the margin nothing changes');

  const primaryOut = Float64Array.from([(t.zMax[0] as number) + 3 * r0, 0, 0]);
  assert.equal(clipRow(primaryOut, t.zMin, t.zMax, t.primaryOut), true);
  assert.ok(Math.abs((primaryOut[0] as number) - ((t.zMax[0] as number) + 0.5 * r0)) < 1e-12);

  const below = Float64Array.from([(t.zMin[0] as number) - 0.6 * r0, 0, 0]);
  assert.equal(clipRow(below, t.zMin, t.zMax, t.primaryOut), true);
  assert.equal(below[0], (t.zMin[0] as number) - 0.5 * r0);

  const other = Float64Array.from([0, (t.zMin[1] as number) - 10 * r1, 0]);
  assert.equal(clipRow(other, t.zMin, t.zMax, t.primaryOut), false, 'a non-primary column is clipped silently');
  assert.equal(other[1], (t.zMin[1] as number) - 0.5 * r1);

  const nan = Float64Array.from([Number.NaN, 0, 0]);
  clipRow(nan, t.zMin, t.zMax, t.primaryOut);
  assert.ok(Number.isNaN(nan[0]), 'non-finite values are left for the caller to reject');
});

test('the clipping range ignores rows with zero weight', () => {
  const X = Float64Array.from([0, 1, 2, 3, 100]);
  const w = Float64Array.from([1, 1, 1, 1, 0]);
  const t = fitFeatureTransform(X, w, 5, 1, { floors: [0.1], standardise: true, primary: [0] }, 1);
  const z = new Float64Array(1);
  transformRow(t, [3], z);
  assert.equal(t.zMax[0], z[0]);
  assert.equal(t.mu[0], 1.5);
});

test('an unstandardised mapper keeps raw values', () => {
  const X = Float64Array.from([10, 200, 30, 40]);
  const t = fitFeatureTransform(X, Float64Array.from([1, 1]), 2, 2, { floors: [0, 0], standardise: false, primary: [] }, 1);
  assert.deepEqual([...t.mu], [0, 0]);
  assert.deepEqual([...t.scale], [1, 1]);
  assert.deepEqual([...transformRows(t, X, 2)], [10, 200, 30, 40]);
});

test('a PCA block is centred, projected and scaled, with the other columns standardised', () => {
  const n = 120;
  const d = 30;
  const normal = gaussian(mulberry32(8));
  const pIn = 2 + d + 3;
  const X = new Float64Array(n * pIn);
  for (let i = 0; i < n; i++) for (let j = 0; j < pIn; j++) X[i * pIn + j] = normal() * (j < 2 ? 2 : 1) + j;
  const w = normaliseWeights(new Float64Array(n).fill(1));
  const floors = new Float64Array(pIn).fill(0.01);
  const t = fitFeatureTransform(X, w, n, pIn, { floors, standardise: true, pca: { start: 2, end: 2 + d, k: 4 }, primary: [0, 5, 33] }, 42);
  assert.equal(t.pOut, 2 + 4 + 3);
  assert.deepEqual([...t.primaryOut], [0, 2, 3, 4, 5, 7]);
  assert.ok(t.pca);
  for (let j = 2; j < 2 + d; j++) {
    assert.equal(t.mu[j], 0);
    assert.equal(t.scale[j], 1);
  }
  const z = new Float64Array(t.pOut);
  transformRow(t, X.subarray(0, pIn), z);
  const scores = new Float64Array(4);
  pcaScores(t.pca, X, 2, scores, 0);
  assert.deepEqual([...z.subarray(2, 6)], [...scores]);
  assert.ok(Math.abs((z[0] as number) - ((X[0] as number) - (t.mu[0] as number)) / (t.scale[0] as number)) < 1e-15);
  assert.ok(Math.abs((z[8] as number) - ((X[pIn - 1] as number) - (t.mu[pIn - 1] as number)) / (t.scale[pIn - 1] as number)) < 1e-15);
  const again = fitFeatureTransform(X, w, n, pIn, { floors, standardise: true, pca: { start: 2, end: 2 + d, k: 4 }, primary: [0] }, 42);
  assert.deepEqual(again.pca?.components, t.pca.components);
});

test('invalid transform specifications throw', () => {
  const X = Float64Array.from([1, 2, 3, 4]);
  const w = Float64Array.from([1, 1]);
  assert.throws(() => fitFeatureTransform(X, w, 2, 2, { floors: [0.1, 0], standardise: true, primary: [] }, 1), RangeError);
  assert.throws(() => fitFeatureTransform(X, w, 2, 2, { floors: [0.1, 0.1], standardise: true, primary: [2] }, 1), RangeError);
  assert.throws(
    () => fitFeatureTransform(X, w, 2, 2, { floors: [0.1, 0.1], standardise: true, pca: { start: 1, end: 3, k: 1 }, primary: [] }, 1),
    RangeError,
  );
  assert.throws(() => fitFeatureTransform(X, new Float64Array(2), 2, 2, { floors: [0.1, 0.1], standardise: true, primary: [] }, 1), RangeError);
  assert.throws(() => fitFeatureTransform(Float64Array.from([1, Number.NaN, 3, 4]), w, 2, 2, { floors: [0.1, 0.1], standardise: true, primary: [] }, 1), RangeError);
});
