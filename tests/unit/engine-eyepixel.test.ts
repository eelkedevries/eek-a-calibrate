// WP5 (spec §10.1): the eye-pixel engine — histogram equalisation against a
// reference implementation, feature finiteness on the landmark fixture, the
// feature layout ([L 60, R 60], 10 × 6 row-major, area-averaged luma) and the
// mapper rows and floors.
import assert from 'node:assert/strict';
import test from 'node:test';
import { LAMBDA_REL } from '../../src/core/constants.ts';
import { eyeMeasures } from '../../src/core/face/eyeMeasures.ts';
import { headPoseFromMatrix } from '../../src/core/face/headPose.ts';
import { CONTOUR_L, CONTOUR_R, LANDMARK_COUNT } from '../../src/core/face/landmarkSets.ts';
import { luma601, type PixelBuffer } from '../../src/core/face/quality.ts';
import { mulberry32 } from '../../src/core/maths/rng.ts';
import type { EngineFrame, FaceObservation, FrameMeta } from '../../src/core/types.ts';
import eyepixel from '../../src/engines/eyepixel/index.ts';
import { mappers, PIX_NAMES, WEBGAZER_LAMBDA } from '../../src/engines/eyepixel/mappers.ts';
import {
  areaAverageLuma,
  BOX_PAD_X,
  BOX_PAD_Y,
  EP_X_DIM,
  equaliseHistogram,
  eyeBox,
  eyePixelFeatures,
  PATCH_H,
  PATCH_SIZE,
  PATCH_W,
  type FloatRect,
} from '../../src/engines/eyepixel/patches.ts';
import { MAPPERS } from '../../src/engines/mappers.ts';
import type { EngineContext, FrameImage } from '../../src/engines/types.ts';
import { loadLandmarkFixture } from '../fixtures/landmarks/fixture.ts';

/**
 * Reference: the textbook histogram-equalisation transform (Gonzalez and
 * Woods), s = round((L − 1)·Σ_{j ≤ level} n_j / n) / (L − 1) with L = 256,
 * written independently by counting pairs.
 */
function referenceEqualise(values: readonly number[]): number[] {
  const level = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  return values.map((v) => Math.round((255 * values.filter((u) => level(u) <= level(v)).length) / values.length) / 255);
}

/**
 * Reference area average on a grid of 1/F-pixel sub-pixels: every sub-pixel
 * takes its pixel's luma and each cell is the plain mean of the sub-pixels it
 * contains. Exact when the box and cell edges lie on that grid.
 */
function referenceAreaAverage(buf: PixelBuffer, box: FloatRect, outW: number, outH: number, F: number): number[] {
  const out: number[] = [];
  const edge = (a: number, b: number, k: number, n: number) => Math.round((a + ((b - a) * k) / n) * F);
  for (let cy = 0; cy < outH; cy++) {
    for (let cx = 0; cx < outW; cx++) {
      let sum = 0;
      let count = 0;
      for (let sy = edge(box.y0, box.y1, cy, outH); sy < edge(box.y0, box.y1, cy + 1, outH); sy++) {
        for (let sx = edge(box.x0, box.x1, cx, outW); sx < edge(box.x0, box.x1, cx + 1, outW); sx++) {
          const p = (Math.floor(sy / F) * buf.width + Math.floor(sx / F)) * 4;
          sum += luma601(buf.data[p], buf.data[p + 1], buf.data[p + 2]);
          count++;
        }
      }
      out.push(sum / count);
    }
  }
  return out;
}

function image(width: number, height: number, rgb: (x: number, y: number) => [number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set([...rgb(x, y), 255], (y * width + x) * 4);
  }
  return { data, width, height };
}

function crop(buf: PixelBuffer, x: number, y: number, w: number, h: number): PixelBuffer {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) data.set(buf.data.subarray(((y + r) * buf.width + x) * 4, ((y + r) * buf.width + x + w) * 4), r * w * 4);
  return { data, width: w, height: h };
}

function fixtureInput() {
  const fx = loadLandmarkFixture();
  const pose = headPoseFromMatrix(fx.matrix);
  assert.ok(pose);
  const face: FaceObservation = {
    landmarks: fx.landmarks,
    blendshapes: fx.blendshapes,
    matrix: fx.matrix,
    pose,
    eyes: eyeMeasures(fx.landmarks, fx.blendshapes, fx.videoW, fx.videoH),
    quality: { ...fx.computed.quality, centring: [fx.computed.quality.centring[0], fx.computed.quality.centring[1]] },
    landmarkerMs: 0,
    delegate: 'CPU',
  };
  const { x, y, w, h } = fx.computed.roi;
  const roi = crop(fx.pixels, x, y, w, h);
  const meta: FrameMeta = { ...fx.meta, clock: 'captureTime' };
  return { fx, face, meta, roi, roiX: x, roiY: y };
}

const ctx: EngineContext = {
  env: { baseUrl: '/', dev: false, inWorker: false, crossOriginIsolated: false, cores: 4, webgl2: false, wasmSimd: true, offscreenCanvas: false, e2e: true },
  assetUrl: () => '',
  onProgress: () => undefined,
  signal: new AbortController().signal,
};

test('histogram equalisation against a reference implementation', () => {
  // Hand-worked: n = 4, levels 10, 10, 20, 30 → cdf 2, 2, 3, 4.
  assert.deepEqual(Array.from(equaliseHistogram([10, 10.4, 19.6, 30])), [128 / 255, 128 / 255, 191 / 255, 1]);
  // A uniform patch maps to 1 throughout; distinct ranks k = 1…60 map to round(255·k/60)/255.
  assert.deepEqual(Array.from(equaliseHistogram(new Array(60).fill(77))), new Array(60).fill(1));
  const ranks = Array.from({ length: 60 }, (_, i) => 200 - 3 * i);
  assert.deepEqual(Array.from(equaliseHistogram(ranks)), ranks.map((_, i) => Math.round((255 * (60 - i)) / 60) / 255));
  assert.equal(equaliseHistogram([]).length, 0);
  assert.throws(() => equaliseHistogram([1, Number.NaN]), /not finite/);

  const rand = mulberry32(20261101);
  for (let trial = 0; trial < 200; trial++) {
    // Few distinct levels force ties; a few values fall outside 0…255 and are clamped.
    const spread = trial % 3 === 0 ? 8 : 300;
    const values = Array.from({ length: 60 }, () => rand() * spread - (spread > 255 ? 20 : 0));
    const got = Array.from(equaliseHistogram(values));
    assert.deepEqual(got, referenceEqualise(values), `trial ${trial}`);
    // Order-preserving, in (0, 1], and the brightest value maps to 1.
    for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) if (values[i] < values[j]) assert.ok(got[i] <= got[j]);
    assert.ok(got.every((v) => v > 0 && v <= 1));
    assert.equal(Math.max(...got), 1);
  }
});

test('feature finiteness on the landmark fixture, through the pure extractor and the engine', async () => {
  const { fx, face, meta, roi, roiX, roiY } = fixtureInput();
  const out = eyePixelFeatures(face.landmarks, { roi, roiX, roiY }, fx.videoW, fx.videoH);
  assert.ok(out.status === 'ok', out.status);
  const features: Float64Array = out.x;
  assert.equal(features.length, EP_X_DIM);
  assert.ok(features.every((v) => Number.isFinite(v) && v > 0 && v <= 1));
  for (let e = 0; e < 2; e++) {
    const patch: number[] = Array.from(features.subarray(e * PATCH_SIZE, (e + 1) * PATCH_SIZE));
    assert.equal(Math.max(...patch), 1);
    // A real eye is not uniform: equalisation spreads its levels.
    assert.ok(new Set(patch).size > 20, `eye ${e} has only ${new Set(patch).size} levels`);
  }

  assert.deepEqual(eyepixel.probe(ctx.env), { ok: true });
  const engine = await eyepixel.create(ctx);
  await engine.warmUp();
  assert.equal(engine.backend, 'js');
  const frameImage = { width: fx.videoW, height: fx.videoH, roi, roiX, roiY } as unknown as FrameImage;
  const frame = await engine.extract({ meta, face, image: frameImage });
  assert.equal(frame.status, 'ok');
  assert.equal(frame.engine, 'eyepixel');
  assert.equal(frame.prior, null);
  assert.equal(frame.x?.length, eyepixel.spec.featureDim);
  assert.deepEqual(Array.from(frame.x!), Array.from(Float32Array.from(features)));
  for (const m of mappers) assert.ok(m.row(frame, { yawRad: 0, pitchRad: 0, rollRad: 0, eyeMidNorm: [0.5, 0.5], lnDistRatio: 0 })?.every(Number.isFinite), m.id);
  engine.dispose();
  await assert.rejects(engine.extract({ meta, face, image: frameImage }), /disposed/);
});

test('feature layout: padded contour boxes, area-averaged luma, [L 60, R 60] in 10 × 6 row-major order', () => {
  // The contour box is padded 10 % of its width and 30 % of its height on each side.
  const lm = new Float32Array(LANDMARK_COUNT * 3);
  const W = 200;
  const H = 100;
  const place = (contour: readonly number[], x0: number, y0: number) =>
    contour.forEach((i, k) => {
      lm[i * 3] = (x0 + (k % 4) * 10) / W;
      lm[i * 3 + 1] = (y0 + Math.floor(k / 4) * (10 / 3)) / H;
    });
  place(CONTOUR_L, 120, 40); // 30 × 10 px
  place(CONTOUR_R, 30, 45);
  const boxL = eyeBox(lm, CONTOUR_L, W, H)!;
  const boxR = eyeBox(lm, CONTOUR_R, W, H)!;
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-4;
  assert.ok(close(boxL.x0, 120 - 30 * BOX_PAD_X) && close(boxL.x1, 150 + 30 * BOX_PAD_X), JSON.stringify(boxL));
  assert.ok(close(boxL.y0, 40 - 10 * BOX_PAD_Y) && close(boxL.y1, 50 + 10 * BOX_PAD_Y), JSON.stringify(boxL));
  assert.ok(close(boxR.x0, 27) && close(boxR.x1, 63) && close(boxR.y0, 42) && close(boxR.y1, 58), JSON.stringify(boxR));

  // Horizontal ramp on the left half, vertical ramp on the right half of the image (the subject's right eye is on the image left).
  const ramps = image(W, H, (x, y) => (x < 100 ? [x * 2, x * 2, x * 2] : [y * 2, y * 2, y * 2]));
  const out = eyePixelFeatures(lm, { roi: ramps, roiX: 0, roiY: 0 }, W, H);
  assert.ok(out.status === 'ok');
  const at = (eye: number, row: number, col: number) => out.x[eye * PATCH_SIZE + row * PATCH_W + col];
  for (let row = 0; row < PATCH_H; row++) {
    for (let col = 0; col < PATCH_W; col++) {
      // L (first 60): the vertical ramp, so constant along rows and increasing down the columns.
      if (col > 0) assert.equal(at(0, row, col), at(0, row, 0));
      if (row > 0) assert.ok(at(0, row, col) > at(0, row - 1, col));
      // R (last 60): the horizontal ramp, increasing along each row.
      if (row > 0) assert.equal(at(1, row, col), at(1, 0, col));
      if (col > 0) assert.ok(at(1, row, col) > at(1, row, col - 1));
    }
  }

  // Area averaging against the reference, on random pixels: fractional boxes, cells smaller than a pixel and a buffer offset.
  const rand = mulberry32(7);
  const noise = image(64, 48, () => [Math.floor(rand() * 256), Math.floor(rand() * 256), Math.floor(rand() * 256)]);
  const sub = crop(noise, 2, 3, 62, 45);
  for (const box of [
    { x0: 3.35, y0: 5.75, x1: 41.85, y1: 20.15 },
    { x0: 10, y0: 10, x1: 30, y1: 22 },
    { x0: 0, y0: 0, x1: 64, y1: 48 },
    { x0: 20.1, y0: 30.6, x1: 26.1, y1: 33.6 },
  ]) {
    const got = Array.from(areaAverageLuma(noise, 0, 0, box, PATCH_W, PATCH_H));
    const ref = referenceAreaAverage(noise, box, PATCH_W, PATCH_H, 20);
    for (let i = 0; i < got.length; i++) assert.ok(Math.abs(got[i] - ref[i]) < 1e-9, `${JSON.stringify(box)} cell ${i}: ${got[i]} vs ${ref[i]}`);
    // The same box read from a sub-buffer placed at (2, 3) of the frame.
    if (box.x0 >= 2 && box.y0 >= 3) {
      const offset = areaAverageLuma(sub, 2, 3, box, PATCH_W, PATCH_H);
      for (let i = 0; i < got.length; i++) assert.ok(Math.abs(offset[i] - got[i]) < 1e-9, `offset cell ${i}`);
    }
  }
  // A constant image stays exactly constant.
  const flat = image(20, 20, () => [90, 90, 90]);
  assert.ok(Array.from(areaAverageLuma(flat, 0, 0, { x0: 1.37, y0: 2.11, x1: 18.9, y1: 7.5 }, PATCH_W, PATCH_H)).every((v) => Math.abs(v - luma601(90, 90, 90)) < 1e-9));
  assert.throws(() => areaAverageLuma(flat, 0, 0, { x0: -0.5, y0: 0, x1: 5, y1: 5 }, PATCH_W, PATCH_H), /inside/);
});

test('eye boxes that are too small or leave the ROI are crop-invalid; non-finite landmarks throw', async () => {
  const { fx, face, meta, roi, roiX, roiY } = fixtureInput();
  // The ROI shifted so that the face's right half falls outside it.
  const shifted = eyePixelFeatures(face.landmarks, { roi, roiX: roiX + Math.round(roi.width / 2), roiY }, fx.videoW, fx.videoH);
  assert.equal(shifted.status, 'crop-invalid');
  // A face shrunk to a few pixels.
  const tiny = Float32Array.from(face.landmarks, (v, i) => (i % 3 === 2 ? v : 0.5 + (v - 0.5) * 0.02));
  const small = eyePixelFeatures(tiny, { roi, roiX, roiY }, fx.videoW, fx.videoH);
  assert.equal(small.status, 'crop-invalid');
  assert.ok(small.status === 'crop-invalid' && /box is/.test(small.reason));
  const nan = Float32Array.from(face.landmarks);
  nan[CONTOUR_R[3] * 3 + 1] = Number.NaN;
  assert.throws(() => eyePixelFeatures(nan, { roi, roiX, roiY }, fx.videoW, fx.videoH), /not finite/);

  const engine = await eyepixel.create(ctx);
  const frame = await engine.extract({ meta, face, image: { roi, roiX: roiX + Math.round(roi.width / 2), roiY } as unknown as FrameImage });
  assert.deepEqual({ status: frame.status, x: frame.x, prior: frame.prior, weight: frame.weight }, { status: 'crop-invalid', x: null, prior: null, weight: 0 });
});

test('mapper rows and floors', () => {
  assert.equal(MAPPERS.eyepixel, mappers);
  assert.deepEqual(mappers.map((m) => m.id), ['pix-ridge', 'pix-webgazer']);
  assert.deepEqual(eyepixel.spec.mappers, ['pix-ridge', 'pix-webgazer']);
  assert.equal(eyepixel.spec.displayName, 'WebGazer method (re-implementation)');
  assert.equal(eyepixel.spec.featureVersion, 'ep-1');
  assert.equal(PIX_NAMES.length, EP_X_DIM);
  assert.equal(new Set(PIX_NAMES).size, EP_X_DIM);
  assert.deepEqual([PIX_NAMES[0], PIX_NAMES[9], PIX_NAMES[10], PIX_NAMES[59], PIX_NAMES[60], PIX_NAMES[119]], ['L r0 c0', 'L r0 c9', 'L r1 c0', 'L r5 c9', 'R r0 c0', 'R r5 c9']);

  const [ridge, webgazer] = mappers;
  for (const m of mappers) {
    assert.equal(m.engine, 'eyepixel');
    assert.equal(m.complexity, 5);
    assert.equal(m.names, PIX_NAMES);
    assert.equal(m.floors.length, EP_X_DIM);
    assert.deepEqual(m.primary, Array.from({ length: EP_X_DIM }, (_, i) => i));
    assert.equal(m.pca, undefined);
  }
  assert.ok(Array.from(ridge.floors).every((v) => v === 2 / 255));
  assert.equal(ridge.standardise, true);
  assert.deepEqual(ridge.lambdaRel, LAMBDA_REL);
  assert.equal(ridge.absoluteLambda, undefined);
  assert.equal(webgazer.standardise, false);
  assert.equal(webgazer.absoluteLambda, true);
  assert.deepEqual(webgazer.lambdaRel, [WEBGAZER_LAMBDA]);
  assert.equal(WEBGAZER_LAMBDA, 1e-5);

  const x = Float32Array.from({ length: EP_X_DIM }, (_, i) => ((i * 7) % 256) / 255);
  const frame: EngineFrame = { engine: 'eyepixel', status: 'ok', x, prior: null, weight: 1, computeMs: 0 };
  const c = { yawRad: 0.1, pitchRad: 0, rollRad: 0, eyeMidNorm: [0.5, 0.5] as const, lnDistRatio: 0 };
  assert.deepEqual(Array.from(ridge.row(frame, c)!), Array.from(x));
  assert.deepEqual(Array.from(webgazer.row(frame, c)!), Array.from(x, (v) => v * 255));
  // The rows ignore the context: no pose inputs, faithful to WebGazer.
  assert.deepEqual(ridge.row(frame, { ...c, lnDistRatio: Number.NaN }), ridge.row(frame, c));
  for (const m of mappers) {
    for (const f of [
      { ...frame, status: 'crop-invalid' as const, x: null },
      { ...frame, engine: 'geometric' as const },
      { ...frame, x: x.subarray(0, 119) },
      { ...frame, x: Float32Array.from(x, (v, i) => (i === 3 ? Number.NaN : v)) },
    ]) {
      assert.equal(m.row(f, c), null);
    }
  }
});
