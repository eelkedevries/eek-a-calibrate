// The MediaPipe face front end (spec §4.2, §4.3). It contains every
// @mediapipe/tasks-vision specific; the rest of the app sees DetectedFace.
//
// Loading. In a module worker the 0.10.35 loader tries importScripts, catches
// the TypeError and calls import(url); only vision_wasm_module_internal.js
// sets globalThis.ModuleFactory [C]. A module executes once per realm, and the
// loader clears ModuleFactory after each successful start, so a second
// landmarker (CPU retry, rebuild) would find it unset: `primeModuleFactory`
// imports the loader itself and restores the factory before every attempt.
// On the main thread the loader appends a classic <script> each time, which
// re-runs and sets the factory again.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { LANDMARKER } from '../core/constants.ts';
import { BLENDSHAPE_COUNT, BLENDSHAPE_INDEX, LANDMARK_COUNT, LANDMARK_STRIDE, type BlendshapeName } from '../core/face/landmarkSets.ts';
import { implausibleReason } from '../core/face/plausibility.ts';

export const MEDIAPIPE_VERSION = '0.10.35' as const;
export type WasmVariant = 'module' | 'simd' | 'nosimd';
export type Delegate = 'GPU' | 'CPU';

/** Manifest ids of each WebAssembly pair. The module pair has no no-SIMD variant [C]. */
export const WASM_ASSETS = {
  module: { js: 'mp-module-js', wasm: 'mp-module-wasm' },
  simd: { js: 'mp-simd-js', wasm: 'mp-simd-wasm' },
  nosimd: { js: 'mp-nosimd-js', wasm: 'mp-nosimd-wasm' },
} as const satisfies Record<WasmVariant, { js: string; wasm: string }>;

/** The worker always runs the module pair; the inline host picks SIMD or no-SIMD. */
export async function chooseVariant(kind: 'worker' | 'inline'): Promise<WasmVariant> {
  if (kind === 'worker') return 'module';
  return (await FilesetResolver.isSimdSupported()) ? 'simd' : 'nosimd';
}

export interface DetectedFace {
  /** LANDMARK_COUNT × 3, interleaved x, y, z (see landmarkSets.ts). */
  landmarks: Float32Array;
  /** BLENDSHAPE_COUNT scores in BLENDSHAPE_NAMES order; NaN where MediaPipe reported none. */
  blendshapes: Float32Array;
  /** The 4×4 facial transformation matrix as MediaPipe packs it (column-major), or null if absent. */
  matrix: Float32Array | null;
  /** Category names MediaPipe reported that BLENDSHAPE_NAMES does not know. */
  unknownBlendshapes: string[];
}

export type LogFn = (level: 'info' | 'warn' | 'error', message: string) => void;

export interface FrontEndOptions {
  variant: WasmVariant;
  loaderUrl: string;
  /** Binary URLs in the order to try: the .wasm.gz first in production, then the plain .wasm. */
  binaryUrls: readonly string[];
  model: Uint8Array;
  delegate: Delegate;
  inWorker: boolean;
  log: LogFn;
}

const factories = new Map<string, unknown>();

async function primeModuleFactory(loaderUrl: string): Promise<void> {
  let factory = factories.get(loaderUrl);
  if (factory === undefined) {
    const mod = (await import(/* @vite-ignore */ loaderUrl)) as { default?: unknown };
    factory = mod.default ?? (globalThis as { ModuleFactory?: unknown }).ModuleFactory;
    if (typeof factory !== 'function') throw new Error(`${loaderUrl} did not provide a ModuleFactory.`);
    factories.set(loaderUrl, factory);
  }
  (globalThis as { ModuleFactory?: unknown }).ModuleFactory = factory;
}

// Emscripten writes glog and TFLite messages to stderr, which it maps to
// console.error by default, so informational lines ("INFO: Created
// TensorFlow Lite XNNPACK delegate for CPU.") would read as errors. The
// loader adopts a pre-set global Module object, so its print hooks route the
// lines by severity instead: glog I/W/E/F prefixes and TFLite's INFO:/ERROR:,
// with anything else on stderr as a warning (a failed attempt that the
// retries below may still recover from).
export function stderrLevel(text: string): 'info' | 'warn' | 'error' {
  if (/^[EF]\d{4} /.test(text) || /^ERROR:/.test(text)) return 'error';
  if (/^I\d{4} /.test(text) || /^INFO:/.test(text)) return 'info';
  return 'warn';
}

function emscriptenOutput(log: LogFn): { print(text: string): void; printErr(text: string): void } {
  return {
    print: (text: string) => log('info', text),
    printErr: (text: string) => log(stderrLevel(text), text),
  };
}

function isBinaryFailure(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /CompileError|LinkError|magic word|wasm streaming|WebAssembly\.instantiate|failed to asynchronously prepare wasm|both async and sync fetching/i.test(text);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createLandmarker(o: FrontEndOptions, binaryUrl: string, delegate: Delegate): Promise<FaceLandmarker> {
  if (o.inWorker) await primeModuleFactory(o.loaderUrl);
  const scope = globalThis as { Module?: unknown };
  scope.Module = emscriptenOutput(o.log);
  try {
    return await FaceLandmarker.createFromOptions(
      { wasmLoaderPath: o.loaderUrl, wasmBinaryPath: binaryUrl },
      {
        baseOptions: { modelAssetBuffer: o.model, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: LANDMARKER.minFaceDetectionConfidence,
        minFacePresenceConfidence: LANDMARKER.minFacePresenceConfidence,
        minTrackingConfidence: LANDMARKER.minTrackingConfidence,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      },
    );
  } finally {
    // The loader clears it after a successful start; after a failure it may still be set.
    scope.Module = undefined;
  }
}

/** Copies MediaPipe's result for the first face into flat typed arrays; null when there is no face. */
export function toDetectedFace(result: {
  faceLandmarks?: { x: number; y: number; z: number }[][];
  faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
  facialTransformationMatrixes?: { data: number[] }[];
}): DetectedFace | null {
  const points = result.faceLandmarks?.[0];
  if (!points || points.length === 0) return null;
  if (points.length < LANDMARK_COUNT) {
    throw new Error(`the face landmarker returned ${points.length} landmarks, not ${LANDMARK_COUNT} (iris points missing)`);
  }
  const landmarks = new Float32Array(LANDMARK_COUNT * LANDMARK_STRIDE);
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const p = points[i];
    landmarks[i * 3] = p.x;
    landmarks[i * 3 + 1] = p.y;
    landmarks[i * 3 + 2] = p.z;
  }
  const blendshapes = new Float32Array(BLENDSHAPE_COUNT).fill(Number.NaN);
  const unknownBlendshapes: string[] = [];
  for (const category of result.faceBlendshapes?.[0]?.categories ?? []) {
    const index = BLENDSHAPE_INDEX[category.categoryName as BlendshapeName];
    if (index === undefined) unknownBlendshapes.push(category.categoryName);
    else blendshapes[index] = category.score;
  }
  const data = result.facialTransformationMatrixes?.[0]?.data;
  const matrix = data && data.length === 16 ? Float32Array.from(data) : null;
  return { landmarks, blendshapes, matrix, unknownBlendshapes };
}

/** Corrupt GPU frames that move the landmarker to the CPU: this many in a row, or this many in all. */
export const IMPLAUSIBLE_SWITCH = { run: 3, total: 5 } as const;

export interface DetectOutcome {
  face: DetectedFace | null;
  /** Set when this frame's detection failed; the landmarker has been rebuilt (or is being retried). */
  error?: string;
}

/**
 * One FaceLandmarker in VIDEO mode with strictly increasing timestamps, a GPU →
 * CPU retry on creation or on the first detection, the .gz → plain .wasm retry
 * and a rebuild after any later graph error (MediaPipe graphs do not recover
 * from in-graph errors [GL]).
 */
export class FaceFrontEnd {
  private landmarker: FaceLandmarker;
  private readonly opts: FrontEndOptions;
  private binaryUrl: string;
  private delegateInUse: Delegate;
  private lastTimestamp = -Infinity;
  private detections = 0;
  private closed = false;
  private failedRebuilds = 0;
  private implausibleRun = 0;
  private implausibleTotal = 0;

  private constructor(opts: FrontEndOptions, landmarker: FaceLandmarker, binaryUrl: string, delegate: Delegate) {
    this.opts = opts;
    this.landmarker = landmarker;
    this.binaryUrl = binaryUrl;
    this.delegateInUse = delegate;
  }

  get delegate(): Delegate {
    return this.delegateInUse;
  }

  static async create(opts: FrontEndOptions): Promise<FaceFrontEnd> {
    if (opts.binaryUrls.length === 0) throw new Error('No WebAssembly binary to load.');
    const delegates: Delegate[] = opts.delegate === 'GPU' ? ['GPU', 'CPU'] : ['CPU'];
    const failures: string[] = [];
    for (const binaryUrl of opts.binaryUrls) {
      for (const delegate of delegates) {
        try {
          const landmarker = await createLandmarker(opts, binaryUrl, delegate);
          if (failures.length > 0) opts.log('warn', `Face landmarker started with ${delegate} and ${binaryUrl} after: ${failures.join('; ')}`);
          return new FaceFrontEnd(opts, landmarker, binaryUrl, delegate);
        } catch (error) {
          failures.push(`${delegate} with ${binaryUrl}: ${describe(error)}`);
          opts.log('warn', `Face landmarker could not start (${delegate}, ${binaryUrl}): ${describe(error)}`);
          // A broken binary fails on every delegate: go straight to the next binary.
          if (isBinaryFailure(error)) break;
        }
      }
    }
    throw new Error(`The face landmarker could not start: ${failures.join('; ')}`);
  }

  private nextTimestamp(tMs: number): number {
    // MediaPipe stores timestamps in integer microseconds; 1 ms spacing keeps them strictly increasing.
    const ts = Number.isFinite(tMs) && tMs >= this.lastTimestamp + 1 ? tMs : this.lastTimestamp + 1;
    this.lastTimestamp = Number.isFinite(ts) ? ts : 0;
    return this.lastTimestamp;
  }

  private convert(result: Parameters<typeof toDetectedFace>[0]): DetectOutcome {
    try {
      return { face: toDetectedFace(result) };
    } catch (error) {
      return { face: null, error: describe(error) };
    }
  }

  /**
   * Discards an implausible result (spec v0.4 §16.1). Some mobile GPUs run the GPU delegate
   * without an error yet return corrupt landmarks; after IMPLAUSIBLE_SWITCH.run consecutive or
   * IMPLAUSIBLE_SWITCH.total corrupt GPU frames the landmarker moves to the CPU delegate.
   */
  private async screen(outcome: DetectOutcome): Promise<DetectOutcome> {
    const face = outcome.face;
    if (!face) return outcome;
    const reason = implausibleReason(face.landmarks, face.matrix);
    if (reason === null) {
      this.implausibleRun = 0;
      return outcome;
    }
    this.implausibleRun += 1;
    this.implausibleTotal += 1;
    if (this.delegateInUse === 'GPU' && (this.implausibleRun >= IMPLAUSIBLE_SWITCH.run || this.implausibleTotal >= IMPLAUSIBLE_SWITCH.total)) {
      this.opts.log('warn', `The GPU delegate returned implausible landmarks (${reason}); switching the face landmarker to the CPU.`);
      try {
        await this.replace('CPU');
        this.implausibleRun = 0;
        this.implausibleTotal = 0;
      } catch (error) {
        this.opts.log('error', `The switch to the CPU delegate failed: ${describe(error)}`);
      }
    }
    return { face: null, error: `implausible landmarks discarded (${reason})` };
  }

  /**
   * Runs one detection. A throw from detectForVideo is a graph error: on the
   * very first GPU detection the graph is recreated on the CPU and the frame
   * retried; otherwise the graph is rebuilt and this frame has no face.
   */
  async detect(bitmap: ImageBitmap, tMs: number): Promise<DetectOutcome> {
    if (this.closed) return { face: null, error: 'the face landmarker is closed' };
    const first = this.detections === 0;
    this.detections += 1;
    let result: ReturnType<FaceLandmarker['detectForVideo']>;
    try {
      result = this.landmarker.detectForVideo(bitmap, this.nextTimestamp(tMs));
    } catch (error) {
      const message = describe(error);
      if (first && this.delegateInUse === 'GPU') {
        this.opts.log('warn', `The first GPU detection failed (${message}); retrying on the CPU.`);
        await this.replace('CPU');
        try {
          result = this.landmarker.detectForVideo(bitmap, this.nextTimestamp(tMs));
        } catch (cpuError) {
          await this.rebuild();
          return { face: null, error: `face detection failed on GPU (${message}) and CPU (${describe(cpuError)})` };
        }
        return this.screen(this.convert(result));
      }
      await this.rebuild();
      return { face: null, error: `face detection failed (${message}); the landmarker was rebuilt` };
    }
    return this.screen(this.convert(result));
  }

  private async replace(delegate: Delegate): Promise<void> {
    const next = await createLandmarker(this.opts, this.binaryUrl, delegate);
    try {
      this.landmarker.close();
    } catch {
      // The broken graph may refuse to close cleanly; it is dropped either way.
    }
    this.landmarker = next;
    this.delegateInUse = delegate;
  }

  /** Recreates the graph with the delegate and binary that worked. Throws after three consecutive failures. */
  async rebuild(): Promise<void> {
    if (this.closed) return;
    try {
      await this.replace(this.delegateInUse);
      this.failedRebuilds = 0;
    } catch (error) {
      this.failedRebuilds += 1;
      this.opts.log('error', `The face landmarker could not be rebuilt (attempt ${this.failedRebuilds}): ${describe(error)}`);
      if (this.failedRebuilds >= 3) throw error;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.landmarker.close();
    } catch {
      // Closing a broken graph can throw; the instance is discarded anyway.
    }
  }
}
