// WP4: face quality (spec §4.3) and the ROI rectangle (§4.6) on synthetic
// buffers, and agreement with the browser pipeline on the committed fixture
// (which also shows that the fixture pixels are the pixels the worker saw).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundsToPixelRect,
  faceQuality,
  glareFraction,
  landmarkBounds,
  luma601,
  lumaStats,
  meanLuma,
  rectInBuffer,
  type PixelBuffer,
  type PixelRect,
} from '../../src/core/face/quality.ts';
import { roiRect } from '../../src/vision/frameImage.ts';
import { loadLandmarkFixture } from '../fixtures/landmarks/fixture.ts';

function solid(width: number, height: number, rgb: [number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...rgb, 255], i * 4);
  return { data, width, height };
}

function copyRect(src: PixelBuffer, r: PixelRect): PixelBuffer {
  const data = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) data.set(src.data.subarray(((r.y + y) * src.width + r.x) * 4, ((r.y + y) * src.width + r.x + r.w) * 4), y * r.w * 4);
  return { data, width: r.w, height: r.h };
}

test('BT.601 luma, mean and population SD', () => {
  assert.equal(luma601(255, 255, 255), 255);
  assert.ok(Math.abs(luma601(100, 0, 0) - 29.9) < 1e-12);
  const buf = solid(4, 2, [0, 0, 0]);
  // Two columns white: mean 127.5, SD 127.5.
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) buf.data.set([255, 255, 255, 255], (y * 4 + x) * 4);
  const all = lumaStats(buf, { x: 0, y: 0, w: 4, h: 2 });
  assert.ok(Math.abs(all.mean - 127.5) < 1e-9 && Math.abs(all.sd - 127.5) < 1e-9 && all.n === 8);
  assert.ok(Math.abs(meanLuma(buf) - 127.5) < 1e-9);
  const empty = lumaStats(buf, { x: 1, y: 1, w: 0, h: 1 });
  assert.ok(Number.isNaN(empty.mean) && Number.isNaN(empty.sd) && empty.n === 0);
});

test('glare counts luma ≥ 245 over the union of boxes; empty boxes give NaN', () => {
  const buf = solid(10, 10, [100, 100, 100]);
  buf.data.set([250, 250, 250, 255], (2 * 10 + 2) * 4);
  buf.data.set([244, 244, 244, 255], (2 * 10 + 3) * 4);
  const boxes = [{ x: 0, y: 0, w: 5, h: 5 }, { x: 5, y: 5, w: 5, h: 5 }];
  assert.ok(Math.abs(glareFraction(buf, boxes) - 1 / 50) < 1e-12);
  assert.ok(Number.isNaN(glareFraction(buf, [{ x: 0, y: 0, w: 0, h: 0 }])));
});

test('pixel rectangles clip to the frame and to a buffer placed inside it', () => {
  assert.deepEqual(boundsToPixelRect({ minX: 0.1, minY: 0.2, maxX: 0.3, maxY: 0.4 }, 100, 50), { x: 10, y: 10, w: 20, h: 10 });
  assert.deepEqual(boundsToPixelRect({ minX: -0.2, minY: -1, maxX: 1.3, maxY: 2 }, 100, 50), { x: 0, y: 0, w: 100, h: 50 });
  assert.deepEqual(boundsToPixelRect({ minX: 1.2, minY: 0, maxX: 1.4, maxY: 1 }, 100, 50).w, 0);
  const buf = solid(20, 20, [0, 0, 0]);
  assert.deepEqual(rectInBuffer({ x: 5, y: 5, w: 30, h: 10 }, buf, 10, 0), { x: 0, y: 5, w: 20, h: 10 });
  assert.deepEqual(rectInBuffer({ x: 0, y: 0, w: 5, h: 5 }, buf, 10, 10).w, 0);
});

test('the ROI is the landmark box enlarged by 25 % per side, clipped; null when off-frame or not finite', () => {
  // Coordinates exact in float32: box x 0.375–0.625, y 0.25–0.75.
  const lm = new Float32Array(478 * 3);
  for (let i = 0; i < 478; i++) {
    lm[i * 3] = i % 2 === 0 ? 0.375 : 0.625;
    lm[i * 3 + 1] = i % 3 === 0 ? 0.75 : 0.25;
  }
  // Pads of 0.0625 and 0.125 → x 0.3125–0.6875, y 0.125–0.875 of a 256 × 128 frame.
  assert.deepEqual(roiRect(lm, 256, 128), { x: 80, y: 16, w: 96, h: 96 });
  const edge = Float32Array.from(lm, (v, i) => (i % 3 === 0 ? v + 0.375 : v));
  assert.deepEqual(roiRect(edge, 256, 128), { x: 176, y: 16, w: 80, h: 96 });
  assert.equal(roiRect(Float32Array.from(lm, (v, i) => (i % 3 === 0 ? v + 2 : v)), 256, 128), null);
  assert.equal(roiRect(Float32Array.from(lm, (v, i) => (i === 7 ? Number.NaN : v)), 256, 128), null);
});

test('quality on the fixture matches the browser pipeline', () => {
  const fx = loadLandmarkFixture();
  const rect = roiRect(fx.landmarks, fx.videoW, fx.videoH)!;
  assert.deepEqual(rect, fx.computed.roi);
  const roi = copyRect(fx.pixels, rect);
  const ref = fx.computed.quality;
  // The browser measured frame luma on a 32×18 downscale; recover it from its own backlight.
  const browserFrameLuma = ref.lumaMean / ref.backlight;
  const q = faceQuality({ landmarks: fx.landmarks, videoW: fx.videoW, videoH: fx.videoH, roi, roiX: rect.x, roiY: rect.y, frameLuma: browserFrameLuma });
  assert.ok(Math.abs(q.faceWidthFrac - ref.faceWidthFrac) < 1e-12);
  assert.ok(Math.abs(q.lumaMean - ref.lumaMean) < 1e-9, `luma ${q.lumaMean} vs ${ref.lumaMean}`);
  assert.ok(Math.abs(q.lumaSd - ref.lumaSd) < 1e-9, `sd ${q.lumaSd} vs ${ref.lumaSd}`);
  assert.ok(Math.abs(q.glare - ref.glare) < 1e-12);
  assert.ok(Math.abs(q.backlight - ref.backlight) < 1e-9);
  q.centring.forEach((v, i) => assert.ok(Math.abs(v - ref.centring[i]) < 1e-12));
  // The downscaled frame luma is close to the full-resolution mean.
  const full = meanLuma(fx.pixels);
  assert.ok(Math.abs(browserFrameLuma - full) / full < 0.05, `frame luma ${browserFrameLuma} vs ${full}`);
  const bounds = landmarkBounds(fx.landmarks);
  assert.ok(bounds.minX > 0 && bounds.maxX < 1 && bounds.minY > 0 && bounds.maxY < 1);
});
