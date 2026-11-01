// WP4 vision spec (spec §10.4): on both hosts the vision pipeline reports
// ready with the right WebAssembly variant, finds the fake camera's face
// within 15 s and returns a finite FaceObservation with the delegate
// recorded; the .wasm.gz files arrive as gzip-encoded application/wasm; the
// stub engines report "not implemented" without stopping the frame loop; and
// nothing leaves the origin, logs an error or violates the CSP.
import { expect, test, type Page } from '@playwright/test';

const ENGINE_IDS = ['blazegaze', 'peekr', 'geometric', 'eyepixel'];

interface WasmResponse {
  url: string;
  status: number;
  type: string | undefined;
  encoding: string | undefined;
}

function watch(page: Page): string[] {
  const problems: string[] = [];
  const onConsole = (where: string) => (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') problems.push(`${where} console error: ${message.text()}`);
  };
  page.on('console', onConsole('page'));
  page.on('worker', (worker) => worker.on('console', onConsole('worker')));
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  return problems;
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

function snapshot(page: Page) {
  return page.evaluate(() => {
    const lab = (window.__eek as unknown as { lab(): unknown }).lab;
    return lab() as {
      running: boolean;
      error: string | null;
      selection: { kind: string; reason: string } | null;
      info: { kind: string; delegate: string; wasmVariant: string; mediapipe: string; modelSha256: string; initMs: number } | null;
      engineStatus: { id: string; ok: boolean; reason?: string }[];
      results: number;
      faces: number;
      clock: { delivered: number; mode: string; lastClock: string | null } | null;
      lastResult: {
        meta: { index: number; tCaptureMs: number; videoW: number; videoH: number; clock: string };
        engines: Record<string, unknown>;
        face: null | {
          landmarks: number[];
          blendshapes: number[];
          matrix: number[];
          delegate: string;
          landmarkerMs: number;
          pose: { yawDeg: number; pitchDeg: number; rollDeg: number; R: number[]; t: number[]; scale: number };
          eyes: Record<string, number | boolean | number[]>;
          quality: Record<string, number | number[]>;
        };
      } | null;
      messages: { stage: string; message: string; recoverable: boolean }[];
    } | null;
  });
}

function finiteDeep(value: unknown, path = 'face'): string[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => finiteDeep(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => finiteDeep(v, `${path}.${k}`));
  return [];
}

async function runHost(page: Page, query: string, expected: { kind: string; variant: string }) {
  const problems = watch(page);
  const requests: string[] = [];
  const wasm: WasmResponse[] = [];
  page.context().on('request', (request) => requests.push(request.url()));
  page.context().on('response', (response) => {
    if (response.url().endsWith('.wasm.gz')) {
      const headers = response.headers();
      wasm.push({ url: response.url(), status: response.status(), type: headers['content-type'], encoding: headers['content-encoding'] });
    }
  });

  await page.goto(`./?e2e=1${query}#/lab`);
  await expect(page.locator('main h1')).toBeVisible();
  await page.getByRole('button', { name: 'Start camera and vision' }).click();

  await expect
    .poll(async () => (await snapshot(page))?.info?.kind ?? (await snapshot(page))?.error ?? null, { timeout: 30_000 })
    .toBe(expected.kind);
  const ready = (await snapshot(page))!;
  expect(ready.info!.wasmVariant).toBe(expected.variant);
  expect(ready.info!.mediapipe).toBe('0.10.35');
  expect(ready.info!.modelSha256).toBe('64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff');
  expect(['GPU', 'CPU']).toContain(ready.info!.delegate);
  expect(ready.selection!.kind).toBe(expected.kind);

  // A face within 15 s of ready.
  await expect.poll(async () => (await snapshot(page))?.faces ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  let snap: Snapshot = null;
  await expect
    .poll(async () => {
      snap = await snapshot(page);
      return snap?.lastResult?.face ? 'face' : 'none';
    })
    .toBe('face');
  const face = snap!.lastResult!.face!;
  expect(face.landmarks).toHaveLength(478 * 3);
  expect(face.blendshapes).toHaveLength(52);
  expect(face.matrix).toHaveLength(16);
  expect(finiteDeep(face)).toEqual([]);
  expect(face.delegate).toBe(snap!.info!.delegate);
  expect(face.quality.faceWidthFrac as number).toBeGreaterThan(0.1);
  expect(Math.abs(face.pose.yawDeg)).toBeLessThan(45);
  expect(snap!.lastResult!.meta.videoW).toBeGreaterThan(0);
  expect(['captureTime', 'expectedDisplayTime', 'callback', 'poll']).toContain(snap!.lastResult!.meta.clock);

  // Every engine is still a stub: each reports "not implemented", and frames keep flowing.
  await page.getByRole('button', { name: 'Run each engine on 10 frames' }).click();
  await expect.poll(async () => (await snapshot(page))?.engineStatus.length ?? 0, { timeout: 30_000 }).toBe(4);
  const statuses = (await snapshot(page))!.engineStatus;
  expect(statuses.map((s) => s.id)).toEqual(ENGINE_IDS);
  for (const s of statuses) expect(s, s.id).toMatchObject({ ok: false, reason: 'not implemented' });
  const before = (await snapshot(page))!.results;
  await expect.poll(async () => (await snapshot(page))?.results ?? 0, { timeout: 15_000 }).toBeGreaterThan(before + 5);
  await expect(page.getByText(/Finished: 10 frames timed\./)).toBeVisible({ timeout: 20_000 });

  // The production .wasm.gz arrives gzip-encoded as application/wasm.
  expect(wasm.length).toBeGreaterThan(0);
  for (const w of wasm) {
    expect(w.status, w.url).toBe(200);
    expect(w.type, w.url).toBe('application/wasm');
    expect(w.encoding, w.url).toBe('gzip');
  }

  const base = new URL(page.url()).origin;
  for (const url of requests) {
    if (url.startsWith('data:') || url.startsWith('blob:')) continue;
    expect(new URL(url).origin, `request to ${url}`).toBe(base);
  }
  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
  expect(problems).toEqual([]);
  const fatal = (await snapshot(page))!.messages.filter((m) => !m.recoverable);
  expect(fatal).toEqual([]);

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(async () => (await snapshot(page))?.running).toBe(false);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.defineProperty(window, '__cspViolations', { value: violations });
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
});

test.describe('vision host', () => {
  test.describe.configure({ timeout: 120_000 });

  test('worker host: module WebAssembly, a face, finite measures', async ({ page }) => {
    await runHost(page, '', { kind: 'worker', variant: 'module' });
  });

  test('inline host (?host=inline): SIMD WebAssembly, a face, finite measures', async ({ page }) => {
    await runHost(page, '&host=inline', { kind: 'inline', variant: 'simd' });
  });
});
