// failures.spec.ts (spec §10.4, WP10): the failure paths. Without camera permission the camera
// screen says how to allow it and nothing else starts; a fullscreen exit, simulated through
// `__eek`, aborts the calibration block and the validation block, and both can be run again; a
// tampered model (served by a test route) makes only its engine unavailable; and a crash of the
// vision worker (`__eek.crashWorker()`) recovers, in the lab and in the middle of a calibration.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { t } from '../../src/app/strings.en-GB.ts';

interface ProtocolSnapshot {
  screen: 'calibrate' | 'validate';
  phase: string;
  item: string | null;
  done: number;
  total: number;
  mode: 'fullscreen' | 'viewport' | null;
  message: string | null;
}

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

const protocol = (page: Page) => page.evaluate(() => (window.__eek as unknown as { protocol(): unknown }).protocol() as ProtocolSnapshot | null);
const appState = (page: Page) => page.evaluate(() => (window.__eek as unknown as { state(): unknown }).state() as AppState);
const route = (page: Page) => page.evaluate(() => (window.__eek as unknown as { route(): string }).route());
const lab = (page: Page) => page.evaluate(() => (window.__eek as unknown as { lab(): unknown }).lab() as LabSnapshot | null);
const crashWorker = (page: Page) => page.evaluate(() => (window.__eek as unknown as { crashWorker(): number }).crashWorker());

function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
  });
  page.on('worker', (w) => w.on('console', (m) => m.type() === 'error' && problems.push(`worker console error: ${m.text()}`)));
  const requests: string[] = [];
  page.context().on('request', (r) => requests.push(r.url()));
  return { problems, requests };
}

function sameOrigin(page: Page, requests: readonly string[]): void {
  const origin = new URL(page.url()).origin;
  for (const url of requests) {
    if (url.startsWith('data:') || url.startsWith('blob:')) continue;
    expect(new URL(url).origin, `request to ${url}`).toBe(origin);
  }
}

/** Continues instruction cards (and resumes pauses) until `done()` holds; returns the card titles seen. */
async function drive(page: Page, done: () => Promise<boolean>, timeoutMs: number): Promise<string[]> {
  const seen: string[] = [];
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await done()) return seen;
    if (Date.now() > deadline) throw new Error(`timed out; cards seen: ${seen.join(' | ')}; protocol: ${JSON.stringify(await protocol(page))}`);
    const card = page.locator('.stimulus-card');
    if (await card.isVisible().catch(() => false)) {
      const title = (await card.locator('h2').textContent().catch(() => null)) ?? '';
      if (seen[seen.length - 1] !== title) seen.push(title);
      await card.getByRole('button', { name: /^(Continue|Resume)$/ }).click({ timeout: 2000 }).catch(() => undefined);
    }
    await page.waitForTimeout(100);
  }
}

/** Continues the instruction cards until a target of the block is on screen. */
async function untilItemOnScreen(page: Page, screen: ProtocolSnapshot['screen']): Promise<ProtocolSnapshot> {
  await drive(page, async () => {
    const s = await protocol(page);
    return s?.screen === screen && s.phase === 'running' && s.item !== null;
  }, 60_000);
  return (await protocol(page))!;
}

test.describe('Failure paths', () => {
  test.describe.configure({ timeout: 240_000 });

  test('no camera permission: the camera screen says how to allow it, and nothing else starts', async ({ playwright, baseURL }) => {
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
      const denied = t('camera.error.denied');

      // The default flow: Welcome, then the camera screen, which asks for the camera.
      await page.goto('./?e2e=1#/welcome');
      await page.getByRole('button', { name: t('welcome.start') }).click();
      await expect.poll(() => route(page)).toBe('camera');
      const start = page.getByRole('button', { name: t('camera.start') });
      await start.click();
      await expect(page.getByRole('alert').filter({ hasText: denied })).toBeVisible();
      // The user can try again once the permission is given; nothing moves on meanwhile.
      await expect(start).toBeEnabled();
      await expect(page.getByRole('button', { name: t('camera.continue') })).toBeDisabled();
      await expect(page.locator('video')).toHaveCount(0);

      // Calibration opened directly says the same, and its Start button stays disabled.
      await page.goto('./?e2e=1#/calibrate');
      await expect(page.getByRole('alert').filter({ hasText: denied })).toBeVisible();
      await expect(page.getByRole('button', { name: t('calibrate.start') })).toBeDisabled();
      expect((await protocol(page))?.phase).toBe('error');

      // The camera is asked for before anything is downloaded, so no vision host was started.
      expect(seen.requests.filter((u) => /face_landmarker\.task|vision_wasm_|\.onnx$|model\.json$/.test(u))).toEqual([]);
      sameOrigin(page, seen.requests);
      expect(seen.problems.filter((p) => p.startsWith('page error'))).toEqual([]);
      await context.close();
    } finally {
      await browser.close();
    }
  });

  test('a fullscreen exit aborts the calibration block and the validation block; both run again', async ({ page }) => {
    const seen = watch(page);
    await page.goto('./?e2e=1&speed=4&preset=quick&engines=geometric&seed=31#/calibrate');
    const start = page.getByRole('button', { name: t('calibrate.start') });
    await expect(start).toBeEnabled({ timeout: 120_000 });
    // Nothing to abort before a block runs.
    expect(await page.evaluate(() => (window.__eek as unknown as { simulateFullscreenExit(): boolean }).simulateFullscreenExit())).toBe(false);

    // Calibration: abort on the first target.
    await start.click();
    const running = await untilItemOnScreen(page, 'calibrate');
    expect(running.mode).toBe('viewport');
    expect(await page.evaluate(() => (window.__eek as unknown as { simulateFullscreenExit(): boolean }).simulateFullscreenExit())).toBe(true);
    await expect.poll(async () => (await protocol(page))?.phase).toBe('stopped');
    const calibrationStopped = `${t('calibrate.invalid.fullscreen-exit')} ${t('calibrate.invalid.after')}`;
    expect((await protocol(page))!.message).toBe(calibrationStopped);
    await expect(page.getByRole('alert')).toHaveText(calibrationStopped);
    await expect(page.locator('.stimulus-stage')).toHaveCount(0);
    expect(await route(page)).toBe('calibrate');
    const afterAbort = await appState(page);
    expect(afterAbort.calibration).toBeNull();
    expect(afterAbort.fit).toBeNull();

    // Started again, calibration completes and validation follows on the same stage.
    const again = page.getByRole('button', { name: t('calibrate.startAgain') });
    await expect(again).toBeEnabled({ timeout: 30_000 });
    await again.click();
    const validating = await untilItemOnScreen(page, 'validate');
    expect(await route(page)).toBe('validate');
    expect(validating.mode).toBe('viewport');
    expect((await appState(page)).calibration).not.toBeNull();

    // Validation: abort on its first target.
    expect(await page.evaluate(() => (window.__eek as unknown as { simulateFullscreenExit(): boolean }).simulateFullscreenExit())).toBe(true);
    await expect.poll(async () => (await protocol(page))?.phase).toBe('stopped');
    const validationStopped = t('validate.invalid', { reason: t('invalid.fullscreen-exit') });
    expect((await protocol(page))!.message).toBe(validationStopped);
    await expect(page.getByRole('alert')).toHaveText(validationStopped);
    await expect(page.locator('.stimulus-stage')).toHaveCount(0);
    expect((await appState(page)).validation).toBeNull();

    // Validation started again completes, and the results follow.
    const startValidation = page.getByRole('button', { name: t('validate.start') });
    await expect(startValidation).toBeEnabled();
    await startValidation.click();
    await drive(page, async () => (await route(page)) === 'results', 120_000);
    const done = await appState(page);
    expect(done.fit?.fits.geometric).toBeDefined();
    expect(done.validation!.length).toBeGreaterThan(0);

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
    await page.goto('./?e2e=1&engines=all#/calibrate');
    const engines = page.getByRole('list', { name: t('calibrate.engines') }).getByRole('listitem');
    await expect(engines).toHaveCount(4, { timeout: 120_000 });
    expect(served).toBeGreaterThan(0);
    const lines = await engines.allTextContents();
    expect(lines).toEqual([
      t('calibrate.engine.ok', { name: 'BlazeGaze' }),
      expect.stringMatching(/^Peekr: unavailable \(peekr-model: the file does not match its manifest hash .*\)$/),
      t('calibrate.engine.ok', { name: 'Geometric' }),
      t('calibrate.engine.ok', { name: 'Eye-pixel (WebGazer method)' }),
    ]);
    // The others run: a face is found and calibration can start.
    await expect(page.getByRole('button', { name: t('calibrate.start') })).toBeEnabled({ timeout: 60_000 });
    expect(seen.problems.filter((p) => p.startsWith('page error'))).toEqual([]);
    sameOrigin(page, seen.requests);
  });

  test('a crashed vision worker restarts with its engines, in the lab and during a calibration', async ({ page }) => {
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

    // A calibration: the worker crashes on a target; the block survives it and completes.
    await page.goto('./?e2e=1&speed=4&preset=quick&engines=geometric,eyepixel&seed=57#/calibrate');
    const start = page.getByRole('button', { name: t('calibrate.start') });
    await expect(start).toBeEnabled({ timeout: 120_000 });
    await start.click();
    await untilItemOnScreen(page, 'calibrate');
    const crashMs = await page.evaluate(() => performance.now());
    expect(await crashWorker(page)).toBe(1);
    const cards = await drive(page, async () => (await route(page)) === 'results', 180_000);
    expect(cards).toContain(t('protocol.instr.validation.title'));
    const state = await appState(page);
    expect(state.fit?.fits.geometric).toBeDefined();
    // Frames captured after the crash were processed (by the restarted worker) and recorded with a face.
    expect(state.calibration!.frames.some((f) => f.meta.tCaptureMs > crashMs + 1000 && f.yawDeg !== null)).toBe(true);

    sameOrigin(page, seen.requests);
    expect(seen.problems).toEqual([]);
  });
});
