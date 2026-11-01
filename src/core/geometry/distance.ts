// Focal length and viewing distance (specification §4.4). The visible iris diameter is taken as
// 11.7 mm; D_t = f_px · 11.7 / median₁ₛ(irisDiamPx) over open-eye frames.
import { DISTANCE } from '../constants.ts';
import { median } from '../maths/stats.ts';
import type { DistanceModel } from '../types.ts';
import { requirePositive } from './screen.ts';

const RAD = Math.PI / 180;

function positiveFinite(values: ArrayLike<number | null>): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

/** f_px = D_bs · p̄ / irisMm, with p̄ the median iris diameter in px over the 2 s capture. */
export function focalFromBlindSpot(blindSpotMm: number, irisMedianPx: number, irisMm: number = DISTANCE.irisMm): number {
  requirePositive('focalFromBlindSpot: blind-spot distance', blindSpotMm);
  requirePositive('focalFromBlindSpot: iris diameter', irisMedianPx);
  requirePositive('focalFromBlindSpot: iris size', irisMm);
  return (blindSpotMm * irisMedianPx) / irisMm;
}

/**
 * The same from the raw iris samples of the 2 s capture: non-finite and non-positive values
 * (frames without a usable iris) are ignored; a RangeError when none is left.
 */
export function focalFromIrisSamples(blindSpotMm: number, irisPx: ArrayLike<number>, irisMm: number = DISTANCE.irisMm): number {
  const usable = positiveFinite(irisPx);
  if (usable.length === 0) throw new RangeError('focalFromIrisSamples: no usable iris diameter');
  return focalFromBlindSpot(blindSpotMm, median(usable), irisMm);
}

/** Without the blind-spot test: f_px = (videoW/2) / tan(hfov/2), assuming a 60° field of view. */
export function focalFromAssumedFov(videoW: number, hfovDeg: number = DISTANCE.assumedHfovDeg): number {
  requirePositive('focalFromAssumedFov: video width', videoW);
  if (!(hfovDeg > 0 && hfovDeg < 180)) throw new RangeError(`focalFromAssumedFov: field of view must lie in (0, 180), got ${hfovDeg}`);
  return videoW / 2 / Math.tan((hfovDeg / 2) * RAD);
}

/** D = f_px · irisMm / irisPx in mm; NaN when the iris diameter is not a positive number. */
export function distanceFromIris(focalPx: number, irisPx: number, irisMm: number = DISTANCE.irisMm): number {
  if (!(Number.isFinite(irisPx) && irisPx > 0)) return Number.NaN;
  return (focalPx * irisMm) / irisPx;
}

/** D_ref: the median of D_t over accepted calibration frames; null when none has a distance. */
export function refDistanceMm(distances: ArrayLike<number | null>): number | null {
  const usable = positiveFinite(distances);
  return usable.length === 0 ? null : median(usable);
}

/** lnDistRatio_t = ln(D_t / D_ref). */
export function lnDistRatio(distanceMm: number, refMm: number): number {
  return Math.log(distanceMm / refMm);
}

/**
 * Per-frame viewing distance from a running median of the iris diameter over the last
 * `windowMs` (1000 ms) of frames with the eyes open. Frames with closed eyes, or without a
 * usable iris, do not enter the window but still advance the clock, so a long blink empties
 * it. Times must not decrease; call `reset()` at a new session or clock.
 */
export class DistanceTracker {
  readonly focalPx: number;
  readonly irisMm: number;
  readonly windowMs: number;
  private times: number[] = [];
  private iris: number[] = [];
  private lastMs = -Infinity;
  private last: number | null = null;

  constructor(model: Pick<DistanceModel, 'focalPx' | 'irisMm'>, windowMs: number = DISTANCE.medianWindowMs) {
    requirePositive('DistanceTracker: focal length', model.focalPx);
    requirePositive('DistanceTracker: iris size', model.irisMm);
    requirePositive('DistanceTracker: window', windowMs);
    this.focalPx = model.focalPx;
    this.irisMm = model.irisMm;
    this.windowMs = windowMs;
  }

  /** Adds one frame and returns D_t in mm, or null when the window holds no open-eye frame. */
  push(tMs: number, irisDiamPx: number, open: boolean): number | null {
    if (!Number.isFinite(tMs)) throw new RangeError(`DistanceTracker: non-finite time ${tMs}`);
    if (tMs < this.lastMs) throw new RangeError(`DistanceTracker: time went backwards (${tMs} after ${this.lastMs})`);
    this.lastMs = tMs;
    if (open && Number.isFinite(irisDiamPx) && irisDiamPx > 0) {
      this.times.push(tMs);
      this.iris.push(irisDiamPx);
    }
    let drop = 0;
    while (drop < this.times.length && (this.times[drop] as number) <= tMs - this.windowMs) drop++;
    if (drop > 0) {
      this.times.splice(0, drop);
      this.iris.splice(0, drop);
    }
    this.last = this.iris.length === 0 ? null : distanceFromIris(this.focalPx, median(this.iris), this.irisMm);
    return this.last;
  }

  /** D_t after the latest frame (null before the first open-eye frame, or after a long gap). */
  get distanceMm(): number | null {
    return this.last;
  }

  /** Frames currently inside the window. */
  get size(): number {
    return this.iris.length;
  }

  reset(): void {
    this.times = [];
    this.iris = [];
    this.lastMs = -Infinity;
    this.last = null;
  }
}
