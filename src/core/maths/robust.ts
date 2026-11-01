// λ selection by exact grouped LOO, Huber IRLS, hard rejection and the final robust ridge fit
// with its leverage (specification §4.8.3). Design conventions are those of ridge.ts.
import { ROBUST } from '../constants.ts';
import type { CvReport } from '../types.ts';
import { cvScore, groupedLooPathWithGram, groupedLooResiduals, oofFromResiduals, type AngularError, type CvScoreOptions } from './groupedLoo.ts';
import { SingularMatrixError } from './linalg.ts';
import {
  checkDesign,
  leveragesOfFit,
  OUTPUTS,
  resolveLambda,
  residuals,
  ridgeFit,
  ridgeFitFromGram,
  ridgeInverse,
  weightedCross,
  weightedGram,
} from './ridge.ts';
import { MAD_TO_SD, mad, median, percentile } from './stats.ts';

/** ρ_i = ‖r_i‖ for n × 2 residuals. */
export function residualNorms(r: Float64Array, n: number): Float64Array {
  const rho = new Float64Array(n);
  for (let i = 0; i < n; i++) rho[i] = Math.hypot(r[i * OUTPUTS] as number, r[i * OUTPUTS + 1] as number);
  return rho;
}

function positive(values: Float64Array, w: ArrayLike<number>, rows?: ArrayLike<number>): number[] {
  const out: number[] = [];
  const count = rows ? rows.length : values.length;
  for (let r = 0; r < count; r++) {
    const i = rows ? (rows[r] as number) : r;
    if ((w[i] as number) > 0) out.push(values[i] as number);
  }
  return out;
}

/**
 * One Huber reweighting: s = 1.4826·median(ρ) over rows with positive base weight, then
 * w_i = base_i·min(1, k·s/ρ_i). The factor multiplies the base (design) weight, as in standard
 * IRLS, so repeated passes converge to the Huber M-estimate instead of compounding. If s = 0
 * (at least half the rows fit exactly) the scale is degenerate and the base weights are returned.
 */
export function huberReweight(
  rho: Float64Array,
  base: Float64Array,
  k: number = ROBUST.huberK,
): { weights: Float64Array; scale: number } {
  const scale = MAD_TO_SD * median(positive(rho, base));
  const weights = base.slice();
  if (!(scale > 0)) return { weights, scale };
  for (let i = 0; i < weights.length; i++) {
    const r = rho[i] as number;
    if (r > k * scale) weights[i] = (base[i] as number) * ((k * scale) / r);
  }
  return { weights, scale };
}

/**
 * Hard rejection: within each group, over its rows with positive weight, rows whose robust z,
 * (ρ − median)/(1.4826·MAD), exceeds `zMax` get weight 0. A group whose MAD is 0 has no usable
 * scale and is left unchanged.
 */
export function hardReject(
  rho: Float64Array,
  groups: Int32Array,
  weights: Float64Array,
  zMax: number = ROBUST.hardRejectZ,
): { weights: Float64Array; rejected: Uint8Array } {
  const n = rho.length;
  const byGroup = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const g = groups[i] as number;
    let list = byGroup.get(g);
    if (!list) {
      list = [];
      byGroup.set(g, list);
    }
    list.push(i);
  }
  const out = weights.slice();
  const rejected = new Uint8Array(n);
  for (const rows of byGroup.values()) {
    const vals = positive(rho, weights, rows);
    if (vals.length === 0) continue;
    const med = median(vals);
    const spread = MAD_TO_SD * mad(vals, med);
    if (!(spread > 0)) continue;
    for (const i of rows) {
      if ((weights[i] as number) > 0 && ((rho[i] as number) - med) / spread > zMax) {
        out[i] = 0;
        rejected[i] = 1;
      }
    }
  }
  return { weights: out, rejected };
}

export interface LambdaCandidate {
  lambdaRel: number;
  lambda: number;
  /** null when the fit, or a leave-group-out fit, was singular at this λ. */
  cv: CvReport | null;
  error: string | null;
}

export interface LambdaSelection {
  lambdaRel: number;
  lambda: number;
  /** Grouped LOO residuals (n × 2) at the selected λ. */
  residuals: Float64Array;
  cv: CvReport;
  candidates: LambdaCandidate[];
  /** ZᵀWZ and ZᵀWY with these weights, for a fit that reuses them. */
  gram: Float64Array;
  cross: Float64Array;
}

export interface RidgeProblem {
  /** n × p design, intercept column included. */
  Z: Float64Array;
  /** n × 2 targets in degrees. */
  Y: Float64Array;
  /** Base weights (normalised to Σw = n, §4.8.2). */
  w: Float64Array;
  n: number;
  p: number;
  groups: Int32Array;
  unpenalised: readonly number[];
  /** The mapper's λ_rel grid. */
  lambdaRel: readonly number[];
  /** True when the grid holds absolute λ values instead of λ_rel. */
  absoluteLambda?: boolean;
  ang: AngularError;
  /** Passed to `cvScore`; rows with positive base weight are scored unless `score` is given. */
  cv?: CvScoreOptions;
}

/**
 * Scores every λ of the grid by exact grouped LOO with the weights `w` (λ = λ_rel·Σw of those
 * weights, or the absolute value) and returns the λ with the lowest meanDeg; on a tie the first
 * in grid order wins. A λ whose fit is singular is recorded with its error and skipped; if no λ
 * gives a finite score, this throws.
 */
export function selectLambda(problem: RidgeProblem, w: Float64Array): LambdaSelection {
  const { Z, Y, n, p, groups, unpenalised, lambdaRel, absoluteLambda = false, ang } = problem;
  if (lambdaRel.length === 0) throw new RangeError('selectLambda: empty λ grid');
  const lambdas = lambdaRel.map((l) => resolveLambda(l, w, absoluteLambda));
  let path: (Float64Array | null)[];
  let gram: Float64Array;
  let cross: Float64Array;
  const errors: (string | null)[] = lambdas.map(() => null);
  try {
    ({ residuals: path, gram, cross } = groupedLooPathWithGram(Z, Y, w, n, p, lambdas, groups, unpenalised));
  } catch (err) {
    if (!(err instanceof SingularMatrixError)) throw err;
    gram = weightedGram(Z, w, n, p);
    cross = weightedCross(Z, Y, w, n, p);
    path = lambdas.map((lambda, j) => {
      try {
        return groupedLooResiduals(Z, Y, w, n, p, lambda, groups, unpenalised);
      } catch (inner) {
        if (!(inner instanceof SingularMatrixError)) throw inner;
        errors[j] = inner.message;
        return null;
      }
    });
  }
  let score = problem.cv?.score ?? null;
  if (!score) {
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) if ((problem.w[i] as number) > 0) mask[i] = 1;
    score = mask;
  }
  const opts: CvScoreOptions = { ...problem.cv, score };
  const candidates: LambdaCandidate[] = [];
  let best = -1;
  for (let j = 0; j < lambdas.length; j++) {
    const e = path[j] ?? null;
    const cv = e ? cvScore(oofFromResiduals(Y, e), Y, n, groups, ang, opts) : null;
    candidates.push({ lambdaRel: lambdaRel[j] as number, lambda: lambdas[j] as number, cv, error: errors[j] ?? null });
    if (cv && Number.isFinite(cv.meanDeg) && (best < 0 || cv.meanDeg < (candidates[best]?.cv?.meanDeg as number))) best = j;
  }
  if (best < 0) {
    throw new Error(`selectLambda: no λ gave a finite CV score (${errors.filter((e) => e).join('; ') || 'no scorable group'})`);
  }
  const chosen = candidates[best] as LambdaCandidate;
  return {
    lambdaRel: chosen.lambdaRel,
    lambda: chosen.lambda,
    residuals: path[best] as Float64Array,
    cv: chosen.cv as CvReport,
    candidates,
    gram,
    cross,
  };
}

export interface RobustRidgeResult {
  lambdaRel: number;
  lambda: number;
  /** p × 2 coefficients of the final fit. */
  B: Float64Array;
  /** (ZᵀWZ + Λ)⁻¹ of the final fit (p × p). */
  A: Float64Array;
  /** Final robust weights (Huber factors, with 0 for hard-rejected rows). */
  weights: Float64Array;
  rejected: Uint8Array;
  /** Huber scale s of the last IRLS pass. */
  huberScale: number;
  /** λ selection on the base weights (step 1) and on the robust weights (step 4). */
  baseSelection: LambdaSelection;
  robustSelection: LambdaSelection;
  /** Out-of-fold predictions (n × 2) at the final λ with the robust weights. */
  oof: Float64Array;
  /** CV of `oof`; slightly optimistic, because the robust weights were fitted on all groups. */
  cv: CvReport;
  /** h_i = z̃_iᵀ A z̃_i for every row, and its 95th percentile over rows with positive base weight. */
  leverage: Float64Array;
  h95: number;
}

/**
 * The §4.8.3 robust refit: (1) select λ* on the base weights; (2) `irlsPasses` Huber passes at
 * λ*; (3) hard rejection on the residuals of the reweighted fit; (4) re-select λ with those
 * weights held fixed; (5) final fit, with A, leverage and h95.
 */
export function robustRidgeFit(
  problem: RidgeProblem,
  opts: { huberK?: number; irlsPasses?: number; hardRejectZ?: number } = {},
): RobustRidgeResult {
  const { Z, Y, w: base, n, p, groups, unpenalised, absoluteLambda = false } = problem;
  const { huberK = ROBUST.huberK, irlsPasses = ROBUST.irlsPasses, hardRejectZ = ROBUST.hardRejectZ } = opts;
  checkDesign('robustRidgeFit', Z, Y, base, n, p);

  const baseSelection = selectLambda(problem, base);
  let fit = ridgeFitFromGram(baseSelection.gram, baseSelection.cross, p, baseSelection.lambda, unpenalised);
  let w = base;
  let huberScale = NaN;
  for (let pass = 0; pass < irlsPasses; pass++) {
    const hub = huberReweight(residualNorms(residuals(Z, Y, fit.B, n, p), n), base, huberK);
    w = hub.weights;
    huberScale = hub.scale;
    fit = ridgeFit(Z, Y, w, n, p, resolveLambda(baseSelection.lambdaRel, w, absoluteLambda), unpenalised);
  }
  const { weights, rejected } = hardReject(residualNorms(residuals(Z, Y, fit.B, n, p), n), groups, w, hardRejectZ);

  const robustSelection = selectLambda(problem, weights);
  const final = ridgeFitFromGram(robustSelection.gram, robustSelection.cross, p, robustSelection.lambda, unpenalised);
  const A = ridgeInverse(final);
  const leverage = leveragesOfFit(final, Z, n);
  return {
    lambdaRel: robustSelection.lambdaRel,
    lambda: robustSelection.lambda,
    B: final.B,
    A,
    weights,
    rejected,
    huberScale,
    baseSelection,
    robustSelection,
    oof: oofFromResiduals(Y, robustSelection.residuals),
    cv: robustSelection.cv,
    leverage,
    h95: percentile(positive(leverage, base), 95),
  };
}
