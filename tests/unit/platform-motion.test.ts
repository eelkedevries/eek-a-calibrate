// platform/motion.ts's pure parts (design §3.9): readings from device motion and from the
// orientation fallback, and the log FrameRecorder reads the nearest reading from.
import assert from 'node:assert/strict';
import test from 'node:test';
import { MotionProcessor, ReadingLog, motionPermission, requestMotionPermission } from '../../src/platform/motion.ts';

const G = 9.81;

test('device motion: θ and roll through the low-pass, steadiness from the rotation rate', () => {
  const p = new MotionProcessor();
  let r = p.fromMotion(0, [0, G, 0], { alpha: 0, beta: 0, gamma: 0 }, 0)!;
  assert.ok(Math.abs(r.tiltDeg - 90) < 1e-9);
  assert.equal(r.source, 'motion');
  // A sudden change is smoothed (300 ms time constant), so one jolt does not move θ far.
  r = p.fromMotion(30, [0, 0, G], { alpha: 0, beta: 0, gamma: 0 }, 0)!;
  assert.ok(r.tiltDeg > 70 && r.tiltDeg < 90, `θ ${r.tiltDeg}`);
  for (let t = 60; t <= 3000; t += 30) r = p.fromMotion(t, [0, 0, G], { alpha: 1, beta: 0, gamma: 0 }, 0)!;
  assert.ok(r.tiltDeg < 1);
  assert.ok(Math.abs(r.rotationDegS - 1) < 1e-9);
  assert.equal(r.handHeld, false);
  assert.equal(p.fromMotion(3030, [Number.NaN, 0, 0], null, 0), null);
});

test('the orientation fallback gives θ without a rotation rate', () => {
  const p = new MotionProcessor();
  const r = p.fromOrientation(0, 90, 0, 0)!;
  assert.ok(Math.abs(r.tiltDeg - 90) < 1e-9);
  assert.equal(r.source, 'orientation');
  assert.ok(Number.isNaN(r.rotationDegS));
  assert.equal(p.fromOrientation(10, null, 0, 0), null);
});

test('the log keeps the last 10 s and finds the reading nearest a capture time', () => {
  const log = new ReadingLog();
  for (let t = 0; t <= 12_000; t += 100) log.push({ tMs: t, tiltDeg: t / 1000, rollDeg: 0, rotationDegS: 0, handHeld: false, source: 'motion' });
  assert.equal(log.latest()?.tMs, 12_000);
  assert.equal(log.at(5_040)?.tMs, 5_000);
  assert.equal(log.at(1_000), null, 'older than 10 s');
  assert.equal(log.at(12_600), null, 'more than 500 ms after the last');
});

test('without DeviceMotionEvent the permission is unavailable', async () => {
  assert.equal(motionPermission(), 'not-asked');
  assert.equal(await requestMotionPermission(), 'unavailable');
  assert.equal(motionPermission(), 'unavailable');
});
