// WP2: exact grouped leave-one-out equals brute-force refits; the CV score.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Vec2 } from '../../src/core/types.ts';
import { cvScore, groupedLooPath, groupedLooResiduals, oofFromResiduals } from '../../src/core/maths/groupedLoo.ts';
import { choleskyInverse, luSolve, SingularMatrixError } from '../../src/core/maths/linalg.ts';
import { predictRow, residuals, ridgeFit, withIntercept } from '../../src/core/maths/ridge.ts';
import { fisherYates, gaussian, mulberry32 } from '../../src/core/maths/rng.ts';

const DEG = Math.PI / 180;
/** The §4.5 exact angular separation, re-implemented here (geometry belongs to WP3). */
function ang(a: Vec2, b: Vec2): number {
  const ax = Math.tan(a[0] * DEG);
  const ay = Math.tan(a[1] * DEG);
  const bx = Math.tan(b[0] * DEG);
  const by = Math.tan(b[1] * DEG);
  const cross = Math.sqrt((ay - by) ** 2 + (bx - ax) ** 2 + (ax * by - ay * bx) ** 2);
  return Math.atan2(cross, ax * bx + ay * by + 1) / DEG;
}

interface Problem {
  Z: Float64Array;
  Y: Float64Array;
  w: Float64Array;
  groups: Int32Array;
  n: number;
  q: number;
}

function randomProblem(sizes: readonly number[], p: number, seed: number, zeroWeightFraction = 0.1): Problem {
  const rand = mulberry32(seed);
  const normal = gaussian(rand);
  const n = sizes.reduce((s, v) => s + v, 0);
  const labels: number[] = [];
  sizes.forEach((size, g) => {
    for (let k = 0; k < size; k++) labels.push(100 + 7 * g);
  });
  fisherYates(labels, rand);
  const X = Float64Array.from({ length: n * p }, () => normal());
  const Z = withIntercept(X, n, p);
  const q = p + 1;
  const beta = Float64Array.from({ length: q * 2 }, () => 3 * normal());
  const Y = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const [x, y] = predictRow(beta, Z.subarray(i * q, (i + 1) * q), q);
    Y[i * 2] = x + normal();
    Y[i * 2 + 1] = y + normal();
  }
  const w = Float64Array.from({ length: n }, () => (rand() < zeroWeightFraction ? 0 : 0.05 + 3 * rand()));
  return { Z, Y, w, groups: Int32Array.from(labels), n, q };
}

function bruteForce(pr: Problem, lambda: number, unpen: readonly number[]): Float64Array {
  const { Z, Y, w, groups, n, q } = pr;
  const out = new Float64Array(n * 2);
  for (const g of new Set(groups)) {
    const keep: number[] = [];
    for (let i = 0; i < n; i++) if (groups[i] !== g) keep.push(i);
    const Zk = new Float64Array(keep.length * q);
    const Yk = new Float64Array(keep.length * 2);
    const wk = new Float64Array(keep.length);
    keep.forEach((i, r) => {
      Zk.set(Z.subarray(i * q, (i + 1) * q), r * q);
      Yk[r * 2] = Y[i * 2] as number;
      Yk[r * 2 + 1] = Y[i * 2 + 1] as number;
      wk[r] = w[i] as number;
    });
    const fit = ridgeFit(Zk, Yk, wk, keep.length, q, lambda, unpen);
    for (let i = 0; i < n; i++) {
      if (groups[i] !== g) continue;
      const [x, y] = predictRow(fit.B, Z.subarray(i * q, (i + 1) * q), q);
      out[i * 2] = (Y[i * 2] as number) - x;
      out[i * 2 + 1] = (Y[i * 2 + 1] as number) - y;
    }
  }
  return out;
}

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  assert.equal(a.length, b.length);
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs((a[i] as number) - (b[i] as number)));
  return m;
}

test('grouped LOO equals brute-force refits on random designs with unequal groups and weights', () => {
  const cases: [number[], number, number][] = [
    [[1, 3, 7, 12, 25, 40], 5, 1],
    [[30, 2, 19, 8, 1, 1, 60, 14, 9, 11, 5, 23, 4], 20, 2],
    [[4, 4, 5], 12, 3],
    [[120, 7, 33, 2, 61], 40, 4],
  ];
  let worst = 0;
  for (const [sizes, p, seed] of cases) {
    const pr = randomProblem(sizes, p, seed);
    let sumW = 0;
    for (const v of pr.w) sumW += v;
    for (const lambdaRel of [1e-4, 1e-2, 0.3, 3]) {
      const lambda = lambdaRel * sumW;
      const loo = groupedLooResiduals(pr.Z, pr.Y, pr.w, pr.n, pr.q, lambda, pr.groups, [0]);
      const d = maxAbsDiff(loo, bruteForce(pr, lambda, [0]));
      worst = Math.max(worst, d);
      assert.ok(d < 1e-9, `sizes ${sizes}, p ${p}, λ_rel ${lambdaRel}: max |Δ| = ${d}`);
    }
  }
  assert.ok(worst < 1e-9);
});

test('the result is the hat-matrix identity e_g = (I − H_gg)⁻¹ r_g', () => {
  const pr = randomProblem([6, 9, 3, 14], 8, 17, 0.2);
  const { Z, Y, w, groups, n, q } = pr;
  const lambda = 0.7;
  const fit = ridgeFit(Z, Y, w, n, q, lambda, [0]);
  const A = choleskyInverse(fit.L, q);
  const r = residuals(Z, Y, fit.B, n, q);
  const loo = groupedLooResiduals(Z, Y, w, n, q, lambda, groups, [0]);
  for (const g of new Set(groups)) {
    const rows = [...groups.keys()].filter((i) => groups[i] === g);
    const m = rows.length;
    const IH = new Float64Array(m * m);
    for (let a = 0; a < m; a++) {
      for (let b = 0; b < m; b++) {
        let h = 0;
        for (let s = 0; s < q; s++) {
          for (let t = 0; t < q; t++) h += (Z[(rows[a] as number) * q + s] as number) * (A[s * q + t] as number) * (Z[(rows[b] as number) * q + t] as number);
        }
        IH[a * m + b] = (a === b ? 1 : 0) - h * (w[rows[b] as number] as number);
      }
    }
    const rg = Float64Array.from(rows.flatMap((i) => [r[i * 2] as number, r[i * 2 + 1] as number]));
    const eg = luSolve(IH, m, rg, 2);
    rows.forEach((i, a) => {
      assert.ok(Math.abs((eg[a * 2] as number) - (loo[i * 2] as number)) < 1e-9);
      assert.ok(Math.abs((eg[a * 2 + 1] as number) - (loo[i * 2 + 1] as number)) < 1e-9);
    });
  }
});

test('the λ path matches single calls, extra unpenalised columns and zero-weight groups', () => {
  const pr = randomProblem([10, 15, 20, 25], 6, 23, 0);
  const { Z, Y, w, groups, n, q } = pr;
  const lambdas = [0.01, 1, 30];
  const path = groupedLooPath(Z, Y, w, n, q, lambdas, groups, [0, 3]);
  lambdas.forEach((lambda, j) => {
    assert.deepEqual(path[j], groupedLooResiduals(Z, Y, w, n, q, lambda, groups, [0, 3]));
    assert.ok(maxAbsDiff(path[j] as Float64Array, bruteForce(pr, lambda, [0, 3])) < 1e-9);
  });

  // A group with no weight does not influence the fit: its LOO residual is the full-fit residual.
  const wz = Float64Array.from(w);
  const g0 = groups[0] as number;
  for (let i = 0; i < n; i++) if (groups[i] === g0) wz[i] = 0;
  const loo = groupedLooResiduals(Z, Y, wz, n, q, 2, groups, [0]);
  const full = residuals(Z, Y, ridgeFit(Z, Y, wz, n, q, 2, [0]).B, n, q);
  for (let i = 0; i < n; i++) {
    if (groups[i] !== g0) continue;
    assert.ok(Math.abs((loo[i * 2] as number) - (full[i * 2] as number)) < 1e-12);
  }
  assert.ok(maxAbsDiff(loo, bruteForce({ ...pr, w: wz }, 2, [0])) < 1e-9);
});

test('a group that carries all the weight cannot be left out', () => {
  const pr = randomProblem([10, 10], 3, 29, 0);
  const w = Float64Array.from(pr.w);
  for (let i = 0; i < pr.n; i++) if (pr.groups[i] !== pr.groups[0]) w[i] = 0;
  assert.throws(() => groupedLooResiduals(pr.Z, pr.Y, w, pr.n, pr.q, 1, pr.groups, [0]), SingularMatrixError);
  assert.throws(() => groupedLooResiduals(pr.Z, pr.Y, pr.w, pr.n, pr.q, 1, pr.groups.subarray(1), [0]), RangeError);
  assert.throws(() => groupedLooResiduals(pr.Z, pr.Y, pr.w, pr.n, pr.q, -1, pr.groups, [0]), RangeError);
});

test('no precision is lost when one group carries almost all the weight', () => {
  const pr = randomProblem([40, 3, 3], 4, 31, 0);
  const counts = new Map<number, number>();
  for (const g of pr.groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  const big = [...counts].find(([, c]) => c === 40)?.[0];
  const w = Float64Array.from(pr.w);
  for (let i = 0; i < pr.n; i++) if (pr.groups[i] === big) w[i] = (w[i] as number) * 1e8;
  let sumW = 0;
  for (const v of w) sumW += v;
  for (const lambda of [1e-3, 1e-4 * sumW]) {
    const loo = groupedLooResiduals(pr.Z, pr.Y, w, pr.n, pr.q, lambda, pr.groups, [0]);
    assert.ok(maxAbsDiff(loo, bruteForce({ ...pr, w }, lambda, [0])) < 1e-9);
  }
});

test('CV score: per-group medians of the angular error, mean and SE over fixation groups', () => {
  // Errors along x only, at y = 0, are |Δθx| exactly.
  const n = 9;
  const groups = Int32Array.from([0, 0, 0, 1, 1, 1, 2, 2, 2]);
  const errs = [1, 2, 9, 4, 4, 5, 0.5, 0.5, 30];
  const Y = new Float64Array(n * 2);
  const oof = Float64Array.from({ length: n * 2 }, (_, k) => (k % 2 === 0 ? (errs[k / 2] as number) : 0));
  const names = ['loc-0', 'loc-1', 'loc-2'];
  const all = cvScore(oof, Y, n, groups, ang, { groupName: (g) => names[g] as string, coverage: 0.9 });
  const m = [2, 4, 0.5];
  assert.ok(Math.abs(all.meanDeg - (2 + 4 + 0.5) / 3) < 1e-12);
  const sd = Math.sqrt(m.reduce((s, v) => s + (v - all.meanDeg) ** 2, 0) / 2);
  assert.ok(Math.abs(all.seDeg - sd / Math.sqrt(3)) < 1e-12);
  assert.equal(all.nGroups, 3);
  assert.equal(all.nRows, 9);
  assert.equal(all.coverage, 0.9);
  for (const [k, v] of Object.entries({ 'loc-0': 2, 'loc-1': 4, 'loc-2': 0.5 })) {
    assert.ok(Math.abs((all.perGroupMedianDeg[k] as number) - v) < 1e-12);
  }

  // Only groups that contain fixation rows count; only scored rows enter the medians.
  const fixation = Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1, 0]);
  const score = Uint8Array.from([1, 1, 0, 1, 1, 1, 1, 1, 1]);
  const some = cvScore(oof, Y, n, groups, ang, { fixation, score });
  assert.deepEqual(Object.keys(some.perGroupMedianDeg), ['0', '2']);
  assert.ok(Math.abs((some.perGroupMedianDeg['0'] as number) - 1.5) < 1e-12);
  assert.equal(some.nRows, 5);
  assert.equal(some.coverage, 1);

  const one = cvScore(oof, Y, n, Int32Array.from({ length: n }, () => 4), ang);
  assert.equal(one.nGroups, 1);
  assert.ok(Number.isNaN(one.seDeg));
  const none = cvScore(oof, Y, n, groups, ang, { fixation: new Uint8Array(n) });
  assert.ok(Number.isNaN(none.meanDeg));
  assert.equal(none.nGroups, 0);

  // Group names that are also Object.prototype keys are ordinary names.
  const proto = cvScore(oof, Y, n, groups, ang, { groupName: (g) => ['constructor', '__proto__', 'toString'][g] as string });
  assert.equal(proto.nGroups, 3);
  assert.deepEqual(Object.keys(proto.perGroupMedianDeg), ['constructor', '__proto__', 'toString']);
  const parsed = JSON.parse(JSON.stringify(proto.perGroupMedianDeg)) as Record<string, number>;
  assert.ok(Math.abs((parsed['__proto__'] as number) - 4) < 1e-12);

  const bad = Float64Array.from(oof);
  bad[4] = Number.NaN;
  assert.throws(() => cvScore(bad, Y, n, groups, ang), RangeError);
  assert.deepEqual(oofFromResiduals(Float64Array.from([3, 4]), Float64Array.from([1, -1])), Float64Array.from([2, 5]));
});
