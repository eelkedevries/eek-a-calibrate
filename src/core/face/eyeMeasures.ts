// Eye measures from the 478 landmarks and the blendshapes (spec §4.3).
import type { EyeMeasures, Vec2 } from '../types.ts';
import { eyesOpenRule } from './blink.ts';
import { blendshape, EAR4_L, EAR4_R, EAR6_L, EAR6_R, EYE_L, EYE_R, lmX, lmY } from './landmarkSets.ts';

/** Distance between two landmarks in video pixels (x scaled by the width, y by the height). */
export function distPx(lm: ArrayLike<number>, a: number, b: number, videoW: number, videoH: number): number {
  return Math.hypot((lmX(lm, a) - lmX(lm, b)) * videoW, (lmY(lm, a) - lmY(lm, b)) * videoH);
}

/** Distance between two landmarks in normalised image coordinates (not isotropic). */
function distNorm(lm: ArrayLike<number>, a: number, b: number): number {
  return Math.hypot(lmX(lm, a) - lmX(lm, b), lmY(lm, a) - lmY(lm, b));
}

/**
 * Soukupová–Čech eye aspect ratio from six points p1…p4 corners, p2/p3 upper
 * and p6/p5 lower lid, measured in video pixels so that it is a true shape
 * ratio. NaN when the corners coincide.
 */
export function ear6(lm: ArrayLike<number>, idx: readonly number[], videoW: number, videoH: number): number {
  const [p1, p2, p3, p4, p5, p6] = idx;
  const width = distPx(lm, p1, p4, videoW, videoH);
  if (!(width > 1e-9)) return Number.NaN;
  return (distPx(lm, p2, p6, videoW, videoH) + distPx(lm, p3, p5, videoW, videoH)) / (2 * width);
}

/**
 * gaze-lite's 4-point EAR (lid gap over corner distance) for
 * [outer, inner, top, bottom]. It is computed in normalised image coordinates
 * exactly as gaze-lite does, so that its proven open-eye thresholds carry over;
 * the value therefore scales with the frame's aspect ratio. NaN when the
 * corners coincide.
 */
export function ear4(lm: ArrayLike<number>, idx: readonly number[]): number {
  const [outer, inner, top, bottom] = idx;
  const width = distNorm(lm, outer, inner);
  if (!(width > 1e-9)) return Number.NaN;
  return distNorm(lm, top, bottom) / width;
}

/** openQ = clamp((EAR4 − 0.1)/0.2, 0, 1); a non-finite EAR (a degenerate eye) counts as closed. */
export function openQuality(ear: number): number {
  if (!Number.isFinite(ear)) return 0;
  return Math.min(1, Math.max(0, (ear - 0.1) / 0.2));
}

/** Iris diameter in video pixels: the mean of ‖469−471‖ and ‖474−476‖ (both horizontal ring diameters). */
export function irisDiameterPx(lm: ArrayLike<number>, videoW: number, videoH: number): number {
  const r = distPx(lm, EYE_R.ring[0], EYE_R.ring[2], videoW, videoH);
  const l = distPx(lm, EYE_L.ring[0], EYE_L.ring[2], videoW, videoH);
  return (r + l) / 2;
}

/** The mean of the two iris centres (468, 473), normalised. */
export function eyeMidNorm(lm: ArrayLike<number>): Vec2 {
  return [(lmX(lm, EYE_R.iris) + lmX(lm, EYE_L.iris)) / 2, (lmY(lm, EYE_R.iris) + lmY(lm, EYE_L.iris)) / 2];
}

/** ‖33−263‖ (outer corners) in video pixels. */
export function interOcularPx(lm: ArrayLike<number>, videoW: number, videoH: number): number {
  return distPx(lm, EYE_R.outer, EYE_L.outer, videoW, videoH);
}

/**
 * All eye measures for one frame. `blendshapes` is indexed as BLENDSHAPE_NAMES;
 * blinkL/blinkR are MediaPipe's eyeBlinkLeft/eyeBlinkRight (L = the subject's
 * left eye, as in gaze-lite). `open` is the instantaneous rule (see blink.ts).
 */
export function eyeMeasures(lm: ArrayLike<number>, blendshapes: ArrayLike<number>, videoW: number, videoH: number): EyeMeasures {
  const openQL = openQuality(ear4(lm, EAR4_L));
  const openQR = openQuality(ear4(lm, EAR4_R));
  const blinkL = blendshape(blendshapes, 'eyeBlinkLeft');
  const blinkR = blendshape(blendshapes, 'eyeBlinkRight');
  return {
    earL: ear6(lm, EAR6_L, videoW, videoH),
    earR: ear6(lm, EAR6_R, videoW, videoH),
    openQL,
    openQR,
    blinkL,
    blinkR,
    irisDiamPx: irisDiameterPx(lm, videoW, videoH),
    eyeMidNorm: eyeMidNorm(lm),
    interOcularPx: interOcularPx(lm, videoW, videoH),
    open: eyesOpenRule(blinkL, blinkR, openQL, openQR),
  };
}
