// The challenge's rectangular zones (spec §17.7.2): each axis takes the largest n ∈ {1, 2, 3, 4}
// whose outermost half-cell covers p75 accuracy + 2 × RMS-S2S, checked against geometries worked
// out by hand.
import assert from 'node:assert/strict';
import test from 'node:test';
import { zoneAt, zoneCount, zoneGrid } from '../../src/core/game/zones.ts';
import { halfCellDeg, halfCellDegAxis } from '../../src/core/metrics/aoi.ts';

const DEG = 180 / Math.PI;
const PX_PER_MM = 96 / 25.4;
/** A 390 × 844 phone held upright at 350 mm, and the same phone on its side. */
const PORTRAIT = { viewportWpx: 390, viewportHpx: 844, pxPerMm: PX_PER_MM };
const LANDSCAPE = { viewportWpx: 844, viewportHpx: 390, pxPerMm: PX_PER_MM };
const D = 350;

/** The outermost of n cells across `mm`, computed by hand: half the angle it subtends. */
function outerHalfCell(n: number, mm: number): number {
  return ((Math.atan(mm / 2 / D) - Math.atan((mm / 2 - mm / n) / D)) * DEG) / 2;
}

test('the one-axis half-cell is the outermost cell of that axis, and halfCellDeg is unchanged', () => {
  const w = 390 / PX_PER_MM;
  const h = 844 / PX_PER_MM;
  for (const n of [1, 2, 3, 4]) {
    assert.ok(Math.abs(halfCellDegAxis(n, 390, PX_PER_MM, D) - outerHalfCell(n, w)) < 1e-12, `width n = ${n}`);
    assert.ok(Math.abs(halfCellDegAxis(n, 844, PX_PER_MM, D) - outerHalfCell(n, h)) < 1e-12, `height n = ${n}`);
    assert.equal(halfCellDeg(n, PORTRAIT, D), Math.min(halfCellDegAxis(n, 390, PX_PER_MM, D), halfCellDegAxis(n, 844, PX_PER_MM, D)));
  }
  // By hand: 390 px is 103.2 mm, so one column subtends 2·atan(51.6/350) and its half is 8.39°.
  assert.ok(Math.abs(halfCellDegAxis(1, 390, PX_PER_MM, D) - 8.386) < 0.001);
  assert.throws(() => halfCellDegAxis(0, 390, PX_PER_MM, D), RangeError);
});

test('a phone held upright gets one column and several rows; on its side, the reverse', () => {
  // Half-cells at 350 mm: width 8.39° (n = 1), 4.19° (2); height 17.69° (1), 8.85° (2), 5.81° (3), 4.32° (4).
  assert.deepEqual(zoneGrid(4, 0.5, PORTRAIT, D), { cols: 1, rows: 3, needDeg: 5 });
  assert.deepEqual(zoneGrid(4, 0.5, LANDSCAPE, D), { cols: 3, rows: 1, needDeg: 5 });
  assert.equal(zoneCount(zoneGrid(4, 0.5, PORTRAIT, D)), 3);
  // A tighter need fits more cells: 4.19° ≥ 4° allows two columns, and 4.32° four rows.
  assert.deepEqual(zoneGrid(3, 0.5, PORTRAIT, D), { cols: 2, rows: 4, needDeg: 4 });
  // Just past a boundary drops a cell on that axis only.
  const h3 = halfCellDegAxis(3, 844, PX_PER_MM, D);
  assert.equal(zoneGrid(h3, 0, PORTRAIT, D).rows, 3, 'the boundary counts');
  assert.equal(zoneGrid(h3 + 1e-9, 0, PORTRAIT, D).rows, 2);
});

test('a laptop screen at 600 mm: columns and rows chosen separately', () => {
  // 1440 × 900 px at 96 px/in is 381 × 238 mm. Half-cells: width 17.6° (1), 8.81° (2), 5.79° (3),
  // 4.30° (4); height 11.2° (1), 5.61° (2), 3.72° (3).
  const desk = { viewportWpx: 1440, viewportHpx: 900, pxPerMm: PX_PER_MM };
  assert.deepEqual(zoneGrid(4, 1, desk, 600), { cols: 2, rows: 1, needDeg: 6 });
  assert.deepEqual(zoneGrid(3, 1, desk, 600), { cols: 3, rows: 2, needDeg: 5 });
  assert.deepEqual(zoneGrid(3, 0.5, desk, 600), { cols: 4, rows: 2, needDeg: 4 });
});

test('nothing fits, or the need is not a number: 0 on that axis', () => {
  assert.deepEqual(zoneGrid(30, 0, PORTRAIT, D), { cols: 0, rows: 0, needDeg: 30 });
  assert.deepEqual(zoneGrid(10, 0, PORTRAIT, D), { cols: 0, rows: 1, needDeg: 10 });
  const nan = zoneGrid(Number.NaN, 0.5, PORTRAIT, D);
  assert.equal(nan.cols, 0);
  assert.equal(nan.rows, 0);
  assert.equal(zoneGrid(4, Number.POSITIVE_INFINITY, PORTRAIT, D).cols, 0);
});

test('zoneAt: the zone holding a point; the edge zones reach past the screen', () => {
  const grid = { cols: 3, rows: 2 };
  const v = { w: 900, h: 600 };
  assert.deepEqual(zoneAt([10, 10], grid, v), [0, 0]);
  assert.deepEqual(zoneAt([450, 590], grid, v), [1, 1]);
  assert.deepEqual(zoneAt([600, 300], grid, v), [2, 1], 'a shared edge belongs to the next zone');
  assert.deepEqual(zoneAt([-40, 700], grid, v), [0, 1]);
  assert.equal(zoneAt([Number.NaN, 0], grid, v), null);
  assert.equal(zoneAt([10, 10], { cols: 0, rows: 2 }, v), null);
});
