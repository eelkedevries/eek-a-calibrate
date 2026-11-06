// mobile.spec.ts (spec §14.2.11, §17.3.4, §17.6, §17.12): a phone, emulated (isMobile, hasTouch,
// a notch and a home indicator as safe-area insets) with the portrait fake camera (a 480 × 640
// file from scripts/make-fake-video.sh --portrait). Held upright, the game's warm-up completes by
// taps alone without element fullscreen, and every bubble, as scheduled and as drawn on the stage,
// lies inside the safe rectangle where layoutToPx puts it with the measured insets; turning the
// phone in Free look shows "The screen changed". Held sideways, the warm-up completes by taps with
// the pip line on the camera side and the corner cluster on the far side, and turned round the
// other way (the camera on the right) the stimulus HUD follows. Turning the phone during a level
// shows "The screen changed", and "Warm up again" returns to the Level 1 card. Accuracy is not
// asserted: the fake face does not look at the targets.
import { fileURLToPath } from 'node:url';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { t } from '../../src/app/strings.en-GB.ts';
import { layoutToPx, safeRect } from '../../src/core/geometry/screen.ts';
import { appState, forceZones, look, playWarmup, result, route, sameOrigin, startWarmup, warmup, watch, type ScreenGeometryLike } from './helpers/game.ts';

const PORTRAIT_VIDEO = fileURLToPath(new URL('../fixtures/generated/face-portrait.mjpeg', import.meta.url));
const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };
/** An iPhone-like notch and home indicator (CSS px), upright and on its side. */
const INSETS_PORTRAIT = { top: 47, right: 0, bottom: 34, left: 0 };
const INSETS_LANDSCAPE = { top: 0, right: 47, bottom: 21, left: 47 };

test.use({
  viewport: PORTRAIT,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${PORTRAIT_VIDEO}`,
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
});

interface Item {
  kind: string;
  xNorm: number;
  yNorm: number;
}

interface AppState {
  geometry: { degreesApproximate: boolean } | null;
  calibration: { geometry: { screen: ScreenGeometryLike }; schedule: { items: Item[] }; frames: { meta: { videoW: number; videoH: number } }[] } | null;
}

/** Counts fullscreen requests from the first script on, and sets the safe-area insets. */
async function instrument(page: Page, insets: typeof INSETS_PORTRAIT): Promise<CDPSession> {
  await page.addInitScript(() => {
    const w = window as unknown as { __fullscreenRequests: number };
    w.__fullscreenRequests = 0;
    const original = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = function (this: Element, options?: FullscreenOptions) {
      w.__fullscreenRequests += 1;
      return original.call(this, options);
    };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets } as never);
  return cdp;
}

const fullscreenRequests = (page: Page) => page.evaluate(() => (window as unknown as { __fullscreenRequests: number }).__fullscreenRequests);

function insideSafeRect(items: readonly Item[], g: ScreenGeometryLike): void {
  const r = safeRect(g as Parameters<typeof safeRect>[0]);
  const targets = items.filter((i) => i.kind === 'target');
  expect(targets.length).toBeGreaterThan(0);
  for (const i of targets) {
    const [x, y] = layoutToPx(i.xNorm, i.yNorm, g as Parameters<typeof layoutToPx>[2]);
    expect(x, `${JSON.stringify(i)} x`).toBeGreaterThan(r.x);
    expect(x, `${JSON.stringify(i)} x`).toBeLessThan(r.x + r.w);
    expect(y, `${JSON.stringify(i)} y`).toBeGreaterThan(r.y);
    expect(y, `${JSON.stringify(i)} y`).toBeLessThan(r.y + r.h);
  }
}

interface Drawn {
  x: number;
  y: number;
}

/**
 * The centre (CSS px) of the bubble as drawn on the game stage's canvas, from the bounding box of
 * its near-black pixels (the bubble's solid edge and the core; the dashed ghost ring and the
 * bubble's fill are lighter), or null when no whole bubble is drawn (the edge cut off by the
 * canvas, or the pop's burst, whose box is not square).
 */
async function drawnBubble(page: Page): Promise<Drawn | null> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.stimulus-stage canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || canvas.width < 2 || canvas.clientWidth < 2) return null;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = 4 * (y * width + x);
        if ((data[i] as number) > 60 || (data[i + 1] as number) > 60 || (data[i + 2] as number) > 60) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0 || Math.abs(x1 - x0 - (y1 - y0)) > 2) return null;
    const scale = canvas.width / canvas.clientWidth;
    return { x: (x0 + x1 + 1) / 2 / scale, y: (y0 + y1 + 1) / 2 / scale };
  });
}

/** Every drawn bubble lies inside the safe rectangle, where layoutToPx puts a scheduled target. */
function drawnInsideSafeRect(drawn: readonly Drawn[], items: readonly Item[], g: ScreenGeometryLike): void {
  const r = safeRect(g as Parameters<typeof safeRect>[0]);
  const scheduled = items.filter((i) => i.kind === 'target').map((i) => layoutToPx(i.xNorm, i.yNorm, g as Parameters<typeof layoutToPx>[2]));
  const matched = new Set<number>();
  for (const d of drawn) {
    expect(d.x, `drawn ${JSON.stringify(d)}`).toBeGreaterThan(r.x);
    expect(d.x, `drawn ${JSON.stringify(d)}`).toBeLessThan(r.x + r.w);
    expect(d.y, `drawn ${JSON.stringify(d)}`).toBeGreaterThan(r.y);
    expect(d.y, `drawn ${JSON.stringify(d)}`).toBeLessThan(r.y + r.h);
    const k = scheduled.findIndex(([x, y]) => Math.hypot(x - d.x, y - d.y) <= 2);
    expect(k, `drawn ${JSON.stringify(d)} is no scheduled target (${JSON.stringify(scheduled)})`).toBeGreaterThanOrEqual(0);
    matched.add(k);
  }
  // Several different bubbles were seen, so the check covers more than one position.
  expect(matched.size).toBeGreaterThanOrEqual(3);
}

/** Plays the warm-up by taps to Warm-up complete, sampling the Pop the dots bubbles as drawn. */
async function tapWarmupSampling(page: Page): Promise<Drawn[]> {
  const drawn: Drawn[] = [];
  await playWarmup(page, {
    tap: true,
    timeoutMs: 300_000,
    each: async (w) => {
      if (w?.phase === 'running' && w.level?.key === 'pop' && w.item) {
        const d = await drawnBubble(page);
        if (d) drawn.push(d);
      }
    },
  });
  return drawn;
}

/** The warm-up's geometry: viewport mode, the measured insets, and every bubble in the safe rectangle. */
async function checkWarmupGeometry(page: Page, drawn: readonly Drawn[], insets: typeof INSETS_PORTRAIT, portrait: boolean): Promise<void> {
  const r = (await result(page))!;
  expect(r.levels).toEqual(['pop', 'test']);
  expect(r.marks).toHaveLength(6);
  await expect(page.locator('.zone-map__mark')).toHaveCount(6);
  await expect(page.locator('.complete__actions .btn--primary')).toBeVisible();
  const state = await appState<AppState>(page);
  const cal = state.calibration!;
  const { videoW, videoH } = cal.frames[0]!.meta;
  expect(videoH, `${videoW} × ${videoH}`).toBeGreaterThan(videoW);
  expect(state.geometry!.degreesApproximate).toBe(true);
  const g = cal.geometry.screen;
  expect(g.presentationMode).toBe('viewport');
  expect(g.fullscreen).toBe(false);
  expect(g.viewportWpx < g.viewportHpx).toBe(portrait);
  expect(g.insets).toEqual(insets);
  insideSafeRect(cal.schedule.items, g);
  drawnInsideSafeRect(drawn, cal.schedule.items, g);
}

/** The pip line runs along the camera edge and the corner cluster sits on the far side (design §4.4). */
async function checkHud(page: Page, camera: 'left' | 'right'): Promise<void> {
  await expect.poll(() => page.locator('.app').getAttribute('data-camera')).toBe(camera);
  const pips = (await page.locator('.pips').boundingBox())!;
  const corner = (await page.locator('.corner').boundingBox())!;
  const W = LANDSCAPE.width;
  expect(pips.height, 'the pip line is vertical').toBeGreaterThan(pips.width);
  if (camera === 'left') {
    expect(pips.x + pips.width).toBeLessThan(W / 4);
    expect(corner.x).toBeGreaterThan(W / 2);
  } else {
    expect(pips.x).toBeGreaterThan((3 * W) / 4);
    expect(corner.x + corner.width).toBeLessThan(W / 2);
  }
}

test.describe('A phone held upright (portrait camera, touch only)', () => {
  test.describe.configure({ timeout: 480_000 });

  test('the warm-up completes by taps without fullscreen, bubbles inside the safe rectangle; turning the phone in Free look shows "The screen changed"', async ({ page }) => {
    const seen = watch(page);
    await instrument(page, INSETS_PORTRAIT);
    await page.goto('./?e2e=1&speed=4&preset=quick&engines=geometric,eyepixel&seed=2613');
    await startWarmup(page, { tap: true });
    const drawn = await tapWarmupSampling(page);
    await checkWarmupGeometry(page, drawn, INSETS_PORTRAIT, true);

    // Free look, then a turn of the phone.
    await forceZones(page, 1, 3);
    await page.evaluate(() => (location.hash = '#/look'));
    await expect.poll(async () => (await look(page))?.phase, { timeout: 60_000 }).toBe('look');
    await page.setViewportSize(LANDSCAPE);
    await expect.poll(async () => (await look(page))?.phase).toBe('changed');
    const card = page.getByRole('alertdialog', { name: t('warmup.changed.title') });
    await expect(card).toBeVisible();
    await expect(card).toContainText(t('warmup.changed.rotated'));
    const box = (await card.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(LANDSCAPE.height);
    expect(box.x + box.width).toBeLessThanOrEqual(LANDSCAPE.width);
    expect(await fullscreenRequests(page)).toBe(0);
    sameOrigin(page, seen.requests);
    expect(seen.problems).toEqual([]);
  });

  test('turning the phone during a level shows "The screen changed"; Warm up again returns to Level 1', async ({ page }) => {
    const seen = watch(page);
    await instrument(page, INSETS_PORTRAIT);
    await page.goto('./?e2e=1&speed=2&preset=quick&engines=geometric&seed=2614');
    await startWarmup(page, { tap: true });
    await playWarmup(page, {
      tap: true,
      timeoutMs: 60_000,
      done: async () => {
        const w = await warmup(page);
        return w?.phase === 'running' && w.item !== null;
      },
    });
    await page.setViewportSize(LANDSCAPE);
    await expect.poll(async () => (await warmup(page))?.card).toBe('changed');
    const card = page.getByRole('alertdialog', { name: t('warmup.changed.title') });
    await expect(card).toBeVisible();
    await expect(card).toContainText(t('warmup.changed.rotated'));
    // The card lies inside the turned viewport.
    const box = (await card.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(LANDSCAPE.height);
    expect(box.x + box.width).toBeLessThanOrEqual(LANDSCAPE.width);
    expect((await appState<AppState>(page)).calibration).toBeNull();

    // Turned back, Warm up again starts from the Level 1 card.
    await page.setViewportSize(PORTRAIT);
    await card.getByRole('button', { name: t('warmup.changed.action') }).tap();
    await expect.poll(async () => {
      const w = await warmup(page);
      return w?.card === 'level' ? w.level?.number : null;
    }).toBe(1);
    await expect(page.getByRole('dialog', { name: t('warmup.level.pop.name') })).toBeVisible();
    expect(await fullscreenRequests(page)).toBe(0);
    sameOrigin(page, seen.requests);
    expect(seen.problems).toEqual([]);
  });
});

test.describe('A phone held sideways (portrait camera, touch only)', () => {
  test.describe.configure({ timeout: 480_000 });
  test.use({ viewport: LANDSCAPE });

  test('the warm-up completes by taps with the pip line on the camera side, bubbles inside the safe rectangle', async ({ page }) => {
    const seen = watch(page);
    await instrument(page, INSETS_LANDSCAPE);
    await page.goto('./?e2e=1&speed=4&preset=quick&engines=geometric,eyepixel&seed=2615');
    // Emulated landscape is screen.orientation.angle 90: the camera on the left (design §4.4).
    expect(await page.evaluate(() => screen.orientation.angle)).toBe(90);
    await startWarmup(page, { tap: true });
    let hud = false;
    const drawn: Drawn[] = [];
    await playWarmup(page, {
      tap: true,
      timeoutMs: 300_000,
      each: async (w) => {
        if (w?.phase !== 'running' || w.level?.key !== 'pop' || !w.item) return;
        if (!hud) {
          await checkHud(page, 'left');
          hud = true;
        }
        const d = await drawnBubble(page);
        if (d) drawn.push(d);
      },
    });
    expect(hud).toBe(true);
    await checkWarmupGeometry(page, drawn, INSETS_LANDSCAPE, false);
    expect(await route(page)).toBe('complete');
    expect(await fullscreenRequests(page)).toBe(0);
    sameOrigin(page, seen.requests);
    expect(seen.problems).toEqual([]);
  });

  test('turned round (the camera on the right), the stimulus HUD and the framed screens follow the camera', async ({ page }) => {
    const seen = watch(page);
    const cdp = await instrument(page, INSETS_LANDSCAPE);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: LANDSCAPE.width, height: LANDSCAPE.height, deviceScaleFactor: 3, mobile: true, screenOrientation: { type: 'landscapeSecondary', angle: 270 } });
    for (const [fixture, path] of [['warmup-pop', '#/warmup'], ['challenge-play', '#/challenge']] as const) {
      await page.goto(`./?e2e=1&fixture=${fixture}${path}`);
      expect(await page.evaluate(() => screen.orientation.angle)).toBe(270);
      await checkHud(page, 'right');
    }
    // A framed screen puts its stage on the camera side and the side column on the far side.
    await page.goto('./?e2e=1&fixture=complete-good#/complete');
    await expect.poll(() => page.locator('.app').getAttribute('data-camera')).toBe('right');
    const stage = (await page.locator('.app .stage').first().boundingBox())!;
    const actions = (await page.locator('.complete__actions').boundingBox())!;
    expect(stage.x).toBeGreaterThan(actions.x);
    expect(seen.problems).toEqual([]);
  });
});
