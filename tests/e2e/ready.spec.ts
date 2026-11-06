// ready.spec.ts (spec §17.4, §17.5, §17.12): the Title and Get ready. The Title renders and its
// set-up chooser works by keyboard; Play opens the camera and Get ready, where the cue and the
// status row follow the fake camera and Start warm-up (or Start anyway) becomes available within
// the speed-divided time; the face model's download is reported from its start in a fresh
// context. A refused camera on the Title is a failure path, in failures.spec.ts.
import { expect, test, type Page } from '@playwright/test';
import { t } from '../../src/app/strings.en-GB.ts';

interface GuardSnapshot {
  screen: string;
  state: string | null;
  condition: string | null;
  headline: string | null;
  status: { distance: string; position: string; light: string } | null;
  ready: boolean;
  enginesLoaded: boolean;
  probed: boolean;
  action: 'start' | 'anyway' | 'disabled' | 'larger';
  warmup: 'full' | 'restore';
  forced: string | null;
  layout: { mode: string; oval: { cx: number; cy: number; rx: number; ry: number } } | null;
}

interface LoadState {
  assets: Record<string, { loaded: number; total: number }>;
  events: number;
  firstEventMs: number | null;
  hostReady: boolean;
  hostError: string | null;
}

const route = (page: Page) => page.evaluate(() => window.__eek!.route());
// The hooks arrive with the screen's module: until then these read null.
const guard = (page: Page) => page.evaluate(() => (window.__eek!.guard as (() => GuardSnapshot | null) | undefined)?.() ?? null);
const loading = (page: Page) => page.evaluate(() => (window.__eek!.loading as (() => LoadState) | undefined)?.() ?? null);
const appState = (page: Page) => page.evaluate(() => window.__eek!.state() as { settings: { setup: string | null }; runSet: string[] | null });

function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
  });
  return problems;
}

test.describe('Title and Get ready', () => {
  test.describe.configure({ timeout: 120_000 });

  test('the Title shows the game, the level map and the chooser, which works by keyboard', async ({ page }) => {
    const problems = watch(page);
    await page.goto('./?e2e=1');
    await expect(page.getByRole('heading', { level: 1, name: t('title.name') })).toBeVisible();
    await expect(page.getByText(t('title.pitch'))).toBeVisible();
    const map = page.getByRole('list', { name: t('title.map.label') });
    await expect(map.getByRole('listitem')).toHaveText(['Pop', 'Follow', 'Turn', 'Test', 'Challenge (locked)']);
    await expect(page.getByText(t('title.meta.standard'), { exact: true })).toBeVisible();
    await expect(page.getByText(t('title.meta.local'), { exact: true })).toBeVisible();
    // First run: no stored warm-up, so no "Skip warm-up".
    await expect(page.getByRole('button', { name: t('title.skip') })).toBeHidden();

    const group = page.getByRole('radiogroup', { name: t('title.chooser.label') });
    const propped = group.getByRole('radio', { name: t('title.chooser.propped.name') });
    const inHand = group.getByRole('radio', { name: t('title.chooser.inHand.name') });
    const webcam = group.getByRole('radio', { name: t('title.chooser.webcam.name') });
    // A desktop starts on Webcam; only the chosen tile is in the tab order.
    await expect(webcam).toHaveAttribute('aria-checked', 'true');
    await expect(propped).toHaveAttribute('tabindex', '-1');
    await webcam.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(inHand).toBeFocused();
    await expect(inHand).toHaveAttribute('aria-checked', 'true');
    await expect(webcam).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('ArrowLeft');
    await expect(propped).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(webcam).toBeFocused();
    await page.keyboard.press('Home');
    await expect(propped).toHaveAttribute('aria-checked', 'true');
    expect((await appState(page)).settings.setup).toBe('propped');
    await page.keyboard.press('End');
    await expect(webcam).toHaveAttribute('aria-checked', 'true');
    expect((await appState(page)).settings.setup).toBe('webcam');
    // Tab leaves the group in one step, to Play.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: t('title.play') })).toBeFocused();
    expect(problems).toEqual([]);
  });

  test('the warm-up length changes the map and the time', async ({ page }) => {
    await page.goto('./?e2e=1&preset=thorough');
    await expect(page.getByRole('list', { name: t('title.map.label') }).getByRole('listitem')).toHaveText(['Pop', 'Follow', 'Turn', 'Lean in', 'Test', 'Challenge (locked)']);
    await expect(page.getByText(t('title.meta.thorough'), { exact: true })).toBeVisible();
    await page.goto('./?e2e=1&preset=quick');
    await expect(page.getByRole('list', { name: t('title.map.label') }).getByRole('listitem')).toHaveText(['Pop', 'Test', 'Challenge (locked)']);
    await expect(page.getByText(t('title.meta.quick'), { exact: true })).toBeVisible();
  });

  test('the face model download is reported from its start, before Play (fresh context)', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, permissions: ['camera'] });
    try {
      const page = await context.newPage();
      const problems = watch(page);
      await page.goto('./?e2e=1');
      await expect.poll(async () => (await loading(page))?.hostReady, { timeout: 60_000 }).toBe(true);
      const s = (await loading(page))!;
      expect(s.events).toBeGreaterThan(0);
      expect(s.firstEventMs).not.toBeNull();
      const face = s.assets['face-landmarker']!;
      expect(face.total).toBeGreaterThan(1_000_000);
      expect(face.loaded).toBe(face.total);
      // No camera was asked for: the Title only loads the model.
      await expect(page.locator('video')).toHaveCount(0);
      expect(problems).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('Play opens the camera and Get ready; the cue and status row follow it; Start warm-up or Start anyway arrives', async ({ page }) => {
    const problems = watch(page);
    await page.goto('./?e2e=1&speed=4&engines=geometric,eyepixel&seed=31');
    await page.getByRole('button', { name: t('title.play') }).click();
    await expect.poll(() => route(page)).toBe('ready');
    await expect(page.locator('.ready-video')).toHaveCount(1);
    await expect(page.locator('.camera-source')).toHaveCount(1);
    const cue = page.locator('.cue__title');
    await expect(cue).toHaveAttribute('role', 'status');
    await expect(cue).not.toBeEmpty();
    const row = page.getByRole('group', { name: t('guard.status.label') });
    await expect(row.getByRole('img')).toHaveCount(3);
    await expect(row.getByRole('img').first()).toHaveAttribute('aria-label', /^Distance: (good|adjust)$/);
    // The fake camera's face is found and judged: the guard leaves loading and searching.
    await expect.poll(async () => (await guard(page))?.state, { timeout: 30_000 }).toMatch(/^(adjust|holding|ready)$/);
    // Within 20 s ÷ 4 of seeing a face (plus the probe), one of the two actions is offered.
    await expect.poll(async () => (await guard(page))?.action, { timeout: 60_000 }).toMatch(/^(start|anyway)$/);
    const g = (await guard(page))!;
    expect(g.enginesLoaded).toBe(true);
    expect(g.probed).toBe(true);
    expect((await appState(page)).runSet).toEqual(expect.arrayContaining(['geometric']));
    const action = page.locator('.ready-start');
    await expect(action).toBeEnabled();
    await expect(action).toHaveText(g.action === 'start' ? t('ready.start') : t('ready.anyway'));
    if (g.action === 'anyway') await expect(page.getByText(t('ready.anywayNote'))).toBeVisible();
    // The tap starts the presentation span and the warm-up levels.
    await action.click();
    await expect.poll(() => route(page)).toBe('warmup');
    expect(problems).toEqual([]);
  });

  test('Skip warm-up asks for a stored warm-up that matches the camera, else warms up in full', async ({ page }) => {
    await page.goto('./?e2e=1&engines=geometric&fixture=title-skip');
    await page.getByRole('button', { name: t('title.skip') }).click();
    await expect.poll(() => route(page)).toBe('ready');
    // Nothing is stored in this context, so the camera cannot match.
    await expect(page.getByText(t('ready.mismatch'))).toBeVisible();
    expect((await guard(page))?.warmup).toBe('full');
  });

  test('the forced layout states draw the oval, cue and actions of each state', async ({ page }) => {
    for (const [fixture, state, action] of [
      ['ready-searching', 'searching', 'disabled'],
      ['ready-adjust', 'adjust', 'disabled'],
      ['ready-ready', 'ready', 'start'],
      ['ready-anyway', 'adjust', 'anyway'],
    ] as const) {
      await page.goto(`./?e2e=1&fixture=${fixture}#/ready`);
      await expect.poll(async () => (await guard(page))?.state).toBe(state);
      expect((await guard(page))?.action).toBe(action);
    }
    await expect(page.locator('.guide__badge')).toBeHidden();
    await page.goto('./?e2e=1&fixture=ready-ready#/ready');
    await expect(page.locator('.cue__title')).toHaveText(t('guard.cue.ready'));
    await expect(page.locator('.guide__badge')).toBeVisible();
    await page.goto('./?e2e=1&fixture=guard-overlay-late#/ready');
    const dialog = page.getByRole('alertdialog', { name: t('guard.pause.lookBack') });
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    await expect(dialog.getByRole('button', { name: t('guard.pause.warmUp') })).toBeVisible();
    await expect(dialog.getByText(t('guard.pause.byItself'))).toBeVisible();
  });
});
