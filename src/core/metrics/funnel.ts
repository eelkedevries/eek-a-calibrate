// Data-loss funnel (specification §4.12): expected → delivered → processed → face → open →
// inRange → valid, each stage a subset of the one before.
import { CAMERA_FPS } from '../constants.ts';
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
    if (sample === undefined || (sample.flags & Flags.DROPPED) !== 0) continue;
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
 * Data loss = 1 − valid/expected, in percent. A camera that delivers a frame or two more than
 * nominal would give a negative loss; it is reported as 0 (the funnel keeps the counts). NaN
 * when nothing was expected.
 */
export function dataLossPct(f: Funnel): number {
  if (!(f.expected > 0)) return Number.NaN;
  return Math.min(100, Math.max(0, (100 * (f.expected - f.valid)) / f.expected));
}
