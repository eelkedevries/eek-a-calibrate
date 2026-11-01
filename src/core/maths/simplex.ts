// Simplex-constrained stacking of engine predictions (specification §4.9).
import type { Vec2 } from '../types.ts';
import { assertFinite, assertLength, luSolve, SingularMatrixError } from './linalg.ts';
import { OUTPUTS } from './ridge.ts';

export const MAX_MEMBERS = 4;

export interface SimplexFit {
  /** K weights, β ≥ 0, Σβ = 1. */
  beta: Float64Array;
  /** Σ w_i (y_i − x_iᵀβ)² at β. */
  objective: number;
  /** Members with a non-zero weight, ascending. */
  support: number[];
}

/**
 * minimise Σ_i w_i (y_i − Σ_e β_e X_ie)² subject to β ≥ 0 and Σβ = 1, for X n × K (K ≤ 4).
 * The problem is a convex quadratic programme, so its optimum is the equality-constrained least
 * squares solution on its own support. Every one of the 2^K − 1 supports is solved through its
 * KKT system [G_SS 1; 1ᵀ 0][β_S; ν] = [c_S; 1] (G = XᵀWX, c = XᵀWy), and the feasible solution
 * (β_S ≥ 0) with the lowest objective is kept. Supports are visited from small to large, and a
 * larger support replaces a smaller one only if it is better by more than rounding, so ties go
 * to the simpler combination. Singular supports (members with identical predictions) are skipped;
 * the single-member supports are never singular.
 */
export function simplexLeastSquares(X: Float64Array, y: Float64Array, w: Float64Array, n: number, K: number): SimplexFit {
  if (!(Number.isInteger(K) && K >= 1 && K <= MAX_MEMBERS)) {
    throw new RangeError(`simplexLeastSquares: K must be between 1 and ${MAX_MEMBERS}, got ${K}`);
  }
  assertLength('simplexLeastSquares (X)', X, n * K);
  assertLength('simplexLeastSquares (y)', y, n);
  assertLength('simplexLeastSquares (w)', w, n);
  assertFinite('simplexLeastSquares (X)', X);
  assertFinite('simplexLeastSquares (y)', y);
  let sumW = 0;
  for (let i = 0; i < n; i++) {
    const v = w[i] as number;
    if (!(Number.isFinite(v) && v >= 0)) throw new RangeError(`simplexLeastSquares: invalid weight ${v} at ${i}`);
    sumW += v;
  }
  if (!(sumW > 0)) throw new RangeError('simplexLeastSquares: total weight is zero');

  const G = new Float64Array(K * K);
  const c = new Float64Array(K);
  let yy = 0;
  for (let i = 0; i < n; i++) {
    const wi = w[i] as number;
    if (wi === 0) continue;
    const yi = y[i] as number;
    yy += wi * yi * yi;
    for (let a = 0; a < K; a++) {
      const xa = wi * (X[i * K + a] as number);
      c[a] = (c[a] as number) + xa * yi;
      for (let b = 0; b < K; b++) G[a * K + b] = (G[a * K + b] as number) + xa * (X[i * K + b] as number);
    }
  }
  const objectiveOf = (beta: Float64Array): number => {
    let f = yy;
    for (let a = 0; a < K; a++) {
      const ba = beta[a] as number;
      f -= 2 * ba * (c[a] as number);
      for (let b = 0; b < K; b++) f += ba * (G[a * K + b] as number) * (beta[b] as number);
    }
    return Math.max(f, 0);
  };

  const masks = Array.from({ length: (1 << K) - 1 }, (_, i) => i + 1).sort((a, b) => popcount(a) - popcount(b) || a - b);
  let best: SimplexFit | null = null;
  for (const mask of masks) {
    const S: number[] = [];
    for (let e = 0; e < K; e++) if (mask & (1 << e)) S.push(e);
    const m = S.length;
    const kkt = new Float64Array((m + 1) * (m + 1));
    const rhs = new Float64Array(m + 1);
    for (let a = 0; a < m; a++) {
      for (let b = 0; b < m; b++) kkt[a * (m + 1) + b] = G[(S[a] as number) * K + (S[b] as number)] as number;
      kkt[a * (m + 1) + m] = 1;
      kkt[m * (m + 1) + a] = 1;
      rhs[a] = c[S[a] as number] as number;
    }
    rhs[m] = 1;
    let sol: Float64Array;
    try {
      sol = luSolve(kkt, m + 1, rhs, 1);
    } catch (err) {
      if (err instanceof SingularMatrixError) continue;
      throw err;
    }
    const beta = new Float64Array(K);
    let feasible = true;
    for (let a = 0; a < m; a++) {
      const v = sol[a] as number;
      if (!(v >= -1e-12)) {
        feasible = false;
        break;
      }
      beta[S[a] as number] = Math.max(v, 0);
    }
    if (!feasible) continue;
    let sum = 0;
    for (let e = 0; e < K; e++) sum += beta[e] as number;
    for (let e = 0; e < K; e++) beta[e] = (beta[e] as number) / sum;
    const objective = objectiveOf(beta);
    if (!best || objective < best.objective - 1e-12 * Math.max(1, best.objective)) {
      best = { beta, objective, support: S.filter((e) => (beta[e] as number) > 0) };
    }
  }
  if (!best) throw new Error('simplexLeastSquares: no feasible support');
  return best;
}

function popcount(x: number): number {
  let c = 0;
  for (let v = x; v; v &= v - 1) c++;
  return c;
}

function axisMatrix(members: readonly Float64Array[], n: number, axis: number, rows?: ArrayLike<number>): Float64Array {
  const K = members.length;
  const count = rows ? rows.length : n;
  const X = new Float64Array(count * K);
  for (let r = 0; r < count; r++) {
    const i = rows ? (rows[r] as number) : r;
    for (let e = 0; e < K; e++) X[r * K + e] = (members[e] as Float64Array)[i * OUTPUTS + axis] as number;
  }
  return X;
}

function pick(a: Float64Array, rows: ArrayLike<number>, stride: number, offset: number): Float64Array {
  const out = new Float64Array(rows.length);
  for (let r = 0; r < rows.length; r++) out[r] = a[(rows[r] as number) * stride + offset] as number;
  return out;
}

export interface StackFit {
  wx: Float64Array;
  wy: Float64Array;
}

/**
 * Per-axis simplex stacking of K member predictions (each n × 2, rows aligned with Y) on the
 * rows listed in `rows` (all rows by default).
 */
export function stackFit(
  members: readonly Float64Array[],
  Y: Float64Array,
  w: Float64Array,
  n: number,
  rows?: ArrayLike<number>,
): StackFit {
  for (const m of members) assertLength('stackFit (member)', m, n * OUTPUTS);
  assertLength('stackFit (Y)', Y, n * OUTPUTS);
  assertLength('stackFit (w)', w, n);
  const idx = rows ?? Int32Array.from({ length: n }, (_, i) => i);
  const K = members.length;
  const wr = pick(w, idx, 1, 0);
  const fx = simplexLeastSquares(axisMatrix(members, n, 0, idx), pick(Y, idx, OUTPUTS, 0), wr, idx.length, K);
  const fy = simplexLeastSquares(axisMatrix(members, n, 1, idx), pick(Y, idx, OUTPUTS, 1), wr, idx.length, K);
  return { wx: fx.beta, wy: fy.beta };
}

/**
 * Nested CV of the stack (§4.9): for each group g, β is fitted on the rows outside g and used to
 * predict the rows of g. Returns the combined out-of-fold predictions (n × 2). Throws if the rows
 * outside some group carry no weight.
 */
export function stackNestedOof(
  members: readonly Float64Array[],
  Y: Float64Array,
  w: Float64Array,
  n: number,
  groups: Int32Array,
): Float64Array {
  assertLength('stackNestedOof (groups)', groups, n);
  const labels = [...new Set(groups)];
  const oof = new Float64Array(n * OUTPUTS);
  const K = members.length;
  for (const g of labels) {
    const train: number[] = [];
    const test: number[] = [];
    for (let i = 0; i < n; i++) (groups[i] === g ? test : train).push(i);
    const { wx, wy } = stackFit(members, Y, w, n, train);
    for (const i of test) {
      let x = 0;
      let y = 0;
      for (let e = 0; e < K; e++) {
        const m = members[e] as Float64Array;
        x += (wx[e] as number) * (m[i * OUTPUTS] as number);
        y += (wy[e] as number) * (m[i * OUTPUTS + 1] as number);
      }
      oof[i * OUTPUTS] = x;
      oof[i * OUTPUTS + 1] = y;
    }
  }
  return oof;
}

/**
 * Prediction-time renormalisation: β_e / Σ_{available} β over the available members, 0 for the
 * others. Null when no available member has positive weight (the frame is then ENGINE_ERROR).
 */
export function renormaliseOverAvailable(beta: ArrayLike<number>, available: ArrayLike<boolean>): Float64Array | null {
  if (beta.length !== available.length) throw new RangeError('renormaliseOverAvailable: length mismatch');
  let sum = 0;
  for (let e = 0; e < beta.length; e++) if (available[e]) sum += beta[e] as number;
  if (!(sum > 0)) return null;
  const out = new Float64Array(beta.length);
  for (let e = 0; e < beta.length; e++) if (available[e]) out[e] = (beta[e] as number) / sum;
  return out;
}

/**
 * The Combined prediction from per-axis weights and the members' predictions for one frame
 * (null for a member whose frame is not usable). Null when either axis has no usable member.
 */
export function combineAvailable(
  wx: ArrayLike<number>,
  wy: ArrayLike<number>,
  predictions: readonly (Vec2 | null)[],
): Vec2 | null {
  const available = predictions.map((v) => v !== null);
  const bx = renormaliseOverAvailable(wx, available);
  const by = renormaliseOverAvailable(wy, available);
  if (!bx || !by) return null;
  let x = 0;
  let y = 0;
  predictions.forEach((v, e) => {
    if (!v) return;
    x += (bx[e] as number) * v[0];
    y += (by[e] as number) * v[1];
  });
  return [x, y];
}
