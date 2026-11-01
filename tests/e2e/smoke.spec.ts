// WP1 smoke test (spec §10.4): the built app loads under /eek-a-calibrate/,
// every request stays on this origin, nothing logs an error or violates the
// production CSP, and a hash route survives a reload.
import { readdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const ENGINE_IDS = ['blazegaze', 'peekr', 'geometric', 'eyepixel'];

function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  return problems;
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

test('loads with same-origin requests only, no errors and no CSP violations', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const requests: string[] = [];
  // The context sees requests from the page and from its workers.
  context.on('request', (request) => requests.push(request.url()));
  const problems = watch(page);

  const response = await page.goto('./?e2e=1');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("connect-src 'self'");
  await expect(page.locator('main h1')).toBeVisible();
  expect(await page.evaluate(() => window.__eek?.route())).toBe('welcome');

  // Every engine module loads through the registry: dynamic chunks under the production CSP.
  const engines = await page.evaluate(() => window.__eek!.engines());
  expect(engines.map((engine) => engine.id)).toEqual(ENGINE_IDS);

  await page.goto('./?e2e=1#/no-such-page');
  await expect(page.locator('main h1')).toBeVisible();
  expect(await page.evaluate(() => window.__eek?.route())).toBe('not-found');

  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
  expect(problems).toEqual([]);
  expect(requests.length).toBeGreaterThan(0);
  for (const url of requests) {
    if (url.startsWith('data:') || url.startsWith('blob:')) continue;
    expect(new URL(url).origin, `request to ${url}`).toBe(origin);
  }
});

test('a hash route survives a reload', async ({ page }) => {
  const problems = watch(page);
  await page.goto('./?e2e=1#/about');
  await expect(page.locator('main h1')).toBeVisible();
  expect(await page.evaluate(() => window.__eek?.route())).toBe('about');
  const heading = await page.locator('main h1').textContent();

  await page.reload();
  await expect(page.locator('main h1')).toHaveText(heading ?? '');
  expect(await page.evaluate(() => window.__eek?.route())).toBe('about');
  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
  expect(problems).toEqual([]);
});

test('the server sends the production types and headers', async ({ request }) => {
  const head = (path: string) => request.fetch(path, { method: 'HEAD' });

  const index = await head('./');
  expect(index.headers()['content-security-policy']).toContain("default-src 'self'");
  expect(index.headers()['permissions-policy']).toBe('camera=(self), microphone=(), geolocation=()');

  const wasmGz = await head('./vendor/mediapipe-0.10.35/vision_wasm_module_internal.wasm.gz');
  expect(wasmGz.status()).toBe(200);
  expect(wasmGz.headers()['content-type']).toBe('application/wasm');
  expect(wasmGz.headers()['content-encoding']).toBe('gzip');

  const ortMjs = readdirSync('dist/assets').find((name) => /^ort-wasm-simd-threaded-.*\.mjs$/.test(name));
  expect(ortMjs).toBeTruthy();
  expect((await head(`./assets/${ortMjs}`)).headers()['content-type']).toBe('text/javascript');

  for (const model of ['./models/face-landmarker-f16-v1/face_landmarker.task', './models/peekr-1.0.7/peekr.onnx']) {
    expect((await head(model)).headers()['content-type']).toBe('application/octet-stream');
  }
  expect((await head('./no-such-file.js')).status()).toBe(404);
});
