// WP7 parity (spec §10.3 item 2): Peekr on onnxruntime-web in Node, one
// thread, gives finite, deterministic output. The engine module runs as it
// does in the vision worker: the runtime binary is fetched, checked against
// the manifest and handed to ONNX Runtime (here after a failing .gz copy, so
// the single retry with the plain file runs), the model is fetched and
// checked, and frames of the landmark fixture go through extract. ONNX
// Runtime starts once per process, so this file keeps to one runtime.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { eyeMeasures } from '../../src/core/face/eyeMeasures.ts';
import { headPoseFromMatrix } from '../../src/core/face/headPose.ts';
import type { PixelBuffer } from '../../src/core/face/quality.ts';
import type { FaceObservation, FrameMeta, Vec2 } from '../../src/core/types.ts';
import peekr from '../../src/engines/peekr/index.ts';
import { bgrTensor, PK_CROP, PK_INPUT_SIZE, peekrGeometry } from '../../src/engines/peekr/preprocess.ts';
import { PEEKR_SESSION_OPTIONS, PeekrSession } from '../../src/engines/peekr/runtime.ts';
import { loadOrtBinary, ort, ortThreads } from '../../src/engines/runtimes/ort.ts';
import type { EngineContext, FrameImage, RuntimeEnv } from '../../src/engines/types.ts';
import { configureAssets, parseManifest, resolveAssetUrl, type AssetConfig } from '../../src/platform/assets.ts';
import { loadLandmarkFixture } from '../fixtures/landmarks/fixture.ts';

const root = new URL('../../', import.meta.url);
const file = (path: string) => readFileSync(new URL(path, root));
const manifest = parseManifest(JSON.parse(file('assets-manifest.json').toString('utf8')));
const ORT_DIST = 'node_modules/onnxruntime-web/dist/';
const BASE = 'http://127.0.0.1/eek-a-calibrate/';
const WASM_URL = `${BASE}assets/ort-wasm-simd-threaded-test.wasm`;
// Node imports the Emscripten glue from a file URL; the browser gets it from the build.
const MJS_URL = pathToFileURL(fileURLToPath(new URL(`${ORT_DIST}ort-wasm-simd-threaded.mjs`, root))).href;
const assetCfg: AssetConfig = { baseUrl: BASE, gz: true, hashed: { 'ort-wasm': WASM_URL, 'ort-mjs': MJS_URL } };

const ortWasm = file(`${ORT_DIST}ort-wasm-simd-threaded.wasm`);
const model = file('public/models/peekr-1.0.7/peekr.onnx');

/**
 * Serves the build's files the way a misconfigured host would serve the .gz
 * copy: compressed bytes without Content-Encoding, so the size and hash check
 * fails and the plain file is fetched once.
 */
const requests: string[] = [];
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input);
  requests.push(url);
  const body = (bytes: Uint8Array) => new Response(new Uint8Array(bytes), { status: 200 });
  if (url === `${WASM_URL}.gz`) return body(gzipSync(ortWasm));
  if (url === WASM_URL) return body(ortWasm);
  if (url === `${BASE}models/peekr-1.0.7/peekr.onnx`) return body(model);
  return new Response('not found', { status: 404 });
}) as typeof fetch;
configureAssets(manifest, assetCfg);

const env: RuntimeEnv = {
  baseUrl: BASE, dev: false, inWorker: true, crossOriginIsolated: false, cores: 8, webgl2: false, wasmSimd: true, offscreenCanvas: false, e2e: true,
};

/**
 * A Node stand-in for FrameImage.crop: drawImage-like bilinear resampling of
 * the source rectangle at pixel centres, transparent black outside the frame.
 * It approximates, not reproduces, the browser's resampling, which only the
 * end-to-end tests exercise.
 */
function cropOf(frame: PixelBuffer, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): ImageData {
  const data = new Uint8ClampedArray(dw * dh * 4);
  const at = (x: number, y: number, c: number) => (x < 0 || y < 0 || x >= frame.width || y >= frame.height ? 0 : frame.data[(y * frame.width + x) * 4 + c]);
  for (let v = 0; v < dh; v++) {
    const fy = sy + ((v + 0.5) * sh) / dh - 0.5;
    const y0 = Math.floor(fy);
    const wy = fy - y0;
    for (let u = 0; u < dw; u++) {
      const fx = sx + ((u + 0.5) * sw) / dw - 0.5;
      const x0 = Math.floor(fx);
      const wx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const top = at(x0, y0, c) * (1 - wx) + at(x0 + 1, y0, c) * wx;
        const bottom = at(x0, y0 + 1, c) * (1 - wx) + at(x0 + 1, y0 + 1, c) * wx;
        data[(v * dw + u) * 4 + c] = Math.round(top * (1 - wy) + bottom * wy);
      }
    }
  }
  return { data, width: dw, height: dh, colorSpace: 'srgb' } as ImageData;
}

function fixtureInput(landmarks?: Float32Array) {
  const fx = loadLandmarkFixture();
  const lm = landmarks ?? fx.landmarks;
  const pose = headPoseFromMatrix(fx.matrix);
  assert.ok(pose);
  const face: FaceObservation = {
    landmarks: lm,
    blendshapes: fx.blendshapes,
    matrix: fx.matrix,
    pose,
    eyes: eyeMeasures(lm, fx.blendshapes, fx.videoW, fx.videoH),
    quality: { ...fx.computed.quality, centring: [fx.computed.quality.centring[0], fx.computed.quality.centring[1]] },
    landmarkerMs: 0,
    delegate: 'CPU',
  };
  const crops: number[][] = [];
  const image = {
    width: fx.videoW,
    height: fx.videoH,
    roiX: 0,
    roiY: 0,
    crop: (sx: number, sy: number, sw: number, sh: number, dw: number, dh: number) => {
      crops.push([sx, sy, sw, sh, dw, dh]);
      return cropOf(fx.pixels, sx, sy, sw, sh, dw, dh);
    },
  } as unknown as FrameImage;
  const meta: FrameMeta = { ...fx.meta, clock: 'captureTime' };
  return { fx, face, meta, image, crops };
}

/** The exact bit patterns of a point, so that equality means identical output. */
const bits = (v: Vec2 | null) => (v ? Array.from(new Uint32Array(new Float64Array(v).buffer)) : null);

test('one thread unless cross-origin isolated, then up to four', () => {
  assert.equal(ortThreads({ crossOriginIsolated: false, cores: 16 }), 1);
  assert.equal(ortThreads({ crossOriginIsolated: true, cores: 16 }), 4);
  assert.equal(ortThreads({ crossOriginIsolated: true, cores: 2 }), 2);
  assert.equal(ortThreads({ crossOriginIsolated: true, cores: Number.NaN }), 1);
  assert.deepEqual(PEEKR_SESSION_OPTIONS, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
});

test('the runtime binary gets one retry with the plain file, and only from a .gz URL', async () => {
  const seen: string[] = [];
  const failing = (url: string) => {
    seen.push(url);
    return Promise.reject(new Error(`no ${url}`));
  };
  await assert.rejects(loadOrtBinary('/a.wasm', failing), /no \/a\.wasm/);
  assert.deepEqual(seen, ['/a.wasm']);
  seen.length = 0;
  await assert.rejects(loadOrtBinary('/a.wasm.gz', failing), /compressed copy failed \(no \/a\.wasm\.gz\), and so did the plain file \(no \/a\.wasm\)/);
  assert.deepEqual(seen, ['/a.wasm.gz', '/a.wasm']);
  seen.length = 0;
  const aborted = AbortSignal.abort();
  await assert.rejects(loadOrtBinary('/a.wasm.gz', failing, { signal: aborted }));
  assert.deepEqual(seen, ['/a.wasm.gz']);
  const ok = await loadOrtBinary('/a.wasm.gz', (url) => (url.endsWith('.gz') ? failing(url) : Promise.resolve(new Uint8Array([1]))));
  assert.deepEqual({ url: ok.url, retried: ok.retried, n: ok.bytes.length }, { url: '/a.wasm', retried: true, n: 1 });
});

test('Peekr on onnxruntime-web in Node, one thread: finite, deterministic output; x = kps, prior = output', async () => {
  assert.equal(peekr.probe(env).ok, true);
  assert.equal(peekr.probe({ ...env, wasmSimd: false }).ok, false);

  const progress: [number, number][] = [];
  const warnings: string[] = [];
  const { warn, info } = console;
  console.warn = (...args: unknown[]) => void warnings.push(args.join(' '));
  console.info = () => undefined;
  const ctx: EngineContext = {
    env,
    assetUrl: (id) => resolveAssetUrl(manifest, id, assetCfg),
    onProgress: (loaded, total) => void progress.push([loaded, total]),
    signal: new AbortController().signal,
  };
  let engine;
  try {
    engine = await peekr.create(ctx);
  } finally {
    Object.assign(console, { warn, info });
  }
  assert.equal(engine.backend, 'ort-wasm');

  // The .gz copy failed its size check, the plain file was used, once; the runtime runs on one thread.
  assert.deepEqual(requests.slice(0, 3), [`${WASM_URL}.gz`, WASM_URL, `${BASE}models/peekr-1.0.7/peekr.onnx`]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /retrying once with .*\.wasm\./);
  assert.equal(ort.env.wasm.numThreads, 1);
  assert.deepEqual(ort.env.wasm.wasmPaths, { wasm: WASM_URL, mjs: MJS_URL });
  const ortEntry = manifest.entries.get('ort-wasm')!;
  assert.equal(createHash('sha256').update(ortWasm).digest('hex'), ortEntry.sha256);
  const total = ortEntry.bytes + manifest.entries.get('peekr-model')!.bytes;
  assert.deepEqual(progress.at(-1), [total, total]);
  assert.ok(progress.every(([loaded, t]) => t === total && loaded >= 0 && loaded <= total));

  await engine.warmUp();
  const input = fixtureInput();
  const geometry = peekrGeometry(input.face.landmarks, input.fx.videoW, input.fx.videoH);
  assert.equal(geometry.status, 'ok');
  if (geometry.status !== 'ok') return;

  const frames = [];
  for (let i = 0; i < 3; i++) frames.push(await engine.extract({ meta: input.meta, face: input.face, image: input.image }));
  for (const f of frames) {
    assert.equal(f.status, 'ok');
    assert.equal(f.engine, 'peekr');
    assert.equal(f.weight, 1);
    assert.deepEqual(Array.from(f.x ?? []), Array.from(geometry.kps));
    assert.ok(f.prior && f.prior.length === 2 && f.prior.every(Number.isFinite), `prior ${f.prior}`);
    assert.ok(Number.isFinite(f.computeMs) && f.computeMs >= 0);
  }
  assert.deepEqual(bits(frames[1].prior), bits(frames[0].prior));
  assert.deepEqual(bits(frames[2].prior), bits(frames[0].prior));
  // The crops came through FrameImage.crop, unmirrored, at 128 × 128.
  assert.deepEqual(input.crops.slice(0, 2), geometry.crops.map((c) => [c.sx, c.sy, c.sw, c.sh, PK_CROP, PK_CROP]));

  // A second, independent session on the same inputs gives the same bits.
  const tensors = geometry.crops.map((c) => bgrTensor(input.image.crop(c.sx, c.sy, c.sw, c.sh, PK_CROP, PK_CROP)));
  const second = await PeekrSession.create(new Uint8Array(model));
  try {
    const prior = await second.run(tensors[0], tensors[1], geometry.kps);
    assert.deepEqual(bits(prior), bits(frames[0].prior));
    // Different eyes give a different point: the output depends on the input.
    const swapped = await second.run(tensors[1], tensors[0], geometry.kps);
    assert.notDeepEqual(bits(swapped), bits(prior));
    await assert.rejects(second.run(new Float32Array(PK_INPUT_SIZE - 1), tensors[1], geometry.kps), RangeError);
  } finally {
    await second.release();
  }
  await assert.rejects(second.run(tensors[0], tensors[1], geometry.kps), /released/);

  // A face too small for Peekr's boxes is crop-invalid, with no features and no inference.
  const tiny = Float32Array.from(input.face.landmarks);
  for (let i = 0; i < tiny.length; i += 3) {
    tiny[i] = 0.5 + (tiny[i] - 0.5) * 0.05;
    tiny[i + 1] = 0.5 + (tiny[i + 1] - 0.5) * 0.05;
  }
  const small = fixtureInput(tiny);
  const invalid = await engine.extract({ meta: small.meta, face: small.face, image: small.image });
  assert.deepEqual({ status: invalid.status, x: invalid.x, prior: invalid.prior, weight: invalid.weight }, { status: 'crop-invalid', x: null, prior: null, weight: 0 });
  assert.equal(small.crops.length, 0);

  engine.dispose();
  await assert.rejects(engine.extract({ meta: input.meta, face: input.face, image: input.image }), /disposed/);
});
