// WP3: screen scale from the card, the diagonal, or the assumed 96 px per inch.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CARD_MM } from '../../src/core/constants.ts';
import {
  assumedPxPerMm,
  isDegreesApproximate,
  pxPerMmFromCard,
  pxPerMmFromDiagonal,
  screenKey,
  viewportDiagonalPx,
  viewportSizeMm,
} from '../../src/core/geometry/screen.ts';

test('card: pxPerMm = card width in CSS px / 85.60 mm', () => {
  assert.deepEqual(CARD_MM, { w: 85.6, h: 53.98 });
  assert.ok(Math.abs(pxPerMmFromCard(85.6 * 4) - 4) < 1e-12);
  assert.ok(Math.abs(pxPerMmFromCard(323.5) - 323.5 / 85.6) < 1e-15);
});

test('diagonal: pxPerMm = √(W² + H²) / (inches · 25.4)', () => {
  // A 24-inch 1920 × 1080 screen: 2202.907 px over 609.6 mm.
  assert.ok(Math.abs(pxPerMmFromDiagonal(1920, 1080, 24) - Math.sqrt(1920 ** 2 + 1080 ** 2) / 609.6) < 1e-12);
  assert.ok(Math.abs(pxPerMmFromDiagonal(1920, 1080, 24) - 3.61369) < 1e-5);
  // 3-4-5: a 5-inch diagonal of 300 × 400 px is 127 mm.
  assert.ok(Math.abs(pxPerMmFromDiagonal(300, 400, 5) - 500 / 127) < 1e-12);
});

test('skip: 96 CSS px per inch, and degrees become approximate', () => {
  assert.ok(Math.abs(assumedPxPerMm() - 3.7795) < 1e-4);
  assert.equal(assumedPxPerMm(), 96 / 25.4);
  assert.equal(isDegreesApproximate({ pxPerMmSource: 'assumed' }, { focalSource: 'blind-spot' }), true);
  assert.equal(isDegreesApproximate({ pxPerMmSource: 'card' }, { focalSource: 'assumed-fov' }), true);
  assert.equal(isDegreesApproximate({ pxPerMmSource: 'diagonal' }, { focalSource: 'blind-spot' }), false);
});

test('invalid inputs throw instead of giving a scale', () => {
  for (const bad of [0, -1, Number.NaN, Infinity]) {
    assert.throws(() => pxPerMmFromCard(bad), RangeError);
    assert.throws(() => pxPerMmFromDiagonal(1920, 1080, bad), RangeError);
    assert.throws(() => pxPerMmFromDiagonal(bad, 1080, 24), RangeError);
  }
});

test('storage key, viewport size and diagonal', () => {
  assert.equal(screenKey({ screenWpx: 1920, screenHpx: 1080, dpr: 1.25 }), '1920x1080@1.25');
  const s = { viewportWpx: 1920, viewportHpx: 1080, pxPerMm: 1920 / 531 };
  const mm = viewportSizeMm(s);
  assert.ok(Math.abs(mm.widthMm - 531) < 1e-12);
  assert.ok(Math.abs(mm.heightMm - (1080 * 531) / 1920) < 1e-12);
  assert.equal(viewportDiagonalPx({ viewportWpx: 300, viewportHpx: 400 }), 500);
  assert.throws(() => viewportSizeMm({ ...s, pxPerMm: 0 }), RangeError);
});
