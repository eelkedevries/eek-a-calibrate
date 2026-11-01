// Head pose from MediaPipe's facial transformation matrix (spec §4.3), a port
// of gaze-lite's headPoseFromMatrix with its maths unchanged [GL].
//
// The matrix maps the canonical face model into MediaPipe's metric camera
// space (right-handed: +x the subject's anatomical left, +y up, the camera at
// the origin looking down −z) as uniform scale · rotation plus translation.
// MediaPipe fixes the vertical field of view at 63°, so the translation is in
// relative canonical centimetres: it is logged, never used metrically [GL].
import type { HeadPose } from '../types.ts';

const DEG = 180 / Math.PI;

/**
 * Which way the 16 values are packed. A rigid transform's fourth row is
 * (0, 0, 0, 1), so the slots that hold the zero triple reveal the layout: the
 * translation sits in 12–14 (column-major, MediaPipe's documented packing) or
 * in 3, 7 and 11 (row-major). A zero translation is ambiguous and reads as
 * row-major, as in gaze-lite; MediaPipe's tz is never near zero.
 */
export function matrixPacking(d: ArrayLike<number>): 'row-major' | 'column-major' {
  const columnTranslation = Math.abs(d[12]) + Math.abs(d[13]) + Math.abs(d[14]);
  const rowTranslation = Math.abs(d[3]) + Math.abs(d[7]) + Math.abs(d[11]);
  return columnTranslation <= rowTranslation ? 'row-major' : 'column-major';
}

/**
 * Decomposes the 4×4 matrix into yaw, pitch and roll (intrinsic Y·X·Z), the
 * row-major rotation R with the uniform scale divided out, the translation and
 * the scale. Returns null when the matrix is missing, malformed or degenerate.
 *
 *   yaw = atan2(R02, R22),  pitch = atan2(−R12, √(R02² + R22²)),  roll = atan2(R10, R11)
 *
 * All three are zero when the face looks straight into the camera; positive
 * yaw turns towards the subject's left.
 */
export function headPoseFromMatrix(d: ArrayLike<number> | null | undefined): HeadPose | null {
  if (!d || d.length !== 16) return null;
  for (let i = 0; i < 16; i++) if (!Number.isFinite(d[i])) return null;

  const rowMajor = matrixPacking(d) === 'row-major';
  const at = (r: number, c: number): number => (rowMajor ? d[r * 4 + c] : d[c * 4 + r]);

  const scale = Math.hypot(at(0, 0), at(1, 0), at(2, 0));
  if (!(scale > 1e-6)) return null;
  const R = [
    at(0, 0) / scale, at(0, 1) / scale, at(0, 2) / scale,
    at(1, 0) / scale, at(1, 1) / scale, at(1, 2) / scale,
    at(2, 0) / scale, at(2, 1) / scale, at(2, 2) / scale,
  ];

  const yaw = Math.atan2(R[2], R[8]);
  const pitch = Math.atan2(-R[5], Math.hypot(R[2], R[8]));
  const roll = Math.atan2(R[3], R[4]);
  const t = [at(0, 3), at(1, 3), at(2, 3)] as const;

  if (![yaw, pitch, roll, ...t].every(Number.isFinite)) return null;
  return { yawDeg: yaw * DEG, pitchDeg: pitch * DEG, rollDeg: roll * DEG, R, t, scale };
}
