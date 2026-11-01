// Frame acceptance (specification §4.7): one decision per frame, shared by every engine. An
// engine whose own extraction fails loses the frame for itself only; that is not decided here.
import { GATE_FIX, GATE_HEAD } from '../constants.ts';
import { maskBlinks } from '../face/blink.ts';
import type { Phase, RecordedFrame, RejectCode } from '../types.ts';

export interface GateInput {
  phase: Phase;
  /** Refused by the vision host (one frame in flight). */
  dropped: boolean;
  hidden: boolean;
  /** Fullscreen was required (fullscreen mode) and the stage is not fullscreen. */
  notFullscreen: boolean;
  /** Inside the item's settle window (or the pursuit hold and discard). */
  inSettle: boolean;
  face: boolean;
  /** The eyes-open rule, with the neighbouring-frame mask as far as it is known. */
  open: boolean;
  interOcularPx: number;
  yawDeg: number;
  pitchDeg: number;
  /** Head angular speed over the last 100 ms, °/s; NaN when it cannot be measured. */
  headSpeedDegS: number;
}

export interface GateDecision {
  accepted: boolean;
  reject: RejectCode | null;
}

/**
 * The first failing rule, in this order: dropped, hidden, not-fullscreen, settle, no-face,
 * blink, small-face, pose, motion. Head-motion frames use the wider GATE_HEAD pose limits and no
 * speed limit; every other phase uses the fixation rules. A head speed that cannot be measured
 * (no earlier frame within the window) does not reject the frame.
 */
export function gateFrame(g: GateInput): GateDecision {
  const reject = ((): RejectCode | null => {
    if (g.dropped) return 'dropped';
    if (g.hidden) return 'hidden';
    if (g.notFullscreen) return 'not-fullscreen';
    if (g.inSettle) return 'settle';
    if (!g.face) return 'no-face';
    if (!g.open) return 'blink';
    if (!(g.interOcularPx >= GATE_FIX.interOcularPx)) return 'small-face';
    const head = g.phase === 'head';
    const maxYaw = head ? GATE_HEAD.yawDeg : GATE_FIX.yawDeg;
    const maxPitch = head ? GATE_HEAD.pitchDeg : GATE_FIX.pitchDeg;
    if (!(Math.abs(g.yawDeg) <= maxYaw && Math.abs(g.pitchDeg) <= maxPitch)) return 'pose';
    if (!head && g.headSpeedDegS > GATE_FIX.headSpeedDegS) return 'motion';
    return null;
  })();
  return { accepted: reject === null, reject };
}

/** The window over which head speed is measured (§4.7: frames of the last 100 ms). */
export const HEAD_SPEED_WINDOW_MS = 100;

/**
 * Head angular speed by finite difference: the change of (yaw, pitch, roll) between the current
 * frame and the oldest frame within HEAD_SPEED_WINDOW_MS before it, over the time between them.
 * Feed frames with a face in capture order; `reset()` after a gap or a new block.
 */
export class HeadSpeedMeter {
  private readonly history: { t: number; yaw: number; pitch: number; roll: number }[] = [];

  push(tMs: number, yawDeg: number, pitchDeg: number, rollDeg: number): number {
    const h = this.history;
    while (h.length > 0 && (h[0] as { t: number }).t < tMs - HEAD_SPEED_WINDOW_MS) h.shift();
    const oldest = h.find((e) => e.t < tMs);
    h.push({ t: tMs, yaw: yawDeg, pitch: pitchDeg, roll: rollDeg });
    if (!oldest) return Number.NaN;
    const dt = (tMs - oldest.t) / 1000;
    return Math.hypot(yawDeg - oldest.yaw, pitchDeg - oldest.pitch, rollDeg - oldest.roll) / dt;
  }

  reset(): void {
    this.history.length = 0;
  }
}

/** Rejections that outrank a blink: a frame already rejected for one of these keeps its code. */
const BEFORE_BLINK: ReadonlySet<RejectCode> = new Set(['dropped', 'hidden', 'not-fullscreen', 'settle', 'no-face', 'blink', 'outlier']);

/**
 * The ±1-frame blink mask over a finished recording (§4.3, §15.2.1): frames next to a closed
 * frame (by FrameMeta.index, so a dropped frame does not join distant frames) become closed, and
 * an accepted frame, or one rejected only for its face size, pose or motion, is relabelled
 * 'blink'. Refused frames and frames without a face say nothing about the eyes, so, like frames
 * beyond the ends, they mask nothing. Mutates the frames; returns how many labels changed.
 */
export function applyBlinkMask(frames: RecordedFrame[]): number {
  const order = frames
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.label?.reject !== 'dropped' && f.yawDeg !== null)
    .sort((a, b) => a.f.meta.index - b.f.meta.index);
  const masked = maskBlinks(
    order.map(({ f }) => f.open),
    order.map(({ f }) => f.meta.index),
  );
  let changed = 0;
  order.forEach(({ f }, k) => {
    if (masked[k] || !f.open) return;
    f.open = false;
    const label = f.label;
    if (label && !(label.reject !== null && BEFORE_BLINK.has(label.reject))) {
      label.accepted = false;
      label.reject = 'blink';
      changed++;
    }
  });
  return changed;
}
