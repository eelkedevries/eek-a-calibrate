// The shell's layout switches (design §4.1 rule 4, §4.4) and the fit guard's ladder (rule 11).
import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraSideFromAngle, layoutClass } from '../../src/app/shell/appShell.ts';
import { boxesFitInRow, pickTier } from '../../src/app/shell/fitGuard.ts';

test('layouts switch at an aspect ratio of 5/4 and a height of 480 px', () => {
  assert.equal(layoutClass(360, 640), 'portrait');
  assert.equal(layoutClass(390, 844), 'portrait');
  assert.equal(layoutClass(844, 390), 'compact');
  assert.equal(layoutClass(750, 342), 'compact');
  assert.equal(layoutClass(1280, 650), 'regular');
  assert.equal(layoutClass(1440, 900), 'regular');
  assert.equal(layoutClass(1000, 800), 'regular');
  assert.equal(layoutClass(999, 800), 'portrait');
  // A half-screen window uses the portrait template.
  assert.equal(layoutClass(720, 900), 'portrait');
});

test('the camera side of a phone held sideways', () => {
  assert.equal(cameraSideFromAngle(90), 'left');
  assert.equal(cameraSideFromAngle(270), 'right');
  assert.equal(cameraSideFromAngle(-90), 'right');
  assert.equal(cameraSideFromAngle(0), 'left');
});

test('the ladder stops at the first tier that fits, or at the last', () => {
  assert.equal(pickTier(3, () => true), 0);
  assert.equal(pickTier(3, (tier) => tier >= 2), 2);
  assert.equal(pickTier(3, () => false), 3);
  assert.equal(pickTier(0, () => false), 0);
  const tried: number[] = [];
  pickTier(3, (tier) => (tried.push(tier), tier === 1));
  assert.deepEqual(tried, [0, 1]);
});

test('a row fits when its boxes stay inside it without overlapping', () => {
  const frame = { left: 0, right: 328, top: 0, bottom: 48 };
  const box = (left: number, right: number) => ({ left, right, top: 2, bottom: 46 });
  assert.equal(boxesFitInRow(frame, [box(0, 277), box(284, 328)], 4), true);
  assert.equal(boxesFitInRow(frame, [box(0, 290), box(284, 328)], 4), false);
  assert.equal(boxesFitInRow(frame, [box(284, 328), box(0, 282)], 0), true);
  assert.equal(boxesFitInRow(frame, [box(0, 340)]), false);
  assert.equal(boxesFitInRow(frame, [{ left: 0, right: 40, top: -4, bottom: 46 }]), false);
});
