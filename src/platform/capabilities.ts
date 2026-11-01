// Capability detection for the welcome check (spec §7) and the engines'
// RuntimeEnv (spec §6). Everything here works in a worker as well as on the
// main thread, and nothing touches the DOM until a function is called.
import { MOBILE } from '../core/constants.ts';
import type { BackendId } from '../core/types.ts';
import type { RuntimeEnv } from '../engines/types.ts';

/**
 * The RuntimeEnv the vision core hands to engines, plus `forceBackend` from
 * VisionConfig (`?force=cpu`), which the frozen RuntimeEnv has no field for. A
 * worker cannot read the page's query string, so an engine reads it here:
 * `(ctx.env as EngineRuntimeEnv).forceBackend`.
 */
export type EngineRuntimeEnv = RuntimeEnv & { readonly forceBackend?: BackendId };

/** The smallest module that uses a SIMD instruction (as wasm-feature-detect and MediaPipe use). */
const WASM_SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

export function wasmSimdSupported(): boolean {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(WASM_SIMD_PROBE);
  } catch {
    return false;
  }
}

export function offscreenCanvasSupported(): boolean {
  return typeof OffscreenCanvas === 'function';
}

let webgl2Cache: boolean | null = null;

/** Creates (and immediately releases) one WebGL2 context; the answer is cached. */
export function webgl2Supported(): boolean {
  if (webgl2Cache !== null) return webgl2Cache;
  let gl: WebGL2RenderingContext | null = null;
  try {
    if (offscreenCanvasSupported()) gl = new OffscreenCanvas(1, 1).getContext('webgl2');
    else if (typeof document !== 'undefined') gl = document.createElement('canvas').getContext('webgl2');
  } catch {
    gl = null;
  }
  webgl2Cache = gl !== null;
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return webgl2Cache;
}

function inWorkerScope(): boolean {
  return typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope === 'function' && typeof document === 'undefined';
}

/** The environment an engine's probe and create see. */
export function runtimeEnv(cfg: { baseUrl: string; dev: boolean; e2e: boolean; forceBackend?: BackendId }): EngineRuntimeEnv {
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : 1;
  return {
    ...(cfg.forceBackend ? { forceBackend: cfg.forceBackend } : {}),
    baseUrl: cfg.baseUrl,
    dev: cfg.dev,
    inWorker: inWorkerScope(),
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    cores,
    webgl2: webgl2Supported(),
    wasmSimd: wasmSimdSupported(),
    offscreenCanvas: offscreenCanvasSupported(),
    e2e: cfg.e2e,
  };
}

/**
 * iOS and iPadOS browsers start the face landmarker on the CPU delegate:
 * tasks-vision's GPU path has a history of breaking there (gaze-lite pattern).
 * iPadOS reports itself as a Mac with touch points.
 */
export function prefersCpuDelegate(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function defaultDelegate(): 'GPU' | 'CPU' {
  if (typeof navigator === 'undefined') return 'GPU';
  return prefersCpuDelegate(navigator.userAgent, navigator.maxTouchPoints ?? 0) ? 'CPU' : 'GPU';
}

export interface DeviceClassInput {
  /** `matchMedia('(pointer: coarse)').matches`: the primary pointer is a finger. */
  coarsePointer: boolean;
  /** `screen.width` and `screen.height`, CSS px. */
  screenWpx: number;
  screenHpx: number;
}

export interface DeviceClass extends DeviceClassInput {
  mobile: boolean;
}

/**
 * The device class of §14.2.1 (heuristic): a phone or small tablet has a coarse primary pointer
 * and a short screen side of at most MOBILE.maxShortSidePx CSS px. An unknown or non-positive
 * screen size counts as desktop, whose behaviour is the unchanged default.
 */
export function isMobileDevice(d: DeviceClassInput, maxShortSidePx: number = MOBILE.maxShortSidePx): boolean {
  const shortSide = Math.min(d.screenWpx, d.screenHpx);
  return d.coarsePointer && Number.isFinite(shortSide) && shortSide > 0 && shortSide <= maxShortSidePx;
}

/** The device class of this browser, for the camera ladder, the copy and session.json. */
export function detectDeviceClass(): DeviceClass {
  let coarsePointer = false;
  try {
    coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    coarsePointer = false;
  }
  const scr = typeof screen === 'object' && screen !== null ? screen : null;
  const input: DeviceClassInput = { coarsePointer, screenWpx: scr ? scr.width : Number.NaN, screenHpx: scr ? scr.height : Number.NaN };
  return { ...input, mobile: isMobileDevice(input) };
}

export interface CapabilityReport {
  secureContext: boolean;
  getUserMedia: boolean;
  videoFrameCallback: boolean;
  wasmSimd: boolean;
  webgl2: boolean;
  offscreenCanvas: boolean;
  moduleWorker: boolean;
  fullscreen: boolean;
}

/** Module-worker support: the constructor reads `type` only if it understands module workers. */
export function moduleWorkerSupported(): boolean {
  if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL.createObjectURL !== 'function') return false;
  let supported = false;
  const url = URL.createObjectURL(new Blob([''], { type: 'text/javascript' }));
  try {
    const options = {
      get type(): 'module' {
        supported = true;
        return 'module';
      },
    } as WorkerOptions;
    new Worker(url, options).terminate();
  } catch {
    supported = false;
  } finally {
    URL.revokeObjectURL(url);
  }
  return supported;
}

/** The main-thread capability check shown on the welcome screen. */
export function detectCapabilities(): CapabilityReport {
  const root = typeof document !== 'undefined' ? (document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown }) : null;
  return {
    secureContext: globalThis.isSecureContext === true,
    getUserMedia: typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function',
    videoFrameCallback: typeof HTMLVideoElement === 'function' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
    wasmSimd: wasmSimdSupported(),
    webgl2: webgl2Supported(),
    offscreenCanvas: offscreenCanvasSupported(),
    moduleWorker: moduleWorkerSupported(),
    fullscreen: root !== null && (typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function'),
  };
}

export type ScratchCanvas = OffscreenCanvas | HTMLCanvasElement;

/** A canvas for pixel work: an OffscreenCanvas where available, else (main thread only) a detached <canvas>. */
export function createScratchCanvas(width: number, height: number): ScratchCanvas {
  if (offscreenCanvasSupported()) return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new Error('No OffscreenCanvas in this worker, and no document to make a canvas.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** A 2D context for frequent pixel reads; throws when the browser cannot give one. */
export function context2d(canvas: ScratchCanvas): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('The browser did not provide a 2D canvas context.');
  return ctx;
}
