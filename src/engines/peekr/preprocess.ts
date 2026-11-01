// Peekr 1.0.7's preprocessing (spec §2.2 item 3, §4.6.3, featureVersion
// pk-1.0.7-1), reproduced exactly from the package's bundle (dist/index.js,
// MIT © 2025 AryamanTaore): the two eye boxes of its `B` (convertToYolo) on the
// landmarks of `C` (collectCoordinates), `kps`, the crop rectangles of its
// drawImage calls and the BGR tensor of its `F` (preprocess). Pure and
// DOM-free: the crops themselves are drawn by FrameImage.crop.
//
// Peekr ran legacy FaceMesh with selfieMode:true, so its landmarks are those of
// the horizontally mirrored frame. The face front end gives tasks-vision
// landmarks of the unmirrored frame; legacy landmark i is reproduced as
// m(L[j]) = (1 − L[j].x, L[j].y), j being i's left–right mirror partner. The
// crop is still drawn from the unmirrored frame at sx = W − x − w, which is the
// same physical rectangle, so the pixels are not flipped; only kps is in
// mirrored coordinates.
import { lmX, lmY, PEEKR_MIRROR_PAIRS } from '../../core/face/landmarkSets.ts';
import type { PixelBuffer } from '../../core/face/quality.ts';

export const PK_FEATURE_VERSION = 'pk-1.0.7-1';
/** EngineFrame.x is kps: input1's box (x, y, w, h), then input2's, normalised to the mirrored frame. */
export const PK_X_DIM = 8;
/** Both model inputs are 128 × 128 crops. */
export const PK_CROP = 128;
export const PK_INPUT_SIZE = 3 * PK_CROP * PK_CROP;
/** A box narrower or shorter than this (video px) gives 'crop-invalid'. */
export const PK_MIN_BOX_PX = 4;

/** The legacy FaceMesh indices the bundle reads for each input, in C's order p0, p1, p2, p3. */
export const LEGACY_INPUT1 = [130, 27, 243, 23] as const;
export const LEGACY_INPUT2 = [463, 257, 359, 253] as const;

/** The left–right mirror partner of a landmark in PEEKR_MIRROR_PAIRS; throws for any other index. */
export function mirrorPartner(index: number): number {
  for (const [r, l] of PEEKR_MIRROR_PAIRS) {
    if (index === r) return l;
    if (index === l) return r;
  }
  throw new RangeError(`landmark ${index} has no verified mirror partner`);
}

/** tasks-vision indices whose mirror images are the bundle's input1 points: 359, 257, 463, 253. */
export const INPUT1_POINTS: readonly number[] = Object.freeze(LEGACY_INPUT1.map(mirrorPartner));
/** tasks-vision indices whose mirror images are the bundle's input2 points: 243, 27, 130, 23. */
export const INPUT2_POINTS: readonly number[] = Object.freeze(LEGACY_INPUT2.map(mirrorPartner));

/** Names of the kps values; input1 is the subject's left eye, input2 the right. */
export const KPS_NAMES: readonly string[] = Object.freeze(['in1.x', 'in1.y', 'in1.w', 'in1.h', 'in2.x', 'in2.y', 'in2.w', 'in2.h']);

/** A box in pixels of the mirrored frame: Peekr's (upper_left_x, upper_left_y, width, height). */
export interface PeekrBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A drawImage source rectangle in pixels of the unmirrored frame. */
export interface PeekrCropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export type PeekrGeometry =
  | { status: 'ok'; boxes: [PeekrBox, PeekrBox]; crops: [PeekrCropRect, PeekrCropRect]; kps: Float32Array }
  | { status: 'crop-invalid'; reason: string };

/** A landmark in mirrored normalised coordinates: m(L) = (1 − L.x, L.y). */
export function mirroredPoint(landmarks: ArrayLike<number>, index: number): [number, number] {
  return [1 - lmX(landmarks, index), lmY(landmarks, index)];
}

/**
 * Peekr's `B` on four mirrored normalised points p0…p3: the box spans p0.x to
 * p2.x and p1.y to p3.y, in pixels of a W × H frame. The order of operations
 * is the bundle's, so the result is bit-identical.
 */
export function peekrBox(p: readonly (readonly [number, number])[], W: number, H: number): PeekrBox {
  const cx = (p[0][0] + p[2][0]) / 2;
  const cy = (p[1][1] + p[3][1]) / 2;
  const w = p[2][0] - p[0][0];
  const h = p[3][1] - p[1][1];
  return { x: (cx - w / 2) * W, y: (cy - h / 2) * H, w: w * W, h: h * H };
}

/** The bundle's drawImage source rectangle for a box: the same physical pixels, in the unmirrored frame. */
export function peekrCropRect(box: PeekrBox, W: number): PeekrCropRect {
  return { sx: Math.max(0, W - box.x - box.w), sy: Math.max(0, box.y), sw: Math.max(0, box.w), sh: Math.max(0, box.h) };
}

/**
 * Null for a usable box, else why it is not. A box under PK_MIN_BOX_PX on a
 * side, or one that does not lie wholly inside the frame, is degenerate: the
 * bundle would shift (left, top) or black-pad (right, bottom) such a crop, an
 * input the model was not trained on.
 */
export function boxProblem(box: PeekrBox, W: number, H: number): string | null {
  if (!(box.w >= PK_MIN_BOX_PX && box.h >= PK_MIN_BOX_PX)) {
    return `the box is ${box.w.toFixed(1)} × ${box.h.toFixed(1)} px, under ${PK_MIN_BOX_PX} px`;
  }
  if (box.x < 0 || box.y < 0 || box.x + box.w > W || box.y + box.h > H) return 'the box leaves the frame';
  return null;
}

function inputBox(landmarks: ArrayLike<number>, points: readonly number[], W: number, H: number): PeekrBox {
  return peekrBox(points.map((i) => mirroredPoint(landmarks, i)), W, H);
}

/**
 * Both boxes, their crop rectangles and kps for one frame of W × H video
 * pixels. 'crop-invalid' when either box is degenerate (boxProblem). Throws a
 * RangeError for a frame size that is not positive or for non-finite
 * landmarks, which only a broken front end can produce.
 */
export function peekrGeometry(landmarks: ArrayLike<number>, W: number, H: number): PeekrGeometry {
  if (!(Number.isFinite(W) && Number.isFinite(H) && W > 0 && H > 0)) throw new RangeError(`peekr: invalid frame size ${W} × ${H}`);
  for (const i of [...INPUT1_POINTS, ...INPUT2_POINTS]) {
    if (!Number.isFinite(lmX(landmarks, i)) || !Number.isFinite(lmY(landmarks, i))) throw new RangeError(`peekr: landmark ${i} is not finite`);
  }
  const boxes: [PeekrBox, PeekrBox] = [inputBox(landmarks, INPUT1_POINTS, W, H), inputBox(landmarks, INPUT2_POINTS, W, H)];
  for (let k = 0; k < 2; k++) {
    const problem = boxProblem(boxes[k], W, H);
    if (problem) return { status: 'crop-invalid', reason: `input${k + 1}: ${problem}` };
  }
  const kps = new Float32Array(PK_X_DIM);
  boxes.forEach((b, k) => kps.set([b.x / W, b.y / H, b.w / W, b.h / H], 4 * k));
  return { status: 'ok', boxes, crops: [peekrCropRect(boxes[0], W), peekrCropRect(boxes[1], W)], kps };
}

/**
 * Peekr's `F`: RGBA (row-major) to a [1, 3, height, width] tensor with
 * channel 0 = B/255, 1 = G/255, 2 = R/255, no mean or standard deviation;
 * alpha is dropped. Writes into `out` when given (length 3·width·height).
 */
export function bgrTensor(image: PixelBuffer, out?: Float32Array): Float32Array {
  const { width, height, data } = image;
  const n = width * height;
  if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0)) {
    throw new RangeError(`peekr: invalid image size ${width} × ${height}`);
  }
  if (data.length !== 4 * n) throw new RangeError(`peekr: expected ${4 * n} RGBA bytes, got ${data.length}`);
  const tensor = out ?? new Float32Array(3 * n);
  if (tensor.length !== 3 * n) throw new RangeError(`peekr: the tensor buffer holds ${tensor.length} values, not ${3 * n}`);
  for (let i = 0; i < n; i++) {
    const p = 4 * i;
    tensor[i] = data[p + 2] / 255;
    tensor[n + i] = data[p + 1] / 255;
    tensor[2 * n + i] = data[p] / 255;
  }
  return tensor;
}
