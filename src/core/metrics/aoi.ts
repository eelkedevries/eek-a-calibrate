// Areas-of-interest advice (specification §4.12): the largest n ∈ {2, 3, 4} for which an n × n
// grid of the viewport has a half-cell angular size of at least p75 accuracy + 2·RMS-S2S; 0 if
// none. Webcam data supports coarse areas only [LIT §6.9].
import { pxToDegAxis, type PlaneGeometry } from '../geometry/angles.ts';

export const AOI_GRIDS = [4, 3, 2] as const;
export type AoiGrid = 0 | 2 | 3 | 4;

/**
 * The smallest half-cell angular size of an n × n grid, in degrees: half the angle a cell
 * subtends along each axis, minimised over cells and axes. The outermost cells are the
 * smallest, because of foreshortening.
 */
export function halfCellDeg(n: number, screen: PlaneGeometry, distanceMm: number): number {
  if (!(Number.isInteger(n) && n >= 1)) throw new RangeError(`halfCellDeg: n must be a positive integer, got ${n}`);
  let smallest = Infinity;
  for (const extent of [screen.viewportWpx, screen.viewportHpx]) {
    for (let k = 0; k < n; k++) {
      const a = pxToDegAxis((k * extent) / n, extent, screen.pxPerMm, distanceMm);
      const b = pxToDegAxis(((k + 1) * extent) / n, extent, screen.pxPerMm, distanceMm);
      smallest = Math.min(smallest, (b - a) / 2);
    }
  }
  return smallest;
}

/** 0 when the requirement or the geometry is not a finite number. */
export function aoiGrid(p75AccuracyDeg: number, rmsS2SDeg: number, screen: PlaneGeometry, distanceMm: number): AoiGrid {
  const need = p75AccuracyDeg + 2 * rmsS2SDeg;
  if (!Number.isFinite(need)) return 0;
  for (const n of AOI_GRIDS) {
    const half = halfCellDeg(n, screen, distanceMm);
    if (Number.isFinite(half) && half >= need) return n;
  }
  return 0;
}
