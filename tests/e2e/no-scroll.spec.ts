// The no-scroll rule (spec §17.3.3): every route of §17.2 but the #/methods document, and the
// Details sheet on every page of every tab, with and without a result, at the five sizes, from a
// table of states that later prompts extend (a route, an optional query or fixture, an optional
// action).
import { expect, test, type Page } from '@playwright/test';
import { onTab, playQuickFlow, TABS, walkTab } from './helpers/details.ts';
import { expectNoScroll } from './helpers/noScroll.ts';

export interface NoScrollState {
  name: string;
  route: string;
  /** Extra query parameters before the hash (`preset=quick`). */
  query?: string;
  /** A fixture registered with registerFixture (§17.2.5). */
  fixture?: string;
  /** What to do once the route has rendered (open the sheet, for example). */
  action?: (page: Page) => Promise<void>;
}

const SIZES = [
  { name: '360×640', width: 360, height: 640, mobile: true },
  { name: '390×844', width: 390, height: 844, mobile: true },
  { name: '844×390', width: 844, height: 390, mobile: true },
  { name: '1280×650', width: 1280, height: 650, mobile: false },
  { name: '1440×900', width: 1440, height: 900, mobile: false },
] as const;

const sheet = (page: Page) => page.evaluate(() => (window.__eek!.sheet as () => { open: boolean; tab: string | null; pages: number })());

async function openDetails(page: Page): Promise<void> {
  await page.locator('.topbar__details').click();
  await expect.poll(async () => (await sheet(page)).open).toBe(true);
}

async function openDeleteConfirmation(page: Page): Promise<void> {
  await page.locator('dialog.sheet .sheet__delete').click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
}

/**
 * The tool pages' panel never runs into the top bar or the actions (on a phone held sideways it
 * is centred in its row, where growing past it overflows nothing): its fit guard drops text first.
 */
async function expectPanelClear(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  // Let the fit guard settle after the fonts.
  await page.waitForTimeout(100);
  const overlaps = await page.evaluate(() => {
    const panel = document.querySelector('.app .panel')!.getBoundingClientRect();
    return ['.app .topbar', '.app .actions', '.app .stage']
      .map((sel) => [sel, document.querySelector(sel)!.getBoundingClientRect()] as const)
      .filter(([, r]) => panel.left < r.right - 0.5 && panel.right > r.left + 0.5 && panel.top < r.bottom - 0.5 && panel.bottom > r.top + 0.5)
      .map(([sel]) => sel);
  });
  expect(overlaps, 'the panel overlaps').toEqual([]);
}

export const STATES: NoScrollState[] = [
  { name: 'Title', route: '#/' },
  { name: 'Title, with Skip warm-up', route: '#/', fixture: 'title-skip' },
  { name: 'Title, camera blocked', route: '#/', fixture: 'title-blocked' },
  { name: 'Title, Thorough', route: '#/', query: 'preset=thorough' },
  { name: 'Get ready', route: '#/ready' },
  ...(['loading', 'searching', 'adjust', 'holding', 'ready', 'anyway'] as const).map((state) => ({ name: `Get ready, ${state}`, route: '#/ready', fixture: `ready-${state}` })),
  { name: 'Auto-pause overlay', route: '#/ready', fixture: 'guard-overlay' },
  { name: 'Auto-pause overlay after 10 s', route: '#/ready', fixture: 'guard-overlay-late' },
  { name: 'Get ready, Thorough', route: '#/ready', query: 'preset=thorough' },
  // The warm-up (prompt 015): without a presentation or a result each route sends the player to
  // Get ready; its fixtures show a level card, a level in play, Checking, the pause and screen
  // cards, and every Warm-up complete outcome.
  { name: 'Warm-up without a presentation', route: '#/warmup' },
  ...(['card', 'card-2', 'pop', 'follow', 'turn', 'checking', 'pause', 'changed', 'rotated', 'fix'] as const).map((f) => ({ name: `Warm-up, ${f}`, route: '#/warmup', fixture: `warmup-${f}` })),
  { name: 'Warm-up, Thorough card', route: '#/warmup', query: 'preset=thorough', fixture: 'warmup-card-2' },
  { name: 'Warm-up complete without a result', route: '#/complete' },
  ...(['great', 'good', 'rough', 'rough-two', 'failed', 'restore', 'quick'] as const).map((f) => ({ name: `Warm-up complete, ${f}`, route: '#/complete', fixture: `complete-${f}` })),
  { name: 'Warm-up complete, Thorough', route: '#/complete', query: 'preset=thorough', fixture: 'complete-good' },
  // Free look, Re-aim and the challenge (prompt 016): without a fit each route sends the player
  // to the Title; the fixtures show Free look (bar and dock shown, faded), the Re-aim offer, Re-aim
  // in play and its outcomes, each round card, a round in play (round 2, with a spike), the offer
  // in a round, and each Round complete outcome.
  { name: 'Free look without a fit', route: '#/look' },
  ...(['look', 'look-faded', 'look-offer', 'look-reaim', 'reaim-fixed', 'reaim-fine', 'reaim-large'] as const).map((f) => ({ name: `Free look, ${f}`, route: '#/look', fixture: f })),
  { name: 'Free look, Thorough', route: '#/look', query: 'preset=thorough', fixture: 'look' },
  { name: 'Challenge without a fit', route: '#/challenge' },
  ...(['challenge-card-1', 'challenge-card-2', 'challenge-card-3', 'challenge-play', 'challenge-offer', 'challenge-done-well', 'challenge-done-final', 'challenge-done-badly', 'challenge-done-shift'] as const).map((f) => ({
    name: `Challenge, ${f.slice('challenge-'.length)}`,
    route: '#/challenge',
    fixture: f,
  })),
  { name: 'Page not found', route: '#/no-such-page' },
  ...TABS.map((tab) => ({ name: `Details, ${tab}, every page`, route: `#/details/${tab}`, action: async (page: Page) => {
      await walkTab(page, tab, `${tab} without a result`);
    } })),
  { name: 'Details over Get ready', route: '#/ready', action: openDetails },
  { name: 'Details over Warm-up complete', route: '#/complete', fixture: 'complete-good', action: openDetails },
  { name: 'Details over Free look', route: '#/look', fixture: 'look', action: openDetails },
  { name: 'Details over Round complete', route: '#/challenge', fixture: 'challenge-done-well', action: openDetails },
  { name: 'Delete confirmation', route: '#/details/about', action: openDeleteConfirmation },
  // The pages opened from Details → Device (prompt 017).
  { name: 'Screen size', route: '#/screen?from=details', action: expectPanelClear },
  {
    name: 'Screen size, diagonal',
    route: '#/screen?from=details',
    action: async (page) => {
      await page.getByRole('button', { name: 'Enter the diagonal instead' }).click();
      await expectPanelClear(page);
    },
  },
  { name: 'Viewing distance', route: '#/distance?from=details', action: expectPanelClear },
  { name: 'Diagnostics', route: '#/lab?from=details', action: expectPanelClear },
  {
    name: 'Diagnostics, last card',
    route: '#/lab?from=details',
    action: async (page) => {
      await page.getByLabel('Section').selectOption('messages');
      await expectPanelClear(page);
    },
  },
];

function address(state: NoScrollState): string {
  const query = ['e2e=1', state.query, state.fixture ? `fixture=${state.fixture}` : null].filter(Boolean).join('&');
  return `./?${query}${state.route}`;
}

for (const size of SIZES) {
  test.describe(`No scrolling at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile });

    for (const state of STATES) {
      test(state.name, async ({ page }) => {
        const problems: string[] = [];
        page.on('pageerror', (error) => problems.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') problems.push(message.text());
        });
        await page.goto(address(state));
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeAttached();
        if (state.route.startsWith('#/details/')) await onTab(page, state.route.slice('#/details/'.length).split('?')[0]!);
        if (state.action) await state.action(page);
        await expectNoScroll(page, `${state.name} at ${size.name}`);
        expect(problems).toEqual([]);
      });
    }
  });
}

// With a result: the v1 Quick flow gives a fit and a scored Test round, then every page of every
// tab is checked at each size in the same session (the results live in memory).
test.describe('No scrolling in Details with a result', () => {
  test.describe.configure({ timeout: 600_000 });

  test('every page of every tab, at the five sizes', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    await playQuickFlow(page);
    await page.evaluate(() => (location.hash = '#/details/results'));
    await onTab(page, 'results');
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const tab of TABS) {
        const seen = await walkTab(page, tab, `with a result at ${size.name}`);
        if (tab === 'results') expect(seen).toContain('estimator-combined');
      }
    }
    expect(problems).toEqual([]);
  });
});
