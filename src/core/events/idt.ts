// Event detection (specification §4.14): segmentation that bridges only short gaps, a 3-sample
// median, I-DT (Salvucci & Goldberg 2000) in degrees, merging, saccades as the intervals between
// fixations (amplitude only: 30 Hz cannot resolve saccade dynamics), blinks and bad data.
// Event names are eek-a-gaze's.
import { EVENTS } from '../constants.ts';
import { angularSeparationDeg, degToPx } from '../geometry/angles.ts';
import { median, sampleSd } from '../maths/stats.ts';
import { medianFrameIntervalMs, targetWindows } from '../metrics/validation.ts';
import { Flags, INVALID_MASK } from '../types.ts';
import type { GazeSample, Ms, Recording, SessionGeometry, Vec2 } from '../types.ts';

export type EventType = 'fixation' | 'saccade' | 'blink' | 'bad_data';

export interface GazeEvent {
  type: EventType;
  /** Capture-clock time of the event's first and last sample (a saccade: the bounding fixations' offset and onset). */
  onsetMs: Ms;
  offsetMs: Ms;
  /** Mean corrected θ of the measured samples (fixations only), y down. */
  centroidDeg: Vec2 | null;
  /** The centroid in viewport CSS px at the samples' mean distance (fixations only). */
  centroidPx: Vec2 | null;
  /** Angle between the centroids of the bounding fixations (saccades only). */
  amplitudeDeg: number | null;
  /** Measured samples in the event (for a saccade, those strictly between its fixations). */
  nSamples: number;
}

export interface EventThresholds {
  sd2dDeg: number;
  /** θ_D = clamp(4 × SD₂d, 1.5°, 6°). */
  dispersionDeg: number;
  minFixMs: number;
  bridgeMs: number;
  mergeMs: number;
  mergeDeg: number;
  blinkMinMs: number;
  blinkMaxMs: number;
  medianN: number;
  /** Median sample interval of the stream, the duration of one sample. */
  frameIntervalMs: number;
}

export interface EventDetection {
  events: GazeEvent[];
  thresholds: EventThresholds;
}

const EPS_MS = 1e-6;
const TYPE_ORDER: Record<EventType, number> = { fixation: 0, saccade: 1, blink: 2, bad_data: 3 };

/** θ_D = clamp(k × SD₂d, 1.5°, 6°). */
export function idtDispersionDeg(sd2dDeg: number): number {
  if (!(Number.isFinite(sd2dDeg) && sd2dDeg >= 0)) throw new RangeError(`idtDispersionDeg: SD₂d must be a finite non-negative number, got ${sd2dDeg}`);
  return Math.min(EVENTS.idtMaxDeg, Math.max(EVENTS.idtMinDeg, EVENTS.idtK * sd2dDeg));
}

interface StreamInput {
  tMs: number;
  deg: Vec2 | null;
  valid: boolean;
  blink: boolean;
  distanceMm: number | null;
}

interface Point {
  tMs: number;
  x: number;
  y: number;
  /** False for a point interpolated across a bridged gap. */
  measured: boolean;
  /** Index in the input. */
  src: number;
}

interface InvalidRun {
  first: number;
  last: number;
  bridged: boolean;
}

interface Stream {
  segments: Point[][];
  runs: InvalidRun[];
  intervalMs: number;
}

function checkTimes(inputs: readonly StreamInput[]): void {
  for (let i = 0; i < inputs.length; i++) {
    const t = (inputs[i] as StreamInput).tMs;
    if (!Number.isFinite(t)) throw new RangeError(`event detection: non-finite time at sample ${i}`);
    if (i > 0 && !(t > (inputs[i - 1] as StreamInput).tMs)) throw new RangeError(`event detection: times must increase strictly (sample ${i})`);
  }
}

/**
 * Splits the stream into segments of valid samples. Between two valid samples, the missing time
 * is their separation minus one sample interval: up to `bridgeMs` (75 ms, two frames at 30 Hz)
 * the invalid samples in between are replaced by linear interpolation; anything longer ends the
 * segment and is never bridged.
 */
function segmentStream(inputs: readonly StreamInput[]): Stream {
  checkTimes(inputs);
  const intervalMs = medianFrameIntervalMs(inputs.map((p) => p.tMs));
  const segments: Point[][] = [];
  const runs: InvalidRun[] = [];
  let seg: Point[] | null = null;
  let lastValid = -1;
  for (let i = 0; i < inputs.length; i++) {
    const p = inputs[i] as StreamInput;
    if (!p.valid) continue;
    const deg = p.deg as Vec2;
    if (seg === null) {
      if (i > 0) runs.push({ first: 0, last: i - 1, bridged: false });
      seg = [];
    } else {
      const prev = inputs[lastValid] as StreamInput;
      const prevDeg = prev.deg as Vec2;
      const missing = p.tMs - prev.tMs - intervalMs;
      const bridged = missing <= EVENTS.bridgeMs + EPS_MS;
      if (i - lastValid > 1) runs.push({ first: lastValid + 1, last: i - 1, bridged });
      if (bridged) {
        for (let k = lastValid + 1; k < i; k++) {
          const t = (inputs[k] as StreamInput).tMs;
          const f = (t - prev.tMs) / (p.tMs - prev.tMs);
          seg.push({ tMs: t, x: prevDeg[0] + f * (deg[0] - prevDeg[0]), y: prevDeg[1] + f * (deg[1] - prevDeg[1]), measured: false, src: k });
        }
      } else {
        segments.push(seg);
        seg = [];
      }
    }
    seg.push({ tMs: p.tMs, x: deg[0], y: deg[1], measured: true, src: i });
    lastValid = i;
  }
  if (seg !== null) segments.push(seg);
  if (lastValid < inputs.length - 1) runs.push({ first: lastValid + 1, last: inputs.length - 1, bridged: false });
  return { segments, runs, intervalMs };
}

/** Running median of `n` (odd) samples per axis; the first and last (n − 1)/2 samples are kept. */
function medianSmooth(seg: readonly Point[], n: number): { x: Float64Array; y: Float64Array } {
  const half = (n - 1) / 2;
  const x = Float64Array.from(seg, (p) => p.x);
  const y = Float64Array.from(seg, (p) => p.y);
  if (seg.length < n) return { x, y };
  const sx = x.slice();
  const sy = y.slice();
  for (let i = half; i < seg.length - half; i++) {
    sx[i] = median(x.subarray(i - half, i + half + 1));
    sy[i] = median(y.subarray(i - half, i + half + 1));
  }
  return { x: sx, y: sy };
}

interface FixRange {
  i: number;
  j: number;
  centroid: Vec2;
}

/** Mean of the measured points; of all points if, with irregular sampling, none is measured. */
function centroidOf(seg: readonly Point[], i: number, j: number): Vec2 {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const measuredOnly of [true, false]) {
    for (let k = i; k <= j; k++) {
      const p = seg[k] as Point;
      if (measuredOnly && !p.measured) continue;
      sx += p.x;
      sy += p.y;
      n++;
    }
    if (n > 0) break;
  }
  return [sx / n, sy / n];
}

/** I-DT on the smoothed segment: dispersion (max x − min x) + (max y − min y) ≤ θ_D over ≥ minFixMs. */
function idt(seg: readonly Point[], sx: Float64Array, sy: Float64Array, thetaD: number): FixRange[] {
  const out: FixRange[] = [];
  const n = seg.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && (seg[j] as Point).tMs - (seg[i] as Point).tMs < EVENTS.minFixMs - EPS_MS) j++;
    if (j >= n) break;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = i; k <= j; k++) {
      minX = Math.min(minX, sx[k] as number);
      maxX = Math.max(maxX, sx[k] as number);
      minY = Math.min(minY, sy[k] as number);
      maxY = Math.max(maxY, sy[k] as number);
    }
    if (maxX - minX + (maxY - minY) > thetaD) {
      i++;
      continue;
    }
    while (j + 1 < n) {
      const nx = sx[j + 1] as number;
      const ny = sy[j + 1] as number;
      if (Math.max(maxX, nx) - Math.min(minX, nx) + (Math.max(maxY, ny) - Math.min(minY, ny)) > thetaD) break;
      minX = Math.min(minX, nx);
      maxX = Math.max(maxX, nx);
      minY = Math.min(minY, ny);
      maxY = Math.max(maxY, ny);
      j++;
    }
    out.push({ i, j, centroid: centroidOf(seg, i, j) });
    i = j + 1;
  }
  return out;
}

/** Fixations separated by less than mergeMs whose centroids lie within mergeDeg become one. */
function mergeFixations(seg: readonly Point[], fixations: readonly FixRange[]): FixRange[] {
  const out: FixRange[] = [];
  for (const f of fixations) {
    const prev = out[out.length - 1];
    if (
      prev !== undefined &&
      (seg[f.i] as Point).tMs - (seg[prev.j] as Point).tMs < EVENTS.mergeMs - EPS_MS &&
      angularSeparationDeg(prev.centroid, f.centroid) <= EVENTS.mergeDeg
    ) {
      prev.j = f.j;
      prev.centroid = centroidOf(seg, prev.i, prev.j);
    } else {
      out.push({ ...f });
    }
  }
  return out;
}

/**
 * Blinks are runs of BLINK-flagged samples lasting 50–500 ms (a run of k samples lasts k sample
 * intervals). Every other sample of an unbridged invalid run is bad data, one event per
 * contiguous stretch; a bridged run yields only its blinks.
 */
function runEvents(inputs: readonly StreamInput[], runs: readonly InvalidRun[], intervalMs: number): GazeEvent[] {
  const out: GazeEvent[] = [];
  const pushEvent = (type: EventType, first: number, last: number): void => {
    out.push({
      type,
      onsetMs: (inputs[first] as StreamInput).tMs,
      offsetMs: (inputs[last] as StreamInput).tMs,
      centroidDeg: null,
      centroidPx: null,
      amplitudeDeg: null,
      nSamples: last - first + 1,
    });
  };
  for (const run of runs) {
    let badStart = -1;
    const endBad = (last: number): void => {
      if (badStart >= 0 && !run.bridged) pushEvent('bad_data', badStart, last);
      badStart = -1;
    };
    let k = run.first;
    while (k <= run.last) {
      if (!(inputs[k] as StreamInput).blink) {
        if (badStart < 0) badStart = k;
        k++;
        continue;
      }
      let e = k;
      while (e + 1 <= run.last && (inputs[e + 1] as StreamInput).blink) e++;
      const durationMs = (inputs[e] as StreamInput).tMs - (inputs[k] as StreamInput).tMs + intervalMs;
      if (durationMs >= EVENTS.blinkMinMs - EPS_MS && durationMs <= EVENTS.blinkMaxMs + EPS_MS) {
        endBad(k - 1);
        pushEvent('blink', k, e);
      } else if (badStart < 0) {
        badStart = k;
      }
      k = e + 1;
    }
    endBad(run.last);
  }
  return out;
}

function positive(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function toInputs(samples: readonly GazeSample[], which: 'raw' | 'corrected'): StreamInput[] {
  return samples.map((s) => {
    const deg = which === 'raw' ? s.rawDeg : s.correctedDeg;
    return {
      tMs: s.tCaptureMs,
      deg,
      valid: (s.flags & INVALID_MASK) === 0 && deg !== null && Number.isFinite(deg[0]) && Number.isFinite(deg[1]),
      blink: (s.flags & Flags.BLINK) !== 0,
      distanceMm: s.distanceMm,
    };
  });
}

/**
 * Detects events in the selected estimator's samples (corrected θ, with flags), which must be in
 * strictly increasing time order. `sd2dDeg` is the median validation SD of that estimator on
 * the median-filtered stream (`idtSd2dDeg`).
 */
export function detectEvents(samples: readonly GazeSample[], g: SessionGeometry, sd2dDeg: number): EventDetection {
  const dispersionDeg = idtDispersionDeg(sd2dDeg);
  const inputs = toInputs(samples, 'corrected');
  const stream = segmentStream(inputs);
  const thresholds: EventThresholds = {
    sd2dDeg,
    dispersionDeg,
    minFixMs: EVENTS.minFixMs,
    bridgeMs: EVENTS.bridgeMs,
    mergeMs: EVENTS.mergeMs,
    mergeDeg: EVENTS.mergeDeg,
    blinkMinMs: EVENTS.blinkMinMs,
    blinkMaxMs: EVENTS.blinkMaxMs,
    medianN: EVENTS.medianN,
    frameIntervalMs: stream.intervalMs,
  };
  if (inputs.length < 2) return { events: [], thresholds };

  const events: GazeEvent[] = [];
  for (const seg of stream.segments) {
    const { x, y } = medianSmooth(seg, EVENTS.medianN);
    const fixations = mergeFixations(seg, idt(seg, x, y, dispersionDeg));
    fixations.forEach((f, k) => {
      const first = seg[f.i] as Point;
      const last = seg[f.j] as Point;
      const distances: number[] = [];
      let measured = 0;
      for (let q = f.i; q <= f.j; q++) {
        const p = seg[q] as Point;
        if (!p.measured) continue;
        measured++;
        const d = (inputs[p.src] as StreamInput).distanceMm;
        const dist = positive(d) ? d : g.refDistanceMm;
        if (positive(dist)) distances.push(dist);
      }
      const meanD = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : Number.NaN;
      events.push({
        type: 'fixation',
        onsetMs: first.tMs,
        offsetMs: last.tMs,
        centroidDeg: f.centroid,
        centroidPx: Number.isFinite(meanD) ? degToPx(f.centroid, g.screen, meanD) : null,
        amplitudeDeg: null,
        nSamples: measured,
      });
      const next = fixations[k + 1];
      if (next === undefined) return;
      let between = 0;
      for (let q = f.j + 1; q < next.i; q++) if ((seg[q] as Point).measured) between++;
      events.push({
        type: 'saccade',
        onsetMs: last.tMs,
        offsetMs: (seg[next.i] as Point).tMs,
        centroidDeg: null,
        centroidPx: null,
        amplitudeDeg: angularSeparationDeg(f.centroid, next.centroid),
        nSamples: between,
      });
    });
  }
  events.push(...runEvents(inputs, stream.runs, stream.intervalMs));
  events.sort((a, b) => a.onsetMs - b.onsetMs || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
  return { events, thresholds };
}

/**
 * SD₂d for θ_D: per validation target, the SD (√(σx² + σy²)) of the estimator's raw θ in the
 * target's sampling window after the same segmentation and 3-sample median; the median over
 * targets. NaN when no target has two measured samples.
 */
export function idtSd2dDeg(rec: Recording, samples: readonly GazeSample[]): number {
  const byFrame = new Map(samples.map((s) => [s.frameIndex, s]));
  const sds: number[] = [];
  for (const w of targetWindows(rec)) {
    const inWindow = rec.frames
      .filter((f) => f.meta.tCaptureMs >= w.startMs && f.meta.tCaptureMs < w.endMs)
      .sort((a, b) => a.meta.tCaptureMs - b.meta.tCaptureMs)
      .map((f) => byFrame.get(f.meta.index))
      .filter((s): s is GazeSample => s !== undefined);
    const stream = segmentStream(toInputs(inWindow, 'raw'));
    const xs: number[] = [];
    const ys: number[] = [];
    for (const seg of stream.segments) {
      const { x, y } = medianSmooth(seg, EVENTS.medianN);
      seg.forEach((p, k) => {
        if (!p.measured) return;
        xs.push(x[k] as number);
        ys.push(y[k] as number);
      });
    }
    if (xs.length < 2) continue;
    sds.push(Math.hypot(sampleSd(xs), sampleSd(ys)));
  }
  return median(sds);
}
