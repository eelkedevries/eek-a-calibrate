// "Home" and the two grades after Get ready (design §3.3, §3.7, §3.8; spec §17.5.1), DOM-free.
// Home is the median position over the hold that latched Ready (and again at the start of
// "Lean in"). During the warm-up the guard measures the player against tolerances around home;
// after the fit, against the calibrated head range of spec §4.10 plus the phone's θ and roll
// around home. A measure past 70 % of its margin is *drifting*; past the whole margin, *out*.
import { DISTANCE, SETUP } from '../constants.ts';
import type { HeadRange, Vec2 } from '../types.ts';
import type { FaceGeometry, Signals } from './signals.ts';
import { DRIFT_FRACTION, FIT_TILT_DEG, HEAD_SPEED_DEG_S, HOME_TOLERANCE, type GuardContext } from './thresholds.ts';

/** Face luma at which the light starts to count as drifting; out at SETUP.lumaMin (heuristic). */
const LIGHT_DRIFT_LUMA = 80;

export interface Home {
  /** Face centre minus the oval's centre (frame fractions). */
  centring: Vec2;
  scale: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** Phone θ and roll; NaN without device motion. */
  tiltDeg: number;
  phoneRollDeg: number;
  irisPx: number;
  /** The face's outline and eyes when home was taken, for the pause overlay's ghost. */
  geometry: FaceGeometry | null;
}

function median(values: readonly number[]): number {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return Number.NaN;
  const m = v.length >> 1;
  return v.length % 2 === 1 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** Collects the signals over a hold and gives their medians as home. */
export class HomeAccumulator {
  private samples: Signals[] = [];

  add(s: Signals): void {
    if (s.face) this.samples.push(s);
  }

  get count(): number {
    return this.samples.length;
  }

  clear(): void {
    this.samples = [];
  }

  /** Home from the samples so far, or null without any. */
  home(): Home | null {
    const s = this.samples;
    if (s.length === 0) return null;
    const m = (f: (x: Signals) => number) => median(s.map(f));
    const last = [...s].reverse().find((x) => x.geometry !== null);
    return {
      centring: [m((x) => x.centring[0]), m((x) => x.centring[1])],
      scale: m((x) => x.scale),
      yawDeg: m((x) => x.yawDeg),
      pitchDeg: m((x) => x.pitchDeg),
      rollDeg: m((x) => x.rollDeg),
      tiltDeg: m((x) => x.tiltDeg),
      phoneRollDeg: m((x) => x.phoneRollDeg),
      irisPx: m((x) => x.irisPx),
      geometry: last?.geometry ?? null,
    };
  }
}

/** What a deviation from home is about; it picks the overlay headline and the nudge. */
export type DeviationKind = 'far' | 'close' | 'centre' | 'turned' | 'phone' | 'light' | 'moving';

export interface Deviation {
  kind: DeviationKind;
  /** |deviation| ÷ its margin: ≥ DRIFT_FRACTION drifting, ≥ 1 out. */
  ratio: number;
}

/** The calibrated head range of a fit and what turns the iris into ln(D / D_ref) (§4.10). */
export interface FitRange {
  headRange: HeadRange;
  focalPx: number;
  refDistanceMm: number;
}

/** ln(D_t / D_ref) from the iris, as §4.10's head range measures distance; NaN when unknown. */
export function lnDistRatioFromIris(irisPx: number, focalPx: number, refDistanceMm: number): number {
  if (!(irisPx > 0 && focalPx > 0 && refDistanceMm > 0)) return Number.NaN;
  return Math.log((focalPx * DISTANCE.irisMm) / irisPx / refDistanceMm);
}

/** |v − centre| ÷ half-width of a band; ≥ 1 outside it. */
function bandRatio(v: number, band: Vec2): number {
  const c = (band[0] + band[1]) / 2;
  const w = (band[1] - band[0]) / 2;
  return w > 0 ? Math.abs(v - c) / w : Number.POSITIVE_INFINITY;
}

const fin = Number.isFinite;

/**
 * Every measured deviation from home for a context, as a ratio of its margin. During the warm-up:
 * scale ±20 %, centre ±0.10, yaw and pitch ±15° (not in Level 3, "warmup-head", where turning is
 * the task), θ ±8°. After the fit (`fit` given): the calibrated head range and θ and roll ±6°.
 * Unmeasured quantities are left out.
 */
export function deviations(s: Signals, home: Home, context: GuardContext, fit: FitRange | null = null): Deviation[] {
  const out: Deviation[] = [];
  const push = (kind: DeviationKind, ratio: number) => {
    if (fin(ratio)) out.push({ kind, ratio });
  };
  const angles = context !== 'warmup-head';
  if (fit && context !== 'warmup' && context !== 'warmup-head') {
    const r = fit.headRange;
    const ln = lnDistRatioFromIris(s.irisPx, fit.focalPx, fit.refDistanceMm);
    if (fin(ln)) {
      const c = (r.lnDistRatio[0] + r.lnDistRatio[1]) / 2;
      // Further than the range: a larger ln(D / D_ref).
      push(ln > c ? 'far' : 'close', bandRatio(ln, r.lnDistRatio));
    }
    push('turned', Math.max(bandRatio(s.yawDeg, r.yawDeg), bandRatio(s.pitchDeg, r.pitchDeg)));
    push('centre', Math.max(bandRatio(s.eyeMid[0], r.eyeMidX), bandRatio(s.eyeMid[1], r.eyeMidY)));
    if (fin(home.tiltDeg)) push('phone', Math.max(Math.abs(s.tiltDeg - home.tiltDeg), Math.abs(s.phoneRollDeg - home.phoneRollDeg)) / FIT_TILT_DEG);
    pushCommon(s, context, push);
    return out;
  }
  if (fin(s.scale) && fin(home.scale) && home.scale > 0) {
    const rel = s.scale / home.scale - 1;
    push(rel < 0 ? 'far' : 'close', Math.abs(rel) / HOME_TOLERANCE.scaleFrac);
  }
  push('centre', Math.max(Math.abs(s.centring[0] - home.centring[0]), Math.abs(s.centring[1] - home.centring[1])) / HOME_TOLERANCE.centre);
  if (angles) push('turned', Math.max(Math.abs(s.yawDeg - home.yawDeg), Math.abs(s.pitchDeg - home.pitchDeg)) / HOME_TOLERANCE.angleDeg);
  if (fin(home.tiltDeg)) push('phone', Math.abs(s.tiltDeg - home.tiltDeg) / HOME_TOLERANCE.tiltDeg);
  pushCommon(s, context, push);
  return out;
}

/** Light and steadiness count in every context; turning the head is the task in Level 3. */
function pushCommon(s: Signals, context: GuardContext, push: (kind: DeviationKind, ratio: number) => void): void {
  if (fin(s.lumaMean)) push('light', Math.max(0, (LIGHT_DRIFT_LUMA - s.lumaMean) / (LIGHT_DRIFT_LUMA - SETUP.lumaMin)));
  if (context !== 'warmup-head') push('moving', s.headDegS / HEAD_SPEED_DEG_S);
}

/** The order in which deviations are named (design §3.4's priority order, relative to home). */
const DEVIATION_ORDER: readonly DeviationKind[] = ['far', 'close', 'phone', 'centre', 'turned', 'light', 'moving'];

export type Grade = 'good' | 'drifting' | 'out';

/** The grade of a set of deviations and the one that decides it (the worst, ties by priority). */
export function grade(devs: readonly Deviation[]): { grade: Grade; worst: Deviation | null } {
  const level = (x: Deviation) => (x.ratio >= 1 ? 2 : x.ratio >= DRIFT_FRACTION ? 1 : 0);
  let worst: Deviation | null = null;
  for (const kind of DEVIATION_ORDER) {
    for (const d of devs) if (d.kind === kind && (!worst || level(d) > level(worst))) worst = d;
  }
  if (!worst || level(worst) === 0) return { grade: 'good', worst: null };
  return { grade: level(worst) === 2 ? 'out' : 'drifting', worst };
}

/** The overlay's headline key for a pause (design §3.8). */
export function pauseHeadline(reason: 'face-lost' | 'out', worst: DeviationKind | null): string {
  if (reason === 'face-lost') return 'guard.pause.lookBack';
  switch (worst) {
    case 'far':
      return 'guard.pause.closer';
    case 'close':
      return 'guard.pause.back';
    case 'turned':
      return 'guard.pause.turned';
    case 'phone':
      return 'guard.pause.phone';
    case 'moving':
      return 'guard.pause.still';
    case 'light':
      return 'guard.pause.light';
    default:
      return 'guard.pause.intoView';
  }
}

/** The nudge's key beside the glyph (Free look and the challenge only, design §3.7). */
export function nudgeKey(kind: DeviationKind): string {
  return `guard.nudge.${kind}`;
}

/**
 * Where the glyph's eye dots go (design §3.7): the face's offset from home amplified × 3 and
 * mirrored like the preview, in glyph px within the 16 × 21 oval, and their spacing scaled by the
 * distance (closer together when further away). Home is (0, 0) with spacing 6.4.
 */
export function glyphEyes(s: Signals, home: Home | null): { dx: number; dy: number; spacing: number } {
  if (!home || !s.face) return { dx: 0, dy: 0, spacing: 6.4 };
  const clamp = (v: number, m: number) => (fin(v) ? Math.max(-m, Math.min(m, v)) + 0 : 0);
  const dx = clamp(-(s.centring[0] - home.centring[0]) * 3 * 16, 4.5);
  const dy = clamp((s.centring[1] - home.centring[1]) * 3 * 21, 6);
  const ratio = fin(s.scale) && fin(home.scale) && home.scale > 0 ? s.scale / home.scale : 1;
  const spacing = Math.max(3, Math.min(9, 6.4 * (1 + 3 * (ratio - 1))));
  return { dx, dy, spacing };
}
