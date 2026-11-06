// Shared steps of the game's end-to-end specs (spec §10.4, §17.12): the test hooks of
// `window.__eek` per screen, watching a page for errors and requests, and playing the game by
// click or tap: Title → Get ready → the warm-up → Warm-up complete, a challenge round. The fake
// face looks at nothing, so a warm-up rarely unlocks two zones; `__eek.forceZones` (test mode
// only) gives the result the zones Free look and the challenge need.
import { expect, type Locator, type Page } from '@playwright/test';
import { t } from '../../../src/app/strings.en-GB.ts';

export interface WarmupSnapshot {
  phase: string;
  mode: string;
  card: string | null;
  cards: string[];
  levels: string[];
  level: { key: string; number: number; of: number } | null;
  item: { itemId: string; phase: string } | null;
  done: number;
  total: number;
  geometry: ScreenGeometryLike | null;
  message: string | null;
}

export interface ScreenGeometryLike {
  viewportWpx: number;
  viewportHpx: number;
  fullscreen: boolean;
  pxPerMmSource: string;
  insets?: { top: number; right: number; bottom: number; left: number };
  presentationMode?: 'fullscreen' | 'viewport';
}

export interface WarmupResult {
  mode: string;
  zones: { cols: number; rows: number };
  stars: number;
  outcome: string;
  verdict: string;
  cause: string | null;
  marks: { itemId: string; hit: boolean; targetPx: [number, number] }[];
  levels: string[];
  restoreRejected: boolean;
}

export interface LookSnapshot {
  phase: string;
  faded: boolean;
  zones: { cols: number; rows: number } | null;
  lit: { index: number; col: number; row: number } | null;
  disc: { x: number; y: number; r: number; greyed: boolean } | null;
  offer: string | null;
  reaim: string | null;
  driftLog: { tMs: number; offsetDeg: [number, number]; applied: boolean; source?: string }[];
}

export interface ChallengeSnapshot {
  phase: string;
  round: number;
  zones: { cols: number; rows: number } | null;
  bubble: { id: string; zone: number; x: number; y: number; r: number } | null;
  done: number;
  total: number;
  score: number | null;
  paused: boolean;
  last: { trial: string; round: number; score: number; stars: number; popped: number; total: number; well: boolean; zones: { bubbles: number; popped: number }[] } | null;
}

export const hook = <T,>(page: Page, name: string) => page.evaluate((n) => ((window.__eek as unknown as Record<string, () => unknown>)[n]?.() ?? null) as T | null, name);
export const route = (page: Page) => page.evaluate(() => window.__eek!.route());
export const warmup = (page: Page) => hook<WarmupSnapshot>(page, 'warmup');
export const result = (page: Page) => hook<WarmupResult>(page, 'result');
export const look = (page: Page) => hook<LookSnapshot>(page, 'look');
export const challenge = (page: Page) => hook<ChallengeSnapshot>(page, 'challenge');
export const appState = <T,>(page: Page) => page.evaluate(() => window.__eek!.state()) as Promise<T>;

/** Collects console errors (page and workers), page errors, `Fit:` log lines and every request. */
export function watch(page: Page) {
  const problems: string[] = [];
  const logs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
    if (m.text().startsWith('Fit:')) logs.push(m.text());
  });
  page.on('worker', (w) => w.on('console', (m) => m.type() === 'error' && problems.push(`worker console error: ${m.text()}`)));
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  const requests: string[] = [];
  page.context().on('request', (r) => requests.push(r.url()));
  return { problems, logs, requests };
}

/** Every request went to the page's own origin (data: and blob: URLs aside). */
export function sameOrigin(page: Page, requests: readonly string[]): void {
  const origin = new URL(page.url()).origin;
  for (const url of requests) {
    if (url.startsWith('data:') || url.startsWith('blob:')) continue;
    expect(new URL(url).origin, `request to ${url}`).toBe(origin);
  }
}

/** A measured desktop geometry (card scale and a blind-spot focal length), as the test hook of §7 injects it. */
export async function injectGeometry(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window.__eek as unknown as { injectGeometry(g: unknown): void }).injectGeometry({
      screen: { viewportWpx: 1280, viewportHpx: 720, screenWpx: 1280, screenHpx: 720, dpr: 1, fullscreen: false, pxPerMm: 4.2, pxPerMmSource: 'card' },
      distance: { focalPx: 520, focalSource: 'blind-spot', blindSpotMm: 600, blindSpotSdMm: 14, irisMm: 11.7 },
      refDistanceMm: 600,
      degreesApproximate: false,
    });
  });
}

const press = (l: Locator, tap: boolean, timeout?: number) => (tap ? l.tap({ timeout }) : l.click({ timeout }));

/** Title → Play (or the named button) → Get ready → Start warm-up (or Start anyway), by click or tap. */
export async function startWarmup(page: Page, o: { tap?: boolean; button?: string } = {}): Promise<void> {
  const tap = o.tap ?? false;
  await press(page.getByRole('button', { name: o.button ?? t('title.play') }), tap);
  await expect.poll(() => route(page)).toBe('ready');
  const action = page.locator('.ready-start');
  await expect.poll(async () => ((await action.isEnabled().catch(() => false)) ? 'ready' : 'waiting'), { timeout: 120_000 }).toBe('ready');
  await press(action, tap);
  await expect.poll(() => route(page)).toBe('warmup');
}

/** Declines any offer or Re-aim card on screen ("Keep playing"); true when it did. */
export async function keepPlaying(page: Page, tap = false): Promise<boolean> {
  const keep = page.getByRole('button', { name: t('reaim.keep') }).first();
  if (!(await keep.isVisible().catch(() => false))) return false;
  await press(keep, tap, 2000).catch(() => undefined);
  return true;
}

/**
 * Plays the warm-up until `done()` holds (by default, until Warm-up complete): starts each level
 * card at once (Start now), carries on from a Pause card and keeps playing past a Re-aim card;
 * `each` runs on every poll. Fails on a card that ends the warm-up.
 */
export async function playWarmup(page: Page, o: { tap?: boolean; timeoutMs?: number; each?: (w: WarmupSnapshot | null) => Promise<void> | void; done?: () => Promise<boolean>; allow?: readonly string[] } = {}): Promise<void> {
  const tap = o.tap ?? false;
  const deadline = Date.now() + (o.timeoutMs ?? 240_000);
  const done = o.done ?? (async () => (await route(page)) === 'complete');
  for (;;) {
    if (await done()) return;
    const w = await warmup(page);
    if (Date.now() > deadline) throw new Error(`the warm-up did not finish on ${await route(page)}: ${JSON.stringify(w)}`);
    if (w && ['fix', 'failed', 'changed'].filter((c) => !(o.allow ?? []).includes(c)).includes(w.card ?? '')) throw new Error(`the warm-up stopped on the ${w.card} card: ${w.message}`);
    await o.each?.(w);
    if (w?.card === 'level') await press(page.locator('.level-card__start'), tap, 2000).catch(() => undefined);
    else if (w?.card === 'pause') await press(page.getByRole('button', { name: t('warmup.paused.carryOn') }), tap, 2000).catch(() => undefined);
    else await keepPlaying(page, tap);
    await page.waitForTimeout(100);
  }
}

/** Gives the latest Warm-up complete `cols` × `rows` zones (test mode only) and checks it took. */
export async function forceZones(page: Page, cols: number, rows: number): Promise<void> {
  const forced = await page.evaluate(([c, r]) => (window.__eek as unknown as { forceZones(c: number, r: number): unknown }).forceZones(c!, r!), [cols, rows]);
  expect(forced, 'forceZones needs a Warm-up complete').toBeTruthy();
}

/** Starts the round card on screen and plays the round to Round complete; true when a bubble was seen. */
export async function playRound(page: Page, o: { tap?: boolean; timeoutMs?: number } = {}): Promise<boolean> {
  const tap = o.tap ?? false;
  await expect(page.locator('.level-card__start')).toBeVisible({ timeout: 30_000 });
  await press(page.locator('.level-card__start'), tap);
  let sawBubble = false;
  const deadline = Date.now() + (o.timeoutMs ?? 180_000);
  for (;;) {
    const c = await challenge(page);
    if (c?.phase === 'complete') return sawBubble;
    if (Date.now() > deadline) throw new Error(`the round did not end: ${JSON.stringify(c)}`);
    if (c?.bubble) sawBubble = true;
    await keepPlaying(page, tap);
    await page.waitForTimeout(150);
  }
}
