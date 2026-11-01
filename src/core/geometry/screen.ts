// Screen scale (specification §4.4): credit-card match, diagonal in inches, or the assumed
// 96 CSS px per inch; and the safe rectangle that normalised layout coordinates map into
// (§14.2.5). Every length here is in CSS px or mm.
import { ASSUMED_PX_PER_MM, CARD_MM } from '../constants.ts';
import type { DistanceModel, ScreenGeometry, Vec2 } from '../types.ts';

export const MM_PER_INCH = 25.4;

export function requirePositive(name: string, value: number): void {
  if (!(Number.isFinite(value) && value > 0)) throw new RangeError(`${name} must be a positive finite number, got ${value}`);
}

/** pxPerMm from the on-screen outline matched to an ID-1 card, 85.60 mm wide. */
export function pxPerMmFromCard(cardWidthCssPx: number): number {
  requirePositive('pxPerMmFromCard: card width', cardWidthCssPx);
  return cardWidthCssPx / CARD_MM.w;
}

/** pxPerMm from the diagonal in inches, with `screen.width` and `screen.height` in CSS px. */
export function pxPerMmFromDiagonal(screenWpx: number, screenHpx: number, inches: number): number {
  requirePositive('pxPerMmFromDiagonal: screen width', screenWpx);
  requirePositive('pxPerMmFromDiagonal: screen height', screenHpx);
  requirePositive('pxPerMmFromDiagonal: diagonal', inches);
  return Math.hypot(screenWpx, screenHpx) / (inches * MM_PER_INCH);
}

/** "Skip": 96 CSS px per inch. Degrees are then approximate. */
export function assumedPxPerMm(): number {
  return ASSUMED_PX_PER_MM;
}

/**
 * The key that card and diagonal results are stored under: `screen W×H@dpr` in CSS px, with the
 * long side first. Some mobile browsers swap `screen.width` and `screen.height` on rotation, and
 * the scale of a screen does not depend on how it is held, so both orientations share one key.
 */
export function screenKey(screen: Pick<ScreenGeometry, 'screenWpx' | 'screenHpx' | 'dpr'>): string {
  const long = Math.max(screen.screenWpx, screen.screenHpx);
  const short = Math.min(screen.screenWpx, screen.screenHpx);
  return `${long}x${short}@${screen.dpr}`;
}

/** Physical size of the viewport that gaze coordinates refer to, in mm. */
export function viewportSizeMm(screen: Pick<ScreenGeometry, 'viewportWpx' | 'viewportHpx' | 'pxPerMm'>): { widthMm: number; heightMm: number } {
  requirePositive('viewportSizeMm: pxPerMm', screen.pxPerMm);
  return { widthMm: screen.viewportWpx / screen.pxPerMm, heightMm: screen.viewportHpx / screen.pxPerMm };
}

export function viewportDiagonalPx(screen: Pick<ScreenGeometry, 'viewportWpx' | 'viewportHpx'>): number {
  return Math.hypot(screen.viewportWpx, screen.viewportHpx);
}

/** Degrees are approximate when either the screen scale or the focal length was assumed. */
export function isDegreesApproximate(screen: Pick<ScreenGeometry, 'pxPerMmSource'>, distance: Pick<DistanceModel, 'focalSource'>): boolean {
  return screen.pxPerMmSource === 'assumed' || distance.focalSource === 'assumed-fov';
}

export type Insets = NonNullable<ScreenGeometry['insets']>;
export const ZERO_INSETS: Readonly<Insets> = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

/** A rectangle in CSS px of the viewport: x … x+w, y … y+h. */
export interface SafeRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type LayoutGeometry = Pick<ScreenGeometry, 'viewportWpx' | 'viewportHpx' | 'insets'>;

/**
 * The safe rectangle: the viewport minus the safe-area insets (none when `insets` is absent).
 * RangeError for a viewport that is not positive, an inset that is negative or not finite, or
 * insets that leave no area.
 */
export function safeRect(g: LayoutGeometry): SafeRect {
  requirePositive('safeRect: viewport width', g.viewportWpx);
  requirePositive('safeRect: viewport height', g.viewportHpx);
  const insets = g.insets ?? ZERO_INSETS;
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const v = insets[side];
    if (!(Number.isFinite(v) && v >= 0)) throw new RangeError(`safeRect: the ${side} inset must be a finite number ≥ 0, got ${v}`);
  }
  const w = g.viewportWpx - insets.left - insets.right;
  const h = g.viewportHpx - insets.top - insets.bottom;
  if (!(w > 0 && h > 0)) {
    throw new RangeError(`safeRect: the insets leave no area in a ${g.viewportWpx} × ${g.viewportHpx} viewport (${w} × ${h})`);
  }
  return { x: insets.left, y: insets.top, w, h };
}

/**
 * Normalised layout coordinates (0–1 across the safe rectangle, y down) to CSS px of the
 * viewport. The one mapping used by the stimulus, labelling, metrics and export (§14.2.5);
 * without insets it is (xNorm·W, yNorm·H).
 */
export function layoutToPx(xNorm: number, yNorm: number, g: LayoutGeometry): Vec2 {
  const r = safeRect(g);
  return [r.x + xNorm * r.w, r.y + yNorm * r.h];
}

/** The inverse of layoutToPx; positions outside the safe rectangle map outside [0, 1]. */
export function pxToLayout(xPx: number, yPx: number, g: LayoutGeometry): Vec2 {
  const r = safeRect(g);
  return [(xPx - r.x) / r.w, (yPx - r.y) / r.h];
}
