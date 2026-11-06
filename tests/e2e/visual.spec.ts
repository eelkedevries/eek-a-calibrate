// visual.spec.ts (spec §17.12.3, design §8): each board of the design, captured at its size in
// the board's state through the screens' fixtures, for comparison with its rendering in
// interface-design-v2/png/. Not pixel-asserted: each capture only has to render its screen without
// an error or a scrollbar. The captures go to test-results/visual-018/; with VISUAL_018=update
// they go to docs-dev/reviews/visual-018/ instead, each beside a copy of its board's rendering
// (`<board>.board.png`), where README.md notes the differences that remain.
import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { expectNoScroll } from './helpers/noScroll.ts';

const UPDATE = process.env.VISUAL_018 === 'update';
const OUT = UPDATE ? 'docs-dev/reviews/visual-018' : 'test-results/visual-018';
const BOARDS = 'docs-dev/reference/secondary_background/interface-design-v2/png';

const PHONE = { width: 390, height: 844, mobile: true };
const WEBCAM = { width: 1440, height: 900, mobile: false };
const SIDEWAYS = { width: 844, height: 390, mobile: true };

interface Capture {
  /** The file name; the board's name, or the board's name and the state shown. */
  name: string;
  board: string;
  size: { width: number; height: number; mobile: boolean };
  route: string;
  fixture?: string;
}

const CAPTURES: Capture[] = [
  { name: 'Main', board: 'Main', size: PHONE, route: '#/' },
  { name: 'phone-ready', board: 'phone-ready', size: PHONE, route: '#/ready', fixture: 'ready-ready' },
  { name: 'phone-level1-pop', board: 'phone-level1-pop', size: PHONE, route: '#/warmup', fixture: 'warmup-pop' },
  { name: 'phone-level2-follow', board: 'phone-level2-follow', size: PHONE, route: '#/warmup', fixture: 'warmup-follow' },
  { name: 'phone-level-complete', board: 'phone-level-complete', size: PHONE, route: '#/complete', fixture: 'complete-good' },
  { name: 'phone-free-look', board: 'phone-free-look', size: PHONE, route: '#/look', fixture: 'look' },
  { name: 'phone-challenge', board: 'phone-challenge', size: PHONE, route: '#/challenge', fixture: 'challenge-play' },
  { name: 'desktop-title', board: 'desktop-title', size: WEBCAM, route: '#/' },
  { name: 'desktop-ready', board: 'desktop-ready', size: WEBCAM, route: '#/ready', fixture: 'ready-ready' },
  { name: 'desktop-level1-pop', board: 'desktop-level1-pop', size: WEBCAM, route: '#/warmup', fixture: 'warmup-card' },
  { name: 'desktop-level3-turn', board: 'desktop-level3-turn', size: WEBCAM, route: '#/warmup', fixture: 'warmup-turn' },
  { name: 'desktop-level-complete', board: 'desktop-level-complete', size: WEBCAM, route: '#/complete', fixture: 'complete-good' },
  { name: 'desktop-free-look', board: 'desktop-free-look', size: WEBCAM, route: '#/look', fixture: 'look' },
  { name: 'desktop-challenge', board: 'desktop-challenge', size: WEBCAM, route: '#/challenge', fixture: 'challenge-done-well' },
  { name: 'phone-landscape-level1', board: 'phone-landscape-level1', size: SIDEWAYS, route: '#/warmup', fixture: 'warmup-pop' },
  { name: 'phone-landscape-challenge', board: 'phone-landscape-challenge', size: SIDEWAYS, route: '#/challenge', fixture: 'challenge-play' },
  // The position guard's board is a sheet of components: each state on its own screen, phone and webcam.
  ...(['searching', 'adjust', 'holding', 'ready'] as const).flatMap((state) => [
    { name: `position-signals-${state}-phone`, board: 'position-signals', size: PHONE, route: '#/ready', fixture: `ready-${state}` },
    { name: `position-signals-${state}-webcam`, board: 'position-signals', size: WEBCAM, route: '#/ready', fixture: `ready-${state}` },
  ]),
  { name: 'position-signals-overlay-phone', board: 'position-signals', size: PHONE, route: '#/ready', fixture: 'guard-overlay' },
  { name: 'position-signals-overlay-late-webcam', board: 'position-signals', size: WEBCAM, route: '#/ready', fixture: 'guard-overlay-late' },
];

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  // Finite transitions (cards and chips arriving) end; the bubbles and the hold ring keep moving.
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
  });
  await page.waitForTimeout(600);
}

mkdirSync(OUT, { recursive: true });

for (const size of [PHONE, WEBCAM, SIDEWAYS]) {
  test.describe(`Boards at ${size.width}×${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile, deviceScaleFactor: 1 });

    for (const c of CAPTURES.filter((x) => x.size === size)) {
      test(c.name, async ({ page }) => {
        const problems: string[] = [];
        page.on('pageerror', (e) => problems.push(e.message));
        page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
        await page.goto(`./?e2e=1${c.fixture ? `&fixture=${c.fixture}` : ''}${c.route}`);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeAttached();
        await settle(page);
        await page.screenshot({ path: `${OUT}/${c.name}.png` });
        if (UPDATE) copyFileSync(`${BOARDS}/${c.board}.png`, `${OUT}/${c.board}.board.png`);
        await expectNoScroll(page, c.name);
        expect(problems).toEqual([]);
      });
    }
  });
}
