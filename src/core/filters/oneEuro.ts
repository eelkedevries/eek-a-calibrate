// One Euro filter (Casiez, Roussel and Vogel, CHI 2012), ported from gaze-lite's
// `src/filters.ts` and run in degrees (specification §4.11). It smooths hard at low speed
// (steady fixations) and opens up at high speed (little lag on saccades). For display and the
// Live stream only: raw output is always stored and exported unfiltered.
import { ONE_EURO } from '../constants.ts';

export interface OneEuroOptions {
  /** Cutoff at zero speed, Hz. */
  minCutoffHz: number;
  /** Growth of the cutoff with speed, Hz per °/s. */
  betaPerDegS: number;
  /** Cutoff of the derivative's low-pass, Hz. */
  dCutoffHz: number;
  /** A gap longer than this between samples resets the filter, ms. */
  resetGapMs: number;
}

function smoothingAlpha(cutoffHz: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

class LowPass {
  private initialised = false;
  private value = 0;

  filter(x: number, alpha: number): number {
    if (!this.initialised) {
      this.initialised = true;
      this.value = x;
    } else {
      this.value = alpha * x + (1 - alpha) * this.value;
    }
    return this.value;
  }

  reset(): void {
    this.initialised = false;
  }
}

/**
 * Scalar One Euro filter. As in gaze-lite, the derivative uses the previous raw sample, and a
 * repeated timestamp is treated as one 30 Hz frame. A gap longer than `resetGapMs`, or a clock
 * that runs backwards, starts afresh: the first sample after a reset passes through unchanged.
 * Non-finite input throws, because it would poison the filter state.
 */
export class OneEuroFilter {
  private readonly options: OneEuroOptions;
  private readonly xFilter = new LowPass();
  private readonly dxFilter = new LowPass();
  private lastTimeMs: number | null = null;
  private lastRaw: number | null = null;

  constructor(options: OneEuroOptions = ONE_EURO) {
    this.options = options;
  }

  filter(x: number, timeMs: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(timeMs)) {
      throw new RangeError(`OneEuroFilter: non-finite sample (${x} at ${timeMs} ms)`);
    }
    const { minCutoffHz, betaPerDegS, dCutoffHz, resetGapMs } = this.options;
    if (this.lastTimeMs !== null && (timeMs - this.lastTimeMs > resetGapMs || timeMs < this.lastTimeMs)) this.reset();
    let dt = this.lastTimeMs === null ? 0 : (timeMs - this.lastTimeMs) / 1000;
    if (!(dt > 1e-6)) dt = 1 / 30;
    const dx = this.lastRaw === null ? 0 : (x - this.lastRaw) / dt;
    this.lastTimeMs = timeMs;
    this.lastRaw = x;

    const dxHat = this.dxFilter.filter(dx, smoothingAlpha(dCutoffHz, dt));
    const cutoff = minCutoffHz + betaPerDegS * Math.abs(dxHat);
    return this.xFilter.filter(x, smoothingAlpha(cutoff, dt));
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTimeMs = null;
    this.lastRaw = null;
  }
}

/** One Euro filter on (θx, θy) in degrees: independent per-axis state on a shared clock. */
export class OneEuroFilter2D {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(options: OneEuroOptions = ONE_EURO) {
    this.fx = new OneEuroFilter(options);
    this.fy = new OneEuroFilter(options);
  }

  filter(x: number, y: number, timeMs: number): [number, number] {
    if (!Number.isFinite(y)) throw new RangeError(`OneEuroFilter2D: non-finite sample (${x}, ${y})`);
    return [this.fx.filter(x, timeMs), this.fy.filter(y, timeMs)];
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
