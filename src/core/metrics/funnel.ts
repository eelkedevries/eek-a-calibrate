// Data-loss funnel (specification §4.12, §16.2.1): expected → delivered → processed → face → open →
// inRange → valid, each stage a subset of the one before. Data loss is counted against the frames
// the device could analyse, so a host slower than the camera lowers the effective rate, not the
// verdict.
import { CAMERA_FPS } from '../constants.ts';
import { median } from '../maths/stats.ts';
import { Flags, INVALID_MASK } from '../types.ts';
import type { Funnel, GazeSample } from '../types.ts';

/** The camera's nominal rate (`getSettings().frameRate`), else 30. */
export function nominalFpsOrDefault(fps: number): number {
  return Number.isFinite(fps) && fps > 0 ? fps : CAMERA_FPS;
}

/** expected = sampleMs/1000 × nominal fps (not rounded). */
export function expectedFrames(sampleMs: number, nominalFps: number): number {
  return (sampleMs / 1000) * nominalFpsOrDefault(nominalFps);
}

/** A frame the vision host analysed: the estimator has a sample for it, not flagged DROPPED. */
export function isProcessedSample(sample: GazeSample | undefined): sample is GazeSample {
  return sample !== undefined && (sample.flags & Flags.DROPPED) === 0;
}

/** A usable validation sample: no invalid flag and a finite raw θ. */
export function isValidSample(sample: GazeSample | undefined): sample is GazeSample & { rawDeg: readonly [number, number] } {
  return (
    sample !== undefined &&
    (sample.flags & INVALID_MASK) === 0 &&
    sample.rawDeg !== null &&
    Number.isFinite(sample.rawDeg[0]) &&
    Number.isFinite(sample.rawDeg[1])
  );
}

export interface FunnelEntry {
  /** The estimator's sample for a delivered frame; undefined when it produced none. */
  sample: GazeSample | undefined;
  /** Whether the frame counts as valid (own or intersection rule). */
  valid: boolean;
}

/**
 * Counts one window. Every entry is a delivered frame. A frame is processed when the estimator
 * has a sample not flagged DROPPED; face, open and inRange then require the absence of NO_FACE,
 * BLINK and OUT_OF_RANGE; valid additionally needs `entry.valid`.
 */
export function funnelCounts(expected: number, entries: Iterable<FunnelEntry>): Funnel {
  const f: Funnel = { expected, delivered: 0, processed: 0, face: 0, open: 0, inRange: 0, valid: 0 };
  for (const { sample, valid } of entries) {
    f.delivered++;
    if (!isProcessedSample(sample)) continue;
    f.processed++;
    if ((sample.flags & Flags.NO_FACE) !== 0) continue;
    f.face++;
    if ((sample.flags & Flags.BLINK) !== 0) continue;
    f.open++;
    if ((sample.flags & Flags.OUT_OF_RANGE) !== 0) continue;
    f.inRange++;
    if (valid) f.valid++;
  }
  return f;
}

export function sumFunnels(funnels: readonly Funnel[]): Funnel {
  const f: Funnel = { expected: 0, delivered: 0, processed: 0, face: 0, open: 0, inRange: 0, valid: 0 };
  for (const g of funnels) {
    f.expected += g.expected;
    f.delivered += g.delivered;
    f.processed += g.processed;
    f.face += g.face;
    f.open += g.open;
    f.inRange += g.inRange;
    f.valid += g.valid;
  }
  return f;
}

/**
 * The processing rate the vision host sustained in a validation (frames per second): the median,
 * over target windows longer than zero, of processed frames per second of window. A median, so a
 * stall within one target still counts as loss there. NaN without such a window.
 */
export function sustainedRateHz(windows: readonly { processed: number; windowS: number }[]): number {
  return median(windows.filter((w) => w.windowS > 0).map((w) => w.processed / w.windowS));
}

/**
 * The frames a target's data loss is counted against: sampleMs/1000 × min(nominal fps, sustained
 * rate), the frames the device could have analysed. The nominal rate alone when the sustained rate
 * is not positive (nothing was processed at all), so that such a run loses everything.
 */
export function lossBasisFrames(sampleMs: number, nominalFps: number, sustainedHz: number): number {
  const fps = nominalFpsOrDefault(nominalFps);
  return expectedFrames(sampleMs, Number.isFinite(sustainedHz) && sustainedHz > 0 ? Math.min(fps, sustainedHz) : fps);
}

/**
 * Data loss = 1 − valid/basis, in percent; `basis` is `f.expected` unless given (lossBasisFrames
 * in a validation report). A camera that delivers a frame or two more than the basis would give a
 * negative loss; it is reported as 0 (the funnel keeps the counts). NaN when the basis is not
 * positive.
 */
export function dataLossPct(f: Funnel, basis: number = f.expected): number {
  if (!(basis > 0)) return Number.NaN;
  return Math.min(100, Math.max(0, (100 * (basis - f.valid)) / basis));
}
