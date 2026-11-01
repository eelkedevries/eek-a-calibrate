// WP7 parity (spec §10.3 item 1): Peekr's boxes, kps and crop rectangles equal
// the bundle's B/C (and the box part of E) on legacy-equivalent mirrored
// landmarks, exactly, on the landmark fixture and on seeded perturbations of
// it; plus the crop-invalid rule for degenerate boxes (spec §4.6.3).
import assert from 'node:assert/strict';
import test from 'node:test';
import { lmX, PEEKR_MIRROR_PAIRS } from '../../src/core/face/landmarkSets.ts';
import { mulberry32 } from '../../src/core/maths/rng.ts';
import {
  boxProblem,
  INPUT1_POINTS,
  INPUT2_POINTS,
  LEGACY_INPUT1,
  LEGACY_INPUT2,
  mirrorPartner,
  mirroredPoint,
  peekrBox,
  peekrCropRect,
  peekrGeometry,
  PK_MIN_BOX_PX,
  type PeekrBox,
} from '../../src/engines/peekr/preprocess.ts';
import { loadLandmarkFixture } from '../fixtures/landmarks/fixture.ts';

type Point = { x: number; y: number };
interface Reference {
  B(points: number[][], w: number, h: number): [number, number, number, number];
  C(landmarks: unknown, indices: readonly number[], out: number[][]): void;
  E_geometry(results: { multiFaceLandmarks: unknown[] }, video: { videoWidth: number; videoHeight: number }): { kps: Float32Array; draws: unknown[][] } | null;
}
// A computed specifier keeps the untyped JavaScript reference out of the type check.
const ref = (await import(new URL('../reference/peekr-boxes.js', import.meta.url).href)) as Reference;

const SIZES = [
  [640, 480],
  [1280, 720],
  [960, 540],
] as const;

/**
 * The landmarks legacy FaceMesh (selfieMode:true) would give: legacy point i is
 * the mirror image m(L[j]) of i's mirror partner j. Only the eight points the
 * bundle reads exist; reading any other throws.
 */
function legacyLandmarks(lm: ArrayLike<number>): Record<number, Point> {
  const points: Record<number, Point> = {};
  for (const i of [...LEGACY_INPUT1, ...LEGACY_INPUT2]) {
    const [x, y] = mirroredPoint(lm, mirrorPartner(i));
    points[i] = { x, y };
  }
  return new Proxy(points, {
    get(target, key) {
      if (typeof key === 'string' && !(key in target)) throw new Error(`the bundle read landmark ${key}, which is not reproduced`);
      return Reflect.get(target, key);
    },
  });
}

function referenceBoxes(lm: ArrayLike<number>, W: number, H: number): PeekrBox[] {
  const legacy = legacyLandmarks(lm);
  return [LEGACY_INPUT1, LEGACY_INPUT2].map((indices) => {
    const coords: number[][] = [];
    ref.C(legacy, indices, coords);
    const [x, y, w, h] = ref.B(coords, W, H);
    return { x, y, w, h };
  });
}

function ourBoxes(lm: ArrayLike<number>, W: number, H: number): PeekrBox[] {
  return [INPUT1_POINTS, INPUT2_POINTS].map((points) => peekrBox(points.map((i) => mirroredPoint(lm, i)), W, H));
}

/** Compares everything the bundle derives from the landmarks with ours, exactly; returns the geometry status. */
function assertParity(lm: Float32Array, W: number, H: number, label: string): 'ok' | 'crop-invalid' {
  const expected = referenceBoxes(lm, W, H);
  const got = ourBoxes(lm, W, H);
  assert.deepEqual(got, expected, `${label}: boxes`);

  const e = ref.E_geometry({ multiFaceLandmarks: [legacyLandmarks(lm)] }, { videoWidth: W, videoHeight: H });
  assert.ok(e, label);
  for (let k = 0; k < 2; k++) {
    const c = peekrCropRect(got[k], W);
    assert.deepEqual(e.draws[k].slice(1), [c.sx, c.sy, c.sw, c.sh, 0, 0, 128, 128], `${label}: crop ${k + 1}`);
  }
  // kps the way peekrGeometry builds it, for every box, valid or not.
  const kps = new Float32Array(got.flatMap((b) => [b.x / W, b.y / H, b.w / W, b.h / H]));
  assert.deepEqual(Array.from(kps), Array.from(e.kps), `${label}: kps`);
  const geometry = peekrGeometry(lm, W, H);
  if (geometry.status === 'ok') {
    assert.deepEqual(Array.from(geometry.kps), Array.from(e.kps), `${label}: geometry kps`);
    assert.deepEqual(geometry.boxes, expected, `${label}: geometry boxes`);
    assert.deepEqual(geometry.crops, got.map((b) => peekrCropRect(b, W)), `${label}: geometry crops`);
  }
  return geometry.status;
}

test('the input points are the bundle’s legacy points through the verified mirror pairs (spec §4.6.3 table)', () => {
  assert.deepEqual(INPUT1_POINTS, [359, 257, 463, 253]);
  assert.deepEqual(INPUT2_POINTS, [243, 27, 130, 23]);
  for (const [r, l] of PEEKR_MIRROR_PAIRS) {
    assert.equal(mirrorPartner(r), l);
    assert.equal(mirrorPartner(l), r);
  }
  assert.throws(() => mirrorPartner(33), RangeError);
});

test('boxes, kps and crops equal the bundle’s B/C on the landmark fixture', () => {
  const fx = loadLandmarkFixture();
  for (const [W, H] of SIZES) assertParity(fx.landmarks, W, H, `fixture ${W}×${H}`);

  const geometry = peekrGeometry(fx.landmarks, fx.videoW, fx.videoH);
  assert.equal(geometry.status, 'ok');
  if (geometry.status !== 'ok') return;
  // The crops are unmirrored: input1 spans the subject's left eye from 463 to
  // 359 and input2 the right eye from 130 to 243, in frame pixels.
  const [c1, c2] = geometry.crops;
  const px = (i: number) => lmX(fx.landmarks, i) * fx.videoW;
  for (const [c, from, to] of [[c1, 463, 359], [c2, 130, 243]] as const) {
    assert.ok(Math.abs(c.sx - px(from)) < 1e-9, `crop starts at landmark ${from}`);
    assert.ok(Math.abs(c.sx + c.sw - px(to)) < 1e-9, `crop ends at landmark ${to}`);
    assert.ok(c.sw >= PK_MIN_BOX_PX && c.sh >= PK_MIN_BOX_PX);
  }
  assert.ok(c1.sx > c2.sx + c2.sw, 'the subject’s left eye lies on the image right of the unmirrored frame');
  // kps is in mirrored coordinates: input1's box starts left of input2's.
  assert.ok(geometry.kps[0] < geometry.kps[4]);
  assert.ok(geometry.kps.every((v) => v > 0 && v < 1));
});

test('boxes, kps and crops equal the bundle’s B/C on 600 perturbed faces', () => {
  const fx = loadLandmarkFixture();
  const rand = mulberry32(7_107);
  const statuses = { ok: 0, 'crop-invalid': 0 };
  for (let trial = 0; trial < 600; trial++) {
    const lm = Float32Array.from(fx.landmarks);
    // Moves, scales and jitters the face, sometimes far enough to leave the frame.
    const scale = 0.5 + rand() * 1.5;
    const dx = (rand() - 0.5) * 0.8;
    const dy = (rand() - 0.5) * 0.8;
    for (let i = 0; i < lm.length; i += 3) {
      lm[i] = 0.5 + (lm[i] - 0.5) * scale + dx + (rand() - 0.5) * 0.01;
      lm[i + 1] = 0.5 + (lm[i + 1] - 0.5) * scale + dy + (rand() - 0.5) * 0.01;
    }
    const [W, H] = SIZES[trial % SIZES.length];
    statuses[assertParity(lm, W, H, `trial ${trial}`)] += 1;
  }
  // Both outcomes are exercised.
  assert.ok(statuses.ok > 300 && statuses['crop-invalid'] > 30, JSON.stringify(statuses));
});

/** The fixture with every reproduced point moved by f(x, y) → (x, y), normalised. */
function moved(f: (x: number, y: number) => [number, number]): Float32Array {
  const lm = Float32Array.from(loadLandmarkFixture().landmarks);
  for (let i = 0; i < lm.length; i += 3) [lm[i], lm[i + 1]] = f(lm[i], lm[i + 1]);
  return lm;
}

test('degenerate boxes are crop-invalid; non-finite input throws', () => {
  const fx = loadLandmarkFixture();
  const { videoW: W, videoH: H } = fx;
  const invalid = (lm: Float32Array, pattern: RegExp, w = W, h = H) => {
    const g = peekrGeometry(lm, w, h);
    assert.equal(g.status, 'crop-invalid');
    if (g.status === 'crop-invalid') assert.match(g.reason, pattern);
  };

  // A face so small that each eye box is under 4 px.
  invalid(moved((x, y) => [0.5 + (x - 0.5) * 0.05, 0.5 + (y - 0.5) * 0.05]), /under 4 px/);
  // A face flipped left–right: the boxes get negative widths.
  invalid(moved((x, y) => [1 - x, y]), /under 4 px/);
  // A face moved so far that an eye box leaves the frame, on each side.
  for (const [dx, dy] of [[-0.5, 0], [0.4, 0], [0, -0.4], [0, 0.65]]) invalid(moved((x, y) => [x + dx, y + dy]), /leaves the frame/);

  // A box touching the frame edges is inside; the smallest step past an edge is not.
  assert.equal(boxProblem({ x: 0, y: 0, w: W, h: H }, W, H), null);
  assert.equal(boxProblem({ x: 0, y: 0, w: PK_MIN_BOX_PX, h: PK_MIN_BOX_PX }, W, H), null);
  for (const box of [{ x: -1e-9, y: 0, w: 10, h: 10 }, { x: 0, y: -1e-9, w: 10, h: 10 }, { x: W - 10, y: 0, w: 10 + 1e-9, h: 10 }, { x: 0, y: H - 10, w: 10, h: 10 + 1e-9 }]) {
    assert.match(boxProblem(box, W, H) ?? '', /leaves the frame/);
  }
  assert.match(boxProblem({ x: 10, y: 10, w: PK_MIN_BOX_PX - 1e-9, h: 10 }, W, H) ?? '', /under 4 px/);
  assert.match(boxProblem({ x: 10, y: 10, w: 10, h: Number.NaN }, W, H) ?? '', /under 4 px/);

  const nan = Float32Array.from(fx.landmarks);
  nan[INPUT2_POINTS[2] * 3] = Number.NaN;
  assert.throws(() => peekrGeometry(nan, W, H), /landmark 130 is not finite/);
  assert.throws(() => peekrGeometry(fx.landmarks, 0, H), RangeError);
  assert.throws(() => peekrGeometry(fx.landmarks, W, Number.NaN), RangeError);
});
