// BlazeGaze inputs (spec §4.6.2), faithful to WebEyeTrack.prepareInput at
// 75fbd2f: the composite 512 × 128 eye strip, the head vector `hv` and the
// face origin `fo`, with `faceWidthCm` frozen at the median of the first 30
// open-eye frames of a session. DOM-free: pixels arrive as plain RGBA buffers.
//
// Bit-exactness. Both the strip and the face origin reproduce upstream's
// floating-point operations in upstream's order, using the vendored
// functions for everything computed once per frame. The two per-pixel or
// per-landmark loops are re-implemented without the 512 × 512 intermediate
// image and without per-point ml-matrix allocations; the parity tests
// (tests/parity/blazegaze-*.test.ts) check them against the vendored code.
import type { Matrix as MediaPipeMatrix } from '@mediapipe/tasks-vision';
import { inverse, Matrix } from 'ml-matrix';
import { LANDMARK_COUNT, LANDMARK_STRIDE } from '../../core/face/landmarkSets.ts';
import type { PixelBuffer, PixelRect } from '../../core/face/quality.ts';
import {
  applyHomography,
  computeHomography,
  createIntrinsicsMatrix,
  createPerspectiveMatrix,
  estimateFaceWidth,
  eulerToMatrix,
  getHeadVector,
  matrixToEuler,
  translateMatrix,
  type Point,
} from './vendor/mathUtils.ts';

export const BG_FEATURE_VERSION = 'bg-75fbd2f-1';
export { BG_EMB_DIM, BG_X, BG_X_DIM } from './mappers.ts';

export const STRIP_W = 512;
export const STRIP_H = 128;
/** Upstream's intermediate face crop is FACE_CROP × FACE_CROP. */
export const FACE_CROP = 512;
/** obtainEyePatch's facePaddingCoefs. */
const PAD_X = 0.4;
const PAD_Y = 0.2;

/** Open-eye frames whose median freezes faceWidthCm for the session (spec §4.6.2). */
export const FACE_WIDTH_FRAMES = 30;
/** Upstream's initialZGuess when there is no previous frame. */
export const DEFAULT_Z_CM = 60;

// Landmarks used by obtainEyePatch (upstream names).
const LM_CENTRE = 4;
const LM_LEFT_TOP = 103;
const LM_LEFT_BOTTOM = 150;
const LM_RIGHT_TOP = 332;
const LM_RIGHT_BOTTOM = 379;
const LM_STRIP_TOP = 151;
const LM_STRIP_BOTTOM = 195;
// Landmarks used by faceReconstruction and computeFaceOrigin3D (upstream constants).
const LM_FACE_LEFTMOST = 356;
const LM_FACE_RIGHTMOST = 127;
const LM_EYE_L = [362, 263] as const;
const LM_EYE_R = [33, 133] as const;

export type Invalid = { ok: false; reason: string };

function invalid(reason: string): Invalid {
  return { ok: false, reason };
}

function allFinite(values: ArrayLike<number>): boolean {
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) return false;
  return true;
}

function finite2d(m: number[][]): boolean {
  return m.every((row) => allFinite(row));
}

/** Checks the interleaved 478 × 3 layout; throws on a malformed array (a pipeline fault, not a bad frame). */
export function checkLandmarks(landmarks: ArrayLike<number>): void {
  if (landmarks.length !== LANDMARK_COUNT * LANDMARK_STRIDE) {
    throw new RangeError(`BlazeGaze needs ${LANDMARK_COUNT} landmarks, got ${landmarks.length / LANDMARK_STRIDE}`);
  }
}

/** Normalised landmarks as upstream's `[l.x, l.y]` pairs. */
export function normalisedPoints(landmarks: ArrayLike<number>): [number, number][] {
  checkLandmarks(landmarks);
  const out: [number, number][] = new Array(LANDMARK_COUNT);
  for (let i = 0; i < LANDMARK_COUNT; i++) out[i] = [landmarks[i * LANDMARK_STRIDE], landmarks[i * LANDMARK_STRIDE + 1]];
  return out;
}

/** Upstream's landmarks2d: (floor(x·W), floor(y·H)). */
export function pixelLandmarks(landmarks: ArrayLike<number>, width: number, height: number): Point[] {
  checkLandmarks(landmarks);
  const out: Point[] = new Array(LANDMARK_COUNT);
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    out[i] = [Math.floor(landmarks[i * LANDMARK_STRIDE] * width), Math.floor(landmarks[i * LANDMARK_STRIDE + 1] * height)];
  }
  return out;
}

// ----- Eye strip -------------------------------------------------------------

export interface StripGeometry {
  ok: true;
  /** Face homography (frame → 512 × 512) and its inverse, as upstream's first warp computes it. */
  H: number[][];
  Hinv: number[][];
  /** Rows [top, top + h) of the warped face form the eye band. */
  top: number;
  h: number;
  /** Resize homography (512 × h → 512 × 128) and its inverse. */
  Hr: number[][];
  Hrinv: number[][];
}

/**
 * The homographies and crop of obtainEyePatch for one frame. Invalid when the
 * landmarks are not finite, the band has no rows (upstream's ImageData would
 * throw) or a homography cannot be inverted.
 */
export function stripGeometry(L2: readonly Point[]): StripGeometry | Invalid {
  const used = [LM_CENTRE, LM_LEFT_TOP, LM_LEFT_BOTTOM, LM_RIGHT_TOP, LM_RIGHT_BOTTOM, LM_STRIP_TOP, LM_STRIP_BOTTOM];
  if (L2.length < LANDMARK_COUNT || !used.every((i) => allFinite(L2[i]))) return invalid('the eye-strip landmarks are not finite');

  const centre = L2[LM_CENTRE];
  const srcPts: Point[] = [L2[LM_LEFT_TOP], L2[LM_LEFT_BOTTOM], L2[LM_RIGHT_BOTTOM], L2[LM_RIGHT_TOP]].map(([x, y]) => {
    const dx = x - centre[0];
    const dy = y - centre[1];
    return [x + dx * PAD_X, y + dy * PAD_Y];
  });
  const dstPts: Point[] = [
    [0, 0],
    [0, FACE_CROP],
    [FACE_CROP, FACE_CROP],
    [FACE_CROP, 0],
  ];
  try {
    const H = computeHomography(srcPts, dstPts);
    const topPt = applyHomography(H, L2[LM_STRIP_TOP]);
    const bottomPt = applyHomography(H, L2[LM_STRIP_BOTTOM]);
    const top = Math.round(topPt[1]);
    const h = Math.round(bottomPt[1] - topPt[1]);
    if (!Number.isFinite(top) || !Number.isFinite(h)) return invalid('the eye band is not finite');
    if (h < 1) return invalid(`the eye band has ${h} rows`);
    const Hinv = inverse(new Matrix(H)).to2DArray();
    const Hr = computeHomography(
      [
        [0, 0],
        [0, h],
        [FACE_CROP, h],
        [FACE_CROP, 0],
      ],
      [
        [0, 0],
        [0, STRIP_H],
        [STRIP_W, STRIP_H],
        [STRIP_W, 0],
      ],
    );
    const Hrinv = inverse(new Matrix(Hr)).to2DArray();
    if (![H, Hinv, Hr, Hrinv].every(finite2d)) return invalid('a strip homography is not finite');
    return { ok: true, H, Hinv, top, h, Hr, Hrinv };
  } catch (error) {
    return invalid(`the strip homography failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface StripPlan {
  /** Frame column and row sampled by each strip pixel (row-major 512 × 128), or −1 for black. */
  sx: Int32Array;
  sy: Int32Array;
  /** Bounding box of the sampled frame pixels; null when every strip pixel is black. */
  bounds: PixelRect | null;
}

/**
 * Where each strip pixel comes from: upstream's resize warp, crop and face
 * warp composed, each with its own `floor` and bounds test, so the 512 × 512
 * intermediate is never built. A NaN coordinate fails the bounds test, as it
 * reads as 0 upstream.
 */
export function planEyeStrip(g: StripGeometry, frameW: number, frameH: number): StripPlan {
  const n = STRIP_W * STRIP_H;
  const sx = new Int32Array(n).fill(-1);
  const sy = new Int32Array(n).fill(-1);
  // The matrix entries as locals: the same values, without nested array reads per pixel.
  const [[r00, r01, r02], [r10, r11, r12], [r20, r21, r22]] = g.Hrinv;
  const [[f00, f01, f02], [f10, f11, f12], [f20, f21, f22]] = g.Hinv;
  const { top, h } = g;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < STRIP_H; y++) {
    for (let x = 0; x < STRIP_W; x++) {
      // warpImageData(eye_patch, eyePatchH, 512, 128)
      const denom = r20 * x + r21 * y + r22;
      const i = Math.floor((r00 * x + r01 * y + r02) / denom);
      const j = Math.floor((r10 * x + r11 * y + r12) / denom);
      if (!(i >= 0 && j >= 0 && i < FACE_CROP && j < h)) continue;
      // cropImageData(warped, 0, top, 512, h): rows outside the warped face read as 0.
      const wy = j + top;
      if (!(wy >= 0 && wy < FACE_CROP)) continue;
      // warpImageData(frame, H, 512, 512) at (i, wy)
      const d2 = f20 * i + f21 * wy + f22;
      const fx = Math.floor((f00 * i + f01 * wy + f02) / d2);
      const fy = Math.floor((f10 * i + f11 * wy + f12) / d2);
      if (!(fx >= 0 && fy >= 0 && fx < frameW && fy < frameH)) continue;
      const k = y * STRIP_W + x;
      sx[k] = fx;
      sy[k] = fy;
      if (fx < minX) minX = fx;
      if (fx > maxX) maxX = fx;
      if (fy < minY) minY = fy;
      if (fy > maxY) maxY = fy;
    }
  }
  const bounds = minX <= maxX ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
  return { sx, sy, bounds };
}

/** A rectangle of the frame: `buffer` holds frame pixels from column `x`, row `y` on. */
export interface FramePixels {
  buffer: PixelBuffer;
  x: number;
  y: number;
}

export function coversPlan(src: FramePixels, plan: StripPlan): boolean {
  const b = plan.bounds;
  if (!b) return true;
  return b.x >= src.x && b.y >= src.y && b.x + b.w <= src.x + src.buffer.width && b.y + b.h <= src.y + src.buffer.height;
}

/**
 * Fills `out` (512 × 128 RGBA) from the frame pixels: RGBA copied as upstream
 * copies it, 0 (alpha included) where the plan has no source. Throws when the
 * source does not cover every sampled pixel, rather than reading wrong data.
 */
export function sampleEyeStrip(plan: StripPlan, src: FramePixels, out = new Uint8ClampedArray(STRIP_W * STRIP_H * 4)): Uint8ClampedArray {
  if (out.length !== STRIP_W * STRIP_H * 4) throw new RangeError(`sampleEyeStrip: the output must hold ${STRIP_W * STRIP_H * 4} values`);
  if (!coversPlan(src, plan)) throw new RangeError('sampleEyeStrip: the pixel source does not cover the strip');
  const { data, width } = src.buffer;
  if (data.length < width * src.buffer.height * 4) throw new RangeError('sampleEyeStrip: the pixel buffer is shorter than its size');
  out.fill(0);
  for (let k = 0; k < plan.sx.length; k++) {
    const fx = plan.sx[k];
    if (fx < 0) continue;
    const s = ((plan.sy[k] - src.y) * width + (fx - src.x)) * 4;
    const d = k * 4;
    out[d] = data[s];
    out[d + 1] = data[s + 1];
    out[d + 2] = data[s + 2];
    out[d + 3] = data[s + 3];
  }
  return out;
}

/** The encoder input, [1, 128, 512, 3] row-major: RGB / 255 in float32 (tf.browser.fromPixels drops alpha). */
export function stripTensorData(rgba: ArrayLike<number>, out = new Float32Array(STRIP_W * STRIP_H * 3)): Float32Array {
  const n = STRIP_W * STRIP_H;
  if (rgba.length !== n * 4 || out.length !== n * 3) throw new RangeError('stripTensorData: wrong buffer sizes');
  for (let k = 0; k < n; k++) {
    out[k * 3] = rgba[k * 4] / 255;
    out[k * 3 + 1] = rgba[k * 4 + 1] / 255;
    out[k * 3 + 2] = rgba[k * 4 + 2] / 255;
  }
  return out;
}

// ----- Face width ------------------------------------------------------------------

/**
 * faceWidthCm for a session: the median of upstream's estimateFaceWidth over
 * the first FACE_WIDTH_FRAMES open-eye frames, then frozen. Upstream freezes
 * the very first frame's estimate instead (UPSTREAM.md). Before the value is
 * frozen, the median of the frames so far is used, or, before any open-eye
 * frame, the current frame's own estimate (upstream's first-frame rule).
 */
export class FaceWidthTracker {
  readonly frames: number;
  private samples: number[] = [];
  private frozenCm: number | null = null;

  constructor(frames = FACE_WIDTH_FRAMES) {
    if (!(Number.isInteger(frames) && frames > 0)) throw new RangeError(`FaceWidthTracker: frames must be a positive integer, not ${frames}`);
    this.frames = frames;
  }

  get frozen(): boolean {
    return this.frozenCm !== null;
  }

  get count(): number {
    return this.samples.length;
  }

  /** Adds an open-eye frame's estimate; non-finite or non-positive estimates are not counted. */
  add(estimateCm: number): void {
    if (this.frozenCm !== null || !(Number.isFinite(estimateCm) && estimateCm > 0)) return;
    this.samples.push(estimateCm);
    if (this.samples.length >= this.frames) this.frozenCm = median(this.samples);
  }

  value(currentEstimateCm: number): number {
    if (this.frozenCm !== null) return this.frozenCm;
    return this.samples.length > 0 ? median(this.samples) : currentEstimateCm;
  }

  reset(): void {
    this.samples = [];
    this.frozenCm = null;
  }
}

function median(values: readonly number[]): number {
  const xs = [...values].sort((a, b) => a - b);
  const m = xs.length >> 1;
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

/** Upstream's estimateFaceWidth on landmarks2d. */
export function faceWidthEstimate(L2: readonly Point[]): number {
  return estimateFaceWidth(L2 as Point[]);
}

// ----- Head vector and face origin ------------------------------------------------

/** Upstream's translateMatrix on MediaPipe's 4 × 4 data, read with upstream's (row-major) indexing. */
export function faceRtMatrix(matrix: ArrayLike<number>): Matrix {
  if (matrix.length !== 16) throw new RangeError(`the facial transformation matrix has ${matrix.length} values, not 16`);
  const mp: MediaPipeMatrix = { rows: 4, columns: 4, data: Array.from(matrix) };
  return translateMatrix(mp);
}

/** hv = getHeadVector(translateMatrix(matrix)). */
export function headVector(matrix: ArrayLike<number>): [number, number, number] {
  const v = getHeadVector(faceRtMatrix(matrix));
  return [v[0], v[1], v[2]];
}

/** The fixed matrices of faceReconstruction for one frame size. */
export interface CameraModel {
  width: number;
  height: number;
  /** inverse(createPerspectiveMatrix(width / height)), as convertUvToXyz computes it for every point. */
  invP: number[][];
  /** createIntrinsicsMatrix(width, height). */
  K: number[][];
}

export function cameraModel(width: number, height: number): CameraModel {
  if (!(width > 0 && height > 0)) throw new RangeError(`cameraModel: invalid frame size ${width} × ${height}`);
  return {
    width,
    height,
    invP: inverse(createPerspectiveMatrix(width / height)).to2DArray(),
    K: createIntrinsicsMatrix(width, height).to2DArray(),
  };
}

// T · [x, y, z, 1] as ml-matrix's mmul accumulates it (transform3DTo3D).
function apply4(T: number[][], x: number, y: number, z: number, out: number[]): void {
  for (let i = 0; i < 3; i++) {
    const r = T[i];
    let s = 0;
    s += r[0] * x;
    s += r[1] * y;
    s += r[2] * z;
    s += r[3] * 1;
    out[i] = s;
  }
}

const projectScratch = [0, 0, 0];

// transform3DTo2D: K · p, then rounded pixel coordinates.
function project(K: number[][], p: readonly number[], out: number[]): void {
  const q = projectScratch;
  for (let i = 0; i < 3; i++) {
    const r = K[i];
    let s = 0;
    s += r[0] * p[0];
    s += r[1] * p[1];
    s += r[2] * p[2];
    q[i] = s;
  }
  const eps = 1e-6;
  const zVal = Math.abs(q[2]) < eps ? eps : q[2];
  out[0] = Math.round(q[0] / zVal);
  out[1] = Math.round(q[1] / zVal);
}

export interface FaceOrigin {
  /** computeFaceOrigin3D(metricFace), in cm. */
  fo: [number, number, number];
  /** The final metric transform's translation z (finalTransform(2, 3)). */
  transformZ: number;
}

/**
 * fo = computeFaceOrigin3D(faceReconstruction(P, uv, faceRT, K, faceWidthCm,
 * W, H, initialZ)[1]), reproduced operation for operation: the per-landmark
 * loops (convertUvToXyz, the derotation and the ten depth-refinement passes)
 * run on plain arrays with the matrices computed once.
 */
export function faceOrigin(
  cam: CameraModel,
  uv: readonly (readonly [number, number])[],
  faceRT: Matrix,
  faceWidthCm: number,
  initialZGuess = DEFAULT_Z_CM,
): FaceOrigin {
  const n = uv.length;
  if (n < LANDMARK_COUNT) throw new RangeError(`faceOrigin needs ${LANDMARK_COUNT} landmarks, got ${n}`);
  const { invP, K, width: videoWidth, height: videoHeight } = cam;

  // Step 1: convertUvToXyz for every landmark.
  const rel = new Array<[number, number, number]>(n);
  for (let k = 0; k < n; k++) {
    const ndcX = 2 * uv[k][0] - 1;
    const ndcY = 1 - 2 * uv[k][1];
    const h = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const r = invP[i];
      let s = 0;
      s += r[0] * ndcX;
      s += r[1] * ndcY;
      s += r[2] * -1.0;
      s += r[3] * 1.0;
      h[i] = s;
    }
    const w = h[3];
    rel[k] = [-(h[0] / w), h[1] / w, initialZGuess];
  }

  // Steps 2 and 3: centre on the nose, scale to the face width.
  const nose = rel[4];
  const centred = rel.map(([x, y, z]): [number, number, number] => [-(x - nose[0]), -(y - nose[1]), z - nose[2]]);
  const left = centred[LM_FACE_LEFTMOST];
  const right = centred[LM_FACE_RIGHTMOST];
  const dist = Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
  const normalised = centred.map(([x, y, z]): [number, number, number] => [(x / dist) * faceWidthCm, (y / dist) * faceWidthCm, (z / dist) * faceWidthCm]);

  // Step 4: invert MediaPipe's rotation (vendored, once per frame).
  const faceR = faceRT.subMatrix(0, 2, 0, 2);
  let [pitch, yaw, roll] = matrixToEuler(faceR);
  [pitch, yaw] = [-yaw, pitch];
  const finalR = eulerToMatrix(pitch, yaw, roll);

  // Step 5: derotate (multiplyVecByMat with finalRᵀ).
  const Rt = finalR.transpose().to2DArray();
  const canonical = normalised.map((p): number[] => {
    const out = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      let s = 0;
      s += Rt[i][0] * p[0];
      s += Rt[i][1] * p[1];
      s += Rt[i][2] * p[2];
      out[i] = s;
    }
    return out;
  });

  // Step 6: scale from the rotation's columns.
  const scales = [0, 1, 2].map((i) => Math.sqrt(faceR.get(0, i) ** 2 + faceR.get(1, i) ** 2 + faceR.get(2, i) ** 2));
  const faceS = scales.reduce((a, b) => a + b, 0) / 3;

  // Step 7: the initial transform [finalR / faceS | (0, 0, z0)].
  const R = finalR.to2DArray();
  const T: number[][] = [
    [R[0][0] / faceS, R[0][1] / faceS, R[0][2] / faceS, 0],
    [R[1][0] / faceS, R[1][1] / faceS, R[1][2] / faceS, 0],
    [R[2][0] / faceS, R[2][1] / faceS, R[2][2] / faceS, initialZGuess],
    [0, 0, 0, 1],
  ];
  const q = [0, 0, 0];
  const c4 = [0, 0];
  apply4(T, canonical[4][0], canonical[4][1], canonical[4][2], q);
  project(K, q, c4);

  const detected = uv.map(([x, y]): [number, number] => [x * videoWidth, y * videoHeight]);
  const shift2D = [detected[4][0] - c4[0], detected[4][1] - c4[1]];
  const shift3D = [shift2D[0] * (initialZGuess / K[0][0]), shift2D[1] * (initialZGuess / K[1][1]), 0.0];
  T[0][3] = T[0][3] + shift3D[0];
  T[1][3] = T[1][3] + shift3D[1];
  T[2][3] = T[2][3] + shift3D[2];
  const firstX = T[0][3];
  const firstY = T[1][3];

  // refineDepthByRadialMagnitude's centroid does not change between passes.
  const centre = detected.reduce((acc, [x, y]) => [acc[0] + x / n, acc[1] + y / n], [0, 0]);
  const proj = [0, 0];
  for (let pass = 0; pass < 10; pass++) {
    let total = 0;
    for (let k = 0; k < n; k++) {
      const p = canonical[k];
      apply4(T, p[0], p[1], p[2], q);
      project(K, q, proj);
      const d = detected[k];
      const v0 = d[0] - proj[0];
      const v1 = d[1] - proj[1];
      const vNorm = Math.hypot(v0, v1);
      const cx = centre[0] - proj[0];
      const cy = centre[1] - proj[1];
      const dot = v0 * cx + v1 * cy;
      total += dot < 0 ? -vNorm : vNorm;
    }
    const delta = 1e-1 * (total / n);
    const newZ = T[2][3] + Math.max(-5, Math.min(5, delta));
    if (Math.abs(newZ - T[2][3]) < 0.25) break;
    T[0][3] = firstX * (newZ / initialZGuess);
    T[1][3] = firstY * (newZ / initialZGuess);
    T[2][3] = newZ;
  }

  // computeFaceOrigin3D on the final metric face.
  const eyeMean = (indices: readonly number[]): number[] => {
    const sum = [0, 0, 0];
    for (const idx of indices) {
      const p = canonical[idx];
      apply4(T, p[0], p[1], p[2], q);
      sum[0] = sum[0] + q[0];
      sum[1] = sum[1] + q[1];
      sum[2] = sum[2] + q[2];
    }
    return [sum[0] / indices.length, sum[1] / indices.length, sum[2] / indices.length];
  };
  const l = eyeMean(LM_EYE_L);
  const r = eyeMean(LM_EYE_R);
  return { fo: [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2], transformZ: T[2][3] };
}

// ----- Per-session preparation -------------------------------------------------------

export interface BlazeGazeSession {
  faceWidth: FaceWidthTracker;
  /** The previous frame's fo z, upstream's initialZGuess; null at the start of a session. */
  prevZ: number | null;
  camera: CameraModel | null;
}

export function newSession(): BlazeGazeSession {
  return { faceWidth: new FaceWidthTracker(), prevZ: null, camera: null };
}

export interface PreparedInputs {
  ok: true;
  hv: [number, number, number];
  fo: [number, number, number];
  faceWidthCm: number;
  /** Where each strip pixel comes from, or why this frame has no strip. */
  strip: { ok: true; plan: StripPlan } | Invalid;
}

/**
 * Everything of prepareInput except the pixels: the strip plan, faceWidthCm
 * (updated on open-eye frames), fo with the previous frame's z as the initial
 * guess, and hv. Throws with the reason when hv or fo is not finite.
 */
export function prepareInputs(
  session: BlazeGazeSession,
  landmarks: ArrayLike<number>,
  matrix: ArrayLike<number>,
  eyesOpen: boolean,
  width: number,
  height: number,
): PreparedInputs {
  const L2 = pixelLandmarks(landmarks, width, height);
  const uv = normalisedPoints(landmarks);
  if (!uv.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) throw new Error('the landmarks are not finite');
  if (!allFinite(matrix)) throw new Error('the facial transformation matrix is not finite');

  const geometry = stripGeometry(L2);
  let strip: PreparedInputs['strip'];
  if (geometry.ok) {
    const plan = planEyeStrip(geometry, width, height);
    strip = plan.bounds ? { ok: true, plan } : invalid('the eye strip lies outside the frame');
  } else {
    strip = geometry;
  }

  const estimate = faceWidthEstimate(L2);
  if (eyesOpen) session.faceWidth.add(estimate);
  const faceWidthCm = session.faceWidth.value(estimate);
  if (!(Number.isFinite(faceWidthCm) && faceWidthCm > 0)) throw new Error(`the face width estimate is not usable (${faceWidthCm})`);

  if (!session.camera || session.camera.width !== width || session.camera.height !== height) session.camera = cameraModel(width, height);
  const faceRT = faceRtMatrix(matrix);
  const { fo } = faceOrigin(session.camera, uv, faceRT, faceWidthCm, session.prevZ ?? DEFAULT_Z_CM);
  if (!allFinite(fo)) throw new Error('the face origin is not finite');
  session.prevZ = fo[2];

  const hv = headVector(matrix);
  if (!allFinite(hv)) throw new Error('the head vector is not finite');
  return { ok: true, hv, fo, faceWidthCm, strip };
}
