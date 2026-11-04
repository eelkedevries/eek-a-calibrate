// The running capture (camera, vision host and frame clock) and the session results that live
// between screens: calibration hands the capture and the pending fit to validation, validation
// leaves its recording for the results (re-scoring, §14.1.3) and for export. Nothing here is
// stored; leaving the screens that use the camera stops it.
//
// The game's start (spec §17.4): the vision host starts when the Title loads, without the camera,
// so that the face model's download is reported from its first byte (§17.11 host hooks); Play
// opens the camera inside its tap (permission priming), asks for device motion on iOS second,
// starts Web Audio and takes the wake lock until the player leaves the game. Get ready then adopts
// the opened camera and the started host as one capture.
import { ENGINE_IDS } from '../core/types.ts';
import type { EngineId, FitResult, FrameMeta, FrameResult, Recording } from '../core/types.ts';
import type { Home } from '../core/position/home.ts';
import { defaultSetup, type GuardClass, type Setup } from '../core/position/thresholds.ts';
import { setTiltLookup } from '../core/protocol/labelling.ts';
import { ENGINE_SPECS } from '../engines/specs.ts';
import { openCamera, type CameraSession } from '../platform/camera.ts';
import { detectDeviceClass } from '../platform/capabilities.ts';
import { unlockAudio } from '../platform/feedback.ts';
import { FrameClock } from '../platform/frameClock.ts';
import { motionPermission, requestMotionPermission, startMotion, type MotionPermission, type MotionSource } from '../platform/motion.ts';
import { holdWakeLock, type WakeLockHold } from '../platform/presentation.ts';
import { crashWorkerHosts, createVisionHost, defaultVisionConfig, type HostError, type ManagedVisionHost } from '../vision/host.ts';
import type { EngineStatus } from '../vision/protocol.ts';
import { getState } from './state.ts';
import { registerTestHook } from './testHooks.ts';

// failures.spec.ts crashes the worker of a running capture, not only the lab's (test mode only).
registerTestHook('crashWorker', () => crashWorkerHosts());

export interface Capture {
  readonly camera: CameraSession;
  readonly host: ManagedVisionHost;
  readonly clock: FrameClock;
  /** The engines the host runs, and how each loaded. */
  readonly engines: readonly EngineId[];
  readonly status: readonly EngineStatus[];
  /** performance.now() of the latest result with a face, or −∞. */
  readonly lastFaceMs: number;
  /** performance.now() of the latest result. */
  readonly lastResultMs: number;
  onResult(cb: (r: FrameResult) => void): () => void;
  /** Every delivered frame, after the host took or refused it. */
  onFrame(cb: (meta: FrameMeta, submitted: boolean) => void): () => void;
  onError(cb: (e: HostError) => void): () => void;
  /** The camera's reported frame rate, else 30 (§4.12 expected frames). */
  nominalFps(): number;
}

/**
 * Routes that keep the camera running; any other route stops it. The distance screen measures the
 * iris, and the screen-size step before it keeps a running camera, so that measuring from Results
 * or Live restarts nothing and the stored distance of this camera can be offered. The game's
 * routes from Get ready to the challenge share one capture (spec §17.2.4).
 */
const CAMERA_ROUTES = new Set([
  '/camera',
  '/screen',
  '/distance',
  '/calibrate',
  '/validate',
  '/results',
  '/live',
  '/ready',
  '/warmup',
  '/complete',
  '/look',
  '/challenge',
]);

/** The Title and its Details deep link keep the started host (and Play's camera) too. */
function isTitlePath(path: string): boolean {
  return path === '/' || path === '/details' || path.startsWith('/details/');
}

class RunningCapture implements Capture {
  readonly camera: CameraSession;
  readonly host: ManagedVisionHost;
  readonly clock: FrameClock;
  engines: readonly EngineId[] = [];
  status: readonly EngineStatus[] = [];
  lastFaceMs = Number.NEGATIVE_INFINITY;
  lastResultMs = Number.NEGATIVE_INFINITY;
  private readonly frameListeners = new Set<(meta: FrameMeta, submitted: boolean) => void>();
  private readonly offs: (() => void)[] = [];

  constructor(camera: CameraSession, host: ManagedVisionHost) {
    this.camera = camera;
    this.host = host;
    this.clock = new FrameClock(camera.source, host, {
      onFrame: (meta, submitted) => {
        for (const cb of this.frameListeners) cb(meta, submitted);
      },
      onError: (error) => console.warn('Frame clock:', error),
    });
    this.offs.push(
      host.onResult((r) => {
        this.lastResultMs = performance.now();
        if (r.face) this.lastFaceMs = this.lastResultMs;
      }),
    );
  }

  onResult(cb: (r: FrameResult) => void): () => void {
    return this.host.onResult(cb);
  }

  onFrame(cb: (meta: FrameMeta, submitted: boolean) => void): () => void {
    this.frameListeners.add(cb);
    return () => this.frameListeners.delete(cb);
  }

  onError(cb: (e: HostError) => void): () => void {
    return this.host.onError(cb);
  }

  nominalFps(): number {
    const fps = this.camera.settings.frameRate ?? this.camera.info.frameRate;
    return typeof fps === 'number' && fps > 0 ? fps : 30;
  }

  async setEngines(ids: readonly EngineId[]): Promise<void> {
    this.status = await this.host.setEngines([...ids]);
    this.engines = [...ids];
  }

  stop(): void {
    this.clock.stop();
    for (const off of this.offs.splice(0)) off();
    this.frameListeners.clear();
    this.host.dispose();
    this.camera.stop();
  }
}

let capture: RunningCapture | null = null;
/** The camera chosen in the camera screen's picker; the browser's default when null. */
let preferredDeviceId: string | null = null;

/** Chooses the camera for the next start; a running capture on another camera is stopped. */
export function setPreferredCamera(deviceId: string | null): void {
  if (deviceId === preferredDeviceId) return;
  preferredDeviceId = deviceId;
  stopCapture();
}
/** Where the running host's asset progress (engine downloads) goes: the latest caller's listener. */
let assetListener: CaptureListeners['onAsset'] | null = null;
let starting: Promise<RunningCapture> | null = null;
let watching = false;

function routePath(): string {
  const raw = location.hash.replace(/^#/, '') || '/';
  const q = raw.indexOf('?');
  return q >= 0 ? raw.slice(0, q) : raw;
}

function watchRoutes(): void {
  if (watching) return;
  watching = true;
  window.addEventListener('hashchange', () => {
    const path = routePath();
    if (!CAMERA_ROUTES.has(path)) stopCapture();
    if (!CAMERA_ROUTES.has(path) && !isTitlePath(path)) leaveGame();
  });
  window.addEventListener('pagehide', () => {
    stopCapture();
    leaveGame();
  });
}

// ----- The vision host, started before the camera (§17.4.3) -------------------------------------

/** What has been downloaded so far, by asset (the face model, then each engine's files). */
export interface LoadState {
  assets: Readonly<Record<string, { loaded: number; total: number }>>;
  /** Progress messages received (a test hook counts them, §17.4.3). */
  events: number;
  /** performance.now() of the first progress message, or null. */
  firstEventMs: number | null;
  /** The face model is loaded and the host is ready. */
  hostReady: boolean;
  /** Why the host could not start, if it could not. */
  hostError: string | null;
}

const load: { assets: Record<string, { loaded: number; total: number }>; events: number; firstEventMs: number | null; hostReady: boolean; hostError: string | null } = {
  assets: {},
  events: 0,
  firstEventMs: null,
  hostReady: false,
  hostError: null,
};
const loadListeners = new Set<(s: LoadState) => void>();
let hostPromise: Promise<ManagedVisionHost> | null = null;
let readyHost: ManagedVisionHost | null = null;

function loadSnapshot(): LoadState {
  return { assets: { ...load.assets }, events: load.events, firstEventMs: load.firstEventMs, hostReady: load.hostReady, hostError: load.hostError };
}

function notifyLoad(): void {
  const snap = loadSnapshot();
  for (const cb of loadListeners) cb(snap);
}

function onHostProgress(asset: string, loaded: number, total: number): void {
  load.events += 1;
  load.firstEventMs ??= performance.now();
  const prev = load.assets[asset];
  load.assets[asset] = { loaded: Math.max(loaded, prev && prev.total === total ? prev.loaded : 0), total };
  assetListener?.(asset, loaded, total);
  notifyLoad();
}

registerTestHook('loading', () => loadSnapshot());

export function loadState(): LoadState {
  return loadSnapshot();
}

/** Listens to the download and host state; called at once with the current state. */
export function onLoad(cb: (s: LoadState) => void): () => void {
  loadListeners.add(cb);
  cb(loadSnapshot());
  return () => loadListeners.delete(cb);
}

/**
 * The download so far as a percentage of what the given engines and the face model need (the
 * engines' sizes from their static specs until their own progress arrives), for "Getting ready…
 * 62 %". 100 once everything is in.
 */
export function loadPercent(engines: readonly EngineId[]): number {
  let loaded = 0;
  let total = 0;
  const face = load.assets['face-landmarker'];
  if (face && face.total > 0) {
    loaded += load.hostReady ? face.total : Math.min(face.loaded, face.total);
    total += face.total;
  }
  for (const id of engines) {
    const expected = ENGINE_SPECS[id].downloadBytes;
    const seen = load.assets[id];
    const t = Math.max(expected, seen?.total ?? 0);
    if (t <= 0) continue;
    loaded += Math.min(seen?.loaded ?? 0, t);
    total += t;
  }
  return total > 0 ? Math.min(100, (100 * loaded) / total) : load.hostReady ? 100 : 0;
}

/** Starts the vision host without the camera, once; the Title calls it when it loads. */
export function prestartVision(): Promise<ManagedVisionHost> {
  watchRoutes();
  if (capture) return Promise.resolve(capture.host);
  if (!hostPromise) {
    const { settings } = getState();
    load.hostError = null;
    const p = createVisionHost(defaultVisionConfig({ e2e: settings.e2e, force: settings.force, delegate: settings.delegate ?? null }), settings.host ?? undefined, {
      onProgress: onHostProgress,
    });
    hostPromise = p;
    p.then(
      (host) => {
        if (hostPromise !== p) {
          // Superseded (the player left before it was ready): nobody will use it.
          host.dispose();
          return;
        }
        readyHost = host;
        load.hostReady = true;
        notifyLoad();
      },
      (error: unknown) => {
        if (hostPromise === p) hostPromise = null;
        load.hostError = error instanceof Error ? error.message : String(error);
        notifyLoad();
      },
    );
  }
  return hostPromise;
}

/** Disposes a started host that no capture has taken. */
function releaseIdleHost(): void {
  if (capture) return;
  const host = readyHost;
  hostPromise = null;
  readyHost = null;
  load.hostReady = false;
  host?.dispose();
}

// ----- Play (§17.4.2) ---------------------------------------------------------------------------

let pendingCamera: Promise<CameraSession> | null = null;
let openedCamera: CameraSession | null = null;
let played = false;
let wake: WakeLockHold | null = null;
let motion: MotionSource | null = null;

/** Whether Play was tapped in this page load (Get ready needs it, or a camera already allowed). */
export function playedThisLoad(): boolean {
  return played;
}

/**
 * Play's tap (spec §17.4.2): asks for the camera first, then (iOS) for device motion, in the same
 * gesture; resumes Web Audio; takes the wake lock until the player leaves the game. Resolves
 * with the camera, or rejects with a CameraError (Title shows "Camera blocked").
 */
export function startPlay(): Promise<CameraSession> {
  watchRoutes();
  played = true;
  if (!pendingCamera && !capture) {
    // openCamera calls getUserMedia before its first await, so the request stays inside the tap.
    const p = openCamera(preferredDeviceId ? { deviceId: preferredDeviceId } : {});
    pendingCamera = p;
    p.then(
      (camera) => {
        if (pendingCamera !== p) {
          camera.stop();
          return;
        }
        openedCamera = camera;
      },
      () => {
        if (pendingCamera === p) pendingCamera = null;
      },
    );
  }
  const camera = capture ? Promise.resolve(capture.camera) : (pendingCamera as Promise<CameraSession>);
  void requestMotionPermission();
  unlockAudio();
  wake ??= holdWakeLock();
  startGameSensors();
  void prestartVision().catch(() => undefined);
  return camera;
}

/** Device motion on phones and tablets only (§17.5.4); every recording then stamps θ and roll. */
function startGameSensors(): void {
  if (motion || !detectDeviceClass().mobile) return;
  motion = startMotion();
  const source = motion;
  setTiltLookup((t) => {
    const r = source.at(t);
    return r ? { tiltDeg: r.tiltDeg, rollDeg: r.rollDeg } : null;
  });
}

/** The running device-motion source, if any (Get ready and the guard read it). */
export function activeMotionSource(): MotionSource | null {
  return motion;
}

/** Leaving the game's routes: the wake lock and the sensors go; Play's unused camera stops. */
function leaveGame(): void {
  void wake?.release();
  wake = null;
  motion?.stop();
  motion = null;
  setTiltLookup(null);
  const cam = openedCamera;
  openedCamera = null;
  pendingCamera = null;
  cam?.stop();
  releaseIdleHost();
}

/** Takes the wake lock when Get ready opens without Play (a reload inside the game). */
export function holdGameWakeLock(): void {
  watchRoutes();
  wake ??= holdWakeLock();
  startGameSensors();
}

// ----- What session.json records about the game (§17.4.1, §17.4.2) -----------------------------

/** "Skip warm-up" chosen on the Title: restore the stored calibration (015/016 run it). */
export type WarmupMode = 'full' | 'restore';
let warmup: WarmupMode = 'full';

export function setWarmupMode(mode: WarmupMode): void {
  warmup = mode;
}

export function warmupMode(): WarmupMode {
  return warmup;
}

/** The set-up in effect: the player's choice, else the device class's default. */
export function currentSetup(): Setup {
  return getState().settings.setup ?? defaultSetup(detectDeviceClass().mobile);
}

export interface GameRecord {
  setup: Setup;
  setupChosen: boolean;
  warmup: WarmupMode;
  motion: { permission: MotionPermission; source: 'motion' | 'orientation' | null };
}

/** The game's set-up and sensor state, for session.json. */
export function gameRecord(): GameRecord {
  return {
    setup: currentSetup(),
    setupChosen: getState().settings.setup !== null,
    warmup,
    motion: { permission: motionPermission(), source: motion?.source ?? null },
  };
}

// ----- Home, latched on Get ready (§17.5.1) ------------------------------------------------------

let home: { home: Home; cls: GuardClass } | null = null;

/** Get ready stores home when Ready latches; the warm-up, Free look and the challenge read it. */
export function setReadyHome(value: Home, cls: GuardClass): void {
  home = { home: value, cls };
}

export function readyHome(): { home: Home; cls: GuardClass } | null {
  return home;
}

// ----- The position guard's test hooks (§17.5) ---------------------------------------------------

let guardProvider: (() => unknown) | null = null;
let guardForcer: ((state: string | null) => void) | null = null;

/** The screen showing the guard publishes its state for `__eek.guard()` (test mode). */
export function setGuardProvider(provider: (() => unknown) | null, forcer: ((state: string | null) => void) | null = null): void {
  guardProvider = provider;
  guardForcer = forcer;
}

registerTestHook('guard', () => (guardProvider ? structuredClone(guardProvider()) : null));
registerTestHook('forceGuard', (state: string | null) => guardForcer?.(state));

// ----- The capture -------------------------------------------------------------------------

/**
 * The engines a calibration runs: the device probe's run set when there is one, else the engines
 * of the settings (`auto` meaning all). The geometric engine always runs too, because the shared
 * gating and pruning signals come from it (§4.6.1).
 */
export function requestedEngines(): EngineId[] {
  const { runSet, settings } = getState();
  const wanted = runSet ?? (settings.engines === 'auto' ? [...ENGINE_IDS] : [...settings.engines]);
  return ENGINE_IDS.filter((id) => wanted.includes(id) || id === 'geometric');
}

/**
 * The running capture, started if needed (camera, then the vision host, then the engines), with
 * `onStatus` told what is happening. A second call while one is starting waits for it. The
 * engine set is changed in place when it differs. Play's camera and the Title's host are adopted
 * when they exist.
 */
export interface CaptureListeners {
  onStatus?(key: 'camera' | 'vision' | 'engines'): void;
  /** Download progress of the face model and the engines' assets. */
  onAsset?(asset: string, loaded: number, total: number): void;
}

export async function ensureCapture(engines: readonly EngineId[], listeners: CaptureListeners = {}): Promise<Capture> {
  const onStatus = listeners.onStatus ?? (() => {});
  watchRoutes();
  assetListener = listeners.onAsset ?? null;
  if (!capture) {
    if (!starting) {
      starting = (async () => {
        onStatus('camera');
        const adopted = pendingCamera;
        pendingCamera = null;
        openedCamera = null;
        const camera = adopted ? await adopted : await openCamera(preferredDeviceId ? { deviceId: preferredDeviceId } : {});
        let host: ManagedVisionHost | null = null;
        try {
          onStatus('vision');
          host = await prestartVision();
          // The capture owns the host from here; a new Title load starts another.
          hostPromise = null;
          readyHost = null;
          const c = new RunningCapture(camera, host);
          camera.onEnded(() => {
            if (capture === c) stopCapture();
          });
          c.clock.start();
          return c;
        } catch (error) {
          host?.dispose();
          hostPromise = null;
          readyHost = null;
          camera.stop();
          throw error;
        }
      })();
    }
    try {
      capture = await starting;
    } finally {
      starting = null;
    }
    // The route changed while the camera was starting, so stopCapture found nothing to stop.
    if (!CAMERA_ROUTES.has(routePath())) {
      stopCapture();
      throw new Error('The screen that needed the camera was left before the camera started.');
    }
  }
  const c = capture;
  if (c.engines.join() !== engines.join()) {
    onStatus('engines');
    await c.setEngines(engines);
  }
  return c;
}

export function activeCapture(): Capture | null {
  return capture;
}

export function stopCapture(): void {
  const c = capture;
  capture = null;
  if (c) load.hostReady = false;
  c?.stop();
}

// ----- Session results ---------------------------------------------------------

export interface PendingFit {
  promise: Promise<FitResult>;
  /** The fit worker's latest stage and fraction. */
  stage: string;
  fraction: number;
  error: string | null;
  result: FitResult | null;
}

export interface ValidationRun {
  recording: Recording;
  /** FrameResult.receivedMs by frame index (§15.2.1). */
  receivedMs: Map<number, number>;
  nominalFps: number;
}

let pendingFit: PendingFit | null = null;
let validationRun: ValidationRun | null = null;

/** Records a fit in progress, so that validation and results can wait for it. */
export function setPendingFit(start: (onProgress: (stage: string, fraction: number) => void) => Promise<FitResult>): PendingFit {
  const p: PendingFit = { promise: Promise.resolve(null as unknown as FitResult), stage: 'start', fraction: 0, error: null, result: null };
  p.promise = start((stage, fraction) => {
    p.stage = stage;
    p.fraction = fraction;
  }).then(
    (result) => {
      p.result = result;
      return result;
    },
    (error: unknown) => {
      p.error = error instanceof Error ? error.message : String(error);
      throw error;
    },
  );
  // A rejection is handled by whoever awaits it; this keeps an unawaited one from being reported as unhandled.
  p.promise.catch(() => undefined);
  pendingFit = p;
  return p;
}

export function currentFit(): PendingFit | null {
  return pendingFit;
}

export function setValidationRun(run: ValidationRun | null): void {
  validationRun = run;
}

export function currentValidationRun(): ValidationRun | null {
  return validationRun;
}

/** A new calibration discards the previous fit and validation. */
export function resetSessionResults(): void {
  pendingFit = null;
  validationRun = null;
}
