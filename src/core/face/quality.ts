// Face quality on the region of interest (spec §4.3). DOM-free: the pixels
// arrive as plain RGBA buffers (ImageData satisfies PixelBuffer).
import type { FaceQuality } from '../types.ts';
import { CONTOUR_L, CONTOUR_R, LANDMARK_STRIDE, lmX, lmY } from './landmarkSets.ts';

export interface PixelBuffer {
  readonly data: Uint8ClampedArray | Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** An integer pixel rectangle: columns x … x+w−1, rows y … y+h−1. */
export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface NormBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export const GLARE_LUMA = 245;
/** Frame luma is measured on a downscale of the whole frame to this size. */
export const FRAME_LUMA_SIZE = { w: 32, h: 18 } as const;

/** BT.601 luma of an 8-bit gamma-encoded RGB triple. */
export function luma601(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Bounding box of the given landmarks (all of them by default), normalised; all NaN if any coordinate is not finite. */
export function landmarkBounds(lm: ArrayLike<number>, indices?: readonly number[]): NormBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const count = indices ? indices.length : Math.floor(lm.length / LANDMARK_STRIDE);
  for (let k = 0; k < count; k++) {
    const i = indices ? indices[k] : k;
    const x = lmX(lm, i);
    const y = lmY(lm, i);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { minX: Number.NaN, minY: Number.NaN, maxX: Number.NaN, maxY: Number.NaN };
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * The pixels whose centres fall inside normalised bounds, clipped to a
 * width × height frame. Empty (w or h = 0) when the bounds miss the frame.
 */
export function boundsToPixelRect(b: NormBounds, width: number, height: number): PixelRect {
  const x0 = clampInt(Math.floor(b.minX * width), 0, width);
  const y0 = clampInt(Math.floor(b.minY * height), 0, height);
  const x1 = clampInt(Math.ceil(b.maxX * width), 0, width);
  const y1 = clampInt(Math.ceil(b.maxY * height), 0, height);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

function clampInt(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/** Intersects a rectangle given in frame pixels with a buffer placed at (offsetX, offsetY), in buffer coordinates. */
export function rectInBuffer(rect: PixelRect, buf: PixelBuffer, offsetX: number, offsetY: number): PixelRect {
  const x0 = Math.max(0, rect.x - offsetX);
  const y0 = Math.max(0, rect.y - offsetY);
  const x1 = Math.min(buf.width, rect.x + rect.w - offsetX);
  const y1 = Math.min(buf.height, rect.y + rect.h - offsetY);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Mean and population SD of BT.601 luma inside a rectangle of the buffer; NaN for an empty rectangle. */
export function lumaStats(buf: PixelBuffer, rect: PixelRect): { mean: number; sd: number; n: number } {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  const { data, width } = buf;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    let p = (y * width + rect.x) * 4;
    for (let x = 0; x < rect.w; x++, p += 4) {
      const v = luma601(data[p], data[p + 1], data[p + 2]);
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (n === 0) return { mean: Number.NaN, sd: Number.NaN, n };
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), n };
}

/** Mean BT.601 luma of a whole buffer. */
export function meanLuma(buf: PixelBuffer): number {
  return lumaStats(buf, { x: 0, y: 0, w: buf.width, h: buf.height }).mean;
}

/** Fraction of pixels with luma ≥ GLARE_LUMA over the union of the given rectangles; NaN if they are all empty. */
export function glareFraction(buf: PixelBuffer, rects: readonly PixelRect[], threshold = GLARE_LUMA): number {
  let bright = 0;
  let n = 0;
  const { data, width } = buf;
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      let p = (y * width + rect.x) * 4;
      for (let x = 0; x < rect.w; x++, p += 4) {
        if (luma601(data[p], data[p + 1], data[p + 2]) >= threshold) bright++;
        n++;
      }
    }
  }
  return n === 0 ? Number.NaN : bright / n;
}

export interface FaceQualityInput {
  landmarks: ArrayLike<number>;
  videoW: number;
  videoH: number;
  /** Frame pixels around the face, placed at (roiX, roiY) in the frame. */
  roi: PixelBuffer;
  roiX: number;
  roiY: number;
  /** Mean luma of the whole frame (from the FRAME_LUMA_SIZE downscale). */
  frameLuma: number;
}

/**
 * faceWidthFrac and centring come from the landmark bounding box; lumaMean,
 * lumaSd and glare from the ROI pixels inside the face box and the two eye
 * contour boxes; backlight = face luma / frame luma (NaN for a black frame).
 * The two eye boxes overlap only if the face is degenerate, and are then
 * counted twice.
 */
export function faceQuality(q: FaceQualityInput): FaceQuality {
  const face = landmarkBounds(q.landmarks);
  const faceRect = rectInBuffer(boundsToPixelRect(face, q.videoW, q.videoH), q.roi, q.roiX, q.roiY);
  const { mean, sd } = lumaStats(q.roi, faceRect);
  const eyeRects = [CONTOUR_L, CONTOUR_R].map((contour) =>
    rectInBuffer(boundsToPixelRect(landmarkBounds(q.landmarks, contour), q.videoW, q.videoH), q.roi, q.roiX, q.roiY),
  );
  return {
    faceWidthFrac: face.maxX - face.minX,
    lumaMean: mean,
    lumaSd: sd,
    backlight: q.frameLuma > 0 ? mean / q.frameLuma : Number.NaN,
    glare: glareFraction(q.roi, eyeRects),
    centring: [(face.minX + face.maxX) / 2 - 0.5, (face.minY + face.maxY) / 2 - 0.5],
  };
}
