// The position guard's ranges and timings (design §3.2–§3.3, spec §17.5.1). Every number here
// is heuristic: the design took them from the positioning research and none has yet been
// checked on real phones or webcams (spec §17.12.4). They live here, not in constants.ts.
import { SETUP } from '../constants.ts';

/** The rows of design §3.2: which ranges apply to this player. */
export type GuardClass = 'phone-portrait' | 'phone-landscape' | 'tablet' | 'webcam';

/** The Title's set-up chooser (spec §17.4.1). */
export type Setup = 'propped' | 'in-hand' | 'webcam';

export const SETUPS: readonly Setup[] = ['propped', 'in-hand', 'webcam'];

/** A band [lo, hi] of an absolute quantity. */
export type Band = readonly [number, number];

export interface ClassRanges {
  cls: GuardClass;
  /** Phone or tablet copy, and the device-motion checks. */
  phone: boolean;
  /** The advised viewing distance in cm (Details only, never a cue). */
  advisedCm: Band;
  /** Face width ÷ the frame's long side: the oval's target and the accepted band. */
  face: { target: number; band: Band };
  /** "Move a little closer" below this iris diameter (px). */
  irisFloorPx: number;
  /** Least margin from the face box to the visible edge, as fractions of the visible region. */
  margin: { x: number; y: number };
  /** Centring tolerance |dx|, |dy| (fractions of the frame), measured from the oval's centre. */
  centre: { x: number; y: number };
  /** The pose expected when looking at the window centre (pitch positive down) and its window. */
  pose: { yaw: number; pitch: number; yawWindow: number; pitchWindow: Band; rollWindow: number };
  /** Phone upright angle θ (0 flat, 90 vertical) and in-plane roll; null without a phone. */
  tilt: { band: Band; cue: Band; rollMax: number } | null;
  light: { lumaMin: number; lumaMax: number; backlightMin: number; glareMax: number };
  /** "Hold still": head speed and phone rotation rate (°/s) held for SPEED_PERSIST_MS. */
  speed: { headDegS: number; phoneDegS: number };
}

/** "Hold still": the head turning faster than this (°/s) for SPEED_PERSIST_MS. */
export const HEAD_SPEED_DEG_S = 30;

const LIGHT = { lumaMin: SETUP.lumaMin, lumaMax: SETUP.lumaMax, backlightMin: SETUP.backlightMin, glareMax: SETUP.glareMax } as const;
const PHONE_TILT = { band: [60, 100], cue: [55, 105], rollMax: 10 } as const;
/** In hand relaxes the phone's steadiness cue (design §3.2). */
const PHONE_DEG_S = { propped: 20, inHand: 30 } as const;

/** Expected yaw on a phone held sideways: about 11° towards the camera side (design §3.2). */
export const LANDSCAPE_YAW_DEG = 11;

/**
 * The ranges for a class. On a phone or tablet in landscape the expected yaw points towards the
 * camera: positive yaw turns towards the subject's left, so a camera on the screen's left (as the
 * player sees it) gives a face turned to the player's right, which is negative yaw.
 */
export function classRanges(cls: GuardClass, opts: { setup?: Setup; cameraSide?: 'left' | 'right'; landscape?: boolean } = {}): ClassRanges {
  const phoneDegS = opts.setup === 'in-hand' ? PHONE_DEG_S.inHand : PHONE_DEG_S.propped;
  const sideYaw = (opts.cameraSide ?? 'left') === 'left' ? -LANDSCAPE_YAW_DEG : LANDSCAPE_YAW_DEG;
  switch (cls) {
    case 'phone-portrait':
      return {
        cls,
        phone: true,
        advisedCm: [30, 40],
        face: { target: 0.33, band: [0.28, 0.42] },
        irisFloorPx: 16,
        margin: { x: 0.1, y: 0.08 },
        centre: { x: 0.1, y: 0.12 },
        pose: { yaw: 0, pitch: 12, yawWindow: 12, pitchWindow: [-10, 12], rollWindow: 10 },
        tilt: PHONE_TILT,
        light: LIGHT,
        speed: { headDegS: HEAD_SPEED_DEG_S, phoneDegS },
      };
    case 'phone-landscape':
      return {
        cls,
        phone: true,
        advisedCm: [40, 50],
        face: { target: 0.28, band: [0.24, 0.33] },
        irisFloorPx: 14,
        margin: { x: 0.08, y: 0.08 },
        centre: { x: 0.12, y: 0.1 },
        pose: { yaw: sideYaw, pitch: 0, yawWindow: 12, pitchWindow: [-12, 12], rollWindow: 10 },
        tilt: PHONE_TILT,
        light: LIGHT,
        speed: { headDegS: HEAD_SPEED_DEG_S, phoneDegS },
      };
    case 'tablet':
      // The phone-landscape row with the tablet's distance and face size (design §3.2).
      return {
        cls,
        phone: true,
        advisedCm: [40, 55],
        face: { target: 0.27, band: [0.22, 0.33] },
        irisFloorPx: 14,
        margin: { x: 0.08, y: 0.08 },
        centre: { x: 0.12, y: 0.1 },
        pose: { yaw: opts.landscape ? sideYaw : 0, pitch: 0, yawWindow: 12, pitchWindow: [-12, 12], rollWindow: 10 },
        tilt: PHONE_TILT,
        light: LIGHT,
        speed: { headDegS: HEAD_SPEED_DEG_S, phoneDegS },
      };
    case 'webcam':
      return {
        cls,
        phone: false,
        advisedCm: [50, 70],
        face: { target: 0.21, band: [0.16, 0.3] },
        irisFloorPx: 10,
        margin: { x: 0.06, y: 0.06 },
        centre: { x: 0.12, y: 0.15 },
        pose: { yaw: 0, pitch: 12, yawWindow: 12, pitchWindow: [-10, 12], rollWindow: 10 },
        tilt: null,
        light: LIGHT,
        speed: { headDegS: HEAD_SPEED_DEG_S, phoneDegS },
      };
  }
}

/** A short screen side from which a mobile device counts as a tablet (CSS px). */
export const TABLET_SHORT_SIDE_PX = 600;

/**
 * The class for this player. The set-up choice overrides the device class (spec §17.4.1):
 * Webcam always uses the webcam row; Propped and In hand use the phone rows, or the tablet row on
 * a large touch screen. Portrait and landscape follow the window's aspect ratio (5/4).
 */
export function guardClass(o: { setup: Setup; mobile: boolean; screenShortPx: number; windowW: number; windowH: number }): GuardClass {
  if (o.setup === 'webcam') return 'webcam';
  if (o.mobile && o.screenShortPx >= TABLET_SHORT_SIDE_PX) return 'tablet';
  return o.windowW < (5 / 4) * o.windowH ? 'phone-portrait' : 'phone-landscape';
}

/** The set-up the chooser starts on: mobile → Propped, otherwise Webcam (spec §17.4.1). */
export function defaultSetup(mobile: boolean): Setup {
  return mobile ? 'propped' : 'webcam';
}

// ----- Hysteresis (design §3.2): a condition enters at one value and leaves at a safer one ------

/** "Too far" leaves at 0.88 / 0.80 of where it enters; "too close" at 1.15 / 1.25. */
export const FAR_EXIT = 0.88 / 0.8;
export const CLOSE_EXIT = 1.15 / 1.25;
/** Centring and pose leave at two thirds of where they enter (0.08 / 0.12, 10° / 15°). */
export const CENTRE_EXIT = 0.08 / 0.12;
export const POSE_EXIT = 10 / 15;
/** Face luma: dark below 60, clear again above 70; too bright above 200, clear below 190. */
export const LUMA_EXIT_DELTA = 10;
export const BACKLIGHT_EXIT = 0.85;
export const GLARE_EXIT = 0.015;
/** The iris floor and the phone's tilt leave 10 % and 5° inside where they enter. */
export const IRIS_EXIT = 1.1;
export const TILT_EXIT_DEG = 5;
export const ROLL_EXIT = 0.7;

// ----- Blockers measured on the whole frame (heuristic) -----------------------------------------

/** Mean frame luma (32 × 18) under which the camera is taken to be covered. */
export const BLACK_FRAME_LUMA = 10;
/** Mean frame luma under which "no face" is reported as too dark instead. */
export const DARK_FRAME_LUMA = 40;

// ----- Timing (design §3.2–§3.3, §3.6, §3.8) --------------------------------------------------

export const TIMING = {
  /** A new cue must persist this long before it shows (blockers show at once). */
  persistMs: 300,
  /** A shown cue stays at least this long. */
  minShowMs: 1000,
  /** The tip appears under a cue shown this long. */
  tipAfterMs: 4000,
  /** All clear must hold this long before Ready. */
  holdMs: SETUP.holdMs,
  /** "Start anyway" after this long without Ready while a face is present. */
  anywayAfterMs: 20_000,
  /** "Allow the camera to start" after this long without a frame. */
  noFramesMs: 2000,
  /** Eye closures shorter than this are ignored. */
  eyesClosedMs: 1500,
  /** A face must be missing this long before "no face". */
  faceDebounceMs: 300,
  /** The head or the phone moving fast for this long is "moving". */
  speedPersistMs: 300,
  /** Below this processed frame rate the slow-device chip shows. */
  slowHz: 15,
} as const;

/** Smoothing windows of design §3.1, ms. */
export const SMOOTHING = {
  frameLumaMs: 500,
  scaleMs: 500,
  irisMs: 500,
  centringMs: 500,
  poseMs: 300,
  lightMs: 1000,
  speedMs: 300,
  fpsMs: 2000,
  /** The phone's gravity low-pass time constant. */
  tiltMs: 300,
  /** Rotation-rate variance over this window decides "hand-held". */
  handHeldMs: 2000,
} as const;

/** Rotation-rate variance (summed over the three axes, (°/s)²) above which a Propped phone is in a hand. */
export const HAND_HELD_VARIANCE = 4;

// ----- After Get ready: home and the two grades (design §3.3) --------------------------------

export type GuardContext = 'warmup' | 'warmup-head' | 'reaim' | 'look' | 'challenge';

/** Tolerances around home during the warm-up levels and Re-aim before a fit exists. */
export const HOME_TOLERANCE = { scaleFrac: 0.2, centre: 0.1, angleDeg: 15, tiltDeg: 8 } as const;
/** After the fit: phone θ and roll within this many degrees of home. */
export const FIT_TILT_DEG = 6;
/** "Drifting" beyond this fraction of a margin; "out" beyond the whole margin. */
export const DRIFT_FRACTION = 0.7;

export interface PauseTiming {
  /** Out of range this long pauses. */
  outMs: number;
  /** Face lost this long pauses. */
  lostMs: number;
}

/** The warm-up and Re-aim pause sooner than Free look and the challenge (spec §17.5.3). */
export function pauseTiming(context: GuardContext): PauseTiming {
  return context === 'look' || context === 'challenge' ? { outMs: 1000, lostMs: 700 } : { outMs: 500, lostMs: 400 };
}

/** Nudge words appear only in Free look and the challenge (design §3.7). */
export function nudgesAllowed(context: GuardContext): boolean {
  return context === 'look' || context === 'challenge';
}

export const RESUME = {
  /** Everything in range this long resumes. */
  inRangeMs: 1000,
  /** "Back in place" shows this long before play continues. */
  backInPlaceMs: 400,
  /** The overlay adds its second action after this long. */
  extraAfterMs: 10_000,
} as const;
