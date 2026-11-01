// The vision core (spec §4.2–§4.6): the code that both hosts run, the worker
// in vision.worker.ts and the inline fallback on the main thread. It speaks
// the frozen protocol (ToVision in, FromVision out) and owns the face front
// end, the per-frame FrameImage, the face measures and the engines.
//
// Timing: every frame timestamp comes from the main thread (FrameMeta); this
// realm's performance.now() is used only for durations.
//
// Engines must copy anything they keep from an EngineInput: the face arrays
// and the features are transferred to the main thread with the result, and
// the frame's bitmap is closed once every engine has run.
import { ENGINE_IDS, ENGINE_RANK } from '../core/types.ts';
import type { EngineFrame, EngineId, FaceObservation, FrameMeta, FrameResult } from '../core/types.ts';
import { eyeMeasures } from '../core/face/eyeMeasures.ts';
import { headPoseFromMatrix } from '../core/face/headPose.ts';
import { faceQuality } from '../core/face/quality.ts';
import { ENGINE_LOADERS } from '../engines/registry.ts';
import type { EngineContext, EngineModule, GazeEngine } from '../engines/types.ts';
import { assetUrl, configureAssets, fetchVerified, loadManifest, plainUrl, resolveAssetUrl, type AssetConfig, type AssetManifest } from '../platform/assets.ts';
import { runtimeEnv, type EngineRuntimeEnv, type ScratchCanvas } from '../platform/capabilities.ts';
import { FrameImagePool, roiRect } from './frameImage.ts';
import { chooseVariant, FaceFrontEnd, MEDIAPIPE_VERSION, WASM_ASSETS, type LogFn } from './landmarker.ts';
import type { EngineStatus, FromVision, ProbeResult, ToVision, VisionConfig, VisionInfo } from './protocol.ts';
import manifestUrl from '../../assets-manifest.json?url';
// The manifest's hashed 'ort-wasm' and 'ort-mjs' entries, imported here rather
// than through WP7's runtimes/ort.ts so that this always-loaded module never
// pulls the ONNX runtime in with it (spec §8.1: runtimes load only when chosen).
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

export interface VisionCoreDeps {
  kind: 'worker' | 'inline';
  /** Sends a message to the host; `transfer` lists buffers the host may take over. */
  post(message: FromVision, transfer?: Transferable[]): void;
  createCanvas(width: number, height: number): ScratchCanvas;
}

type FrameOutput = Omit<FrameResult, 'receivedMs'>;

interface LoadedEngine {
  id: EngineId;
  engine: GazeEngine;
  status: EngineStatus;
  abort: AbortController;
}

interface FrameTiming {
  /** NaN for a stage that did not run on this frame, so the probe's quantiles skip it. */
  landmarkerMs: number;
  prepMs: number;
  totalMs: number;
  engines: Partial<Record<EngineId, { ms: number; ok: boolean }>>;
}

interface ProbeRun {
  remaining: number;
  samples: FrameTiming[];
}

/** Per-engine error reports are limited to one a second; the rest are counted into the next. */
const ERROR_REPORT_INTERVAL_MS = 1000;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function byRank(a: EngineId, b: EngineId): number {
  return ENGINE_RANK[a] - ENGINE_RANK[b];
}

/** Linear-interpolation quantile (type 7) of a non-empty sample; NaN for an empty one. */
export function quantile(values: readonly number[], q: number): number {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (xs.length === 0) return Number.NaN;
  const h = (xs.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(xs.length - 1, lo + 1);
  return xs[lo] + (h - lo) * (xs[hi] - xs[lo]);
}

/** Summarises probe samples into the frozen ProbeResult. Engine timings cover the frames that ran the engine. */
export function summariseProbe(samples: readonly FrameTiming[], engineIds: readonly EngineId[]): ProbeResult {
  const engines: ProbeResult['engines'] = {};
  for (const id of engineIds) {
    const ran = samples.map((s) => s.engines[id]).filter((e): e is { ms: number; ok: boolean } => e !== undefined);
    const ms = ran.map((e) => e.ms);
    engines[id] = { p50Ms: quantile(ms, 0.5), p90Ms: quantile(ms, 0.9), okFrames: ran.filter((e) => e.ok).length };
  }
  const landmarker = samples.map((s) => s.landmarkerMs);
  return {
    frames: samples.length,
    landmarkerP50Ms: quantile(landmarker, 0.5),
    landmarkerP90Ms: quantile(landmarker, 0.9),
    prepP50Ms: quantile(samples.map((s) => s.prepMs), 0.5),
    engines,
    totalP50Ms: quantile(samples.map((s) => s.totalMs), 0.5),
  };
}

/**
 * Checks an engine's frame: the orchestrator's id and timing replace the
 * engine's own, and an 'ok' frame with missing, wrongly sized or non-finite
 * features, or a non-finite prior, becomes an error rather than poisoning the
 * fit. `featureDim` 0 skips the size check. Features are copied, so the
 * result can be transferred even when an engine reuses its buffers.
 */
export function checkEngineFrame(id: EngineId, frame: EngineFrame, computeMs: number, featureDim = 0): { frame: EngineFrame; problem: string | null } {
  const x = frame.x ? new Float32Array(frame.x) : null;
  const prior = frame.prior ? ([frame.prior[0], frame.prior[1]] as const) : null;
  const weight = Number.isFinite(frame.weight) ? frame.weight : 0;
  let problem: string | null = null;
  if (frame.status === 'ok') {
    if (!x) problem = 'returned ok without features';
    else if (featureDim > 0 && x.length !== featureDim) problem = `returned ${x.length} features, not ${featureDim}`;
    else if (!x.every(Number.isFinite)) problem = 'returned non-finite features';
    else if (prior && !(Number.isFinite(prior[0]) && Number.isFinite(prior[1]))) problem = 'returned a non-finite prior';
  }
  if (problem) return { frame: { engine: id, status: 'error', x: null, prior: null, weight: 0, computeMs }, problem };
  return { frame: { engine: id, status: frame.status, x, prior, weight, computeMs }, problem: null };
}

export class VisionCore {
  private readonly deps: VisionCoreDeps;
  private cfg: VisionConfig | null = null;
  private env: EngineRuntimeEnv | null = null;
  private manifest: AssetManifest | null = null;
  private frontEnd: FaceFrontEnd | null = null;
  private frontEndFailed: string | null = null;
  private info: VisionInfo | null = null;
  private initPromise: Promise<VisionInfo> | null = null;
  private pool: FrameImagePool;
  private loaded = new Map<EngineId, LoadedEngine>();
  private active: LoadedEngine[] = [];
  private statuses = new Map<EngineId, EngineStatus>();
  private engineQueue: Promise<unknown> = Promise.resolve();
  private currentFrame: Promise<unknown> = Promise.resolve();
  private probeRun: ProbeRun | null = null;
  private disposed = false;
  private readonly lastErrorAt = new Map<string, number>();
  private readonly suppressed = new Map<string, number>();
  private readonly reportedOnce = new Set<string>();

  constructor(deps: VisionCoreDeps) {
    this.deps = deps;
    this.pool = new FrameImagePool(deps.createCanvas);
  }

  /** The single entry point: one call per ToVision message. Never throws. */
  handle(message: ToVision): void {
    if (this.disposed) {
      if (message.t === 'frame') message.bitmap.close();
      return;
    }
    switch (message.t) {
      case 'init':
        void this.init(message.cfg);
        break;
      case 'engines':
        this.engineQueue = this.engineQueue.then(() => this.setEngines(message.ids)).catch(() => undefined);
        break;
      case 'frame':
        this.currentFrame = this.frame(message.bitmap, message.meta);
        break;
      case 'probe':
        this.startProbe(message.frames);
        break;
      case 'reset-session':
        this.resetSession();
        break;
      case 'dispose':
        void this.dispose();
        break;
    }
  }

  private log: LogFn = (level, text) => {
    const line = `[vision ${this.deps.kind}] ${text}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.info(line);
  };

  private error(stage: 'landmarker' | 'host' | EngineId, message: string, recoverable: boolean): void {
    this.deps.post({ t: 'error', stage, message, recoverable });
  }

  /** Reports a recurring per-frame error at most once a second per stage, with a count of the ones held back. */
  private throttledError(stage: 'landmarker' | EngineId, message: string): void {
    const now = performance.now();
    const last = this.lastErrorAt.get(stage) ?? -Infinity;
    if (now - last < ERROR_REPORT_INTERVAL_MS) {
      this.suppressed.set(stage, (this.suppressed.get(stage) ?? 0) + 1);
      return;
    }
    const held = this.suppressed.get(stage) ?? 0;
    this.suppressed.set(stage, 0);
    this.lastErrorAt.set(stage, now);
    this.error(stage, held > 0 ? `${message} (and ${held} similar error${held === 1 ? '' : 's'} in the last second)` : message, true);
  }

  private errorOnce(key: string, stage: 'landmarker' | 'host' | EngineId, message: string): void {
    if (this.reportedOnce.has(key)) return;
    this.reportedOnce.add(key);
    this.error(stage, message, true);
  }

  private init(cfg: VisionConfig): Promise<VisionInfo> {
    if (this.initPromise) {
      void this.initPromise.then((info) => this.deps.post({ t: 'ready', info })).catch(() => undefined);
      return this.initPromise;
    }
    this.initPromise = this.doInit(cfg);
    this.initPromise.then(
      (info) => this.deps.post({ t: 'ready', info }),
      (error: unknown) => this.error('host', errorText(error), false),
    );
    return this.initPromise;
  }

  private async doInit(cfg: VisionConfig): Promise<VisionInfo> {
    const t0 = performance.now();
    this.cfg = cfg;
    this.manifest = await loadManifest(manifestUrl);
    const assetCfg = this.assetConfig();
    configureAssets(this.manifest, assetCfg);
    this.env = runtimeEnv(cfg);

    const variant = await chooseVariant(this.deps.kind);
    const model = await fetchVerified(this.manifest, 'face-landmarker', assetCfg, {
      onProgress: (loaded, total) => this.deps.post({ t: 'progress', asset: 'face-landmarker', loaded, total }),
    });
    const ids = WASM_ASSETS[variant];
    const binary = assetUrl(ids.wasm);
    const binaryUrls = binary === plainUrl(binary) ? [binary] : [binary, plainUrl(binary)];
    this.frontEnd = await FaceFrontEnd.create({
      variant,
      loaderUrl: assetUrl(ids.js),
      binaryUrls,
      model,
      delegate: cfg.delegate,
      inWorker: this.deps.kind === 'worker',
      log: this.log,
    });
    if (this.disposed) {
      this.frontEnd.close();
      this.frontEnd = null;
      throw new Error('The vision core was disposed while it started.');
    }
    const info: VisionInfo = {
      kind: this.deps.kind,
      delegate: this.frontEnd.delegate,
      wasmVariant: variant,
      mediapipe: MEDIAPIPE_VERSION,
      modelSha256: this.manifest.entries.get('face-landmarker')!.sha256,
      initMs: performance.now() - t0,
    };
    this.info = info;
    return info;
  }

  /** Compressed copies only in production builds: the dev server has no .gz files. */
  private assetConfig(): AssetConfig {
    const cfg = this.cfg!;
    return { baseUrl: cfg.baseUrl, gz: cfg.gz && !cfg.dev, hashed: { 'ort-wasm': ortWasmUrl, 'ort-mjs': ortMjsUrl } };
  }

  // ----- Engines -------------------------------------------------------------

  private engineContext(id: EngineId, abort: AbortController): EngineContext {
    const manifest = this.manifest!;
    const assetCfg = this.assetConfig();
    return {
      env: this.env!,
      assetUrl: (asset) => resolveAssetUrl(manifest, asset, assetCfg),
      onProgress: (loaded, total) => this.deps.post({ t: 'progress', asset: id, loaded, total }),
      signal: abort.signal,
    };
  }

  private async loadEngine(id: EngineId): Promise<LoadedEngine | EngineStatus> {
    const t0 = performance.now();
    let module: EngineModule;
    try {
      module = await ENGINE_LOADERS[id]();
    } catch (error) {
      return { id, ok: false, reason: `the engine module could not be loaded: ${errorText(error)}` };
    }
    let probe: ReturnType<EngineModule['probe']>;
    try {
      probe = module.probe(this.env!);
    } catch (error) {
      probe = { ok: false, reason: `probe failed: ${errorText(error)}` };
    }
    if (!probe.ok) return { id, ok: false, reason: probe.reason };
    const abort = new AbortController();
    let engine: GazeEngine | null = null;
    try {
      engine = await module.create(this.engineContext(id, abort));
      await engine.warmUp();
    } catch (error) {
      abort.abort();
      try {
        engine?.dispose();
      } catch {
        // A half-made engine may not dispose cleanly; it is dropped either way.
      }
      return { id, ok: false, reason: errorText(error) };
    }
    const status: EngineStatus = { id, ok: true, backend: engine.backend, loadMs: performance.now() - t0 };
    return { id, engine, status, abort };
  }

  private async setEngines(requested: readonly EngineId[]): Promise<void> {
    await this.initPromise?.catch(() => undefined);
    const ids = [...new Set(requested.filter((id) => (ENGINE_IDS as readonly string[]).includes(id)))].sort(byRank);
    if (!this.info) {
      const status = ids.map((id): EngineStatus => ({ id, ok: false, reason: 'the vision host is not ready' }));
      this.deps.post({ t: 'engines', status });
      return;
    }
    const next: LoadedEngine[] = [];
    for (const id of ids) {
      if (this.disposed) return;
      const existing = this.loaded.get(id);
      if (existing) {
        next.push(existing);
        continue;
      }
      const outcome = await this.loadEngine(id);
      if (this.disposed) {
        if ('engine' in outcome) this.disposeEngine(outcome);
        return;
      }
      if ('engine' in outcome) {
        this.loaded.set(id, outcome);
        next.push(outcome);
        this.statuses.set(id, outcome.status);
      } else {
        this.statuses.set(id, outcome);
      }
    }
    const removed = [...this.loaded.values()].filter((l) => !ids.includes(l.id));
    this.active = next;
    if (removed.length > 0) {
      // Let the frame in progress finish with the old set before disposing.
      await this.currentFrame.catch(() => undefined);
      for (const l of removed) this.disposeEngine(l);
    }
    this.deps.post({ t: 'engines', status: ids.map((id) => this.statuses.get(id)!) });
  }

  private disposeEngine(l: LoadedEngine): void {
    this.loaded.delete(l.id);
    l.abort.abort();
    try {
      l.engine.dispose();
    } catch (error) {
      this.log('warn', `${l.id}: dispose failed: ${errorText(error)}`);
    }
  }

  // ----- Frames --------------------------------------------------------------

  private async frame(bitmap: ImageBitmap, meta: FrameMeta): Promise<void> {
    const t0 = performance.now();
    const timing: FrameTiming = { landmarkerMs: Number.NaN, prepMs: Number.NaN, totalMs: 0, engines: {} };
    let face: FaceObservation | null = null;
    const engines: Partial<Record<EngineId, EngineFrame>> = {};
    const active = this.active;
    try {
      const detected = await this.detect(bitmap, meta, timing);
      if (detected) {
        const tPrep = performance.now();
        const rect = roiRect(detected.landmarks, meta.videoW, meta.videoH);
        const pose = headPoseFromMatrix(detected.matrix);
        if (!rect) {
          this.throttledError('landmarker', 'the face lies outside the frame');
        } else if (!pose) {
          this.throttledError('landmarker', 'the facial transformation matrix is missing or degenerate');
        } else {
          const { image, frameLuma } = this.pool.prepare(bitmap, rect);
          face = {
            landmarks: detected.landmarks,
            blendshapes: detected.blendshapes,
            matrix: detected.matrix!,
            pose,
            eyes: eyeMeasures(detected.landmarks, detected.blendshapes, meta.videoW, meta.videoH),
            quality: faceQuality({
              landmarks: detected.landmarks,
              videoW: meta.videoW,
              videoH: meta.videoH,
              roi: image.roi,
              roiX: image.roiX,
              roiY: image.roiY,
              frameLuma,
            }),
            landmarkerMs: timing.landmarkerMs,
            delegate: this.frontEnd!.delegate,
          };
          timing.prepMs = performance.now() - tPrep;
          for (const l of active) {
            const tEngine = performance.now();
            let out: EngineFrame;
            try {
              const raw = await l.engine.extract({ meta, face, image });
              const checked = checkEngineFrame(l.id, raw, performance.now() - tEngine, l.engine.spec.featureDim);
              out = checked.frame;
              if (checked.problem) this.throttledError(l.id, `${l.id} ${checked.problem}`);
            } catch (error) {
              out = { engine: l.id, status: 'error', x: null, prior: null, weight: 0, computeMs: performance.now() - tEngine };
              this.throttledError(l.id, `${l.id}: ${errorText(error)}`);
            }
            engines[l.id] = out;
            timing.engines[l.id] = { ms: out.computeMs, ok: out.status === 'ok' };
          }
        }
      }
      if (!face) {
        for (const l of active) engines[l.id] = { engine: l.id, status: 'no-face', x: null, prior: null, weight: 0, computeMs: 0 };
      }
    } catch (error) {
      face = null;
      for (const l of active) engines[l.id] = { engine: l.id, status: 'error', x: null, prior: null, weight: 0, computeMs: 0 };
      this.throttledError('landmarker', `frame ${meta.index}: ${errorText(error)}`);
    } finally {
      bitmap.close();
    }
    timing.totalMs = performance.now() - t0;
    this.postResult({ meta, face, engines, workerMs: timing.totalMs });
    this.recordProbe(timing);
  }

  private async detect(bitmap: ImageBitmap, meta: FrameMeta, timing: FrameTiming) {
    if (!this.frontEnd || this.frontEndFailed) return null;
    const t0 = performance.now();
    try {
      const outcome = await this.frontEnd.detect(bitmap, meta.tCaptureMs);
      timing.landmarkerMs = performance.now() - t0;
      if (outcome.error) this.throttledError('landmarker', outcome.error);
      if (this.info && this.info.delegate !== this.frontEnd.delegate) {
        // The first detection fell back from GPU to CPU: tell the host which delegate really runs.
        this.info = { ...this.info, delegate: this.frontEnd.delegate };
        this.deps.post({ t: 'ready', info: this.info });
      }
      if (outcome.face?.unknownBlendshapes.length) {
        this.errorOnce('blendshapes', 'landmarker', `unknown blendshape categories: ${outcome.face.unknownBlendshapes.join(', ')}`);
      }
      return outcome.face;
    } catch (error) {
      timing.landmarkerMs = performance.now() - t0;
      this.frontEndFailed = errorText(error);
      this.error('landmarker', `the face landmarker failed and could not be rebuilt: ${this.frontEndFailed}`, false);
      return null;
    }
  }

  private postResult(result: FrameOutput): void {
    const buffers = new Set<ArrayBuffer>();
    const add = (a: Float32Array | null | undefined) => {
      if (a && a.buffer instanceof ArrayBuffer) buffers.add(a.buffer);
    };
    if (result.face) {
      add(result.face.landmarks);
      add(result.face.blendshapes);
      add(result.face.matrix);
    }
    for (const frame of Object.values(result.engines)) add(frame?.x);
    this.deps.post({ t: 'result', result }, [...buffers]);
  }

  // ----- Probe, session, disposal --------------------------------------------

  private startProbe(frames: number): void {
    const n = Math.max(1, Math.floor(Number.isFinite(frames) ? frames : 1));
    this.probeRun = { remaining: n, samples: [] };
  }

  private recordProbe(timing: FrameTiming): void {
    const run = this.probeRun;
    if (!run) return;
    run.samples.push(timing);
    run.remaining -= 1;
    if (run.remaining > 0) return;
    this.probeRun = null;
    const ids = this.active.map((l) => l.id);
    this.deps.post({ t: 'probe', result: summariseProbe(run.samples, ids) });
  }

  private resetSession(): void {
    for (const l of this.active) {
      try {
        l.engine.resetSession();
      } catch (error) {
        this.error(l.id, `${l.id}: resetSession failed: ${errorText(error)}`, true);
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.currentFrame.catch(() => undefined);
    for (const l of [...this.loaded.values()]) this.disposeEngine(l);
    this.active = [];
    this.frontEnd?.close();
    this.frontEnd = null;
    this.pool.dispose();
  }
}
