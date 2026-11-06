// failures.spec.ts (spec §10.4, §17.12; design §2.16): the failure paths of the game. A refused
// camera shows "Camera blocked" and "Try again" on the Title; an exit from fullscreen, simulated
// through `__eek.simulateFullscreenExit()`, during a warm-up level and during a challenge round
// shows "The screen changed", and "Warm up again" starts a fresh run from Level 1; a tampered model
// (served by a test route) makes only its engine unavailable, as Details → Device says; and a crash
// of the vision worker (`__eek.crashWorker()`) recovers, in the lab and in the middle of a level.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { t } from '../../src/app/strings.en-GB.ts';
import { sheet } from './helpers/details.ts';
import { appState, challenge, forceZones, look, playWarmup, route, sameOrigin, startWarmup, warmup, watch } from './helpers/game.ts';

interface LabSnapshot {
  running: boolean;
  info: { kind: string } | null;
  engineStatus: { id: string; ok: boolean; reason?: string }[];
  host: { restarts: number; results: number } | null;
  results: number;
  faces: number;
  messages: { stage: string; message: string; recoverable: boolean }[];
}

interface AppState {
  calibration: { frames: { meta: { tCaptureMs: number }; yawDeg: number | null }[] } | null;
  fit: { fits: Record<string, unknown> } | null;
  validation: unknown[] | null;
}

const lab = (page: Page) => page.evaluate(() => (window.__eek as unknown as { lab(): unknown }).lab() as LabSnapshot | null);
const crashWorker = (page: Page) => page.evaluate(() => (window.__eek as unknown as { crashWorker(): number }).crashWorker());
const simulateFullscreenExit = (page: Page) => page.evaluate(() => (window.__eek as unknown as { simulateFullscreenExit(): boolean }).simulateFullscreenExit());

/** Plays the warm-up until a bubble of a level is on screen. */
async function untilBubble(page: Page): Promise<void> {
  await playWarmup(page, {
    timeoutMs: 120_000,
    done: async () => {
      const w = await warmup(page);
      return w?.phase === 'running' && w.item !== null;
    },
  });
}

/** "The screen changed" is up; Warm up again returns to the Level 1 card of a fresh warm-up. */
async function warmUpAgain(page: Page): Promise<void> {
  const card = page.getByRole('alertdialog', { name: t('warmup.changed.title') });
  await expect(card).toBeVisible();
  await expect(card).toContainText(t('warmup.changed.body'));
  await card.getByRole('button', { name: t('warmup.changed.action') }).click();
  await expect.poll(() => route(page)).toBe('warmup');
  await expect.poll(async () => {
    const w = await warmup(page);
    return w?.card === 'level' ? w.level?.number : null;
  }).toBe(1);
  await expect(page.getByRole('dialog', { name: t('warmup.level.pop.name') })).toBeVisible();
}

test.describe('Failure paths', () => {
  test.describe.configure({ timeout: 300_000 });

  test('a refused camera shows "Camera blocked" and "Try again" on the Title', async ({ playwright, baseURL }) => {
    // The suite's browser grants the camera through --use-fake-ui-for-media-stream whatever the
    // permission says, and the headless shell has no permission machinery, so this test runs its
    // own Chromium (new headless) with a fake camera and denies the camera for its context.
    const browser = await playwright.chromium.launch({ channel: 'chromium', args: ['--use-fake-device-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    try {
      const context: BrowserContext = await browser.newContext({ baseURL });
      const page = await context.newPage();
      const { targetInfo } = await (await context.newCDPSession(page)).send('Target.getTargetInfo');
      const cdp = await browser.newBrowserCDPSession();
      await cdp.send('Browser.setPermission', {
        permission: { name: 'camera' },
        setting: 'denied',
        origin: new URL(baseURL!).origin,
        browserContextId: targetInfo.browserContextId,
      });
      const seen = watch(page);
      await page.goto('./?e2e=1');
      await page.getByRole('button', { name: t('title.play') }).click();
      const alert = page.getByRole('alert').filter({ hasText: t('title.blocked.title') });
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(t('title.blocked.body'));
      const retry = page.getByRole('button', { name: t('title.retry') });
      await expect(retry).toBeVisible();
      await expect(retry).toBeFocused();
      expect(await route(page)).toBe('title');
      await expect(page.locator('video')).toHaveCount(0);
      // Trying again with the camera still refused stays on the Title; no gaze engine was loaded.
      await retry.click();
      await expect(alert).toBeVisible();
      expect(await route(page)).toBe('title');
      expect(seen.requests.filter((u) => /\.onnx$|model\.json$/.test(u))).toEqual([]);
      sameOrigin(page, seen.requests);
      expect(seen.problems.filter((p) => p.startsWith('page error'))).toEqual([]);
      await context.close();
    } finally {
      await browser.close();
    }
  });

  test('a fullscreen exit during a level and during a round shows "The screen changed"; a fresh run follows', async ({ page }) => {
    const seen = watch(page);
    await page.goto('./?e2e=1&speed=4&preset=quick&engines=geometric&seed=31');
    // On Get ready there is nothing to invalidate yet.
    await page.getByRole('button', { name: t('title.play') }).click();
    await expect.poll(() => route(page)).toBe('ready');
    await expect.poll(() => page.evaluate(() => typeof (window.__eek as unknown as Record<string, unknown>).simulateFullscreenExit)).toBe('function');
    expect(await simulateFullscreenExit(page)).toBe(false);

    // During Level 1: the level stops, nothing is fitted, and Warm up again starts afresh.
    const action = page.locator('.ready-start');
    await expect.poll(async () => ((await action.isEnabled().catch(() => false)) ? 'ready' : 'waiting'), { timeout: 120_000 }).toBe('ready');
    await action.click();
    await expect.poll(() => route(page)).toBe('warmup');
    await untilBubble(page);
    expect(await simulateFullscreenExit(page)).toBe(true);
    await expect.poll(async () => (await warmup(page))?.card).toBe('changed');
    expect((await appState<AppState>(page)).fit).toBeNull();
    await warmUpAgain(page);

    // The fresh run completes.
    await playWarmup(page);
    expect((await appState<AppState>(page)).fit?.fits.geometric).toBeDefined();

    // During a round: the round ends unfinished and Warm up again starts a new warm-up.
    await forceZones(page, 3, 1);
    await page.evaluate(() => (location.hash = '#/look'));
    await expect.poll(async () => (await look(page))?.phase, { timeout: 60_000 }).toBe('look');
    await page.mouse.move(30, 300);
    await page.getByRole('button', { name: t('look.play') }).click();
    await expect.poll(() => route(page)).toBe('challenge');
    await page.locator('.level-card__start').click({ timeout: 30_000 });
    await expect.poll(async () => (await challenge(page))?.bubble ?? null, { timeout: 60_000 }).not.toBeNull();
    expect(await simulateFullscreenExit(page)).toBe(true);
    await expect.poll(async () => (await challenge(page))?.phase).toBe('changed');
    await warmUpAgain(page);

    sameOrigin(page, seen.requests);
    expect(seen.problems).toEqual([]);
  });

  test('a tampered model makes only its engine unavailable', async ({ page, context }) => {
    const seen = watch(page);
    let served = 0;
    // The test route serves the Peekr model with one byte flipped: same size, wrong sha256.
    await context.route('**/models/peekr-1.0.7/peekr.onnx*', async (r) => {
      const response = await r.fetch();
      const body = Buffer.from(await response.body());
      body[body.length >> 1] ^= 0xff;
      served += 1;
      await r.fulfill({ response, body });
    });
    await page.goto('./?e2e=1&engines=all&speed=4');
    await page.getByRole('button', { name: t('title.play') }).click();
    await expect.poll(() => route(page)).toBe('ready');
    // The other engines load and the device check runs: the warm-up can start.
    const action = page.locator('.ready-start');
    await expect.poll(async () => ((await action.isEnabled().catch(() => false)) ? 'ready' : 'waiting'), { timeout: 180_000 }).toBe('ready');
    expect(served).toBeGreaterThan(0);

    // Details → Device, Engine timings: Peekr is unavailable with its reason; the others ran.
    await page.locator('.topbar__details').click();
    await page.getByRole('tab', { name: 'Device' }).click();
    for (let i = 0; i < 12 && (await sheet(page)).pageId !== 'timings'; i++) await page.getByRole('button', { name: 'Next page' }).click();
    expect((await sheet(page)).pageId).toBe('timings');
    const panel = page.getByRole('tabpanel');
    await expect(panel).toContainText(/Peekr\s*Unavailable: peekr-model: the file does not match its manifest hash/);
    for (const name of ['BlazeGaze', 'Geometric', 'Eye-pixel (WebGazer method)']) await expect(panel).toContainText(name);
    await expect(panel.getByText(/^Unavailable:/)).toHaveCount(1);
    expect(seen.problems.filter((p) => p.startsWith('page error'))).toEqual([]);
    sameOrigin(page, seen.requests);
  });

  test('a crashed vision worker restarts with its engines, in the lab and during a warm-up level', async ({ page }) => {
    const seen = watch(page);

    // The lab: the host reports the crash, restarts itself, reloads its engines and frames flow again.
    await page.goto('./?e2e=1&engines=geometric,eyepixel#/lab');
    await page.getByRole('button', { name: t('lab.start') }).click();
    await expect.poll(async () => (await lab(page))?.info?.kind ?? null, { timeout: 60_000 }).toBe('worker');
    await expect.poll(async () => (await lab(page))?.faces ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.getByRole('button', { name: t('lab.runAll') }).click();
    await expect(page.getByText(/Finished: 10 frames timed\./)).toBeVisible({ timeout: 120_000 });
    const before = (await lab(page))!;
    expect(before.host!.restarts).toBe(0);
    const engines = before.engineStatus.map((s) => [s.id, s.ok]);

    expect(await crashWorker(page)).toBe(1);
    await expect.poll(async () => (await lab(page))?.host?.restarts ?? 0).toBe(1);
    await expect
      .poll(async () => (await lab(page))?.messages.some((m) => m.stage === 'host' && m.recoverable && /simulated crash.*being restarted/.test(m.message)))
      .toBe(true);
    const crashedAt = (await lab(page))!.results;
    await expect.poll(async () => (await lab(page))?.results ?? 0, { timeout: 60_000 }).toBeGreaterThan(crashedAt + 10);
    const after = (await lab(page))!;
    expect(after.info?.kind).toBe('worker');
    expect(after.engineStatus.map((s) => [s.id, s.ok])).toEqual(engines);
    expect(after.messages.filter((m) => !m.recoverable)).toEqual([]);
    await page.getByRole('button', { name: t('lab.stop') }).click();

    // A warm-up: the worker crashes on a bubble of Level 1; the warm-up survives it and completes.
    await page.goto('./?e2e=1&speed=4&preset=quick&engines=geometric,eyepixel&seed=57');
    await startWarmup(page);
    await untilBubble(page);
    const crashMs = await page.evaluate(() => performance.now());
    expect(await crashWorker(page)).toBe(1);
    await playWarmup(page, { timeoutMs: 240_000 });
    const state = await appState<AppState>(page);
    expect(state.fit?.fits.geometric).toBeDefined();
    expect(state.validation!.length).toBeGreaterThan(0);
    // Frames captured after the crash were processed (by the restarted worker) and recorded with a face.
    expect(state.calibration!.frames.some((f) => f.meta.tCaptureMs > crashMs + 1000 && f.yawDeg !== null)).toBe(true);

    sameOrigin(page, seen.requests);
    expect(seen.problems).toEqual([]);
  });
});
