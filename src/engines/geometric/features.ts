// The geometric engine's features (spec §4.6.1, featureVersion geo-4): a port
// of gaze-lite's eye-in-head gaze (inversion of weak perspective) and gaze-ray
// intersection, with the depth-correction feature dc = E⁻¹e₃ and canonical-model
// constants. Pure and DOM-free: the fit worker imports the layout through
// mappers.ts.
//
// Conventions. Landmarks are normalised to the unmirrored frame (x right, y
// down). R is the head rotation of HeadPose (row-major, MediaPipe's metric
// frame: +x the subject's anatomical left, +y up, +z out of the face). After
// aspect correction (x·videoW/videoH) image vectors are isotropic, and the head
// axes project to e1 = (R00, −R10), e2 = (R01, −R11), e3 = (R02, −R12)
// (image y is down). Gaze offsets are signed in the head frame: +x towards the
// subject's left, +y up.
import type { FaceObservation, Vec2 } from '../../core/types.ts';
import { BLENDSHAPE_COUNT, blendshape, EYE_L, EYE_R, LANDMARK_COUNT, LANDMARK_STRIDE, lmX, lmY } from '../../core/face/landmarkSets.ts';

export const GEO_FEATURE_VERSION = 'geo-4';

/**
 * EngineFrame.x of the geometric engine: everything the mappers need that the
 * RowContext (pose, eye midpoint, distance ratio) does not carry.
 */
export const GEO_X_NAMES = [
  'gxL', 'gyL', 'gxR', 'gyR',
  'dcX', 'dcY',
  'bsXL', 'bsYL', 'bsXR', 'bsYR',
  'openQL', 'openQR',
  'rayX', 'rayY',
] as const;
export const GEO_X_DIM = GEO_X_NAMES.length;
export const GEO_X = Object.freeze(Object.fromEntries(GEO_X_NAMES.map((name, i) => [name, i]))) as Readonly<Record<(typeof GEO_X_NAMES)[number], number>>;

/**
 * Below this |det E| (|R22| = |cos yaw · cos pitch|, beyond roughly 78° of
 * yaw) the projective inversion is ill-conditioned and the planar fallback is
 * used. The specification writes "det ≥ 0.2"; det E = −R22 is negative for a
 * face looking at the camera, so the magnitude is what gaze-lite tests.
 */
export const MIN_PROJECTION_DET = 0.2;
/** Lower bound on ‖e1‖ when the eye width is de-foreshortened (gaze-lite). */
export const MIN_FORESHORTENING = 0.2;
/** Corner distances below this (aspect-corrected units of the frame height, about 0.05 px at 480 px) are degenerate. */
export const MIN_EYE_WIDTH = 1e-4;

/** Midpoint of the eye corners 33, 133, 362 and 263 in the canonical face model, cm [GL]. */
export const EYE_CENTRE_HEAD_CM = [0, 2.62, 3.47] as const;
/**
 * tan(eye rotation) per unit of eye-in-head offset: the canonical per-eye
 * corner distance 2.66 cm over a 1.2 cm eyeball radius [GL defect 9].
 */
export const GAZE_GAIN = 2.66 / 1.2;
/** gaze-lite's guards on the gaze ray: the smallest z-component and the largest |x| or |y| in cm. */
export const MIN_RAY_Z = 0.2;
export const MAX_RAY_CM = 300;

export interface EyeInHeadGaze {
  gx: number;
  gy: number;
  /** True when the pose was too oblique for the projective inversion. */
  planar: boolean;
}

/** Image projections of the head axes and det E = det [e1 e2]. */
function projectedAxes(R: ArrayLike<number>) {
  const e1x = R[0];
  const e1y = -R[3];
  const e2x = R[1];
  const e2y = -R[4];
  const e3x = R[2];
  const e3y = -R[5];
  return { e1x, e1y, e2x, e2y, e3x, e3y, det: e1x * e2y - e2x * e1y };
}

function checkRotation(R: ArrayLike<number> | null | undefined): asserts R is ArrayLike<number> {
  if (!R || R.length !== 9) throw new RangeError('the head rotation must be a row-major 3 × 3 matrix');
  for (let i = 0; i < 9; i++) if (!Number.isFinite(R[i])) throw new RangeError('the head rotation is not finite');
}

/**
 * dc = E⁻¹e3 (spec §4.6.1): with the iris a depth c in front of the corner
 * plane, d = a·e1 + b·e2 + c·e3, so the in-plane estimate carries a bias of
 * (c/w)·E⁻¹e3 that the ridge removes with a per-person coefficient. Pose-only.
 * Null when |det E| < MIN_PROJECTION_DET (no projective inversion there).
 */
export function depthCorrection(R: ArrayLike<number>): Vec2 | null {
  checkRotation(R);
  const { e1x, e1y, e2x, e2y, e3x, e3y, det } = projectedAxes(R);
  if (!(Math.abs(det) >= MIN_PROJECTION_DET)) return null;
  return [(e2y * e3x - e2x * e3y) / det, (-e1y * e3x + e1x * e3y) / det];
}

/**
 * Eye-in-head gaze offset of one eye (gaze-lite's eyeInHeadGaze). The image
 * offset d of the iris from the corner midpoint is written as a·e1 + b·e2 and
 * solved for (a, b); dividing by the de-foreshortened corner distance
 * w = ‖t − f‖ / max(‖e1‖, 0.2) removes scale. `fromIdx → toIdx` must run along
 * the head's +x̂ (R 33→133, L 362→263). Without a usable pose the eye's own
 * corner-aligned frame is used, which is exact under roll only.
 */
export function eyeInHeadGaze(
  lm: ArrayLike<number>,
  fromIdx: number,
  toIdx: number,
  irisIdx: number,
  aspect: number,
  R: ArrayLike<number>,
): EyeInHeadGaze {
  checkRotation(R);
  if (!(Number.isFinite(aspect) && aspect > 0)) throw new RangeError(`the frame aspect ratio must be positive, not ${aspect}`);
  const fx = lmX(lm, fromIdx) * aspect;
  const fy = lmY(lm, fromIdx);
  const tx = lmX(lm, toIdx) * aspect;
  const ty = lmY(lm, toIdx);
  const dx = lmX(lm, irisIdx) * aspect - (fx + tx) / 2;
  const dy = lmY(lm, irisIdx) - (fy + ty) / 2;
  const ax = tx - fx;
  const ay = ty - fy;
  const widthImg = Math.hypot(ax, ay);
  if (![dx, dy, widthImg].every(Number.isFinite)) throw new RangeError(`eye landmarks ${fromIdx}, ${toIdx} or ${irisIdx} are not finite`);
  if (!(widthImg >= MIN_EYE_WIDTH)) throw new RangeError(`the corners ${fromIdx} and ${toIdx} coincide`);

  const { e1x, e1y, e2x, e2y, det } = projectedAxes(R);
  if (Math.abs(det) >= MIN_PROJECTION_DET) {
    const a = (e2y * dx - e2x * dy) / det;
    const b = (-e1y * dx + e1x * dy) / det;
    // The corners lie along x̂, so their image distance shrinks by ‖e1‖.
    const w = widthImg / Math.max(Math.hypot(e1x, e1y), MIN_FORESHORTENING);
    return { gx: a / w, gy: b / w, planar: false };
  }
  const ux = ax / widthImg;
  const uy = ay / widthImg;
  // Image y is down; the minus makes +gy up, as on the projective path.
  return { gx: (dx * ux + dy * uy) / widthImg, gy: -(-dx * uy + dy * ux) / widthImg, planar: true };
}

/**
 * Blendshape gaze per eye, signed as gaze-lite so that +x is image-right and +y
 * image-down for both eyes: [L x, L y, R x, R y]. Throws if a score is missing.
 */
export function blendshapeGaze(scores: ArrayLike<number>): [number, number, number, number] {
  if (scores.length < BLENDSHAPE_COUNT) throw new RangeError(`expected ${BLENDSHAPE_COUNT} blendshape scores, got ${scores.length}`);
  const out: [number, number, number, number] = [
    blendshape(scores, 'eyeLookOutLeft') - blendshape(scores, 'eyeLookInLeft'),
    blendshape(scores, 'eyeLookDownLeft') - blendshape(scores, 'eyeLookUpLeft'),
    blendshape(scores, 'eyeLookInRight') - blendshape(scores, 'eyeLookOutRight'),
    blendshape(scores, 'eyeLookDownRight') - blendshape(scores, 'eyeLookUpRight'),
  ];
  if (!out.every(Number.isFinite)) throw new RangeError('the eyeLook blendshapes are missing for this frame');
  return out;
}

const clampCm = (v: number): number => Math.min(MAX_RAY_CM, Math.max(-MAX_RAY_CM, v));

/**
 * Where the gaze ray meets the camera plane z = 0, in MediaPipe's relative
 * centimetres (gaze-lite's gazeRayIntersection with canonical constants). The
 * eye sits at t + R·EYE_CENTRE_HEAD_CM and looks along R·(gain·gx, gain·gy, 1).
 * A ray that turns away from the camera plane is bounded by MIN_RAY_Z and the
 * ±MAX_RAY_CM clamp rather than allowed to diverge.
 */
export function gazeRayIntersection(R: ArrayLike<number>, t: ArrayLike<number>, gx: number, gy: number): Vec2 {
  checkRotation(R);
  if (!t || t.length !== 3 || ![t[0], t[1], t[2], gx, gy].every(Number.isFinite)) throw new RangeError('the head translation or the gaze offset is not finite');
  const rot = (x: number, y: number, z: number): [number, number, number] => [
    R[0] * x + R[1] * y + R[2] * z,
    R[3] * x + R[4] * y + R[5] * z,
    R[6] * x + R[7] * y + R[8] * z,
  ];
  const [cx, cy, cz] = EYE_CENTRE_HEAD_CM;
  const e = rot(cx, cy, cz);
  const eye = [t[0] + e[0], t[1] + e[1], t[2] + e[2]];
  const dir = rot(GAZE_GAIN * gx, GAZE_GAIN * gy, 1);
  const s = -eye[2] / Math.max(dir[2], MIN_RAY_Z);
  return [clampCm(eye[0] + s * dir[0]), clampCm(eye[1] + s * dir[1])];
}

export interface GeometricFeatures {
  /** GEO_X_NAMES layout. */
  x: Float64Array;
  /** True when either eye used the planar fallback; dc is then (0, 0). */
  planar: boolean;
}

/**
 * The geometric features of one frame (GEO_X_NAMES). Throws a RangeError, with
 * the reason, when the face cannot give finite features: missing or non-finite
 * landmarks, rotation or eyeLook blendshapes, or coincident eye corners.
 */
export function geometricFeatures(face: FaceObservation, videoW: number, videoH: number): GeometricFeatures {
  if (!(Number.isFinite(videoW) && Number.isFinite(videoH) && videoW > 0 && videoH > 0)) {
    throw new RangeError(`invalid frame size ${videoW} × ${videoH}`);
  }
  const lm = face.landmarks;
  if (lm.length < LANDMARK_COUNT * LANDMARK_STRIDE) throw new RangeError(`expected ${LANDMARK_COUNT} landmarks with iris points, got ${Math.floor(lm.length / LANDMARK_STRIDE)}`);
  const R = face.pose.R;
  const aspect = videoW / videoH;

  const left = eyeInHeadGaze(lm, EYE_L.inner, EYE_L.outer, EYE_L.iris, aspect, R);
  const right = eyeInHeadGaze(lm, EYE_R.outer, EYE_R.inner, EYE_R.iris, aspect, R);
  const planar = left.planar || right.planar;
  // Both eyes share R, so they agree on `planar`; dc has no meaning off the projective path.
  const dc = planar ? null : depthCorrection(R);
  const bs = blendshapeGaze(face.blendshapes);
  const { openQL, openQR } = face.eyes;
  if (!Number.isFinite(openQL) || !Number.isFinite(openQR)) throw new RangeError('the lid-opening measures are not finite');
  const ray = gazeRayIntersection(R, face.pose.t, (left.gx + right.gx) / 2, (left.gy + right.gy) / 2);

  const x = Float64Array.from([
    left.gx, left.gy, right.gx, right.gy,
    dc ? dc[0] : 0, dc ? dc[1] : 0,
    bs[0], bs[1], bs[2], bs[3],
    openQL, openQR,
    ray[0], ray[1],
  ]);
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i])) throw new RangeError(`geometric feature ${GEO_X_NAMES[i]} is not finite`);
  }
  return { x, planar };
}
