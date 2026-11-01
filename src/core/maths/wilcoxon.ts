// Wilcoxon signed-rank test for paired differences (specification §4.12: per-target accuracy
// differences between two estimators, within one session).

/** Above this many non-zero differences the normal approximation replaces the exact null. */
const EXACT_MAX_N = 200;

export interface WilcoxonResult {
  /** T = min(W+, W−), the smaller signed-rank sum (average ranks for ties). */
  statistic: number;
  /** Two-sided p-value. */
  pValue: number;
  /** Number of non-zero differences used. */
  n: number;
}

/**
 * Two-sided Wilcoxon signed-rank test. Zero differences are dropped (Wilcoxon's method) and tied
 * magnitudes get average ranks. Up to 200 non-zero differences the p-value is exact: the null
 * distribution of W+ is enumerated over the observed (possibly tied) ranks, which also makes it
 * the exact conditional test when ties are present. Beyond that a normal approximation with tie
 * and continuity corrections is used. With no non-zero differences no test is possible and the
 * statistic and p-value are NaN. Non-finite differences throw.
 */
export function wilcoxonSignedRank(differences: readonly number[]): WilcoxonResult {
  const nonZero: number[] = [];
  for (let i = 0; i < differences.length; i++) {
    const d = differences[i] as number;
    if (!Number.isFinite(d)) throw new RangeError(`wilcoxonSignedRank: non-finite difference at ${i}`);
    if (d !== 0) nonZero.push(d);
  }
  const n = nonZero.length;
  if (n === 0) return { statistic: NaN, pValue: NaN, n: 0 };

  const order = nonZero.map((_, i) => i).sort((a, b) => Math.abs(nonZero[a] as number) - Math.abs(nonZero[b] as number));
  // Doubled average ranks are integers, which keeps the exact enumeration on integer sums.
  const rank2 = new Int32Array(n);
  let tieTerm = 0;
  for (let i = 0; i < n; ) {
    let j = i;
    const mag = Math.abs(nonZero[order[i] as number] as number);
    while (j + 1 < n && Math.abs(nonZero[order[j + 1] as number] as number) === mag) j++;
    const r2 = i + j + 2;
    for (let k = i; k <= j; k++) rank2[order[k] as number] = r2;
    const t = j - i + 1;
    tieTerm += t * t * t - t;
    i = j + 1;
  }

  let wPlus2 = 0;
  let total2 = 0;
  for (let i = 0; i < n; i++) {
    total2 += rank2[i] as number;
    if ((nonZero[i] as number) > 0) wPlus2 += rank2[i] as number;
  }
  const t2 = Math.min(wPlus2, total2 - wPlus2);
  const statistic = t2 / 2;

  if (n <= EXACT_MAX_N) {
    // P(W+ = s) under the null: each rank's sign is ±1 with probability ½, independently.
    let prob = new Float64Array(total2 + 1);
    let next = new Float64Array(total2 + 1);
    prob[0] = 1;
    let reach = 0;
    for (let i = 0; i < n; i++) {
      const r = rank2[i] as number;
      next.fill(0, 0, reach + r + 1);
      for (let s = 0; s <= reach; s++) {
        const p = (prob[s] as number) * 0.5;
        if (p === 0) continue;
        next[s] = (next[s] as number) + p;
        next[s + r] = (next[s + r] as number) + p;
      }
      reach += r;
      const tmp = prob;
      prob = next;
      next = tmp;
    }
    let lower = 0;
    for (let s = 0; s <= t2; s++) lower += prob[s] as number;
    return { statistic, pValue: Math.min(1, 2 * lower), n };
  }

  const meanW = (n * (n + 1)) / 4;
  const varW = (n * (n + 1) * (2 * n + 1)) / 24 - tieTerm / 48;
  const z = Math.max(0, Math.abs(statistic - meanW) - 0.5) / Math.sqrt(varW);
  return { statistic, pValue: Math.min(1, erfc(z / Math.SQRT2)), n };
}

/**
 * Complementary error function, x ≥ 0, by the Chebyshev fit of Press et al. (Numerical Recipes,
 * §6.2), fractional error below 1.2e-7 everywhere.
 */
function erfc(x: number): number {
  const t = 1 / (1 + 0.5 * x);
  return (
    t *
    Math.exp(
      -x * x -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    )
  );
}
