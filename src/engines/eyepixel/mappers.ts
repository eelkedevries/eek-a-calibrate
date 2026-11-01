// The eye-pixel engine's mapper candidates (spec §4.8.4): pix-ridge on the 120
// equalised pixels, and pix-webgazer, WebGazer's own regression (pixels ×255,
// unstandardised, absolute λ = 1e-5), reported for comparison. Pure: imported
// by the fit worker, so it never imports a runtime, TF.js or ONNX Runtime.
import { LAMBDA_REL } from '../../core/constants.ts';
import type { EngineFrame, MapperSpec } from '../../core/types.ts';
import { EP_X_DIM, PATCH_SIZE, PATCH_W } from './patches.ts';

/** `L r2 c7` is row 2, column 7 of the left eye's 10 × 6 patch; L is the subject's left eye. */
export const PIX_NAMES: readonly string[] = Object.freeze(
  Array.from({ length: EP_X_DIM }, (_, i) => {
    const eye = i < PATCH_SIZE ? 'L' : 'R';
    const k = i % PATCH_SIZE;
    return `${eye} r${Math.floor(k / PATCH_W)} c${k % PATCH_W}`;
  }),
);

/**
 * Every column carries gaze signal, so a clipped value in any of them means
 * the eye's appearance left the calibrated range (`extrapolated`).
 */
const PIX_PRIMARY: readonly number[] = Object.freeze(Array.from({ length: EP_X_DIM }, (_, i) => i));

/** One quantisation step of the equalised values. */
const PIX_FLOOR = 2 / 255;
/** WebGazer's ridge penalty, applied as an absolute λ to the unstandardised ×255 pixels. */
export const WEBGAZER_LAMBDA = 1e-5;

/** The 120 pixels times `gain`, or null when the frame is not a finite, ok eye-pixel frame. */
function pixelRow(f: EngineFrame, gain: number): Float64Array | null {
  const x = f.x;
  if (f.engine !== 'eyepixel' || f.status !== 'ok' || !x || x.length !== EP_X_DIM) return null;
  const row = new Float64Array(EP_X_DIM);
  for (let i = 0; i < EP_X_DIM; i++) {
    const v = x[i];
    if (!Number.isFinite(v)) return null;
    row[i] = v * gain;
  }
  return row;
}

export const pixRidge: MapperSpec = {
  id: 'pix-ridge',
  engine: 'eyepixel',
  complexity: 5,
  names: PIX_NAMES,
  row: (f) => pixelRow(f, 1),
  floors: new Float64Array(EP_X_DIM).fill(PIX_FLOOR),
  primary: PIX_PRIMARY,
  standardise: true,
  lambdaRel: LAMBDA_REL,
};

export const pixWebgazer: MapperSpec = {
  id: 'pix-webgazer',
  engine: 'eyepixel',
  complexity: 5,
  names: PIX_NAMES,
  row: (f) => pixelRow(f, 255),
  // Unstandardised, so no column is scaled and the floors are unused.
  floors: new Float64Array(EP_X_DIM),
  primary: PIX_PRIMARY,
  standardise: false,
  lambdaRel: [WEBGAZER_LAMBDA],
  absoluteLambda: true,
};

export const mappers: readonly MapperSpec[] = [pixRidge, pixWebgazer];
