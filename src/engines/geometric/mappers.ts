// The geometric engine's mapper candidates (spec §4.6.1, §4.8.4): geo-linear
// (24 design columns) and geo-quadratic (27). Pure: imported by the fit
// worker, so it never imports a runtime, TF.js or ONNX Runtime.
import { LAMBDA_REL } from '../../core/constants.ts';
import type { EngineFrame, MapperSpec, RowContext } from '../../core/types.ts';
import { GEO_X, GEO_X_DIM } from './features.ts';

/** Design columns of geo-linear, in the order of the §4.6.1 table; ḡ is the mean of both eyes. */
export const GEO_LINEAR_NAMES = [
  'gxL', 'gyL', 'gxR', 'gyR',
  'dcX', 'dcY',
  'bsXL', 'bsYL', 'bsXR', 'bsYR',
  'openQL', 'openQR',
  'yawRad', 'pitchRad', 'rollRad',
  'eyeMidX-0.5', 'eyeMidY-0.5',
  'lnDistRatio',
  'rayX', 'rayY',
  'gx*yaw', 'gy*pitch', 'gx*lnDistRatio', 'gy*lnDistRatio',
] as const;

export const GEO_QUADRATIC_NAMES = [...GEO_LINEAR_NAMES, 'gx^2', 'gy^2', 'gx*gy'] as const;

/** Physical spread floors of §4.6.1, per column of GEO_LINEAR_NAMES. */
const LINEAR_FLOORS = [
  0.02, 0.02, 0.02, 0.02,
  0.03, 0.03,
  0.03, 0.03, 0.03, 0.03,
  0.02, 0.02,
  0.052, 0.052, 0.052,
  0.01, 0.01,
  0.03,
  0.5, 0.5,
  0.002, 0.002, 0.002, 0.002,
];
const QUADRATIC_FLOOR = 0.002;

/** gxL, gyL, gxR, gyR: the columns behind `extrapolated` and outlier pruning. */
export const GEO_PRIMARY = [0, 1, 2, 3] as const;

/** Columns 0–23, or null when the frame is not a finite, ok geometric frame or the context is not finite. */
function linearColumns(f: EngineFrame, c: RowContext, extra: number): Float64Array | null {
  const x = f.x;
  if (f.engine !== 'geometric' || f.status !== 'ok' || !x || x.length !== GEO_X_DIM) return null;
  const ctx = [c.yawRad, c.pitchRad, c.rollRad, c.eyeMidNorm[0], c.eyeMidNorm[1], c.lnDistRatio];
  if (!ctx.every(Number.isFinite)) return null;
  for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) return null;

  const gx = (x[GEO_X.gxL] + x[GEO_X.gxR]) / 2;
  const gy = (x[GEO_X.gyL] + x[GEO_X.gyR]) / 2;
  const row = new Float64Array(GEO_LINEAR_NAMES.length + extra);
  for (let i = 0; i <= GEO_X.openQR; i++) row[i] = x[i];
  row[12] = c.yawRad;
  row[13] = c.pitchRad;
  row[14] = c.rollRad;
  row[15] = c.eyeMidNorm[0] - 0.5;
  row[16] = c.eyeMidNorm[1] - 0.5;
  row[17] = c.lnDistRatio;
  row[18] = x[GEO_X.rayX];
  row[19] = x[GEO_X.rayY];
  row[20] = gx * c.yawRad;
  row[21] = gy * c.pitchRad;
  row[22] = gx * c.lnDistRatio;
  row[23] = gy * c.lnDistRatio;
  return row;
}

export const geoLinear: MapperSpec = {
  id: 'geo-linear',
  engine: 'geometric',
  complexity: 2,
  names: GEO_LINEAR_NAMES,
  row: (f, c) => linearColumns(f, c, 0),
  floors: Float64Array.from(LINEAR_FLOORS),
  primary: GEO_PRIMARY,
  standardise: true,
  lambdaRel: LAMBDA_REL,
};

export const geoQuadratic: MapperSpec = {
  id: 'geo-quadratic',
  engine: 'geometric',
  complexity: 4,
  names: GEO_QUADRATIC_NAMES,
  row: (f, c) => {
    const row = linearColumns(f, c, 3);
    if (!row) return null;
    const gx = (row[0] + row[2]) / 2;
    const gy = (row[1] + row[3]) / 2;
    row[24] = gx * gx;
    row[25] = gy * gy;
    row[26] = gx * gy;
    return row;
  },
  floors: Float64Array.from([...LINEAR_FLOORS, QUADRATIC_FLOOR, QUADRATIC_FLOOR, QUADRATIC_FLOOR]),
  primary: GEO_PRIMARY,
  standardise: true,
  lambdaRel: LAMBDA_REL,
};

export const mappers: readonly MapperSpec[] = [geoLinear, geoQuadratic];
