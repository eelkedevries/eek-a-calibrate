// TF.js 4.22.0 backends for BlazeGaze (spec §4.6.2, §8.1): WebGL (an
// OffscreenCanvas in the worker), then WebAssembly, then the CPU, which is
// allowed only with ?force=cpu or in Node (about 900 ms a frame). Loaded only
// by a dynamic import once BlazeGaze is selected.
//
// WebGL counts as unavailable when it renders only half-precision floats
// (that would change the network's arithmetic) or renders in software, such
// as SwiftShader: that is the GPU emulated on the CPU, where the network took
// about 860 ms a frame against about 55 ms with WebAssembly (measured on the
// test machine while writing this module).
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-webgl';
import type { MathBackendWebGL } from '@tensorflow/tfjs-backend-webgl';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import type { BackendId } from '../../core/types.ts';

export type TfjsBackend = Extract<BackendId, 'tfjs-webgl' | 'tfjs-wasm' | 'tfjs-cpu'>;

const TF_NAME: Readonly<Record<TfjsBackend, string>> = { 'tfjs-webgl': 'webgl', 'tfjs-wasm': 'wasm', 'tfjs-cpu': 'cpu' };

/** The order in which backends are tried. A forced TF.js backend is the only one tried. */
export function backendChain(opts: { forceBackend?: BackendId; node: boolean }): TfjsBackend[] {
  const forced = opts.forceBackend;
  if (forced === 'tfjs-cpu' || forced === 'tfjs-wasm' || forced === 'tfjs-webgl') return [forced];
  if (opts.node) return ['tfjs-cpu'];
  return ['tfjs-webgl', 'tfjs-wasm'];
}

export interface TfjsWasmUrls {
  /** tfjs-backend-wasm.wasm, possibly its .gz copy. */
  wasm: string;
  /** tfjs-backend-wasm-simd.wasm, possibly its .gz copy. */
  simd: string;
}

export type LogFn = (level: 'info' | 'warn', text: string) => void;

// setWasmPaths keeps this object, not a copy, and reads it when the backend
// initialises; and once an initialisation has failed it refuses to be called
// again. The one retry with the plain files (spec §4.2) therefore rewrites
// this object in place (tfjs-backend-wasm 4.22.0, pinned).
let wasmFileMap: Record<string, string> | null = null;

function plain(url: string): string {
  return url.endsWith('.gz') ? url.slice(0, -3) : url;
}

function fillWasmMap(map: Record<string, string>, urls: TfjsWasmUrls): void {
  map['tfjs-backend-wasm.wasm'] = urls.wasm;
  map['tfjs-backend-wasm-simd.wasm'] = urls.simd;
  // Not copied: multithreading is switched off below, so this entry is never requested.
  map['tfjs-backend-wasm-threaded-simd.wasm'] = urls.simd;
}

async function activateWasm(urls: TfjsWasmUrls, log: LogFn): Promise<boolean> {
  // COOP/COEP are off (spec §8.3), so threads are unavailable; never ask for the threaded binary.
  tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
  if (!wasmFileMap) {
    wasmFileMap = {};
    fillWasmMap(wasmFileMap, urls);
    setWasmPaths(wasmFileMap);
  }
  if (await tf.setBackend('wasm')) return true;
  const retry = { wasm: plain(urls.wasm), simd: plain(urls.simd) };
  if (retry.wasm === wasmFileMap['tfjs-backend-wasm.wasm'] && retry.simd === wasmFileMap['tfjs-backend-wasm-simd.wasm']) return false;
  log('warn', 'TF.js WebAssembly failed to start from the compressed files; retrying once with the plain .wasm files');
  fillWasmMap(wasmFileMap, retry);
  return tf.setBackend('wasm');
}

/** Renderer strings of software WebGL implementations. */
const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i;

/** The active WebGL backend's renderer string, unmasked where the browser allows; null if unknown. */
function webglRenderer(): string | null {
  try {
    const gl = (tf.backend() as unknown as MathBackendWebGL).gpgpu.gl;
    let renderer: unknown = gl.getParameter(gl.RENDERER);
    // Safari masks RENDERER; the debug extension gives the real one there.
    if (typeof renderer !== 'string' || renderer === 'WebKit WebGL') {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    }
    return typeof renderer === 'string' ? renderer : null;
  } catch {
    return null;
  }
}

/** Makes `backend` the active TF.js backend; false when it cannot start here or is not worth using (see above). */
export async function activateBackend(backend: TfjsBackend, opts: { wasm?: TfjsWasmUrls; log: LogFn }): Promise<boolean> {
  const name = TF_NAME[backend];
  if (tf.findBackendFactory(name) === null) {
    opts.log('info', `TF.js ${backend} was set aside earlier in this session`);
    return false;
  }
  let ok: boolean;
  if (backend === 'tfjs-wasm') {
    if (!opts.wasm) throw new Error('the TF.js WebAssembly files were not given');
    ok = await activateWasm(opts.wasm, opts.log);
  } else {
    ok = await tf.setBackend(name);
  }
  if (!ok) return false;
  await tf.ready();
  if (backend === 'tfjs-webgl') {
    const renderer = webglRenderer();
    let reason: string | null = null;
    if (!tf.env().getBool('WEBGL_RENDER_FLOAT32_ENABLED')) reason = 'it renders only half-precision floats';
    else if (renderer && SOFTWARE_GL.test(renderer)) reason = `it renders in software (${renderer})`;
    if (reason) {
      opts.log('info', `TF.js does not use WebGL here: ${reason}`);
      releaseBackend(backend);
      return false;
    }
  }
  return tf.getBackend() === name;
}

/** Disposes a backend that was started but is not used (its WebGL context, its WebAssembly memory). */
export function releaseBackend(backend: TfjsBackend): void {
  const name = TF_NAME[backend];
  if (tf.findBackendFactory(name) !== null) tf.removeBackend(name);
}
