// flow.spec.ts (spec §10.4, §17.12): the whole game at speed=4 with every engine and an injected,
// measured geometry: Title → Play → Get ready → Start warm-up → the Quick set's two levels →
// Checking your aim… → Warm-up complete (stars, zones, marks) → Free look → a challenge round →
// Round complete; then Details → Results lists Combined and every engine that was fitted, with
// Auto's choice marked. And the Standard set's level cards in order (Pop, Follow, Turn, Test).
// Accuracy is not asserted: the fake face does not look at the targets.
import { expect, test } from '@playwright/test';
import { t } from '../../src/app/strings.en-GB.ts';
import { appState, challenge, forceZones, injectGeometry, look, playRound, playWarmup, result, route, sameOrigin, startWarmup, warmup, watch } from './helpers/game.ts';
import { onTab, sheet } from './helpers/details.ts';

interface AppState {
  geometry: { degreesApproximate: boolean; screen: { pxPerMmSource: string } } | null;
  calibration: { presentations: { itemId: string; onsetMs: number; offsetMs: number }[] } | null;
  fit: {
    fitMs: number;
    seed: number;
    pursuitLagMs: number;
    fits: Record<string, unknown>;
    combined: { members: string[] } | null;
    selection: { estimator: string; reason: string };
    warnings: string[];
    fitGeometry: unknown;
  } | null;
  validation: { estimator: string; mode: string }[] | null;
  challenge: { rounds: number } | null;
}

test.describe('The whole game with every engine (desktop, injected geometry)', () => {
  test.describe.configure({ timeout: 540_000 });

  test('Title to Round complete; Details → Results lists Combined and every fitted engine', async ({ page }) => {
    const seen = watch(page);
    await page.goto('./?e2e=1&speed=4&preset=quick&engines=all&seed=4242');
    await expect(page.getByRole('heading', { level: 1, name: t('title.name') })).toBeVisible();
    await injectGeometry(page);
    await startWarmup(page);

    // The first card: Level 1 of 2, Pop the dots, with its countdown and Start now.
    const card = page.getByRole('dialog', { name: t('warmup.level.pop.name') });
    await expect(card).toBeVisible();
    await expect(card.getByText(t('warmup.card.levelOf', { level: 1, levels: 2 }))).toBeVisible();
    await expect(card.getByRole('timer')).toBeVisible();
    // In play: the pip line on the camera edge and the corner cluster.
    let sawHud = false;
    await playWarmup(page, {
      timeoutMs: 420_000,
      each: async (w) => {
        if (sawHud || w?.phase !== 'running' || !w.item) return;
        const pips = page.getByRole('progressbar', { name: t('warmup.progress', { level: w.level!.number }) });
        sawHud = (await pips.isVisible().catch(() => false)) && (await page.locator('.corner .glyph').isVisible().catch(() => false));
      },
    });
    expect(sawHud).toBe(true);

    // Warm-up complete: the result, rendered (zone map with six marks, stars, headline, actions).
    const r = (await result(page))!;
    expect(r.mode).toBe('full');
    expect(r.levels).toEqual(['pop', 'test']);
    expect(r.marks).toHaveLength(6);
    expect(['great', 'good', 'rough', 'failed']).toContain(r.outcome);
    for (const k of [r.zones.cols, r.zones.rows]) expect([0, 1, 2, 3, 4]).toContain(k);
    await expect(page.getByRole('img', { name: /test bubbles hit\.$/ })).toBeVisible();
    await expect(page.locator('.zone-map__mark')).toHaveCount(6);
    await expect(page.getByRole('img', { name: /^[0-3] of 3 stars$/ })).toHaveAttribute('aria-label', r.stars === 1 ? '1 of 3 stars' : `${r.stars} of 3 stars`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(r.outcome === 'failed' ? t('complete.headline.failed') : t('complete.headline.zones', { n: r.zones.cols * r.zones.rows }));
    await expect(page.locator('.complete__actions .btn--primary')).toBeVisible();

    // The pipeline behind it: CAL9, the fit with every engine that loaded, the Test round's reports.
    const state = await appState<AppState>(page);
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
    const expected = [...Object.keys(fit.fits), ...(fit.combined ? ['combined'] : [])].sort();
    expect([...new Set(state.validation!.filter((v) => v.mode === 'own').map((v) => v.estimator))].sort()).toEqual(expected);
    expect([...new Set(state.validation!.filter((v) => v.mode === 'intersection').map((v) => v.estimator))].sort()).toEqual(expected);
    test.info().annotations.push({ type: 'fitMs', description: `${Math.round(fit.fitMs)} ms (budget 15000 ms); engines ${Object.keys(fit.fits).join(', ')}` });
    console.log(`flow.spec: fitMs = ${Math.round(fit.fitMs)} ms; τ = ${fit.pursuitLagMs} ms; selected ${fit.selection.estimator}; warnings: ${fit.warnings.length}`);
    expect(seen.logs.some((l) => l.startsWith('Fit:'))).toBe(true);

    // Free look: three zones for the fake face, a lit zone and the gaze disc.
    await forceZones(page, 3, 1);
    await page.evaluate(() => (location.hash = '#/look'));
    await expect.poll(async () => (await look(page))?.phase, { timeout: 60_000 }).toBe('look');
    await expect.poll(async () => (await look(page))?.lit?.index ?? null, { timeout: 60_000 }).not.toBeNull();
    await expect(page.locator('.zone-board__zone')).toHaveCount(3);

    // A challenge round to Round complete.
    await page.mouse.move(30, 300);
    await page.getByRole('button', { name: t('look.play') }).click();
    await expect.poll(() => route(page)).toBe('challenge');
    await expect(page.getByRole('dialog', { name: t('challenge.round.pop.name') })).toBeVisible({ timeout: 30_000 });
    expect(await playRound(page)).toBe(true);
    const done = (await challenge(page))!.last!;
    expect(done).toMatchObject({ trial: 'game-001', round: 1, total: 16 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('challenge.done.headline', { popped: done.popped, total: 16 }));
    expect((await appState<AppState>(page)).challenge?.rounds).toBe(1);

    // Details → Results over Round complete: Combined first, then each engine that was fitted.
    await page.locator('.topbar__details').click();
    await page.getByRole('tab', { name: 'Results' }).click();
    const s = await onTab(page, 'results');
    const cards = s.pageIds.filter((id) => id.startsWith('estimator-') && !id.includes('~'));
    if (fit.combined) expect(cards[0]).toBe('estimator-combined');
    for (const id of expected) expect(cards).toContain(`estimator-${id}`);
    expect((await sheet(page)).pageId).toBe(cards[0]);
    // Auto's choice is marked on its card.
    const auto = fit.selection.estimator;
    for (let i = 0; i < s.pages && (await sheet(page)).pageId !== `estimator-${auto}`; i++) await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Auto’s choice');
    expect(await route(page)).toBe('challenge');

    sameOrigin(page, seen.requests);
    expect(seen.problems).toEqual([]);
  });
});

test.describe('The Standard warm-up', () => {
  test.describe.configure({ timeout: 300_000 });

  test("the Standard set's cards appear in order: Pop, Follow, Turn, Test", async ({ page }) => {
    const seen = watch(page);
    await page.goto('./?e2e=1&speed=8&preset=standard&engines=geometric&seed=99');
    await startWarmup(page);
    const names: string[] = [];
    let keys: string[] = [];
    await playWarmup(page, {
      each: async (w) => {
        if (w) keys = w.cards;
        if (w?.card !== 'level') return;
        const title = await page.locator('.level-card .stim-card__title').textContent({ timeout: 1000 }).catch(() => null);
        if (title && names[names.length - 1] !== title) names.push(title);
      },
    });
    expect(keys).toEqual(['pop', 'follow', 'turn', 'test']);
    expect(names).toEqual([t('warmup.level.pop.name'), t('warmup.level.follow.name'), t('warmup.level.turn.name'), t('warmup.level.test.name')]);
    const r = (await result(page))!;
    expect(r.levels).toEqual(['pop', 'follow', 'turn', 'test']);
    expect(r.marks).toHaveLength(12);
    expect((await warmup(page))).toBeNull();
    expect(seen.problems).toEqual([]);
  });
});
