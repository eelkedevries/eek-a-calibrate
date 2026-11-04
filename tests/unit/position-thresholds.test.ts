// The position guard's per-class ranges (design §3.2) and the choice of class (spec §17.4.1).
import assert from 'node:assert/strict';
import test from 'node:test';
import { classRanges, defaultSetup, guardClass, nudgesAllowed, pauseTiming, TIMING } from '../../src/core/position/thresholds.ts';
import { SETUP } from '../../src/core/constants.ts';

test('each class has the ranges of design §3.2', () => {
  const p = classRanges('phone-portrait');
  assert.deepEqual(p.face, { target: 0.33, band: [0.28, 0.42] });
  assert.equal(p.irisFloorPx, 16);
  assert.deepEqual(p.margin, { x: 0.1, y: 0.08 });
  assert.deepEqual(p.centre, { x: 0.1, y: 0.12 });
  assert.deepEqual(p.pose, { yaw: 0, pitch: 12, yawWindow: 12, pitchWindow: [-10, 12], rollWindow: 10 });
  assert.deepEqual(p.tilt, { band: [60, 100], cue: [55, 105], rollMax: 10 });
  assert.deepEqual(p.advisedCm, [30, 40]);

  const l = classRanges('phone-landscape', { cameraSide: 'left' });
  assert.deepEqual(l.face, { target: 0.28, band: [0.24, 0.33] });
  assert.equal(l.irisFloorPx, 14);
  assert.deepEqual(l.margin, { x: 0.08, y: 0.08 });
  assert.deepEqual(l.centre, { x: 0.12, y: 0.1 });
  assert.equal(l.pose.pitch, 0);
  // Camera on the player's left: the face turns to the player's right, negative yaw.
  assert.equal(l.pose.yaw, -11);
  assert.equal(classRanges('phone-landscape', { cameraSide: 'right' }).pose.yaw, 11);
  assert.deepEqual(l.advisedCm, [40, 50]);

  const tab = classRanges('tablet');
  assert.deepEqual(tab.face, { target: 0.27, band: [0.22, 0.33] });
  assert.deepEqual(tab.advisedCm, [40, 55]);
  assert.equal(tab.pose.yaw, 0);
  assert.equal(classRanges('tablet', { landscape: true, cameraSide: 'left' }).pose.yaw, -11);

  const w = classRanges('webcam');
  assert.deepEqual(w.face, { target: 0.21, band: [0.16, 0.3] });
  assert.equal(w.irisFloorPx, 10);
  assert.deepEqual(w.margin, { x: 0.06, y: 0.06 });
  assert.deepEqual(w.centre, { x: 0.12, y: 0.15 });
  assert.equal(w.tilt, null);
  assert.equal(w.phone, false);
  assert.deepEqual(w.advisedCm, [50, 70]);

  for (const r of [p, l, tab, w]) {
    assert.deepEqual(r.light, { lumaMin: 60, lumaMax: 200, backlightMin: 0.8, glareMax: 0.02 });
    assert.equal(r.speed.headDegS, 30);
    assert.ok(r.face.band[0] < r.face.target && r.face.target < r.face.band[1]);
  }
});

test('In hand relaxes the phone steadiness cue to 30°/s', () => {
  assert.equal(classRanges('phone-portrait', { setup: 'propped' }).speed.phoneDegS, 20);
  assert.equal(classRanges('phone-portrait', { setup: 'in-hand' }).speed.phoneDegS, 30);
});

test('the set-up choice overrides the device class; orientation follows the 5/4 aspect ratio', () => {
  const phone = { mobile: true, screenShortPx: 390 };
  assert.equal(guardClass({ ...phone, setup: 'propped', windowW: 390, windowH: 844 }), 'phone-portrait');
  assert.equal(guardClass({ ...phone, setup: 'in-hand', windowW: 844, windowH: 390 }), 'phone-landscape');
  assert.equal(guardClass({ ...phone, setup: 'webcam', windowW: 390, windowH: 844 }), 'webcam');
  assert.equal(guardClass({ mobile: true, screenShortPx: 810, setup: 'propped', windowW: 1080, windowH: 810 }), 'tablet');
  assert.equal(guardClass({ mobile: false, screenShortPx: 1080, setup: 'propped', windowW: 1440, windowH: 900 }), 'phone-landscape');
  assert.equal(guardClass({ mobile: false, screenShortPx: 1080, setup: 'webcam', windowW: 1440, windowH: 900 }), 'webcam');
  assert.equal(defaultSetup(true), 'propped');
  assert.equal(defaultSetup(false), 'webcam');
});

test('timing and pause rules per context (design §3.2, §3.3)', () => {
  assert.equal(TIMING.holdMs, SETUP.holdMs);
  assert.equal(TIMING.persistMs, 300);
  assert.equal(TIMING.minShowMs, 1000);
  assert.equal(TIMING.anywayAfterMs, 20_000);
  assert.deepEqual(pauseTiming('warmup'), { outMs: 500, lostMs: 400 });
  assert.deepEqual(pauseTiming('reaim'), { outMs: 500, lostMs: 400 });
  assert.deepEqual(pauseTiming('look'), { outMs: 1000, lostMs: 700 });
  assert.deepEqual(pauseTiming('challenge'), { outMs: 1000, lostMs: 700 });
  assert.equal(nudgesAllowed('warmup'), false);
  assert.equal(nudgesAllowed('reaim'), false);
  assert.equal(nudgesAllowed('look'), true);
  assert.equal(nudgesAllowed('challenge'), true);
});
