// Validation metrics (specification §4.12). Inputs are raw (unfiltered, uncorrected)
// predictions; a frame counts when its sample has `flags & INVALID_MASK = 0`. Every angle is
// computed exactly in degree space (`angularSeparationDeg`), never through pixels per degree.
import { VERDICT } from '../constants.ts';
import { angularSeparationDeg, degToPx, pxToDeg, type PlaneGeometry } from '../geometry/angles.ts';
import { layoutToPx, viewportDiagonalPx, type LayoutGeometry } from '../geometry/screen.ts';
import { mean, median, percentile, sampleSd } from '../maths/stats.ts';
import { ENGINE_IDS, Flags } from '../types.ts';
import type {
  EstimatorId,
  Funnel,
  GazeSample,
  Presentation,
  RecordedFrame,
  Recording,
  SessionGeometry,
  TargetItem,
  TargetMetrics,
  ValidationReport,
  Vec2,
} from '../types.ts';
import { aoiGrid } from './aoi.ts';
import { dataLossPct, expectedFrames, funnelCounts, isValidSample, nominalFpsOrDefault, sumFunnels, type FunnelEntry } from './funnel.ts';

/** BCEA coverage and its k = −ln(1 − P) = 1.1394 for P = 0.68. */
export const BCEA_P = 0.68;
export const BCEA_K = -Math.log(1 - BCEA_P);
/** Consecutive samples further apart than this many median frame intervals are not a pair. */
export const S2S_MAX_GAP_FACTOR = 1.5;
/**
 * Central targets lie within this Chebyshev distance of the viewport centre (normalised). It
 * reproduces the §4.7 split: the two (0.38/0.62, 0.5) targets of VAL12 and VAL6 are central,
 * every other target (at 0.15 or 0.85 on some axis) is peripheral, with the ±0.02 jitter.
 */
const CENTRAL_HALF_WIDTH = 0.25;

/** Report order: Combined first, then the engines in a-priori rank order. */
export const ESTIMATOR_ORDER: readonly EstimatorId[] = ['combined', ...ENGINE_IDS];

export function targetRegion(xNorm: number, yNorm: number): 'central' | 'peripheral' {
  return Math.max(Math.abs(xNorm - 0.5), Math.abs(yNorm - 0.5)) < CENTRAL_HALF_WIDTH ? 'central' : 'peripheral';
}

export interface TargetWindow {
  item: TargetItem;
  presentation: Presentation;
  /** Sampling window [startMs, endMs) on the capture clock. */
  startMs: number;
  endMs: number;
  targetPx: Vec2;
  region: 'central' | 'peripheral';
}

/**
 * The sampling window of every presented target: from onset + settle to onset + settle +
 * sample, cut at the presentation's offset (an aborted target keeps its shortened window, and
 * the frames it lost count as data loss). With no retries there is one presentation per target;
 * should there be more (a target shown again after a pause interrupted it), the first complete
 * one is used, else the first attempt. Targets never presented are left out. Target positions
 * come from `layoutToPx`, the mapping the stimulus drew them with (§14.2.5).
 */
export function targetWindows(rec: Recording, screen: LayoutGeometry = rec.geometry.screen): TargetWindow[] {
  const out: TargetWindow[] = [];
  for (const item of rec.schedule.items) {
    if (item.kind !== 'target') continue;
    let presentation: Presentation | undefined;
    for (const p of rec.presentations) {
      if (p.itemId !== item.id) continue;
      if (
        presentation === undefined ||
        (presentation.aborted && !p.aborted) ||
        (presentation.aborted === p.aborted && (p.attempt < presentation.attempt || (p.attempt === presentation.attempt && p.onsetMs < presentation.onsetMs)))
      ) {
        presentation = p;
      }
    }
    if (presentation === undefined) continue;
    const startMs = presentation.onsetMs + item.settleMs;
    const endMs = Math.max(startMs, Math.min(startMs + item.sampleMs, presentation.offsetMs));
    out.push({ item, presentation, startMs, endMs, targetPx: layoutToPx(item.xNorm, item.yNorm, screen), region: targetRegion(item.xNorm, item.yNorm) });
  }
  return out;
}

/** Median of the positive intervals between consecutive capture times; NaN with fewer than two frames. */
export function medianFrameIntervalMs(times: readonly number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = (sorted[i] as number) - (sorted[i - 1] as number);
    if (d > 0) intervals.push(d);
  }
  return median(intervals);
}

export interface TimedDeg {
  tMs: number;
  deg: Vec2;
}

/**
 * RMS sample-to-sample precision, √(mean ang(G_i, G_{i+1})²), over consecutive points (in time
 * order) no more than `maxGapMs` apart, so a missing frame breaks the pair. NaN without a pair
 * (including when `maxGapMs` is NaN).
 */
export function rmsS2SDeg(points: readonly TimedDeg[], maxGapMs: number): number {
  let ss = 0;
  let pairs = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as TimedDeg;
    const b = points[i] as TimedDeg;
    if (!(b.tMs - a.tMs <= maxGapMs)) continue;
    const d = angularSeparationDeg(a.deg, b.deg);
    ss += d * d;
    pairs++;
  }
  return pairs === 0 ? Number.NaN : Math.sqrt(ss / pairs);
}

export interface Dispersion {
  sdXDeg: number;
  sdYDeg: number;
  /** Pearson correlation of x and y; NaN when either SD is zero. */
  rho: number;
  /** SD = √(σx² + σy²). */
  sdDeg: number;
  bcea68Deg2: number;
}

/** BCEA₆₈ = 2kπσxσy√(1−ρ²). Zero when either SD is zero, whatever ρ. */
export function bcea68(sdXDeg: number, sdYDeg: number, rho: number): number {
  if (sdXDeg === 0 || sdYDeg === 0) return 0;
  return 2 * BCEA_K * Math.PI * sdXDeg * sdYDeg * Math.sqrt(Math.max(0, 1 - rho * rho));
}

/** Sample (n − 1) SDs and correlation of the θ samples; all NaN with fewer than two samples. */
export function dispersion(degs: readonly Vec2[]): Dispersion {
  const n = degs.length;
  if (n < 2) return { sdXDeg: Number.NaN, sdYDeg: Number.NaN, rho: Number.NaN, sdDeg: Number.NaN, bcea68Deg2: Number.NaN };
  const xs = degs.map((d) => d[0]);
  const ys = degs.map((d) => d[1]);
  const sx = sampleSd(xs);
  const sy = sampleSd(ys);
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  for (let i = 0; i < n; i++) sxy += ((xs[i] as number) - mx) * ((ys[i] as number) - my);
  const rho = sx > 0 && sy > 0 ? Math.min(1, Math.max(-1, sxy / (n - 1) / (sx * sy))) : Number.NaN;
  return { sdXDeg: sx, sdYDeg: sy, rho, sdDeg: Math.hypot(sx, sy), bcea68Deg2: bcea68(sx, sy, rho) };
}

export interface VerdictInput {
  accuracyMeanDeg: number;
  dataLossPct: number;
  trackingGain: number;
  accuracyPctDiag: number;
  degreesApproximate: boolean;
}

/**
 * The heuristic verdict table. A gain below 1.5 (or no gain at all, when nothing was valid)
 * means not tracking. With approximate degrees the accuracy test uses % of the diagonal.
 */
export function verdictFor(v: VerdictInput): ValidationReport['verdict'] {
  if (!(v.trackingGain >= VERDICT.minGain)) return 'not-tracking';
  const loss = v.dataLossPct / 100;
  if (v.degreesApproximate) {
    const diag = v.accuracyPctDiag / 100;
    if (diag < VERDICT.goodPctDiag && loss <= VERDICT.goodLoss) return 'good';
    if (diag < VERDICT.okPctDiag && loss <= VERDICT.okLoss) return 'acceptable';
    return 'poor';
  }
  if (v.accuracyMeanDeg <= VERDICT.goodDeg && loss <= VERDICT.goodLoss) return 'good';
  if (v.accuracyMeanDeg <= VERDICT.okDeg && loss <= VERDICT.okLoss) return 'acceptable';
  return 'poor';
}

export interface ScoreOptions {
  /**
   * `FrameResult.receivedMs` by frame index, for the latency. `RecordedFrame` does not carry it,
   * so without this map the latency is NaN.
   */
  receivedMs?: ReadonlyMap<number, number>;
}

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function sampleDistance(s: GazeSample, f: RecordedFrame, g: SessionGeometry): number {
  if (positive(s.distanceMm)) return s.distanceMm;
  if (positive(f.distanceMm)) return f.distanceMm;
  if (positive(g.refDistanceMm)) return g.refDistanceMm;
  throw new RangeError(`scoreValidation: no viewing distance for frame ${f.meta.index} and no reference distance`);
}

function indexSamples(estimator: EstimatorId, list: readonly GazeSample[]): Map<number, GazeSample> {
  const byFrame = new Map<number, GazeSample>();
  for (const s of list) {
    if (byFrame.has(s.frameIndex)) throw new RangeError(`scoreValidation: two ${estimator} samples for frame ${s.frameIndex}`);
    byFrame.set(s.frameIndex, s);
  }
  return byFrame;
}

function meanVec(vs: readonly Vec2[]): Vec2 {
  return [mean(vs.map((v) => v[0])), mean(vs.map((v) => v[1]))];
}

function finite(values: readonly number[]): number[] {
  return values.filter((v) => Number.isFinite(v));
}

interface TargetExtras {
  baselineDeg: number;
  windowS: number;
  distances: number[];
  latencies: number[];
}

/**
 * Scores a validation recording for every estimator in `samples` (the §6 signature, plus the
 * optional `options`). `mode = 'own'` uses each estimator's valid frames; `'intersection'`
 * only the frames valid for every estimator in `samples`. One report per estimator, Combined
 * first, then the engines in rank order.
 *
 * Per sample, the target angle T_i, the constant predictor C_i (the centroid of the presented
 * targets) and the pixel position use that frame's distance D_t (the sample's, else the
 * frame's, else D_ref), the distance at which the mapper's degrees were defined. A target's
 * accuracy is ang(T̄, Ḡ) of the means over its valid samples; its baseline is ang(T̄, C̄).
 * Targets without a valid sample have NaN metrics and are left out of the summary statistics,
 * which therefore cover the same targets for accuracy and baseline. `dataLossPct` and
 * `accuracyPctDiag` are percentages (0–100).
 */
export function scoreValidation(
  rec: Recording,
  samples: Map<EstimatorId, GazeSample[]>,
  g: SessionGeometry,
  mode: 'own' | 'intersection',
  nominalFps: number,
  options: ScoreOptions = {},
): ValidationReport[] {
  const screen: PlaneGeometry = g.screen;
  const fps = nominalFpsOrDefault(nominalFps);
  const windows = targetWindows(rec, g.screen);
  const frames = [...rec.frames].sort((a, b) => a.meta.tCaptureMs - b.meta.tCaptureMs);
  const maxGapMs = S2S_MAX_GAP_FACTOR * medianFrameIntervalMs(frames.map((f) => f.meta.tCaptureMs));
  const estimators = ESTIMATOR_ORDER.filter((e) => samples.has(e));
  const indexed = new Map<EstimatorId, Map<number, GazeSample>>();
  for (const e of estimators) indexed.set(e, indexSamples(e, samples.get(e) as GazeSample[]));
  const validForAll = (frameIndex: number): boolean => estimators.every((e) => isValidSample(indexed.get(e)?.get(frameIndex)));
  const centroidPx: Vec2 = meanVec(windows.map((w) => w.targetPx));
  const framesByWindow = windows.map((w) => frames.filter((f) => f.meta.tCaptureMs >= w.startMs && f.meta.tCaptureMs < w.endMs));

  return estimators.map((estimator): ValidationReport => {
    const own = indexed.get(estimator) as Map<number, GazeSample>;
    const targets: TargetMetrics[] = [];
    const extras: TargetExtras[] = [];

    windows.forEach((w, k) => {
      const inWindow = framesByWindow[k] as RecordedFrame[];
      const entries: FunnelEntry[] = [];
      const points: TimedDeg[] = [];
      const errors: number[] = [];
      const T: Vec2[] = [];
      const C: Vec2[] = [];
      const P: Vec2[] = [];
      const extra: TargetExtras = { baselineDeg: Number.NaN, windowS: (w.endMs - w.startMs) / 1000, distances: [], latencies: [] };
      for (const f of inWindow) {
        const s = own.get(f.meta.index);
        const valid = mode === 'own' ? isValidSample(s) : validForAll(f.meta.index);
        entries.push({ sample: s, valid });
        if (s !== undefined && (s.flags & Flags.DROPPED) === 0) {
          const received = options.receivedMs?.get(f.meta.index);
          if (received !== undefined && Number.isFinite(received)) extra.latencies.push(received - f.meta.tCaptureMs);
        }
        if (!valid || !isValidSample(s)) continue;
        const d = sampleDistance(s, f, g);
        const t = pxToDeg(w.targetPx, screen, d);
        extra.distances.push(d);
        points.push({ tMs: f.meta.tCaptureMs, deg: s.rawDeg });
        errors.push(angularSeparationDeg(t, s.rawDeg));
        T.push(t);
        C.push(pxToDeg(centroidPx, screen, d));
        P.push(degToPx(s.rawDeg, screen, d));
      }
      const funnel: Funnel = funnelCounts(expectedFrames(w.item.sampleMs, fps), entries);
      const n = points.length;
      const gBar = n > 0 ? meanVec(points.map((p) => p.deg)) : ([Number.NaN, Number.NaN] as Vec2);
      const tBar = n > 0 ? meanVec(T) : ([Number.NaN, Number.NaN] as Vec2);
      const pBar = n > 0 ? meanVec(P) : ([Number.NaN, Number.NaN] as Vec2);
      const disp = dispersion(points.map((p) => p.deg));
      if (n > 0) extra.baselineDeg = angularSeparationDeg(tBar, meanVec(C));
      targets.push({
        itemId: w.item.id,
        targetPx: w.targetPx,
        region: w.region,
        funnel,
        dataLossPct: dataLossPct(funnel),
        accuracyDeg: angularSeparationDeg(tBar, gBar),
        medianErrorDeg: median(errors),
        offsetDeg: [gBar[0] - tBar[0], gBar[1] - tBar[1]],
        accuracyPx: Math.hypot(pBar[0] - w.targetPx[0], pBar[1] - w.targetPx[1]),
        rmsS2SDeg: rmsS2SDeg(points, maxGapMs),
        sdDeg: disp.sdDeg,
        bcea68Deg2: disp.bcea68Deg2,
      });
      extras.push(extra);
    });

    const scored = targets.map((t, k) => ({ t, x: extras[k] as TargetExtras })).filter(({ t }) => Number.isFinite(t.accuracyDeg));
    const accs = scored.map(({ t }) => t.accuracyDeg);
    const accuracyMeanDeg = mean(accs);
    const pooled = sumFunnels(targets.map((t) => t.funnel));
    const windowS = extras.reduce((sum, x) => sum + x.windowS, 0);
    const baselineDeg = mean(scored.map(({ x }) => x.baselineDeg));
    const allDistances = extras.flatMap((x) => x.distances);
    const reportDistance = positive(g.refDistanceMm) ? g.refDistanceMm : median(allDistances);
    const rms = median(finite(targets.map((t) => t.rmsS2SDeg)));
    const dataLoss = dataLossPct(pooled);
    const trackingGain = baselineDeg / accuracyMeanDeg;
    const accuracyPctDiag = (100 * mean(finite(scored.map(({ t }) => t.accuracyPx)))) / viewportDiagonalPx(g.screen);
    return {
      estimator,
      mode,
      targets,
      accuracyMeanDeg,
      accuracyMedianDeg: median(accs),
      accuracyP90Deg: percentile(accs, 90),
      accuracyCentralDeg: mean(scored.filter(({ t }) => t.region === 'central').map(({ t }) => t.accuracyDeg)),
      accuracyPeripheralDeg: mean(scored.filter(({ t }) => t.region === 'peripheral').map(({ t }) => t.accuracyDeg)),
      rmsS2SDeg: rms,
      sdDeg: median(finite(targets.map((t) => t.sdDeg))),
      bcea68Deg2: median(finite(targets.map((t) => t.bcea68Deg2))),
      dataLossPct: dataLoss,
      samplingHz: windowS > 0 ? pooled.valid / windowS : Number.NaN,
      latencyMs: mean(extras.flatMap((x) => x.latencies)),
      baselineDeg,
      trackingGain,
      accuracyPctDiag,
      aoiGrid: aoiGrid(percentile(accs, 75), rms, screen, reportDistance),
      verdict: verdictFor({ accuracyMeanDeg, dataLossPct: dataLoss, trackingGain, accuracyPctDiag, degreesApproximate: g.degreesApproximate }),
      degreesApproximate: g.degreesApproximate,
    };
  });
}
