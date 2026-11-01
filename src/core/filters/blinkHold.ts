// Blink hold for the live gaze dot (specification §4.11), after gaze-lite's `blinkHold`.
// Display only: the samples themselves are flagged BLINK and never altered.
import { BLINK_HOLD } from '../constants.ts';

export interface BlinkHoldOptions {
  /** Both blink blendshapes above this close the gate. */
  close: number;
  /** Both blink blendshapes below this open it again. */
  open: number;
  /** Longest hold of the last valid position, ms. */
  capMs: number;
  /** Hide the dot after this long without a valid update, ms. */
  hideMs: number;
}

export interface BlinkHoldState {
  closed: boolean;
  /** When the gate last closed, ms. */
  closedSinceMs: number;
  /** When the dot last received a valid update, ms. */
  lastUpdateMs: number;
}

export const BLINK_HOLD_INITIAL: BlinkHoldState = { closed: false, closedSinceMs: -Infinity, lastUpdateMs: -Infinity };

export interface BlinkHoldFrame {
  tMs: number;
  /** Blink blendshapes, or null when there is no face. */
  blinkL: number | null;
  blinkR: number | null;
  /** True when this frame has a usable gaze prediction to show. */
  gazeValid: boolean;
}

export interface BlinkHoldDecision {
  state: BlinkHoldState;
  /** The hysteresis gate reads the eyes as closed. */
  closed: boolean;
  /** update: move the dot to this frame's gaze; hold: keep it where it is; hide: hide it. */
  display: 'update' | 'hold' | 'hide';
}

/**
 * One step of the blink-hold state machine (pure). The gate closes when both blink blendshapes
 * exceed `close` (0.6) and opens when both fall below `open` (0.4); between the thresholds, or
 * without blendshapes, it keeps its state. While closed, the dot holds its last position for at
 * most `capMs` (800 ms) after closing; after that a valid gaze updates it again, so a stuck gate
 * (squint, glasses) gives a jittery dot instead of a frozen one. Whenever no valid update has
 * arrived for more than `hideMs` (600 ms), the dot is hidden.
 */
export function blinkHold(
  state: BlinkHoldState,
  frame: BlinkHoldFrame,
  options: BlinkHoldOptions = BLINK_HOLD,
): BlinkHoldDecision {
  const { tMs, blinkL, blinkR, gazeValid } = frame;
  if (!Number.isFinite(tMs)) throw new RangeError(`blinkHold: non-finite time ${tMs}`);
  let { closed, closedSinceMs, lastUpdateMs } = state;
  if (blinkL !== null && blinkR !== null && Number.isFinite(blinkL) && Number.isFinite(blinkR)) {
    if (!closed && blinkL > options.close && blinkR > options.close) {
      closed = true;
      closedSinceMs = tMs;
    } else if (closed && blinkL < options.open && blinkR < options.open) {
      closed = false;
    }
  }
  const holding = closed && tMs - closedSinceMs <= options.capMs;
  let display: BlinkHoldDecision['display'];
  if (gazeValid && !holding) {
    display = 'update';
    lastUpdateMs = tMs;
  } else {
    display = tMs - lastUpdateMs > options.hideMs ? 'hide' : 'hold';
  }
  return { state: { closed, closedSinceMs, lastUpdateMs }, closed, display };
}
