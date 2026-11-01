// WP3: paired per-target differences with the Wilcoxon signed-rank test and the single-session caveat.
import assert from 'node:assert/strict';
import test from 'node:test';
import { allPairedDifferences, pairedDifferences, SINGLE_SESSION_CAVEAT } from '../../src/core/metrics/compare.ts';
import { wilcoxonSignedRank } from '../../src/core/maths/wilcoxon.ts';
import type { EstimatorId, TargetMetrics, ValidationReport } from '../../src/core/types.ts';

function report(estimator: EstimatorId, accuracies: number[], mode: 'own' | 'intersection' = 'own'): ValidationReport {
  const targets = accuracies.map(
    (accuracyDeg, k): TargetMetrics => ({
      itemId: `val-${k}`, targetPx: [0, 0], region: 'peripheral',
      funnel: { expected: 30, delivered: 30, processed: 30, face: 30, open: 30, inRange: 30, valid: 30 }, dataLossPct: 0,
      accuracyDeg, medianErrorDeg: accuracyDeg, offsetDeg: [0, 0], accuracyPx: 0, rmsS2SDeg: 0, sdDeg: 0, bcea68Deg2: 0,
    }),
  );
  return {
    estimator, mode, targets, accuracyMeanDeg: 0, accuracyMedianDeg: 0, accuracyP90Deg: 0, accuracyCentralDeg: 0, accuracyPeripheralDeg: 0,
    rmsS2SDeg: 0, sdDeg: 0, bcea68Deg2: 0, dataLossPct: 0, samplingHz: 30, latencyMs: 0, baselineDeg: 10, trackingGain: 5,
    accuracyPctDiag: 2, aoiGrid: 3, verdict: 'good', degreesApproximate: false,
  };
}

test('per-target differences a − b, matched by item id, with the exact Wilcoxon test', () => {
  const a = report('blazegaze', [2.0, 2.5, 3.1, 1.8, 2.2, 4.0, 2.9, 3.3, 2.1, 2.6, 3.0, 2.4]);
  const b = report('geometric', [3.1, 3.0, 3.9, 2.5, 2.0, 4.8, 3.6, 3.9, 3.3, 3.5, 3.4, 3.2]);
  const p = pairedDifferences(a, b);
  assert.equal(p.a, 'blazegaze');
  assert.equal(p.b, 'geometric');
  assert.equal(p.targets.length, 12);
  const diffs = a.targets.map((t, k) => t.accuracyDeg - (b.targets[k] as TargetMetrics).accuracyDeg);
  assert.deepEqual(p.targets.map((t) => t.diffDeg), diffs);
  assert.deepEqual(p.wilcoxon, wilcoxonSignedRank(diffs));
  assert.equal(p.wilcoxon.statistic, 1, 'only the +0.2 difference is positive, and it has rank 1');
  assert.ok(p.wilcoxon.pValue < 0.01);
  assert.ok(p.medianDiffDeg < 0 && p.meanDiffDeg < 0);
});

test('targets without a finite accuracy on either side are left out', () => {
  const a = report('peekr', [1, Number.NaN, 2, 3]);
  const b = report('eyepixel', [2, 2, Number.NaN, 5]);
  const p = pairedDifferences(a, b);
  assert.deepEqual(p.targets.map((t) => t.itemId), ['val-0', 'val-3']);
  const empty = pairedDifferences(report('peekr', [Number.NaN]), report('eyepixel', [1]));
  assert.equal(empty.targets.length, 0);
  assert.ok(Number.isNaN(empty.wilcoxon.pValue));
});

test('the caveat: one session does not generalise; between-run variability about 4.6°, with its source', () => {
  const p = pairedDifferences(report('peekr', [1, 2]), report('eyepixel', [2, 3]));
  assert.equal(p.caveat, SINGLE_SESSION_CAVEAT);
  assert.match(SINGLE_SESSION_CAVEAT, /single session/);
  assert.match(SINGLE_SESSION_CAVEAT, /do not generalise/);
  assert.match(SINGLE_SESSION_CAVEAT, /4\.6°/);
  assert.match(SINGLE_SESSION_CAVEAT, /arXiv:2608\.11566/);
});

test('only reports of the same mode are paired', () => {
  assert.throws(() => pairedDifferences(report('peekr', [1]), report('eyepixel', [1], 'intersection')), RangeError);
  const all = allPairedDifferences([
    report('combined', [1, 2]), report('peekr', [2, 2]), report('eyepixel', [3, 2]),
    report('combined', [1, 2], 'intersection'), report('peekr', [2, 2], 'intersection'),
  ]);
  assert.deepEqual(all.map((p) => `${p.a}-${p.b}-${p.mode}`), ['combined-peekr-own', 'combined-eyepixel-own', 'peekr-eyepixel-own', 'combined-peekr-intersection']);
});
