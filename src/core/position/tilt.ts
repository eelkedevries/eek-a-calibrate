// The phone tilt check's maths (design §3.1, §3.9; spec §17.5.4), DOM-free. Device motion
// reports gravity in the device frame (W3C: +x right, +y up along the screen, +z out of the
// screen; a phone lying screen-up reads (0, 0, +9.8)). From it:
//   θ    = acos(g_z / |g|)  the upright angle: 0 lying flat, 90 vertical, above 90 leaning in;
//   roll = atan2(g_x, g_y)  the in-plane rotation, corrected by screen.orientation.angle.
// Gravity, not DeviceOrientation β, because β loses a degree of freedom at exactly upright
// (gimbal lock). The design writes θ with |g_z|, which folds "leaning in" onto "tilted back";
// the signed form keeps the two apart so that "Tilt the phone back slightly" (θ > 105°) can fire.
import { HAND_HELD_VARIANCE, SMOOTHING } from './thresholds.ts';

const DEG = 180 / Math.PI;

export type Vec3 = readonly [number, number, number];

/** Wraps an angle to (−180, 180]. */
export function wrap180(deg: number): number {
  const a = ((((deg + 180) % 360) + 360) % 360) - 180;
  return a === -180 ? 180 : a;
}

/**
 * θ and the in-plane roll from a gravity reading. The roll is measured from the screen's own
 * "up" for the current orientation: a phone turned to landscape (angle 90) reads 0 when it is
 * held level in landscape. Returns NaN for a zero or non-finite vector.
 */
export function tiltFromGravity(g: Vec3, screenAngleDeg = 0): { tiltDeg: number; rollDeg: number } {
  const [x, y, z] = g;
  const n = Math.hypot(x, y, z);
  if (!(n > 1e-6) || !Number.isFinite(n)) return { tiltDeg: Number.NaN, rollDeg: Number.NaN };
  const c = Math.min(1, Math.max(-1, z / n));
  const tiltDeg = Math.acos(c) * DEG;
  // Lying (nearly) flat, the roll is undefined; report 0 rather than noise.
  const rollDeg = Math.hypot(x, y) < 1e-3 * n ? 0 : wrap180(Math.atan2(x, y) * DEG - screenAngleDeg);
  return { tiltDeg, rollDeg };
}

/**
 * Gravity (unit, device frame) from DeviceOrientationEvent's β and γ, the fallback where
 * device motion is unavailable: the earth's up vector seen through R = Rz(α)·Rx(β)·Ry(γ).
 * α does not enter. β = 90 (upright) gives (0, 1, 0) without any gimbal problem.
 */
export function gravityFromOrientation(betaDeg: number, gammaDeg: number): Vec3 {
  const b = betaDeg / DEG;
  const c = gammaDeg / DEG;
  return [-Math.sin(c) * Math.cos(b), Math.sin(b), Math.cos(c) * Math.cos(b)];
}

/** The rotation rate's magnitude (°/s) from DeviceMotionEvent.rotationRate. */
export function rotationMagnitude(alpha: number | null, beta: number | null, gamma: number | null): number {
  const v = [alpha, beta, gamma].map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0));
  return Math.hypot(v[0]!, v[1]!, v[2]!);
}

/**
 * A first-order low-pass on a 3-vector with time constant `tauMs` (design §3.1: 300 ms), driven
 * by the readings' own timestamps so that an irregular event rate does not change the filter.
 */
export class LowPass3 {
  private value: [number, number, number] | null = null;
  private lastMs = Number.NaN;
  private readonly tauMs: number;

  constructor(tauMs: number = SMOOTHING.tiltMs) {
    this.tauMs = tauMs;
  }

  push(tMs: number, v: Vec3): Vec3 {
    if (!v.every(Number.isFinite)) return this.value ?? [Number.NaN, Number.NaN, Number.NaN];
    if (this.value === null || !Number.isFinite(this.lastMs) || tMs <= this.lastMs) {
      this.value = [v[0], v[1], v[2]];
    } else {
      const a = 1 - Math.exp(-(tMs - this.lastMs) / this.tauMs);
      this.value = [this.value[0] + a * (v[0] - this.value[0]), this.value[1] + a * (v[1] - this.value[1]), this.value[2] + a * (v[2] - this.value[2])];
    }
    this.lastMs = tMs;
    return this.value;
  }

  get current(): Vec3 | null {
    return this.value;
  }

  reset(): void {
    this.value = null;
    this.lastMs = Number.NaN;
  }
}

/**
 * Steadiness from the rotation rate: the magnitude over the last `speedMs` (the "Hold the phone
 * steady" cue, design §3.2) and the variance over the last `windowMs` (the once-only hand-held
 * tip when Propped was chosen, design §3.9).
 */
export class SteadinessMeter {
  private readonly samples: { t: number; a: number; b: number; g: number }[] = [];
  private readonly windowMs: number;
  private readonly speedMs: number;

  constructor(windowMs: number = SMOOTHING.handHeldMs, speedMs: number = SMOOTHING.speedMs) {
    this.windowMs = windowMs;
    this.speedMs = speedMs;
  }

  push(tMs: number, alpha: number | null, beta: number | null, gamma: number | null): void {
    const f = (x: number | null) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
    this.samples.push({ t: tMs, a: f(alpha), b: f(beta), g: f(gamma) });
    while (this.samples.length > 0 && this.samples[0]!.t < tMs - this.windowMs) this.samples.shift();
  }

  /** Mean rotation-rate magnitude over the last speedMs (°/s); NaN without readings. */
  rateDegS(nowMs: number): number {
    const recent = this.samples.filter((s) => s.t >= nowMs - this.speedMs);
    if (recent.length === 0) return Number.NaN;
    return recent.reduce((sum, s) => sum + Math.hypot(s.a, s.b, s.g), 0) / recent.length;
  }

  /** The summed per-axis variance over the window ((°/s)²); NaN with fewer than 5 readings or under 1.5 s. */
  variance(): number {
    const s = this.samples;
    if (s.length < 5 || s[s.length - 1]!.t - s[0]!.t < 0.75 * this.windowMs) return Number.NaN;
    let total = 0;
    for (const key of ['a', 'b', 'g'] as const) {
      const mean = s.reduce((sum, x) => sum + x[key], 0) / s.length;
      total += s.reduce((sum, x) => sum + (x[key] - mean) ** 2, 0) / s.length;
    }
    return total;
  }

  handHeld(threshold = HAND_HELD_VARIANCE): boolean {
    const v = this.variance();
    return Number.isFinite(v) && v > threshold;
  }

  reset(): void {
    this.samples.length = 0;
  }
}

/** One processed device-motion reading. */
export interface MotionReading {
  /** performance.now() domain (the event's timeStamp), like the frames' capture times. */
  tMs: number;
  tiltDeg: number;
  rollDeg: number;
  /** Rotation-rate magnitude over the last 300 ms (°/s); NaN from the orientation fallback. */
  rotationDegS: number;
  handHeld: boolean;
  source: 'motion' | 'orientation';
}

/** The reading nearest `tMs` within `maxGapMs`, or null (readings in time order). */
export function nearestReading<T extends { tMs: number }>(readings: readonly T[], tMs: number, maxGapMs = 500): T | null {
  if (readings.length === 0 || !Number.isFinite(tMs)) return null;
  let lo = 0;
  let hi = readings.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (readings[mid]!.tMs < tMs) lo = mid + 1;
    else hi = mid;
  }
  let best = readings[lo]!;
  const before = readings[lo - 1];
  if (before && Math.abs(before.tMs - tMs) <= Math.abs(best.tMs - tMs)) best = before;
  return Math.abs(best.tMs - tMs) <= maxGapMs ? best : null;
}
