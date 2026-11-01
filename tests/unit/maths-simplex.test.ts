// WP2: simplex stacking: KKT conditions, weight recovery, nested CV and renormalisation.
import assert from 'node:assert/strict';
import test from 'node:test';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import {
  combineAvailable,
  renormaliseOverAvailable,
  simplexLeastSquares,
  stackFit,
  stackNestedOof,
} from '../../src/core/maths/simplex.ts';

function members(n: number, K: number, seed: number): Float64Array[] {
  const normal = gaussian(mulberry32(seed));
  return Array.from({ length: K }, () => Float64Array.from({ length: n * 2 }, () => 10 * normal()));
}

function axis(ms: readonly Float64Array[], n: number, a: number): Float64Array {
  const K = ms.length;
  const X = new Float64Array(n * K);
  for (let i = 0; i < n; i++) for (let e = 0; e < K; e++) X[i * K + e] = (ms[e] as Float64Array)[i * 2 + a] as number;
  return X;
}

test('recovers known weights exactly', () => {
  const n = 100;
  const ms = members(n, 4, 1);
  const bx = [0.2, 0.5, 0.3, 0];
  const by = [0, 0.1, 0, 0.9];
  const Y = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    for (let e = 0; e < 4; e++) {
      Y[i * 2] = (Y[i * 2] as number) + (bx[e] as number) * ((ms[e] as Float64Array)[i * 2] as number);
      Y[i * 2 + 1] = (Y[i * 2 + 1] as number) + (by[e] as number) * ((ms[e] as Float64Array)[i * 2 + 1] as number);
    }
  }
  const w = Float64Array.from({ length: n }, (_, i) => 0.5 + (i % 3));
  const { wx, wy } = stackFit(ms, Y, w, n);
  for (let e = 0; e < 4; e++) {
    assert.ok(Math.abs((wx[e] as number) - (bx[e] as number)) < 1e-9, `wx ${[...wx]}`);
    assert.ok(Math.abs((wy[e] as number) - (by[e] as number)) < 1e-9, `wy ${[...wy]}`);
  }
  const fx = simplexLeastSquares(axis(ms, n, 0), Float64Array.from({ length: n }, (_, i) => Y[i * 2] as number), w, n, 4);
  assert.deepEqual(fx.support, [0, 1, 2]);
  assert.ok(fx.objective < 1e-12);
});

test('satisfies the KKT conditions and beats a grid over the simplex', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const rand = mulberry32(seed);
    const normal = gaussian(rand);
    const n = 40;
    const K = 1 + (seed % 4);
    const X = Float64Array.from({ length: n * K }, () => normal());
    const y = Float64Array.from({ length: n }, (_, i) => (X[i * K] as number) * 0.7 + normal() + (seed % 3) - 1);
    const w = Float64Array.from({ length: n }, () => rand());
    const { beta, objective } = simplexLeastSquares(X, y, w, n, K);

    assert.ok(beta.every((v) => v >= 0));
    assert.ok(Math.abs(beta.reduce((s, v) => s + v, 0) - 1) < 1e-12);
    // ∇f = 2(Gβ − c): equal on the support, no smaller off it.
    const grad = new Float64Array(K);
    let f = 0;
    for (let i = 0; i < n; i++) {
      let pred = 0;
      for (let e = 0; e < K; e++) pred += (beta[e] as number) * (X[i * K + e] as number);
      const r = (y[i] as number) - pred;
      f += (w[i] as number) * r * r;
      for (let e = 0; e < K; e++) grad[e] = (grad[e] as number) - 2 * (w[i] as number) * r * (X[i * K + e] as number);
    }
    assert.ok(Math.abs(f - objective) < 1e-9 * Math.max(1, f));
    const active = [...beta.keys()].filter((e) => (beta[e] as number) > 0);
    const g0 = grad[active[0] as number] as number;
    const tol = 1e-8 * Math.max(1, ...Array.from(grad, Math.abs));
    for (const e of active) assert.ok(Math.abs((grad[e] as number) - g0) < tol, `seed ${seed}: active gradients differ`);
    for (let e = 0; e < K; e++) if ((beta[e] as number) === 0) assert.ok((grad[e] as number) >= g0 - tol, `seed ${seed}: KKT violated`);

    if (K <= 3) {
      const steps = 40;
      for (let a = 0; a <= steps; a++) {
        for (let b = 0; a + b <= steps; b++) {
          const cand = [a / steps, b / steps, (steps - a - b) / steps].slice(0, K);
          if (K === 1 && a !== steps) continue;
          if (K === 2 && a + b !== steps) continue;
          let fc = 0;
          for (let i = 0; i < n; i++) {
            let pred = 0;
            for (let e = 0; e < K; e++) pred += (cand[e] as number) * (X[i * K + e] as number);
            fc += (w[i] as number) * ((y[i] as number) - pred) ** 2;
          }
          assert.ok(objective <= fc + 1e-9, `seed ${seed}: grid point better`);
        }
      }
    }
  }
});

test('single members, duplicate members and invalid input', () => {
  const n = 10;
  const X = Float64Array.from({ length: n }, (_, i) => i);
  const y = Float64Array.from({ length: n }, (_, i) => 2 * i);
  assert.deepEqual([...simplexLeastSquares(X, y, new Float64Array(n).fill(1), n, 1).beta], [1]);

  const dupX = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    dupX[i * 2] = i;
    dupX[i * 2 + 1] = i;
  }
  const dup = simplexLeastSquares(dupX, y, new Float64Array(n).fill(1), n, 2);
  assert.ok(Math.abs((dup.beta[0] as number) + (dup.beta[1] as number) - 1) < 1e-12);
  assert.deepEqual(dup.support, [0], 'ties go to the simpler combination');

  assert.throws(() => simplexLeastSquares(new Float64Array(n * 5), y, new Float64Array(n).fill(1), n, 5), RangeError);
  assert.throws(() => simplexLeastSquares(X, y, new Float64Array(n), n, 1), RangeError);
  const bad = Float64Array.from(X);
  bad[2] = Number.NaN;
  assert.throws(() => simplexLeastSquares(bad, y, new Float64Array(n).fill(1), n, 1), RangeError);
});

test('nested CV fits β without each group and predicts it', () => {
  const n = 60;
  const ms = members(n, 3, 4);
  const normal = gaussian(mulberry32(5));
  const Y = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    Y[i * 2] = 0.6 * ((ms[0] as Float64Array)[i * 2] as number) + 0.4 * ((ms[2] as Float64Array)[i * 2] as number) + normal();
    Y[i * 2 + 1] = ((ms[1] as Float64Array)[i * 2 + 1] as number) + normal();
  }
  const w = new Float64Array(n).fill(1);
  const groups = Int32Array.from({ length: n }, (_, i) => i % 5);
  const oof = stackNestedOof(ms, Y, w, n, groups);
  for (const g of [0, 3]) {
    const train = [...groups.keys()].filter((i) => groups[i] !== g);
    const { wx, wy } = stackFit(ms, Y, w, n, train);
    for (let i = 0; i < n; i++) {
      if (groups[i] !== g) continue;
      let x = 0;
      let y = 0;
      for (let e = 0; e < 3; e++) {
        x += (wx[e] as number) * ((ms[e] as Float64Array)[i * 2] as number);
        y += (wy[e] as number) * ((ms[e] as Float64Array)[i * 2 + 1] as number);
      }
      assert.ok(Math.abs((oof[i * 2] as number) - x) < 1e-12);
      assert.ok(Math.abs((oof[i * 2 + 1] as number) - y) < 1e-12);
    }
  }
  // With an exact combination every fold recovers it, so the OOF predictions equal Y.
  const exact = new Float64Array(n * 2);
  for (let i = 0; i < n * 2; i++) exact[i] = 0.25 * ((ms[0] as Float64Array)[i] as number) + 0.75 * ((ms[1] as Float64Array)[i] as number);
  const oofExact = stackNestedOof(ms, exact, w, n, groups);
  for (let i = 0; i < n * 2; i++) assert.ok(Math.abs((oofExact[i] as number) - (exact[i] as number)) < 1e-9);
  const lone = new Float64Array(n);
  for (let i = 0; i < n; i++) if (groups[i] === 0) lone[i] = 1;
  assert.throws(() => stackNestedOof(ms, Y, lone, n, groups), RangeError);
});

test('renormalisation over the available members', () => {
  const beta = [0.5, 0.3, 0.2, 0];
  const r = renormaliseOverAvailable(beta, [false, true, true, true]);
  assert.ok(r);
  assert.ok(Math.abs((r[1] as number) - 0.6) < 1e-15 && Math.abs((r[2] as number) - 0.4) < 1e-15);
  assert.equal(r[0], 0);
  assert.equal(r[3], 0);
  assert.equal(renormaliseOverAvailable(beta, [false, false, false, false]), null);
  assert.equal(renormaliseOverAvailable(beta, [false, false, false, true]), null, 'only a zero-weight member is left');
  assert.throws(() => renormaliseOverAvailable(beta, [true]), RangeError);

  const c = combineAvailable([0.5, 0.5, 0], [0, 0.5, 0.5], [[2, 4], null, [10, 20]]);
  assert.deepEqual(c, [2, 20]);
  assert.equal(combineAvailable([1, 0], [1, 0], [null, [1, 1]]), null);
});
