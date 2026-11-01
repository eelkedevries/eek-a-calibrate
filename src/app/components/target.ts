// The calibration target (specification §4.7): an "ABC" bullseye-plus-cross, a black disc of
// 0.6° with a background-coloured cross 0.12° thick and a black centre dot of 0.2°, and a ring
// that shrinks from 3° to 0.6° over the first 400 ms of the settle period (static under
// prefers-reduced-motion).
import { pxPerDegAtCentre } from '../../core/geometry/angles.ts';

export const TARGET_DEG = { disc: 0.6, cross: 0.12, dot: 0.2, ringStart: 3, ringEnd: 0.6 } as const;
/** The smallest disc drawn, and the disc used when the screen geometry is not known (§4.7). */
export const MIN_DISC_PX = 14;
export const UNKNOWN_DISC_PX = 24;
export const RING_SHRINK_MS = 400;

export interface TargetSizes {
  discPx: number;
  crossPx: number;
  dotPx: number;
  ringStartPx: number;
  ringEndPx: number;
}

/**
 * Sizes in CSS px. With measured geometry, degrees at the screen centre for `distanceMm`, the
 * disc no smaller than 14 px (the other parts keep their proportion to it). With assumed
 * geometry the disc is 24 px.
 */
export function targetSizes(geometryKnown: boolean, pxPerMm: number, distanceMm: number): TargetSizes {
  const disc = geometryKnown && pxPerMm > 0 && distanceMm > 0 ? Math.max(TARGET_DEG.disc * pxPerDegAtCentre(pxPerMm, distanceMm), MIN_DISC_PX) : UNKNOWN_DISC_PX;
  const perDeg = disc / TARGET_DEG.disc;
  return {
    discPx: disc,
    crossPx: TARGET_DEG.cross * perDeg,
    dotPx: TARGET_DEG.dot * perDeg,
    ringStartPx: TARGET_DEG.ringStart * perDeg,
    ringEndPx: TARGET_DEG.ringEnd * perDeg,
  };
}

/** The ring's diameter `elapsedMs` after onset: linear from 3° to 0.6° over 400 ms, then gone (null). */
export function ringDiameterPx(s: TargetSizes, elapsedMs: number, reducedMotion: boolean): number | null {
  if (reducedMotion || elapsedMs >= RING_SHRINK_MS) return null;
  const f = Math.max(0, elapsedMs) / RING_SHRINK_MS;
  return s.ringStartPx + (s.ringEndPx - s.ringStartPx) * f;
}

export interface TargetColours {
  fg: string;
  bg: string;
}

/** Draws the target centred on (x, y), in CSS px of a context already scaled for the pixel ratio. */
export function drawTarget(ctx: CanvasRenderingContext2D, x: number, y: number, s: TargetSizes, ring: number | null, c: TargetColours): void {
  if (ring !== null && ring > s.discPx) {
    ctx.beginPath();
    ctx.arc(x, y, ring / 2, 0, 2 * Math.PI);
    ctx.lineWidth = Math.max(2, s.crossPx);
    ctx.strokeStyle = c.fg;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, s.discPx / 2, 0, 2 * Math.PI);
  ctx.fillStyle = c.fg;
  ctx.fill();
  ctx.fillStyle = c.bg;
  const half = s.discPx / 2;
  ctx.fillRect(x - half, y - s.crossPx / 2, s.discPx, s.crossPx);
  ctx.fillRect(x - s.crossPx / 2, y - half, s.crossPx, s.discPx);
  ctx.beginPath();
  ctx.arc(x, y, s.dotPx / 2, 0, 2 * Math.PI);
  ctx.fillStyle = c.fg;
  ctx.fill();
}
