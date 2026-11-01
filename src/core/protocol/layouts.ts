// Target layouts (specification §4.7), in normalised layout coordinates: 0–1 across the safe
// rectangle, y down. `layoutToPx` (core/geometry/screen.ts) turns them into CSS px.
import type { Vec2 } from '../types.ts';

export interface LayoutPoint {
  readonly xNorm: number;
  readonly yNorm: number;
  /** Cross-validation group: `loc-<k>` for calibration locations, `val-<k>` for validation targets. */
  readonly groupId: string;
}

const GRID = [0.08, 0.5, 0.92] as const;
const INNER = [0.29, 0.71] as const;
/** Validation targets are jittered by up to this much on each axis (VAL12 only). */
export const VAL_JITTER = 0.02;

function point(xNorm: number, yNorm: number, groupId: string): LayoutPoint {
  return Object.freeze({ xNorm, yNorm, groupId });
}

/**
 * {0.08, 0.5, 0.92}² ∪ {0.29, 0.71}², numbered row by row: loc-0 … loc-8 are the outer grid
 * (loc-4 the centre), loc-9 … loc-12 the inner square.
 */
export const CAL13: readonly LayoutPoint[] = Object.freeze([
  ...GRID.flatMap((y, r) => GRID.map((x, c) => point(x, y, `loc-${r * 3 + c}`))),
  ...INNER.flatMap((y, r) => INNER.map((x, c) => point(x, y, `loc-${9 + r * 2 + c}`))),
]);

/** {0.08, 0.5, 0.92}²: the outer grid of CAL13, with the same group ids. */
export const CAL9: readonly LayoutPoint[] = Object.freeze(CAL13.slice(0, 9));

function cal13At(x: number, y: number): LayoutPoint {
  const p = CAL13.find((q) => q.xNorm === x && q.yNorm === y);
  if (!p) throw new Error(`(${x}, ${y}) is not a CAL13 location`);
  return p;
}

/** The centre and the inner square, sharing CAL13's group ids. */
export const HEAD5: readonly LayoutPoint[] = Object.freeze([
  cal13At(0.5, 0.5),
  cal13At(0.29, 0.29),
  cal13At(0.71, 0.29),
  cal13At(0.29, 0.71),
  cal13At(0.71, 0.71),
]);

/** Quick recalibration (§4.13): the centre ∪ {0.29, 0.71}², in the groups of the same CAL13 locations. */
export const RECAL5: readonly LayoutPoint[] = HEAD5;

const VAL_X = [0.15, 0.38, 0.62, 0.85] as const;
const VAL_Y = [0.15, 0.5, 0.85] as const;

/**
 * x ∈ {0.15, 0.38, 0.62, 0.85} × y ∈ {0.15, 0.5, 0.85}, row by row (val-0 … val-11), each
 * coordinate jittered uniformly within ±VAL_JITTER by `rand`, two draws per target in order.
 */
export function val12(rand: () => number): LayoutPoint[] {
  const out: LayoutPoint[] = [];
  for (const y of VAL_Y) {
    for (const x of VAL_X) {
      const jx = (2 * rand() - 1) * VAL_JITTER;
      const jy = (2 * rand() - 1) * VAL_JITTER;
      out.push(point(x + jx, y + jy, `val-${out.length}`));
    }
  }
  return out;
}

/** The six Quick validation targets (not jittered). */
export const VAL6: readonly LayoutPoint[] = Object.freeze(
  ([[0.15, 0.15], [0.85, 0.15], [0.38, 0.5], [0.62, 0.5], [0.15, 0.85], [0.85, 0.85]] as const).map(([x, y], k) => point(x, y, `val-${k}`)),
);

/**
 * The group of the CAL13 location nearest to a layout point (pursuit frames, §4.7). Distances are
 * measured in screen units, the normalised coordinates scaled by the safe rectangle's width and
 * height (`sx`, `sy`), so the choice is the nearest location on the screen; ties go to the lower k.
 */
export function nearestCalibrationGroup(p: Vec2, sx = 1, sy = 1): string {
  let best = CAL13[0] as LayoutPoint;
  let bestD = Infinity;
  for (const q of CAL13) {
    const d = ((p[0] - q.xNorm) * sx) ** 2 + ((p[1] - q.yNorm) * sy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best.groupId;
}

/** The CAL13 location with this group id, or null. */
export function calibrationLocation(groupId: string): LayoutPoint | null {
  return CAL13.find((q) => q.groupId === groupId) ?? null;
}
