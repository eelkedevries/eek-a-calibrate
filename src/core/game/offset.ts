// The challenge as a quality check (spec §17.9.3, design §5.6). Each pop leaves the offset of the
// median filtered gaze over its last 400 ms from the bubble's centre. When the zones agree on a
// shift (at least three zones with pops, the resultant length of their mean offsets' directions at
// least 0.6, and the mean offset beyond a quarter of a zone), the next round is corrected for it.
//
// The gaze the offsets were measured on is already drift-corrected, so the correction is added to
// the one in use rather than put in its place (a drift check measures uncorrected gaze, §4.13), and
// it is not applied when the sum would pass the §4.13 limit.
import type { Vec2 } from '../types.ts';
import { OFFSET } from './params.ts';

export interface PopOffset {
  zone: number;
  offsetPx: Vec2;
}

export interface OffsetFinding {
  /** The mean of the zones' mean offsets, CSS px (gaze − bubble). */
  offsetPx: Vec2;
  /** Resultant length of the zones' offset directions, 0–1. */
  resultant: number;
  zones: number;
  /** The mean offset in zone widths and heights. */
  zoneFrac: number;
}

const finite = (v: Vec2): boolean => Number.isFinite(v[0]) && Number.isFinite(v[1]);

export function consistentOffset(pops: readonly PopOffset[], zoneSize: { w: number; h: number }): OffsetFinding | null {
  if (!(zoneSize.w > 0 && zoneSize.h > 0)) return null;
  const byZone = new Map<number, Vec2[]>();
  for (const p of pops) {
    if (!finite(p.offsetPx)) continue;
    const list = byZone.get(p.zone) ?? [];
    list.push(p.offsetPx);
    byZone.set(p.zone, list);
  }
  const means: Vec2[] = [...byZone.values()].map((list) => [list.reduce((s, v) => s + v[0], 0) / list.length, list.reduce((s, v) => s + v[1], 0) / list.length]);
  if (means.length < OFFSET.minZones) return null;
  let ux = 0;
  let uy = 0;
  let mx = 0;
  let my = 0;
  for (const m of means) {
    const len = Math.hypot(m[0], m[1]);
    // A zone without any shift points nowhere and so lowers the resultant.
    if (len > 0) {
      ux += m[0] / len;
      uy += m[1] / len;
    }
    mx += m[0];
    my += m[1];
  }
  const n = means.length;
  const resultant = Math.hypot(ux, uy) / n;
  const offsetPx: Vec2 = [mx / n, my / n];
  const zoneFrac = Math.hypot(offsetPx[0] / zoneSize.w, offsetPx[1] / zoneSize.h);
  if (resultant < OFFSET.minResultant || zoneFrac <= OFFSET.minZoneFrac) return null;
  return { offsetPx, resultant, zones: n, zoneFrac };
}

export interface Combined {
  applied: boolean;
  /** The correction in use after this (unchanged when not applied), added to θ. */
  correctionDeg: Vec2;
}

/**
 * Adds the correction for a measured offset o (gaze − target, degrees) to the correction in use:
 * c' = c − o. Not applied when |c'| would exceed `limitDeg` (§4.13: max(2°, 1.5 × accuracy)).
 */
export function addCorrection(currentDeg: Vec2 | null, offsetDeg: Vec2, limitDeg: number): Combined {
  const c: Vec2 = currentDeg ?? [0, 0];
  if (!finite(offsetDeg)) return { applied: false, correctionDeg: c };
  const next: Vec2 = [c[0] - offsetDeg[0], c[1] - offsetDeg[1]];
  if (Math.hypot(next[0], next[1]) > limitDeg) return { applied: false, correctionDeg: c };
  return { applied: true, correctionDeg: next };
}
