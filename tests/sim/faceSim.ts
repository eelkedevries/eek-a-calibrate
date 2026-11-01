// Synthetic face frames for the simulation tests (spec §10.2): the MediaPipe
// canonical face model under a known head rotation and translation, an
// eyeball model that adds iris landmarks 468–477, pinhole projection with
// optional landmark noise, the column-major matrix [s·R | t], eyeLook*
// blendshapes and the screen ground truth.
//
// Frames. Head poses use MediaPipe's metric camera frame (cm; +x the
// subject's left, which is image-right, +y up, the camera at the origin looking
// down −z), so the matrix reads exactly as MediaPipe's does. Screen geometry
// uses the OpenCV camera frame (cm; +X image-right, +Y down, +Z towards the
// user); the two differ by diag(1, −1, −1). The screen is the plane Z = 0,
// with the CSS point (x, y) at X = W_mm/2 − x_mm, Y = y_mm + cameraAboveMm.
import { readFileSync } from 'node:fs';
import { eyeMeasures } from '../../src/core/face/eyeMeasures.ts';
import { headPoseFromMatrix } from '../../src/core/face/headPose.ts';
import {
  BLENDSHAPE_COUNT,
  BLENDSHAPE_INDEX,
  EYE_L,
  EYE_R,
  LANDMARK_COUNT,
  LANDMARK_STRIDE,
  MESH_COUNT,
  type BlendshapeName,
  type EyeIndices,
} from '../../src/core/face/landmarkSets.ts';
import { landmarkBounds } from '../../src/core/face/quality.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';
import type { FaceObservation, FaceQuality, FrameMeta, Vec2, Vec3 } from '../../src/core/types.ts';

const DEG = Math.PI / 180;

// ----- Canonical face model ----------------------------------------------------

/** Parses the `v x y z` lines of the canonical model (tests/sim/data, Apache-2.0). */
function loadCanonicalFace(): Float64Array {
  const text = readFileSync(new URL('./data/canonical_face_model.obj', import.meta.url), 'utf8');
  const values: number[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('v ')) continue;
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    if (parts.length !== 3 || !parts.every(Number.isFinite)) throw new Error(`canonical_face_model.obj: bad vertex line "${line}"`);
    values.push(...parts);
  }
  if (values.length !== MESH_COUNT * 3) throw new Error(`canonical_face_model.obj: expected ${MESH_COUNT} vertices, found ${values.length / 3}`);
  return Float64Array.from(values);
}

/** The 468 canonical vertices, cm, interleaved x, y, z (MediaPipe canonical face frame). */
export const CANONICAL_FACE: Float64Array = loadCanonicalFace();

export function canonicalVertex(i: number): Vec3 {
  if (!(Number.isInteger(i) && i >= 0 && i < MESH_COUNT)) throw new RangeError(`canonical vertex ${i} does not exist`);
  return [CANONICAL_FACE[i * 3], CANONICAL_FACE[i * 3 + 1], CANONICAL_FACE[i * 3 + 2]];
}

// ----- Small vector helpers ------------------------------------------------------

type V3 = [number, number, number];

const add = (a: Vec3, b: Vec3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a: Vec3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
function unit(a: Vec3): V3 {
  const n = norm(a);
  if (!(n > 0) || !Number.isFinite(n)) throw new RangeError('cannot normalise a zero or non-finite vector');
  return scale3(a, 1 / n);
}
const mid = (a: Vec3, b: Vec3): V3 => scale3(add(a, b), 0.5);
/** MediaPipe metric ↔ OpenCV camera frame (its own inverse). */
const flipYZ = (a: Vec3): V3 => [a[0], -a[1], -a[2]];

function mulR(R: readonly number[], v: Vec3): V3 {
  return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
}

function mulRt(R: readonly number[], v: Vec3): V3 {
  return [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
}

/**
 * R = R_y(yaw)·R_x(pitch)·R_z(roll), row-major: the intrinsic Y·X·Z order that
 * headPoseFromMatrix decomposes. Positive yaw turns the face towards the
 * subject's left; positive pitch tilts it down.
 */
export function rotationYXZ(yawDeg: number, pitchDeg: number, rollDeg: number): number[] {
  const [cy, sy] = [Math.cos(yawDeg * DEG), Math.sin(yawDeg * DEG)];
  const [cp, sp] = [Math.cos(pitchDeg * DEG), Math.sin(pitchDeg * DEG)];
  const [cr, sr] = [Math.cos(rollDeg * DEG), Math.sin(rollDeg * DEG)];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  const mm = (A: number[], B: number[]): number[] => {
    const C = new Array<number>(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) C[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c];
    return C;
  };
  return mm(mm(Ry, Rx), Rz);
}

/** The column-major 4×4 [s·R | t; 0 0 0 1] that MediaPipe returns as the facial transformation matrix. */
export function syntheticMatrix(R: readonly number[], tCm: Vec3, s = 1): Float32Array {
  const m = new Float32Array(16);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) m[c * 4 + r] = s * R[r * 3 + c];
    m[12 + r] = tCm[r];
  }
  m[15] = 1;
  return m;
}

// ----- Scene ---------------------------------------------------------------------

export interface SimCamera {
  width: number;
  height: number;
  focalPx: number;
  /** Principal point; the frame centre by default. */
  cx?: number;
  cy?: number;
}

export interface SimScreen {
  /** The fullscreen viewport in CSS px. */
  widthPx: number;
  heightPx: number;
  pxPerMm: number;
  /** How far the camera sits above the top edge of the screen, mm (default 5). */
  cameraAboveMm?: number;
}

export interface SimScene {
  camera: SimCamera;
  screen: SimScreen;
}

/** 640 × 480 with a 60° horizontal field of view, above a 24-inch 1920 × 1080 screen (531.4 × 298.9 mm). */
export const DEFAULT_SCENE: SimScene = {
  camera: { width: 640, height: 480, focalPx: 320 / Math.tan(30 * DEG) },
  screen: { widthPx: 1920, heightPx: 1080, pxPerMm: 1920 / 531.36 },
};

const aboveMm = (s: SimScreen): number => s.cameraAboveMm ?? 5;

/** A CSS point of the screen in the OpenCV camera frame, cm (Z = 0). */
export function screenPointCm(screen: SimScreen, xPx: number, yPx: number): Vec3 {
  const widthMm = screen.widthPx / screen.pxPerMm;
  return [(widthMm / 2 - xPx / screen.pxPerMm) / 10, (yPx / screen.pxPerMm + aboveMm(screen)) / 10, 0];
}

/** The CSS point of a point on the screen plane (OpenCV frame, cm); Z is ignored. */
export function screenPxOfPoint(screen: SimScreen, P: Vec3): Vec2 {
  const widthMm = screen.widthPx / screen.pxPerMm;
  return [(widthMm / 2 - P[0] * 10) * screen.pxPerMm, (P[1] * 10 - aboveMm(screen)) * screen.pxPerMm];
}

/**
 * Where the ray E + s·d (OpenCV frame, cm) meets the screen plane, with
 * s = −E_z/d_z, in CSS px. Null when the ray does not reach the plane.
 */
export function rayToScreenPx(screen: SimScreen, E: Vec3, d: Vec3): Vec2 | null {
  if (!(d[2] < 0) || !(E[2] > 0)) return null;
  const s = -E[2] / d[2];
  const hit: Vec3 = [E[0] + s * d[0], E[1] + s * d[1], 0];
  const px = screenPxOfPoint(screen, hit);
  return Number.isFinite(px[0]) && Number.isFinite(px[1]) ? px : null;
}

/** A point on the screen-centre normal at `distanceCm` from the screen (OpenCV frame, cm). */
export function onScreenNormalCm(screen: SimScreen, distanceCm: number, offsetCm: Vec2 = [0, 0]): Vec3 {
  const centre = screenPointCm(screen, screen.widthPx / 2, screen.heightPx / 2);
  return [centre[0] + offsetCm[0], centre[1] + offsetCm[1], distanceCm];
}

// ----- Head and eyes ---------------------------------------------------------------

export interface SimHead {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** Translation of the canonical origin, MediaPipe metric frame, cm (a face in front of the camera has z < 0). */
  tCm: Vec3;
  /** Uniform scale of the canonical face (default 1). */
  scale?: number;
}

/** Eyeball model of §10.2 ([GL]'s assumed case): the iris 0.4 cm in front of the corners for straight gaze. */
export const EYE_MODEL = { eyeballBehindCornersCm: 0.8, eyeballRadiusCm: 1.2, irisRadiusCm: 0.585 } as const;

/** Midpoint of the four eye corners 33, 133, 362, 263 in the canonical frame, cm. */
export const CANONICAL_CORNER_MIDPOINT: Vec3 = mid(mid(canonicalVertex(33), canonicalVertex(133)), mid(canonicalVertex(362), canonicalVertex(263)));

/** The head pose that puts the canonical corner midpoint at `eyeMidCm` (OpenCV frame, cm). */
export function headAt(eyeMidCm: Vec3, yawDeg: number, pitchDeg: number, rollDeg: number, s = 1): SimHead {
  const R = rotationYXZ(yawDeg, pitchDeg, rollDeg);
  const tCm = sub(flipYZ(eyeMidCm), scale3(mulR(R, CANONICAL_CORNER_MIDPOINT), s));
  return { yawDeg, pitchDeg, rollDeg, tCm, scale: s };
}

/** Eyeball rotation centre of one eye in the canonical frame: 0.8 cm behind its corner midpoint. */
function eyeballCentreHead(eye: EyeIndices): V3 {
  const m = mid(canonicalVertex(eye.outer), canonicalVertex(eye.inner));
  return [m[0], m[1], m[2] - EYE_MODEL.eyeballBehindCornersCm];
}

/** Unit gaze direction in the head frame from eye-in-head angles: +h towards the subject's left, +v up. */
export function gazeFromAngles(hDeg: number, vDeg: number): Vec3 {
  const h = hDeg * DEG;
  const v = vDeg * DEG;
  return [Math.cos(v) * Math.sin(h), Math.sin(v), Math.cos(v) * Math.cos(h)];
}

/** Eye-in-head angles (degrees) of a head-frame gaze direction; the inverse of gazeFromAngles. */
export function anglesOfGaze(g: Vec3): Vec2 {
  return [Math.atan2(g[0], g[2]) / DEG, Math.atan2(g[1], Math.hypot(g[0], g[2])) / DEG];
}

export type SimGaze =
  /** Both eyes parallel, at fixed angles in the head frame (degrees; 0, 0 is straight ahead). */
  | { kind: 'eye-in-head'; hDeg: number; vDeg: number }
  /** Both eyes fixate a CSS point of the screen. */
  | { kind: 'screen'; xPx: number; yPx: number };

export interface SimOptions {
  /** Landmark noise σ in video px, on x and y of every landmark (default 0). */
  noisePx?: number;
  /** Standard normal deviates; required when noisePx > 0 (see `normalSource`). */
  normal?: () => number;
  /** eyeBlinkLeft and eyeBlinkRight (default 0). */
  blink?: number;
  index?: number;
  /** Default index × 1000/30. */
  tCaptureMs?: number;
}

/** A seeded standard normal source for SimOptions.normal. */
export function normalSource(seed: number): () => number {
  return gaussian(mulberry32(seed));
}

export interface EyeTruth {
  /** Eyeball rotation centre, OpenCV frame, cm. */
  eyeballCm: Vec3;
  /** Unit gaze direction in the head frame. */
  gazeHead: Vec3;
  /** Unit gaze direction in the OpenCV camera frame. */
  gazeCam: Vec3;
  /** [horizontal, vertical] eye-in-head angles, degrees (+ towards the subject's left, + up). */
  eyeInHeadDeg: Vec2;
  /** Where this eye's gaze ray meets the screen, CSS px, or null. */
  screenPx: Vec2 | null;
}

export interface SimTruth {
  L: EyeTruth;
  R: EyeTruth;
  /** Mean of the two screen points, or null if either is missing. */
  screenPx: Vec2 | null;
  /** Row-major rotation, translation (cm) and scale of the head, MediaPipe metric frame. */
  rotation: readonly number[];
  tCm: Vec3;
  scale: number;
}

export interface SimFrame {
  meta: FrameMeta;
  face: FaceObservation;
  truth: SimTruth;
}

// The simulator draws no pixels, so the pixel-based quality measures are fixed, unremarkable values.
const SYNTHETIC_LUMA = { lumaMean: 128, lumaSd: 40, backlight: 1, glare: 0 } as const;

/** eyeLook* scores are clamp(angle / 30°) per direction (spec §10.2). */
export const BLENDSHAPE_FULL_SCALE_DEG = 30;

const EYE_LOOK: Record<'Left' | 'Right', { out: BlendshapeName; in: BlendshapeName; up: BlendshapeName; down: BlendshapeName }> = {
  Left: { out: 'eyeLookOutLeft', in: 'eyeLookInLeft', up: 'eyeLookUpLeft', down: 'eyeLookDownLeft' },
  Right: { out: 'eyeLookOutRight', in: 'eyeLookInRight', up: 'eyeLookUpRight', down: 'eyeLookDownRight' },
};

function eyeLookScores(scores: Float32Array, side: 'Left' | 'Right', hDeg: number, vDeg: number): void {
  const pos = (a: number) => Math.min(1, Math.max(0, a / BLENDSHAPE_FULL_SCALE_DEG));
  const names = EYE_LOOK[side];
  // Looking towards the subject's left is "out" for the left eye and "in" for the right eye.
  scores[BLENDSHAPE_INDEX[names.out]] = side === 'Left' ? pos(hDeg) : pos(-hDeg);
  scores[BLENDSHAPE_INDEX[names.in]] = side === 'Left' ? pos(-hDeg) : pos(hDeg);
  scores[BLENDSHAPE_INDEX[names.up]] = pos(vDeg);
  scores[BLENDSHAPE_INDEX[names.down]] = pos(-vDeg);
}

/**
 * One synthetic frame: landmarks (normalised, unmirrored, with MediaPipe-style
 * relative z), blendshapes, matrix, the pose and eye measures computed by the
 * production code, synthetic quality and the ground truth.
 */
export function simulateFrame(scene: SimScene, head: SimHead, gaze: SimGaze, opts: SimOptions = {}): SimFrame {
  const { camera, screen } = scene;
  const W = camera.width;
  const H = camera.height;
  const f = camera.focalPx;
  const cx = camera.cx ?? W / 2;
  const cy = camera.cy ?? H / 2;
  const s = head.scale ?? 1;
  const noisePx = opts.noisePx ?? 0;
  if (!(W > 0 && H > 0 && f > 0 && s > 0)) throw new RangeError('invalid camera or head scale');
  if (noisePx > 0 && !opts.normal) throw new RangeError('noisePx > 0 needs a normal source (normalSource(seed))');
  const R = rotationYXZ(head.yawDeg, head.pitchDeg, head.rollDeg);
  const t = head.tCm;

  const toCamera = (v: Vec3): V3 => flipYZ(add(scale3(mulR(R, v), s), t));
  const dirToCamera = (g: Vec3): V3 => flipYZ(mulR(R, g));

  // Eyes: rotation centre, gaze, iris centre and ring (head frame).
  const eyeHead = new Map<'L' | 'R', { centre: V3; gaze: V3 }>();
  for (const [side, eye] of [['L', EYE_L], ['R', EYE_R]] as const) {
    const centre = eyeballCentreHead(eye);
    let g: V3;
    if (gaze.kind === 'eye-in-head') {
      g = [...gazeFromAngles(gaze.hDeg, gaze.vDeg)] as V3;
    } else {
      const target = screenPointCm(screen, gaze.xPx, gaze.yPx);
      g = unit(mulRt(R, flipYZ(sub(target, toCamera(centre)))));
    }
    eyeHead.set(side, { centre, gaze: g });
  }

  const points: V3[] = [];
  for (let i = 0; i < MESH_COUNT; i++) points.push(canonicalVertex(i) as V3);
  for (const side of ['R', 'L'] as const) {
    const { centre, gaze: g } = eyeHead.get(side)!;
    const iris = add(centre, scale3(g, EYE_MODEL.eyeballRadiusCm));
    const u = unit(cross([0, 1, 0], g));
    const v = cross(g, u);
    const r = EYE_MODEL.irisRadiusCm;
    // R: 468 centre, 469 image-right, 470 top, 471 image-left, 472 bottom; L: 473–477 likewise.
    points.push(iris, add(iris, scale3(u, r)), add(iris, scale3(v, r)), sub(iris, scale3(u, r)), sub(iris, scale3(v, r)));
  }
  if (points.length !== LANDMARK_COUNT) throw new Error(`faceSim built ${points.length} landmarks`);

  const depth0 = -t[2];
  if (!(depth0 > 0)) throw new RangeError('the head must be in front of the camera (tCm z < 0)');
  const landmarks = new Float32Array(LANDMARK_COUNT * LANDMARK_STRIDE);
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const [X, Y, Z] = toCamera(points[i]);
    if (!(Z > 0)) throw new RangeError(`landmark ${i} is behind the camera`);
    let u = cx + (f * X) / Z;
    let v = cy + (f * Y) / Z;
    if (noisePx > 0) {
      u += noisePx * opts.normal!();
      v += noisePx * opts.normal!();
    }
    landmarks[i * 3] = u / W;
    landmarks[i * 3 + 1] = v / H;
    // MediaPipe's z: depth relative to the head centre, on the scale of x, negative towards the camera.
    landmarks[i * 3 + 2] = (f * (Z - depth0)) / (depth0 * W);
  }

  const blendshapes = new Float32Array(BLENDSHAPE_COUNT);
  const angles = { L: anglesOfGaze(eyeHead.get('L')!.gaze), R: anglesOfGaze(eyeHead.get('R')!.gaze) };
  eyeLookScores(blendshapes, 'Left', angles.L[0], angles.L[1]);
  eyeLookScores(blendshapes, 'Right', angles.R[0], angles.R[1]);
  blendshapes[BLENDSHAPE_INDEX.eyeBlinkLeft] = opts.blink ?? 0;
  blendshapes[BLENDSHAPE_INDEX.eyeBlinkRight] = opts.blink ?? 0;

  const matrix = syntheticMatrix(R, t, s);
  const pose = headPoseFromMatrix(matrix);
  if (!pose) throw new Error('faceSim: headPoseFromMatrix rejected the synthetic matrix');
  const bounds = landmarkBounds(landmarks);
  const quality: FaceQuality = {
    faceWidthFrac: bounds.maxX - bounds.minX,
    ...SYNTHETIC_LUMA,
    centring: [(bounds.minX + bounds.maxX) / 2 - 0.5, (bounds.minY + bounds.maxY) / 2 - 0.5],
  };
  const index = opts.index ?? 0;
  const meta: FrameMeta = {
    index,
    tCaptureMs: opts.tCaptureMs ?? (index * 1000) / 30,
    clock: 'captureTime',
    presentedFrames: index + 1,
    cameraGap: 0,
    videoW: W,
    videoH: H,
  };
  const face: FaceObservation = {
    landmarks,
    blendshapes,
    matrix,
    pose,
    eyes: eyeMeasures(landmarks, blendshapes, W, H),
    quality,
    landmarkerMs: 0,
    delegate: 'CPU',
  };

  const eyeTruth = (side: 'L' | 'R'): EyeTruth => {
    const { centre, gaze: g } = eyeHead.get(side)!;
    const eyeballCm = toCamera(centre);
    const gazeCam = dirToCamera(g);
    return { eyeballCm, gazeHead: g, gazeCam, eyeInHeadDeg: angles[side], screenPx: rayToScreenPx(screen, eyeballCm, gazeCam) };
  };
  const L = eyeTruth('L');
  const Rt = eyeTruth('R');
  const screenPx: Vec2 | null = L.screenPx && Rt.screenPx ? [(L.screenPx[0] + Rt.screenPx[0]) / 2, (L.screenPx[1] + Rt.screenPx[1]) / 2] : null;
  return { meta, face, truth: { L, R: Rt, screenPx, rotation: R, tCm: t, scale: s } };
}
