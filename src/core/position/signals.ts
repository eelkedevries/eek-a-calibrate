// The position guard's signals (design §3.1, spec §17.5.1), DOM-free. Each vision result, each
// delivered frame, the frame's mean luma and each device-motion reading go in; `snapshot(now)`
// gives the smoothed signals the cues are judged on. Smoothing: frame luma, face scale, iris and
// centring over 500 ms (median), the pose over 300 ms (median), light over 1 s (mean), head
// speed over 300 ms, the frame rate over 2 s. The face itself is debounced by 300 ms.
import type { FaceObservation, FrameResult, Vec2 } from '../types.ts';
import { lmX, lmY } from '../face/landmarkSets.ts';
import { landmarkBounds } from '../face/quality.ts';
import { SMOOTHING, TIMING } from './thresholds.ts';
import type { MotionReading } from './tilt.ts';

const DEG = 180 / Math.PI;

/** MediaPipe's FACE_OVAL contour, clockwise from the forehead. */
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109] as const;

/** Outer eye corners (the inter-ocular distance) and iris centres (subject's right, then left). */
const OUTER_R = 33;
const OUTER_L = 263;
const IRIS_R = 468;
const IRIS_L = 473;

/**
 * Face width (the landmark box) per unit of outer-corner distance and of iris diameter, for a
 * frontal face. Heuristic: the recorded landmark fixture gives 1.56 and 10.5, MediaPipe's
 * canonical face 1.74 and 13.2.
 */
export const FACE_WIDTH_PER_IO = 1.6;
export const FACE_WIDTH_PER_IRIS = 11;
/** The two scale estimates may disagree by this factor before the iris is mixed in. */
const SCALE_AGREEMENT = 1.3;

/** The target oval sits this fraction of the frame height above the frame's centre (design §3.5). */
export const OVAL_RAISE = 0.03;

/** The part of the frame the preview shows (cover-fitted previews crop it), as frame fractions. */
export interface VisibleRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const FULL_FRAME: VisibleRegion = { x0: 0, y0: 0, x1: 1, y1: 1 };

/** An ellipse in frame pixels (unmirrored), rotated by `angleDeg` (image coordinates, y down). */
export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angleDeg: number;
}

/** Where the face is, in the unmirrored frame. */
export interface FaceGeometry {
  videoW: number;
  videoH: number;
  /** The landmark box, normalised (0–1 of each side). */
  box: { minX: number; minY: number; maxX: number; maxY: number };
  /** The box centre, normalised. */
  centre: Vec2;
  /** An ellipse fitted to the face-oval landmarks, in frame px. */
  outline: Ellipse;
  /** Iris centres in frame px: the subject's right eye (image left), then left. */
  eyes: readonly [Vec2, Vec2];
}

/** Fits an ellipse to the face-oval contour, aligned with the eye line. */
export function faceGeometry(face: FaceObservation, videoW: number, videoH: number): FaceGeometry | null {
  const lm = face.landmarks;
  const b = landmarkBounds(lm);
  if (![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) return null;
  const pts = FACE_OVAL.map((i) => [lmX(lm, i) * videoW, lmY(lm, i) * videoH] as const);
  if (!pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return null;
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const ex = (lmX(lm, OUTER_L) - lmX(lm, OUTER_R)) * videoW;
  const ey = (lmY(lm, OUTER_L) - lmY(lm, OUTER_R)) * videoH;
  const angle = Number.isFinite(ex) && Number.isFinite(ey) && Math.hypot(ex, ey) > 0 ? Math.atan2(ey, ex) : 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // The ellipse inscribed in the contour's box along the eye line: it passes through the four
  // extreme points, whereas distances from the centroid would overshoot an egg-shaped face.
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const [x, y] of pts) {
    const u = (x - cx) * cos + (y - cy) * sin;
    const v = -(x - cx) * sin + (y - cy) * cos;
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  }
  const um = (u0 + u1) / 2;
  const vm = (v0 + v1) / 2;
  const ocx = cx + um * cos - vm * sin;
  const ocy = cy + um * sin + vm * cos;
  const rx = (u1 - u0) / 2;
  const ry = (v1 - v0) / 2;
  const eye = (i: number): Vec2 => [lmX(lm, i) * videoW, lmY(lm, i) * videoH];
  return {
    videoW,
    videoH,
    box: { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY },
    centre: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
    outline: { cx: ocx, cy: ocy, rx, ry, angleDeg: angle * DEG },
    eyes: [eye(IRIS_R), eye(IRIS_L)],
  };
}

/**
 * Face scale (design §3.1): the outer-corner distance divided by cos(yaw), as a face width
 * (FACE_WIDTH_PER_IO), over the frame's long side. Cross-checked with the iris: when the two
 * estimates disagree by more than 30 % their geometric mean is used, which damps a corrupt pose
 * or a misplaced iris without trusting either alone. NaN without a usable measure.
 */
export function faceScale(face: FaceObservation, videoW: number, videoH: number): number {
  const long = Math.max(videoW, videoH);
  if (!(long > 0)) return Number.NaN;
  const yaw = face.pose.yawDeg / DEG;
  const cosYaw = Math.max(0.5, Math.cos(Number.isFinite(yaw) ? yaw : 0));
  const io = face.eyes.interOcularPx;
  const byIo = Number.isFinite(io) && io > 0 ? (FACE_WIDTH_PER_IO * io) / cosYaw / long : Number.NaN;
  const iris = face.eyes.irisDiamPx;
  const byIris = Number.isFinite(iris) && iris > 0 ? (FACE_WIDTH_PER_IRIS * iris) / long : Number.NaN;
  if (!Number.isFinite(byIo)) return byIris;
  if (!Number.isFinite(byIris)) return byIo;
  const ratio = byIo / byIris;
  return ratio > SCALE_AGREEMENT || ratio < 1 / SCALE_AGREEMENT ? Math.sqrt(byIo * byIris) : byIo;
}

/** A time window of numbers, pruned by age. */
export class TimeWindow {
  private readonly items: { t: number; v: number }[] = [];
  private readonly spanMs: number;

  constructor(spanMs: number) {
    this.spanMs = spanMs;
  }

  push(tMs: number, v: number): void {
    if (!Number.isFinite(v)) return;
    this.items.push({ t: tMs, v });
    this.prune(tMs);
  }

  prune(nowMs: number): void {
    while (this.items.length > 0 && this.items[0]!.t < nowMs - this.spanMs) this.items.shift();
  }

  values(nowMs: number): number[] {
    return this.items.filter((x) => x.t >= nowMs - this.spanMs && x.t <= nowMs + 1).map((x) => x.v);
  }

  median(nowMs: number): number {
    const v = this.values(nowMs).sort((a, b) => a - b);
    if (v.length === 0) return Number.NaN;
    const m = v.length >> 1;
    return v.length % 2 === 1 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
  }

  mean(nowMs: number): number {
    const v = this.values(nowMs);
    return v.length === 0 ? Number.NaN : v.reduce((a, b) => a + b, 0) / v.length;
  }

  clear(): void {
    this.items.length = 0;
  }
}

/** The smoothed signals at one moment. NaN (or null) where nothing has been measured. */
export interface Signals {
  tMs: number;
  /** A frame (or a result) arrived within the last TIMING.noFramesMs. */
  delivering: boolean;
  /** Mean frame luma, 0–255 (median over 500 ms). */
  frameLuma: number;
  /** A face is present (missing for less than 300 ms still counts). */
  face: boolean;
  /** The latest result had a face. */
  faceNow: boolean;
  /** How long the face has been missing (0 while present), ms. */
  faceLostMs: number;
  /** Faces the landmarker reported (it reports one unless configured otherwise). */
  faceCount: number;
  geometry: FaceGeometry | null;
  /** Face width ÷ the frame's long side. */
  scale: number;
  irisPx: number;
  /** Least distances from the face box to the visible edges, as fractions of the visible region. */
  margins: { x: number; y: number } | null;
  /** Face centre minus the oval's centre, fractions of the frame (x unmirrored, y down). */
  centring: Vec2;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** FaceObservation.eyes.eyeMidNorm (median), for the calibrated head range. */
  eyeMid: Vec2;
  lumaMean: number;
  backlight: number;
  glare: number;
  /** How long the eyes have been shut or hidden, ms (0 while open). */
  eyesClosedMs: number;
  /** The blink scores say the lids are closed (rather than the eyes hidden). */
  eyesLidsClosed: boolean;
  /** Head angular speed, °/s (300 ms). */
  headDegS: number;
  /** Phone θ, roll and rotation rate; NaN without device motion. */
  tiltDeg: number;
  phoneRollDeg: number;
  rotationDegS: number;
  handHeld: boolean;
  /** Results processed per second over the last 2 s. */
  fps: number;
}

export interface GuardResultInput {
  tMs: number;
  face: FaceObservation | null;
  videoW: number;
  videoH: number;
  faceCount?: number;
}

/** Converts a vision result into the guard's input. */
export function resultInput(r: FrameResult): GuardResultInput {
  return { tMs: r.meta.tCaptureMs, face: r.face, videoW: r.meta.videoW, videoH: r.meta.videoH };
}

/** Collects the raw measures and smooths them into Signals. */
export class SignalTracker {
  private visible: VisibleRegion = FULL_FRAME;
  private lastFrameMs = Number.NEGATIVE_INFINITY;
  private lastFaceMs = Number.NEGATIVE_INFINITY;
  private noFaceSinceMs: number | null = null;
  private eyesShutSinceMs: number | null = null;
  private lidsClosed = false;
  private faceNow = false;
  private faceCount = 0;
  private geometry: FaceGeometry | null = null;
  private latestMotion: MotionReading | null = null;
  private readonly frameLuma = new TimeWindow(SMOOTHING.frameLumaMs);
  private readonly scale = new TimeWindow(SMOOTHING.scaleMs);
  private readonly iris = new TimeWindow(SMOOTHING.irisMs);
  private readonly cx = new TimeWindow(SMOOTHING.centringMs);
  private readonly cy = new TimeWindow(SMOOTHING.centringMs);
  private readonly mx = new TimeWindow(SMOOTHING.centringMs);
  private readonly my = new TimeWindow(SMOOTHING.centringMs);
  private readonly yaw = new TimeWindow(SMOOTHING.poseMs);
  private readonly pitch = new TimeWindow(SMOOTHING.poseMs);
  private readonly roll = new TimeWindow(SMOOTHING.poseMs);
  private readonly midX = new TimeWindow(SMOOTHING.centringMs);
  private readonly midY = new TimeWindow(SMOOTHING.centringMs);
  private readonly luma = new TimeWindow(SMOOTHING.lightMs);
  private readonly backlight = new TimeWindow(SMOOTHING.lightMs);
  private readonly glare = new TimeWindow(SMOOTHING.lightMs);
  private readonly poses: { t: number; yaw: number; pitch: number; roll: number }[] = [];
  private readonly results: number[] = [];

  /** The part of the frame the preview shows, for the "face cut off" margins. */
  setVisibleRegion(region: VisibleRegion): void {
    this.visible = region;
  }

  /** A frame the camera delivered (whether or not the host took it). */
  pushFrame(tMs: number): void {
    this.lastFrameMs = Math.max(this.lastFrameMs, tMs);
  }

  /** The frame's mean luma from a 32 × 18 downscale, measured by the caller. */
  pushFrameLuma(tMs: number, luma: number): void {
    this.frameLuma.push(tMs, luma);
  }

  pushMotion(reading: MotionReading): void {
    this.latestMotion = reading;
  }

  pushResult(input: GuardResultInput): void {
    const t = input.tMs;
    this.pushFrame(t);
    this.results.push(t);
    while (this.results.length > 0 && this.results[0]! < t - SMOOTHING.fpsMs) this.results.shift();
    const face = input.face;
    this.faceNow = face !== null;
    this.faceCount = input.faceCount ?? (face ? 1 : 0);
    if (!face) {
      this.noFaceSinceMs ??= t;
      this.eyesShutSinceMs = null;
      this.poses.length = 0;
      this.geometry = null;
      return;
    }
    this.noFaceSinceMs = null;
    this.lastFaceMs = t;
    const { videoW, videoH } = input;
    this.geometry = faceGeometry(face, videoW, videoH);
    this.scale.push(t, faceScale(face, videoW, videoH));
    this.iris.push(t, face.eyes.irisDiamPx);
    if (this.geometry) {
      const [x, y] = this.geometry.centre;
      this.cx.push(t, x - 0.5);
      this.cy.push(t, y - (0.5 - OVAL_RAISE));
      const v = this.visible;
      const w = Math.max(1e-6, v.x1 - v.x0);
      const h = Math.max(1e-6, v.y1 - v.y0);
      const b = this.geometry.box;
      this.mx.push(t, Math.min(b.minX - v.x0, v.x1 - b.maxX) / w);
      this.my.push(t, Math.min(b.minY - v.y0, v.y1 - b.maxY) / h);
    }
    const p = face.pose;
    this.yaw.push(t, p.yawDeg);
    this.pitch.push(t, p.pitchDeg);
    this.roll.push(t, p.rollDeg);
    this.midX.push(t, face.eyes.eyeMidNorm[0]);
    this.midY.push(t, face.eyes.eyeMidNorm[1]);
    const q = face.quality;
    this.luma.push(t, q.lumaMean);
    this.backlight.push(t, q.backlight);
    this.glare.push(t, q.glare);
    if (Number.isFinite(q.lumaMean) && q.backlight > 0) this.frameLuma.push(t, q.lumaMean / q.backlight);
    if (face.eyes.open) {
      this.eyesShutSinceMs = null;
      this.lidsClosed = false;
    } else {
      this.eyesShutSinceMs ??= t;
      this.lidsClosed = Math.max(face.eyes.blinkL, face.eyes.blinkR) >= 0.5;
    }
    if ([p.yawDeg, p.pitchDeg, p.rollDeg].every(Number.isFinite)) {
      this.poses.push({ t, yaw: p.yawDeg, pitch: p.pitchDeg, roll: p.rollDeg });
      while (this.poses.length > 1 && this.poses[0]!.t < t - SMOOTHING.speedMs) this.poses.shift();
    }
  }

  snapshot(nowMs: number): Signals {
    const lost = this.noFaceSinceMs === null ? 0 : Math.max(0, nowMs - this.noFaceSinceMs);
    const face = this.faceNow || (Number.isFinite(this.lastFaceMs) && nowMs - this.lastFaceMs < TIMING.faceDebounceMs);
    const first = this.poses[0];
    const last = this.poses[this.poses.length - 1];
    const dt = first && last ? (last.t - first.t) / 1000 : 0;
    const headDegS = first && last && dt > 0 ? Math.hypot(last.yaw - first.yaw, last.pitch - first.pitch, last.roll - first.roll) / dt : Number.NaN;
    const n = this.results.length;
    const span = n >= 2 ? this.results[n - 1]! - this.results[0]! : 0;
    const motion = this.latestMotion && nowMs - this.latestMotion.tMs <= 1000 ? this.latestMotion : null;
    const mx = this.mx.median(nowMs);
    const my = this.my.median(nowMs);
    return {
      tMs: nowMs,
      delivering: nowMs - this.lastFrameMs < TIMING.noFramesMs,
      frameLuma: this.frameLuma.median(nowMs),
      face,
      faceNow: this.faceNow,
      faceLostMs: this.faceNow ? 0 : lost,
      faceCount: this.faceCount,
      geometry: face ? this.geometry : null,
      scale: this.scale.median(nowMs),
      irisPx: this.iris.median(nowMs),
      margins: Number.isFinite(mx) && Number.isFinite(my) ? { x: mx, y: my } : null,
      centring: [this.cx.median(nowMs), this.cy.median(nowMs)],
      yawDeg: this.yaw.median(nowMs),
      pitchDeg: this.pitch.median(nowMs),
      rollDeg: this.roll.median(nowMs),
      eyeMid: [this.midX.median(nowMs), this.midY.median(nowMs)],
      lumaMean: this.luma.mean(nowMs),
      backlight: this.backlight.mean(nowMs),
      glare: this.glare.mean(nowMs),
      eyesClosedMs: this.eyesShutSinceMs === null || !this.faceNow ? 0 : Math.max(0, nowMs - this.eyesShutSinceMs),
      eyesLidsClosed: this.lidsClosed,
      headDegS,
      tiltDeg: motion?.tiltDeg ?? Number.NaN,
      phoneRollDeg: motion?.rollDeg ?? Number.NaN,
      rotationDegS: motion?.rotationDegS ?? Number.NaN,
      handHeld: motion?.handHeld ?? false,
      fps: n >= 2 && span > 0 ? ((n - 1) * 1000) / span : Number.NaN,
    };
  }

  /** Forgets the face measures (a camera change). */
  reset(): void {
    for (const w of [this.frameLuma, this.scale, this.iris, this.cx, this.cy, this.mx, this.my, this.yaw, this.pitch, this.roll, this.midX, this.midY, this.luma, this.backlight, this.glare]) w.clear();
    this.poses.length = 0;
    this.results.length = 0;
    this.geometry = null;
    this.faceNow = false;
    this.noFaceSinceMs = null;
    this.eyesShutSinceMs = null;
    this.lastFaceMs = Number.NEGATIVE_INFINITY;
  }
}
