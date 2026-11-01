// Peekr's mapper candidates (spec §4.8.4): prior-affine, the author's per-axis
// linear calibration generalised to a joint affine map, and prior-ridge-pose,
// a quadratic in the prior with kps, head pose and distance as covariates.
// Pure: imported by the fit worker, so it never imports a runtime, TF.js or
// ONNX Runtime.
import { LAMBDA_REL } from '../../core/constants.ts';
import type { EngineFrame, MapperSpec, RowContext } from '../../core/types.ts';
import { KPS_NAMES, PK_X_DIM } from './preprocess.ts';

export const PRIOR_AFFINE_NAMES = ['priorX', 'priorY'] as const;
export const PRIOR_RIDGE_POSE_NAMES = [
  ...PRIOR_AFFINE_NAMES,
  'priorX^2', 'priorY^2', 'priorX*priorY',
  ...KPS_NAMES,
  'yawRad', 'pitchRad', 'rollRad',
  'lnDistRatio',
] as const;

/** Physical spread floors of §4.8.4, per column group. */
const FLOOR = { prior: 0.005, quadratic: 0.0005, kps: 0.002, pose: 0.052, lnDist: 0.03 };
/** The near-identity ridge of the affine map: λ_rel = 1e-6, as for BlazeGaze's affine correction. */
export const PRIOR_AFFINE_LAMBDA = 1e-6;

/** priorX, priorY: the columns behind `extrapolated` and outlier pruning. */
const PRIOR_PRIMARY = [0, 1] as const;

/** The prior and kps of a finite, ok Peekr frame, else null. */
function frameValues(f: EngineFrame): { px: number; py: number; kps: Float32Array } | null {
  const { x, prior } = f;
  if (f.engine !== 'peekr' || f.status !== 'ok' || !x || x.length !== PK_X_DIM || !prior) return null;
  const [px, py] = prior;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) return null;
  return { px, py, kps: x };
}

export const priorAffine: MapperSpec = {
  id: 'prior-affine',
  engine: 'peekr',
  complexity: 1,
  names: PRIOR_AFFINE_NAMES,
  row: (f) => {
    const v = frameValues(f);
    return v ? Float64Array.of(v.px, v.py) : null;
  },
  floors: Float64Array.of(FLOOR.prior, FLOOR.prior),
  primary: PRIOR_PRIMARY,
  standardise: true,
  lambdaRel: [PRIOR_AFFINE_LAMBDA],
};

export const priorRidgePose: MapperSpec = {
  id: 'prior-ridge-pose',
  engine: 'peekr',
  complexity: 3,
  names: PRIOR_RIDGE_POSE_NAMES,
  row: (f: EngineFrame, c: RowContext) => {
    const v = frameValues(f);
    if (!v) return null;
    const pose = [c.yawRad, c.pitchRad, c.rollRad];
    if (!pose.every(Number.isFinite) || !Number.isFinite(c.lnDistRatio)) return null;
    const row = new Float64Array(PRIOR_RIDGE_POSE_NAMES.length);
    row.set([v.px, v.py, v.px * v.px, v.py * v.py, v.px * v.py]);
    row.set(v.kps, 5);
    row.set(pose, 5 + PK_X_DIM);
    row[8 + PK_X_DIM] = c.lnDistRatio;
    return row;
  },
  floors: Float64Array.from([
    FLOOR.prior, FLOOR.prior,
    FLOOR.quadratic, FLOOR.quadratic, FLOOR.quadratic,
    ...new Array<number>(PK_X_DIM).fill(FLOOR.kps),
    FLOOR.pose, FLOOR.pose, FLOOR.pose,
    FLOOR.lnDist,
  ]),
  primary: PRIOR_PRIMARY,
  standardise: true,
  lambdaRel: LAMBDA_REL,
};

export const mappers: readonly MapperSpec[] = [priorAffine, priorRidgePose];
