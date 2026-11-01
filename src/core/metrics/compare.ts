// Paired engine differences within one session (specification §4.12): per-target accuracy
// differences with a Wilcoxon signed-rank test, and the caveat that one session does not
// generalise.
import { mean, median } from '../maths/stats.ts';
import { wilcoxonSignedRank, type WilcoxonResult } from '../maths/wilcoxon.ts';
import type { EstimatorId, ValidationReport } from '../types.ts';

/** Shown with every paired comparison. Source: Chen and Brat 2026, arXiv:2608.11566 [LIT §4, §7]. */
export const SINGLE_SESSION_CAVEAT =
  'These differences come from a single session and do not generalise to other sessions or people: ' +
  'between-run variability of webcam eye tracking can be about 4.6° (Chen and Brat 2026, arXiv:2608.11566).';

export interface PairedTarget {
  itemId: string;
  aDeg: number;
  bDeg: number;
  /** aDeg − bDeg: positive when `a` is less accurate on this target. */
  diffDeg: number;
}

export interface PairedDifferences {
  a: EstimatorId;
  b: EstimatorId;
  mode: 'own' | 'intersection';
  /** Targets on which both estimators have a finite accuracy, in `a`'s target order. */
  targets: PairedTarget[];
  meanDiffDeg: number;
  medianDiffDeg: number;
  wilcoxon: WilcoxonResult;
  caveat: string;
}

/** Compares two reports of the same mode, target by target (matched on item id). */
export function pairedDifferences(a: ValidationReport, b: ValidationReport): PairedDifferences {
  if (a.mode !== b.mode) throw new RangeError(`pairedDifferences: cannot pair a '${a.mode}' report with an '${b.mode}' report`);
  const bById = new Map(b.targets.map((t) => [t.itemId, t.accuracyDeg]));
  const targets: PairedTarget[] = [];
  for (const t of a.targets) {
    const bDeg = bById.get(t.itemId);
    if (bDeg === undefined || !Number.isFinite(bDeg) || !Number.isFinite(t.accuracyDeg)) continue;
    targets.push({ itemId: t.itemId, aDeg: t.accuracyDeg, bDeg, diffDeg: t.accuracyDeg - bDeg });
  }
  const diffs = targets.map((t) => t.diffDeg);
  return {
    a: a.estimator,
    b: b.estimator,
    mode: a.mode,
    targets,
    meanDiffDeg: mean(diffs),
    medianDiffDeg: median(diffs),
    wilcoxon: wilcoxonSignedRank(diffs),
    caveat: SINGLE_SESSION_CAVEAT,
  };
}

/** Every pair of reports with the same mode, in report order (a before b). */
export function allPairedDifferences(reports: readonly ValidationReport[]): PairedDifferences[] {
  const out: PairedDifferences[] = [];
  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      const a = reports[i] as ValidationReport;
      const b = reports[j] as ValidationReport;
      if (a.mode === b.mode) out.push(pairedDifferences(a, b));
    }
  }
  return out;
}
