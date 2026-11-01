// WP11 (§14.2.3–5): the pure decisions of platform/presentation.ts — the
// presentation mode, the viewport-mode tolerance rule, orientation changes and
// the safe-area inset parser — and the layoutToPx it re-exports.
import assert from 'node:assert/strict';
import test from 'node:test';
import { MOBILE } from '../../src/core/constants.ts';
import { layoutToPx as coreLayoutToPx } from '../../src/core/geometry/screen.ts';
import {
  choosePresentationMode,
  layoutToPx,
  orientationChanged,
  orientationFromSize,
  parseInsetPx,
  pxToLayout,
  SAME_SIZE_PX,
  viewportVerdict,
  type OrientationState,
} from '../../src/platform/presentation.ts';

test('element fullscreen where available, viewport mode where not (iPhone Safari) and by default in test mode', () => {
  const choose = (requested: 'auto' | 'fullscreen' | 'viewport', fullscreenAvailable: boolean, skipFullscreen: boolean) =>
    choosePresentationMode({ requested, fullscreenAvailable, skipFullscreen });
  assert.equal(choose('auto', true, false), 'fullscreen');
  assert.equal(choose('auto', false, false), 'viewport');
  assert.equal(choose('auto', true, true), 'viewport');
  assert.equal(choose('viewport', true, false), 'viewport');
  // Both modes stay testable with ?e2e=1: an explicit request wins over the skip hook.
  assert.equal(choose('fullscreen', true, true), 'fullscreen');
  assert.equal(choose('viewport', true, true), 'viewport');
  // Fullscreen cannot be had where the browser lacks it.
  assert.equal(choose('fullscreen', false, false), 'viewport');
});

test('viewport mode tolerates changes of at most 12 % of either dimension (browser bars) and aborts larger ones', () => {
  assert.equal(MOBILE.viewportToleranceFrac, 0.12);
  const start = { w: 390, h: 664 };
  assert.equal(viewportVerdict(start, start), 'same');
  assert.equal(viewportVerdict(start, { w: 390.3, h: 663.6 }), 'same');
  // iOS Safari's bottom bar collapsing: 664 → 745 is +12.2 %, just over; 664 → 740 (+11.4 %) is within.
  assert.equal(viewportVerdict(start, { w: 390, h: 740 }), 'tolerated');
  assert.equal(viewportVerdict(start, { w: 390, h: 745 }), 'abort');
  assert.equal(viewportVerdict(start, { w: 390, h: 664 * 0.88 }), 'tolerated');
  assert.equal(viewportVerdict(start, { w: 390, h: 664 * 0.88 - 1 }), 'abort');
  // Either dimension alone can abort.
  assert.equal(viewportVerdict(start, { w: 390 * 1.13, h: 664 }), 'abort');
  assert.equal(viewportVerdict(start, { w: 390 * 1.1, h: 664 * 1.1 }), 'tolerated');
  // A rotation swaps the dimensions: far beyond any tolerance.
  assert.equal(viewportVerdict(start, { w: 664, h: 390 }), 'abort');
});

test('fullscreen mode passes a tolerance of 0: any resize beyond rounding aborts (§4.7)', () => {
  const start = { w: 1920, h: 1080 };
  assert.equal(viewportVerdict(start, { w: 1920, h: 1080 }, 0), 'same');
  assert.equal(viewportVerdict(start, { w: 1920, h: 1080 + SAME_SIZE_PX / 2 }, 0), 'same');
  assert.equal(viewportVerdict(start, { w: 1920, h: 1079 }, 0), 'abort');
  assert.equal(viewportVerdict(start, { w: 1919, h: 1080 }, 0), 'abort');
});

test('a viewport that is not positive aborts; a bad tolerance throws', () => {
  const start = { w: 390, h: 664 };
  for (const bad of [0, -1, Number.NaN, Infinity]) {
    assert.equal(viewportVerdict(start, { w: bad, h: 664 }), 'abort');
    assert.equal(viewportVerdict({ w: 390, h: bad }, start), 'abort');
  }
  for (const bad of [-0.1, Number.NaN, Infinity]) assert.throws(() => viewportVerdict(start, start, bad), RangeError);
});

test('orientation: portrait against landscape, or a different type or angle, is a turn', () => {
  assert.equal(orientationFromSize({ w: 390, h: 844 }), 'portrait');
  assert.equal(orientationFromSize({ w: 844, h: 390 }), 'landscape');
  assert.equal(orientationFromSize({ w: 500, h: 500 }), 'portrait');

  const o = (type: OrientationType | null, angle: number | null, portrait: boolean): OrientationState => ({ type, angle, portrait });
  assert.equal(orientationChanged(o('portrait-primary', 0, true), o('portrait-primary', 0, true)), false);
  assert.equal(orientationChanged(o('portrait-primary', 0, true), o('landscape-primary', 90, false)), true);
  // Turned through 180°: same viewport size, but the camera is now on the other side.
  assert.equal(orientationChanged(o('landscape-primary', 90, false), o('landscape-secondary', 270, false)), true);
  assert.equal(orientationChanged(o(null, 90, false), o(null, -90, false)), true);
  // window.orientation's −90 is screen.orientation's 270.
  assert.equal(orientationChanged(o(null, 270, false), o(null, -90, false)), false);
  // Without type or angle, only portrait against landscape can be told apart.
  assert.equal(orientationChanged(o(null, null, true), o(null, null, true)), false);
  assert.equal(orientationChanged(o(null, null, true), o(null, null, false)), true);
  assert.equal(orientationChanged(o('portrait-primary', null, true), o(null, 0, true)), false);
});

test('computed env(safe-area-inset-*) values parse to CSS px; anything unusable is 0', () => {
  assert.equal(parseInsetPx('47px'), 47);
  assert.equal(parseInsetPx('20.5px'), 20.5);
  assert.equal(parseInsetPx('0px'), 0);
  assert.equal(parseInsetPx(''), 0);
  assert.equal(parseInsetPx('auto'), 0);
  assert.equal(parseInsetPx('-3px'), 0);
});

test('presentation.ts re-exports the one layoutToPx and its inverse', () => {
  assert.equal(layoutToPx, coreLayoutToPx);
  const g = { viewportWpx: 390, viewportHpx: 844, insets: { top: 47, right: 0, bottom: 34, left: 0 } };
  const [x, y] = layoutToPx(0.92, 0.08, g);
  const back = pxToLayout(x, y, g);
  assert.ok(Math.abs(back[0] - 0.92) < 1e-12 && Math.abs(back[1] - 0.08) < 1e-12);
});
