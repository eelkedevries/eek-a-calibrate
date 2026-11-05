// details.spec.ts (prompt 017; design §2.17, spec §17.2.1, §17.10.3): the Details sheet opens
// from the top bar and from its deep link without changing the route, moves between tabs and
// pages by keyboard, traps and returns the focus, closes on Esc and Done; a setting persists in
// IndexedDB version 2 across a reload and takes effect at once; the Data tab exports a zip; the
// Results tab shows a card per estimator whose switch changes the estimator in use; delete all
// sits behind its confirmation and clears every store; Measure and Diagnostics return to the
// sheet; the Methods page never scrolls sideways.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { onTab, playQuickFlow, sheet } from './helpers/details.ts';

function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  return problems;
}

const route = (page: Page) => page.evaluate(() => window.__eek!.route());
/** Moves within the page (the session's results live in memory, so no reload). */
const go = (page: Page, hash: string) => page.evaluate((h) => (location.hash = h), hash);
const appState = (page: Page) => page.evaluate(() => window.__eek!.state() as { prefs: Record<string, unknown>; settings: { preset: string; engines: unknown }; estimator: string | null; fit: { selection: { estimator: string } } | null });

/** The database as stored: its version, stores and the prefs record (null when there is no database). */
const database = (page: Page) =>
  page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((d) => d.name);
    if (!names.includes('eek-a-calibrate')) return null;
    return new Promise<{ version: number; stores: string[]; prefs: unknown }>((resolve, reject) => {
      const open = indexedDB.open('eek-a-calibrate');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const stores = [...db.objectStoreNames];
        if (!stores.includes('prefs')) {
          db.close();
          resolve({ version: db.version, stores, prefs: null });
          return;
        }
        const get = db.transaction('prefs').objectStore('prefs').get('prefs');
        get.onsuccess = () => {
          db.close();
          resolve({ version: db.version, stores, prefs: (get.result as { prefs: unknown } | undefined)?.prefs ?? null });
        };
      };
    });
  });

test('opens from the top bar and the deep link, by keyboard, and closes on Esc and Done', async ({ page }) => {
  const problems = watch(page);
  // Warm-up complete needs a scored Test round (prompt 015): its fixture shows one, without a fit.
  await page.goto('./?e2e=1&fixture=complete-good#/complete');
  const trigger = page.getByRole('button', { name: 'Details' });
  await trigger.click();
  let s = await onTab(page, 'results');
  expect(await route(page)).toBe('complete');
  // Without a result: the first page says so, and "How we judge this" is there.
  expect(s.pageIds[0]).toBe('none');
  expect(s.pageIds).toContain('judge');

  // Tabs by arrow key; then into the panel and the pager by Tab, pages by Enter.
  await expect(page.getByRole('tab', { name: 'Results' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  s = await onTab(page, 'settings');
  expect(s.pageId).toBe('warmup');
  const next = page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await sheet(page)).page).toBe(1);
  await expect(next).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await sheet(page)).page).toBe(0);

  // Focus stays in the sheet.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog.sheet')))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await sheet(page)).open).toBe(false);
  await expect(trigger).toBeFocused();
  // The top bar's button opens on its own tab again.
  await trigger.click();
  await onTab(page, 'results');
  await page.getByRole('dialog', { name: 'Details' }).getByRole('button', { name: 'Done' }).click();
  await expect.poll(async () => (await sheet(page)).open).toBe(false);
  await expect(trigger).toBeFocused();

  // The deep link names a tab and, optionally, a page: "Rule of thumb · How we judge this".
  await page.goto('./?e2e=1#/details/results?page=judge');
  s = await onTab(page, 'results');
  expect(s.pageId).toBe('judge');
  await expect(page.getByRole('tabpanel')).toContainText('How we judge this');
  await expect(page.getByRole('tabpanel')).toContainText('heuristic');
  expect(await route(page)).toBe('details');
  expect(problems).toEqual([]);
});

test('a setting takes effect at once and persists in IndexedDB version 2; delete all clears it', async ({ page }) => {
  const problems = watch(page);
  await page.goto('./?e2e=1#/details/settings?page=look');
  await onTab(page, 'settings');
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? 'dark')).toBe('dark');
  await page.getByRole('radio', { name: 'Light' }).check();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await page.getByRole('switch', { name: 'Expert mode' }).click();
  await expect(page.getByRole('switch', { name: 'Expert mode' })).toHaveAttribute('aria-checked', 'true');

  await page.goto('./?e2e=1#/details/settings?page=warmup');
  await onTab(page, 'settings');
  await page.getByRole('radio', { name: 'Quick' }).check();
  await expect.poll(async () => (await appState(page)).settings.preset).toBe('quick');
  await expect.poll(async () => ((await database(page))?.prefs as { warmup?: string } | null)?.warmup).toBe('quick');
  const db = (await database(page))!;
  expect(db.version).toBe(2);
  expect(db.stores.sort()).toEqual(['geometry', 'prefs', 'profiles', 'scores', 'sessions']);
  expect(db.prefs).toMatchObject({ theme: 'light', expert: true, warmup: 'quick' });

  // After a reload: the theme before the first screen, the warm-up length in the settings.
  await page.reload();
  await onTab(page, 'settings');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  const state = await appState(page);
  expect(state.settings.preset).toBe('quick');
  expect(state.prefs).toMatchObject({ theme: 'light', expert: true, warmup: 'quick', sound: true });
  await expect(page.getByRole('radio', { name: 'Quick' })).toBeChecked();
  // The address still wins for one visit.
  await page.goto('./?e2e=1&preset=thorough#/');
  await expect.poll(async () => (await appState(page)).settings.preset).toBe('thorough');

  // Delete all: behind its confirmation; every store is cleared and the defaults return.
  await page.goto('./?e2e=1#/details/about');
  await onTab(page, 'about');
  await page.getByRole('button', { name: 'Delete all my data' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete all your data?' });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  expect((await database(page))?.prefs).toMatchObject({ theme: 'light' });
  await page.getByRole('button', { name: 'Delete all my data' }).click();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('dialog.sheet [role="status"]').last()).toHaveText('All data that eek-a-calibrate stored on this device has been deleted.');
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? 'dark')).toBe('dark');
  expect((await appState(page)).prefs).toMatchObject({ theme: 'dark', expert: false, warmup: 'standard' });
  expect(await database(page)).toBeNull();
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? 'dark')).toBe('dark');
  expect(problems).toEqual([]);
});

test('Measure screen and distance and Diagnostics return to Details → Device', async ({ page }) => {
  const problems = watch(page);
  await page.goto('./?e2e=1#/details/device?page=measure');
  await onTab(page, 'device');
  await page.getByRole('button', { name: 'Measure screen and distance' }).click();
  await expect.poll(() => route(page)).toBe('screen');
  expect(new URL(page.url()).hash).toBe('#/screen?from=details');
  await expect(page.getByRole('heading', { level: 1, name: 'Screen size' })).toBeVisible();
  // The card's slider moves by arrow key.
  const slider = page.getByRole('slider', { name: 'Outline size' });
  const before = Number(await slider.inputValue());
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  expect(Number(await slider.inputValue())).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect.poll(() => route(page)).toBe('distance');
  await expect(page.getByRole('heading', { level: 1, name: 'Viewing distance' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/details/device');
  await onTab(page, 'device');

  await page.goto('./?e2e=1#/details/device?page=diagnostics');
  await onTab(page, 'device');
  await page.getByRole('button', { name: 'Open diagnostics' }).click();
  await expect.poll(() => route(page)).toBe('lab');
  await expect(page.locator('main h1')).toHaveText('Diagnostics');
  await page.getByRole('link', { name: 'Back' }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/details/device');
  await onTab(page, 'device');
  expect(problems).toEqual([]);
});

test('the Methods page is a document that never scrolls sideways, with a way back', async ({ page }) => {
  for (const viewport of [{ width: 360, height: 640 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('./?e2e=1#/methods');
    await expect(page.getByRole('heading', { level: 1, name: 'Methods' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Metrics' })).toBeVisible();
    const size = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    expect(size.sw).toBeLessThanOrEqual(size.iw);
  }
  await page.getByRole('link', { name: 'Back to the game' }).first().click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/details/about');
});

test.describe('with a scored Test round', () => {
  test.describe.configure({ timeout: 360_000 });

  test('one card per estimator with its switch, and the export downloads a zip', async ({ page }) => {
    const problems = watch(page);
    await playQuickFlow(page);
    const before = await appState(page);
    await go(page, '#/details/results');
    // The session survives the hash change; the deep link opens the sheet over the Title.
    const s = await onTab(page, 'results');
    expect(s.pageIds[0]).toBe('estimator-combined');
    for (const id of ['estimator-geometric', 'estimator-eyepixel', 'plot', 'judge', 'challenge', 'modes', 'funnel', 'cv', 'paired', 'aoi', 'fit', 'degrees']) expect(s.pageIds).toContain(id);

    // Auto's choice is marked; another estimator's switch puts it in use at once.
    const auto = before.fit!.selection.estimator;
    await go(page, `#/details/results?page=estimator-${auto}`);
    await onTab(page, 'results');
    await expect(page.getByRole('tabpanel')).toContainText('Auto’s choice');
    const other = auto === 'geometric' ? 'eyepixel' : 'geometric';
    await go(page, `#/details/results?page=estimator-${other}`);
    await onTab(page, 'results');
    const useThis = page.getByRole('switch', { name: 'Use this' });
    // On a short window the switch may sit on the card's second page.
    for (let i = 0; i < 3 && !(await useThis.isVisible()); i++) await page.getByRole('button', { name: 'Next page' }).click();
    await useThis.click();
    await expect.poll(async () => (await appState(page)).estimator).toBe(other);
    await expect(page.getByRole('switch', { name: 'Use this' })).toHaveAttribute('aria-checked', 'true');

    // The target plot draws the Test round.
    await go(page, '#/details/results?page=plot');
    await onTab(page, 'results');
    await expect(page.locator('dialog.sheet svg.target-plot')).toBeVisible();

    // Data → Export: a zip, with the per-frame features when asked.
    await go(page, '#/details/data?page=export');
    await onTab(page, 'data');
    await page.getByRole('checkbox', { name: /Include per-frame features/ }).check();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export zip' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^eek-a-calibrate_P01_S1_\d{8}-\d{4}\.zip$/);
    const bytes = readFileSync((await download.path())!);
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(bytes.includes(Buffer.from('dataset.json'))).toBe(true);
    await expect(page.getByRole('tabpanel')).toContainText(/Exported \d+ files\./);
    expect(problems).toEqual([]);
  });
});
