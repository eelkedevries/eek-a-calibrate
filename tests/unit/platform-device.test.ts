// WP11 (§14.2.1): the device class, a heuristic: a coarse primary pointer and a
// short screen side of at most MOBILE.maxShortSidePx CSS px.
import assert from 'node:assert/strict';
import test from 'node:test';
import { MOBILE } from '../../src/core/constants.ts';
import { detectDeviceClass, isMobileDevice } from '../../src/platform/capabilities.ts';

test('the §14.3 mobile constants', () => {
  assert.deepEqual(MOBILE, { maxShortSidePx: 820, viewportToleranceFrac: 0.12, warnMs: 80, minTouchPx: 44 });
});

test('phones and small tablets are mobile in either orientation; the short side decides', () => {
  for (const [w, h] of [[390, 844], [844, 390], [360, 800], [412, 915], [768, 1024], [820, 1180], [1180, 820]]) {
    assert.equal(isMobileDevice({ coarsePointer: true, screenWpx: w, screenHpx: h }), true, `${w} × ${h}`);
  }
  // A large tablet's short side is above the bound.
  assert.equal(isMobileDevice({ coarsePointer: true, screenWpx: 1024, screenHpx: 1366 }), false);
  assert.equal(isMobileDevice({ coarsePointer: true, screenWpx: 821, screenHpx: 1180 }), false);
  assert.equal(isMobileDevice({ coarsePointer: true, screenWpx: 820, screenHpx: 1180 }, 800), false);
});

test('a fine pointer is desktop whatever the screen; an unknown screen size is desktop', () => {
  assert.equal(isMobileDevice({ coarsePointer: false, screenWpx: 390, screenHpx: 844 }), false);
  assert.equal(isMobileDevice({ coarsePointer: false, screenWpx: 1920, screenHpx: 1080 }), false);
  assert.equal(isMobileDevice({ coarsePointer: true, screenWpx: 1920, screenHpx: 1080 }), false);
  for (const bad of [0, -1, Number.NaN]) {
    assert.equal(isMobileDevice({ coarsePointer: true, screenWpx: bad, screenHpx: 844 }), false, String(bad));
  }
});

test('outside a browser (no matchMedia, no screen) the device class is desktop', () => {
  assert.deepEqual(detectDeviceClass(), { coarsePointer: false, screenWpx: Number.NaN, screenHpx: Number.NaN, mobile: false });
});
