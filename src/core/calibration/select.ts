// Auto selection (specification §4.9): a single engine, or Combined, chosen per person by grouped
// cross-validation on calibration data alone, with a human-readable reason. Validation is never
// used here.
import { SELECT } from '../constants.ts';
import { ENGINE_IDS, ENGINE_RANK } from '../types.ts';
import type { CvReport, EngineId, EstimatorId, Selection } from '../types.ts';

/** Names used in the selection reason (British English; the UI shows the engines' full names elsewhere). */
export const ESTIMATOR_NAMES: Readonly<Record<EstimatorId, string>> = {
  blazegaze: 'BlazeGaze',
  peekr: 'Peekr',
  geometric: 'Geometric',
  eyepixel: 'Eye-pixel (WebGazer method)',
  combined: 'Combined',
};


/** Ranking order: finite meanDeg ascending, then a-priori rank (Combined after the engines on a tie). */
function rankOf(e: EstimatorId): number {
  return e === 'combined' ? ENGINE_IDS.length + 1 : ENGINE_RANK[e];
}

/**
 * 1. `best` is the single engine with the lowest meanDeg; among the singles within one SE of it
 *    (meanDeg ≤ best.meanDeg + best.seDeg), the one with the better a-priori rank is preferred.
 * 2. Combined is chosen iff combined.meanDeg ≤ SELECT.combinedGain × best.meanDeg.
 * Engines without a finite meanDeg are listed last and never chosen. Throws when no engine has a
 * finite CV error. `degreesApproximate` (assumed geometry) writes the degrees of the reason with
 * "≈" (§14.1.4).
 */
export function selectEstimator(fits: Partial<Record<EngineId, { cv: CvReport }>>, combined: { cv: CvReport } | null, degreesApproximate = false): Selection {
  const deg = (v: number): string => `${degreesApproximate ? '≈' : ''}${v.toFixed(2)}°`;
  const singles = ENGINE_IDS.filter((e) => fits[e] !== undefined).map((e) => ({ estimator: e as EstimatorId, cv: (fits[e] as { cv: CvReport }).cv }));
  const all = combined ? [...singles, { estimator: 'combined' as EstimatorId, cv: combined.cv }] : singles;
  const ranking = all
    .map((s) => ({ estimator: s.estimator, meanDeg: s.cv.meanDeg, seDeg: s.cv.seDeg }))
    .sort((a, b) => {
      const fa = Number.isFinite(a.meanDeg);
      const fb = Number.isFinite(b.meanDeg);
      if (fa !== fb) return fa ? -1 : 1;
      return (fa ? a.meanDeg - b.meanDeg : 0) || rankOf(a.estimator) - rankOf(b.estimator);
    });

  const finite = singles.filter((s) => Number.isFinite(s.cv.meanDeg));
  if (finite.length === 0) throw new RangeError('selectEstimator: no engine has a finite cross-validated error');
  const best = finite.reduce((a, b) => (b.cv.meanDeg < a.cv.meanDeg || (b.cv.meanDeg === a.cv.meanDeg && ENGINE_RANK[b.estimator as EngineId] < ENGINE_RANK[a.estimator as EngineId]) ? b : a));
  const limit = best.cv.meanDeg + (Number.isFinite(best.cv.seDeg) ? best.cv.seDeg : 0);
  const preferred = finite.filter((s) => s.cv.meanDeg <= limit).reduce((a, b) => (ENGINE_RANK[b.estimator as EngineId] < ENGINE_RANK[a.estimator as EngineId] ? b : a));

  const bestName = ESTIMATOR_NAMES[best.estimator];
  const combinedMean = combined?.cv.meanDeg ?? Number.NaN;
  if (combined && Number.isFinite(combinedMean) && combinedMean <= SELECT.combinedGain * best.cv.meanDeg) {
    return {
      estimator: 'combined',
      reason: `Combined: its cross-validated error (${deg(combinedMean)}) is at least ${Math.round(100 * (1 - SELECT.combinedGain))} % lower than that of the best single engine, ${bestName} (${deg(best.cv.meanDeg)}).`,
      ranking,
    };
  }
  const combinedNote = !combined
    ? 'Combined could not be formed.'
    : Number.isFinite(combinedMean)
      ? `Combined (${deg(combinedMean)}) is not at least ${Math.round(100 * (1 - SELECT.combinedGain))} % lower.`
      : 'Combined has no finite cross-validated error.';
  const name = ESTIMATOR_NAMES[preferred.estimator];
  const reason =
    preferred.estimator === best.estimator
      ? `${name}: the lowest cross-validated error (${deg(best.cv.meanDeg)}). ${combinedNote}`
      : `${name}: its cross-validated error (${deg(preferred.cv.meanDeg)}) is within one standard error (${deg(best.cv.seDeg)}) of the lowest, ${bestName} (${deg(best.cv.meanDeg)}), and it ranks higher a priori. ${combinedNote}`;
  return { estimator: preferred.estimator, reason, ranking };
}
