// Weighted ridge regression with unpenalised columns (specification §4.8.3).
//
// Conventions shared by ridge.ts, groupedLoo.ts and robust.ts: the design Z is n × p row-major
// and already contains any intercept column (build it with `withIntercept`, which puts the
// column of ones first, and pass `unpenalised = [0]`). Y is n × 2 (θx, θy in degrees) and w
// holds n non-negative row weights. The penalty is Λ = λ·diag(1 for penalised columns, 0 for
// unpenalised ones), so B = (ZᵀWZ + Λ)⁻¹ ZᵀWY.
import { assertFinite, assertLength, cholesky, choleskyInverse, choleskySolve } from './linalg.ts';

export const OUTPUTS = 2;

/** Validates the shared (Z, Y, w, n, p) arguments. */
export function checkDesign(fn: string, Z: Float64Array, Y: Float64Array, w: Float64Array, n: number, p: number): void {
  if (!(Number.isInteger(n) && n >= 1 && Number.isInteger(p) && p >= 1)) {
    throw new RangeError(`${fn}: invalid dimensions n = ${n}, p = ${p}`);
  }
  assertLength(`${fn} (Z)`, Z, n * p);
  assertLength(`${fn} (Y)`, Y, n * OUTPUTS);
  assertLength(`${fn} (w)`, w, n);
  assertFinite(`${fn} (Z)`, Z);
  assertFinite(`${fn} (Y)`, Y);
  for (let i = 0; i < n; i++) {
    const v = w[i] as number;
    if (!(Number.isFinite(v) && v >= 0)) throw new RangeError(`${fn}: invalid weight ${v} at row ${i}`);
  }
}

/** Penalty mask: 1 for penalised columns, 0 for the `unpenalised` ones. */
export function penaltyMask(p: number, unpenalised: readonly number[]): Float64Array {
  const mask = new Float64Array(p).fill(1);
  for (const j of unpenalised) {
    if (!(Number.isInteger(j) && j >= 0 && j < p)) throw new RangeError(`penaltyMask: invalid unpenalised column ${j}`);
    mask[j] = 0;
  }
  return mask;
}

/** [1, Z]: prepends a column of ones to an n × p matrix, giving n × (p + 1). */
export function withIntercept(Z: Float64Array, n: number, p: number): Float64Array {
  assertLength('withIntercept', Z, n * p);
  const q = p + 1;
  const out = new Float64Array(n * q);
  for (let i = 0; i < n; i++) {
    out[i * q] = 1;
    out.set(Z.subarray(i * p, (i + 1) * p), i * q + 1);
  }
  return out;
}

/** λ = λ_rel·Σw, or λ_rel itself for mappers with an absolute λ. */
export function resolveLambda(lambdaRel: number, w: ArrayLike<number>, absolute = false): number {
  if (!(Number.isFinite(lambdaRel) && lambdaRel >= 0)) throw new RangeError(`resolveLambda: invalid λ_rel ${lambdaRel}`);
  if (absolute) return lambdaRel;
  let sum = 0;
  for (let i = 0; i < w.length; i++) sum += w[i] as number;
  return lambdaRel * sum;
}

/** ZᵀWZ (p × p, symmetric, both triangles filled), over `rows` only when given. */
export function weightedGram(Z: Float64Array, w: Float64Array, n: number, p: number, rows?: ArrayLike<number>): Float64Array {
  const count = rows ? rows.length : n;
  let m = 0;
  for (let r = 0; r < count; r++) if ((w[rows ? (rows[r] as number) : r] as number) !== 0) m++;
  // Column-major copies of Z and WZ over the weighted rows turn every entry into a contiguous
  // dot product; 2 × 2 register blocking halves the loads per multiply-add.
  const Zt = new Float64Array(p * m);
  const WZt = new Float64Array(p * m);
  for (let r = 0, c = 0; r < count; r++) {
    const i = rows ? (rows[r] as number) : r;
    const wi = w[i] as number;
    if (wi === 0) continue;
    const zi = i * p;
    for (let a = 0; a < p; a++) {
      const v = Z[zi + a] as number;
      Zt[a * m + c] = v;
      WZt[a * m + c] = wi * v;
    }
    c++;
  }
  const G = new Float64Array(p * p);
  for (let a = 0; a < p; a += 2) {
    const a1 = a + 1 < p ? a + 1 : a;
    const oa = a * m;
    const oa1 = a1 * m;
    for (let b = 0; b <= a1; b += 2) {
      const b1 = b + 1 < p ? b + 1 : b;
      const ob = b * m;
      const ob1 = b1 * m;
      let s00 = 0;
      let s01 = 0;
      let s10 = 0;
      let s11 = 0;
      for (let r = 0; r < m; r++) {
        const x0 = WZt[oa + r] as number;
        const x1 = WZt[oa1 + r] as number;
        const y0 = Zt[ob + r] as number;
        const y1 = Zt[ob1 + r] as number;
        s00 += x0 * y0;
        s01 += x0 * y1;
        s10 += x1 * y0;
        s11 += x1 * y1;
      }
      G[a * p + b] = s00;
      G[b * p + a] = s00;
      G[a * p + b1] = s01;
      G[b1 * p + a] = s01;
      G[a1 * p + b] = s10;
      G[b * p + a1] = s10;
      G[a1 * p + b1] = s11;
      G[b1 * p + a1] = s11;
    }
  }
  return G;
}

/** ZᵀWY (p × 2), over `rows` only when given. */
export function weightedCross(
  Z: Float64Array,
  Y: Float64Array,
  w: Float64Array,
  n: number,
  p: number,
  rows?: ArrayLike<number>,
): Float64Array {
  const c = new Float64Array(p * OUTPUTS);
  const count = rows ? rows.length : n;
  for (let r = 0; r < count; r++) {
    const i = rows ? (rows[r] as number) : r;
    const wi = w[i] as number;
    if (wi === 0) continue;
    const y0 = wi * (Y[i * OUTPUTS] as number);
    const y1 = wi * (Y[i * OUTPUTS + 1] as number);
    const zi = i * p;
    for (let a = 0; a < p; a++) {
      const z = Z[zi + a] as number;
      c[a * OUTPUTS] = (c[a * OUTPUTS] as number) + z * y0;
      c[a * OUTPUTS + 1] = (c[a * OUTPUTS + 1] as number) + z * y1;
    }
  }
  return c;
}

/** G + λ·diag(mask), as a new matrix. */
export function addPenalty(G: Float64Array, p: number, lambda: number, mask: Float64Array): Float64Array {
  const M = G.slice();
  for (let j = 0; j < p; j++) M[j * p + j] = (M[j * p + j] as number) + lambda * (mask[j] as number);
  return M;
}

export interface RidgeFit {
  p: number;
  lambda: number;
  /** p × 2 coefficients. */
  B: Float64Array;
  /** Cholesky factor of ZᵀWZ + Λ. */
  L: Float64Array;
}

/**
 * Weighted ridge by Cholesky. Throws SingularMatrixError when ZᵀWZ + Λ is not positive definite
 * (for example an unpenalised column that is zero on every weighted row, or λ = 0 with collinear
 * columns).
 */
export function ridgeFit(
  Z: Float64Array,
  Y: Float64Array,
  w: Float64Array,
  n: number,
  p: number,
  lambda: number,
  unpenalised: readonly number[],
): RidgeFit {
  checkDesign('ridgeFit', Z, Y, w, n, p);
  return ridgeFitFromGram(weightedGram(Z, w, n, p), weightedCross(Z, Y, w, n, p), p, lambda, unpenalised);
}

/** `ridgeFit` from an already computed ZᵀWZ (p × p) and ZᵀWY (p × 2). */
export function ridgeFitFromGram(
  gram: Float64Array,
  cross: Float64Array,
  p: number,
  lambda: number,
  unpenalised: readonly number[],
): RidgeFit {
  if (!(Number.isFinite(lambda) && lambda >= 0)) throw new RangeError(`ridgeFit: invalid λ ${lambda}`);
  const L = cholesky(addPenalty(gram, p, lambda, penaltyMask(p, unpenalised)), p);
  const B = choleskySolve(L, p, cross, OUTPUTS);
  return { p, lambda, B, L };
}

/** A = (ZᵀWZ + Λ)⁻¹ of a fit (p × p), as stored in the mapping state. */
export function ridgeInverse(fit: RidgeFit): Float64Array {
  return choleskyInverse(fit.L, fit.p);
}

export function predictRow(B: ArrayLike<number>, z: ArrayLike<number>, p: number): [number, number] {
  let x = 0;
  let y = 0;
  for (let a = 0; a < p; a++) {
    const v = z[a] as number;
    x += v * (B[a * OUTPUTS] as number);
    y += v * (B[a * OUTPUTS + 1] as number);
  }
  return [x, y];
}

/** Z·B (n × 2). */
export function predictRows(B: ArrayLike<number>, Z: Float64Array, n: number, p: number): Float64Array {
  const out = new Float64Array(n * OUTPUTS);
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    const zi = i * p;
    for (let a = 0; a < p; a++) {
      const v = Z[zi + a] as number;
      x += v * (B[a * OUTPUTS] as number);
      y += v * (B[a * OUTPUTS + 1] as number);
    }
    out[i * OUTPUTS] = x;
    out[i * OUTPUTS + 1] = y;
  }
  return out;
}

/** Y − Z·B (n × 2). */
export function residuals(Z: Float64Array, Y: Float64Array, B: ArrayLike<number>, n: number, p: number): Float64Array {
  const r = predictRows(B, Z, n, p);
  for (let i = 0; i < r.length; i++) r[i] = (Y[i] as number) - (r[i] as number);
  return r;
}

/** Leverage h = zᵀ·A·z of one design row (intercept included). */
export function leverage(A: ArrayLike<number>, z: ArrayLike<number>, p: number): number {
  let h = 0;
  for (let a = 0; a < p; a++) {
    const za = z[a] as number;
    if (za === 0) continue;
    let s = 0;
    for (let b = 0; b < p; b++) s += (A[a * p + b] as number) * (z[b] as number);
    h += za * s;
  }
  return h;
}

export function leverages(A: ArrayLike<number>, Z: Float64Array, n: number, p: number): Float64Array {
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) h[i] = leverage(A, Z.subarray(i * p, (i + 1) * p), p);
  return h;
}

/** The leverage of every row from the fit's Cholesky factor: h_i = ‖L⁻¹ z_i‖² = z_iᵀ A z_i. */
export function leveragesOfFit(fit: RidgeFit, Z: Float64Array, n: number): Float64Array {
  const { L, p } = fit;
  assertLength('leveragesOfFit', Z, n * p);
  const h = new Float64Array(n);
  const v = new Float64Array(p);
  for (let i = 0; i < n; i++) h[i] = solvedNormSq(L, p, Z, i * p, v);
  return h;
}

// ‖L⁻¹ z‖² for z = Z[offset … offset + p), using v as scratch (a function of its own so that V8
// optimises it after a few rows).
function solvedNormSq(L: Float64Array, p: number, Z: Float64Array, offset: number, v: Float64Array): number {
  let sum = 0;
  for (let a = 0; a < p; a++) {
    const la = a * p;
    let s0 = 0;
    let s1 = 0;
    let k = 0;
    for (; k + 1 < a; k += 2) {
      s0 += (L[la + k] as number) * (v[k] as number);
      s1 += (L[la + k + 1] as number) * (v[k + 1] as number);
    }
    if (k < a) s0 += (L[la + k] as number) * (v[k] as number);
    const t = ((Z[offset + a] as number) - (s0 + s1)) / (L[la + a] as number);
    v[a] = t;
    sum += t * t;
  }
  return sum;
}

