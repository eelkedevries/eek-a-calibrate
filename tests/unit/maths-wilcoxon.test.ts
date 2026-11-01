// WP2: Wilcoxon signed-rank test against tabulated critical values and exact p-values.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../../src/core/maths/rng.ts';
import { wilcoxonSignedRank } from '../../src/core/maths/wilcoxon.ts';

// Published critical values of T = min(W+, W−) for the two-sided test: the largest T with
// P ≤ α (standard tables, e.g. Wilcoxon, Katti and Wilcox 1970; reproduced in most textbooks).
const CRITICAL_05: Record<number, number> = {
  6: 0, 7: 2, 8: 3, 9: 5, 10: 8, 11: 10, 12: 13, 13: 17, 14: 21, 15: 25, 16: 29, 17: 34, 18: 40, 19: 46, 20: 52,
  21: 58, 22: 65, 23: 73, 24: 81, 25: 89,
};
const CRITICAL_01: Record<number, number> = {
  8: 0, 9: 1, 10: 3, 11: 5, 12: 7, 13: 9, 14: 12, 15: 15, 16: 19, 17: 23, 18: 27, 19: 32, 20: 37, 21: 42, 22: 48,
  23: 54, 24: 61, 25: 68,
};

/** Differences of magnitudes 1…n (no ties) whose negative ranks sum to exactly T. */
function sampleWithT(n: number, T: number): number[] {
  const d = Array.from({ length: n }, (_, i) => i + 1);
  let rest = T;
  for (let r = n; r >= 1 && rest > 0; r--) {
    if (r <= rest) {
      d[r - 1] = -r;
      rest -= r;
    }
  }
  assert.equal(rest, 0);
  return d;
}

test('reproduces the tabulated two-sided critical values', () => {
  for (const [table, alpha] of [
    [CRITICAL_05, 0.05],
    [CRITICAL_01, 0.01],
  ] as const) {
    for (const [nStr, crit] of Object.entries(table)) {
      const n = Number(nStr);
      const at = wilcoxonSignedRank(sampleWithT(n, crit));
      assert.equal(at.statistic, crit);
      assert.equal(at.n, n);
      assert.ok(at.pValue <= alpha, `n=${n}, T=${crit}: p=${at.pValue} > ${alpha}`);
      const above = wilcoxonSignedRank(sampleWithT(n, crit + 1));
      assert.ok(above.pValue > alpha, `n=${n}, T=${crit + 1}: p=${above.pValue} ≤ ${alpha}`);
    }
  }
});

test('exact p-values', () => {
  // Darwin's Zea mays differences (Fisher 1935), the SciPy documentation example: T = 24,
  // p = 0.041259765625 = 169/4096.
  const darwin = [6, 8, 14, 16, 23, 24, 28, 29, 41, -48, 49, 56, 60, -67, 75];
  const r = wilcoxonSignedRank(darwin);
  assert.equal(r.statistic, 24);
  assert.equal(r.n, 15);
  assert.ok(Math.abs(r.pValue - 169 / 4096) < 1e-14);

  // n = 5, all positive: the smallest possible two-sided p is 2/32.
  assert.ok(Math.abs(wilcoxonSignedRank([1, 2, 3, 4, 5]).pValue - 2 / 32) < 1e-15);
  // n = 10, T = 8: 2·25/1024.
  assert.ok(Math.abs(wilcoxonSignedRank(sampleWithT(10, 8)).pValue - 50 / 1024) < 1e-15);
  // T at the centre of the distribution gives p = 1.
  assert.equal(wilcoxonSignedRank([1, -2, -3, 4]).pValue, 1);
});

test('zeros are dropped and ties get average ranks (exact conditional p)', () => {
  // Brute-force enumeration over all 2^10 sign patterns of the average ranks: T = 8.5, p = 27/512.
  const r = wilcoxonSignedRank([1.5, -1.5, 2, 3, 3, 3, -4, 5, 6, 0, 7]);
  assert.equal(r.n, 10);
  assert.equal(r.statistic, 8.5);
  assert.ok(Math.abs(r.pValue - 27 / 512) < 1e-15);
  assert.deepEqual(wilcoxonSignedRank([0, 0, 1, 0, 2]), wilcoxonSignedRank([1, 2]));
});

test('symmetric in the sign of the differences', () => {
  const rand = mulberry32(8);
  const d = Array.from({ length: 23 }, () => rand() * 4 - 1.5);
  const a = wilcoxonSignedRank(d);
  const b = wilcoxonSignedRank(d.map((v) => -v));
  assert.equal(a.statistic, b.statistic);
  assert.equal(a.pValue, b.pValue);
});

test('no testable differences, and non-finite input', () => {
  const none = wilcoxonSignedRank([0, 0]);
  assert.equal(none.n, 0);
  assert.ok(Number.isNaN(none.statistic) && Number.isNaN(none.pValue));
  assert.equal(wilcoxonSignedRank([]).n, 0);
  assert.throws(() => wilcoxonSignedRank([1, Number.NaN]), RangeError);
  assert.throws(() => wilcoxonSignedRank([1, Infinity]), RangeError);
});

test('the normal approximation for large n continues the exact distribution', () => {
  const rand = mulberry32(31);
  const base = Array.from({ length: 200 }, () => rand() * 2 - 0.9);
  const exact = wilcoxonSignedRank(base);
  const approx = wilcoxonSignedRank([...base, 1e-9]);
  assert.equal(exact.n, 200);
  assert.equal(approx.n, 201);
  assert.ok(Math.abs(exact.pValue - approx.pValue) < 0.01, `${exact.pValue} vs ${approx.pValue}`);
  const shifted = wilcoxonSignedRank(Array.from({ length: 400 }, () => rand() + 0.2));
  assert.ok(shifted.pValue < 1e-20 && shifted.pValue >= 0);
});
