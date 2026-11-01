// WP4: the runtime view of assets-manifest.json (spec §8.1): parsing, URLs
// with the .gz copies, and fetches that report progress and reject a file
// whose size or sha256 differs from the manifest (the tampered-model case of
// failures.spec.ts).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AssetError, fetchVerified, isGzUrl, parseManifest, plainUrl, readBody, resolveAssetUrl, sha256Hex } from '../../src/platform/assets.ts';
import { prefersCpuDelegate, runtimeEnv, wasmSimdSupported } from '../../src/platform/capabilities.ts';

const manifestJson = JSON.parse(readFileSync(new URL('../../assets-manifest.json', import.meta.url), 'utf8'));

test('the committed manifest parses, and every engine AssetId is in it', () => {
  const m = parseManifest(manifestJson);
  const ids: string[] = ['face-landmarker', 'mp-module-js', 'mp-module-wasm', 'mp-simd-js', 'mp-simd-wasm', 'mp-nosimd-js', 'mp-nosimd-wasm', 'tfjs-wasm', 'tfjs-wasm-simd', 'blazegaze-model', 'blazegaze-weights', 'peekr-model', 'ort-wasm', 'ort-mjs'];
  for (const id of ids) assert.ok(m.entries.has(id), id);
  assert.equal(m.entries.get('face-landmarker')!.sha256, '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff');
});

test('URLs sit under BASE_URL; production asks for the .gz copy only where the manifest has one', () => {
  const m = parseManifest(manifestJson);
  const prod = { baseUrl: '/eek-a-calibrate/', gz: true, hashed: { 'ort-wasm': '/eek-a-calibrate/assets/ort-wasm-simd-threaded-abc.wasm' } };
  assert.equal(resolveAssetUrl(m, 'mp-module-wasm', prod), '/eek-a-calibrate/vendor/mediapipe-0.10.35/vision_wasm_module_internal.wasm.gz');
  assert.equal(resolveAssetUrl(m, 'mp-module-js', prod), '/eek-a-calibrate/vendor/mediapipe-0.10.35/vision_wasm_module_internal.js');
  assert.equal(resolveAssetUrl(m, 'face-landmarker', prod), '/eek-a-calibrate/models/face-landmarker-f16-v1/face_landmarker.task');
  assert.equal(resolveAssetUrl(m, 'ort-wasm', prod), '/eek-a-calibrate/assets/ort-wasm-simd-threaded-abc.wasm.gz');
  assert.throws(() => resolveAssetUrl(m, 'ort-mjs', prod), AssetError);
  assert.throws(() => resolveAssetUrl(m, 'no-such-asset', prod), AssetError);
  const dev = { baseUrl: '/eek-a-calibrate', gz: false };
  assert.equal(resolveAssetUrl(m, 'mp-simd-wasm', dev), '/eek-a-calibrate/vendor/mediapipe-0.10.35/vision_wasm_internal.wasm');
  assert.equal(plainUrl('/x/a.wasm.gz'), '/x/a.wasm');
  assert.equal(plainUrl('/x/a.wasm'), '/x/a.wasm');
  assert.equal(isGzUrl('/x/a.wasm.gz'), true);
});

test('malformed manifests are rejected', () => {
  const entry = { id: 'a', path: 'a.bin', sha256: 'f'.repeat(64), bytes: 1, gz: false };
  assert.throws(() => parseManifest({}), /assets/);
  assert.throws(() => parseManifest({ assets: [{ ...entry, sha256: 'xyz' }] }), /sha256/);
  assert.throws(() => parseManifest({ assets: [{ ...entry, path: '/abs' }] }), /path/);
  assert.throws(() => parseManifest({ assets: [{ ...entry, bytes: 0 }] }), /size/);
  assert.throws(() => parseManifest({ assets: [entry, entry] }), /duplicate/);
});

const payload = new Uint8Array(70_000).map((_, i) => (i * 31 + 7) & 255);
const testManifest = parseManifest({
  assets: [{ id: 'peekr-model', path: 'models/peekr-1.0.7/peekr.onnx', sha256: createHash('sha256').update(payload).digest('hex'), bytes: payload.length, gz: false }],
});
const cfg = { baseUrl: '/eek-a-calibrate/', gz: true };

function fakeFetch(body: Uint8Array | null, status = 200, chunk = 16_384): typeof fetch {
  return (async (url: string | URL | Request) => {
    assert.equal(String(url), '/eek-a-calibrate/models/peekr-1.0.7/peekr.onnx');
    if (!body) return new Response('missing', { status });
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= body.length) {
          controller.close();
          return;
        }
        controller.enqueue(body.slice(offset, offset + chunk));
        offset += chunk;
      },
    });
    return new Response(stream, { status });
  }) as typeof fetch;
}

test('a verified fetch returns the bytes and reports progress up to the manifest size', async () => {
  const progress: [number, number][] = [];
  const bytes = await fetchVerified(testManifest, 'peekr-model', cfg, { fetch: fakeFetch(payload), onProgress: (l, t) => progress.push([l, t]) });
  assert.deepEqual(bytes, payload);
  assert.deepEqual(progress[0], [0, payload.length]);
  assert.deepEqual(progress.at(-1), [payload.length, payload.length]);
  for (let i = 1; i < progress.length; i++) assert.ok(progress[i][0] >= progress[i - 1][0]);
});

test('a tampered, truncated, oversized or missing file is refused', async () => {
  const tampered = payload.slice();
  tampered[1234] ^= 1;
  await assert.rejects(fetchVerified(testManifest, 'peekr-model', cfg, { fetch: fakeFetch(tampered) }), (e: unknown) => e instanceof AssetError && e.kind === 'integrity' && e.asset === 'peekr-model');
  await assert.rejects(fetchVerified(testManifest, 'peekr-model', cfg, { fetch: fakeFetch(payload.slice(0, 1000)) }), (e: unknown) => e instanceof AssetError && e.kind === 'size');
  const longer = new Uint8Array(payload.length + 10);
  longer.set(payload);
  await assert.rejects(fetchVerified(testManifest, 'peekr-model', cfg, { fetch: fakeFetch(longer) }), (e: unknown) => e instanceof AssetError && e.kind === 'size');
  await assert.rejects(fetchVerified(testManifest, 'peekr-model', cfg, { fetch: fakeFetch(null, 404) }), (e: unknown) => e instanceof AssetError && e.kind === 'http');
});

test('readBody concatenates chunks and sha256Hex matches node:crypto', async () => {
  const bytes = await readBody(new Response(payload), payload.length);
  assert.deepEqual(bytes, payload);
  assert.equal(await sha256Hex(payload), createHash('sha256').update(payload).digest('hex'));
});

test('capability helpers: SIMD detection and the iOS CPU-delegate rule', () => {
  assert.equal(wasmSimdSupported(), true);
  assert.equal(prefersCpuDelegate('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5), true);
  assert.equal(prefersCpuDelegate('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5), true);
  assert.equal(prefersCpuDelegate('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0), false);
  assert.equal(prefersCpuDelegate('Mozilla/5.0 (X11; Linux x86_64) Chrome/153', 0), false);
});

test('the engines’ RuntimeEnv carries ?force=cpu through to the worker', () => {
  const cfg = { baseUrl: '/eek-a-calibrate/', dev: false, e2e: true };
  assert.equal(runtimeEnv({ ...cfg, forceBackend: 'tfjs-cpu' }).forceBackend, 'tfjs-cpu');
  assert.equal('forceBackend' in runtimeEnv(cfg), false);
});
