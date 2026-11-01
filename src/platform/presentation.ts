// Presentation of calibration and validation blocks (spec §4.7, §14.2.3–6).
//
// Element fullscreen is used where the browser has it. Where it does not
// (iPhone Safari), or where it is refused, viewport mode is used: a fixed stage
// sized to the visual viewport at block start, without touch scrolling,
// overscroll or text selection. One handle per block measures the geometry
// once (viewport, safe-area insets, pixel ratio, presentation mode), reports
// what invalidates the block (leaving fullscreen, a resize, an orientation,
// pixel-ratio or zoom change; in viewport mode browser-bar changes of at most
// MOBILE.viewportToleranceFrac are logged and tolerated), holds the screen
// wake lock and, in fullscreen, locks the current orientation where the
// browser allows it (Android). layoutToPx maps normalised layout coordinates
// into the safe rectangle.
//
// A block run through this handle takes its resize and fullscreen decisions
// from onInvalidate rather than from frameClock's watchPauseConditions, whose
// 'resize' also fires for the browser-bar changes that viewport mode
// tolerates; 'hidden' still comes from there. In test mode (`?e2e=1`,
// window.__eek.skipFullscreen) mode 'auto' gives viewport mode, and an explicit
// mode: 'fullscreen' keeps fullscreen testable.
//
// The decisions are pure functions, unit-tested in Node; nothing touches the
// DOM at import time.
import { ASSUMED_PX_PER_MM, MOBILE } from '../core/constants.ts';
import { layoutToPx, pxToLayout, safeRect, type Insets } from '../core/geometry/screen.ts';
import type { ScreenGeometry } from '../core/types.ts';
import { exitFullscreen, fullscreenElement, fullscreenSupported, onFullscreenChange } from './fullscreen.ts';

export { layoutToPx, pxToLayout, safeRect };
export type { Insets };

export type PresentationMode = NonNullable<ScreenGeometry['presentationMode']>;
export type RequestedMode = PresentationMode | 'auto';

export interface Size {
  readonly w: number;
  readonly h: number;
}

export interface OrientationState {
  /** `screen.orientation.type` where the browser has it. */
  readonly type: OrientationType | null;
  /** `screen.orientation.angle`, else the legacy `window.orientation`, in degrees. */
  readonly angle: number | null;
  readonly portrait: boolean;
}

export type InvalidationReason = 'fullscreen-exit' | 'orientation' | 'dpr' | 'zoom' | 'resize';

export interface Invalidation {
  readonly reason: InvalidationReason;
  /** Main-thread performance.now(). */
  readonly atMs: number;
  /** The viewport size the block started with, and the size when it was invalidated (CSS px). */
  readonly from: Size;
  readonly to: Size;
  /** For the log; not shown to the participant. */
  readonly detail: string;
}

export interface ToleratedChange {
  readonly atMs: number;
  readonly from: Size;
  readonly to: Size;
}

export type ViewportVerdict = 'same' | 'tolerated' | 'abort';

/** Sizes closer than this (CSS px) are the same: browsers report fractional visual-viewport sizes. */
export const SAME_SIZE_PX = 0.5;
/** A visual-viewport scale that moves further than this from its start is a pinch zoom. */
export const ZOOM_TOLERANCE = 0.01;
/** The longest wait for the viewport to settle after entering fullscreen. */
export const SETTLE_MAX_MS = 1000;
/** The viewport counts as settled after this many animation frames without a size change. */
export const SETTLE_FRAMES = 3;

// ----- Pure decisions -----------------------------------------------------------

/**
 * Fullscreen or viewport mode. 'viewport' wherever element fullscreen is missing; 'auto' also
 * gives viewport mode in test mode, where screens never request fullscreen.
 */
export function choosePresentationMode(o: { requested: RequestedMode; fullscreenAvailable: boolean; skipFullscreen: boolean }): PresentationMode {
  if (o.requested === 'viewport' || !o.fullscreenAvailable) return 'viewport';
  if (o.requested === 'fullscreen') return 'fullscreen';
  return o.skipFullscreen ? 'viewport' : 'fullscreen';
}

function positiveFinite(v: number): boolean {
  return Number.isFinite(v) && v > 0;
}

/**
 * How a block treats a viewport that went from `start` to `now` (§14.2.4): 'same' within
 * SAME_SIZE_PX, 'tolerated' when neither dimension moved by more than `toleranceFrac` of its
 * start value, else 'abort'. Fullscreen mode passes 0, so any resize aborts (§4.7). A size that
 * is not positive aborts.
 */
export function viewportVerdict(start: Size, now: Size, toleranceFrac: number = MOBILE.viewportToleranceFrac): ViewportVerdict {
  if (!(Number.isFinite(toleranceFrac) && toleranceFrac >= 0)) throw new RangeError(`viewportVerdict: the tolerance must be a finite number ≥ 0, got ${toleranceFrac}`);
  if (![start.w, start.h, now.w, now.h].every(positiveFinite)) return 'abort';
  const dw = Math.abs(now.w - start.w);
  const dh = Math.abs(now.h - start.h);
  if (dw < SAME_SIZE_PX && dh < SAME_SIZE_PX) return 'same';
  return dw <= toleranceFrac * start.w && dh <= toleranceFrac * start.h ? 'tolerated' : 'abort';
}

/** CSS's definition: portrait when the height is at least the width. */
export function orientationFromSize(s: Size): 'portrait' | 'landscape' {
  return s.h >= s.w ? 'portrait' : 'landscape';
}

function normalisedAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * True when the device was turned: portrait against landscape, or (where the browser reports
 * them) a different orientation type or angle. A turn through 180° keeps the viewport size but
 * moves the camera to the other side of the screen, so it counts too.
 */
export function orientationChanged(a: OrientationState, b: OrientationState): boolean {
  if (a.portrait !== b.portrait) return true;
  if (a.type !== null && b.type !== null && a.type !== b.type) return true;
  return a.angle !== null && b.angle !== null && normalisedAngle(a.angle) !== normalisedAngle(b.angle);
}

/** A computed `env(safe-area-inset-*)` length in CSS px; anything unusable reads as 0. */
export function parseInsetPx(value: string): number {
  const px = Number.parseFloat(value);
  return Number.isFinite(px) && px > 0 ? px : 0;
}

// ----- DOM measurements ---------------------------------------------------------

function sameSize(a: Size, b: Size): boolean {
  return Math.abs(a.w - b.w) < SAME_SIZE_PX && Math.abs(a.h - b.h) < SAME_SIZE_PX;
}

function windowSize(): Size {
  return { w: window.innerWidth, h: window.innerHeight };
}

/** The visual viewport (what is visible between the browser bars), else the window. */
function visualSize(): Size {
  const vv = window.visualViewport;
  return vv ? { w: vv.width, h: vv.height } : windowSize();
}

function visualScale(): number {
  const scale = window.visualViewport?.scale;
  return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function readOrientation(): OrientationState {
  const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
  const type = so && typeof so.type === 'string' ? so.type : null;
  const legacy = (window as { orientation?: unknown }).orientation;
  const angle = so && Number.isFinite(so.angle) ? so.angle : typeof legacy === 'number' && Number.isFinite(legacy) ? legacy : null;
  let portrait: boolean;
  if (type !== null) {
    portrait = type.startsWith('portrait');
  } else {
    try {
      portrait = window.matchMedia('(orientation: portrait)').matches;
    } catch {
      portrait = orientationFromSize(windowSize()) === 'portrait';
    }
  }
  return { type, angle, portrait };
}

function describeOrientation(o: OrientationState): string {
  const name = o.type ?? (o.portrait ? 'portrait' : 'landscape');
  return o.angle === null ? name : `${name} (${o.angle}°)`;
}

/** Calls `onTurn` each time the orientation differs from the previous reading (for Live, §14.2.3). */
export function watchOrientation(onTurn: (now: OrientationState, before: OrientationState) => void): () => void {
  let last = readOrientation();
  const check = (): void => {
    const now = readOrientation();
    if (!orientationChanged(last, now)) return;
    const before = last;
    last = now;
    onTurn(now, before);
  };
  const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
  so?.addEventListener('change', check);
  window.addEventListener('orientationchange', check);
  window.addEventListener('resize', check);
  return () => {
    so?.removeEventListener('change', check);
    window.removeEventListener('orientationchange', check);
    window.removeEventListener('resize', check);
  };
}

/**
 * The safe-area insets in CSS px, read from a probe element padded with
 * env(safe-area-inset-*). They are non-zero only on devices with a notch, a
 * camera cut-out or a home indicator, and only with viewport-fit=cover
 * (index.html); a browser without env() gives zeros.
 */
export function measureSafeAreaInsets(container: HTMLElement = document.body): Insets {
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  const style = probe.style;
  style.setProperty('position', 'fixed');
  style.setProperty('left', '0');
  style.setProperty('top', '0');
  style.setProperty('width', '0');
  style.setProperty('height', '0');
  style.setProperty('visibility', 'hidden');
  style.setProperty('pointer-events', 'none');
  style.setProperty('padding-top', 'env(safe-area-inset-top, 0px)');
  style.setProperty('padding-right', 'env(safe-area-inset-right, 0px)');
  style.setProperty('padding-bottom', 'env(safe-area-inset-bottom, 0px)');
  style.setProperty('padding-left', 'env(safe-area-inset-left, 0px)');
  container.append(probe);
  try {
    const cs = getComputedStyle(probe);
    return {
      top: parseInsetPx(cs.paddingTop),
      right: parseInsetPx(cs.paddingRight),
      bottom: parseInsetPx(cs.paddingBottom),
      left: parseInsetPx(cs.paddingLeft),
    };
  } finally {
    probe.remove();
  }
}

// ----- Wake lock and orientation lock ---------------------------------------------

export interface WakeLockHold {
  /** True while the browser holds a screen wake lock for this hold. */
  readonly held: boolean;
  release(): Promise<void>;
}

/**
 * Keeps the screen on (§14.2.6) during camera setup, calibration, validation and Live:
 * navigator.wakeLock.request('screen'), re-acquired whenever the page becomes visible again
 * (the browser drops the lock when it is hidden). Unsupported or refused requests are ignored.
 */
export function holdWakeLock(): WakeLockHold {
  const api = typeof navigator !== 'undefined' ? (navigator as { wakeLock?: WakeLock }).wakeLock : undefined;
  let sentinel: WakeLockSentinel | null = null;
  let wanted = true;
  let requesting = false;

  const acquire = async (): Promise<void> => {
    if (!api || !wanted || requesting || (sentinel !== null && !sentinel.released)) return;
    if (document.visibilityState !== 'visible') return;
    requesting = true;
    try {
      const s = await api.request('screen');
      if (!wanted) {
        await s.release().catch(() => undefined);
        return;
      }
      sentinel = s;
      s.addEventListener('release', () => {
        if (sentinel === s) sentinel = null;
      });
    } catch {
      // Refused (battery saver, policy) or the page was hidden meanwhile: run without it.
    } finally {
      requesting = false;
    }
  };
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') void acquire();
  };
  if (api) document.addEventListener('visibilitychange', onVisibility);
  void acquire();

  return {
    get held() {
      return sentinel !== null && !sentinel.released;
    },
    async release() {
      if (!wanted) return;
      wanted = false;
      document.removeEventListener('visibilitychange', onVisibility);
      const s = sentinel;
      sentinel = null;
      if (s && !s.released) await s.release().catch(() => undefined);
    },
  };
}

/** screen.orientation.lock(current type); false where unsupported or refused (it needs fullscreen). */
async function lockCurrentOrientation(): Promise<boolean> {
  const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
  if (!so || typeof so.lock !== 'function' || typeof so.type !== 'string') return false;
  try {
    await so.lock(so.type);
    return true;
  } catch {
    return false;
  }
}

function unlockOrientation(): void {
  try {
    screen.orientation?.unlock();
  } catch {
    // Unsupported, or the lock already ended with fullscreen.
  }
}

// ----- Fullscreen on the stage ----------------------------------------------------

type PrefixedElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/** The fullscreen element shows `el`: it is `el` or one of its ancestors. */
function fullscreenCovers(el: HTMLElement): boolean {
  const fs = fullscreenElement();
  return fs !== null && (fs === el || fs.contains(el));
}

/**
 * Requests fullscreen on `el` itself (fullscreen.ts's enterFullscreen returns early when any
 * element is fullscreen). The prefixed WebKit call returns nothing, so its change event is
 * awaited for up to SETTLE_MAX_MS. It needs a user gesture: call before any other await.
 */
async function requestStageFullscreen(el: HTMLElement): Promise<boolean> {
  const target = el as PrefixedElement;
  try {
    if (typeof target.requestFullscreen === 'function') await target.requestFullscreen({ navigationUI: 'hide' });
    else if (typeof target.webkitRequestFullscreen === 'function') await target.webkitRequestFullscreen();
    else return false;
  } catch {
    return false;
  }
  if (fullscreenCovers(el)) return true;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => finish(), SETTLE_MAX_MS);
    const stop = onFullscreenChange(() => {
      if (fullscreenCovers(el)) finish();
    });
    function finish(): void {
      clearTimeout(timer);
      stop();
      resolve(fullscreenCovers(el));
    }
  });
}

/** Resolves once `read()` has kept its value for SETTLE_FRAMES animation frames, or after SETTLE_MAX_MS. */
function settle(read: () => Size): Promise<void> {
  return new Promise<void>((resolve) => {
    let last = read();
    let stable = 0;
    let raf = 0;
    const finish = (): void => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, SETTLE_MAX_MS);
    const tick = (): void => {
      const now = read();
      if (sameSize(now, last)) stable += 1;
      else {
        stable = 0;
        last = now;
      }
      if (stable >= SETTLE_FRAMES) finish();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}

// ----- The presentation handle ----------------------------------------------------

export interface PresentationOptions {
  /** 'auto' (the default) chooses fullscreen where available; see choosePresentationMode. */
  mode?: RequestedMode;
  /** The screen scale; without it 96 CSS px per inch is assumed (§14.1.2). */
  scale?: { pxPerMm: number; pxPerMmSource: ScreenGeometry['pxPerMmSource'] };
  /** Viewport-mode tolerance; MOBILE.viewportToleranceFrac by default. */
  toleranceFrac?: number;
  /** Lock the current orientation in fullscreen where supported (default true). */
  lockOrientation?: boolean;
  /** Hold the screen wake lock for the block (default true). */
  wakeLock?: boolean;
}

export interface Presentation {
  readonly mode: PresentationMode;
  readonly stage: HTMLElement;
  /** Fullscreen was asked for but refused (no user gesture, or the browser declined): viewport mode is used instead. */
  readonly fullscreenRefused: boolean;
  /** The orientation the block started in. */
  readonly orientation: OrientationState;
  readonly orientationLocked: boolean;
  readonly wakeLockHeld: boolean;
  /** The first invalidation, or null while the block is valid. */
  readonly invalidation: Invalidation | null;
  /** Viewport-mode size changes that were within the tolerance, in order. */
  readonly tolerated: readonly ToleratedChange[];
  /** The block's geometry, measured once at its start (a copy). */
  geometry(): ScreenGeometry;
  /** Called once, with the first invalidation (at once if it has already happened). */
  onInvalidate(listener: (invalidation: Invalidation) => void): () => void;
  /**
   * Re-reads the viewport, orientation, pixel ratio and fullscreen state now and returns the
   * invalidation, if any. Events normally do this; a stimulus loop may also call it once per
   * frame, so that a change for which a browser fires no event (some pixel-ratio changes) is
   * still caught.
   */
  check(): Invalidation | null;
  onTolerated(listener: (change: ToleratedChange) => void): () => void;
  /** Removes every listener, releases the locks and restores the stage; leaves fullscreen if it entered it. */
  end(opts?: { keepFullscreen?: boolean }): Promise<void>;
}

const STAGE_STYLE: Readonly<Record<string, string>> = {
  'touch-action': 'none',
  'overscroll-behavior': 'none',
  'user-select': 'none',
  '-webkit-user-select': 'none',
  '-webkit-touch-callout': 'none',
};

/** Runs every listener even if one throws; the error is still reported, asynchronously. */
function notifyAll<T>(listeners: Iterable<(value: T) => void>, value: T): void {
  for (const listener of [...listeners]) {
    try {
      listener(value);
    } catch (error) {
      queueMicrotask(() => {
        throw error;
      });
    }
  }
}

class PresentationHandle implements Presentation {
  readonly mode: PresentationMode;
  readonly stage: HTMLElement;
  readonly fullscreenRefused: boolean;
  readonly orientation: OrientationState;
  readonly orientationLocked: boolean;
  private readonly enteredFullscreen: boolean;
  private readonly savedStyle: string | null;
  private readonly wake: WakeLockHold | null;
  private readonly geo: ScreenGeometry;
  private readonly startSize: Size;
  private readonly startScale: number;
  private readonly toleranceFrac: number;
  private lastSize: Size;
  private readonly toleratedLog: ToleratedChange[] = [];
  private invalid: Invalidation | null = null;
  private readonly invalidateListeners = new Set<(invalidation: Invalidation) => void>();
  private readonly toleratedListeners = new Set<(change: ToleratedChange) => void>();
  private readonly cleanups: (() => void)[] = [];
  private ended = false;

  constructor(p: {
    mode: PresentationMode;
    stage: HTMLElement;
    fullscreenRefused: boolean;
    enteredFullscreen: boolean;
    orientationLocked: boolean;
    savedStyle: string | null;
    wake: WakeLockHold | null;
    geometry: ScreenGeometry;
    startSize: Size;
    toleranceFrac: number;
  }) {
    this.mode = p.mode;
    this.stage = p.stage;
    this.fullscreenRefused = p.fullscreenRefused;
    this.enteredFullscreen = p.enteredFullscreen;
    this.orientationLocked = p.orientationLocked;
    this.savedStyle = p.savedStyle;
    this.wake = p.wake;
    this.geo = p.geometry;
    this.startSize = p.startSize;
    this.lastSize = p.startSize;
    this.startScale = visualScale();
    this.toleranceFrac = p.mode === 'viewport' ? p.toleranceFrac : 0;
    this.orientation = readOrientation();
    this.arm();
    // Catches a change between the measurement and the listeners (fullscreen left while settling).
    this.evaluate();
  }

  get wakeLockHeld(): boolean {
    return this.wake?.held ?? false;
  }

  get invalidation(): Invalidation | null {
    return this.invalid;
  }

  get tolerated(): readonly ToleratedChange[] {
    return this.toleratedLog.slice();
  }

  geometry(): ScreenGeometry {
    return { ...this.geo, insets: { ...(this.geo.insets as Insets) } };
  }

  onInvalidate(listener: (invalidation: Invalidation) => void): () => void {
    this.invalidateListeners.add(listener);
    const already = this.invalid;
    if (already) {
      queueMicrotask(() => {
        if (this.invalidateListeners.delete(listener)) listener(already);
      });
    }
    return () => this.invalidateListeners.delete(listener);
  }

  onTolerated(listener: (change: ToleratedChange) => void): () => void {
    this.toleratedListeners.add(listener);
    return () => this.toleratedListeners.delete(listener);
  }

  check(): Invalidation | null {
    this.evaluate();
    return this.invalid;
  }

  async end(opts: { keepFullscreen?: boolean } = {}): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.invalidateListeners.clear();
    this.toleratedListeners.clear();
    if (this.orientationLocked) unlockOrientation();
    if (this.savedStyle === null) this.stage.removeAttribute('style');
    else this.stage.style.cssText = this.savedStyle;
    const leaving = this.enteredFullscreen && !opts.keepFullscreen && fullscreenCovers(this.stage);
    await Promise.all([this.wake?.release(), leaving ? exitFullscreen() : undefined]);
  }

  private currentSize(): Size {
    return this.mode === 'fullscreen' ? windowSize() : visualSize();
  }

  private arm(): void {
    const check = (): void => this.evaluate();
    const vv = window.visualViewport;
    window.addEventListener('resize', check);
    this.cleanups.push(() => window.removeEventListener('resize', check));
    if (vv) {
      vv.addEventListener('resize', check);
      this.cleanups.push(() => vv.removeEventListener('resize', check));
    }
    window.addEventListener('orientationchange', check);
    this.cleanups.push(() => window.removeEventListener('orientationchange', check));
    const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
    if (so) {
      so.addEventListener('change', check);
      this.cleanups.push(() => so.removeEventListener('change', check));
    }
    if (this.mode === 'fullscreen') this.cleanups.push(onFullscreenChange(check));

    // A resolution query matches only the current ratio, so it is re-armed after each change.
    let dprQuery: MediaQueryList | null = null;
    const onDpr = (): void => {
      armDpr();
      check();
    };
    const armDpr = (): void => {
      dprQuery?.removeEventListener('change', onDpr);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener('change', onDpr);
    };
    armDpr();
    this.cleanups.push(() => dprQuery?.removeEventListener('change', onDpr));
  }

  private evaluate(): void {
    if (this.ended || this.invalid) return;
    const size = this.currentSize();
    const from = this.startSize;
    if (this.mode === 'fullscreen' && !fullscreenCovers(this.stage)) {
      this.invalidate('fullscreen-exit', size, 'the stage left fullscreen');
      return;
    }
    const orientation = readOrientation();
    const turned = orientationChanged(this.orientation, orientation);
    if (turned || orientationFromSize(from) !== orientationFromSize(size)) {
      const detail = turned
        ? `${describeOrientation(this.orientation)} → ${describeOrientation(orientation)}`
        : `viewport ${orientationFromSize(from)} → ${orientationFromSize(size)}`;
      this.invalidate('orientation', size, detail);
      return;
    }
    if (Math.abs(window.devicePixelRatio - this.geo.dpr) > 1e-6) {
      this.invalidate('dpr', size, `devicePixelRatio ${this.geo.dpr} → ${window.devicePixelRatio}`);
      return;
    }
    const scale = visualScale();
    if (Math.abs(scale - this.startScale) > ZOOM_TOLERANCE) {
      this.invalidate('zoom', size, `visual-viewport scale ${this.startScale} → ${scale}`);
      return;
    }
    const verdict = viewportVerdict(from, size, this.toleranceFrac);
    if (verdict === 'abort') {
      this.invalidate('resize', size, `${from.w} × ${from.h} → ${size.w} × ${size.h} CSS px`);
      return;
    }
    if (sameSize(size, this.lastSize)) return;
    const change: ToleratedChange = { atMs: performance.now(), from: this.lastSize, to: size };
    this.lastSize = size;
    this.toleratedLog.push(change);
    notifyAll(this.toleratedListeners, change);
  }

  private invalidate(reason: InvalidationReason, to: Size, detail: string): void {
    const invalidation: Invalidation = { reason, atMs: performance.now(), from: this.startSize, to, detail };
    this.invalid = invalidation;
    const listeners = [...this.invalidateListeners];
    this.invalidateListeners.clear();
    notifyAll(listeners, invalidation);
  }
}

/**
 * Starts one block's presentation on `stage` (the element the stimulus is drawn in). Call it
 * from the user gesture that starts the block, since fullscreen needs one. Throws a RangeError,
 * after undoing everything, when the measured safe rectangle has no area.
 */
export async function startPresentation(stage: HTMLElement, opts: PresentationOptions = {}): Promise<Presentation> {
  const pxPerMm = opts.scale?.pxPerMm ?? ASSUMED_PX_PER_MM;
  const pxPerMmSource = opts.scale?.pxPerMmSource ?? 'assumed';
  if (!positiveFinite(pxPerMm)) throw new RangeError(`startPresentation: pxPerMm must be a positive finite number, got ${pxPerMm}`);
  const toleranceFrac = opts.toleranceFrac ?? MOBILE.viewportToleranceFrac;
  if (!(Number.isFinite(toleranceFrac) && toleranceFrac >= 0)) throw new RangeError(`startPresentation: the tolerance must be a finite number ≥ 0, got ${toleranceFrac}`);

  const requested = opts.mode ?? 'auto';
  let mode = choosePresentationMode({
    requested,
    fullscreenAvailable: fullscreenSupported(),
    skipFullscreen: window.__eek?.skipFullscreen === true,
  });
  const savedStyle = stage.getAttribute('style');
  for (const [property, value] of Object.entries(STAGE_STYLE)) stage.style.setProperty(property, value);

  let enteredFullscreen = false;
  let fullscreenRefused = false;
  if (mode === 'fullscreen' && !fullscreenCovers(stage)) {
    enteredFullscreen = await requestStageFullscreen(stage);
    if (!enteredFullscreen) {
      mode = 'viewport';
      fullscreenRefused = true;
    }
  }

  const wake = opts.wakeLock === false ? null : holdWakeLock();
  let orientationLocked = false;
  let startSize: Size;
  if (mode === 'fullscreen') {
    if (opts.lockOrientation !== false) orientationLocked = await lockCurrentOrientation();
    await settle(windowSize);
    startSize = windowSize();
  } else {
    const vv = window.visualViewport;
    startSize = visualSize();
    const style = stage.style;
    style.setProperty('position', 'fixed');
    style.setProperty('left', `${vv ? vv.offsetLeft : 0}px`);
    style.setProperty('top', `${vv ? vv.offsetTop : 0}px`);
    style.setProperty('right', 'auto');
    style.setProperty('bottom', 'auto');
    style.setProperty('width', `${startSize.w}px`);
    style.setProperty('height', `${startSize.h}px`);
    style.setProperty('max-width', 'none');
    style.setProperty('max-height', 'none');
    style.setProperty('margin', '0');
    style.setProperty('box-sizing', 'border-box');
    style.setProperty('z-index', '2147483646');
  }

  const undo = async (): Promise<void> => {
    if (orientationLocked) unlockOrientation();
    if (savedStyle === null) stage.removeAttribute('style');
    else stage.style.cssText = savedStyle;
    await Promise.all([wake?.release(), enteredFullscreen ? exitFullscreen() : undefined]);
  };

  let geometry: ScreenGeometry;
  try {
    geometry = {
      viewportWpx: startSize.w,
      viewportHpx: startSize.h,
      screenWpx: screen.width,
      screenHpx: screen.height,
      dpr: window.devicePixelRatio,
      fullscreen: mode === 'fullscreen',
      pxPerMm,
      pxPerMmSource,
      insets: measureSafeAreaInsets(stage),
      presentationMode: mode,
    };
    safeRect(geometry);
  } catch (error) {
    await undo();
    throw error;
  }

  return new PresentationHandle({
    mode,
    stage,
    fullscreenRefused,
    enteredFullscreen,
    orientationLocked,
    savedStyle,
    wake,
    geometry,
    startSize,
    toleranceFrac,
  });
}
