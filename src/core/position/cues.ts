// The cues of the ready check (design §3.4–§3.6, spec §17.5.1), DOM-free: which conditions are
// active (with hysteresis, so a value on a boundary does not flicker), the priority order and
// the single-instruction rule, the status row's three groups, and the copy and directional cue
// for each condition. Copy is returned as string keys; the app's t() fills them.
import type { Signals } from './signals.ts';
import {
  BACKLIGHT_EXIT,
  BLACK_FRAME_LUMA,
  CENTRE_EXIT,
  CLOSE_EXIT,
  DARK_FRAME_LUMA,
  FAR_EXIT,
  GLARE_EXIT,
  IRIS_EXIT,
  LUMA_EXIT_DELTA,
  POSE_EXIT,
  ROLL_EXIT,
  TILT_EXIT_DEG,
  TIMING,
  type ClassRanges,
  type Setup,
} from './thresholds.ts';

export type ConditionId =
  | 'loading'
  | 'no-camera'
  | 'black'
  | 'too-dark'
  | 'no-face'
  | 'several-faces'
  | 'cut-off'
  | 'too-far'
  | 'too-close'
  | 'phone-flat'
  | 'phone-leaning'
  | 'face-high'
  | 'face-low'
  | 'off-centre'
  | 'phone-rotated'
  | 'turned'
  | 'chin-up'
  | 'chin-down'
  | 'head-tilted'
  | 'face-dark'
  | 'backlit'
  | 'too-bright'
  | 'glare'
  | 'eyes-hidden'
  | 'eyes-closed'
  | 'moving';

export type StatusGroup = 'distance' | 'position' | 'light';

interface ConditionInfo {
  /** The rank of design §3.4: lower ranks win. */
  rank: number;
  /** The status-row group, or null for the blockers. */
  group: StatusGroup | null;
  /** Shown at once, without the 300 ms persistence. */
  blocker: boolean;
}

export const CONDITIONS: Readonly<Record<ConditionId, ConditionInfo>> = {
  loading: { rank: 0, group: null, blocker: true },
  'no-camera': { rank: 1, group: null, blocker: true },
  black: { rank: 2, group: null, blocker: true },
  'too-dark': { rank: 3, group: 'light', blocker: false },
  'no-face': { rank: 4, group: 'position', blocker: false },
  'several-faces': { rank: 5, group: 'position', blocker: false },
  'cut-off': { rank: 6, group: 'position', blocker: false },
  'too-far': { rank: 7, group: 'distance', blocker: false },
  'too-close': { rank: 8, group: 'distance', blocker: false },
  'phone-flat': { rank: 9, group: 'position', blocker: false },
  'phone-leaning': { rank: 9, group: 'position', blocker: false },
  'face-high': { rank: 10, group: 'position', blocker: false },
  'face-low': { rank: 10, group: 'position', blocker: false },
  'off-centre': { rank: 11, group: 'position', blocker: false },
  'phone-rotated': { rank: 12, group: 'position', blocker: false },
  turned: { rank: 13, group: 'position', blocker: false },
  'chin-up': { rank: 14, group: 'position', blocker: false },
  'chin-down': { rank: 14, group: 'position', blocker: false },
  'head-tilted': { rank: 15, group: 'position', blocker: false },
  'face-dark': { rank: 16, group: 'light', blocker: false },
  backlit: { rank: 17, group: 'light', blocker: false },
  'too-bright': { rank: 18, group: 'light', blocker: false },
  glare: { rank: 19, group: 'light', blocker: false },
  'eyes-hidden': { rank: 20, group: 'position', blocker: false },
  'eyes-closed': { rank: 20, group: 'position', blocker: false },
  moving: { rank: 21, group: 'position', blocker: false },
};

/** Every condition in priority order. */
export const PRIORITY: readonly ConditionId[] = (Object.keys(CONDITIONS) as ConditionId[]).sort((a, b) => CONDITIONS[a].rank - CONDITIONS[b].rank);

export interface CueContext {
  /** The face model or the engines are still loading. */
  loading: boolean;
  /** The camera has started (before that, "Allow the camera to start"). */
  cameraStarted: boolean;
}

const fin = Number.isFinite;

/**
 * The active conditions. `previous` makes each threshold sticky: a condition that was active
 * stays so until its exit value is passed (design §3.2, hysteresis). Conditions that cannot be
 * judged without a face are inactive while there is none; "no face" covers them.
 */
export function activeConditions(s: Signals, r: ClassRanges, previous: ReadonlySet<ConditionId>, ctx: CueContext): Set<ConditionId> {
  const on = new Set<ConditionId>();
  const was = (id: ConditionId) => previous.has(id);
  if (ctx.loading) on.add('loading');
  if (!ctx.cameraStarted || !s.delivering) on.add('no-camera');
  if (fin(s.frameLuma) && s.frameLuma < (was('black') ? BLACK_FRAME_LUMA + 5 : BLACK_FRAME_LUMA)) on.add('black');

  if (!s.face) {
    const dark = fin(s.frameLuma) && s.frameLuma < (was('too-dark') ? DARK_FRAME_LUMA + 10 : DARK_FRAME_LUMA);
    on.add(dark ? 'too-dark' : 'no-face');
  } else {
    if (s.faceCount > 1) on.add('several-faces');

    const m = s.margins;
    if (m) {
      const k = was('cut-off') ? 1.25 : 1;
      if (m.x < r.margin.x * k || m.y < r.margin.y * k) on.add('cut-off');
    }

    const [lo, hi] = r.face.band;
    if (fin(s.scale)) {
      if (s.scale < (was('too-far') ? lo * FAR_EXIT : lo)) on.add('too-far');
      else if (s.scale > (was('too-close') ? hi * CLOSE_EXIT : hi)) on.add('too-close');
    }
    if (fin(s.irisPx) && s.irisPx < (was('too-far') ? r.irisFloorPx * IRIS_EXIT : r.irisFloorPx)) on.add('too-far');

    const [dx, dy] = s.centring;
    const cxTol = was('off-centre') ? r.centre.x * CENTRE_EXIT : r.centre.x;
    if (fin(dx) && Math.abs(dx) > cxTol) on.add('off-centre');
    const highTol = was('face-high') ? r.centre.y * CENTRE_EXIT : r.centre.y;
    const lowTol = was('face-low') ? r.centre.y * CENTRE_EXIT : r.centre.y;
    if (fin(dy) && dy < -highTol) on.add('face-high');
    else if (fin(dy) && dy > lowTol) on.add('face-low');

    const yawOff = s.yawDeg - r.pose.yaw;
    if (fin(yawOff) && Math.abs(yawOff) > (was('turned') ? r.pose.yawWindow * POSE_EXIT : r.pose.yawWindow)) on.add('turned');
    const pitchOff = s.pitchDeg - r.pose.pitch;
    const [pLo, pHi] = r.pose.pitchWindow;
    if (fin(pitchOff) && pitchOff < (was('chin-up') ? pLo * POSE_EXIT : pLo)) on.add('chin-up');
    else if (fin(pitchOff) && pitchOff > (was('chin-down') ? pHi * POSE_EXIT : pHi)) on.add('chin-down');
    if (fin(s.rollDeg) && Math.abs(s.rollDeg) > (was('head-tilted') ? r.pose.rollWindow * POSE_EXIT : r.pose.rollWindow)) on.add('head-tilted');

    const L = r.light;
    if (fin(s.lumaMean) && s.lumaMean < (was('face-dark') ? L.lumaMin + LUMA_EXIT_DELTA : L.lumaMin)) on.add('face-dark');
    if (fin(s.lumaMean) && s.lumaMean > (was('too-bright') ? L.lumaMax - LUMA_EXIT_DELTA : L.lumaMax)) on.add('too-bright');
    if (fin(s.backlight) && s.backlight < (was('backlit') ? BACKLIGHT_EXIT : L.backlightMin)) on.add('backlit');
    if (fin(s.glare) && s.glare > (was('glare') ? GLARE_EXIT : L.glareMax)) on.add('glare');

    if (s.eyesClosedMs >= TIMING.eyesClosedMs) on.add(s.eyesLidsClosed ? 'eyes-closed' : 'eyes-hidden');
    if (fin(s.headDegS) && s.headDegS > r.speed.headDegS) on.add('moving');
  }

  if (r.tilt && fin(s.tiltDeg)) {
    const [low, high] = r.tilt.cue;
    if (s.tiltDeg < (was('phone-flat') ? low + TILT_EXIT_DEG : low)) on.add('phone-flat');
    else if (s.tiltDeg > (was('phone-leaning') ? high - TILT_EXIT_DEG : high)) on.add('phone-leaning');
    if (fin(s.phoneRollDeg) && Math.abs(s.phoneRollDeg) > (was('phone-rotated') ? r.tilt.rollMax * ROLL_EXIT : r.tilt.rollMax)) on.add('phone-rotated');
  }
  if (r.phone && fin(s.rotationDegS) && s.rotationDegS > r.speed.phoneDegS) on.add('moving');
  return on;
}

/** The highest-priority active condition (the single instruction), or null when all is clear. */
export function topCondition(active: ReadonlySet<ConditionId>): ConditionId | null {
  for (const id of PRIORITY) if (active.has(id)) return id;
  return null;
}

export type StatusValue = 'good' | 'adjust';
export type StatusRow = Readonly<Record<StatusGroup, StatusValue>>;

/**
 * The status row (design §3.6): Distance, Position and Light, each good or adjust. Without a face
 * (or before the camera delivers) nothing can be judged, and nothing is shown as good.
 */
export function statusRow(active: ReadonlySet<ConditionId>, s: Signals): StatusRow {
  const row: Record<StatusGroup, StatusValue> = { distance: 'good', position: 'good', light: 'good' };
  for (const id of active) {
    const g = CONDITIONS[id].group;
    if (g) row[g] = 'adjust';
  }
  if (!s.face || !s.delivering) {
    row.distance = 'adjust';
    row.position = 'adjust';
    if (!fin(s.lumaMean)) row.light = 'adjust';
  }
  return row;
}

/** The one directional cue drawn with a condition (design §3.5). */
export type DirectionalCue =
  | { kind: 'chevrons'; direction: 'out' | 'in' }
  | { kind: 'chevron' }
  | { kind: 'phone'; icon: 'upright' | 'back' | 'raise' | 'lower' | 'straight' }
  | null;

export interface CueCopy {
  headline: string;
  tip: string | null;
  cue: DirectionalCue;
}

/**
 * The headline and tip keys (strings/guard.ts) and the directional cue of a condition. Phone and
 * tablet classes take the phone wording; In hand adds "Hold the phone at eye level" to the
 * phone-height cues (design §3.2).
 */
export function cueCopy(id: ConditionId, r: ClassRanges, setup: Setup): CueCopy {
  const device = r.phone ? 'phone' : 'webcam';
  const inHand = setup === 'in-hand' && r.phone;
  switch (id) {
    case 'loading':
      return { headline: 'guard.cue.loading', tip: 'guard.tip.loading', cue: null };
    case 'no-camera':
      return { headline: 'guard.cue.noCamera', tip: 'guard.tip.noCamera', cue: null };
    case 'black':
      return { headline: 'guard.cue.black', tip: null, cue: null };
    case 'too-dark':
      return { headline: 'guard.cue.tooDark', tip: 'guard.tip.tooDark', cue: null };
    case 'no-face':
      return { headline: `guard.cue.noFace.${device}`, tip: null, cue: null };
    case 'several-faces':
      return { headline: 'guard.cue.severalFaces', tip: null, cue: null };
    case 'cut-off':
      return { headline: 'guard.cue.cutOff', tip: null, cue: { kind: 'chevron' } };
    case 'too-far':
      return { headline: 'guard.cue.tooFar', tip: 'guard.tip.tooFar', cue: { kind: 'chevrons', direction: 'out' } };
    case 'too-close':
      return { headline: 'guard.cue.tooClose', tip: null, cue: { kind: 'chevrons', direction: 'in' } };
    case 'phone-flat':
      return { headline: 'guard.cue.phoneFlat', tip: inHand ? 'guard.tip.eyeLevel' : 'guard.tip.prop', cue: { kind: 'phone', icon: 'upright' } };
    case 'phone-leaning':
      return { headline: 'guard.cue.phoneLeaning', tip: inHand ? 'guard.tip.eyeLevel' : 'guard.tip.prop', cue: { kind: 'phone', icon: 'back' } };
    case 'face-high':
      return r.phone
        ? { headline: 'guard.cue.faceHigh.phone', tip: inHand ? 'guard.tip.eyeLevel' : 'guard.tip.prop', cue: { kind: 'phone', icon: 'raise' } }
        : { headline: 'guard.cue.faceHigh.webcam', tip: 'guard.tip.sitUp', cue: { kind: 'chevron' } };
    case 'face-low':
      return r.phone
        ? { headline: 'guard.cue.faceLow.phone', tip: inHand ? 'guard.tip.eyeLevel' : null, cue: { kind: 'phone', icon: 'lower' } }
        : { headline: 'guard.cue.faceLow.webcam', tip: null, cue: { kind: 'chevron' } };
    case 'off-centre':
      return { headline: 'guard.cue.offCentre', tip: null, cue: { kind: 'chevron' } };
    case 'phone-rotated':
      return { headline: 'guard.cue.phoneRotated', tip: null, cue: { kind: 'phone', icon: 'straight' } };
    case 'turned':
      return { headline: 'guard.cue.turned', tip: null, cue: null };
    case 'chin-up':
      return { headline: 'guard.cue.chinUp', tip: null, cue: null };
    case 'chin-down':
      return { headline: 'guard.cue.chinDown', tip: null, cue: null };
    case 'head-tilted':
      return { headline: 'guard.cue.headTilted', tip: null, cue: null };
    case 'face-dark':
      return { headline: 'guard.cue.faceDark', tip: 'guard.tip.faceDark', cue: null };
    case 'backlit':
      return { headline: 'guard.cue.backlit', tip: 'guard.tip.backlit', cue: null };
    case 'too-bright':
      return { headline: 'guard.cue.tooBright', tip: null, cue: null };
    case 'glare':
      return { headline: 'guard.cue.glare', tip: 'guard.tip.glare', cue: null };
    case 'eyes-hidden':
      return { headline: 'guard.cue.eyesHidden', tip: 'guard.tip.eyesHidden', cue: null };
    case 'eyes-closed':
      return { headline: 'guard.cue.eyesClosed', tip: null, cue: null };
    case 'moving':
      return { headline: `guard.cue.moving.${device}`, tip: r.phone ? 'guard.tip.moving' : null, cue: null };
  }
}
