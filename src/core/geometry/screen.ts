// Screen scale (specification §4.4): credit-card match, diagonal in inches, or the assumed
// 96 CSS px per inch. Every length here is in CSS px or mm.
import { ASSUMED_PX_PER_MM, CARD_MM } from '../constants.ts';
import type { DistanceModel, ScreenGeometry } from '../types.ts';

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

/** The key that card and diagonal results are stored under: `screen W×H@dpr` in CSS px. */
export function screenKey(screen: Pick<ScreenGeometry, 'screenWpx' | 'screenHpx' | 'dpr'>): string {
  return `${screen.screenWpx}x${screen.screenHpx}@${screen.dpr}`;
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
