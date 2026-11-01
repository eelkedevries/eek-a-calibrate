// engines.spec.ts (spec §10.4): #/lab "Run each engine on 10 frames" on the
// fake camera; each engine returns 'ok' on at least 3 of the 10 frames, with
// its backend and timings recorded, and nothing leaves the origin. Each
// engine's work package adds its own describe block (WP6 BlazeGaze, WP7 Peekr).
import { expect, test, type Page } from '@playwright/test';

test.describe('Peekr engine (WP7)', () => {
  test.describe.configure({ timeout: 180_000 });

  interface PeekrSnapshot {
    info: { kind: string } | null;
    error: string | null;
    faces: number;
    engineStatus: { id: string; ok: boolean; backend?: string; reason?: string; loadMs?: number }[];
    probe: { frames: number; engines: Record<string, { p50Ms: number; p90Ms: number; okFrames: number }> } | null;
    probeError: string | null;
    lastResult: { engines: Record<string, { status: string; x: number[] | null; prior: number[] | null; computeMs: number }> } | null;
    messages: { stage: string; message: string; recoverable: boolean }[];
  }

  const snapshot = (page: Page) => page.evaluate(() => (window.__eek as unknown as { lab(): unknown }).lab() as PeekrSnapshot | null);

  test('runs on ort-wasm, is ok on at least 3 of 10 frames, shows its crops and stays on the origin', async ({ page }) => {
    await page.addInitScript(() => {
      const violations: string[] = [];
      Object.defineProperty(window, '__cspViolations', { value: violations });
      document.addEventListener('securitypolicyviolation', (event) => violations.push(`${event.violatedDirective} ${event.blockedURI}`));
    });
    const problems: string[] = [];
    const onConsole = (where: string) => (message: { type(): string; text(): string }) => {
      if (message.type() === 'error') problems.push(`${where} console error: ${message.text()}`);
    };
    page.on('console', onConsole('page'));
    page.on('worker', (worker) => worker.on('console', onConsole('worker')));
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
    const requests: string[] = [];
    const ortWasm: { url: string; status: number; type?: string; encoding?: string }[] = [];
    page.context().on('request', (request) => requests.push(request.url()));
    page.context().on('response', (response) => {
      if (/\/ort-wasm-simd-threaded-[^/]+\.wasm(\.gz)?$/.test(response.url())) {
        const headers = response.headers();
        ortWasm.push({ url: response.url(), status: response.status(), type: headers['content-type'], encoding: headers['content-encoding'] });
      }
    });

    await page.goto('./?e2e=1#/lab');
    await expect(page.locator('main h1')).toBeVisible();
    await page.getByRole('button', { name: 'Start camera and vision' }).click();
    await expect.poll(async () => (await snapshot(page))?.info?.kind ?? (await snapshot(page))?.error ?? null, { timeout: 30_000 }).toBe('worker');
    await expect.poll(async () => (await snapshot(page))?.faces ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Run each engine on 10 frames' }).click();
    await expect(page.getByText(/Finished: 10 frames timed\./)).toBeVisible({ timeout: 120_000 });
    const snap = (await snapshot(page))!;
    expect(snap.probeError).toBeNull();

    // Loaded on single-threaded ONNX Runtime WebAssembly, with its load time recorded.
    const status = snap.engineStatus.find((s) => s.id === 'peekr');
    expect(status, JSON.stringify(snap.engineStatus)).toMatchObject({ ok: true, backend: 'ort-wasm' });
    expect(status!.loadMs).toBeGreaterThan(0);
    // ok on at least 3 of the 10 timed frames, with per-frame timings.
    const run = snap.probe!.engines.peekr;
    expect(snap.probe!.frames).toBe(10);
    expect(run.okFrames).toBeGreaterThanOrEqual(3);
    expect(Number.isFinite(run.p50Ms) && run.p50Ms > 0).toBe(true);
    expect(Number.isFinite(run.p90Ms)).toBe(true);

    // A frame's features are kps (8 values in the unit square) and the prior a finite point.
    await expect.poll(async () => (await snapshot(page))?.lastResult?.engines.peekr?.status, { timeout: 15_000 }).toBe('ok');
    const frame = (await snapshot(page))!.lastResult!.engines.peekr;
    expect(frame.x).toHaveLength(8);
    expect(frame.x!.every((v) => Number.isFinite(v) && v > 0 && v < 1)).toBe(true);
    expect(frame.prior).toHaveLength(2);
    expect(frame.prior!.every(Number.isFinite)).toBe(true);

    // The crop renderer shows both 128 × 128 eye crops, with image content in them.
    const crops = page.locator('[data-engine="peekr"] figure');
    await expect(crops).toHaveCount(2, { timeout: 15_000 });
    await expect(crops.nth(0).locator('figcaption')).toContainText('input1');
    await expect(crops.nth(1).locator('figcaption')).toContainText('input2');
    const meanLevels = await page.locator('[data-engine="peekr"] canvas').evaluateAll((canvases) =>
      (canvases as HTMLCanvasElement[]).map((c) => {
        const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
        return { w: c.width, h: c.height, mean: sum / ((3 * data.length) / 4) };
      }),
    );
    for (const m of meanLevels) {
      expect(m).toMatchObject({ w: 128, h: 128 });
      expect(m.mean).toBeGreaterThan(10);
    }

    // The runtime arrived once, as the gzip-encoded .wasm.gz, so the plain-file retry never ran.
    expect(ortWasm.map((r) => new URL(r.url).pathname.endsWith('.wasm.gz'))).toEqual([true]);
    expect(ortWasm[0]).toMatchObject({ status: 200, type: 'application/wasm', encoding: 'gzip' });
    expect(requests.some((url) => /\/ort-wasm-simd-threaded-[^/]+\.mjs$/.test(url))).toBe(true);
    expect(requests.some((url) => url.endsWith('/models/peekr-1.0.7/peekr.onnx'))).toBe(true);

    // No third-party request (Peekr's own model host above all), no console error, no CSP violation.
    const origin = new URL(page.url()).origin;
    for (const url of requests) {
      expect(url).not.toContain('blob.core.windows.net');
      if (url.startsWith('data:') || url.startsWith('blob:')) continue;
      expect(new URL(url).origin, `request to ${url}`).toBe(origin);
    }
    expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
    expect(problems).toEqual([]);
    expect(snap.messages.filter((m) => m.stage === 'peekr' || !m.recoverable)).toEqual([]);

    await page.getByRole('button', { name: 'Stop' }).click();
  });
});
