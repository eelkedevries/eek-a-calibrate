// Coordinate systems and degree conversion (specification §4.5).
//
// Screen coordinates are CSS px of the fullscreen viewport, origin top-left, y down. Internal
// gaze angles θ = (θx, θy) are degrees from the screen-centre normal with the eye on that
// normal at distance D (the eek-a-gaze convention), y down like the screen. Exports flip y so
// that positive is up (`toExportDeg`).
import type { ScreenGeometry, Vec2 } from '../types.ts';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

/** The parts of the screen geometry that the conversions need. */
export type PlaneGeometry = Pick<ScreenGeometry, 'viewportWpx' | 'viewportHpx' | 'pxPerMm'>;

/** One axis: px along an extent of `extentPx` → degrees from the centre of that extent. */
export function pxToDegAxis(px: number, extentPx: number, pxPerMm: number, distanceMm: number): number {
  return Math.atan2((px - extentPx / 2) / pxPerMm, distanceMm) * DEG;
}

/** One axis, inverse. NaN unless |θ| < 90°, where the direction meets the screen plane. */
export function degToPxAxis(deg: number, extentPx: number, pxPerMm: number, distanceMm: number): number {
  if (!(Math.abs(deg) < 90)) return Number.NaN;
  return extentPx / 2 + distanceMm * Math.tan(deg * RAD) * pxPerMm;
}

/** θx = atan2(dx_mm, D), θy = atan2(dy_mm, D), in degrees with y down. */
export function pxToDeg(p: Vec2, screen: PlaneGeometry, distanceMm: number): Vec2 {
  return [
    pxToDegAxis(p[0], screen.viewportWpx, screen.pxPerMm, distanceMm),
    pxToDegAxis(p[1], screen.viewportHpx, screen.pxPerMm, distanceMm),
  ];
}

/** x = W/2 + D·tan θx·pxPerMm, y = H/2 + D·tan θy·pxPerMm. */
export function degToPx(deg: Vec2, screen: PlaneGeometry, distanceMm: number): Vec2 {
  return [
    degToPxAxis(deg[0], screen.viewportWpx, screen.pxPerMm, distanceMm),
    degToPxAxis(deg[1], screen.viewportHpx, screen.pxPerMm, distanceMm),
  ];
}

/**
 * Exact angle between two gaze directions, in degrees: with u(θ) = (tan θx, tan θy, 1),
 * ang(a, b) = atan2(‖u_a × u_b‖, u_a · u_b). D and pxPerMm cancel, so no screen geometry is
 * needed. NaN when either input is NaN.
 */
export function angularSeparationDeg(a: Vec2, b: Vec2): number {
  const ax = Math.tan(a[0] * RAD);
  const ay = Math.tan(a[1] * RAD);
  const bx = Math.tan(b[0] * RAD);
  const by = Math.tan(b[1] * RAD);
  // u_a × u_b with both z components equal to 1.
  const cx = ay - by;
  const cy = bx - ax;
  const cz = ax * by - ay * bx;
  return Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), ax * bx + ay * by + 1) * DEG;
}

/** Internal (y down) → export (y up, as in eek-a-gaze): gaze_x_deg = θx, gaze_y_deg = −θy. */
export function toExportDeg(deg: Vec2): Vec2 {
  return [deg[0], -deg[1]];
}

/** The pixels-per-degree approximation at the screen centre: D·tan(1°)·pxPerMm. */
export function pxPerDegAtCentre(pxPerMm: number, distanceMm: number): number {
  return distanceMm * Math.tan(RAD) * pxPerMm;
}
