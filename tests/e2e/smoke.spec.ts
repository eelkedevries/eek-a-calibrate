// Smoke test (spec §10.4, §17.12): the built app loads under /eek-a-calibrate/ on the Title,
// every request stays on this origin, nothing logs an error or violates the production CSP, the
// self-hosted fonts load, a hash route survives a reload, the Details sheet behaves as a modal
// dialog, and the v1 flow stays reachable from Play.
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

interface SheetState {
  open: boolean;
  tab: string | null;
  page: number;
  pages: number;
}

const route = (page: Page) => page.evaluate(() => window.__eek!.route());
const sheet = (page: Page) => page.evaluate(() => (window.__eek!.sheet as () => SheetState)());
const cspViolations = (page: Page) => page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
/** The class list of the focused element, and whether it sits inside the open sheet. */
const focus = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return { cls: el?.className ?? '', inSheet: Boolean(el?.closest('dialog.sheet')), text: el?.textContent?.trim() ?? '' };
  });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.defineProperty(window, '__cspViolations', { value: violations });
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
});

test('loads the Title with same-origin requests only, the self-hosted fonts, no errors and no CSP violations', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const requests: string[] = [];
  // The context sees requests from the page and from its workers.
  context.on('request', (request) => requests.push(request.url()));
  const problems = watch(page);

  const response = await page.goto('./?e2e=1');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("connect-src 'self'");
  await expect(page.getByRole('heading', { level: 1, name: 'Pop with your eyes' })).toBeVisible();
  expect(await route(page)).toBe('title');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Details' })).toBeVisible();

  // The fonts the Title uses arrive from this origin as WOFF2 (§17.3.2).
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((face) => face.status === 'loaded').map((face) => `${face.family.replace(/"/g, '')} ${face.weight}`);
  });
  expect(loaded).toEqual(expect.arrayContaining(['Spectral 600', 'Lexend 400', 'Lexend 500']));
  expect(requests.filter((url) => url.endsWith('.woff2')).length).toBeGreaterThanOrEqual(3);

  // Every engine module loads through the registry: dynamic chunks under the production CSP.
  const engines = await page.evaluate(() => window.__eek!.engines());
  expect(engines.map((engine) => engine.id)).toEqual(ENGINE_IDS);

  await page.goto('./?e2e=1#/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  expect(await route(page)).toBe('not-found');

  expect(await cspViolations(page)).toEqual([]);
  expect(problems).toEqual([]);
  expect(requests.length).toBeGreaterThan(0);
  for (const url of requests) {
    if (url.startsWith('data:') || url.startsWith('blob:')) continue;
    expect(new URL(url).origin, `request to ${url}`).toBe(origin);
  }
});

test('a hash route survives a reload: the Details deep link and a v1 route', async ({ page }) => {
  const problems = watch(page);
  await page.goto('./?e2e=1#/details/settings');
  await expect.poll(() => sheet(page)).toMatchObject({ open: true, tab: 'settings' });
  expect(await route(page)).toBe('details');
  await page.reload();
  await expect.poll(() => sheet(page)).toMatchObject({ open: true, tab: 'settings' });
  expect(await route(page)).toBe('details');

  await page.goto('./?e2e=1#/about');
  await expect(page.locator('main h1')).toBeVisible();
  expect(await route(page)).toBe('about');
  const heading = await page.locator('main h1').textContent();
  await page.reload();
  await expect(page.locator('main h1')).toHaveText(heading ?? '');
  expect(await route(page)).toBe('about');
  expect(await cspViolations(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test('the Details sheet traps focus, switches tabs by key, closes on Esc and Done, and returns focus', async ({ page }) => {
  const problems = watch(page);
  await page.goto('./?e2e=1#/complete');
  const trigger = page.getByRole('button', { name: 'Details' });
  await trigger.click();
  // Opening it never changes the route.
  await expect.poll(() => sheet(page)).toMatchObject({ open: true, tab: 'results' });
  expect(await route(page)).toBe('complete');
  expect(new URL(page.url()).hash).toBe('#/complete');
  const dialog = page.getByRole('dialog', { name: 'Details' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Results' })).toBeFocused();

  // Focus stays inside the sheet, forwards and backwards.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect((await focus(page)).inSheet).toBe(true);
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab');
    expect((await focus(page)).inSheet).toBe(true);
  }

  // The tabs are a segmented control: arrows move and wrap, Home and End jump.
  await page.getByRole('tab', { name: 'Results' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Settings' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
  expect((await sheet(page)).tab).toBe('settings');
  await page.keyboard.press('End');
  expect((await sheet(page)).tab).toBe('about');
  await page.keyboard.press('ArrowRight');
  expect((await sheet(page)).tab).toBe('results');
  await page.keyboard.press('ArrowLeft');
  expect((await sheet(page)).tab).toBe('about');
  await expect(page.getByRole('tabpanel')).toContainText('About');

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await sheet(page)).open).toBe(false);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect.poll(async () => (await sheet(page)).open).toBe(true);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect.poll(async () => (await sheet(page)).open).toBe(false);
  await expect(trigger).toBeFocused();
  expect(await route(page)).toBe('complete');
  expect(problems).toEqual([]);
});

test('the deep link opens the sheet over the Title, which stays when it closes', async ({ page }) => {
  const problems = watch(page);
  await page.goto('./?e2e=1#/details/data');
  await expect.poll(() => sheet(page)).toMatchObject({ open: true, tab: 'data' });
  await expect(page.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await sheet(page)).open).toBe(false);
  // The dialog's close event, which puts the address back on the Title, follows the close as a task.
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/');
  expect(await route(page)).toBe('title');
  await expect(page.getByRole('button', { name: 'Details' })).toBeFocused();
  await expect(page.getByRole('heading', { level: 1, name: 'Pop with your eyes' })).toBeVisible();

  // Another deep link switches the tab without rebuilding the Title.
  await page.evaluate(() => {
    document.querySelector('.app h1')!.setAttribute('data-marker', 'kept');
    location.hash = '#/details/device';
  });
  await expect.poll(() => sheet(page)).toMatchObject({ open: true, tab: 'device' });
  await expect(page.locator('.app h1[data-marker="kept"]')).toBeAttached();
  expect(problems).toEqual([]);
});

test('the pager shows one page at a time; delete all sits behind a confirmation', async ({ page }) => {
  const problems = watch(page);
  await page.goto('./?e2e=1&fixture=sheet-pages#/details/results');
  expect(await page.evaluate(() => (window.__eek!.fixture as () => unknown)())).toEqual({ name: 'sheet-pages', applied: true });
  await expect.poll(() => sheet(page)).toMatchObject({ open: true, tab: 'results', page: 0, pages: 3 });
  const pager = page.getByRole('navigation', { name: 'Pages' });
  await expect(pager).toContainText('1 of 3');
  const next = pager.getByRole('button', { name: 'Next page' });
  await next.click();
  await expect(pager).toContainText('2 of 3');
  await next.click();
  await expect(pager).toContainText('3 of 3');
  // At the last page the button stays focused and does nothing.
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await expect(next).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(pager).toContainText('3 of 3');
  expect((await sheet(page)).page).toBe(2);
  // A new tab starts on its first page.
  await page.getByRole('tab', { name: 'Device' }).click();
  await expect(pager).toContainText('1 of 3');

  await page.getByRole('button', { name: 'Delete all my data' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete all your data?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  expect((await sheet(page)).open).toBe(true);
  await page.getByRole('button', { name: 'Delete all my data' }).click();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('dialog.sheet [role="status"]')).toHaveText('All data that eek-a-calibrate stored on this device has been deleted.');
  expect((await sheet(page)).open).toBe(true);
  expect(problems).toEqual([]);
});

test('Play opens the v1 flow at #/welcome until the game is built', async ({ page }) => {
  const problems = watch(page);
  await page.goto('./?e2e=1');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => route(page)).toBe('welcome');
  await expect(page.locator('.site-header')).toBeVisible();
  await expect(page.locator('main h1')).toBeVisible();
  // The v1 page scrolls as before; the game's routes do not.
  expect(await page.evaluate(() => document.documentElement.dataset.layout)).toBe('legacy');
  await page.goto('./?e2e=1#/');
  expect(await page.evaluate(() => document.documentElement.dataset.layout)).toBe('game');
  await expect(page.locator('.site-header')).toBeHidden();
  expect(problems).toEqual([]);
});

test('the server sends the production types and headers', async ({ request }) => {
  const head = (path: string) => request.fetch(path, { method: 'HEAD' });

  const index = await head('./');
  expect(index.headers()['content-security-policy']).toContain("default-src 'self'");
  expect(index.headers()['content-security-policy']).toContain("font-src 'self'");
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
  for (const font of ['./fonts/spectral/spectral-latin-600-normal.woff2', './fonts/lexend/lexend-latin-400-normal.woff2', './fonts/jetbrains-mono/jetbrains-mono-latin-500-normal.woff2']) {
    const response = await head(font);
    expect(response.status(), font).toBe(200);
    expect(response.headers()['content-type'], font).toBe('font/woff2');
  }
  expect((await head('./no-such-file.js')).status()).toBe(404);
});
