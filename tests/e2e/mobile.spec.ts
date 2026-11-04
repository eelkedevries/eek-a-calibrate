// mobile.spec.ts (spec §14.2.11, WP10): a phone held upright, emulated (isMobile, hasTouch, a
// 390 × 844 portrait viewport, a notch and a home indicator as safe-area insets) with the portrait
// fake camera (a 480 × 640 file from scripts/make-fake-video.sh --portrait; Chromium crops it to
// the mobile camera request, still portrait). The default flow, Welcome → Camera → Calibrate →
// Validate → Results → Live, completes by taps alone, never visits the optional screen-size and
// distance steps and never asks for element fullscreen; every target, as scheduled and as drawn on
// the stage, lies inside the safe rectangle, and the corner buttons are touch-sized; turning the
// phone pauses live gaze and, during a calibration block, invalidates the block. Accuracy is not
// asserted: the fake face does not look at the targets.
import { fileURLToPath } from 'node:url';
import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';
import { t } from '../../src/app/strings.en-GB.ts';
import { MOBILE } from '../../src/core/constants.ts';
import { layoutToPx, safeRect } from '../../src/core/geometry/screen.ts';

const PORTRAIT_VIDEO = fileURLToPath(new URL('../fixtures/generated/face-portrait.mjpeg', import.meta.url));
const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };
/** An iPhone-like notch and home indicator (CSS px). */
const INSETS = { top: 47, right: 0, bottom: 34, left: 0 };

test.use({
  viewport: PORTRAIT,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${PORTRAIT_VIDEO}`,
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

interface ProtocolSnapshot {
  screen: 'calibrate' | 'validate';
  phase: string;
  item: string | null;
  mode: 'fullscreen' | 'viewport' | null;
  message: string | null;
}

interface ScreenGeometry {
  viewportWpx: number;
  viewportHpx: number;
  fullscreen: boolean;
  pxPerMmSource: string;
  insets?: { top: number; right: number; bottom: number; left: number };
  presentationMode?: 'fullscreen' | 'viewport';
}

/** A block's layout on this phone: the whole portrait viewport, less the insets for the safe rectangle. */
const BLOCK_GEOMETRY: ScreenGeometry = { viewportWpx: PORTRAIT.width, viewportHpx: PORTRAIT.height, fullscreen: false, pxPerMmSource: 'assumed', insets: INSETS };

interface Item {
  kind: string;
  xNorm: number;
  yNorm: number;
}

interface AppState {
  geometry: { degreesApproximate: boolean; screen: ScreenGeometry; distance: { focalSource: string } } | null;
  calibration: { geometry: { screen: ScreenGeometry }; schedule: { items: Item[] }; frames: { meta: { videoW: number; videoH: number } }[] } | null;
  fit: { fits: Record<string, unknown>; fitGeometry: { screen: ScreenGeometry } | null } | null;
  validation: { mode: string; estimator: string }[] | null;
}

interface LiveSnapshot {
  mode: string;
  dots: number;
  lastDot: { x: number; y: number; greyed: boolean } | null;
  blocks: { kind: string; trial: string; frames: number }[];
  lastCheck: { kind: string; action: string | null } | null;
}

const protocol = (page: Page) => page.evaluate(() => (window.__eek as unknown as { protocol(): unknown }).protocol() as ProtocolSnapshot | null);
const appState = (page: Page) => page.evaluate(() => (window.__eek as unknown as { state(): unknown }).state() as AppState);
const route = (page: Page) => page.evaluate(() => (window.__eek as unknown as { route(): string }).route());
const live = (page: Page) => page.evaluate(() => ((window.__eek as unknown as { live?: () => unknown }).live?.() ?? null) as LiveSnapshot | null);

function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
  });
  page.on('worker', (w) => w.on('console', (m) => m.type() === 'error' && problems.push(`worker console error: ${m.text()}`)));
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  const requests: string[] = [];
  page.context().on('request', (r) => requests.push(r.url()));
  return { problems, requests };
}

/** Counts fullscreen requests and records every route the page shows, from the first script on. */
async function instrument(page: Page): Promise<CDPSession> {
  await page.addInitScript(() => {
    const w = window as unknown as { __fullscreenRequests: number; __routes: string[] };
    w.__fullscreenRequests = 0;
    w.__routes = [];
    const original = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = function (this: Element, options?: FullscreenOptions) {
      w.__fullscreenRequests += 1;
      return original.call(this, options);
    };
    const note = () => w.__routes.push(location.hash.replace(/\?.*$/, '') || '#/');
    window.addEventListener('hashchange', note);
    note();
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: INSETS } as never);
  return cdp;
}

/** Taps every instruction card's default button (and Resume on a pause) until `done()` holds. */
async function tapThrough(page: Page, done: () => Promise<boolean>, timeoutMs: number, pick: (title: string) => RegExp = () => /^(Continue|Resume)$/): Promise<string[]> {
  const seen: string[] = [];
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await done()) return seen;
    if (Date.now() > deadline) throw new Error(`timed out on ${await route(page)}; cards seen: ${seen.join(' | ')}; protocol ${JSON.stringify(await protocol(page))}; live ${JSON.stringify(await live(page))}`);
    const card = page.locator('.stimulus-card');
    if (await card.isVisible().catch(() => false)) {
      const title = (await card.locator('h2').textContent().catch(() => null)) ?? '';
      if (seen[seen.length - 1] !== title) seen.push(title);
      await card.getByRole('button', { name: pick(title) }).first().tap({ timeout: 2000 }).catch(() => undefined);
    }
    await page.waitForTimeout(150);
  }
}

/** The corner buttons are at least MOBILE.minTouchPx square and lie inside the safe rectangle. */
async function checkCornerButtons(stage: Locator, g: ScreenGeometry): Promise<void> {
  const r = safeRect(g);
  for (const name of [t('stimulus.pause'), t('stimulus.abort')]) {
    const box = await stage.getByRole('button', { name, exact: true }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.width, name).toBeGreaterThanOrEqual(MOBILE.minTouchPx);
    expect(box!.height, name).toBeGreaterThanOrEqual(MOBILE.minTouchPx);
    expect(box!.x, name).toBeGreaterThanOrEqual(r.x);
    expect(box!.y, name).toBeGreaterThanOrEqual(r.y);
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(r.x + r.w);
    expect(box!.y + box!.height, name).toBeLessThanOrEqual(r.y + r.h);
  }
}

function insideSafeRect(items: readonly Item[], g: ScreenGeometry): void {
  const r = safeRect(g);
  const targets = items.filter((i) => i.kind === 'target');
  expect(targets.length).toBeGreaterThan(0);
  for (const i of targets) {
    const [x, y] = layoutToPx(i.xNorm, i.yNorm, g);
    expect(x, `${JSON.stringify(i)} x`).toBeGreaterThan(r.x);
    expect(x, `${JSON.stringify(i)} x`).toBeLessThan(r.x + r.w);
    expect(y, `${JSON.stringify(i)} y`).toBeGreaterThan(r.y);
    expect(y, `${JSON.stringify(i)} y`).toBeLessThan(r.y + r.h);
  }
}

interface Drawn {
  x: number;
  y: number;
}

/**
 * The centre (CSS px) of the target as drawn on the stage canvas, from the bounding box of the
 * pixels that differ from the background (the canvas holds nothing else in a fixation block), or
 * null when no whole target is drawn. A shrinking ring is concentric, so it leaves the centre
 * unchanged; a ring cut off by the canvas edge makes the box non-square, and that sample is skipped.
 */
async function drawnTarget(page: Page): Promise<Drawn | null> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.stimulus-stage canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || canvas.width < 2 || canvas.clientWidth < 2) return null;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    // The stage clears to its background colour; the top-left corner never holds a target.
    const bg = [data[0], data[1], data[2]] as number[];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = 4 * (y * width + x);
        if (Math.abs((data[i] as number) - (bg[0] as number)) + Math.abs((data[i + 1] as number) - (bg[1] as number)) + Math.abs((data[i + 2] as number) - (bg[2] as number)) < 60) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0 || Math.abs(x1 - x0 - (y1 - y0)) > 2) return null;
    const scale = canvas.width / canvas.clientWidth;
    return { x: (x0 + x1 + 1) / 2 / scale, y: (y0 + y1 + 1) / 2 / scale };
  });
}

/** Every drawn target lies inside the safe rectangle, where layoutToPx puts a scheduled target. */
function drawnInsideSafeRect(drawn: readonly Drawn[], items: readonly Item[], g: ScreenGeometry): void {
  const r = safeRect(g);
  const scheduled = items.filter((i) => i.kind === 'target').map((i) => layoutToPx(i.xNorm, i.yNorm, g));
  const matched = new Set<number>();
  for (const d of drawn) {
    expect(d.x, `drawn ${JSON.stringify(d)}`).toBeGreaterThan(r.x);
    expect(d.x, `drawn ${JSON.stringify(d)}`).toBeLessThan(r.x + r.w);
    expect(d.y, `drawn ${JSON.stringify(d)}`).toBeGreaterThan(r.y);
    expect(d.y, `drawn ${JSON.stringify(d)}`).toBeLessThan(r.y + r.h);
    const k = scheduled.findIndex(([x, y]) => Math.hypot(x - d.x, y - d.y) <= 2);
    expect(k, `drawn ${JSON.stringify(d)} is no scheduled target (${JSON.stringify(scheduled)})`).toBeGreaterThanOrEqual(0);
    matched.add(k);
  }
  // Several different targets were seen, so the check covers more than one position.
  expect(matched.size).toBeGreaterThanOrEqual(3);
}

function sameOrigin(page: Page, requests: readonly string[]): void {
  const origin = new URL(page.url()).origin;
  for (const url of requests) {
    if (url.startsWith('data:') || url.startsWith('blob:')) continue;
    expect(new URL(url).origin, `request to ${url}`).toBe(origin);
  }
}

test.describe('A phone held upright (portrait camera, touch only)', () => {
  test.describe.configure({ timeout: 420_000 });

  test('the default flow completes by taps without fullscreen, inside the safe rectangle; turning the phone pauses live gaze', async ({ page }) => {
    const seen = watch(page);
    await instrument(page);

    // Welcome: the mobile instructions, and the screen and distance offered only as an option.
    await page.goto('./?e2e=1&speed=4&preset=quick&engines=geometric,eyepixel&seed=2611#/welcome');
    await expect(page.getByText(t('calibrate.steps.mobile')).first()).toBeVisible();
    await page.getByRole('button', { name: t('welcome.start') }).tap();

    // Camera: the meters and the device probe; Continue once green (or "Continue anyway").
    await expect.poll(() => route(page)).toBe('camera');
    await expect(page.getByText(t('calibrate.steps.mobile'))).toBeVisible();
    await page.getByRole('button', { name: t('camera.start') }).tap();
    const proceed = page.getByRole('button', { name: t('camera.continue') });
    const anyway = page.getByRole('button', { name: t('camera.override') });
    await expect.poll(async () => (await proceed.isEnabled()) || (await anyway.isVisible()), { timeout: 120_000 }).toBe(true);
    await ((await proceed.isEnabled()) ? proceed : anyway).tap();

    // Calibrate: straight from the camera screen; the stage is a fixed viewport-mode stage.
    await expect.poll(() => route(page)).toBe('calibrate');
    const start = page.getByRole('button', { name: t('calibrate.start') });
    await expect(start).toBeEnabled({ timeout: 120_000 });
    await start.tap();
    await tapThrough(page, async () => (await protocol(page))?.item != null, 60_000);
    const running = (await protocol(page))!;
    expect(running.mode).toBe('viewport');
    const stage = page.locator('.stimulus-stage');
    await expect(stage).toHaveCSS('touch-action', 'none');
    await expect(stage).toHaveCSS('position', 'fixed');
    await checkCornerButtons(stage, BLOCK_GEOMETRY);

    // The calibration targets as actually drawn are sampled on the way to the results.
    const drawn: Drawn[] = [];
    const cards = await tapThrough(page, async () => {
      const s = await protocol(page);
      if (s?.screen === 'calibrate' && s.phase === 'running' && s.item !== null) {
        const d = await drawnTarget(page);
        if (d) drawn.push(d);
      }
      return (await route(page)) === 'results';
    }, 240_000);
    expect(cards).toContain(t('protocol.instr.validation.title'));

    const state = await appState(page);
    const cal = state.calibration!;
    // The camera delivered portrait frames, and the geometry was assumed (nothing was measured).
    const { videoW, videoH } = cal.frames[0]!.meta;
    expect(videoH, `${videoW} × ${videoH}`).toBeGreaterThan(videoW);
    expect(state.geometry!.degreesApproximate).toBe(true);
    expect(state.geometry!.screen.pxPerMmSource).toBe('assumed');
    expect(state.geometry!.distance.focalSource).toBe('assumed-fov');
    // Viewport mode with the safe-area insets measured; every target inside the safe rectangle.
    const g = cal.geometry.screen;
    expect(g.presentationMode).toBe('viewport');
    expect(g.fullscreen).toBe(false);
    expect(g.viewportWpx).toBeLessThan(g.viewportHpx);
    expect(g.insets).toEqual(INSETS);
    insideSafeRect(cal.schedule.items, g);
    drawnInsideSafeRect(drawn, cal.schedule.items, g);
    expect(state.fit!.fitGeometry!.screen.insets).toEqual(INSETS);
    expect(Object.keys(state.fit!.fits)).toEqual(expect.arrayContaining(['geometric']));

    // Results: pixels first, and the optional measurement offered, not required.
    await expect(page.getByText(t('results.approx.measure')).first()).toBeVisible();
    const accuracy = await page.locator('table.metric-table tbody tr[data-estimator="geometric"] td').nth(1).textContent();
    expect(accuracy).toMatch(/^\d+ px · [\d.]+ % of diagonal · ≈/);

    // Live: the dot runs; turning the phone pauses it with the advice to turn back.
    await page.getByRole('button', { name: t('results.accept') }).tap();
    await expect.poll(() => route(page)).toBe('live');
    const startLive = page.getByRole('button', { name: t('live.start') });
    await expect(startLive).toBeEnabled({ timeout: 120_000 });
    await startLive.tap();
    await expect.poll(async () => (await live(page))?.dots ?? 0, { timeout: 60_000 }).toBeGreaterThan(5);
    await page.setViewportSize(LANDSCAPE);
    await expect.poll(async () => (await live(page))?.mode).toBe('paused');
    const paused = page.locator('.stimulus-card');
    await expect(paused.locator('h2')).toHaveText(t('live.paused.title'));
    await expect(paused).toContainText(t('invalid.orientation'));
    await expect(paused).toContainText(t('live.paused.rotate'));
    const dotsWhilePaused = (await live(page))!.dots;
    await page.waitForTimeout(1000);
    expect((await live(page))!.dots).toBe(dotsWhilePaused);

    // Turned back and resumed: a drift check is forced before live gaze continues.
    await page.setViewportSize(PORTRAIT);
    await paused.getByRole('button', { name: t('live.paused.resume') }).tap();
    const after = await tapThrough(page, async () => {
      const s = await live(page);
      return s?.mode === 'live' && s.lastCheck?.kind === 'drift';
    }, 120_000, (title) => (title === t('live.drift.large.title') ? new RegExp(`^${t('live.drift.notNow')}$`) : /^(Continue|Resume)$/));
    expect(after).toContain(t('live.forced.title'));
    expect(after).toContain(t('drift.instr.check.title'));
    const resumed = (await live(page))!.dots;
    await expect.poll(async () => (await live(page))?.dots ?? 0, { timeout: 30_000 }).toBeGreaterThan(resumed + 3);

    // The optional steps were never part of the flow, and fullscreen was never requested.
    const routes = await page.evaluate(() => (window as unknown as { __routes: string[] }).__routes);
    expect(routes).not.toContain('#/screen');
    expect(routes).not.toContain('#/distance');
    expect(routes).toEqual(expect.arrayContaining(['#/welcome', '#/camera', '#/calibrate', '#/validate', '#/results', '#/live']));
    expect(await page.evaluate(() => (window as unknown as { __fullscreenRequests: number }).__fullscreenRequests)).toBe(0);
    sameOrigin(page, seen.requests);
    expect(seen.problems).toEqual([]);
  });

  test('turning the phone during a calibration block invalidates it', async ({ page }) => {
    const seen = watch(page);
    await instrument(page);
    await page.goto('./?e2e=1&speed=2&preset=quick&engines=geometric&seed=2612#/calibrate');
    const start = page.getByRole('button', { name: t('calibrate.start') });
    await expect(start).toBeEnabled({ timeout: 120_000 });
    await start.tap();
    await tapThrough(page, async () => (await protocol(page))?.item != null, 60_000);
    const stage = page.locator('.stimulus-stage');
    await expect(stage).toBeVisible();
    await page.setViewportSize(LANDSCAPE);
    await expect.poll(async () => (await protocol(page))?.phase).toBe('stopped');
    const message = `${t('calibrate.invalid.orientation')} ${t('calibrate.invalid.after')}`;
    expect((await protocol(page))!.message).toBe(message);
    await expect(page.getByRole('alert')).toHaveText(message);
    await expect(stage).toHaveCount(0);
    expect((await appState(page)).calibration).toBeNull();

    // Back in portrait, calibration can start again.
    await page.setViewportSize(PORTRAIT);
    await expect(page.getByRole('button', { name: t('calibrate.startAgain') })).toBeEnabled({ timeout: 30_000 });
    expect(await page.evaluate(() => (window as unknown as { __fullscreenRequests: number }).__fullscreenRequests)).toBe(0);
    sameOrigin(page, seen.requests);
    expect(seen.problems).toEqual([]);
  });
});
