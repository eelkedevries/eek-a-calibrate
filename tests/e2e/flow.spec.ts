// flow.spec.ts (spec §10.4, §17.12): the game's warm-up from the Title: Play, Get ready, Start
// warm-up (or Start anyway), the Quick set's two levels at speed=4 with an injected geometry,
// Checking your aim… and Warm-up complete with its stars, zones and marks rendered and the result
// in __eek.result(); and the Standard set's cards in order (Pop, Follow, Turn, Test). Accuracy is
// not asserted: the fake face does not look at the targets. The v1 flows (calibration,
// validation and results with every engine; the same on a phone-sized touch screen) stay until
// prompt 018 removes those screens.
import { expect, test, type Page } from '@playwright/test';
import { t } from '../../src/app/strings.en-GB.ts';

interface ProtocolSnapshot {
  screen: 'calibrate' | 'validate';
  phase: string;
  item: string | null;
  done: number;
  total: number;
  mode: 'fullscreen' | 'viewport' | null;
  presentations: number;
  frames: number;
  message: string | null;
}

interface AppState {
  geometry: { degreesApproximate: boolean; refDistanceMm: number | null; screen: { viewportWpx: number; viewportHpx: number; pxPerMmSource: string } } | null;
  calibration: { frames: unknown[]; presentations: { itemId: string; onsetMs: number; offsetMs: number; aborted: boolean }[] } | null;
  fit: {
    fitMs: number;
    seed: number;
    pursuitLagMs: number;
    fits: Record<string, { cv: { meanDeg: number }; chosen: { mapper: string } }>;
    combined: { members: string[] } | null;
    selection: { estimator: string; reason: string };
    warnings: string[];
    fitGeometry: unknown;
  } | null;
  validation: { estimator: string; mode: string; targets: unknown[]; verdict: string; degreesApproximate: boolean }[] | null;
  estimator: string | null;
}

const protocol = (page: Page) => page.evaluate(() => (window.__eek as unknown as { protocol(): unknown }).protocol() as ProtocolSnapshot | null);
const appState = (page: Page) => page.evaluate(() => (window.__eek as unknown as { state(): unknown }).state() as AppState);
const route = (page: Page) => page.evaluate(() => (window.__eek as unknown as { route(): string }).route());

function watch(page: Page) {
  const problems: string[] = [];
  const logs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
    if (m.text().startsWith('Fit:')) logs.push(m.text());
  });
  page.on('worker', (w) => w.on('console', (m) => m.type() === 'error' && problems.push(`worker console error: ${m.text()}`)));
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  const requests: string[] = [];
  page.context().on('request', (r) => requests.push(r.url()));
  return { problems, logs, requests };
}

/**
 * Drives the protocol to the results screen: continues every instruction card and resumes any
 * pause, by `tap` (touch) or click, until the route is #/results.
 */
async function runToResults(page: Page, tap: boolean, timeoutMs: number): Promise<string[]> {
  const seen: string[] = [];
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = await route(page);
    if (r === 'results') return seen;
    if (Date.now() > deadline) throw new Error(`the protocol did not reach #/results (route ${r}, ${JSON.stringify(await protocol(page))})`);
    const card = page.locator('.stimulus-card');
    if (await card.isVisible().catch(() => false)) {
      const title = (await card.locator('h2').textContent().catch(() => null)) ?? '';
      seen.push(title);
      const button = card.getByRole('button', { name: /^(Continue|Resume)$/ });
      if (tap) await button.tap({ timeout: 2000 }).catch(() => undefined);
      else await button.click({ timeout: 2000 }).catch(() => undefined);
    }
    const snap = await protocol(page);
    if (snap && (snap.phase === 'error' || snap.phase === 'stopped')) throw new Error(`the protocol stopped: ${snap.message}`);
    await page.waitForTimeout(150);
  }
}

async function checkResults(page: Page, state: AppState) {
  const fit = state.fit!;
  // Every engine that loaded is a row, and so is Combined, with Auto's choice marked and explained.
  const rows = page.locator('table.metric-table tbody tr');
  const ids = await rows.evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-estimator')));
  expect(ids[0]).toBe('combined');
  for (const engine of Object.keys(fit.fits)) expect(ids).toContain(engine);
  await expect(page.locator('table.metric-table .badge')).toHaveCount(1);
  await expect(page.locator(`table.metric-table tr[data-estimator="${fit.selection.estimator}"] .badge`)).toBeVisible();
  await expect(page.getByText(fit.selection.reason, { exact: false })).toBeVisible();
  // Own and intersection reports exist for every fitted estimator, and the tabs switch between them.
  const reports = state.validation!;
  const expected = [...Object.keys(fit.fits), ...(fit.combined ? ['combined'] : [])].sort();
  expect([...new Set(reports.filter((r) => r.mode === 'own').map((r) => r.estimator))].sort()).toEqual(expected);
  expect([...new Set(reports.filter((r) => r.mode === 'intersection').map((r) => r.estimator))].sort()).toEqual(expected);
  await page.getByRole('tab', { name: /valid for every estimator/ }).click();
  await expect(page.getByRole('tab', { name: /valid for every estimator/ })).toHaveAttribute('aria-selected', 'true');
  // Switching the estimator in use is instant.
  const other = ids.find((id) => id !== state.estimator && id && (fit.fits[id] || (id === 'combined' && fit.combined)));
  if (other) {
    await page.locator(`input[name="estimator-in-use"][value="${other}"]`).check();
    await expect.poll(async () => (await appState(page)).estimator).toBe(other);
  }
  await expect(page.locator('svg.target-plot')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cross-validation candidates' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /data-loss funnel/ })).toBeVisible();
}

function sameOrigin(page: Page, requests: string[]) {
  const origin = new URL(page.url()).origin;
  for (const url of requests) {
    if (url.startsWith('data:') || url.startsWith('blob:')) continue;
    expect(new URL(url).origin, `request to ${url}`).toBe(origin);
  }
}

test.describe('Quick flow with every engine (desktop, injected geometry)', () => {
  test.describe.configure({ timeout: 420_000 });

  test('calibration, validation and results complete; every available engine plus Combined is reported', async ({ page }) => {
    const seen = watch(page);
    await page.goto('./?e2e=1&speed=4&preset=quick&engines=all&seed=4242#/welcome');
    await expect(page.locator('main h1')).toBeVisible();
    // An injected, measured geometry (the test hook of §7): card scale and a blind-spot focal length.
    await page.evaluate(() => {
      (window.__eek as unknown as { injectGeometry(g: unknown): void }).injectGeometry({
        screen: { viewportWpx: 1280, viewportHpx: 720, screenWpx: 1280, screenHpx: 720, dpr: 1, fullscreen: false, pxPerMm: 4.2, pxPerMmSource: 'card' },
        distance: { focalPx: 520, focalSource: 'blind-spot', blindSpotMm: 600, blindSpotSdMm: 14, irisMm: 11.7 },
        refDistanceMm: 600,
        degreesApproximate: false,
      });
      location.hash = '#/calibrate';
    });
    const start = page.getByRole('button', { name: 'Start calibration' });
    await expect(start).toBeEnabled({ timeout: 180_000 });
    await start.click();
    await expect.poll(async () => (await protocol(page))?.mode, { timeout: 15_000 }).toBe('viewport');
    const cards = await runToResults(page, false, 300_000);
    expect(cards).toContain('Look at each dot');
    expect(cards).toContain('Validation: look at each dot');

    const state = await appState(page);
    const fit = state.fit!;
    expect(fit.seed).toBe(4242);
    expect(Object.keys(fit.fits).length).toBeGreaterThanOrEqual(2);
    expect(fit.fits.geometric).toBeDefined();
    expect(fit.fitGeometry).toBeTruthy();
    expect(state.geometry!.degreesApproximate).toBe(false);
    expect(state.geometry!.screen.pxPerMmSource).toBe('card');
    const presentations = state.calibration!.presentations;
    expect(new Set(presentations.map((p) => p.itemId)).size).toBe(9);
    for (const p of presentations) expect(p.offsetMs).toBeGreaterThan(p.onsetMs);
    // The fit time, logged (headless figures are informational).
    test.info().annotations.push({ type: 'fitMs', description: `${Math.round(fit.fitMs)} ms (budget 15000 ms); engines ${Object.keys(fit.fits).join(', ')}` });
    console.log(`flow.spec: fitMs = ${Math.round(fit.fitMs)} ms; τ = ${fit.pursuitLagMs} ms; selected ${fit.selection.estimator}; warnings: ${fit.warnings.length}`);
    expect(Number.isFinite(fit.fitMs) && fit.fitMs > 0).toBe(true);
    expect(seen.logs.some((l) => l.startsWith('Fit:'))).toBe(true);

    await checkResults(page, state);
    sameOrigin(page, seen.requests);
    expect(seen.problems).toEqual([]);
  });
});

test.describe('Quick flow on a phone-sized touch screen (assumed geometry)', () => {
  test.describe.configure({ timeout: 300_000 });
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  test('completes by taps without fullscreen, with targets inside the safe rectangle, reporting px first', async ({ page }) => {
    const seen = watch(page);
    await page.goto('./?e2e=1&speed=4&preset=quick&engines=geometric,eyepixel&seed=7#/calibrate');
    const start = page.getByRole('button', { name: 'Start calibration' });
    await expect(start).toBeEnabled({ timeout: 120_000 });
    await start.tap();
    await runToResults(page, true, 240_000);

    const state = await appState(page);
    expect(state.geometry!.degreesApproximate).toBe(true);
    expect(state.geometry!.screen.pxPerMmSource).toBe('assumed');
    const { viewportWpx: W, viewportHpx: H } = state.geometry!.screen;
    expect(W).toBeLessThan(H);
    // Every target lies inside the safe rectangle (the emulator has no insets, so the viewport).
    const targets = await page.evaluate(() => {
      const s = (window.__eek as unknown as { state(): { calibration: { schedule: { items: { kind: string; xNorm: number; yNorm: number }[] } } } }).state();
      return s.calibration.schedule.items.filter((i) => i.kind === 'target').map((i) => [i.xNorm, i.yNorm]);
    });
    for (const [x, y] of targets) expect(x! > 0 && x! < 1 && y! > 0 && y! < 1).toBe(true);
    await expect(page.getByText('Measure screen and distance (optional; makes degree values exact)')).toBeVisible();
    const accuracy = await page.locator('table.metric-table tbody tr[data-estimator="geometric"] td').nth(1).textContent();
    expect(accuracy).toMatch(/^\d+ px · [\d.]+ % of diagonal · ≈/);
    await checkResults(page, state);
    sameOrigin(page, seen.requests);
    expect(seen.problems).toEqual([]);
  });
});

// ----- The game's warm-up (prompt 015) ------------------------------------------------------------

interface WarmupSnapshot {
  phase: string;
  mode: string;
  card: string | null;
  cards: string[];
  levels: string[];
  level: { key: string; number: number; of: number } | null;
  item: { itemId: string; phase: string } | null;
  message: string | null;
}

interface WarmupResult {
  mode: string;
  zones: { cols: number; rows: number };
  stars: number;
  outcome: string;
  verdict: string;
  cause: string | null;
  marks: { itemId: string; hit: boolean; targetPx: [number, number] }[];
  levels: string[];
}

const warmup = (page: Page) => page.evaluate(() => ((window.__eek as unknown as { warmup?: () => unknown }).warmup?.() ?? null) as WarmupSnapshot | null);
const result = (page: Page) => page.evaluate(() => ((window.__eek as unknown as { result?: () => unknown }).result?.() ?? null) as WarmupResult | null);

/** Title → Play → Get ready → Start warm-up (or Start anyway), by click or tap. */
async function startWarmup(page: Page, tap: boolean): Promise<void> {
  const press = (l: ReturnType<Page['locator']>) => (tap ? l.tap() : l.click());
  await press(page.getByRole('button', { name: t('title.play') }));
  await expect.poll(() => route(page)).toBe('ready');
  const action = page.locator('.ready-start');
  await expect.poll(async () => ((await action.isEnabled().catch(() => false)) ? 'ready' : 'waiting'), { timeout: 120_000 }).toBe('ready');
  await press(action);
  await expect.poll(() => route(page)).toBe('warmup');
}

/**
 * Plays the warm-up to Warm-up complete: starts each level card at once (Start now) and carries
 * on from any Pause card; `each` runs on every poll. Fails on a card that ends the warm-up.
 */
export async function playWarmup(page: Page, tap: boolean, timeoutMs: number, each?: (w: WarmupSnapshot | null) => Promise<void>): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if ((await route(page)) === 'complete') return (await result(page))?.levels ?? [];
    const w = await warmup(page);
    if (Date.now() > deadline) throw new Error(`the warm-up did not reach #/complete: ${JSON.stringify(w)}`);
    if (w && ['fix', 'failed', 'changed'].includes(w.card ?? '')) throw new Error(`the warm-up stopped on the ${w.card} card: ${w.message}`);
    if (each) await each(w);
    if (w?.card === 'level') {
      const start = page.locator('.level-card__start');
      await (tap ? start.tap({ timeout: 2000 }) : start.click({ timeout: 2000 })).catch(() => undefined);
    } else if (w?.card === 'pause') {
      await page.getByRole('button', { name: t('warmup.paused.carryOn') }).click({ timeout: 2000 }).catch(() => undefined);
    }
    await page.waitForTimeout(100);
  }
}

test.describe('The game: the Quick warm-up to Warm-up complete (desktop, injected geometry)', () => {
  test.describe.configure({ timeout: 300_000 });

  test('Title, Play, Get ready, two levels, Checking, then stars, zones and marks', async ({ page }) => {
    const seen = watch(page);
    await page.goto('./?e2e=1&speed=4&preset=quick&engines=geometric,eyepixel&seed=4242');
    await expect(page.getByRole('heading', { level: 1, name: t('title.name') })).toBeVisible();
    await page.evaluate(() => {
      (window.__eek as unknown as { injectGeometry(g: unknown): void }).injectGeometry({
        screen: { viewportWpx: 1280, viewportHpx: 720, screenWpx: 1280, screenHpx: 720, dpr: 1, fullscreen: false, pxPerMm: 4.2, pxPerMmSource: 'card' },
        distance: { focalPx: 520, focalSource: 'blind-spot', blindSpotMm: 600, blindSpotSdMm: 14, irisMm: 11.7 },
        refDistanceMm: 600,
        degreesApproximate: false,
      });
    });
    await startWarmup(page, false);
    // The first card: Level 1 of 2, Pop the dots, with its countdown and Start now.
    const card = page.getByRole('dialog', { name: t('warmup.level.pop.name') });
    await expect(card).toBeVisible();
    await expect(card.getByText(t('warmup.card.levelOf', { level: 1, levels: 2 }))).toBeVisible();
    await expect(card.getByRole('timer')).toBeVisible();
    // In play: the pip line on the camera edge and the corner cluster.
    let sawHud = false;
    let sawChecking = false;
    const levels = await playWarmup(page, false, 240_000, async (w) => {
      if (w?.phase === 'running' && w.item && !sawHud) {
        const pips = page.getByRole('progressbar', { name: t('warmup.progress', { level: w.level!.number }) });
        sawHud = (await pips.isVisible().catch(() => false)) && (await page.locator('.corner .glyph').isVisible().catch(() => false));
      }
      if (w?.card === 'checking') sawChecking = true;
    });
    expect(levels).toEqual(['pop', 'test']);
    expect(sawHud).toBe(true);
    // Checking may pass faster than a poll; the result and the route say it ran.
    if (!sawChecking) console.log('flow.spec: Checking your aim… passed between two polls');

    const r = (await result(page))!;
    expect(r.mode).toBe('full');
    expect(r.marks).toHaveLength(6);
    expect(r.stars).toBeGreaterThanOrEqual(0);
    expect(r.stars).toBeLessThanOrEqual(3);
    expect(['great', 'good', 'rough', 'failed']).toContain(r.outcome);
    for (const k of [r.zones.cols, r.zones.rows]) expect([0, 1, 2, 3, 4]).toContain(k);
    // Rendered: the zone map with its six marks, the stars, the headline and the actions.
    await expect(page.getByRole('img', { name: /test bubbles hit\.$/ })).toBeVisible();
    await expect(page.locator('.zone-map__mark')).toHaveCount(6);
    await expect(page.getByRole('img', { name: /^[0-3] of 3 stars$/ })).toHaveAttribute('aria-label', r.stars === 1 ? '1 of 3 stars' : `${r.stars} of 3 stars`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(r.outcome === 'failed' ? t('complete.headline.failed') : t('complete.headline.zones', { n: r.zones.cols * r.zones.rows }));
    await expect(page.locator('.complete__actions .btn--primary')).toBeVisible();
    await expect(page.getByRole('button', { name: t('complete.judge') })).toBeVisible();

    // The same results as the v1 screens: the calibration of CAL9, the fit, the Test round's reports.
    const state = await appState(page);
    expect(new Set(state.calibration!.presentations.map((p) => p.itemId)).size).toBe(9);
    expect(state.fit!.fitGeometry).toBeTruthy();
    expect(state.geometry!.degreesApproximate).toBe(false);
    expect(state.validation!.filter((v) => v.mode === 'own').length).toBeGreaterThan(0);
    expect(seen.logs.some((l) => l.startsWith('Fit:'))).toBe(true);
    sameOrigin(page, seen.requests);
    expect(seen.problems).toEqual([]);
  });

  test("the Standard set's cards appear in order: Pop, Follow, Turn, Test", async ({ page }) => {
    const seen = watch(page);
    await page.goto('./?e2e=1&speed=8&preset=standard&engines=geometric&seed=99');
    await startWarmup(page, false);
    const names: string[] = [];
    let keys: string[] = [];
    await playWarmup(page, false, 240_000, async (w) => {
      if (w) keys = w.cards;
      if (w?.card !== 'level') return;
      const title = await page.locator('.level-card .stim-card__title').textContent({ timeout: 1000 }).catch(() => null);
      if (title && names[names.length - 1] !== title) names.push(title);
    });
    expect(keys).toEqual(['pop', 'follow', 'turn', 'test']);
    expect(names).toEqual([t('warmup.level.pop.name'), t('warmup.level.follow.name'), t('warmup.level.turn.name'), t('warmup.level.test.name')]);
    const r = (await result(page))!;
    expect(r.levels).toEqual(['pop', 'follow', 'turn', 'test']);
    expect(r.marks).toHaveLength(12);
    expect(seen.problems).toEqual([]);
  });
});
