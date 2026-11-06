// Helpers for the Details sheet (design §2.17): its state through `window.__eek.sheet()`, walking
// every page of a tab, and playing the Quick warm-up to get a scored Test round to show.
import { expect, type Page } from '@playwright/test';
import { playWarmup, startWarmup } from './game.ts';
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

/**
 * Plays the game's Quick warm-up on the fake camera to Warm-up complete, so that the session holds
 * a fit and a scored Test round. The results live in memory: move within the page afterwards.
 */
export async function playQuickFlow(page: Page, timeoutMs = 240_000): Promise<void> {
  await page.goto('./?e2e=1&speed=4&preset=quick&engines=geometric,eyepixel&seed=17&pid=P01&session=S1');
  await startWarmup(page);
  await playWarmup(page, { timeoutMs });
  await expect.poll(() => page.evaluate(() => Boolean((window.__eek!.state() as { validation: unknown[] | null }).validation?.length))).toBe(true);
}
