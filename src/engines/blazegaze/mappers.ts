// BlazeGaze's mapper candidates (spec §4.8.4): prior-affine (the head's own
// estimate, affinely corrected as upstream's calibration does),
// prior-ridge-pose (the estimate, its square terms, hv, fo and distance) and
// emb-ridge (the 512-d embedding through the seeded PCA-64 block, with hv and
// fo). Pure: imported by the fit worker, so it never imports a runtime, TF.js
// or ONNX Runtime.
import { LAMBDA_REL, PCA } from '../../core/constants.ts';
import type { EngineFrame, MapperSpec, RowContext } from '../../core/types.ts';

// The layout of EngineFrame.x, shared with preprocess.ts. Defined here so the
// fit worker, which needs only the layout, never loads the preprocessing.
export const BG_EMB_DIM = 512;
/** x = [emb 512, hv 3, fo 3]. */
export const BG_X_DIM = BG_EMB_DIM + 6;
export const BG_X = { emb: 0, hv: BG_EMB_DIM, fo: BG_EMB_DIM + 3 } as const;

/** λ_rel of prior-affine: in effect unpenalised, which reproduces upstream's least-squares affine correction. */
export const PRIOR_AFFINE_LAMBDA = 1e-6;

const HV_NAMES = ['hvX', 'hvY', 'hvZ'] as const;
const FO_NAMES = ['foX', 'foY', 'foZ'] as const;

export const PRIOR_AFFINE_NAMES = ['priorX', 'priorY'] as const;
export const PRIOR_RIDGE_POSE_NAMES = [
  'priorX', 'priorY',
  'priorX^2', 'priorY^2', 'priorX*priorY',
  ...HV_NAMES,
  ...FO_NAMES,
  'lnDistRatio',
] as const;
export const EMB_RIDGE_NAMES: readonly string[] = Object.freeze([
  ...Array.from({ length: BG_EMB_DIM }, (_, i) => `emb${i}`),
  ...HV_NAMES,
  ...FO_NAMES,
]);

// Physical spread floors (§4.8.4): prior in centre-origin screen units, hv a unit vector, fo in cm.
const PRIOR_FLOOR = 0.01;
const PRIOR_SQUARE_FLOOR = 0.001;
const HV_FLOOR = 0.02;
const FO_FLOOR = 0.5;
const LN_DIST_FLOOR = 0.03;

/** The prior columns set `extrapolated` for the prior mappers. */
const PRIOR_PRIMARY = [0, 1] as const;
/**
 * The embedding carries the gaze signal, so a column of the PCA block is
 * primary, which makes every one of its 64 scores primary.
 */
const EMB_PRIMARY = [0] as const;

/** x and prior of an ok BlazeGaze frame, or null when the frame is not one or holds a non-finite value. */
function frameValues(f: EngineFrame): { x: Float32Array; px: number; py: number } | null {
  const x = f.x;
  if (f.engine !== 'blazegaze' || f.status !== 'ok' || !x || x.length !== BG_X_DIM || !f.prior) return null;
  const [px, py] = f.prior;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) return null;
  return { x, px, py };
}

export const priorAffine: MapperSpec = {
  id: 'prior-affine',
  engine: 'blazegaze',
  complexity: 1,
  names: PRIOR_AFFINE_NAMES,
  row: (f) => {
    const v = frameValues(f);
    return v ? Float64Array.of(v.px, v.py) : null;
  },
  floors: Float64Array.of(PRIOR_FLOOR, PRIOR_FLOOR),
  primary: PRIOR_PRIMARY,
  standardise: true,
  lambdaRel: [PRIOR_AFFINE_LAMBDA],
};

export const priorRidgePose: MapperSpec = {
  id: 'prior-ridge-pose',
  engine: 'blazegaze',
  complexity: 3,
  names: PRIOR_RIDGE_POSE_NAMES,
  row: (f: EngineFrame, c: RowContext) => {
    const v = frameValues(f);
    if (!v || !Number.isFinite(c.lnDistRatio)) return null;
    const { x, px, py } = v;
    return Float64Array.of(
      px, py,
      px * px, py * py, px * py,
      x[BG_X.hv], x[BG_X.hv + 1], x[BG_X.hv + 2],
      x[BG_X.fo], x[BG_X.fo + 1], x[BG_X.fo + 2],
      c.lnDistRatio,
    );
  },
  floors: Float64Array.of(
    PRIOR_FLOOR, PRIOR_FLOOR,
    PRIOR_SQUARE_FLOOR, PRIOR_SQUARE_FLOOR, PRIOR_SQUARE_FLOOR,
    HV_FLOOR, HV_FLOOR, HV_FLOOR,
    FO_FLOOR, FO_FLOOR, FO_FLOOR,
    LN_DIST_FLOOR,
  ),
  primary: PRIOR_PRIMARY,
  standardise: true,
  lambdaRel: LAMBDA_REL,
};

export const embRidge: MapperSpec = {
  id: 'emb-ridge',
  engine: 'blazegaze',
  complexity: 5,
  names: EMB_RIDGE_NAMES,
  // x is already [emb, hv, fo]: the raw design row, whose first 512 columns the PCA block replaces.
  row: (f) => {
    const v = frameValues(f);
    return v ? Float64Array.from(v.x) : null;
  },
  // The PCA block has no per-column standardisation (§4.8.2), so its floors are unused.
  floors: Float64Array.from([...new Array<number>(BG_EMB_DIM).fill(0), HV_FLOOR, HV_FLOOR, HV_FLOOR, FO_FLOOR, FO_FLOOR, FO_FLOOR]),
  primary: EMB_PRIMARY,
  pca: { start: BG_X.emb, end: BG_X.emb + BG_EMB_DIM, k: PCA.k },
  standardise: true,
  lambdaRel: LAMBDA_REL,
};

export const mappers: readonly MapperSpec[] = [priorAffine, priorRidgePose, embRidge];
