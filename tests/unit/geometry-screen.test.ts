// WP3: screen scale from the card, the diagonal, or the assumed 96 px per inch.
// WP11 (§14.2.5): the orientation-independent storage key, the safe rectangle,
// and layoutToPx with its inverse, with and without safe-area insets.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CARD_MM } from '../../src/core/constants.ts';
import {
  assumedPxPerMm,
  isDegreesApproximate,
  layoutToPx,
  pxPerMmFromCard,
  pxPerMmFromDiagonal,
  pxToLayout,
  safeRect,
  screenKey,
  viewportDiagonalPx,
  viewportSizeMm,
  ZERO_INSETS,
} from '../../src/core/geometry/screen.ts';
import type { ScreenGeometry } from '../../src/core/types.ts';

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
  // Browsers that swap screen.width and screen.height on rotation keep one key per screen.
  assert.equal(screenKey({ screenWpx: 390, screenHpx: 844, dpr: 3 }), '844x390@3');
  assert.equal(screenKey({ screenWpx: 844, screenHpx: 390, dpr: 3 }), '844x390@3');
  assert.equal(screenKey({ screenWpx: 1080, screenHpx: 1920, dpr: 1.25 }), '1920x1080@1.25');
  const s = { viewportWpx: 1920, viewportHpx: 1080, pxPerMm: 1920 / 531 };
  const mm = viewportSizeMm(s);
  assert.ok(Math.abs(mm.widthMm - 531) < 1e-12);
  assert.ok(Math.abs(mm.heightMm - (1080 * 531) / 1920) < 1e-12);
  assert.equal(viewportDiagonalPx({ viewportWpx: 300, viewportHpx: 400 }), 500);
  assert.throws(() => viewportSizeMm({ ...s, pxPerMm: 0 }), RangeError);
});

function close(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol;
}

// An iPhone-sized portrait viewport with a notch at the top and a home indicator at the bottom,
// and the same phone in landscape with the cut-out on the left.
const PORTRAIT: Pick<ScreenGeometry, 'viewportWpx' | 'viewportHpx' | 'insets'> = {
  viewportWpx: 390,
  viewportHpx: 844,
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};
const LANDSCAPE: Pick<ScreenGeometry, 'viewportWpx' | 'viewportHpx' | 'insets'> = {
  viewportWpx: 844,
  viewportHpx: 390,
  insets: { top: 0, right: 47, bottom: 21, left: 47 },
};

test('without insets, layoutToPx is (xNorm·W, yNorm·H) exactly, and pxToLayout inverts it', () => {
  const desktop = { viewportWpx: 1920, viewportHpx: 1080 };
  assert.deepEqual(safeRect(desktop), { x: 0, y: 0, w: 1920, h: 1080 });
  assert.deepEqual(safeRect({ ...desktop, insets: ZERO_INSETS }), { x: 0, y: 0, w: 1920, h: 1080 });
  for (const [x, y] of [[0, 0], [1, 1], [0.08, 0.92], [0.5, 0.5], [0.29, 0.71], [0.15, 0.85]] as const) {
    const px = layoutToPx(x, y, desktop);
    assert.equal(px[0], x * 1920);
    assert.equal(px[1], y * 1080);
    assert.deepEqual(layoutToPx(x, y, { ...desktop, insets: ZERO_INSETS }), px);
    const back = pxToLayout(px[0], px[1], desktop);
    assert.ok(close(back[0], x, 1e-15) && close(back[1], y, 1e-15), `round trip of (${x}, ${y})`);
  }
});

test('with insets, normalised layout coordinates span the safe rectangle only (§14.2.5)', () => {
  assert.deepEqual(safeRect(PORTRAIT), { x: 0, y: 47, w: 390, h: 844 - 47 - 34 });
  assert.deepEqual(layoutToPx(0, 0, PORTRAIT), [0, 47]);
  assert.deepEqual(layoutToPx(1, 1, PORTRAIT), [390, 844 - 34]);
  assert.deepEqual(layoutToPx(0.5, 0.5, PORTRAIT), [195, 47 + 763 / 2]);
  assert.deepEqual(safeRect(LANDSCAPE), { x: 47, y: 0, w: 844 - 94, h: 390 - 21 });
  assert.deepEqual(layoutToPx(0, 1, LANDSCAPE), [47, 369]);
  assert.deepEqual(layoutToPx(1, 0, LANDSCAPE), [797, 0]);

  // Every calibration and validation position lies inside the safe rectangle, clear of the cut-outs.
  for (const g of [PORTRAIT, LANDSCAPE]) {
    const r = safeRect(g);
    for (const x of [0.08, 0.15, 0.29, 0.38, 0.5, 0.62, 0.71, 0.85, 0.92]) {
      for (const y of [0.08, 0.15, 0.29, 0.5, 0.71, 0.85, 0.92]) {
        const [px, py] = layoutToPx(x, y, g);
        assert.ok(px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h);
        const [bx, by] = pxToLayout(px, py, g);
        assert.ok(close(bx, x, 1e-12) && close(by, y, 1e-12), `round trip of (${x}, ${y})`);
      }
    }
  }
  // Positions outside the safe rectangle (under the notch, off screen) map outside [0, 1], unclipped.
  assert.deepEqual(pxToLayout(0, 0, PORTRAIT), [0, -47 / 763]);
  assert.deepEqual(pxToLayout(-39, 844, PORTRAIT), [-0.1, 1 + 34 / 763]);
  // Non-finite positions stay non-finite rather than becoming a position.
  assert.ok(pxToLayout(Number.NaN, 10, PORTRAIT).every((v, i) => (i === 0 ? Number.isNaN(v) : Number.isFinite(v))));
});

test('a viewport or insets that cannot give a safe rectangle throw instead of mapping', () => {
  for (const bad of [0, -1, Number.NaN, Infinity]) {
    assert.throws(() => layoutToPx(0.5, 0.5, { viewportWpx: bad, viewportHpx: 800 }), RangeError);
    assert.throws(() => pxToLayout(10, 10, { viewportWpx: 400, viewportHpx: bad }), RangeError);
  }
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    for (const bad of [-1, Number.NaN, Infinity]) {
      assert.throws(() => safeRect({ viewportWpx: 400, viewportHpx: 800, insets: { ...ZERO_INSETS, [side]: bad } }), RangeError);
    }
  }
  assert.throws(() => safeRect({ viewportWpx: 400, viewportHpx: 800, insets: { top: 0, right: 200, bottom: 0, left: 200 } }), RangeError);
  assert.throws(() => safeRect({ viewportWpx: 400, viewportHpx: 800, insets: { top: 500, right: 0, bottom: 300, left: 0 } }), RangeError);
});
