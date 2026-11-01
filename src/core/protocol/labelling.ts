// Frame labels (specification §4.7): a FrameResult is labelled on the main thread when it
// arrives, by comparing its capture time with the presentation intervals. A presentation still
// on screen has an open interval (offsetMs = +∞) until it is closed.
import { safeRect } from '../geometry/screen.ts';
import type {
  FrameLabel,
  FrameMeta,
  FrameResult,
  Presentation,
  PursuitItem,
  RecordedFrame,
  Recording,
  Schedule,
  ScheduleItem,
  SessionGeometry,
  TargetItem,
  Vec2,
} from '../types.ts';
import { applyBlinkMask, gateFrame, HeadSpeedMeter } from './gating.ts';
import { nearestCalibrationGroup } from './layouts.ts';
import { pursuitTargetAt } from './pursuit.ts';

export type StimulusItem = TargetItem | PursuitItem;

export interface PresentationHit {
  item: StimulusItem;
  presentation: Presentation;
  /** Capture time relative to the presentation's onset. */
  tRelMs: number;
}

/** True inside an item's excluded start: the settle window, or a pursuit's hold plus discard. */
export function inSettleWindow(item: StimulusItem, tRelMs: number): boolean {
  return item.kind === 'pursuit' ? tRelMs < item.holdMs + item.discardMs : tRelMs < item.settleMs;
}

/** A presentation interval contains t when onset ≤ t < offset; an open presentation has no offset yet. */
export function contains(p: Presentation, tMs: number): boolean {
  return p.onsetMs <= tMs && tMs < p.offsetMs;
}

/**
 * Finds the presentation shown at each capture time. Presentations are added in onset order by
 * `open` and finished by `close`; the array is the recording's own `presentations`.
 */
export class Labeller {
  readonly presentations: Presentation[];
  private readonly items: Map<string, ScheduleItem>;

  constructor(schedule: Schedule, presentations: Presentation[]) {
    this.presentations = presentations;
    this.items = new Map(schedule.items.map((it) => [it.id, it]));
  }

  /** Starts a presentation at `onsetMs` (the rAF time of its first frame); returns it. */
  open(itemId: string, onsetMs: number, attempt: number): Presentation {
    const item = this.items.get(itemId);
    if (!item || item.kind === 'instruction') throw new RangeError(`Labeller: ${itemId} is not a target or pursuit item of this schedule`);
    const last = this.presentations[this.presentations.length - 1];
    if (last && !Number.isFinite(last.offsetMs)) throw new Error(`Labeller: ${last.itemId} is still open`);
    if (last && onsetMs < last.offsetMs) throw new RangeError(`Labeller: onset ${onsetMs} is before the previous offset ${last.offsetMs}`);
    const p: Presentation = { itemId, onsetMs, offsetMs: Number.POSITIVE_INFINITY, attempt, frameIntervalMs: Number.NaN, aborted: false };
    this.presentations.push(p);
    return p;
  }

  /** Ends the open presentation (the rAF time of the first frame without it). */
  close(p: Presentation, offsetMs: number, frameIntervalMs: number, aborted: boolean): void {
    if (Number.isFinite(p.offsetMs)) throw new Error(`Labeller: ${p.itemId} is already closed`);
    p.offsetMs = Math.max(offsetMs, p.onsetMs);
    p.frameIntervalMs = frameIntervalMs;
    p.aborted = aborted;
  }

  /** The presentation on screen at `tMs`, or null between items. */
  find(tMs: number): PresentationHit | null {
    for (let k = this.presentations.length - 1; k >= 0; k--) {
      const p = this.presentations[k] as Presentation;
      if (p.onsetMs > tMs) continue;
      if (!contains(p, tMs)) return null;
      const item = this.items.get(p.itemId) as StimulusItem;
      return { item, presentation: p, tRelMs: tMs - p.onsetMs };
    }
    return null;
  }

  item(id: string): ScheduleItem | undefined {
    return this.items.get(id);
  }
}

/**
 * The group a frame is recorded under: the item's own group for targets; for pursuit the nearest
 * CAL13 location to the target at the capture time (without the pursuit lag, which is chosen
 * only at fitting time, when the dataset reassigns the group with it). `sx`, `sy` scale the
 * normalised coordinates to the safe rectangle.
 */
export function recordedGroupId(hit: PresentationHit, tMs: number, sx: number, sy: number): string {
  if (hit.item.kind === 'target') return hit.item.groupId;
  return nearestCalibrationGroup(pursuitTargetAt(hit.item, hit.presentation.onsetMs, tMs), sx, sy);
}

export function makeLabel(hit: PresentationHit, groupId: string, accepted: boolean, reject: FrameLabel['reject']): FrameLabel {
  return { itemId: hit.item.id, phase: hit.item.phase, groupId, tRelMs: hit.tRelMs, accepted, reject };
}

/** The target of a hit at capture time `tMs` minus `lagMs`, in layout coordinates. */
export function targetNormAt(hit: PresentationHit, tMs: number, lagMs = 0): Vec2 {
  if (hit.item.kind === 'target') return [hit.item.xNorm, hit.item.yNorm];
  return pursuitTargetAt(hit.item, hit.presentation.onsetMs, tMs - lagMs);
}

/** How far out of capture order the recorded frames can be (results lag refused frames). */
const COUNT_SLACK_MS = 2000;

export interface FrameState {
  /** The page was hidden when the frame arrived. */
  hidden: boolean;
  /** The block needs fullscreen (fullscreen mode) and the stage was not fullscreen. */
  notFullscreen: boolean;
  /** D_t for this frame (DistanceTracker), or null. */
  distanceMm: number | null;
}

/**
 * The recorder (§4.7): turns each frame the vision host processed, or refused, into a
 * RecordedFrame with its label, in the order the frames arrive. The gate sees the eyes-open rule
 * with a look-back mask (the previous frame closed); `finish` applies the full ±1-frame mask once
 * the next frames are known (§15.2.1). Frames outside every presentation get no label.
 */
export class FrameRecorder {
  readonly recording: Recording;
  readonly labeller: Labeller;
  /** FrameResult.receivedMs by frame index, for the latency (§15.2.1). */
  readonly receivedMs = new Map<number, number>();
  private readonly speed = new HeadSpeedMeter();
  private readonly sx: number;
  private readonly sy: number;
  private last: { index: number; open: boolean } | null = null;

  constructor(id: string, schedule: Schedule, geometry: SessionGeometry) {
    this.recording = { id, schedule, geometry, presentations: [], frames: [] };
    this.labeller = new Labeller(schedule, this.recording.presentations);
    const safe = safeRect(geometry.screen);
    this.sx = safe.w;
    this.sy = safe.h;
  }

  addResult(r: FrameResult, state: FrameState): RecordedFrame {
    const face = r.face;
    const t = r.meta.tCaptureMs;
    const open = face !== null && face.eyes.open;
    const previousClosed = this.last !== null && this.last.index === r.meta.index - 1 && !this.last.open;
    this.last = face ? { index: r.meta.index, open } : null;
    const speed = face ? this.speed.push(t, face.pose.yawDeg, face.pose.pitchDeg, face.pose.rollDeg) : Number.NaN;
    if (!face) this.speed.reset();
    const hit = this.labeller.find(t);
    let label: FrameLabel | null = null;
    if (hit) {
      const gate = gateFrame({
        phase: hit.item.phase,
        dropped: false,
        hidden: state.hidden,
        notFullscreen: state.notFullscreen,
        inSettle: inSettleWindow(hit.item, hit.tRelMs),
        face: face !== null,
        open: open && !previousClosed,
        interOcularPx: face ? face.eyes.interOcularPx : Number.NaN,
        yawDeg: face ? face.pose.yawDeg : Number.NaN,
        pitchDeg: face ? face.pose.pitchDeg : Number.NaN,
        headSpeedDegS: speed,
      });
      label = makeLabel(hit, recordedGroupId(hit, t, this.sx, this.sy), gate.accepted, gate.reject);
    }
    const frame: RecordedFrame = {
      meta: r.meta,
      distanceMm: state.distanceMm,
      yawDeg: face ? face.pose.yawDeg : null,
      pitchDeg: face ? face.pose.pitchDeg : null,
      rollDeg: face ? face.pose.rollDeg : null,
      eyeMidNorm: face ? face.eyes.eyeMidNorm : null,
      open,
      label,
      engines: r.engines,
    };
    this.receivedMs.set(r.meta.index, r.receivedMs);
    this.recording.frames.push(frame);
    return frame;
  }

  /** A delivered frame that the vision host refused (one was in flight): counted as dropped. */
  addDropped(meta: FrameMeta): RecordedFrame {
    const hit = this.labeller.find(meta.tCaptureMs);
    const frame: RecordedFrame = {
      meta,
      distanceMm: null,
      yawDeg: null,
      pitchDeg: null,
      rollDeg: null,
      eyeMidNorm: null,
      open: false,
      label: hit ? makeLabel(hit, recordedGroupId(hit, meta.tCaptureMs, this.sx, this.sy), false, 'dropped') : null,
      engines: {},
    };
    this.recording.frames.push(frame);
    return frame;
  }

  /** Accepted and labelled (not settle) frames of one presentation so far, for the item's stopping rule. */
  counts(p: Presentation): { accepted: number; labelled: number } {
    let accepted = 0;
    let labelled = 0;
    for (let k = this.recording.frames.length - 1; k >= 0; k--) {
      const f = this.recording.frames[k] as RecordedFrame;
      // Refused frames are recorded at once and results a little later, so the order is only nearly by time.
      if (f.meta.tCaptureMs < p.onsetMs - COUNT_SLACK_MS) break;
      if (!contains(p, f.meta.tCaptureMs) || !f.label || f.label.itemId !== p.itemId || f.label.reject === 'settle') continue;
      labelled++;
      if (f.label.accepted) accepted++;
    }
    return { accepted, labelled };
  }

  /** Sorts the frames by capture index and applies the ±1-frame blink mask; returns the recording. */
  finish(): Recording {
    this.recording.frames.sort((a, b) => a.meta.index - b.meta.index);
    applyBlinkMask(this.recording.frames);
    return this.recording;
  }
}
