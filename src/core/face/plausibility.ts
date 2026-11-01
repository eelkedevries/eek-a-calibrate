// Plausibility of one face-landmarker result (specification v0.4 §16.1). Some
// mobile GPUs run MediaPipe's GPU delegate without an error yet return corrupt
// landmarks (values far outside the frame, of the order of 1e15–1e21), and the
// transformation matrix computed from them is corrupt too. Such a frame must
// never reach the meters, the engines or the calibration; repeated corrupt
// frames switch the landmarker to the CPU delegate (vision/landmarker.ts).
import { LANDMARK_COUNT, LANDMARK_STRIDE } from './landmarkSets.ts';

/** Normalised landmark coordinates may lie a little outside the frame; beyond this they are corrupt. */
export const PLAUSIBLE = {
  xyMin: -0.5,
  xyMax: 1.5,
  zAbsMax: 1,
  /** Bounding-box size of the whole mesh, normalised. */
  sizeMin: 0.02,
  sizeMax: 2,
  /** Column norms of the matrix's rotation block (MediaPipe's scale is close to 1). */
  scaleMin: 0.5,
  scaleMax: 2,
  /** Largest |cos| between two rotation columns. */
  maxColumnCos: 0.15,
  /** Largest deviation of the matrix's last row from (0, 0, 0, 1). */
  lastRowTol: 1e-3,
} as const;

/** The reason a result is implausible, or null when it is plausible. */
export function implausibleReason(landmarks: ArrayLike<number>, matrix: ArrayLike<number> | null): string | null {
  if (landmarks.length < LANDMARK_COUNT * LANDMARK_STRIDE) return `only ${landmarks.length} landmark values`;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const x = landmarks[i * LANDMARK_STRIDE];
    const y = landmarks[i * LANDMARK_STRIDE + 1];
    const z = landmarks[i * LANDMARK_STRIDE + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return `landmark ${i} is not finite`;
    if (x < PLAUSIBLE.xyMin || x > PLAUSIBLE.xyMax || y < PLAUSIBLE.xyMin || y > PLAUSIBLE.xyMax) return `landmark ${i} lies far outside the frame`;
    if (Math.abs(z) > PLAUSIBLE.zAbsMax) return `landmark ${i} has an implausible depth`;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < PLAUSIBLE.sizeMin || h < PLAUSIBLE.sizeMin || w > PLAUSIBLE.sizeMax || h > PLAUSIBLE.sizeMax) return 'the face mesh has an implausible size';
  if (matrix === null) return null;
  if (matrix.length !== 16) return `the matrix has ${matrix.length} values`;
  for (let k = 0; k < 16; k++) if (!Number.isFinite(matrix[k])) return 'the matrix is not finite';
  // Column-major: column j is matrix[4j … 4j+3]; the last row is matrix[3], [7], [11], [15].
  if (Math.abs(matrix[3]) > PLAUSIBLE.lastRowTol || Math.abs(matrix[7]) > PLAUSIBLE.lastRowTol || Math.abs(matrix[11]) > PLAUSIBLE.lastRowTol || Math.abs(matrix[15] - 1) > PLAUSIBLE.lastRowTol) {
    return 'the matrix is not an affine transform';
  }
  const col = (j: number) => [matrix[4 * j], matrix[4 * j + 1], matrix[4 * j + 2]] as const;
  const norms = [0, 1, 2].map((j) => Math.hypot(...col(j)));
  if (norms.some((n) => n < PLAUSIBLE.scaleMin || n > PLAUSIBLE.scaleMax)) return 'the matrix has an implausible scale';
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]] as const) {
    const ca = col(a);
    const cb = col(b);
    const cos = (ca[0] * cb[0] + ca[1] * cb[1] + ca[2] * cb[2]) / (norms[a] * norms[b]);
    if (Math.abs(cos) > PLAUSIBLE.maxColumnCos) return 'the matrix rotation is not orthogonal';
  }
  return null;
}
