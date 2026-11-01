// ONNX Runtime Web for the engines that need it (spec §3.1, §4.2, §4.6.3,
// §8.1): onnxruntime-web 1.30.0 through its /wasm entry, configured once per
// realm. Loaded only with an engine that uses it, never by the vision core or
// the fit worker.
//
// The runtime files are the manifest's 'ort-wasm' and 'ort-mjs' entries, whose
// URLs come from Vite ?url imports of onnxruntime-web/ort-wasm-simd-threaded.*
// (made by the vision core, which serves them to engines as
// EngineContext.assetUrl): the .wasm.gz copy in production, the plain file in
// development.
//
// The binary is fetched and checked here rather than by ONNX Runtime, because
// ONNX Runtime remembers a failed WebAssembly initialisation for the life of
// the realm ("previous call to 'initializeWebAssembly()' failed"): retrying the
// plain .wasm after a bad .gz (spec §4.2) is only possible before it
// initialises. The verified bytes are handed over as env.wasm.wasmBinary.
import * as ort from 'onnxruntime-web/wasm';
import { plainUrl } from '../../platform/assets.ts';

export { ort };
export type Ort = typeof ort;

export const ORT_VERSION = '1.30.0';

export interface OrtInitOptions {
  /** The runtime binary's URL; a .gz URL gets one retry with the plain file. */
  wasmUrl: string;
  /** The Emscripten glue (ort-wasm-simd-threaded.mjs). */
  mjsUrl: string;
  threads: number;
  /** Fetches the binary from one URL and returns its bytes once their size and hash match the manifest; throws otherwise. */
  fetchBinary(url: string): Promise<Uint8Array>;
  signal?: AbortSignal;
  log?(level: 'info' | 'warn', text: string): void;
}

export interface OrtRuntimeInfo {
  /** The URL the binary actually came from. */
  wasmUrl: string;
  mjsUrl: string;
  /** True when the .gz copy failed and the plain file was used. */
  retried: boolean;
  threads: number;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Spec §4.6.3: one WebAssembly thread unless the page is cross-origin isolated, then up to four. */
export function ortThreads(env: { crossOriginIsolated: boolean; cores: number }): number {
  if (!env.crossOriginIsolated) return 1;
  const cores = Number.isFinite(env.cores) ? Math.floor(env.cores) : 1;
  return Math.max(1, Math.min(4, cores));
}

/**
 * Fetches the binary from `wasmUrl`; when that is a .gz URL and fails, logs it
 * and tries the plain file exactly once. An abort is never retried.
 */
export async function loadOrtBinary(
  wasmUrl: string,
  fetchBinary: (url: string) => Promise<Uint8Array>,
  opts: { signal?: AbortSignal; log?: OrtInitOptions['log'] } = {},
): Promise<{ bytes: Uint8Array; url: string; retried: boolean }> {
  try {
    return { bytes: await fetchBinary(wasmUrl), url: wasmUrl, retried: false };
  } catch (first) {
    const plain = plainUrl(wasmUrl);
    if (plain === wasmUrl || opts.signal?.aborted) throw first;
    opts.log?.('warn', `ONNX Runtime: ${wasmUrl} failed (${errorText(first)}); retrying once with ${plain}.`);
    try {
      return { bytes: await fetchBinary(plain), url: plain, retried: true };
    } catch (second) {
      if (opts.signal?.aborted) throw second;
      throw new Error(`ONNX Runtime could not be loaded: the compressed copy failed (${errorText(first)}), and so did the plain file (${errorText(second)}).`, {
        cause: second,
      });
    }
  }
}

let current: Promise<OrtRuntimeInfo> | null = null;

/**
 * Configures ort.env.wasm once per realm: the verified binary, wasmPaths for
 * the record and the glue, and the thread count. ONNX Runtime itself starts on
 * the first InferenceSession.create. Later calls share the first call's result;
 * a failed or aborted download leaves the runtime unconfigured, so the next
 * call starts afresh.
 */
export function initOrt(opts: OrtInitOptions): Promise<OrtRuntimeInfo> {
  if (current) return current;
  if (!(Number.isInteger(opts.threads) && opts.threads >= 1)) return Promise.reject(new RangeError(`ONNX Runtime: invalid thread count ${opts.threads}`));
  const attempt = (async (): Promise<OrtRuntimeInfo> => {
    const binary = await loadOrtBinary(opts.wasmUrl, opts.fetchBinary, { signal: opts.signal, log: opts.log });
    ort.env.wasm.numThreads = opts.threads;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = { wasm: binary.url, mjs: opts.mjsUrl };
    ort.env.wasm.wasmBinary = binary.bytes;
    opts.log?.('info', `ONNX Runtime ${ORT_VERSION}: ${binary.url}, ${opts.threads} thread${opts.threads === 1 ? '' : 's'}.`);
    return { wasmUrl: binary.url, mjsUrl: opts.mjsUrl, retried: binary.retried, threads: opts.threads };
  })();
  current = attempt;
  attempt.catch(() => {
    if (current === attempt) current = null;
  });
  return attempt;
}
