// Pursuit lag τ (specification §4.8.6): the delay of gaze behind the pursuit target, chosen once
// per session from the provisional fixation-only mapping and shared by every engine.
import { LAG } from '../constants.ts';
import { angularSeparationDeg } from '../geometry/angles.ts';
import { weightedMedian } from '../maths/stats.ts';
import type { Vec2 } from '../types.ts';

/** τ ∈ {0, 33, …} ms up to LAG.maxMs. */
export function lagGridMs(): number[] {
  const out: number[] = [];
  for (let t = LAG.minMs; t <= LAG.maxMs; t += LAG.stepMs) out.push(t);
  return out;
}

export interface LagSample {
  /** The provisional prediction for this frame, degrees. */
  predDeg: Vec2;
  weight: number;
  /** The target direction, degrees, at this frame's capture time minus `lagMs`. */
  targetDegAt(lagMs: number): Vec2;
}

export interface LagEstimate {
  lagMs: number;
  source: 'fit' | 'fallback';
  /** Why the fallback was used, when it was. */
  reason: string | null;
  /** Weighted median angular error at each τ of the grid (empty for the fallback). */
  curve: { lagMs: number; medianDeg: number }[];
}

/**
 * For each τ of the grid, the weighted median of ang(prediction, target(t − τ)); the minimising τ
 * (the smaller on a tie), clamped to [LAG.clampMin, LAG.clampMax]. When fewer than
 * LAG.minPursuitAccept of the pursuit frames were accepted, or no τ gives a finite error,
 * τ = LAG.fallbackMs.
 */
export function estimatePursuitLag(samples: readonly LagSample[], acceptedFraction: number): LagEstimate {
  const fallback = (reason: string): LagEstimate => ({ lagMs: LAG.fallbackMs, source: 'fallback', reason, curve: [] });
  if (!(acceptedFraction >= LAG.minPursuitAccept)) {
    return fallback(`only ${Math.round(100 * (Number.isFinite(acceptedFraction) ? acceptedFraction : 0))} % of the pursuit frames were accepted`);
  }
  const usable = samples.filter((s) => s.weight > 0 && Number.isFinite(s.predDeg[0]) && Number.isFinite(s.predDeg[1]));
  if (usable.length === 0) return fallback('no pursuit frame had a provisional prediction');
  const curve = lagGridMs().map((lagMs) => {
    const errors = usable.map((s) => angularSeparationDeg(s.predDeg, s.targetDegAt(lagMs)));
    return { lagMs, medianDeg: weightedMedian(errors, usable.map((s) => s.weight)) };
  });
  let best: { lagMs: number; medianDeg: number } | null = null;
  for (const c of curve) if (Number.isFinite(c.medianDeg) && (best === null || c.medianDeg < best.medianDeg)) best = c;
  if (best === null) return fallback('no lag gave a finite error');
  return { lagMs: Math.min(LAG.clampMax, Math.max(LAG.clampMin, best.lagMs)), source: 'fit', reason: null, curve };
}
