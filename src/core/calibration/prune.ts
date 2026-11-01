// Engine-neutral pruning before any engine is fitted (specification §4.8.1). A pruned row is
// left out for every engine. The signals come from the geometric engine, which always runs.
import { PRUNE } from '../constants.ts';
import { angularSeparationDeg } from '../geometry/angles.ts';
import { ridgeFit, ridgeInverse, resolveLambda, withIntercept } from '../maths/ridge.ts';
import { fitFeatureTransform, normaliseWeights, transformRows } from '../maths/standardise.ts';
import { MAD_TO_SD, mad, median } from '../maths/stats.ts';
import type { MapperSpec, Vec2 } from '../types.ts';
import { buildDesign, targetMatrix, unitWeights, type CalibrationRow } from './dataset.ts';
import { mappingState, restoreMapping, type RestoredMapping } from './restore.ts';

/** λ_rel of the provisional fixation-only geo-linear fit. */
export const PROVISIONAL_LAMBDA_REL = 1e-2;
/** A unit needs this many rows before its median and MAD mean anything. */
const MIN_UNIT_ROWS = 3;

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/**
 * Fixation rows: within each location, z = (x − median)/(1.4826·MAD) of each primary column of
 * the geometric mapper `spec`; a row with any |z| > PRUNE.fixationZ is pruned. A column whose MAD
 * is 0 gives no scale and is skipped; a row without a geometric design row is kept. Clears
 * `keep[i]` of every pruned row and returns their count.
 */
export function pruneFixationRows(rows: readonly CalibrationRow[], spec: MapperSpec, keep: boolean[]): number {
  let pruned = 0;
  const fixation = rows.filter((r) => r.phase === 'fixation' && keep[r.id]);
  for (const group of groupBy(fixation, (r) => r.unit).values()) {
    const values = group
      .map((r) => {
        const f = r.frame.engines[spec.engine];
        const x = f ? spec.row(f, r.ctx) : null;
        return { r, x: x && spec.primary.every((j) => Number.isFinite(x[j] as number)) ? spec.primary.map((j) => x[j] as number) : null };
      })
      .filter((v): v is { r: CalibrationRow; x: number[] } => v.x !== null);
    if (values.length < MIN_UNIT_ROWS) continue;
    const drop = new Set<number>();
    spec.primary.forEach((_, c) => {
      const col = values.map((v) => v.x[c] as number);
      const m = median(col);
      const s = MAD_TO_SD * mad(col, m);
      if (!(s > 0)) return;
      for (const v of values) if (Math.abs(((v.x[c] as number) - m) / s) > PRUNE.fixationZ) drop.add(v.r.id);
    });
    for (const id of drop) {
      keep[id] = false;
      pruned++;
    }
  }
  return pruned;
}

export interface ProvisionalModel {
  mapping: RestoredMapping;
  /** θ (degrees) of a row's frame, or null when the geometric engine gave no design row. */
  predict(row: CalibrationRow): Vec2 | null;
}

/**
 * The provisional geo-linear on the kept fixation rows, at λ_rel = 1e-2 with the fixation unit
 * weights, through the same standardisation and prediction path as the final fits.
 */
export function fitProvisional(spec: MapperSpec, rows: readonly CalibrationRow[], keep: readonly boolean[], seed: number): ProvisionalModel {
  const fixationKeep = rows.map((r) => keep[r.id] === true && r.phase === 'fixation');
  const base = unitWeights(rows, fixationKeep);
  const design = buildDesign(spec, rows, base);
  if (design.n < 2) throw new RangeError(`the provisional ${spec.id} fit has only ${design.n} fixation rows`);
  const w = normaliseWeights(design.ids.map((id) => base[id] as number));
  const t = fitFeatureTransform(design.X, w, design.n, design.pIn, spec, seed);
  const Z = withIntercept(transformRows(t, design.X, design.n), design.n, t.pOut);
  const q = t.pOut + 1;
  const fit = ridgeFit(Z, targetMatrix(rows, design.ids), w, design.n, q, resolveLambda(PROVISIONAL_LAMBDA_REL, w), [0]);
  const mapping = restoreMapping(mappingState(spec, 'provisional', t, { lambdaRel: PROVISIONAL_LAMBDA_REL, B: fit.B, A: ridgeInverse(fit), h95: 1 }), spec);
  return {
    mapping,
    predict: (row) => mapping.predictFrame(row.frame.engines[spec.engine], row.ctx)?.deg ?? null,
  };
}

/**
 * Head and pursuit rows (§4.8.1): ρ = ang(provisional prediction, target); within each unit
 * (a head location, or the pursuit block), rows with ρ > median + PRUNE.residualMad·1.4826·MAD
 * are pruned. Units with fewer than three predictable rows, or a MAD of 0, are left alone, and so
 * are rows the provisional model cannot predict. Returns the number pruned.
 */
export function pruneByResidual(rows: readonly CalibrationRow[], phase: 'head' | 'pursuit', model: ProvisionalModel, keep: boolean[]): number {
  let pruned = 0;
  const candidates = rows.filter((r) => r.phase === phase && keep[r.id]);
  for (const unit of groupBy(candidates, (r) => r.unit).values()) {
    const scored = unit
      .map((r) => {
        const p = model.predict(r);
        return { r, rho: p ? angularSeparationDeg(p, r.targetDeg) : Number.NaN };
      })
      .filter((s) => Number.isFinite(s.rho));
    if (scored.length < MIN_UNIT_ROWS) continue;
    const rho = scored.map((s) => s.rho);
    const m = median(rho);
    const spread = MAD_TO_SD * mad(rho, m);
    if (!(spread > 0)) continue;
    for (const s of scored) {
      if (s.rho > m + PRUNE.residualMad * spread) {
        keep[s.r.id] = false;
        pruned++;
      }
    }
  }
  return pruned;
}
