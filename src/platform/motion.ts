// Device motion for the phone tilt check (spec §17.5.4, design §3.9; overrides §14.2.10). On a
// phone or tablet the app reads DeviceMotionEvent gravity and rotation rate for the upright
// angle θ, the in-plane roll (corrected by screen.orientation.angle) and steadiness, with
// DeviceOrientationEvent as the fallback where motion delivers nothing. It is optional and never
// blocks: without a sensor or permission the camera-based cues still cover height and angle.
// Readings stay on the device; θ and roll are only exported as covariates (§17.10.2).
import { gravityFromOrientation, LowPass3, nearestReading, SteadinessMeter, tiltFromGravity, type MotionReading, type Vec3 } from '../core/position/tilt.ts';

export type { MotionReading };

/** What session.json records (spec §17.4.2): asked and allowed, refused, or nothing to read. */
export type MotionPermission = 'granted' | 'denied' | 'unavailable' | 'not-asked';

/** Readings kept for stamping frames (FrameRecorder looks up the one nearest each capture). */
const KEEP_MS = 10_000;
/** Without a usable devicemotion reading this long, the orientation fallback starts. */
const FALLBACK_AFTER_MS = 1000;

/**
 * Turns raw device readings into MotionReadings: gravity through the 300 ms low-pass, then θ and
 * roll; the rotation rate into steadiness and the hand-held detection. DOM-free.
 */
export class MotionProcessor {
  private readonly gravity = new LowPass3();
  private readonly steady = new SteadinessMeter();

  fromMotion(tMs: number, g: Vec3, rotation: { alpha: number | null; beta: number | null; gamma: number | null } | null, screenAngleDeg: number): MotionReading | null {
    if (!g.every(Number.isFinite)) return null;
    const smooth = this.gravity.push(tMs, g);
    const { tiltDeg, rollDeg } = tiltFromGravity(smooth, screenAngleDeg);
    if (!Number.isFinite(tiltDeg)) return null;
    if (rotation) this.steady.push(tMs, rotation.alpha, rotation.beta, rotation.gamma);
    return { tMs, tiltDeg, rollDeg, rotationDegS: rotation ? this.steady.rateDegS(tMs) : Number.NaN, handHeld: this.steady.handHeld(), source: 'motion' };
  }

  fromOrientation(tMs: number, betaDeg: number | null, gammaDeg: number | null, screenAngleDeg: number): MotionReading | null {
    if (typeof betaDeg !== 'number' || typeof gammaDeg !== 'number' || !Number.isFinite(betaDeg) || !Number.isFinite(gammaDeg)) return null;
    const smooth = this.gravity.push(tMs, gravityFromOrientation(betaDeg, gammaDeg));
    const { tiltDeg, rollDeg } = tiltFromGravity(smooth, screenAngleDeg);
    if (!Number.isFinite(tiltDeg)) return null;
    return { tMs, tiltDeg, rollDeg, rotationDegS: Number.NaN, handHeld: false, source: 'orientation' };
  }
}

/** The readings so far, in time order, trimmed to the last KEEP_MS. */
export class ReadingLog {
  private readonly items: MotionReading[] = [];

  push(r: MotionReading): void {
    const last = this.items[this.items.length - 1];
    if (last && r.tMs < last.tMs) this.items.length = 0;
    this.items.push(r);
    while (this.items.length > 0 && this.items[0]!.tMs < r.tMs - KEEP_MS) this.items.shift();
  }

  latest(): MotionReading | null {
    return this.items[this.items.length - 1] ?? null;
  }

  at(tMs: number, maxGapMs = 500): MotionReading | null {
    return nearestReading(this.items, tMs, maxGapMs);
  }
}

interface MotionEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

let permission: MotionPermission = 'not-asked';

/** The permission state for session.json. */
export function motionPermission(): MotionPermission {
  return permission;
}

/**
 * Asks for motion where the browser asks (iOS: DeviceMotionEvent.requestPermission(), which must
 * be called inside the Play tap, after the camera request). Elsewhere nothing is asked: the state
 * becomes 'granted' once a reading arrives and 'unavailable' if none does. Refusing changes
 * nothing visible.
 */
export async function requestMotionPermission(): Promise<MotionPermission> {
  if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') {
    permission = 'unavailable';
    return permission;
  }
  const ask = (DeviceMotionEvent as unknown as MotionEventStatic).requestPermission;
  if (typeof ask !== 'function') return permission;
  try {
    const answer = await ask.call(DeviceMotionEvent);
    permission = answer === 'granted' ? 'granted' : 'denied';
  } catch {
    // Called outside a gesture, or the browser refused to ask.
    permission = 'denied';
  }
  return permission;
}

export interface MotionSource {
  /** Where the readings come from: device motion, the orientation fallback, or nothing yet. */
  readonly source: 'motion' | 'orientation' | null;
  latest(): MotionReading | null;
  /** The reading nearest a capture time (performance.now() domain), within 500 ms. */
  at(tMs: number): MotionReading | null;
  onReading(cb: (r: MotionReading) => void): () => void;
  stop(): void;
}

function screenAngle(): number {
  const a = typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : (window as { orientation?: number }).orientation;
  return typeof a === 'number' && Number.isFinite(a) ? a : 0;
}

let running: (MotionSource & { started: number }) | null = null;

/** Starts listening (once; later calls return the same source). Safe where nothing is supported. */
export function startMotion(): MotionSource {
  if (running) return running;
  const log = new ReadingLog();
  const processor = new MotionProcessor();
  const listeners = new Set<(r: MotionReading) => void>();
  let source: 'motion' | 'orientation' | null = null;
  let fallback: ReturnType<typeof setTimeout> | null = null;

  const emit = (r: MotionReading | null, from: 'motion' | 'orientation') => {
    if (!r) return;
    source = from;
    if (permission === 'not-asked' || permission === 'unavailable') permission = 'granted';
    log.push(r);
    for (const cb of listeners) cb(r);
  };
  const onMotion = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x === null || g.y === null || g.z === null) return;
    if (fallback !== null) {
      clearTimeout(fallback);
      fallback = null;
    }
    if (source === 'orientation') window.removeEventListener('deviceorientation', onOrientation);
    emit(processor.fromMotion(e.timeStamp, [g.x, g.y, g.z], e.rotationRate, screenAngle()), 'motion');
  };
  const onOrientation = (e: DeviceOrientationEvent) => {
    if (source === 'motion') return;
    emit(processor.fromOrientation(e.timeStamp, e.beta, e.gamma, screenAngle()), 'orientation');
  };

  const supported = typeof window !== 'undefined' && typeof DeviceMotionEvent !== 'undefined';
  if (supported) {
    window.addEventListener('devicemotion', onMotion);
    fallback = setTimeout(() => {
      fallback = null;
      if (source !== null) return;
      if (typeof DeviceOrientationEvent !== 'undefined') window.addEventListener('deviceorientation', onOrientation);
      // Still nothing a second later: no sensor to read.
      setTimeout(() => {
        if (source === null && permission === 'not-asked') permission = 'unavailable';
      }, FALLBACK_AFTER_MS);
    }, FALLBACK_AFTER_MS);
  } else if (permission === 'not-asked') {
    permission = 'unavailable';
  }

  running = {
    started: performance.now(),
    get source() {
      return source;
    },
    latest: () => log.latest(),
    at: (tMs) => log.at(tMs),
    onReading(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    stop() {
      if (fallback !== null) clearTimeout(fallback);
      if (supported) {
        window.removeEventListener('devicemotion', onMotion);
        window.removeEventListener('deviceorientation', onOrientation);
      }
      listeners.clear();
      running = null;
    },
  };
  return running;
}

/** The running source, if any. */
export function activeMotion(): MotionSource | null {
  return running;
}
