// The BlazeGaze engine (spec §3.1 rank 1, §4.6.2): WebEyeTrack's eye-strip
// network at 75fbd2f, run as its frozen encoder and its gaze head on TF.js.
// Each frame gives x = [emb 512, hv 3, fo 3] and the head's own estimate as
// `prior`; the personal mapping is fitted later from these (mappers.ts).
// Upstream's Kalman filter, output clipping, click listener and closed-eye
// skip are deliberately absent, and so is head adaptation (phase 2, §13).
//
// TF.js (about 1.2 MB) is imported only in `create`, so the main thread can
// read the engine's spec without downloading it.
import { PROBE } from '../../core/constants.ts';
import type { BackendId, EngineFrame } from '../../core/types.ts';
import { assetInfo, assetUrl, fetchAsset } from '../../platform/assets.ts';
import type { EngineRuntimeEnv } from '../../platform/capabilities.ts';
import type { EngineContext, EngineInput, EngineModule, EngineSpec, GazeEngine } from '../types.ts';
import type { LogFn, TfjsBackend, TfjsWasmUrls } from '../runtimes/tfjs.ts';
import {
  BG_FEATURE_VERSION,
  BG_X,
  BG_X_DIM,
  coversPlan,
  newSession,
  prepareInputs,
  sampleEyeStrip,
  STRIP_H,
  STRIP_W,
  stripTensorData,
  type FramePixels,
} from './preprocess.ts';
import type { BlazeGazeModel, BlazeGazeOutput } from './runtime.ts';

const spec: EngineSpec = {
  id: 'blazegaze',
  displayName: 'BlazeGaze (WebEyeTrack)',
  rank: 1,
  family: 'appearance-fewshot',
  version: '75fbd2f',
  featureVersion: BG_FEATURE_VERSION,
  featureDim: BG_X_DIM,
  licence: { code: 'MIT', weights: 'MIT' },
  citation: 'Davalos, E., Zhang, Y., Goodwin, A. and Biswas, G. (2025). WebEyeTrack: scalable eye-tracking for the browser via on-device few-shot personalization. arXiv:2508.19544.',
  sourceUrl: 'https://github.com/RedForestAI/WebEyeTrack',
  assets: ['blazegaze-model', 'tfjs-wasm', 'tfjs-wasm-simd'],
  requires: [],
  frameBudgetMs: PROBE.budgetMs.blazegaze,
  mappers: ['prior-affine', 'prior-ridge-pose', 'emb-ridge'],
  inCombinedByDefault: true,
  downloadBytes: 669_060 + 424_594,
};

type Infer = (model: BlazeGazeModel, strip: Float32Array, hv: ArrayLike<number>, fo: ArrayLike<number>) => Promise<BlazeGazeOutput>;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const log: LogFn = (level, text) => {
  if (level === 'warn') console.warn(`[blazegaze] ${text}`);
  else console.info(`[blazegaze] ${text}`);
};

function inNode(): boolean {
  const g = globalThis as { process?: { versions?: { node?: unknown } }; document?: unknown };
  return typeof g.process?.versions?.node === 'string' && g.document === undefined;
}

function absolute(url: string): string {
  return new URL(url, globalThis.location?.href).href;
}

/**
 * The model's two files for tf.loadLayersModel, fetched once through the
 * asset manifest (size and sha256 checked), with byte progress, and kept
 * until the engine has started so a backend fallback does not download them
 * again. Any other URL is refused.
 */
function modelSource(ctx: EngineContext) {
  const files = {
    [absolute(ctx.assetUrl('blazegaze-model'))]: 'blazegaze-model',
    [absolute(assetUrl('blazegaze-weights'))]: 'blazegaze-weights',
  } as const;
  const total = assetInfo('blazegaze-model').bytes + assetInfo('blazegaze-weights').bytes;
  const loaded: Record<string, number> = { 'blazegaze-model': 0, 'blazegaze-weights': 0 };
  const cache = new Map<string, Uint8Array>();
  const state = { assetError: null as unknown };

  const fetchFunc = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = absolute(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const id = files[url];
    if (!id) throw new Error(`BlazeGaze requested a file outside its model: ${url}`);
    let bytes = cache.get(id);
    if (!bytes) {
      try {
        bytes = await fetchAsset(id, {
          signal: ctx.signal,
          onProgress: (n) => {
            loaded[id] = n;
            ctx.onProgress(loaded['blazegaze-model'] + loaded['blazegaze-weights'], total);
          },
        });
      } catch (error) {
        state.assetError = error;
        throw error;
      }
      cache.set(id, bytes);
    }
    const type = id === 'blazegaze-model' ? 'application/json' : 'application/octet-stream';
    return new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'Content-Type': type } });
  }) as typeof fetch;

  return {
    url: absolute(ctx.assetUrl('blazegaze-model')),
    fetchFunc,
    state,
    release: () => cache.clear(),
  };
}

class BlazeGazeEngine implements GazeEngine {
  readonly spec = spec;
  readonly backend: BackendId;
  private readonly model: BlazeGazeModel;
  private readonly infer: Infer;
  private readonly disposeModel: (m: BlazeGazeModel) => void;
  private session = newSession();
  // Reused every frame; the vision core runs one frame at a time.
  private readonly rgba = new Uint8ClampedArray(STRIP_W * STRIP_H * 4);
  private readonly input = new Float32Array(STRIP_W * STRIP_H * 3);
  private disposed = false;

  constructor(model: BlazeGazeModel, backend: TfjsBackend, infer: Infer, disposeModel: (m: BlazeGazeModel) => void) {
    this.model = model;
    this.backend = backend;
    this.infer = infer;
    this.disposeModel = disposeModel;
  }

  // create() has already run an inference on the chosen backend: that is how the backend chain is validated.
  async warmUp(): Promise<void> {}

  /** faceWidthCm is measured afresh and the face-origin depth restarts from upstream's 60 cm. */
  resetSession(): void {
    this.session = newSession();
  }

  async extract(input: EngineInput): Promise<EngineFrame> {
    if (this.disposed) throw new Error('the BlazeGaze engine has been disposed');
    const t0 = performance.now();
    const { face, image } = input;
    const prep = prepareInputs(this.session, face.landmarks, face.matrix, face.eyes.open, image.width, image.height);
    if (!prep.strip.ok) {
      return { engine: 'blazegaze', status: 'crop-invalid', x: null, prior: null, weight: 0, computeMs: performance.now() - t0 };
    }
    const plan = prep.strip.plan;
    let src: FramePixels = { buffer: image.roi, x: image.roiX, y: image.roiY };
    if (!coversPlan(src, plan)) {
      // Rare: the strip reaches beyond the face ROI. Copy the whole frame at 1:1 (no resampling);
      // one fixed size, because the frame-image pool keeps a canvas for every crop size it is asked for.
      src = { buffer: image.crop(0, 0, image.width, image.height, image.width, image.height), x: 0, y: 0 };
    }
    sampleEyeStrip(plan, src, this.rgba);
    stripTensorData(this.rgba, this.input);
    const out = await this.infer(this.model, this.input, prep.hv, prep.fo);
    const x = new Float32Array(BG_X_DIM);
    x.set(out.emb, BG_X.emb);
    x.set(prep.hv, BG_X.hv);
    x.set(prep.fo, BG_X.fo);
    return { engine: 'blazegaze', status: 'ok', x, prior: out.prior, weight: 1, computeMs: performance.now() - t0 };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeModel(this.model);
  }
}

/** One inference on a mid-grey strip: compiles the kernels and proves the backend gives finite output. */
async function warmUpModel(model: BlazeGazeModel, infer: Infer): Promise<void> {
  const out = await infer(model, new Float32Array(STRIP_W * STRIP_H * 3).fill(0.5), [0, 0, -1], [0, 0, 60]);
  if (!out.emb.every(Number.isFinite) || !out.prior.every(Number.isFinite)) throw new Error('the warm-up inference gave non-finite output');
}

async function create(ctx: EngineContext): Promise<GazeEngine> {
  const env = ctx.env as EngineRuntimeEnv;
  const [runtime, tfjs] = await Promise.all([import('./runtime.ts'), import('../runtimes/tfjs.ts')]);
  const wasm: TfjsWasmUrls = { wasm: absolute(ctx.assetUrl('tfjs-wasm')), simd: absolute(ctx.assetUrl('tfjs-wasm-simd')) };
  const source = modelSource(ctx);
  const failures: string[] = [];
  for (const backend of tfjs.backendChain({ forceBackend: env.forceBackend, node: inNode() })) {
    if (ctx.signal.aborted) throw new Error('loading BlazeGaze was cancelled');
    let started = false;
    let model: BlazeGazeModel | null = null;
    try {
      started = await tfjs.activateBackend(backend, { wasm, log });
      if (!started) {
        failures.push(`${backend} did not start`);
        continue;
      }
      model = await runtime.loadBlazeGaze(source.url, { fetchFunc: source.fetchFunc });
      await warmUpModel(model, runtime.inferBlazeGaze);
      source.release();
      log('info', `running on ${backend}`);
      return new BlazeGazeEngine(model, backend, runtime.inferBlazeGaze, runtime.disposeBlazeGaze);
    } catch (error) {
      if (model) runtime.disposeBlazeGaze(model);
      // A missing or tampered model file is not a backend problem: no other backend can fix it.
      if (source.state.assetError) throw source.state.assetError;
      failures.push(`${backend}: ${errorText(error)}`);
      if (started) tfjs.releaseBackend(backend);
    }
  }
  throw new Error(`BlazeGaze could not run on any TF.js backend (${failures.join('; ')})`);
}

const engine: EngineModule = {
  spec,
  probe: (env) => {
    if ((env as EngineRuntimeEnv).forceBackend === 'tfjs-cpu') return { ok: true };
    if (env.webgl2 || typeof WebAssembly === 'object') return { ok: true };
    return { ok: false, reason: 'neither WebGL 2 nor WebAssembly is available for TF.js' };
  },
  create,
};

export default engine;
