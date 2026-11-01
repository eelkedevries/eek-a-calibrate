// Exact leave-one-group-out residuals of weighted ridge, and the CV score (specification §4.8.3).
// The design conventions are those of ridge.ts: Z already holds the intercept column.
import type { CvReport, Vec2 } from '../types.ts';
import { cholesky, choleskySolve, SingularMatrixError } from './linalg.ts';
import { checkDesign, OUTPUTS, penaltyMask, weightedCross, weightedGram } from './ridge.ts';
import { mean, median, sampleSd } from './stats.ts';

/**
 * Angular error in degrees between two gaze directions (θx, θy) in degrees (§4.5 `ang`). It must
 * be pure: `cvScore` reuses the two argument tuples between calls.
 */
export type AngularError = (a: Vec2, b: Vec2) => number;

/** Guards against a group layout whose per-group Gram matrices would not fit in memory. */
const MAX_GRAM_ENTRIES = 1 << 22;

interface GroupIndex {
  labels: number[];
  rows: Int32Array[];
}

function indexGroups(groups: Int32Array, n: number): GroupIndex {
  if (groups.length !== n) throw new RangeError(`grouped LOO: expected ${n} group labels, got ${groups.length}`);
  const slot = new Map<number, number>();
  const counts: number[] = [];
  for (let i = 0; i < n; i++) {
    const g = groups[i] as number;
    let s = slot.get(g);
    if (s === undefined) {
      s = counts.length;
      slot.set(g, s);
      counts.push(0);
    }
    counts[s] = (counts[s] as number) + 1;
  }
  const rows = counts.map((c) => new Int32Array(c));
  const fill = new Int32Array(counts.length);
  for (let i = 0; i < n; i++) {
    const s = slot.get(groups[i] as number) as number;
    (rows[s] as Int32Array)[fill[s] as number] = i;
    fill[s] = (fill[s] as number) + 1;
  }
  return { labels: [...slot.keys()], rows };
}

/**
 * Exact grouped leave-one-out residuals of the ridge fit B = (ZᵀWZ + Λ)⁻¹ZᵀWY: row i of the
 * result (n × 2) is Y_i minus the prediction of the fit that excludes every row of i's group.
 * Λ = λ on every column except `unpenalised`. Rows with zero weight do not influence any fit but
 * still receive a residual. Throws SingularMatrixError when the fit without some group is not
 * positive definite (for example when that group carries all the weight).
 */
export function groupedLooResiduals(
  Z: Float64Array,
  Y: Float64Array,
  w: Float64Array,
  n: number,
  p: number,
  lambda: number,
  groups: Int32Array,
  unpenalised: readonly number[],
): Float64Array {
  return groupedLooPath(Z, Y, w, n, p, [lambda], groups, unpenalised)[0] as Float64Array;
}

// Replaces each of the G blocks (each `size` long) by the sum of all the other blocks, using
// prefix and suffix sums: no subtraction, so a dominant block costs no precision.
function complementsInPlace(blocks: Float64Array, G: number, size: number): void {
  const suffix = new Float64Array((G + 1) * size);
  for (let g = G - 1; g >= 0; g--) {
    for (let k = 0; k < size; k++) suffix[g * size + k] = (suffix[(g + 1) * size + k] as number) + (blocks[g * size + k] as number);
  }
  const prefix = new Float64Array(size);
  for (let g = 0; g < G; g++) {
    for (let k = 0; k < size; k++) {
      const own = blocks[g * size + k] as number;
      blocks[g * size + k] = (prefix[k] as number) + (suffix[(g + 1) * size + k] as number);
      prefix[k] = (prefix[k] as number) + own;
    }
  }
}

/**
 * `groupedLooResiduals` for several λ at once, sharing the λ-independent work; returns one n × 2
 * residual matrix per λ, in the order given.
 *
 * The §4.8.3 hat-matrix identity, e_g = (I − H_gg)⁻¹ r_g with H_gg = Z_g A Z_gᵀ W_g,
 * A = (ZᵀWZ + Λ)⁻¹ and r = Y − ZB, is evaluated through the Woodbury identity
 *   (I − Z_g A Z_gᵀ W_g)⁻¹ = I + Z_g M_g⁻¹ Z_gᵀ W_g,   M_g = ZᵀWZ + Λ − Z_gᵀW_gZ_g,
 * which rearranges to e_g = Y_g − Z_g M_g⁻¹ (ZᵀWY − Z_gᵀW_gY_g). Each group then costs one p × p
 * Cholesky instead of an n_g × n_g solve. M_g and the right-hand side are built as sums over the
 * other groups (prefix plus suffix sums), never by subtraction, and the rearranged form does not
 * pass through the full-fit residual r_g, whose rounding error (I − H_gg)⁻¹ would amplify when
 * one group carries most of the weight.
 */
export function groupedLooPath(
  Z: Float64Array,
  Y: Float64Array,
  w: Float64Array,
  n: number,
  p: number,
  lambdas: readonly number[],
  groups: Int32Array,
  unpenalised: readonly number[],
): Float64Array[] {
  return groupedLooPathWithGram(Z, Y, w, n, p, lambdas, groups, unpenalised).residuals;
}

/**
 * `groupedLooPath` that also returns the full-data ZᵀWZ (p × p) and ZᵀWY (p × 2) it built on the
 * way, so that a fit with the same weights (`ridgeFitFromGram`) need not recompute them.
 */
export function groupedLooPathWithGram(
  Z: Float64Array,
  Y: Float64Array,
  w: Float64Array,
  n: number,
  p: number,
  lambdas: readonly number[],
  groups: Int32Array,
  unpenalised: readonly number[],
): { residuals: Float64Array[]; gram: Float64Array; cross: Float64Array } {
  checkDesign('groupedLooResiduals', Z, Y, w, n, p);
  for (const lambda of lambdas) {
    if (!(Number.isFinite(lambda) && lambda >= 0)) throw new RangeError(`groupedLooResiduals: invalid λ ${lambda}`);
  }
  const mask = penaltyMask(p, unpenalised);
  const { labels, rows } = indexGroups(groups, n);
  const G = rows.length;
  const pp = p * p;
  const pc = p * OUTPUTS;
  if (G * pp > MAX_GRAM_ENTRIES) {
    throw new RangeError(`groupedLooResiduals: ${G} groups × ${p}² Gram entries exceed the memory guard`);
  }

  const gram = new Float64Array(G * pp);
  const cross = new Float64Array(G * pc);
  for (let g = 0; g < G; g++) {
    gram.set(weightedGram(Z, w, n, p, rows[g]), g * pp);
    cross.set(weightedCross(Z, Y, w, n, p, rows[g]), g * pc);
  }
  const totalGram = new Float64Array(pp);
  const totalCross = new Float64Array(pc);
  for (let g = 0; g < G; g++) {
    for (let k = 0; k < pp; k++) totalGram[k] = (totalGram[k] as number) + (gram[g * pp + k] as number);
    for (let k = 0; k < pc; k++) totalCross[k] = (totalCross[k] as number) + (cross[g * pc + k] as number);
  }
  complementsInPlace(gram, G, pp);
  complementsInPlace(cross, G, pc);

  const out: Float64Array[] = [];
  const M = new Float64Array(pp);
  const L = new Float64Array(pp);
  for (let li = 0; li < lambdas.length; li++) {
    const lambda = lambdas[li] as number;
    const e = new Float64Array(n * OUTPUTS);
    for (let g = 0; g < G; g++) {
      M.set(gram.subarray(g * pp, (g + 1) * pp));
      for (let j = 0; j < p; j++) M[j * p + j] = (M[j * p + j] as number) + lambda * (mask[j] as number);
      try {
        cholesky(M, p, L);
      } catch (err) {
        if (err instanceof SingularMatrixError) {
          throw new SingularMatrixError(
            `groupedLooResiduals: leaving out group ${labels[g]} leaves a singular system at λ = ${lambda}`,
          );
        }
        throw err;
      }
      const B = choleskySolve(L, p, cross.subarray(g * pc, (g + 1) * pc), OUTPUTS);
      residualsInto(Z, Y, p, B, rows[g] as Int32Array, e);
    }
    out.push(e);
  }
  return { residuals: out, gram: totalGram, cross: totalCross };
}

// e_i = Y_i − z_i·B for the listed rows. A small function of its own, so that V8 optimises this
// hot loop after a few calls instead of waiting for on-stack replacement in its caller.
function residualsInto(Z: Float64Array, Y: Float64Array, p: number, B: Float64Array, rows: Int32Array, e: Float64Array): void {
  for (let r = 0; r < rows.length; r++) {
    const i = rows[r] as number;
    let x = 0;
    let y = 0;
    const zi = i * p;
    for (let a = 0; a < p; a++) {
      const z = Z[zi + a] as number;
      x += z * (B[a * OUTPUTS] as number);
      y += z * (B[a * OUTPUTS + 1] as number);
    }
    e[i * OUTPUTS] = (Y[i * OUTPUTS] as number) - x;
    e[i * OUTPUTS + 1] = (Y[i * OUTPUTS + 1] as number) - y;
  }
}

/** Out-of-fold predictions OOF = Y − e from leave-group-out residuals e (both n × 2). */
export function oofFromResiduals(Y: Float64Array, e: Float64Array): Float64Array {
  if (Y.length !== e.length) throw new RangeError('oofFromResiduals: length mismatch');
  const oof = new Float64Array(Y.length);
  for (let i = 0; i < Y.length; i++) oof[i] = (Y[i] as number) - (e[i] as number);
  return oof;
}

export interface CvScoreOptions {
  /** Rows to score (truthy entries); every row by default. */
  score?: ArrayLike<number | boolean> | null;
  /** Fixation rows (truthy entries). Only groups that contain one are averaged; all by default. */
  fixation?: ArrayLike<number | boolean> | null;
  /** Name of a group label in `perGroupMedianDeg`; the label as a string by default. */
  groupName?: (label: number) => string;
  /** Stored unchanged in the report; 1 by default. */
  coverage?: number;
}

/**
 * The §4.8.3 CV score of out-of-fold predictions `oof` (n × 2) against `Y`: per scored row
 * err_i = ang(OOF_i, Y_i); per group m_g = median of err over its scored rows; meanDeg = mean of
 * m_g and seDeg = sd(m_g)/√G over the G groups that contain fixation rows (and at least one scored
 * row). `perGroupMedianDeg`, `nRows` and `nGroups` describe exactly those groups. With no such
 * group the mean is NaN; with one, the SE is NaN. A non-finite angular error throws.
 */
export function cvScore(
  oof: Float64Array,
  Y: Float64Array,
  n: number,
  groups: Int32Array,
  ang: AngularError,
  opts: CvScoreOptions = {},
): CvReport {
  if (oof.length !== n * OUTPUTS || Y.length !== n * OUTPUTS || groups.length !== n) {
    throw new RangeError('cvScore: dimension mismatch');
  }
  const { score = null, fixation = null, groupName = (g: number) => String(g), coverage = 1 } = opts;
  const slotOf = new Map<number, number>();
  const slotLabels: number[] = [];
  const slot = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const g = groups[i] as number;
    let s = slotOf.get(g);
    if (s === undefined) {
      s = slotLabels.length;
      slotOf.set(g, s);
      slotLabels.push(g);
    }
    slot[i] = s;
  }
  const S = slotLabels.length;
  const hasFixation = new Uint8Array(S);
  const counts = new Int32Array(S + 1);
  for (let i = 0; i < n; i++) {
    if (!fixation || fixation[i]) hasFixation[slot[i] as number] = 1;
    if (!score || score[i]) counts[(slot[i] as number) + 1] = (counts[(slot[i] as number) + 1] as number) + 1;
  }
  for (let s = 0; s < S; s++) counts[s + 1] = (counts[s + 1] as number) + (counts[s] as number);
  // Errors grouped contiguously by slot: errs[counts[s] … counts[s + 1]).
  const errs = new Float64Array(counts[S] as number);
  const fill = counts.slice(0, S);
  const a: [number, number] = [0, 0];
  const b: [number, number] = [0, 0];
  for (let i = 0; i < n; i++) {
    if (score && !score[i]) continue;
    a[0] = oof[i * OUTPUTS] as number;
    a[1] = oof[i * OUTPUTS + 1] as number;
    b[0] = Y[i * OUTPUTS] as number;
    b[1] = Y[i * OUTPUTS + 1] as number;
    const e = ang(a, b);
    if (!Number.isFinite(e)) throw new RangeError(`cvScore: non-finite angular error at row ${i}`);
    const s = slot[i] as number;
    errs[fill[s] as number] = e;
    fill[s] = (fill[s] as number) + 1;
  }
  const labels: number[] = [];
  const medians: number[] = [];
  const perGroupMedianDeg: Record<string, number> = {};
  let nRows = 0;
  const order = [...slotLabels.keys()].sort((x, y) => (slotLabels[x] as number) - (slotLabels[y] as number));
  for (const s of order) {
    const lo = counts[s] as number;
    const hi = counts[s + 1] as number;
    if (!hasFixation[s] || hi === lo) continue;
    const g = slotLabels[s] as number;
    const m = median(errs.subarray(lo, hi));
    const name = groupName(g);
    // Own properties only: `in` would see Object.prototype, and plain assignment cannot create a
    // key named "__proto__".
    if (Object.hasOwn(perGroupMedianDeg, name)) throw new RangeError(`cvScore: two groups are both named ${name}`);
    Object.defineProperty(perGroupMedianDeg, name, { value: m, enumerable: true, writable: true, configurable: true });
    labels.push(g);
    medians.push(m);
    nRows += hi - lo;
  }
  const G = labels.length;
  return {
    meanDeg: mean(medians),
    seDeg: sampleSd(medians) / Math.sqrt(G),
    perGroupMedianDeg,
    nRows,
    nGroups: G,
    coverage,
  };
}
