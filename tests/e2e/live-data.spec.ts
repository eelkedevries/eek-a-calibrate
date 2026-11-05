// live-data.spec.ts (spec §10.4, §17.12; prompt 016): the game after its warm-up. A Quick warm-up
// at speed=4 with assumed geometry, then Free look shows a lit zone and the gaze disc; Re-aim (D)
// runs the drift check over Free look and reports its outcome; a challenge round runs to Round
// complete (the fake face does not look at the bubbles, so misses are expected); the export zip
// parses and validates, with game.csv and the game-<nnn> rows of samples.csv and targets.csv. Then
// the warm-up stored on the device survives a reload: "Skip warm-up" runs the one-level VAL6 Test
// round and, when it passes, the forced Re-aim before Warm-up complete. Accuracy is not asserted.
//
// The fake face looks at nothing, so its warm-up rarely unlocks two zones; `__eek.forceZones` (test
// mode only) gives the result three zones so that Free look and the challenge can be driven.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { t } from '../../src/app/strings.en-GB.ts';
import { GAME_HEADER } from '../../src/core/export/gameCsv.ts';
import { GEOMETRY_KEYS } from '../../src/core/export/geometryYaml.ts';
import { EEK_A_GAZE_COMMAND } from '../../src/core/export/readme.ts';
import { SAMPLES_HEADER } from '../../src/core/export/samplesCsv.ts';
import { SESSION_SCHEMA } from '../../src/core/export/sessionJson.ts';
import { TARGETS_HEADER } from '../../src/core/export/targetsCsv.ts';
import { CV_HEADER, VALIDATION_HEADER } from '../../src/core/export/validationCsv.ts';

interface LookSnapshot {
  phase: string;
  faded: boolean;
  zones: { cols: number; rows: number } | null;
  lit: { index: number; col: number; row: number } | null;
  disc: { x: number; y: number; r: number; greyed: boolean } | null;
  offer: string | null;
  reaim: string | null;
  driftLog: { tMs: number; offsetDeg: [number, number]; applied: boolean; source?: string }[];
}

interface ChallengeSnapshot {
  phase: string;
  round: number;
  bubble: { id: string; zone: number } | null;
  done: number;
  total: number;
  score: number | null;
  last: { trial: string; round: number; score: number; stars: number; popped: number; total: number; well: boolean; zones: { bubbles: number; popped: number }[] } | null;
}

interface WarmupSnapshot {
  phase: string;
  mode: string;
  card: string | null;
  levels: string[];
  message: string | null;
}

const QUERY = '?e2e=1&speed=4&preset=quick&engines=geometric,eyepixel&seed=9090&pid=P01&session=S1';

const hook = <T,>(page: Page, name: string) => page.evaluate((n) => ((window.__eek as unknown as Record<string, () => unknown>)[n]?.() ?? null) as T | null, name);
const look = (page: Page) => hook<LookSnapshot>(page, 'look');
const challenge = (page: Page) => hook<ChallengeSnapshot>(page, 'challenge');
const warmup = (page: Page) => hook<WarmupSnapshot>(page, 'warmup');
const result = (page: Page) => hook<{ mode: string; levels: string[]; zones: { cols: number; rows: number }; outcome: string; restoreRejected: boolean }>(page, 'result');
const route = (page: Page) => page.evaluate(() => (window.__eek as unknown as { route(): string }).route());

function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
  });
  page.on('worker', (w) => w.on('console', (m) => m.type() === 'error' && problems.push(`worker console error: ${m.text()}`)));
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  const requests: string[] = [];
  page.context().on('request', (r) => requests.push(r.url()));
  return { problems, requests };
}

/** Declines any offer or Re-aim card on screen ("Keep playing"); true when it did. */
async function keepPlaying(page: Page): Promise<boolean> {
  const keep = page.getByRole('button', { name: t('reaim.keep') });
  if (!(await keep.first().isVisible().catch(() => false))) return false;
  await keep.first().click({ timeout: 2000 }).catch(() => undefined);
  return true;
}

/** Title → Play (or Skip warm-up) → Get ready → Start warm-up (or Start anyway). */
async function startWarmup(page: Page, button: string): Promise<void> {
  await page.getByRole('button', { name: button }).click();
  await expect.poll(() => route(page)).toBe('ready');
  const action = page.locator('.ready-start');
  await expect.poll(async () => ((await action.isEnabled().catch(() => false)) ? 'ready' : 'waiting'), { timeout: 120_000 }).toBe('ready');
  await action.click();
  await expect.poll(() => route(page)).toBe('warmup');
}

/** Plays the warm-up to Warm-up complete: each level card at once, Carry on from Pause, Keep playing on Re-aim's cards. */
async function playWarmup(page: Page, timeoutMs: number, each?: (w: WarmupSnapshot | null) => void): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if ((await route(page)) === 'complete') return;
    const w = await warmup(page);
    if (Date.now() > deadline) throw new Error(`the warm-up did not reach #/complete: ${JSON.stringify(w)}`);
    if (w && ['fix', 'failed', 'changed'].includes(w.card ?? '')) throw new Error(`the warm-up stopped on the ${w.card} card: ${w.message}`);
    each?.(w);
    if (w?.card === 'level') await page.locator('.level-card__start').click({ timeout: 2000 }).catch(() => undefined);
    else if (w?.card === 'pause') await page.getByRole('button', { name: t('warmup.paused.carryOn') }).click({ timeout: 2000 }).catch(() => undefined);
    else await keepPlaying(page);
    await page.waitForTimeout(100);
  }
}

test.describe('Free look, Re-aim, the challenge, the export and a restored warm-up', () => {
  test.describe.configure({ timeout: 600_000 });

  test('a lit zone, Re-aim, a round to Round complete, game.csv in the export, and Skip warm-up forcing VAL6 and Re-aim', async ({ page }) => {
    const seen = watch(page);

    // 1. The Quick warm-up (assumed geometry), then three zones for the fake face.
    await page.goto(`./${QUERY}`);
    await startWarmup(page, t('title.play'));
    await playWarmup(page, 240_000);
    expect((await result(page))?.levels).toEqual(['pop', 'test']);
    const forced = await page.evaluate(() => (window.__eek as unknown as { forceZones(c: number, r: number): unknown }).forceZones(3, 1));
    expect(forced).toBeTruthy();
    await page.evaluate(() => (location.hash = '#/look'));
    await expect.poll(() => route(page)).toBe('look');

    // 2. Free look: the zones, a lit zone and the disc at the filtered gaze.
    await expect.poll(async () => (await look(page))?.phase, { timeout: 60_000 }).toBe('look');
    await expect(page.getByRole('heading', { level: 1, name: t('look.name') })).toBeAttached();
    await expect.poll(async () => (await look(page))?.lit?.index ?? null, { timeout: 60_000 }).not.toBeNull();
    const first = (await look(page))!;
    expect(first.zones).toEqual({ cols: 3, rows: 1 });
    expect(first.disc && Number.isFinite(first.disc.x) && first.disc.r > 0).toBe(true);
    await expect(page.locator('.zone-board__zone')).toHaveCount(3);
    await expect(page.locator('.zone-board__zone[data-lit]')).toHaveCount(1);
    await expect(page.getByText(t('look.sentence'))).toBeAttached();
    // Bar and dock fade after 3 s without input, and come back on a key.
    await expect.poll(async () => (await look(page))?.faded, { timeout: 10_000 }).toBe(true);
    await page.keyboard.press('Shift');
    await expect.poll(async () => (await look(page))?.faded).toBe(false);

    // 3. Re-aim (D): the two-bubble drift check over Free look, then its outcome.
    await page.keyboard.press('d');
    await expect.poll(async () => (await look(page))?.phase, { timeout: 10_000 }).toBe('reaim');
    await expect(page.getByRole('progressbar', { name: t('reaim.progress') })).toBeVisible();
    const deadline = Date.now() + 90_000;
    while ((await look(page))?.reaim == null || (await look(page))?.phase !== 'look') {
      if (Date.now() > deadline) throw new Error(`Re-aim did not finish: ${JSON.stringify(await look(page))}`);
      await keepPlaying(page);
      await page.waitForTimeout(150);
    }
    const afterReaim = (await look(page))!;
    expect(['fine', 'fixed', 'large', 'no-data']).toContain(afterReaim.reaim);
    if (afterReaim.reaim !== 'no-data') {
      expect(afterReaim.driftLog).toHaveLength(1);
      expect(afterReaim.driftLog[0]!.source).toBe('check');
      expect(afterReaim.driftLog[0]!.applied).toBe(afterReaim.reaim !== 'large');
    }

    // 4. Play the challenge: round 1 to Round complete.
    await page.mouse.move(20, 200);
    await page.mouse.move(40, 220);
    await page.getByRole('button', { name: t('look.play') }).click();
    await expect.poll(() => route(page)).toBe('challenge');
    const card = page.getByRole('dialog', { name: t('challenge.round.pop.name') });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(t('challenge.card.roundOf', { round: 1 }))).toBeVisible();
    await expect(card.getByText(t('challenge.round.pop.rule'))).toBeVisible();
    await card.locator('.level-card__start').click();
    let sawBubble = false;
    const roundDeadline = Date.now() + 180_000;
    for (;;) {
      const c = await challenge(page);
      if (c?.phase === 'complete') break;
      if (Date.now() > roundDeadline) throw new Error(`the round did not end: ${JSON.stringify(c)}`);
      if (c?.bubble) sawBubble = true;
      await keepPlaying(page);
      await page.waitForTimeout(150);
    }
    expect(sawBubble).toBe(true);
    const done = (await challenge(page))!.last!;
    expect(done.trial).toBe('game-001');
    expect(done.round).toBe(1);
    expect(done.total).toBe(16);
    expect(done.zones.reduce((n, z) => n + z.bubbles, 0)).toBe(16);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('challenge.done.headline', { popped: done.popped, total: 16 }));
    await expect(page.getByRole('img', { name: /^[0-3] of 3 stars$/ })).toBeVisible();
    await expect(page.locator('.round-panel__score')).toHaveText(/^Score [\d ]+ · Best [\d ]+$/);
    // Replay plays the gaze trail over the map (a click that reaches the button).
    await page.getByRole('button', { name: t('challenge.done.replay') }).click();
    await expect(page.locator('.round-map__mini .replay')).not.toHaveAttribute('hidden');
    await expect(page.locator('.round__actions .btn--primary')).toHaveText(done.well ? t('challenge.done.next') : t('challenge.done.reaim'));
    expect((await page.evaluate(() => (window.__eek as unknown as { state(): { challenge: { rounds: number } | null } }).state().challenge))?.rounds).toBe(1);

    // 5. The export, from Details → Data over Round complete.
    await page.locator('.topbar__details').click();
    await page.getByRole('tab', { name: 'Data' }).click();
    const downloading = page.waitForEvent('download');
    await page.locator('#data-export').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^eek-a-calibrate_P01_S1_\d{8}-\d{4}\.zip$/);
    const files = unzipSync(new Uint8Array(readFileSync((await download.path())!)));
    const text = (name: string) => {
      expect(files[name], `${name} in the zip`).toBeDefined();
      return strFromU8(files[name]!);
    };
    const names = Object.keys(files);
    for (const name of ['README.txt', 'samples.csv', 'targets.csv', 'validation.csv', 'cv.csv', 'game.csv', 'geometry.yaml', 'session.json']) expect(names).toContain(name);
    expect(names).not.toContain('dataset.json');

    const samples = text('samples.csv').trimEnd().split('\n');
    expect(samples[0]).toBe(SAMPLES_HEADER.join(','));
    const rows = samples.slice(1).map((line) => line.split(','));
    for (const row of rows) expect(row.length).toBe(SAMPLES_HEADER.length);
    const trials = new Set(rows.map((r) => r[2]));
    for (const trial of ['calibration', 'validation-1', 'game-001']) expect(trials).toContain(trial);
    if (afterReaim.reaim !== 'no-data') expect(trials).toContain('drift-1');
    expect(rows.every((r) => r[0] === 'P01' && r[1] === 'S1')).toBe(true);
    const times = rows.map((r) => Number(r[5]));
    expect(times.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
    const gameRows = rows.filter((r) => r[2] === 'game-001');
    expect(gameRows.length).toBeGreaterThan(5);
    expect(gameRows.every((r) => r[3] === 'game')).toBe(true);
    const withBubble = gameRows.filter((r) => r[4] !== '');
    expect(withBubble.length).toBeGreaterThan(0);
    const tx = SAMPLES_HEADER.indexOf('target_x');
    expect(withBubble.every((r) => /^G001-B\d\d$/.test(r[4]!) && Number.isFinite(Number(r[tx])) && r[tx] !== '')).toBe(true);

    const targets = text('targets.csv').trimEnd().split('\n');
    expect(targets[0]).toBe(TARGETS_HEADER.join(','));
    expect(targets.filter((l) => l.startsWith('game-001,')).length).toBe(16);
    expect(targets.filter((l) => l.startsWith('game-001,')).every((l) => l.split(',')[2] === 'game')).toBe(true);
    expect(text('validation.csv').split('\n')[0]).toBe(VALIDATION_HEADER.join(','));
    expect(text('cv.csv').split('\n')[0]).toBe(CV_HEADER.join(','));

    const game = text('game.csv').trimEnd().split('\n');
    expect(game[0]).toBe(GAME_HEADER.join(','));
    const bubbles = game.slice(1).map((l) => l.split(',')).filter((r) => r[6] === 'bubble');
    expect(bubbles).toHaveLength(16);
    expect(bubbles.filter((r) => r[13] === 'popped')).toHaveLength(done.popped);
    expect(bubbles.every((r) => ['popped', 'missed'].includes(r[13]!))).toBe(true);

    const readme = text('README.txt');
    expect(readme).toContain(EEK_A_GAZE_COMMAND);
    expect(readme).toMatch(/game\.csv +every challenge bubble/);
    expect(readme).toContain('Degree values are approximate');
    const yaml = text('geometry.yaml').trimEnd().split('\n').map((line) => line.split(': '));
    expect(yaml.map(([k]) => k)).toEqual([...GEOMETRY_KEYS]);
    const yamlValues = Object.fromEntries(yaml) as Record<string, string>;
    expect(yamlValues.origin).toBe('top_left');
    expect(yamlValues.units).toBe('pixels');
    expect(Number(yamlValues.viewing_distance_mm)).toBeGreaterThan(0);

    const session = JSON.parse(text('session.json')) as {
      schema: string;
      participant: string;
      session: string;
      exportedAt: string;
      app: { version: string };
      assets: Record<string, string>;
      driftLog: { source: string }[];
      protocol: { preset: string; seeds: { session: number } };
      game: { setup: string; warmupLength: string; warmups: { zones: { cols: number; rows: number }; stars: number; levels: unknown[] }[]; rounds: { trial: string; seed: number; score: number; stars: number; zones: unknown[]; ended: string }[] };
    };
    expect(session.schema).toBe(SESSION_SCHEMA);
    expect(session.participant).toBe('P01');
    expect(session.session).toBe('S1');
    expect(Number.isNaN(Date.parse(session.exportedAt))).toBe(false);
    expect(typeof session.app.version).toBe('string');
    for (const sha of Object.values(session.assets)) expect(sha).toMatch(/^[0-9a-f]{64}$/);
    expect(session.protocol.seeds.session).toBe(9090);
    expect(session.game.warmupLength).toBe('quick');
    expect(session.game.warmups.length).toBeGreaterThanOrEqual(1);
    expect(session.game.warmups.at(-1)!.zones).toEqual({ cols: 3, rows: 1 });
    expect(session.game.rounds).toHaveLength(1);
    expect(session.game.rounds[0]).toMatchObject({ trial: 'game-001', score: done.score, stars: done.stars, ended: 'complete' });
    expect(Number.isInteger(session.game.rounds[0]!.seed)).toBe(true);
    expect(session.game.rounds[0]!.zones).toHaveLength(3);
    for (const e of session.driftLog) expect(['check', 'game']).toContain(e.source);
    await page.keyboard.press('Escape');

    // 6. The stored warm-up survives a reload: Skip warm-up runs the VAL6 Test round, then, when
    // it passes, the forced Re-aim before Warm-up complete; otherwise it is not used.
    await page.goto(`./${QUERY}`);
    const skip = page.getByRole('button', { name: t('title.skip') });
    await expect(skip).toBeVisible({ timeout: 15_000 });
    await startWarmup(page, t('title.skip'));
    let sawReaim = false;
    await playWarmup(page, 240_000, (w) => {
      if (w?.phase === 'reaim') sawReaim = true;
    });
    const restored = (await result(page))!;
    expect(restored.mode).toBe('restore');
    expect(restored.levels).toEqual(['test']);
    if (restored.restoreRejected) {
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('complete.headline.restore'));
    } else {
      expect(sawReaim).toBe(true);
    }

    const origin = new URL(page.url()).origin;
    for (const url of seen.requests) {
      if (url.startsWith('data:') || url.startsWith('blob:')) continue;
      expect(new URL(url).origin, `request to ${url}`).toBe(origin);
    }
    expect(seen.problems).toEqual([]);
  });
});
