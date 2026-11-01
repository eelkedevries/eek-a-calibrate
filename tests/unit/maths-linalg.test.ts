// WP2: Cholesky, triangular and LU solves, Jacobi eigen-decomposition, orthonormalisation.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cholesky,
  choleskyInverse,
  choleskySolve,
  luSolve,
  matMul,
  orthonormaliseRowsInPlace,
  SingularMatrixError,
  symmetricEigen,
  transpose,
} from '../../src/core/maths/linalg.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  assert.equal(a.length, b.length);
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs((a[i] as number) - (b[i] as number)));
  return m;
}

function eye(n: number): Float64Array {
  const I = new Float64Array(n * n);
  for (let i = 0; i < n; i++) I[i * n + i] = 1;
  return I;
}

function randomSpd(n: number, seed: number): Float64Array {
  const normal = gaussian(mulberry32(seed));
  const R = Float64Array.from({ length: n * n }, () => normal());
  const A = matMul(transpose(R, n, n), R, n, n, n);
  for (let i = 0; i < n; i++) A[i * n + i] = (A[i * n + i] as number) + n;
  return A;
}

test('Cholesky of a known matrix', () => {
  const A = Float64Array.from([4, 12, -16, 12, 37, -43, -16, -43, 98]);
  const L = cholesky(A, 3);
  assert.deepEqual([...L], [2, 0, 0, 6, 1, 0, -8, 5, 3]);
  const x = Float64Array.from([1, -2, 3]);
  const b = matMul(A, x, 3, 3, 1);
  assert.ok(maxAbsDiff(choleskySolve(L, 3, b, 1), x) < 1e-12);
});

test('Cholesky solve and inverse on random SPD systems', () => {
  for (const n of [1, 2, 7, 25]) {
    const A = randomSpd(n, 100 + n);
    const L = cholesky(A, n);
    assert.ok(maxAbsDiff(matMul(L, transpose(L, n, n), n, n, n), A) < 1e-10 * n);
    const X = Float64Array.from({ length: n * 3 }, (_, i) => Math.sin(i + 1));
    const B = matMul(A, X, n, n, 3);
    assert.ok(maxAbsDiff(choleskySolve(L, n, B, 3), X) < 1e-10);
    const inv = choleskyInverse(L, n);
    assert.ok(maxAbsDiff(matMul(A, inv, n, n, n), eye(n)) < 1e-10);
    assert.ok(maxAbsDiff(inv, transpose(inv, n, n)) === 0, 'the inverse is exactly symmetric');
  }
});

test('Cholesky rejects singular and indefinite matrices', () => {
  assert.throws(() => cholesky(Float64Array.from([1, 1, 1, 1]), 2), SingularMatrixError);
  assert.throws(() => cholesky(Float64Array.from([1, 2, 2, 1]), 2), SingularMatrixError);
  assert.throws(() => cholesky(Float64Array.from([0, 0, 0, 1]), 2), SingularMatrixError);
  assert.throws(() => cholesky(Float64Array.from([Number.NaN]), 1), SingularMatrixError);
  assert.throws(() => cholesky(Float64Array.from([1, 2, 3]), 2), RangeError);
});

test('LU solve with pivoting', () => {
  assert.deepEqual([...luSolve(Float64Array.from([0, 1, 1, 0]), 2, Float64Array.from([2, 3]), 1)], [3, 2]);
  const n = 9;
  const normal = gaussian(mulberry32(5));
  const A = Float64Array.from({ length: n * n }, () => normal());
  const X = Float64Array.from({ length: n * 2 }, () => normal());
  const B = matMul(A, X, n, n, 2);
  assert.ok(maxAbsDiff(luSolve(A, n, B, 2), X) < 1e-10);
  assert.ok(A.every((v, i) => v === A[i]), 'inputs untouched');
  assert.throws(() => luSolve(Float64Array.from([1, 2, 2, 4]), 2, Float64Array.from([1, 1]), 1), SingularMatrixError);
});

test('matMul and transpose', () => {
  const A = Float64Array.from([1, 2, 3, 4, 5, 6]);
  const B = Float64Array.from([7, 8, 9, 10, 11, 12]);
  assert.deepEqual([...matMul(A, B, 2, 3, 2)], [58, 64, 139, 154]);
  assert.deepEqual([...transpose(A, 2, 3)], [1, 4, 2, 5, 3, 6]);
});

test('Jacobi eigen-decomposition', () => {
  const two = symmetricEigen(Float64Array.from([2, 1, 1, 2]), 2);
  assert.ok(maxAbsDiff(two.values, [3, 1]) < 1e-14);
  assert.ok(Math.abs(Math.abs(two.vectors[0] as number) - Math.SQRT1_2) < 1e-14);

  for (const n of [1, 5, 12, 30]) {
    const A = randomSpd(n, 7 * n);
    for (let i = 0; i < n; i++) A[i * n + i] = (A[i * n + i] as number) - 2 * n;
    const { values, vectors } = symmetricEigen(A, n);
    for (let k = 1; k < n; k++) assert.ok((values[k - 1] as number) >= (values[k] as number));
    const VtV = matMul(transpose(vectors, n, n), vectors, n, n, n);
    assert.ok(maxAbsDiff(VtV, eye(n)) < 1e-12);
    const AV = matMul(A, vectors, n, n, n);
    const VL = Float64Array.from(vectors, (v, i) => v * (values[i % n] as number));
    assert.ok(maxAbsDiff(AV, VL) < 1e-10 * n, `n = ${n}`);
  }

  const diag = symmetricEigen(Float64Array.from([1, 0, 0, 0, 5, 0, 0, 0, 3]), 3);
  assert.deepEqual([...diag.values], [5, 3, 1]);
  const zero = symmetricEigen(new Float64Array(4), 2);
  assert.deepEqual([...zero.values], [0, 0]);
});

test('orthonormalisation of rows, with a dependent row', () => {
  const r = 5;
  const c = 20;
  const normal = gaussian(mulberry32(11));
  const M = Float64Array.from({ length: r * c }, () => normal());
  for (let t = 0; t < c; t++) M[3 * c + t] = 2 * (M[t] as number) - (M[c + t] as number);
  const rank = orthonormaliseRowsInPlace(M, r, c);
  assert.equal(rank, 4);
  assert.ok(M.subarray(3 * c, 4 * c).every((v) => v === 0));
  const G = matMul(M, transpose(M, r, c), r, c, r);
  const expected = eye(r);
  expected[3 * r + 3] = 0;
  assert.ok(maxAbsDiff(G, expected) < 1e-14);
});
