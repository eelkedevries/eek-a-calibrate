// Stub written by WP1; WP7 (007_peekr_engine.md) owns and replaces this file.
// The ONNX Runtime WebAssembly files reach the build through Vite ?url imports
// (as in eek-a-look); scripts/precompress.mjs adds the .wasm.gz copy that the
// live host serves gzip-encoded (spec §8.1).
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

export const ORT_WASM_URL: string = ortWasmUrl;
export const ORT_MJS_URL: string = ortMjsUrl;
