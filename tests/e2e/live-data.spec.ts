// live-data.spec.ts (spec §10.4, WP9): after a Quick calibration with assumed geometry, the live
// dot renders, a recording with a marker is made, a drift check runs, and the export zip parses and
// validates (file set, CSV headers, geometry.yaml keys, session.json schema, README notes). Then the
// calibration stored in IndexedDB survives a reload, and restoring it forces a VAL6 check before
// any live gaze. Accuracy is not asserted: the fake face does not look at the targets.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { GEOMETRY_KEYS } from '../../src/core/export/geometryYaml.ts';
import { EEK_A_GAZE_COMMAND } from '../../src/core/export/readme.ts';
import { SAMPLES_HEADER } from '../../src/core/export/samplesCsv.ts';
import { SESSION_SCHEMA } from '../../src/core/export/sessionJson.ts';
import { TARGETS_HEADER } from '../../src/core/export/targetsCsv.ts';
import { CV_HEADER, EVENTS_HEADER, VALIDATION_HEADER } from '../../src/core/export/validationCsv.ts';

interface LiveSnapshot {
  mode: string;
  results: number;
  dots: number;
  lastDot: { x: number; y: number; greyed: boolean } | null;
  recording: boolean;
  estimator: string | null;
  blocks: { trial: string; kind: string; frames: number; markers: number }[];
  driftLog: { tMs: number; offsetDeg: [number, number]; applied: boolean }[];
  restored: { key: string; validated: boolean } | null;
  revalidationNeeded: boolean;
  lastCheck: { kind: string; targets: number; verdict: string | null; action: string | null } | null;
  message: string | null;
}

const QUERY = '?e2e=1&speed=4&preset=quick&engines=geometric,eyepixel&seed=9090&pid=P01&session=S1';

const live = (page: Page) => page.evaluate(() => ((window.__eek as unknown as { live?: () => unknown }).live?.() ?? null) as LiveSnapshot | null);
const route = (page: Page) => page.evaluate(() => (window.__eek as unknown as { route(): string }).route());
const appState = (page: Page) => page.evaluate(() => (window.__eek as unknown as { state(): unknown }).state() as { fit: unknown; validation: { mode: string; estimator: string; targets: unknown[] }[] | null });

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

/**
 * Answers every stimulus card until `done()` holds: the button named by `pick` for the card's
 * title (Continue or Resume by default). Returns the titles seen.
 */
async function drive(page: Page, done: () => Promise<boolean>, timeoutMs: number, pick: (title: string) => RegExp = () => /^(Continue|Resume)$/): Promise<string[]> {
  const seen: string[] = [];
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await done()) return seen;
    if (Date.now() > deadline) throw new Error(`timed out; cards seen: ${seen.join(' | ')}; live: ${JSON.stringify(await live(page))}`);
    const card = page.locator('.stimulus-card');
    if (await card.isVisible().catch(() => false)) {
      const title = (await card.locator('h2').textContent().catch(() => null)) ?? '';
      if (seen[seen.length - 1] !== title) seen.push(title);
      await card.getByRole('button', { name: pick(title) }).first().click({ timeout: 2000 }).catch(() => undefined);
    }
    await page.waitForTimeout(150);
  }
}

test.describe('Live gaze, drift, export and a restored calibration', () => {
  test.describe.configure({ timeout: 480_000 });

  test('the live dot renders, the drift check runs, the export validates, and a restored profile forces VAL6', async ({ page }) => {
    const seen = watch(page);

    // 1. A Quick calibration and validation (assumed geometry), then on to Live.
    await page.goto(`./${QUERY}#/calibrate`);
    const startCalibration = page.getByRole('button', { name: 'Start calibration' });
    await expect(startCalibration).toBeEnabled({ timeout: 180_000 });
    await startCalibration.click();
    await drive(page, async () => (await route(page)) === 'results', 240_000);
    await page.getByRole('button', { name: 'Accept and continue to live gaze' }).click();
    await expect.poll(() => route(page)).toBe('live');
    const startLive = page.getByRole('button', { name: 'Start live gaze' });
    await expect(startLive).toBeEnabled({ timeout: 120_000 });
    await expect(page.getByText('This calibration is stored on this device', { exact: false })).toBeVisible({ timeout: 30_000 });

    // 2. The live dot renders on the stage.
    await startLive.click();
    await expect.poll(async () => (await live(page))?.dots ?? 0, { timeout: 60_000 }).toBeGreaterThan(5);
    const first = (await live(page))!;
    expect(first.mode).toBe('live');
    expect(first.lastDot).not.toBeNull();
    expect(Number.isFinite(first.lastDot!.x) && Number.isFinite(first.lastDot!.y)).toBe(true);
    await expect(page.getByRole('toolbar', { name: 'Live gaze controls' })).toBeVisible();

    // 3. A recording with one marker (keys R, M, R).
    await page.keyboard.press('r');
    await expect.poll(async () => (await live(page))?.recording).toBe(true);
    await page.waitForTimeout(1200);
    await page.keyboard.press('m');
    await page.waitForTimeout(400);
    await page.keyboard.press('r');
    const recorded = (await live(page))!;
    const liveBlock = recorded.blocks.find((b) => b.trial === 'live-001');
    expect(liveBlock?.kind).toBe('live');
    expect(liveBlock!.frames).toBeGreaterThan(5);
    expect(liveBlock!.markers).toBe(1);

    // 4. A drift check (key D); a correction too large to apply is declined.
    await page.keyboard.press('d');
    const driftCards = await drive(page, async () => (await live(page))?.mode === 'live' && (await live(page))?.lastCheck?.kind === 'drift', 90_000, (title) =>
      /drifted too far/.test(title) ? /^Not now$/ : /^(Continue|Resume)$/,
    );
    expect(driftCards).toContain('Drift check: look at each dot');
    const afterDrift = (await live(page))!;
    expect(afterDrift.blocks.some((b) => b.trial === 'drift-1' && b.kind === 'drift' && b.frames > 0)).toBe(true);
    if (afterDrift.lastCheck!.action !== 'no-data') {
      expect(afterDrift.driftLog).toHaveLength(1);
      expect(afterDrift.driftLog[0]!.applied).toBe(afterDrift.lastCheck!.action === 'apply');
      expect(afterDrift.driftLog[0]!.offsetDeg.every(Number.isFinite)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await live(page))?.mode).toBe('idle');
    await expect(page.locator('.stimulus-stage')).toHaveCount(0);

    // 5. The export zip parses and validates.
    await page.getByRole('link', { name: 'Export or manage your data' }).click();
    await expect.poll(() => route(page)).toBe('data');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export zip' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^eek-a-calibrate_P01_S1_\d{8}-\d{4}\.zip$/);
    const files = unzipSync(new Uint8Array(readFileSync((await download.path())!)));
    const text = (name: string) => {
      expect(files[name], `${name} in the zip`).toBeDefined();
      return strFromU8(files[name]!);
    };
    const names = Object.keys(files);
    for (const name of ['README.txt', 'samples.csv', 'targets.csv', 'validation.csv', 'cv.csv', 'geometry.yaml', 'session.json', 'markers.csv']) expect(names).toContain(name);
    expect(names).not.toContain('dataset.json');

    const samples = text('samples.csv').trimEnd().split('\n');
    expect(samples[0]).toBe(SAMPLES_HEADER.join(','));
    const rows = samples.slice(1).map((line) => line.split(','));
    for (const row of rows) expect(row.length).toBe(SAMPLES_HEADER.length);
    const trials = new Set(rows.map((r) => r[2]));
    for (const trial of ['calibration', 'validation-1', 'drift-1', 'live-001']) expect(trials).toContain(trial);
    expect(rows.every((r) => r[0] === 'P01' && r[1] === 'S1')).toBe(true);
    const liveRows = rows.filter((r) => r[2] === 'live-001');
    expect(liveRows.every((r) => r[3] === 'live')).toBe(true);
    const times = rows.map((r) => Number(r[5]));
    expect(times.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);

    expect(text('targets.csv').split('\n')[0]).toBe(TARGETS_HEADER.join(','));
    expect(text('validation.csv').split('\n')[0]).toBe(VALIDATION_HEADER.join(','));
    expect(text('cv.csv').split('\n')[0]).toBe(CV_HEADER.join(','));
    expect(text('markers.csv').trimEnd().split('\n')).toHaveLength(2);
    const readme = text('README.txt');
    expect(readme).toContain(EEK_A_GAZE_COMMAND);
    expect(readme).toContain('Degree values are approximate');
    if (names.includes('events.csv')) expect(text('events.csv').split('\n')[0]).toBe(EVENTS_HEADER.join(','));
    else expect(readme).toContain('Left out: events.csv');

    const yaml = text('geometry.yaml').trimEnd().split('\n').map((line) => line.split(': '));
    expect(yaml.map(([k]) => k)).toEqual([...GEOMETRY_KEYS]);
    const yamlValues = Object.fromEntries(yaml) as Record<string, string>;
    expect(yamlValues.origin).toBe('top_left');
    expect(yamlValues.units).toBe('pixels');
    expect(Number(yamlValues.viewing_distance_mm)).toBeGreaterThan(0);
    expect(Number.isInteger(Number(yamlValues.screen_width_px))).toBe(true);

    const session = JSON.parse(text('session.json')) as Record<string, unknown> & {
      app: { version: string; commit: string };
      assets: Record<string, string>;
      environment: { userAgent: string };
      host: { kind: string };
      geometry: { degreesApproximate: boolean; screen: { viewportWpx: number } };
      protocol: { preset: string; seeds: { session: number }; schedules: { kind: string }[] };
      fit: { schema: string };
      selection: { estimator: string; reason: string };
      validations: unknown[];
      driftLog: unknown[];
      thresholds: { appendixA: Record<string, unknown> };
      licences: { engines: Record<string, { licence: { code: string }; citation: string }> };
      exportedAt: string;
    };
    expect(session.schema).toBe(SESSION_SCHEMA);
    expect(session.participant).toBe('P01');
    expect(session.session).toBe('S1');
    expect(Number.isNaN(Date.parse(session.exportedAt))).toBe(false);
    expect(typeof session.app.version).toBe('string');
    expect(Object.values(session.assets).length).toBeGreaterThanOrEqual(10);
    for (const sha of Object.values(session.assets)) expect(sha).toMatch(/^[0-9a-f]{64}$/);
    expect(session.environment.userAgent.length).toBeGreaterThan(0);
    expect(['worker', 'inline']).toContain(session.host.kind);
    expect(session.geometry.degreesApproximate).toBe(true);
    expect(session.protocol.preset).toBe('quick');
    expect(session.protocol.seeds.session).toBe(9090);
    expect(session.protocol.schedules.map((s) => s.kind)).toEqual(expect.arrayContaining(['calibration', 'validation', 'drift']));
    expect(session.fit.schema).toBe('eek-a-calibrate/fit@1');
    expect(typeof session.selection.reason).toBe('string');
    expect(session.validations.length).toBeGreaterThan(0);
    expect(session.driftLog).toHaveLength(afterDrift.driftLog.length);
    expect(session.thresholds.appendixA.DRIFT).toBeDefined();
    for (const engine of ['blazegaze', 'peekr', 'geometric', 'eyepixel']) {
      expect(session.licences.engines[engine]?.licence.code).toBe('MIT');
      expect(session.licences.engines[engine]?.citation.length).toBeGreaterThan(10);
    }

    // 6. The stored profile survives a reload; restoring it forces VAL6 before any live gaze.
    await page.reload();
    await expect.poll(() => route(page)).toBe('data');
    expect((await appState(page)).fit).toBeNull();
    const stored = page.locator('[data-profile]');
    await expect(stored.first()).toBeVisible({ timeout: 15_000 });
    await stored.first().getByRole('button', { name: 'Use this calibration (validation required)' }).click();
    await expect.poll(() => route(page)).toBe('live');
    const restored = (await live(page))!;
    expect(restored.restored?.validated).toBe(false);
    expect(restored.dots).toBe(0);
    const validate = page.getByRole('button', { name: 'Validate the stored calibration (6 dots)' });
    await expect(validate).toBeEnabled({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Start live gaze' })).toHaveCount(0);
    await validate.click();
    const cards = await drive(page, async () => (await live(page))?.lastCheck?.kind === 'validation', 120_000);
    expect(cards).toContain('Validation: look at each dot');
    const checked = (await live(page))!;
    expect(checked.lastCheck!.targets).toBe(6);
    expect(checked.dots).toBe(0);
    const passed = checked.lastCheck!.verdict === 'good' || checked.lastCheck!.verdict === 'acceptable';
    const reports = (await appState(page)).validation!;
    expect(reports.filter((r) => r.mode === 'own').every((r) => r.targets.length === 6)).toBe(true);
    // The verdict decides: a pass leads to the forced drift check and live gaze; otherwise the stored calibration stays unusable.
    await drive(page, async () => {
      const s = await live(page);
      return s !== null && (s.mode === 'idle' || (s.mode === 'live' && s.lastCheck?.kind === 'drift'));
    }, 90_000, (title) => (/drifted too far/.test(title) ? /^Not now$/ : /^(Continue|Resume)$/));
    const end = (await live(page))!;
    expect(end.restored?.validated).toBe(passed);
    if (!passed) {
      expect(end.mode).toBe('idle');
      expect(end.dots).toBe(0);
      await expect(page.locator('main').getByText('did not pass its validation', { exact: false })).toBeVisible();
    } else {
      expect(end.blocks.some((b) => b.kind === 'drift')).toBe(true);
    }

    const origin = new URL(page.url()).origin;
    for (const url of seen.requests) {
      if (url.startsWith('data:') || url.startsWith('blob:')) continue;
      expect(new URL(url).origin, `request to ${url}`).toBe(origin);
    }
    expect(seen.problems).toEqual([]);
  });
});
