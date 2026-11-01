// WP3: areas-of-interest advice: the largest n ∈ {2, 3, 4} whose half-cell angle covers
// p75 accuracy + 2·RMS-S2S.
import assert from 'node:assert/strict';
import test from 'node:test';
import { aoiGrid, halfCellDeg } from '../../src/core/metrics/aoi.ts';

const SCREEN = { viewportWpx: 1920, viewportHpx: 1080, pxPerMm: 1920 / 531 };
const D = 600;
const DEG = 180 / Math.PI;

/** The outermost cell along the shorter axis, computed independently. */
function expectedHalfCell(n: number): number {
  const half = (mm: number): number => (Math.atan(mm / 2 / D) - Math.atan((mm / 2 - mm / n) / D)) * DEG / 2;
  return Math.min(half(1920 / SCREEN.pxPerMm), half(1080 / SCREEN.pxPerMm));
}

test('half-cell angular size of the outermost cell, the smallest one', () => {
  for (const n of [2, 3, 4]) assert.ok(Math.abs(halfCellDeg(n, SCREEN, D) - expectedHalfCell(n)) < 1e-12, `n = ${n}`);
  // 1080 px over 298.7 mm at 600 mm: half of a 2 × 2 cell is half of atan(149.3/600).
  assert.ok(Math.abs(halfCellDeg(2, SCREEN, D) - (Math.atan(1080 / SCREEN.pxPerMm / 2 / D) * DEG) / 2) < 1e-12);
  assert.ok(halfCellDeg(4, SCREEN, D) < halfCellDeg(3, SCREEN, D) && halfCellDeg(3, SCREEN, D) < halfCellDeg(2, SCREEN, D));
  assert.throws(() => halfCellDeg(0, SCREEN, D), RangeError);
});

test('the largest grid that the requirement fits, else 0', () => {
  const h4 = halfCellDeg(4, SCREEN, D);
  const h3 = halfCellDeg(3, SCREEN, D);
  const h2 = halfCellDeg(2, SCREEN, D);
  assert.equal(aoiGrid(1, 0.5, SCREEN, D), 4);
  assert.equal(aoiGrid(h4, 0, SCREEN, D), 4, 'at least: the boundary counts');
  assert.equal(aoiGrid(h4 - 0.2, 0.1 + 1e-9, SCREEN, D), 3);
  assert.equal(aoiGrid(h3, 0, SCREEN, D), 3);
  assert.equal(aoiGrid(h3 + 0.01, 0, SCREEN, D), 2);
  assert.equal(aoiGrid(h2, 0, SCREEN, D), 2);
  assert.equal(aoiGrid(h2, 0.01, SCREEN, D), 0);
  assert.equal(aoiGrid(Number.NaN, 0.5, SCREEN, D), 0);
  assert.equal(aoiGrid(1, Number.NaN, SCREEN, D), 0);
  // Closer to the screen, cells subtend more, so the same data supports a finer grid.
  assert.ok(halfCellDeg(4, SCREEN, 400) > h3 + 0.01);
  assert.equal(aoiGrid(h3 + 0.01, 0, SCREEN, 400), 4);
});
