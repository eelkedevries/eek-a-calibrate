// The leaky dwell (spec §17.9.1, design §5.2): progress fills at 1/dwell per second while the lit
// zone is the target's, drains at twice that rate outside, and resets after 300 ms continuously
// outside. A frame held by the blink hold of §4.11, or flagged invalid, pauses it: nothing fills,
// drains or counts towards the reset.
import { DWELL } from './params.ts';

export interface DwellState {
  /** 0 to 1; full at 1. */
  progress: number;
  /** How long the gaze has been continuously outside, ms. */
  outsideMs: number;
}

export type DwellInput = 'in' | 'out' | 'held';

export const DWELL_START: Readonly<DwellState> = { progress: 0, outsideMs: 0 };

export function stepDwell(s: DwellState, input: DwellInput, dtMs: number, dwellMs: number): DwellState {
  if (!(dwellMs > 0)) throw new RangeError(`stepDwell: the dwell must be positive, got ${dwellMs}`);
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  if (input === 'held' || dt === 0) return s;
  if (input === 'in') return { progress: Math.min(1, s.progress + dt / dwellMs), outsideMs: 0 };
  const outsideMs = s.outsideMs + dt;
  if (outsideMs >= DWELL.resetOutsideMs) return { progress: 0, outsideMs };
  return { progress: Math.max(0, s.progress - (DWELL.drainFactor * dt) / dwellMs), outsideMs };
}

/** Full, allowing for the rounding of many small steps. */
export function dwellFull(s: DwellState): boolean {
  return s.progress >= 1 - 1e-9;
}
