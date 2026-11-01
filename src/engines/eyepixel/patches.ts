// The eye-pixel engine's features (spec §4.6.4, featureVersion ep-1): a
// clean-room re-implementation of the WebGazer method from its published
// description (Papoutsaki et al., IJCAI 2016) and this specification; no
// WebGazer code is used. Pure and DOM-free: pixels arrive as RGBA buffers
// (ImageData satisfies PixelBuffer).
//
// Pixel geometry: video pixel (i, j) covers [i, i+1) × [j, j+1), so a
// normalised landmark x maps to the continuous position x·videoW.
import { CONTOUR_L, CONTOUR_R, lmX, lmY } from '../../core/face/landmarkSets.ts';
import { luma601, type PixelBuffer } from '../../core/face/quality.ts';

export const EP_FEATURE_VERSION = 'ep-1';
export const PATCH_W = 10;
export const PATCH_H = 6;
export const PATCH_SIZE = PATCH_W * PATCH_H;
/** EngineFrame.x: [L 60, R 60], each patch row-major (PATCH_W columns, PATCH_H rows), L the subject's left eye. */
export const EP_X_DIM = 2 * PATCH_SIZE;
/** Padding of the contour bounding box on each side, as a fraction of its width and height. */
export const BOX_PAD_X = 0.1;
export const BOX_PAD_Y = 0.3;
/**
 * A padded eye box narrower or shorter than this (video px) holds no usable
 * eye structure and gives 'crop-invalid'; the same 4 px guard as Peekr's
 * boxes (spec §4.6.3).
 */
export const MIN_BOX_PX = 4;
export const HISTOGRAM_BINS = 256;

/** A rectangle in continuous video pixels: [x0, x1) × [y0, y1). */
export interface FloatRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The bounding box of a contour's landmarks in video pixels, padded BOX_PAD_X
 * horizontally and BOX_PAD_Y vertically on each side. Null if a landmark is not
 * finite.
 */
export function eyeBox(lm: ArrayLike<number>, contour: readonly number[], videoW: number, videoH: number): FloatRect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const i of contour) {
    const x = lmX(lm, i) * videoW;
    const y = lmY(lm, i) * videoH;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;
  const padX = (maxX - minX) * BOX_PAD_X;
  const padY = (maxY - minY) * BOX_PAD_Y;
  return { x0: minX - padX, y0: minY - padY, x1: maxX + padX, y1: maxY + padY };
}

/** True when the box lies inside a buffer placed at (offsetX, offsetY) in video pixels. */
export function boxInside(box: FloatRect, buf: PixelBuffer, offsetX: number, offsetY: number): boolean {
  return box.x0 >= offsetX && box.y0 >= offsetY && box.x1 <= offsetX + buf.width && box.y1 <= offsetY + buf.height && box.x1 > box.x0 && box.y1 > box.y0;
}

/** Overlap of pixel k ([k, k+1)) with [a, b). */
function overlap(k: number, a: number, b: number): number {
  return Math.min(k + 1, b) - Math.max(k, a);
}

/**
 * Resizes the box to outW × outH by area averaging of BT.601 luma: each output
 * cell is the mean over its rectangle, every pixel weighted by the area it
 * shares with the cell. The buffer sits at (offsetX, offsetY) in video pixels
 * and the box must lie inside it (RangeError otherwise). Output row-major.
 */
export function areaAverageLuma(
  buf: PixelBuffer,
  offsetX: number,
  offsetY: number,
  box: FloatRect,
  outW: number,
  outH: number,
  out: Float64Array = new Float64Array(outW * outH),
): Float64Array {
  if (!(Number.isInteger(outW) && Number.isInteger(outH) && outW > 0 && outH > 0)) throw new RangeError(`invalid output size ${outW} × ${outH}`);
  if (out.length !== outW * outH) throw new RangeError(`the output holds ${out.length} values, not ${outW * outH}`);
  if (buf.data.length < buf.width * buf.height * 4) throw new RangeError('the pixel buffer is shorter than width × height × 4');
  if (![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) || !boxInside(box, buf, offsetX, offsetY)) {
    throw new RangeError('the box must be finite, non-empty and inside the pixel buffer');
  }

  // Luma of the pixels the box touches, in buffer coordinates.
  const i0 = Math.floor(box.x0 - offsetX);
  const j0 = Math.floor(box.y0 - offsetY);
  const i1 = Math.min(buf.width, Math.ceil(box.x1 - offsetX));
  const j1 = Math.min(buf.height, Math.ceil(box.y1 - offsetY));
  const rw = i1 - i0;
  const luma = new Float64Array(rw * (j1 - j0));
  for (let j = j0; j < j1; j++) {
    let p = (j * buf.width + i0) * 4;
    for (let i = i0; i < i1; i++, p += 4) luma[(j - j0) * rw + (i - i0)] = luma601(buf.data[p], buf.data[p + 1], buf.data[p + 2]);
  }

  const bx0 = box.x0 - offsetX;
  const by0 = box.y0 - offsetY;
  const cw = (box.x1 - box.x0) / outW;
  const ch = (box.y1 - box.y0) / outH;
  for (let cy = 0; cy < outH; cy++) {
    const v0 = by0 + cy * ch;
    const v1 = cy === outH - 1 ? box.y1 - offsetY : by0 + (cy + 1) * ch;
    for (let cx = 0; cx < outW; cx++) {
      const u0 = bx0 + cx * cw;
      const u1 = cx === outW - 1 ? box.x1 - offsetX : bx0 + (cx + 1) * cw;
      let sum = 0;
      let area = 0;
      for (let j = Math.max(j0, Math.floor(v0)); j < Math.min(j1, Math.ceil(v1)); j++) {
        const wy = overlap(j, v0, v1);
        if (!(wy > 0)) continue;
        for (let i = Math.max(i0, Math.floor(u0)); i < Math.min(i1, Math.ceil(u1)); i++) {
          const wx = overlap(i, u0, u1);
          if (!(wx > 0)) continue;
          sum += wx * wy * luma[(j - j0) * rw + (i - i0)];
          area += wx * wy;
        }
      }
      // area equals cw·ch up to rounding; dividing by the summed weights keeps a constant image exactly constant.
      out[cy * outW + cx] = sum / area;
    }
  }
  return out;
}

/**
 * Histogram equalisation as in WebGazer: out = round(255·cdf(v)/n)/255, with
 * cdf the cumulative count of a 256-bin histogram over the n values. Values
 * are rounded to the nearest 8-bit level (and clamped to 0…255) to find their
 * bin. A patch of equal values maps to 1 throughout. Throws on a non-finite
 * value.
 */
export function equaliseHistogram(values: ArrayLike<number>, out: Float64Array = new Float64Array(values.length)): Float64Array {
  const n = values.length;
  if (out.length !== n) throw new RangeError(`the output holds ${out.length} values, not ${n}`);
  if (n === 0) return out;
  const levels = new Uint8Array(n);
  const cdf = new Uint32Array(HISTOGRAM_BINS);
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) throw new RangeError(`histogram equalisation: value ${i} is not finite`);
    levels[i] = Math.min(HISTOGRAM_BINS - 1, Math.max(0, Math.round(v)));
    cdf[levels[i]]++;
  }
  for (let b = 1; b < HISTOGRAM_BINS; b++) cdf[b] += cdf[b - 1];
  for (let i = 0; i < n; i++) out[i] = Math.round((255 * cdf[levels[i]]) / n) / 255;
  return out;
}

export type EyePixelResult = { status: 'ok'; x: Float64Array } | { status: 'crop-invalid'; reason: string };

export interface RoiImage {
  readonly roi: PixelBuffer;
  readonly roiX: number;
  readonly roiY: number;
}

/**
 * The 120 eye-pixel features of one frame: per eye the padded contour box,
 * resized to 10 × 6 by area averaging of luma over the ROI, then
 * histogram-equalised. 'crop-invalid' when a box is smaller than MIN_BOX_PX or
 * leaves the ROI (which is clipped to the frame). Throws on non-finite
 * landmarks or an invalid frame size.
 */
export function eyePixelFeatures(lm: ArrayLike<number>, image: RoiImage, videoW: number, videoH: number): EyePixelResult {
  if (!(Number.isFinite(videoW) && Number.isFinite(videoH) && videoW > 0 && videoH > 0)) throw new RangeError(`invalid frame size ${videoW} × ${videoH}`);
  const x = new Float64Array(EP_X_DIM);
  const patch = new Float64Array(PATCH_SIZE);
  const eyes = [
    { name: 'left', contour: CONTOUR_L },
    { name: 'right', contour: CONTOUR_R },
  ] as const;
  for (let e = 0; e < eyes.length; e++) {
    const { name, contour } = eyes[e];
    const box = eyeBox(lm, contour, videoW, videoH);
    if (!box) throw new RangeError(`the ${name} eye contour landmarks are not finite`);
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    if (!(w >= MIN_BOX_PX && h >= MIN_BOX_PX)) return { status: 'crop-invalid', reason: `the ${name} eye box is ${w.toFixed(1)} × ${h.toFixed(1)} px` };
    if (!boxInside(box, image.roi, image.roiX, image.roiY)) return { status: 'crop-invalid', reason: `the ${name} eye box leaves the face region of the frame` };
    areaAverageLuma(image.roi, image.roiX, image.roiY, box, PATCH_W, PATCH_H, patch);
    x.set(equaliseHistogram(patch), e * PATCH_SIZE);
  }
  return { status: 'ok', x };
}
