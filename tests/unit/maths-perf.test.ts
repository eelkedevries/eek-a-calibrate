// WP2 acceptance: a fit of 1,500 × 72 with 13 groups and 10 λ values in under 300 ms.
import assert from 'node:assert/strict';
import test from 'node:test';
import { LAMBDA_REL } from '../../src/core/constants.ts';
import type { Vec2 } from '../../src/core/types.ts';
import { predictRow, ridgeFitFromGram, withIntercept } from '../../src/core/maths/ridge.ts';
import { fisherYates, gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import { robustRidgeFit, selectLambda, type RidgeProblem } from '../../src/core/maths/robust.ts';
import { normaliseWeights } from '../../src/core/maths/standardise.ts';

const DEG = Math.PI / 180;
function ang(a: Vec2, b: Vec2): number {
  const ax = Math.tan(a[0] * DEG);
  const ay = Math.tan(a[1] * DEG);
  const bx = Math.tan(b[0] * DEG);
  const by = Math.tan(b[1] * DEG);
  return Math.atan2(Math.sqrt((ay - by) ** 2 + (bx - ax) ** 2 + (ax * by - ay * bx) ** 2), ax * bx + ay * by + 1) / DEG;
}

interface Problem {
  Z: Float64Array;
  Y: Float64Array;
  w: Float64Array;
  groups: Int32Array;
  n: number;
  q: number;
}

function problem(n: number, p: number, seed: number): Problem {
  const rand = mulberry32(seed);
  const normal = gaussian(rand);
  const X = Float64Array.from({ length: n * p }, () => normal());
  const Z = withIntercept(X, n, p);
  const q = p + 1;
  const beta = Float64Array.from({ length: q * 2 }, () => 0.5 * normal());
  const Y = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const [x, y] = predictRow(beta, Z.subarray(i * q, (i + 1) * q), q);
    Y[i * 2] = x + normal();
    Y[i * 2 + 1] = y + normal();
  }
  // Unequal groups, as calibration locations are after gating.
  const labels: number[] = [];
  for (let g = 0; g < 13; g++) for (let k = 0; k < Math.round((n / 1500) * (80 + 7 * g)); k++) labels.push(g);
  while (labels.length < n) labels.push(labels.length % 13);
  fisherYates(labels, rand);
  const groups = Int32Array.from(labels.slice(0, n));
  const w = normaliseWeights(Array.from({ length: n }, () => 0.2 + rand()));
  return { Z, Y, w, groups, n, q };
}

/** Times `f` three times; the first run is cold. `npm test` runs the test files in parallel, so
 * the fastest run is the one that measures the code rather than contention for the processor. */
function bestOfThree(f: () => void): number[] {
  const runs: number[] = [];
  for (let k = 0; k < 3; k++) {
    const t = performance.now();
    f();
    runs.push(performance.now() - t);
  }
  return runs;
}

test('1,500 × 72, 13 groups, 10 λ: a fit takes under 300 ms', () => {
  const pr = problem(1500, 72, 2026);
  const ridge: RidgeProblem = { Z: pr.Z, Y: pr.Y, w: pr.w, n: pr.n, p: pr.q, groups: pr.groups, unpenalised: [0], lambdaRel: LAMBDA_REL, ang };

  // Exact grouped LOO and the CV score at each of the 10 λ, then the fit at the chosen λ.
  const single = bestOfThree(() => {
    const sel = selectLambda(ridge, pr.w);
    const fit = ridgeFitFromGram(sel.gram, sel.cross, pr.q, sel.lambda, [0]);
    assert.equal(sel.candidates.length, 10);
    assert.equal(fit.B.length, pr.q * 2);
  });

  // The whole §4.8.3 procedure: selection on the base weights, two Huber passes, hard
  // rejection, re-selection on the robust weights (10 λ again), the final fit, A and leverage.
  const robust = bestOfThree(() => {
    const result = robustRidgeFit(ridge);
    assert.equal(result.robustSelection.candidates.length, 10);
    assert.ok(Number.isFinite(result.cv.meanDeg));
  });

  const fmt = (r: number[]) => r.map((v) => v.toFixed(1)).join(', ');
  console.log(`# 1500 × 73, 13 groups, 10 λ (first run cold): selection and fit ${fmt(single)} ms; robust procedure ${fmt(robust)} ms`);
  assert.ok(Math.min(...single) < 300, `selection and fit: ${fmt(single)} ms`);
  assert.ok(Math.min(...robust) < 300, `robust procedure: ${fmt(robust)} ms`);
});
