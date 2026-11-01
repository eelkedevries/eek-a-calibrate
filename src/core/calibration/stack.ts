// The Combined estimator (specification §4.9): per-axis convex stacking of the engines'
// out-of-fold predictions, evaluated by nested grouped cross-validation.
import { SELECT } from '../constants.ts';
import { angularSeparationDeg } from '../geometry/angles.ts';
import { cvScore } from '../maths/groupedLoo.ts';
import { normaliseWeights } from '../maths/standardise.ts';
import { stackFit, stackNestedOof } from '../maths/simplex.ts';
import { ENGINE_RANK } from '../types.ts';
import type { CombinedModel, CvReport, EngineId } from '../types.ts';
import type { Dataset } from './dataset.ts';

export interface MemberInput {
  engine: EngineId;
  /** Dataset row ids of the engine's training rows. */
  ids: readonly number[];
  /** Out-of-fold predictions, n × 2, aligned with `ids`. */
  oof: Float64Array;
  cv: CvReport;
}

/** Members (§4.9): engines with coverage ≥ SELECT.minCoverage of the accepted rows and a finite CV. */
export function combinedMembers(inputs: readonly MemberInput[]): MemberInput[] {
  return inputs
    .filter((m) => m.cv.coverage >= SELECT.minCoverage && Number.isFinite(m.cv.meanDeg))
    .sort((a, b) => ENGINE_RANK[a.engine] - ENGINE_RANK[b.engine]);
}

export interface CombinedFit {
  model: CombinedModel;
  /** Dataset row ids of the rows valid for every member. */
  ids: number[];
  oof: Float64Array;
}

/**
 * Stacks the members on the rows valid for all of them, with the base weights renormalised over
 * those rows: β on all of them is the model, and the nested CV (β refitted without each group)
 * gives `combined.cv`. Throws when there is no member, no shared row, or fewer than two groups
 * (the nested CV then has nothing to fit on).
 */
export function fitCombined(inputs: readonly MemberInput[], ds: Dataset, weights: ArrayLike<number>, nAccepted: number): CombinedFit {
  const members = combinedMembers(inputs);
  if (members.length === 0) throw new RangeError('no engine qualifies for Combined (coverage of at least 80 % and a finite CV error)');
  const positions = members.map((m) => new Map(m.ids.map((id, i) => [id, i])));
  const ids = (members[0] as MemberInput).ids.filter((id) => positions.every((p) => p.has(id)) && (weights[id] as number) > 0);
  if (ids.length === 0) throw new RangeError('the Combined members share no calibration row');
  const n = ids.length;
  const preds = members.map((m, e) => {
    const out = new Float64Array(n * 2);
    const pos = positions[e] as Map<number, number>;
    ids.forEach((id, i) => {
      const k = pos.get(id) as number;
      out[i * 2] = m.oof[k * 2] as number;
      out[i * 2 + 1] = m.oof[k * 2 + 1] as number;
    });
    return out;
  });
  const Y = new Float64Array(n * 2);
  ids.forEach((id, i) => {
    const t = ds.rows[id]!.targetDeg;
    Y[i * 2] = t[0];
    Y[i * 2 + 1] = t[1];
  });
  const w = normaliseWeights(ids.map((id) => weights[id] as number));
  const groups = Int32Array.from(ids, (id) => ds.group[id] as number);
  if (new Set(groups).size < 2) throw new RangeError('Combined needs calibration rows in at least two locations');
  const { wx, wy } = stackFit(preds, Y, w, n);
  const oof = stackNestedOof(preds, Y, w, n, groups);
  const cv = cvScore(oof, Y, n, groups, angularSeparationDeg, {
    fixation: Uint8Array.from(ids, (id) => ds.fixation[id] as number),
    groupName: (g) => ds.groupNames[g] as string,
    coverage: nAccepted > 0 ? n / nAccepted : 0,
  });
  const model: CombinedModel = { members: members.map((m) => m.engine), wx: {}, wy: {}, cv };
  members.forEach((m, e) => {
    model.wx[m.engine] = wx[e] as number;
    model.wy[m.engine] = wy[e] as number;
  });
  return { model, ids, oof };
}
