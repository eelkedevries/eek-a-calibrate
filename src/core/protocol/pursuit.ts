// Smooth pursuit (specification §4.7 block B): after a hold at the start point the target follows
//   x = 0.5 + ax·sin(2π·r₀·t/T + φx),   y = 0.5 + ay·sin(2π·r₁·t/T + φy)
// for one period T (r = 2:3, a 2:3 Lissajous figure), in normalised layout coordinates.
import { PURSUIT } from '../constants.ts';
import { angularSeparationDeg, pxToDeg } from '../geometry/angles.ts';
import { layoutToPx, type LayoutGeometry } from '../geometry/screen.ts';
import type { PursuitItem, ScreenGeometry, Vec2 } from '../types.ts';

export const PURSUIT_RATIO: readonly [number, number] = [PURSUIT.ratio[0] as number, PURSUIT.ratio[1] as number];

export type PursuitPath = Pick<PursuitItem, 'periodMs' | 'ax' | 'ay' | 'phiX' | 'phiY'>;

/**
 * The target `motionMs` after motion starts. Before the start it is at the start point
 * (motionMs = 0), and after one period it is back there, since the path is closed.
 */
export function pursuitPoint(path: PursuitPath, motionMs: number): Vec2 {
  if (!(path.periodMs > 0)) throw new RangeError(`pursuitPoint: the period must be positive, got ${path.periodMs}`);
  const t = Math.min(Math.max(motionMs, 0), path.periodMs) / path.periodMs;
  return [
    0.5 + path.ax * Math.sin(2 * Math.PI * PURSUIT_RATIO[0] * t + path.phiX),
    0.5 + path.ay * Math.sin(2 * Math.PI * PURSUIT_RATIO[1] * t + path.phiY),
  ];
}

/** Where the target of a pursuit presentation was at time `tMs` (same clock as the onset). */
export function pursuitTargetAt(item: PursuitItem, onsetMs: number, tMs: number): Vec2 {
  return pursuitPoint(item, tMs - onsetMs - item.holdMs);
}

export type SpeedGeometry = LayoutGeometry & Pick<ScreenGeometry, 'pxPerMm'>;

/** Steps per period for the numerical peak speed: the path changes direction smoothly, so 4000 is ample. */
const SPEED_STEPS = 4000;

/**
 * Peak angular speed of the target along the path, °/s, for an eye at `distanceMm` on the
 * screen-centre normal: the largest exact angle between consecutive points of a fine time grid,
 * over the time step.
 */
export function peakAngularSpeedDegS(path: PursuitPath, g: SpeedGeometry, distanceMm: number): number {
  if (!(distanceMm > 0)) throw new RangeError(`peakAngularSpeedDegS: the distance must be positive, got ${distanceMm}`);
  const dtS = path.periodMs / SPEED_STEPS / 1000;
  const degAt = (k: number): Vec2 => {
    const p = pursuitPoint(path, (k * path.periodMs) / SPEED_STEPS);
    return pxToDeg(layoutToPx(p[0], p[1], g), g, distanceMm);
  };
  let prev = degAt(0);
  let peak = 0;
  for (let k = 1; k <= SPEED_STEPS; k++) {
    const next = degAt(k);
    peak = Math.max(peak, angularSeparationDeg(prev, next) / dtS);
    prev = next;
  }
  return peak;
}

/**
 * The period of the default path (T = 16 s), lengthened in proportion when the geometry predicts
 * a peak angular speed above PURSUIT.maxSpeedDegS. Speed along a fixed path scales as 1/T, so the
 * proportional period meets the limit exactly. Real time: the e2e speed factor is applied after.
 */
export function pursuitPeriodMs(g: SpeedGeometry, distanceMm: number, maxSpeedDegS: number = PURSUIT.maxSpeedDegS): number {
  const base: PursuitPath = { periodMs: PURSUIT.periodMs, ax: PURSUIT.ax, ay: PURSUIT.ay, phiX: PURSUIT.phiX, phiY: PURSUIT.phiY };
  const peak = peakAngularSpeedDegS(base, g, distanceMm);
  return peak > maxSpeedDegS ? (PURSUIT.periodMs * peak) / maxSpeedDegS : PURSUIT.periodMs;
}
