// The no-scroll rule (spec §17.3.3): every route of §17.2 but the #/methods document, and the
// Details sheet on every tab, at the five sizes, from a table of states that later prompts
// extend (a route, an optional query or fixture, an optional action).
import { expect, test, type Page } from '@playwright/test';
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

const TABS = ['results', 'settings', 'data', 'device', 'about'] as const;

const sheet = (page: Page) => page.evaluate(() => (window.__eek!.sheet as () => { open: boolean; tab: string | null; pages: number })());

async function openDetails(page: Page): Promise<void> {
  await page.locator('.topbar__details').click();
  await expect.poll(async () => (await sheet(page)).open).toBe(true);
}

async function openDeleteConfirmation(page: Page): Promise<void> {
  await page.locator('dialog.sheet .sheet__delete').click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
}

export const STATES: NoScrollState[] = [
  { name: 'Title', route: '#/' },
  { name: 'Get ready', route: '#/ready' },
  { name: 'Get ready, Thorough', route: '#/ready', query: 'preset=thorough' },
  { name: 'Warm-up', route: '#/warmup' },
  { name: 'Warm-up, Thorough', route: '#/warmup', query: 'preset=thorough' },
  { name: 'Warm-up complete', route: '#/complete' },
  { name: 'Warm-up complete, Quick', route: '#/complete', query: 'preset=quick' },
  { name: 'Warm-up complete, Thorough', route: '#/complete', query: 'preset=thorough' },
  { name: 'Free look', route: '#/look' },
  { name: 'Challenge', route: '#/challenge' },
  { name: 'Page not found', route: '#/no-such-page' },
  ...TABS.map((tab) => ({ name: `Details, ${tab}`, route: `#/details/${tab}` })),
  ...TABS.map((tab) => ({ name: `Details, ${tab}, paged`, route: `#/details/${tab}`, fixture: 'sheet-pages' })),
  { name: 'Details over Get ready', route: '#/ready', action: openDetails },
  { name: 'Details over Warm-up complete', route: '#/complete', action: openDetails },
  { name: 'Details over Free look', route: '#/look', action: openDetails },
  { name: 'Delete confirmation', route: '#/details/about', action: openDeleteConfirmation },
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
        if (state.route.startsWith('#/details/')) {
          const tab = state.route.slice('#/details/'.length);
          await expect.poll(async () => (await sheet(page)).tab).toBe(tab);
          if (state.fixture === 'sheet-pages') expect((await sheet(page)).pages).toBe(3);
        }
        if (state.action) await state.action(page);
        await expectNoScroll(page, `${state.name} at ${size.name}`);
        expect(problems).toEqual([]);
      });
    }
  });
}
