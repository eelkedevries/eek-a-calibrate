// The Peekr engine (spec §3.1 rank 2, §4.6.3): Peekr 1.0.7's eye-crop CNN with
// the bundle's preprocessing reproduced exactly, on single-threaded ONNX
// Runtime Web. EngineFrame.x is kps (8 values) and the prior is the model's
// output, roughly a [0, 1] screen point. The 1,040-d embedding is phase 2.
import type { BackendId, EngineFrame } from '../../core/types.ts';
import { AssetError, assetInfo, fetchAsset, readBody, verifyAsset } from '../../platform/assets.ts';
import { initOrt, ORT_VERSION, ortThreads } from '../runtimes/ort.ts';
import type { EngineContext, EngineInput, EngineModule, GazeEngine } from '../types.ts';
import { bgrTensor, PK_CROP, PK_INPUT_SIZE, PK_X_DIM, peekrGeometry } from './preprocess.ts';
import { PeekrSession } from './runtime.ts';
import { spec } from './spec.ts';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Fetches the ONNX Runtime binary from one URL and checks it against the manifest's 'ort-wasm' entry. */
async function fetchOrtBinary(url: string, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<Uint8Array> {
  const entry = assetInfo('ort-wasm');
  let response: Response;
  try {
    response = await fetch(url, { signal, credentials: 'same-origin' });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new AssetError('http', entry.id, `${entry.id}: the request for ${url} failed (${errorText(error)}).`, { cause: error });
  }
  if (!response.ok) throw new AssetError('http', entry.id, `${entry.id}: ${url} answered ${response.status} ${response.statusText}.`.trim());
  let bytes: Uint8Array;
  try {
    bytes = await readBody(response, entry.bytes, (loaded) => onProgress(loaded), entry.bytes);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new AssetError('size', entry.id, `${entry.id}: ${errorText(error)}.`, { cause: error });
  }
  await verifyAsset(entry, bytes);
  return bytes;
}

function log(level: 'info' | 'warn', text: string): void {
  if (level === 'warn') console.warn(`[peekr] ${text}`);
  else console.info(`[peekr] ${text}`);
}

class PeekrEngine implements GazeEngine {
  readonly spec = spec;
  readonly backend: BackendId = 'ort-wasm';
  private readonly session: PeekrSession;
  // Reused across frames; the session reads them during run and keeps nothing.
  private readonly input1 = new Float32Array(PK_INPUT_SIZE);
  private readonly input2 = new Float32Array(PK_INPUT_SIZE);

  constructor(session: PeekrSession) {
    this.session = session;
  }

  /** One inference on blank crops, so the first frame does not pay for allocation; the output must be finite. */
  async warmUp(): Promise<void> {
    const blank = new Float32Array(PK_INPUT_SIZE);
    const prior = await this.session.run(blank, blank, new Float32Array(PK_X_DIM));
    if (!prior.every(Number.isFinite)) throw new Error(`Peekr's warm-up inference returned a non-finite output (${prior.join(', ')})`);
  }

  // Peekr keeps no per-session state.
  resetSession(): void {}

  async extract(input: EngineInput): Promise<EngineFrame> {
    if (this.session.released) throw new Error('the Peekr engine has been disposed');
    const t0 = performance.now();
    const { image } = input;
    const geometry = peekrGeometry(input.face.landmarks, image.width, image.height);
    if (geometry.status !== 'ok') {
      return { engine: 'peekr', status: 'crop-invalid', x: null, prior: null, weight: 0, computeMs: performance.now() - t0 };
    }
    for (const [k, out] of [this.input1, this.input2].entries()) {
      const { sx, sy, sw, sh } = geometry.crops[k];
      bgrTensor(image.crop(sx, sy, sw, sh, PK_CROP, PK_CROP), out);
    }
    const prior = await this.session.run(this.input1, this.input2, geometry.kps);
    return { engine: 'peekr', status: 'ok', x: geometry.kps, prior, weight: 1, computeMs: performance.now() - t0 };
  }

  dispose(): void {
    this.session.release().catch((error: unknown) => log('warn', `releasing the session failed: ${errorText(error)}`));
  }
}

async function create(ctx: EngineContext): Promise<GazeEngine> {
  const { signal } = ctx;
  signal.throwIfAborted();
  const ortBytes = assetInfo('ort-wasm').bytes;
  const total = ortBytes + assetInfo('peekr-model').bytes;
  await initOrt({
    wasmUrl: ctx.assetUrl('ort-wasm'),
    mjsUrl: ctx.assetUrl('ort-mjs'),
    threads: ortThreads(ctx.env),
    fetchBinary: (url) => fetchOrtBinary(url, signal, (loaded) => ctx.onProgress(loaded, total)),
    signal,
    log,
  });
  const model = await fetchAsset('peekr-model', { signal, onProgress: (loaded) => ctx.onProgress(ortBytes + loaded, total) });
  signal.throwIfAborted();
  let session: PeekrSession;
  try {
    session = await PeekrSession.create(model);
  } catch (error) {
    throw new Error(`ONNX Runtime ${ORT_VERSION} could not start the Peekr model: ${errorText(error)}`, { cause: error });
  }
  if (signal.aborted) {
    await session.release().catch(() => undefined);
    signal.throwIfAborted();
  }
  return new PeekrEngine(session);
}

const engine: EngineModule = {
  spec,
  probe: (env) => (env.wasmSimd ? { ok: true } : { ok: false, reason: 'Peekr needs WebAssembly SIMD, which this browser does not support.' }),
  create,
};

export default engine;
