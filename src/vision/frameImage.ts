// One FrameImage per frame (spec §4.6): the face ROI as ImageData and a
// resampling `crop`, both drawn from the frame's ImageBitmap. The rectangle
// maths is pure (`roiRect`); the canvases are reused across frames.
import { FRAME_LUMA_SIZE, landmarkBounds, meanLuma, type PixelRect } from '../core/face/quality.ts';
import type { FrameImage } from '../engines/types.ts';
import { context2d, type ScratchCanvas } from '../platform/capabilities.ts';

/** The ROI is the landmark bounding box enlarged by this fraction of its size on each side. */
export const ROI_PAD = 0.25;

/**
 * The ROI in integer video pixels, clipped to the frame; null when nothing of
 * it lies inside the frame or the landmarks are not finite.
 */
export function roiRect(landmarks: ArrayLike<number>, videoW: number, videoH: number, pad = ROI_PAD): PixelRect | null {
  const b = landmarkBounds(landmarks);
  if (![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) return null;
  const padX = (b.maxX - b.minX) * pad;
  const padY = (b.maxY - b.minY) * pad;
  const x0 = Math.max(0, Math.floor((b.minX - padX) * videoW));
  const y0 = Math.max(0, Math.floor((b.minY - padY) * videoH));
  const x1 = Math.min(videoW, Math.ceil((b.maxX + padX) * videoW));
  const y1 = Math.min(videoH, Math.ceil((b.maxY + padY) * videoH));
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

interface Surface {
  canvas: ScratchCanvas;
  ctx: Ctx2D;
}

/**
 * The reusable canvases behind every FrameImage of one vision core. Each frame
 * is read back from its (usually GPU-backed) ImageBitmap once, into a
 * CPU-side frame canvas; the ROI, the frame luma and the crops all read from
 * that copy, whose pixels are the bitmap's exactly.
 */
export class FrameImagePool {
  private readonly make: (w: number, h: number) => ScratchCanvas;
  private frame: Surface | null = null;
  private luma: Surface | null = null;
  private readonly crops = new Map<string, Surface>();

  constructor(makeCanvas: (w: number, h: number) => ScratchCanvas) {
    this.make = makeCanvas;
  }

  private surface(w: number, h: number): Surface {
    const canvas = this.make(w, h);
    return { canvas, ctx: context2d(canvas) };
  }

  /** Copies the whole bitmap into the frame canvas (the one readback per frame). */
  private load(bitmap: ImageBitmap): Surface {
    const { width, height } = bitmap;
    if (!this.frame || this.frame.canvas.width !== width || this.frame.canvas.height !== height) {
      if (this.frame) {
        this.frame.canvas.width = width;
        this.frame.canvas.height = height;
      } else {
        this.frame = this.surface(width, height);
      }
    }
    const { ctx } = this.frame;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);
    return this.frame;
  }

  /** Mean BT.601 luma of the whole frame, from a FRAME_LUMA_SIZE downscale of the loaded frame. */
  private frameLumaOf(frame: Surface): number {
    if (!this.luma) this.luma = this.surface(FRAME_LUMA_SIZE.w, FRAME_LUMA_SIZE.h);
    const { ctx } = this.luma;
    ctx.clearRect(0, 0, FRAME_LUMA_SIZE.w, FRAME_LUMA_SIZE.h);
    ctx.drawImage(frame.canvas, 0, 0, FRAME_LUMA_SIZE.w, FRAME_LUMA_SIZE.h);
    return meanLuma(ctx.getImageData(0, 0, FRAME_LUMA_SIZE.w, FRAME_LUMA_SIZE.h));
  }

  /**
   * drawImage(frame, sx, sy, sw, sh, 0, 0, dw, dh) on a cleared, reusable
   * dw × dh canvas, with the browser's default smoothing (Peekr's resampling).
   * The part of the source rectangle outside the frame, or a degenerate
   * rectangle, reads as 0 including alpha.
   */
  private cropOf(frame: Surface, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): ImageData {
    if (!(Number.isInteger(dw) && Number.isInteger(dh) && dw > 0 && dh > 0)) {
      throw new RangeError(`crop: the output size must be positive integers, not ${dw}×${dh}`);
    }
    const key = `${dw}x${dh}`;
    let surface = this.crops.get(key);
    if (!surface) {
      surface = this.surface(dw, dh);
      this.crops.set(key, surface);
    }
    const { ctx } = surface;
    ctx.clearRect(0, 0, dw, dh);
    if ([sx, sy, sw, sh].every(Number.isFinite) && sw !== 0 && sh !== 0) {
      ctx.drawImage(frame.canvas, sx, sy, sw, sh, 0, 0, dw, dh);
    }
    return ctx.getImageData(0, 0, dw, dh);
  }

  /**
   * Builds the frame's FrameImage and measures the frame luma. The bitmap stays
   * owned by the caller, which closes it after the engines ran; `crop` is valid
   * until the next frame is loaded.
   */
  prepare(bitmap: ImageBitmap, rect: PixelRect): { image: FrameImage; frameLuma: number } {
    const frame = this.load(bitmap);
    const roi = frame.ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    const image: FrameImage = {
      width: bitmap.width,
      height: bitmap.height,
      bitmap,
      roi,
      roiX: rect.x,
      roiY: rect.y,
      crop: (sx, sy, sw, sh, dw, dh) => this.cropOf(frame, sx, sy, sw, sh, dw, dh),
    };
    return { image, frameLuma: this.frameLumaOf(frame) };
  }

  dispose(): void {
    // Shrinking the canvases releases their backing stores promptly.
    for (const surface of [this.frame, this.luma, ...this.crops.values()]) {
      if (!surface) continue;
      surface.canvas.width = 0;
      surface.canvas.height = 0;
    }
    this.frame = null;
    this.luma = null;
    this.crops.clear();
  }
}
