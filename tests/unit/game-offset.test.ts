// The challenge as a quality check (spec §17.9.3, design §5.6): a consistent shift in at least
// three zones gives a correction, which is added to the correction in use, within the §4.13 limit.
import assert from 'node:assert/strict';
import test from 'node:test';
import { addCorrection, consistentOffset } from '../../src/core/game/offset.ts';

const ZONE = { w: 330, h: 233 };

test('three zones shifted the same way give the mean shift', () => {
  const pops = [
    { zone: 0, offsetPx: [0, 80] as const },
    { zone: 0, offsetPx: [10, 100] as const },
    { zone: 1, offsetPx: [-10, 90] as const },
    { zone: 2, offsetPx: [0, 95] as const },
  ];
  const f = consistentOffset(pops, ZONE)!;
  assert.ok(f);
  assert.equal(f.zones, 3);
  assert.ok(f.resultant > 0.99);
  assert.ok(Math.abs(f.offsetPx[1] - (90 + 90 + 95) / 3) < 1e-9);
  assert.ok(f.zoneFrac > 0.25);
});

test('no correction with fewer than three zones, opposed directions or a small shift', () => {
  assert.equal(consistentOffset([{ zone: 0, offsetPx: [0, 100] }, { zone: 1, offsetPx: [0, 100] }], ZONE), null);
  // Up in one zone, down in another, sideways in the third: the directions do not agree.
  assert.equal(consistentOffset([{ zone: 0, offsetPx: [0, 100] }, { zone: 1, offsetPx: [0, -100] }, { zone: 2, offsetPx: [100, 0] }], ZONE), null);
  // Agreeing but within a quarter of a zone (58 px of 233).
  assert.equal(consistentOffset([{ zone: 0, offsetPx: [0, 40] }, { zone: 1, offsetPx: [0, 50] }, { zone: 2, offsetPx: [0, 45] }], ZONE), null);
  assert.equal(consistentOffset([{ zone: 0, offsetPx: [Number.NaN, 1] }], ZONE), null);
});

test('the correction is added to the one in use (c − o), never put in its place', () => {
  const r = addCorrection([0.5, -0.2], [0.75, 1], 3);
  assert.equal(r.applied, true);
  assert.deepEqual(r.correctionDeg, [0.5 - 0.75, -0.2 - 1]);
  assert.deepEqual(addCorrection(null, [1, 0], 2), { applied: true, correctionDeg: [-1, 0] });
});

test('a sum beyond the §4.13 limit is not applied, and the correction stays as it was', () => {
  const r = addCorrection([-1.5, 0], [1, 0], 2);
  assert.equal(r.applied, false);
  assert.deepEqual(r.correctionDeg, [-1.5, 0]);
  assert.equal(addCorrection([0, 0], [Number.NaN, 0], 2).applied, false);
});
