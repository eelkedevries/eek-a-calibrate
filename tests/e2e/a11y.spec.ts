// a11y.spec.ts (spec §17.3.7, §17.12; design §3.11; prompt 018's accessibility pass). The whole
// game by keyboard alone: the Title's focus order and chooser, the Details sheet's trap and the
// return of focus, Space to start and to continue, P to pause, Esc to leave a level and a round,
// D for Re-aim and R and M in Expert mode, with a visible focus ring on every stop. The names and
// roles of the track, the chooser, the pip line, the glyph, the overlay, the stars, the zone maps
// and the cards. Reduced motion end to end: nothing pulses, and the Follow card offers "Skip this
// level". Contrast is a unit test (tests/unit/a11y-contrast.test.ts); the 44 px targets are
// checked by no-scroll.spec.ts on every screen and state.
//
// With A11Y_EXTRA=1 the no-scroll check also runs once at the further sizes of design §4.1 rule 13
// and at 125 % root text, and reports what it finds (test-results/a11y-extra.json) instead of
// failing: the escape hatch of rule 12 lets the panel scroll under enlarged text.
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { t } from '../../src/app/strings.en-GB.ts';
import { sheet } from './helpers/details.ts';
import { appState, challenge, forceZones, look, result, route, warmup, watch } from './helpers/game.ts';
import { noScrollReport } from './helpers/noScroll.ts';

interface Focus {
  tag: string;
  role: string | null;
  name: string;
  ring: boolean;
}

/** The focused element: its tag, role, accessible name as written, and whether a focus ring shows. */
const focused = (page: Page) =>
  page.evaluate((): Focus | null => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== 'none';
    const labelledBy = el.getAttribute('aria-labelledby');
    const control = el.matches('a, button, input, select, textarea, summary, [role="tab"], [role="radio"], [role="switch"], [role="button"]');
    const raw = el.getAttribute('aria-label') ?? (labelledBy ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : control ? el.textContent : '');
    const name = (raw ?? '').trim().replace(/\s+/g, ' ');
    return { tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), name, ring };
  });

/** Presses Tab (or Shift+Tab) until the focused element's name matches; every stop must show its ring. */
async function tabTo(page: Page, name: RegExp, back = false, max = 30): Promise<Focus[]> {
  const stops: Focus[] = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    const f = await focused(page);
    if (!f) continue;
    stops.push(f);
    expect(f.ring, `a visible focus ring on ${f.tag} "${f.name}"`).toBe(true);
    if (name.test(f.name)) return stops;
  }
  throw new Error(`no stop named ${name} within ${max} presses: ${stops.map((s) => s.name).join(' | ')}`);
}

/** Presses `key` until `done()` holds, polling in between (a card may take a moment to arrive). */
async function pressUntil(page: Page, key: string, done: () => Promise<boolean>, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > deadline) throw new Error(`${key} did not get there: ${JSON.stringify(await warmup(page))}`);
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
}

const levelRunning = async (page: Page) => {
  const w = await warmup(page);
  return w?.phase === 'running' && w.item !== null;
};

test.describe('The whole game by keyboard alone', () => {
  test.describe.configure({ timeout: 480_000 });

  test('Title, Details, Get ready, the warm-up, Free look and a round, by keys only', async ({ page }) => {
    const seen = watch(page);
    await page.goto('./?e2e=1&speed=4&preset=quick&engines=geometric,eyepixel&seed=808');
    await expect(page.getByRole('heading', { level: 1, name: t('title.name') })).toBeFocused();

    // The Title's focus order: Details in the top bar, the chooser's checked tile, then Play.
    const stops = await tabTo(page, new RegExp(`^${t('title.play')}$`));
    expect(stops.map((s) => s.name).slice(-2)).toEqual([t('title.chooser.webcam.name'), t('title.play')]);
    // The chooser is one tab stop; the arrows move the choice.
    await tabTo(page, new RegExp(t('title.chooser.webcam.name')), true);
    await page.keyboard.press('ArrowLeft');
    const inHand = page.getByRole('radio', { name: t('title.chooser.inHand.name') });
    await expect(inHand).toBeFocused();
    await expect(inHand).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: t('title.chooser.webcam.name') })).toHaveAttribute('aria-checked', 'true');

    // Details: open by Enter, move to Settings by arrows, page to Expert mode, switch it on by
    // Space; Esc closes the sheet and focus returns to the Details button.
    await tabTo(page, new RegExp(`^${t('shell.details')}$`), true);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await sheet(page)).open).toBe(true);
    await expect(page.getByRole('tab', { selected: true })).toBeFocused();
    await pressUntil(page, 'ArrowRight', async () => (await sheet(page)).tab === 'settings');
    await tabTo(page, /^Next page$/);
    await pressUntil(page, 'Enter', async () => (await page.locator('#pref-expert').count()) > 0, 15_000);
    await tabTo(page, /Expert mode/, true);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await appState<{ prefs: { expert: boolean } }>(page)).prefs.expert).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await sheet(page)).open).toBe(false);
    await expect(page.getByRole('button', { name: t('shell.details') })).toBeFocused();

    // Play by Enter; Space on Get ready starts the warm-up once it may.
    await tabTo(page, new RegExp(`^${t('title.play')}$`));
    await page.keyboard.press('Enter');
    await expect.poll(() => route(page)).toBe('ready');
    await expect.poll(async () => ((await page.locator('.ready-start').isEnabled().catch(() => false)) ? 'ready' : 'waiting'), { timeout: 120_000 }).toBe('ready');
    await page.keyboard.press('Space');
    await expect.poll(() => route(page)).toBe('warmup');

    // Esc during a level leaves the warm-up for the Title; Play and Space bring it back.
    await pressUntil(page, 'Space', () => levelRunning(page));
    await page.keyboard.press('Escape');
    await expect.poll(() => route(page)).toBe('title');
    await tabTo(page, new RegExp(`^${t('title.play')}$`));
    await page.keyboard.press('Enter');
    await expect.poll(async () => ((await page.locator('.ready-start').isEnabled().catch(() => false)) ? 'ready' : 'waiting'), { timeout: 120_000 }).toBe('ready');
    await page.keyboard.press('Space');
    await expect.poll(() => route(page)).toBe('warmup');

    // Space starts each level card; P pauses, and the Pause card takes the focus; Enter carries on.
    await pressUntil(page, 'Space', () => levelRunning(page));
    await page.keyboard.press('p');
    await expect.poll(async () => (await warmup(page))?.card).toBe('pause');
    await expect.poll(async () => (await focused(page))?.name).toBe(t('warmup.paused.carryOn'));
    expect((await focused(page))!.ring).toBe(true);
    await page.keyboard.press('Enter');
    await pressUntil(page, 'Space', async () => (await route(page)) === 'complete', 240_000);

    // Warm-up complete: "How we judge this" opens Details on its page; Esc returns the focus there.
    await tabTo(page, new RegExp(t('complete.judge')));
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await sheet(page)).pageId).toBe('judge');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await sheet(page)).open).toBe(false);
    await expect.poll(async () => (await focused(page))?.name).toBe(t('complete.judge'));
    expect((await result(page))!.marks).toHaveLength(6);

    // Free look (three zones for the fake face, a test shortcut): D runs Re-aim; R records, M marks.
    await forceZones(page, 3, 1);
    await page.evaluate(() => (location.hash = '#/look'));
    await expect.poll(async () => (await look(page))?.phase, { timeout: 60_000 }).toBe('look');
    await page.keyboard.press('d');
    await expect.poll(async () => (await look(page))?.phase, { timeout: 10_000 }).toBe('reaim');
    const deadline = Date.now() + 90_000;
    while ((await look(page))?.reaim == null || (await look(page))?.phase !== 'look') {
      if (Date.now() > deadline) throw new Error(`Re-aim did not finish: ${JSON.stringify(await look(page))}`);
      const keep = page.getByRole('button', { name: t('reaim.keep') });
      if (await keep.isVisible().catch(() => false)) await keep.press('Enter').catch(() => undefined);
      await page.waitForTimeout(150);
    }
    expect((await look(page) as unknown as { expert: boolean }).expert).toBe(true);
    await page.keyboard.press('r');
    await expect.poll(async () => ((await look(page)) as unknown as { recording: string | null }).recording).toMatch(/^live-\d+$/);
    await page.keyboard.press('m');
    await page.keyboard.press('r');
    await expect.poll(async () => ((await look(page)) as unknown as { recording: string | null }).recording).toBeNull();

    // Play the challenge from the dock; Space starts the round, P pauses and resumes, Esc leaves it.
    await tabTo(page, new RegExp(`^${t('look.play')}$`));
    await page.keyboard.press('Enter');
    await expect.poll(() => route(page)).toBe('challenge');
    await expect(page.getByRole('dialog', { name: t('challenge.round.pop.name') })).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Space');
    await expect.poll(async () => (await challenge(page))?.phase, { timeout: 30_000 }).toBe('playing');
    await page.keyboard.press('p');
    await expect.poll(async () => (await challenge(page))?.paused).toBe(true);
    await page.keyboard.press('p');
    await expect.poll(async () => (await challenge(page))?.paused).toBe(false);
    await page.keyboard.press('Escape');
    await expect.poll(() => route(page)).toBe('look');

    expect(seen.problems).toEqual([]);
  });
});

test.describe('Names and roles', () => {
  test('the track, chooser, pip line, glyph, overlay, stars, zone maps and cards are named', async ({ page }) => {
    const problems = watch(page).problems;
    await page.goto('./?e2e=1');
    await expect(page.getByRole('radiogroup', { name: t('title.chooser.label') })).toBeVisible();
    await expect(page.getByRole('radiogroup').getByRole('radio')).toHaveCount(3);

    await page.goto('./?e2e=1&fixture=complete-good#/complete');
    const track = page.getByRole('list', { name: t('track.label') });
    await expect(track).toBeVisible();
    await expect(track.getByRole('listitem')).toHaveCount(5);
    await expect(page.getByRole('img', { name: /test bubbles hit\.$/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /^[0-3] of 3 stars$/ })).toBeVisible();

    await page.goto('./?e2e=1&fixture=warmup-card#/warmup');
    const card = page.getByRole('dialog', { name: t('warmup.level.pop.name') });
    await expect(card).toBeVisible();
    await expect(card.getByRole('timer')).toBeVisible();

    await page.goto('./?e2e=1&fixture=warmup-pop#/warmup');
    await expect(page.getByRole('progressbar', { name: t('warmup.progress', { level: 1 }) })).toBeVisible();
    await expect(page.locator('.corner .glyph[role="img"]')).toHaveAttribute('aria-label', /.+/);
    await expect(page.getByRole('button', { name: t('warmup.pause') })).toBeVisible();

    await page.goto('./?e2e=1&fixture=guard-overlay#/ready');
    const overlay = page.getByRole('alertdialog');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAccessibleName(/.+/);
    await expect(overlay.getByRole('img', { name: t('guard.pause.preview') })).toBeVisible();

    await page.goto('./?e2e=1&fixture=look#/look');
    await expect(page.locator('svg.zone-board[role="img"]')).toHaveAttribute('aria-label', /.+/);

    await page.goto('./?e2e=1&fixture=challenge-done-well#/challenge');
    await expect(page.getByRole('img', { name: /^[0-3] of 3 stars$/ })).toBeVisible();
    await expect(page.locator('svg.round-map__mini[role="img"]')).toHaveAttribute('aria-label', /.+/);
    expect(problems).toEqual([]);
  });
});

test.describe('Reduced motion', () => {
  test.describe.configure({ timeout: 300_000 });
  test.use({ reducedMotion: 'reduce' });

  test('nothing pulses, the bubbles do not shrink, and the Follow card offers "Skip this level"', async ({ page }) => {
    const seen = watch(page);
    await page.goto('./?e2e=1&speed=8&preset=standard&engines=geometric&seed=909');
    const infinite = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length);
    expect(await infinite()).toBe(0);
    await page.getByRole('button', { name: t('title.play') }).click();
    await expect.poll(async () => ((await page.locator('.ready-start').isEnabled().catch(() => false)) ? 'ready' : 'waiting'), { timeout: 120_000 }).toBe('ready');
    expect(await infinite()).toBe(0);
    await page.locator('.ready-start').click();
    let skipped = false;
    let running = false;
    const deadline = Date.now() + 240_000;
    while ((await route(page)) !== 'complete') {
      if (Date.now() > deadline) throw new Error(`the warm-up did not finish: ${JSON.stringify(await warmup(page))}`);
      const w = await warmup(page);
      if (w?.card === 'level' && w.level?.key === 'follow') {
        await page.getByRole('button', { name: t('warmup.card.skip') }).click();
        skipped = true;
      } else if (w?.card === 'level') {
        await page.locator('.level-card__start').click().catch(() => undefined);
      } else if (w?.card === 'pause') {
        await page.getByRole('button', { name: t('warmup.paused.carryOn') }).click().catch(() => undefined);
      }
      if (w?.phase === 'running' && w.item) {
        running = true;
        expect(w.level?.key).not.toBe('follow');
        expect(await infinite()).toBe(0);
      }
      await page.waitForTimeout(100);
    }
    expect(skipped).toBe(true);
    expect(running).toBe(true);
    expect((await result(page))!.marks).toHaveLength(12);
    expect(await infinite()).toBe(0);
    expect(seen.problems).toEqual([]);
  });
});

// One run at the further sizes of design §4.1 rule 13 and at 125 % root text (A11Y_EXTRA=1).
const EXTRA_SIZES = [
  { width: 390, height: 664, mobile: true },
  { width: 375, height: 553, mobile: true },
  { width: 750, height: 342, mobile: true },
  { width: 802, height: 293, mobile: true },
  { width: 1920, height: 969, mobile: false },
];
const FIVE_SIZES = [
  { width: 360, height: 640, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 844, height: 390, mobile: true },
  { width: 1280, height: 650, mobile: false },
  { width: 1440, height: 900, mobile: false },
];
const EXTRA_STATES = [
  '#/',
  '#/ready?fixture=ready-ready',
  '#/ready?fixture=ready-adjust',
  '#/ready?fixture=guard-overlay-late',
  '#/warmup?fixture=warmup-card',
  '#/warmup?fixture=warmup-card-2',
  '#/warmup?fixture=warmup-pop',
  '#/warmup?fixture=warmup-pause',
  '#/warmup?fixture=warmup-changed',
  '#/complete?fixture=complete-good',
  '#/complete?fixture=complete-failed',
  '#/look?fixture=look',
  '#/look?fixture=reaim-large',
  '#/challenge?fixture=challenge-card-2',
  // The tallest card: round 3's rule takes two lines.
  '#/challenge?fixture=challenge-card-3',
  '#/challenge?fixture=challenge-play',
  '#/challenge?fixture=challenge-done-well',
  '#/details/about',
  '#/screen?from=details',
  '#/lab?from=details',
];

test.describe('Further sizes and 125 % text (reported once)', () => {
  test.skip(process.env.A11Y_EXTRA !== '1', 'A one-off check: run with A11Y_EXTRA=1.');
  test.describe.configure({ timeout: 900_000 });

  test('every main state at the further sizes, and at the five sizes with 125 % root text', async ({ browser }) => {
    const findings: { size: string; text: string; state: string; scroll: boolean; outside: string[]; small: string[] }[] = [];
    const runs = [...EXTRA_SIZES.map((s) => ({ s, text: '100 %' })), ...FIVE_SIZES.map((s) => ({ s, text: '125 %' }))];
    for (const { s, text } of runs) {
      const context = await browser.newContext({ viewport: { width: s.width, height: s.height }, isMobile: s.mobile, hasTouch: s.mobile });
      const page = await context.newPage();
      for (const [i, state] of EXTRA_STATES.entries()) {
        // A query of its own for each state, so that every visit is a page load and applies its fixture.
        await page.goto(`./?e2e=1&visit=${i}${state}`);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeAttached();
        // Enlarged with the screen already laid out: the fit guards follow the root text size.
        if (text === '125 %') await page.evaluate(() => document.documentElement.style.setProperty('font-size', '125%', 'important'));
        await page.waitForTimeout(300);
        const r = await noScrollReport(page);
        const scroll = r.scrollWidth > r.innerWidth || r.scrollHeight > r.innerHeight;
        if (scroll || r.outside.length || r.small.length) findings.push({ size: `${s.width}×${s.height}`, text, state, scroll, outside: r.outside.slice(0, 4), small: r.small.slice(0, 4) });
      }
      await context.close();
    }
    writeFileSync('test-results/a11y-extra.json', JSON.stringify(findings, null, 2));
    test.info().annotations.push({ type: 'findings', description: `${findings.length} state(s) with a finding; see test-results/a11y-extra.json` });
  });
});
