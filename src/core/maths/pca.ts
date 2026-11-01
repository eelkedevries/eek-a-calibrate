// Seeded randomised PCA for embedding blocks (specification §4.8.2): weighted centring, top-k
// principal components by Halko et al.'s randomised subspace iteration, and one common scale.
import { assertFinite, assertLength, multiplyABtInto, orthonormaliseRowsInPlace, symmetricEigen, transpose } from './linalg.ts';
import { gaussian, mulberry32 } from './rng.ts';

export interface PcaOptions {
  k: number;
  oversample: number;
  powerIters: number;
  seed: number;
}

/** What scoring needs; this is also what the mapping state stores (§6 `MappingState.pca`). */
export interface PcaProjection {
  /** Input dimension d. */
  d: number;
  /** Number of components k (rows of `components`). */
  k: number;
  /** Weighted mean of the block (length d). */
  mean: ArrayLike<number>;
  /**
   * k × d, row-major: row j is the j-th principal direction (unit length). Directions beyond the
   * numerical rank of the data are zero rows, so their scores are always 0.
   */
  components: ArrayLike<number>;
  /** √λ₁: every score is divided by this one scale, which keeps the relative variances. */
  commonScale: number;
}

export interface PcaBasis extends PcaProjection {
  mean: Float64Array;
  components: Float64Array;
  /** Weighted variance along each component (length k, descending). */
  eigenvalues: Float64Array;
}

/**
 * Fits the PCA basis of the n × d block `E` with row weights `w` (rows with zero weight are
 * ignored). Randomised subspace iteration (Halko, Martinsson and Tropp 2011, algorithm 4.4):
 * a d × (k + oversample) Gaussian sketch drawn from `mulberry32(seed)`, `powerIters` power
 * iterations with re-orthonormalisation after every product, then an exact eigen-decomposition
 * of the small projected matrix. The result depends only on the inputs and the seed, so the
 * same call gives byte-identical components. Each direction's sign is fixed so that its
 * largest-magnitude entry is positive.
 */
export function fitPca(E: Float64Array, w: Float64Array, n: number, d: number, opts: PcaOptions): PcaBasis {
  assertLength('fitPca (E)', E, n * d);
  assertLength('fitPca (w)', w, n);
  assertFinite('fitPca (E)', E);
  assertFinite('fitPca (w)', w);
  const { k, oversample, powerIters, seed } = opts;
  if (!(Number.isInteger(k) && k >= 1)) throw new RangeError(`fitPca: k must be a positive integer, got ${k}`);
  if (!(Number.isInteger(oversample) && oversample >= 0)) throw new RangeError(`fitPca: invalid oversample ${oversample}`);
  if (!(Number.isInteger(powerIters) && powerIters >= 0)) throw new RangeError(`fitPca: invalid powerIters ${powerIters}`);

  let sumW = 0;
  let nPos = 0;
  for (let i = 0; i < n; i++) {
    const wi = w[i] as number;
    if (wi < 0) throw new RangeError(`fitPca: negative weight at ${i}`);
    if (wi > 0) {
      sumW += wi;
      nPos++;
    }
  }
  if (!(sumW > 0)) throw new RangeError('fitPca: total weight is zero');

  const mean = new Float64Array(d);
  for (let i = 0; i < n; i++) {
    const wi = w[i] as number;
    if (wi === 0) continue;
    for (let c = 0; c < d; c++) mean[c] = (mean[c] as number) + wi * (E[i * d + c] as number);
  }
  for (let c = 0; c < d; c++) mean[c] = (mean[c] as number) / sumW;

  // A = diag(√w)·(E − 1·meanᵀ) over the positive-weight rows only.
  const rows = nPos;
  const A = new Float64Array(rows * d);
  for (let i = 0, r = 0; i < n; i++) {
    const wi = w[i] as number;
    if (wi === 0) continue;
    const sw = Math.sqrt(wi);
    for (let c = 0; c < d; c++) A[r * d + c] = sw * ((E[i * d + c] as number) - (mean[c] as number));
    r++;
  }

  const l = Math.min(k + oversample, d, rows);
  // Basis vectors are stored as rows (l × rows or l × d) so that every inner loop is contiguous.
  const omega = new Float64Array(l * d);
  const normal = gaussian(mulberry32(seed));
  for (let i = 0; i < omega.length; i++) omega[i] = normal();

  // Every product is written as X·Yᵀ over a shared contiguous index: A (rows × d) for A·V and
  // its transpose At (d × rows) for Aᵀ·U.
  const At = transpose(A, rows, d);
  const Q = new Float64Array(l * rows);
  multiplyABtInto(omega, l, A, rows, d, Q);
  orthonormaliseRowsInPlace(Q, l, rows);
  const Zt = new Float64Array(l * d);
  for (let it = 0; it < powerIters; it++) {
    multiplyABtInto(Q, l, At, d, rows, Zt);
    orthonormaliseRowsInPlace(Zt, l, d);
    multiplyABtInto(Zt, l, A, rows, d, Q);
    orthonormaliseRowsInPlace(Q, l, rows);
  }

  // B = Qᵀ·A (l × d); the right singular vectors of B approximate the principal directions.
  const B = new Float64Array(l * d);
  multiplyABtInto(Q, l, At, d, rows, B);
  const C = new Float64Array(l * l);
  multiplyABtInto(B, l, B, l, d, C);
  const { values, vectors } = symmetricEigen(C, l);

  const components = new Float64Array(k * d);
  const eigenvalues = new Float64Array(k);
  const sigma1 = Math.sqrt(Math.max(values[0] ?? 0, 0));
  if (!(sigma1 > 0)) throw new RangeError('fitPca: the block has no variance');
  for (let j = 0; j < Math.min(k, l); j++) {
    const sigma = Math.sqrt(Math.max(values[j] as number, 0));
    // Below this the direction is rounding noise of the l × l eigenproblem, not data.
    if (!(sigma > 1e-7 * sigma1)) break;
    const row = j * d;
    for (let a = 0; a < l; a++) {
      const u = (vectors[a * l + j] as number) / sigma;
      if (u === 0) continue;
      for (let c = 0; c < d; c++) components[row + c] = (components[row + c] as number) + u * (B[a * d + c] as number);
    }
    let big = 0;
    for (let c = 1; c < d; c++) if (Math.abs(components[row + c] as number) > Math.abs(components[row + big] as number)) big = c;
    if ((components[row + big] as number) < 0) for (let c = 0; c < d; c++) components[row + c] = -(components[row + c] as number);
    eigenvalues[j] = (sigma * sigma) / sumW;
  }
  return { d, k, mean, components, eigenvalues, commonScale: Math.sqrt(eigenvalues[0] as number) };
}

/**
 * Writes the k scaled scores (e − mean)·v_j / commonScale of one block row `e` (length d, read
 * from `e[offset…]`) into `out[outOffset…]`.
 */
export function pcaScores(
  basis: PcaProjection,
  e: ArrayLike<number>,
  offset: number,
  out: Float64Array,
  outOffset: number,
): void {
  const { d, k, mean, components, commonScale } = basis;
  for (let j = 0; j < k; j++) {
    const row = j * d;
    let s = 0;
    for (let c = 0; c < d; c++) s += ((e[offset + c] as number) - (mean[c] as number)) * (components[row + c] as number);
    out[outOffset + j] = s / commonScale;
  }
}
