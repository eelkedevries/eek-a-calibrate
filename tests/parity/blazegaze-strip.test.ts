// WP6 parity, item 1 (spec §10.3): the composite eye strip against the
// vendored upstream obtainEyePatch (warp to 512 × 512, crop, resize: two
// nearest-neighbour passes) on the committed fixture frame and landmarks, and
// on perturbed faces that push the strip over the frame edge.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LANDMARK_COUNT, LANDMARK_STRIDE } from '../../src/core/face/landmarkSets.ts';
import {
  coversPlan,
  pixelLandmarks,
  planEyeStrip,
  sampleEyeStrip,
  STRIP_H,
  STRIP_W,
  stripGeometry,
  stripTensorData,
  type FramePixels,
  type StripGeometry,
} from '../../src/engines/blazegaze/preprocess.ts';
import { obtainEyePatch } from '../../src/engines/blazegaze/vendor/mathUtils.ts';
import { loadLandmarkFixture } from '../fixtures/landmarks/fixture.ts';

// The minimal ImageData that upstream's warp and crop construct (Node has none).
class ImageDataPolyfill {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  constructor(a: number | Uint8ClampedArray, b: number, c?: number) {
    if (typeof a === 'number') {
      if (!(Number.isInteger(a) && Number.isInteger(b) && a > 0 && b > 0)) throw new RangeError(`ImageData: invalid size ${a} × ${b}`);
      this.width = a;
      this.height = b;
      this.data = new Uint8ClampedArray(a * b * 4);
    } else {
      this.data = a;
      this.width = b;
      this.height = c ?? a.length / 4 / b;
    }
  }
}
const g = globalThis as { ImageData?: unknown };
g.ImageData ??= ImageDataPolyfill;

const fx = loadLandmarkFixture();
const W = fx.videoW;
const H = fx.videoH;
const frame = new ImageDataPolyfill(fx.pixels.data, W, H) as unknown as ImageData;
const N = STRIP_W * STRIP_H;

function ours(landmarks: Float32Array, src?: FramePixels): Uint8ClampedArray {
  const geometry = stripGeometry(pixelLandmarks(landmarks, W, H));
  assert.ok(geometry.ok, geometry.ok ? '' : geometry.reason);
  const plan = planEyeStrip(geometry, W, H);
  return sampleEyeStrip(plan, src ?? { buffer: fx.pixels, x: 0, y: 0 });
}

function upstream(landmarks: Float32Array): ImageData {
  return obtainEyePatch(frame, pixelLandmarks(landmarks, W, H));
}

/** A strip pixel next to (or at) a black out-of-range pixel or the strip edge. */
function isBoundary(a: Uint8ClampedArray, b: Uint8ClampedArray, k: number): boolean {
  const x = k % STRIP_W;
  const y = Math.floor(k / STRIP_W);
  if (x === 0 || y === 0 || x === STRIP_W - 1 || y === STRIP_H - 1) return true;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const j = (y + dy) * STRIP_W + (x + dx);
      if (a[j * 4 + 3] === 0 || b[j * 4 + 3] === 0) return true;
    }
  }
  return false;
}

function assertParity(mine: Uint8ClampedArray, ref: ImageData, label: string): void {
  assert.equal(ref.width, STRIP_W, label);
  assert.equal(ref.height, STRIP_H, label);
  assert.equal(mine.length, ref.data.length, label);
  let identical = 0;
  const interior: number[] = [];
  for (let k = 0; k < N; k++) {
    const s = k * 4;
    const same = mine[s] === ref.data[s] && mine[s + 1] === ref.data[s + 1] && mine[s + 2] === ref.data[s + 2] && mine[s + 3] === ref.data[s + 3];
    if (same) identical++;
    else if (!isBoundary(mine, ref.data, k)) interior.push(k);
  }
  // The acceptance criterion (≥ 99.9 % identical, differences only at boundaries) …
  assert.ok(identical / N >= 0.999, `${label}: ${identical} of ${N} pixels identical`);
  assert.deepEqual(interior, [], `${label}: pixels differ away from a boundary`);
  // … and, since the arithmetic is upstream's own, in fact every pixel.
  assert.equal(identical, N, `${label}: ${N - identical} pixels differ`);
}

function transform(landmarks: Float32Array, f: (x: number, y: number) => [number, number]): Float32Array {
  const out = Float32Array.from(landmarks);
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const [x, y] = f(out[i * LANDMARK_STRIDE], out[i * LANDMARK_STRIDE + 1]);
    out[i * LANDMARK_STRIDE] = x;
    out[i * LANDMARK_STRIDE + 1] = y;
  }
  return out;
}

const NOSE = 4;
const cx = fx.landmarks[NOSE * LANDMARK_STRIDE];
const cy = fx.landmarks[NOSE * LANDMARK_STRIDE + 1];

test('the composite strip is bit-identical to upstream obtainEyePatch on the fixture frame', () => {
  const mine = ours(fx.landmarks);
  assertParity(mine, upstream(fx.landmarks), 'fixture');
  // The fixture strip is a real face: mostly frame pixels, not black.
  let opaque = 0;
  for (let k = 0; k < N; k++) if (mine[k * 4 + 3] === 255) opaque++;
  assert.ok(opaque / N > 0.99, `only ${opaque} of ${N} strip pixels come from the frame`);
});

test('sampling from the face ROI gives the same strip as sampling from the whole frame', () => {
  const r = fx.computed.roi;
  const roi = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) roi.set(fx.pixels.data.subarray(((r.y + y) * W + r.x) * 4, ((r.y + y) * W + r.x + r.w) * 4), y * r.w * 4);
  const src: FramePixels = { buffer: { data: roi, width: r.w, height: r.h }, x: r.x, y: r.y };
  const geometry = stripGeometry(pixelLandmarks(fx.landmarks, W, H)) as StripGeometry;
  assert.ok(coversPlan(src, planEyeStrip(geometry, W, H)), 'the fixture strip lies inside the ROI');
  assert.deepEqual(ours(fx.landmarks, src), ours(fx.landmarks));
});

test('faces that cross the frame edge, rotated and enlarged faces match upstream too', () => {
  const cases: [string, Float32Array][] = [
    ['shifted left over the edge', transform(fx.landmarks, (x, y) => [x - 0.48, y])],
    ['shifted up and right over the corner', transform(fx.landmarks, (x, y) => [x + 0.35, y - 0.3])],
    ['enlarged 2.2× about the nose', transform(fx.landmarks, (x, y) => [cx + (x - cx) * 2.2, cy + (y - cy) * 2.2])],
    ['rolled 25° about the nose', transform(fx.landmarks, (x, y) => {
      const a = (25 * Math.PI) / 180;
      const dx = (x - cx) * W;
      const dy = (y - cy) * H;
      return [cx + (dx * Math.cos(a) - dy * Math.sin(a)) / W, cy + (dx * Math.sin(a) + dy * Math.cos(a)) / H];
    })],
    ['shrunk to a distant face', transform(fx.landmarks, (x, y) => [cx + (x - cx) * 0.35, cy + (y - cy) * 0.35])],
  ];
  for (const [label, landmarks] of cases) {
    const mine = ours(landmarks);
    assertParity(mine, upstream(landmarks), label);
  }
  // The edge cases really do reach outside the frame (black, alpha 0).
  const edge = ours(cases[0][1]);
  let black = 0;
  for (let k = 0; k < N; k++) if (edge[k * 4 + 3] === 0) black++;
  assert.ok(black > N * 0.2, `the shifted strip has only ${black} black pixels`);
});

test('a pixel source that misses part of the strip is refused, not read', () => {
  const geometry = stripGeometry(pixelLandmarks(fx.landmarks, W, H)) as StripGeometry;
  const plan = planEyeStrip(geometry, W, H);
  const b = plan.bounds!;
  const small: FramePixels = { buffer: { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 }, x: b.x, y: b.y };
  assert.equal(coversPlan(small, plan), false);
  assert.throws(() => sampleEyeStrip(plan, small), RangeError);
});

test('degenerate landmarks give an invalid strip with a reason', () => {
  const nan = Float32Array.from(fx.landmarks);
  nan[151 * LANDMARK_STRIDE + 1] = Number.NaN;
  const r1 = stripGeometry(pixelLandmarks(nan, W, H));
  assert.equal(r1.ok, false);

  // Landmark 195 above 151: an eye band with no rows (upstream's ImageData would throw).
  const flipped = Float32Array.from(fx.landmarks);
  flipped[195 * LANDMARK_STRIDE + 1] = flipped[151 * LANDMARK_STRIDE + 1] - 0.01;
  const r2 = stripGeometry(pixelLandmarks(flipped, W, H));
  assert.equal(r2.ok, false);
  assert.throws(() => upstream(flipped));

  // Every landmark on one point: the homography is degenerate.
  const collapsed = transform(fx.landmarks, () => [0.5, 0.5]);
  assert.equal(stripGeometry(pixelLandmarks(collapsed, W, H)).ok, false);

  assert.throws(() => pixelLandmarks(new Float32Array(10), W, H), RangeError);
});

test('the encoder input is RGB / 255 in float32, row-major 128 × 512 × 3, alpha dropped', () => {
  const rgba = ours(fx.landmarks);
  const t = stripTensorData(rgba);
  assert.equal(t.length, N * 3);
  for (const k of [0, 777, 40_000, N - 1]) {
    for (let c = 0; c < 3; c++) assert.equal(t[k * 3 + c], Math.fround(rgba[k * 4 + c] / 255));
  }
  assert.ok(t.every((v) => v >= 0 && v <= 1));
  assert.throws(() => stripTensorData(new Uint8ClampedArray(8)), RangeError);
});
