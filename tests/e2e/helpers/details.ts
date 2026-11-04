// Helpers for the Details sheet (design §2.17): its state through `window.__eek.sheet()`, walking
// every page of a tab, and playing the v1 Quick flow to get a scored Test round to show.
import { expect, type Page } from '@playwright/test';
import { expectNoScroll } from './noScroll.ts';

export interface SheetState {
  open: boolean;
  tab: string | null;
  page: number;
  pages: number;
  pageId: string | null;
  pageIds: string[];
  overflow: boolean;
}

export const TABS = ['results', 'settings', 'data', 'device', 'about'] as const;

export const sheet = (page: Page) => page.evaluate(() => (window.__eek!.sheet as () => SheetState)());

/** Waits until the sheet shows `tab` with its own pages (its module loaded). */
export async function onTab(page: Page, tab: string): Promise<SheetState> {
  await expect.poll(async () => {
    const s = await sheet(page);
    return s.open && s.tab === tab && s.pageId !== 'loading' ? 'ready' : JSON.stringify(s);
  }).toBe('ready');
  return sheet(page);
}

/**
 * Shows every page of the tab in turn with the pager's › button, checking on each that nothing
 * scrolls or lies past the viewport and that the page fits its panel. Returns the page ids seen.
 */
export async function walkTab(page: Page, tab: string, what: string): Promise<string[]> {
  await page.getByRole('tab', { name: new RegExp(`^${tab}$`, 'i') }).click();
  await onTab(page, tab);
  // The pages are cut again when a font arrives; start once they all have.
  await page.evaluate(() => document.fonts.ready);
  const seen: string[] = [];
  for (let step = 0; step < 100; step++) {
    // A page cut for the window before a resize is cut again within a frame or two.
    await expect.poll(async () => (await sheet(page)).overflow, { message: `${what}: ${tab} page ${(await sheet(page)).pageId} is clipped`, timeout: 2000 }).toBe(false);
    const s = await sheet(page);
    seen.push(s.pageId ?? '');
    await expectNoScroll(page, `${what}, ${tab} page ${s.page + 1} of ${s.pages} (${s.pageId})`);
    if (s.page >= s.pages - 1) break;
    await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
    await expect.poll(async () => (await sheet(page)).pageId).not.toBe(s.pageId);
  }
  return seen;
}

interface Snapshot {
  phase: string;
  message: string | null;
}

/**
 * Plays the v1 Quick calibration and validation on the fake camera to the v1 Results screen, so
 * that the session holds a fit and a scored Test round (the game's own warm-up arrives with
 * prompt 015). Continues every card and resumes any pause.
 */
export async function playQuickFlow(page: Page, timeoutMs = 240_000): Promise<void> {
  await page.goto('./?e2e=1&speed=4&preset=quick&engines=geometric,eyepixel&seed=17&pid=P01&session=S1#/calibrate');
  const start = page.getByRole('button', { name: 'Start calibration' });
  await expect(start).toBeEnabled({ timeout: 120_000 });
  await start.click();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const route = await page.evaluate(() => window.__eek!.route());
    if (route === 'results') break;
    if (Date.now() > deadline) throw new Error(`the Quick flow did not reach #/results (route ${route})`);
    const card = page.locator('.stimulus-card');
    if (await card.isVisible().catch(() => false)) {
      await card.getByRole('button', { name: /^(Continue|Resume)$/ }).click({ timeout: 2000 }).catch(() => undefined);
    }
    const snap = await page.evaluate(() => (window.__eek as unknown as { protocol(): Snapshot | null }).protocol());
    if (snap && (snap.phase === 'error' || snap.phase === 'stopped')) throw new Error(`the protocol stopped: ${snap.message}`);
    await page.waitForTimeout(150);
  }
  await expect.poll(() => page.evaluate(() => Boolean((window.__eek!.state() as { validation: unknown[] | null }).validation?.length))).toBe(true);
}
