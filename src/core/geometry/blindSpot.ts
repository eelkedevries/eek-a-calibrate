// Blind-spot test, the virtual chinrest of Li et al. 2020 (specification §4.4): cover the right
// eye, fixate a square at (0.85·W, 0.5·H) with the left eye, and press Space when a dot moving
// left from the square disappears. D_bs = d / tan(13.5°), d the median square-to-dot distance.
import { BLIND_SPOT } from '../constants.ts';
import { median, sampleSd } from '../maths/stats.ts';
import type { Vec2 } from '../types.ts';
import { requirePositive } from './screen.ts';

const RAD = Math.PI / 180;
/** Distance assumed for the dot speed before the blind spot has been found (heuristic; spec v0.3 §4.4). */
export const BLIND_SPOT_ASSUMED_DISTANCE_MM = 600;

/** The dot starts at the square and moves in −x. */
export const BLIND_SPOT_DIRECTION = -1;

/** Centre of the fixation square in viewport CSS px. */
export function blindSpotSquarePx(viewportWpx: number, viewportHpx: number): Vec2 {
  return [0.85 * viewportWpx, 0.5 * viewportHpx];
}

/**
 * Dot speed in CSS px/s: 1.5°/s at the viewing distance (D·tan 1.5°·pxPerMm). Until the
 * distance is known, D = BLIND_SPOT_ASSUMED_DISTANCE_MM (specification v0.3, §4.4).
 */
export function dotSpeedPxPerS(pxPerMm: number, distanceMm: number | null): number {
  requirePositive('dotSpeedPxPerS: pxPerMm', pxPerMm);
  if (distanceMm === null) distanceMm = BLIND_SPOT_ASSUMED_DISTANCE_MM;
  requirePositive('dotSpeedPxPerS: distance', distanceMm);
  return distanceMm * Math.tan(BLIND_SPOT.dotSpeedDegS * RAD) * pxPerMm;
}

/** D_bs = d / tan(13.5°), d the square-to-dot distance in mm. */
export function blindSpotDistanceMm(offsetMm: number): number {
  return offsetMm / Math.tan(BLIND_SPOT.angleDeg * RAD);
}

export type BlindSpotReason = 'ok' | 'too-few-trials' | 'out-of-range' | 'inconsistent';

export interface BlindSpotAssessment {
  /** D_bs of each trial, mm, in trial order. */
  trialDistancesMm: number[];
  /** D_bs from the median offset, mm (NaN without trials). */
  distanceMm: number;
  /** Sample SD of the per-trial D_bs, mm (NaN with fewer than two trials). */
  sdMm: number;
  /** sdMm / distanceMm. */
  relSd: number;
  accepted: boolean;
  /** Why the result was rejected; the UI repeats the test once. */
  reason: BlindSpotReason;
}

/**
 * Scores the trials (square-to-dot offsets in CSS px). Accepted only with at least the five
 * trials of the protocol, 300 ≤ D_bs ≤ 1200 mm, and SD ≤ 15 % of D_bs. Non-finite offsets
 * throw: a trial either has a measured offset or is not a trial.
 */
export function assessBlindSpot(offsetsPx: readonly number[], pxPerMm: number): BlindSpotAssessment {
  requirePositive('assessBlindSpot: pxPerMm', pxPerMm);
  offsetsPx.forEach((v, i) => {
    if (!Number.isFinite(v)) throw new RangeError(`assessBlindSpot: non-finite offset at trial ${i}`);
  });
  const trialDistancesMm = offsetsPx.map((px) => blindSpotDistanceMm(px / pxPerMm));
  const distanceMm = trialDistancesMm.length === 0 ? Number.NaN : blindSpotDistanceMm(median(offsetsPx) / pxPerMm);
  const sdMm = sampleSd(trialDistancesMm);
  const relSd = sdMm / distanceMm;
  let reason: BlindSpotReason = 'ok';
  if (trialDistancesMm.length < BLIND_SPOT.trials) reason = 'too-few-trials';
  else if (!(distanceMm >= BLIND_SPOT.minMm && distanceMm <= BLIND_SPOT.maxMm)) reason = 'out-of-range';
  else if (!(sdMm <= BLIND_SPOT.maxRelSd * distanceMm)) reason = 'inconsistent';
  return { trialDistancesMm, distanceMm, sdMm, relSd, accepted: reason === 'ok', reason };
}
