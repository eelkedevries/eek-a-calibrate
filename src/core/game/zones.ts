// The challenge's zones (spec §17.7.2, design §2.12): a rectangular grid whose columns and rows
// are chosen separately. For each axis, the largest n ∈ {1, 2, 3, 4} whose smallest half-cell
// along that axis (halfCellDeg of §4.12, for one axis) is at least need = p75 of the per-target
// accuracy + 2 × RMS-S2S; 0 on an axis when even n = 1 fails or need is not finite. Portrait
// phones usually give 1 × n and landscape screens n × 1, because the long axis has room for more
// cells. The square aoiGrid of §4.12 is unchanged and stays the advice in Details → Results.
import type { PlaneGeometry } from '../geometry/angles.ts';
import { halfCellDegAxis } from '../metrics/aoi.ts';
import type { Vec2 } from '../types.ts';

export const ZONE_COUNTS = [4, 3, 2, 1] as const;

/** At least this many zones unlock the challenge. */
export const MIN_ZONES = 2;

export interface ZoneGrid {
  cols: number;
  rows: number;
  /** p75 accuracy + 2 × RMS-S2S, degrees (NaN when either is missing). */
  needDeg: number;
}

/** The largest n of ZONE_COUNTS whose half-cell along an extent covers `need`, else 0. */
function axisCount(need: number, extentPx: number, pxPerMm: number, distanceMm: number): number {
  if (!Number.isFinite(need)) return 0;
  for (const n of ZONE_COUNTS) {
    const half = halfCellDegAxis(n, extentPx, pxPerMm, distanceMm);
    if (Number.isFinite(half) && half >= need) return n;
  }
  return 0;
}

/** The zone grid for a Test round's p75 accuracy and RMS-S2S (degrees) on `screen` at `distanceMm`. */
export function zoneGrid(p75AccuracyDeg: number, rmsS2SDeg: number, screen: PlaneGeometry, distanceMm: number): ZoneGrid {
  const needDeg = p75AccuracyDeg + 2 * rmsS2SDeg;
  return {
    cols: axisCount(needDeg, screen.viewportWpx, screen.pxPerMm, distanceMm),
    rows: axisCount(needDeg, screen.viewportHpx, screen.pxPerMm, distanceMm),
    needDeg,
  };
}

export function zoneCount(grid: Pick<ZoneGrid, 'cols' | 'rows'>): number {
  return grid.cols * grid.rows;
}

/**
 * The zone [col, row] that holds a point of the viewport. The zones partition the screen up to
 * its edges, so a point just past an edge belongs to the edge zone; null when the grid is empty
 * or the point is not finite.
 */
export function zoneAt(p: Vec2, grid: Pick<ZoneGrid, 'cols' | 'rows'>, viewport: { w: number; h: number }): Vec2 | null {
  if (grid.cols < 1 || grid.rows < 1 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !(viewport.w > 0 && viewport.h > 0)) return null;
  const cell = (v: number, extent: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor((v / extent) * n)));
  return [cell(p[0], viewport.w, grid.cols), cell(p[1], viewport.h, grid.rows)];
}
