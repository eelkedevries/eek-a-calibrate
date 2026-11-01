// Weighted standardisation with physical floors, the PCA block and prediction-time clipping
// (specification §4.8.2). Mapper-agnostic: the caller supplies the floors, the primary columns
// and the optional PCA block of its mapper.
import { CLIP_RANGE_FRACTION, PCA } from '../constants.ts';
import { assertFinite, assertLength } from './linalg.ts';
import { fitPca, pcaScores, type PcaProjection } from './pca.ts';

/**
 * Rescales non-negative weights so that Σw = n (the number of rows). Throws if any weight is
 * negative or non-finite, or if they are all zero.
 */
export function normaliseWeights(w: ArrayLike<number>): Float64Array {
  let sum = 0;
  for (let i = 0; i < w.length; i++) {
    const v = w[i] as number;
    if (!(Number.isFinite(v) && v >= 0)) throw new RangeError(`normaliseWeights: invalid weight ${v} at ${i}`);
    sum += v;
  }
  if (!(sum > 0)) throw new RangeError('normaliseWeights: total weight is zero');
  const f = w.length / sum;
  const out = new Float64Array(w.length);
  for (let i = 0; i < w.length; i++) out[i] = (w[i] as number) * f;
  return out;
}

/**
 * Weighted column means μ_j = Σ w_i x_ij / Σ w_i, standard deviations
 * σ_j = √(Σ w_i (x_ij − μ_j)² / Σ w_i) and scales s_j = max(σ_j, floor_j) of an n × p matrix.
 */
export function weightedColumnStats(
  X: Float64Array,
  w: Float64Array,
  n: number,
  p: number,
  floors: ArrayLike<number>,
): { mu: Float64Array; sigma: Float64Array; scale: Float64Array } {
  assertLength('weightedColumnStats (X)', X, n * p);
  assertLength('weightedColumnStats (w)', w, n);
  assertLength('weightedColumnStats (floors)', floors, p);
  let sumW = 0;
  for (let i = 0; i < n; i++) sumW += w[i] as number;
  if (!(sumW > 0)) throw new RangeError('weightedColumnStats: total weight is zero');
  const mu = new Float64Array(p);
  const sigma = new Float64Array(p);
  const scale = new Float64Array(p);
  for (let i = 0; i < n; i++) {
    const wi = w[i] as number;
    if (wi === 0) continue;
    for (let j = 0; j < p; j++) mu[j] = (mu[j] as number) + wi * (X[i * p + j] as number);
  }
  for (let j = 0; j < p; j++) mu[j] = (mu[j] as number) / sumW;
  for (let i = 0; i < n; i++) {
    const wi = w[i] as number;
    if (wi === 0) continue;
    for (let j = 0; j < p; j++) {
      const dv = (X[i * p + j] as number) - (mu[j] as number);
      sigma[j] = (sigma[j] as number) + wi * dv * dv;
    }
  }
  for (let j = 0; j < p; j++) {
    sigma[j] = Math.sqrt((sigma[j] as number) / sumW);
    scale[j] = Math.max(sigma[j] as number, floors[j] as number);
  }
  return { mu, sigma, scale };
}

export interface FeatureTransformSpec {
  /** Per raw column; entries inside the PCA block are ignored. */
  floors: ArrayLike<number>;
  /** False for mappers that regress on raw values (μ = 0, s = 1). */
  standardise: boolean;
  /** Raw columns [start, end) are replaced by k PCA scores. */
  pca?: { start: number; end: number; k: number };
  /** Raw column indices that set the extrapolation flag when clipped. */
  primary: readonly number[];
}

export interface FeatureTransform {
  pIn: number;
  /** pIn − (end − start) + k with a PCA block, else pIn. Excludes the intercept. */
  pOut: number;
  /** Length pIn. Inside the PCA block μ = 0 and s = 1: that block is centred by `pca.mean`. */
  mu: Float64Array;
  scale: Float64Array;
  pca: PcaProjection | null;
  pcaStart: number;
  pcaEnd: number;
  /** Range of each output column over the rows the transform was fitted on (length pOut). */
  zMin: Float64Array;
  zMax: Float64Array;
  /** Output columns whose clipping sets the extrapolation flag. */
  primaryOut: Int32Array;
}

/**
 * Fits the §4.8.2 transform on the n × pIn raw rows `X` with normalised weights `w`: weighted
 * standardisation with floors for the ordinary columns and, for the PCA block, weighted centring,
 * projection on the top-k components (seeded) and division by √λ₁, with no per-column
 * standardisation. The clipping range comes from the rows with positive weight. A primary column
 * inside the PCA block makes every score column primary.
 */
export function fitFeatureTransform(
  X: Float64Array,
  w: Float64Array,
  n: number,
  pIn: number,
  spec: FeatureTransformSpec,
  seed: number,
): FeatureTransform {
  assertLength('fitFeatureTransform (X)', X, n * pIn);
  assertLength('fitFeatureTransform (w)', w, n);
  assertFinite('fitFeatureTransform (X)', X);
  for (let i = 0; i < n; i++) {
    const v = w[i] as number;
    if (!(Number.isFinite(v) && v >= 0)) throw new RangeError(`fitFeatureTransform: invalid weight ${v} at ${i}`);
  }
  const block = spec.pca;
  const start = block ? block.start : pIn;
  const end = block ? block.end : pIn;
  if (block && !(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end && end <= pIn)) {
    throw new RangeError(`fitFeatureTransform: invalid PCA block [${start}, ${end}) for ${pIn} columns`);
  }
  const inBlock = (j: number): boolean => j >= start && j < end;
  if (spec.standardise) {
    assertLength('fitFeatureTransform (floors)', spec.floors, pIn);
    for (let j = 0; j < pIn; j++) {
      const f = spec.floors[j] as number;
      if (!inBlock(j) && !(Number.isFinite(f) && f > 0)) {
        throw new RangeError(`fitFeatureTransform: floor of column ${j} must be positive, got ${f}`);
      }
    }
  }

  const mu = new Float64Array(pIn);
  const scale = new Float64Array(pIn).fill(1);
  if (spec.standardise) {
    const floors = new Float64Array(pIn).fill(1);
    for (let j = 0; j < pIn; j++) if (!inBlock(j)) floors[j] = spec.floors[j] as number;
    const stats = weightedColumnStats(X, w, n, pIn, floors);
    for (let j = 0; j < pIn; j++) {
      if (inBlock(j)) continue;
      mu[j] = stats.mu[j] as number;
      scale[j] = stats.scale[j] as number;
    }
  }

  let pca: PcaProjection | null = null;
  if (block) {
    const d = end - start;
    const E = new Float64Array(n * d);
    for (let i = 0; i < n; i++) for (let c = 0; c < d; c++) E[i * d + c] = X[i * pIn + start + c] as number;
    pca = fitPca(E, w, n, d, { k: block.k, oversample: PCA.oversample, powerIters: PCA.powerIters, seed });
  }

  const k = block ? block.k : 0;
  const pOut = pIn - (end - start) + k;
  const primary: number[] = [];
  for (const j of spec.primary) {
    if (!(Number.isInteger(j) && j >= 0 && j < pIn)) throw new RangeError(`fitFeatureTransform: invalid primary column ${j}`);
    if (inBlock(j)) {
      for (let s = 0; s < k; s++) primary.push(start + s);
    } else {
      primary.push(j < start ? j : j - (end - start) + k);
    }
  }

  const t: FeatureTransform = {
    pIn,
    pOut,
    mu,
    scale,
    pca,
    pcaStart: start,
    pcaEnd: end,
    zMin: new Float64Array(pOut).fill(Infinity),
    zMax: new Float64Array(pOut).fill(-Infinity),
    primaryOut: Int32Array.from(new Set(primary)).sort(),
  };
  const z = new Float64Array(pOut);
  let any = false;
  for (let i = 0; i < n; i++) {
    if (!((w[i] as number) > 0)) continue;
    any = true;
    transformRow(t, X.subarray(i * pIn, (i + 1) * pIn), z);
    for (let j = 0; j < pOut; j++) {
      const v = z[j] as number;
      if (v < (t.zMin[j] as number)) t.zMin[j] = v;
      if (v > (t.zMax[j] as number)) t.zMax[j] = v;
    }
  }
  if (!any) throw new RangeError('fitFeatureTransform: no row has positive weight');
  return t;
}

/** Maps one raw row (length pIn) to its pOut standardised values, without clipping. */
export function transformRow(t: FeatureTransform, x: ArrayLike<number>, out: Float64Array): void {
  const { pIn, mu, scale, pca, pcaStart, pcaEnd } = t;
  for (let j = 0; j < pcaStart; j++) out[j] = ((x[j] as number) - (mu[j] as number)) / (scale[j] as number);
  let o = pcaStart;
  if (pca) {
    pcaScores(pca, x, pcaStart, out, pcaStart);
    o += pca.k;
  }
  for (let j = pcaEnd; j < pIn; j++, o++) out[o] = ((x[j] as number) - (mu[j] as number)) / (scale[j] as number);
}

/** Applies `transformRow` to every row of an n × pIn matrix; returns n × pOut. */
export function transformRows(t: FeatureTransform, X: Float64Array, n: number): Float64Array {
  assertLength('transformRows', X, n * t.pIn);
  const out = new Float64Array(n * t.pOut);
  for (let i = 0; i < n; i++) transformRow(t, X.subarray(i * t.pIn, (i + 1) * t.pIn), out.subarray(i * t.pOut, (i + 1) * t.pOut));
  return out;
}

/**
 * Prediction-time clipping, in place: z_j ← clamp(z_j, zMin_j − f·r_j, zMax_j + f·r_j) with
 * r_j = zMax_j − zMin_j and f = 0.5. Returns true (EXTRAPOLATED) if a primary column was
 * clipped. Non-finite values are left as they are, for the caller to reject.
 */
export function clipRow(
  z: Float64Array,
  zMin: ArrayLike<number>,
  zMax: ArrayLike<number>,
  primaryOut: ArrayLike<number>,
  fraction: number = CLIP_RANGE_FRACTION,
): boolean {
  let clippedPrimary = false;
  for (let k = 0; k < primaryOut.length; k++) {
    const j = primaryOut[k] as number;
    const r = (zMax[j] as number) - (zMin[j] as number);
    const v = z[j] as number;
    if (v < (zMin[j] as number) - fraction * r || v > (zMax[j] as number) + fraction * r) clippedPrimary = true;
  }
  for (let j = 0; j < z.length; j++) {
    const lo = zMin[j] as number;
    const hi = zMax[j] as number;
    const r = hi - lo;
    const v = z[j] as number;
    if (v < lo - fraction * r) z[j] = lo - fraction * r;
    else if (v > hi + fraction * r) z[j] = hi + fraction * r;
  }
  return clippedPrimary;
}
