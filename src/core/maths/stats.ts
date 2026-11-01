// Descriptive and robust statistics. Every function returns NaN for an empty input or for an
// input that contains NaN, so a missing value can never pass as a number.

/** Scale factor that turns a MAD into a consistent estimate of a normal standard deviation. */
export const MAD_TO_SD = 1.4826;

function hasNaN(values: ArrayLike<number>): boolean {
  for (let i = 0; i < values.length; i++) if (Number.isNaN(values[i])) return true;
  return false;
}

function sortedCopy(values: ArrayLike<number>): Float64Array {
  const out = values instanceof Float64Array ? values.slice() : Float64Array.from(values);
  out.sort();
  return out;
}

export function mean(values: ArrayLike<number>): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i] as number;
  return sum / values.length;
}

/** Sample standard deviation (denominator n − 1); NaN for fewer than two values. */
export function sampleSd(values: ArrayLike<number>): number {
  const n = values.length;
  if (n < 2) return NaN;
  const m = mean(values);
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = (values[i] as number) - m;
    ss += d * d;
  }
  return Math.sqrt(ss / (n - 1));
}

export function median(values: ArrayLike<number>): number {
  return percentile(values, 50);
}

/** Median absolute deviation about `centre` (the median by default), unscaled. */
export function mad(values: ArrayLike<number>, centre?: number): number {
  if (values.length === 0 || hasNaN(values)) return NaN;
  const c = centre ?? median(values);
  const dev = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) dev[i] = Math.abs((values[i] as number) - c);
  return median(dev);
}

function interpolateSorted(sorted: Float64Array, p: number): number {
  if (!(p >= 0 && p <= 100)) throw new RangeError(`percentile: p must lie in [0, 100], got ${p}`);
  const pos = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, sorted.length - 1);
  const frac = pos - lo;
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return frac === 0 ? a : a + frac * (b - a);
}

/**
 * Percentile with linear interpolation between order statistics (Hyndman and Fan type 7, the
 * NumPy default). `p` is in percent.
 */
export function percentile(values: ArrayLike<number>, p: number): number {
  if (values.length === 0 || hasNaN(values)) {
    if (!(p >= 0 && p <= 100)) throw new RangeError(`percentile: p must lie in [0, 100], got ${p}`);
    return NaN;
  }
  return interpolateSorted(sortedCopy(values), p);
}

/** Several percentiles of the same values, sorting once. */
export function percentiles(values: ArrayLike<number>, ps: readonly number[]): number[] {
  if (values.length === 0 || hasNaN(values)) {
    return ps.map((p) => {
      if (!(p >= 0 && p <= 100)) throw new RangeError(`percentile: p must lie in [0, 100], got ${p}`);
      return NaN;
    });
  }
  const sorted = sortedCopy(values);
  return ps.map((p) => interpolateSorted(sorted, p));
}

/**
 * Weighted median: the smallest value at which the cumulative weight reaches half the total.
 * When the cumulative weight equals exactly half, the two neighbouring values are averaged, so
 * equal weights give the ordinary median. Zero weights are ignored; negative or non-finite
 * weights throw. NaN when the total weight is zero.
 */
export function weightedMedian(values: ArrayLike<number>, weights: ArrayLike<number>): number {
  if (values.length !== weights.length) {
    throw new RangeError(`weightedMedian: ${values.length} values but ${weights.length} weights`);
  }
  const idx: number[] = [];
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    const w = weights[i] as number;
    if (!(Number.isFinite(w) && w >= 0)) throw new RangeError(`weightedMedian: invalid weight ${w} at ${i}`);
    if (w === 0) continue;
    if (Number.isNaN(values[i])) return NaN;
    idx.push(i);
    total += w;
  }
  if (idx.length === 0) return NaN;
  idx.sort((a, b) => (values[a] as number) - (values[b] as number) || a - b);
  const half = total / 2;
  const tol = 1e-12 * total;
  let cum = 0;
  for (let k = 0; k < idx.length; k++) {
    cum += weights[idx[k] as number] as number;
    if (cum >= half - tol) {
      const v = values[idx[k] as number] as number;
      if (Math.abs(cum - half) <= tol && k + 1 < idx.length) {
        return (v + (values[idx[k + 1] as number] as number)) / 2;
      }
      return v;
    }
  }
  return values[idx[idx.length - 1] as number] as number;
}
