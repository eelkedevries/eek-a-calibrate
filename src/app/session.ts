// The running capture (camera, vision host and frame clock) and the session results that live
// between screens: calibration hands the capture and the pending fit to validation, validation
// leaves its recording for the results (re-scoring, §14.1.3) and for export. Nothing here is
// stored; leaving the screens that use the camera stops it.
import { ENGINE_IDS } from '../core/types.ts';
import type { EngineId, FitResult, FrameMeta, FrameResult, Recording } from '../core/types.ts';
import { openCamera, type CameraSession } from '../platform/camera.ts';
import { FrameClock } from '../platform/frameClock.ts';
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
 * or Live restarts nothing and the stored distance of this camera can be offered.
 */
const CAMERA_ROUTES = new Set(['/camera', '/screen', '/distance', '/calibrate', '/validate', '/results', '/live']);

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
    if (!CAMERA_ROUTES.has(routePath())) stopCapture();
  });
  window.addEventListener('pagehide', () => stopCapture());
}

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
 * engine set is changed in place when it differs.
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
        const camera = await openCamera(preferredDeviceId ? { deviceId: preferredDeviceId } : {});
        let host: ManagedVisionHost | null = null;
        try {
          onStatus('vision');
          const { settings } = getState();
          host = await createVisionHost(defaultVisionConfig({ e2e: settings.e2e, force: settings.force, delegate: settings.delegate ?? null }), settings.host ?? undefined);
          host.onProgress((asset, loaded, total) => assetListener?.(asset, loaded, total));
          const c = new RunningCapture(camera, host);
          camera.onEnded(() => {
            if (capture === c) stopCapture();
          });
          c.clock.start();
          return c;
        } catch (error) {
          host?.dispose();
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
