// geometry.yaml for eek-a-gaze's `--geometry` (specification §4.16): the viewport that the gaze
// pixels refer to, its size in mm (W/pxPerMm), the viewing distance D_ref, `origin: top_left`
// and `units: pixels`. Keys in eek-a-gaze's order, plain YAML scalars.
import { viewportSizeMm } from '../geometry/screen.ts';
import type { SessionGeometry } from '../types.ts';
import { fmtMm } from './csv.ts';

export const GEOMETRY_KEYS = [
  'screen_width_px',
  'screen_height_px',
  'screen_width_mm',
  'screen_height_mm',
  'viewing_distance_mm',
  'origin',
  'units',
] as const;

function requireInteger(name: string, v: number): void {
  if (!(Number.isSafeInteger(v) && v > 0)) throw new RangeError(`geometryYaml: ${name} must be a positive integer of CSS px, got ${v}`);
}

/**
 * Throws when the viewport is not a positive integer size (innerWidth and innerHeight always
 * are) or when there is no reference distance yet: eek-a-gaze cannot convert pixels without one.
 */
export function geometryYaml(g: SessionGeometry): string {
  const { viewportWpx: W, viewportHpx: H } = g.screen;
  requireInteger('viewport width', W);
  requireInteger('viewport height', H);
  const d = g.refDistanceMm;
  if (!(typeof d === 'number' && Number.isFinite(d) && d > 0)) throw new RangeError('geometryYaml: no reference viewing distance (D_ref); calibrate first');
  const { widthMm, heightMm } = viewportSizeMm(g.screen);
  const values: Record<(typeof GEOMETRY_KEYS)[number], string> = {
    screen_width_px: String(W),
    screen_height_px: String(H),
    screen_width_mm: fmtMm(widthMm),
    screen_height_mm: fmtMm(heightMm),
    viewing_distance_mm: fmtMm(d),
    origin: 'top_left',
    units: 'pixels',
  };
  return GEOMETRY_KEYS.map((k) => `${k}: ${values[k]}\n`).join('');
}
