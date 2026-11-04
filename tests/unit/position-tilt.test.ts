// The phone tilt check's maths (design §3.1, §3.9): θ and roll from gravity, the orientation
// fallback, the low-pass, steadiness and the hand-held detection.
import assert from 'node:assert/strict';
import test from 'node:test';
import { gravityFromOrientation, LowPass3, nearestReading, rotationMagnitude, SteadinessMeter, tiltFromGravity, wrap180 } from '../../src/core/position/tilt.ts';

const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const G = 9.81;
const rad = (deg: number) => (deg * Math.PI) / 180;

test('θ is 0 lying flat, 90 upright, above 90 leaning in; roll 0 held straight', () => {
  close(tiltFromGravity([0, 0, G]).tiltDeg, 0);
  close(tiltFromGravity([0, 0, G]).rollDeg, 0);
  const upright = tiltFromGravity([0, G, 0]);
  close(upright.tiltDeg, 90);
  close(upright.rollDeg, 0);
  // Tilted back by 30° from upright (screen facing up a little): θ = 60.
  close(tiltFromGravity([0, G * Math.cos(rad(30)), G * Math.sin(rad(30))]).tiltDeg, 60, 1e-9);
  // Leaning in by 20° past upright (screen facing down a little): θ = 110.
  close(tiltFromGravity([0, G * Math.cos(rad(20)), -G * Math.sin(rad(20))]).tiltDeg, 110, 1e-9);
  // Scaling gravity changes nothing.
  close(tiltFromGravity([0, 3 * G, 0]).tiltDeg, 90);
});

test('roll is measured in the screen plane and corrected by the orientation angle', () => {
  close(tiltFromGravity([G * Math.sin(rad(12)), G * Math.cos(rad(12)), 0]).rollDeg, 12, 1e-9);
  close(tiltFromGravity([-G * Math.sin(rad(8)), G * Math.cos(rad(8)), 0]).rollDeg, -8, 1e-9);
  // Landscape (angle 90): gravity's reaction along +x, held level → roll 0.
  close(tiltFromGravity([G, 0, 0], 90).rollDeg, 0, 1e-9);
  close(tiltFromGravity([-G, 0, 0], 270).rollDeg, 0, 1e-9);
  close(Math.abs(tiltFromGravity([G * Math.cos(rad(5)), -G * Math.sin(rad(5)), 0], 90).rollDeg), 5, 1e-9);
  // Upside down in portrait reads as a half turn.
  close(Math.abs(tiltFromGravity([0, -G, 0]).rollDeg), 180);
});

test('a zero or broken reading gives NaN, not a cue', () => {
  assert.ok(Number.isNaN(tiltFromGravity([0, 0, 0]).tiltDeg));
  assert.ok(Number.isNaN(tiltFromGravity([Number.NaN, 1, 1]).tiltDeg));
});

test('the orientation fallback has no gimbal problem at exactly upright', () => {
  const g = gravityFromOrientation(90, 0);
  close(g[0], 0, 1e-12);
  close(g[1], 1, 1e-12);
  close(g[2], 0, 1e-12);
  const t = tiltFromGravity(g);
  close(t.tiltDeg, 90, 1e-9);
  close(t.rollDeg, 0, 1e-9);
  // Whatever γ does at β = 90, θ stays upright.
  close(tiltFromGravity(gravityFromOrientation(90, 37)).tiltDeg, 90, 1e-9);
  close(tiltFromGravity(gravityFromOrientation(0, 0)).tiltDeg, 0, 1e-9);
  close(tiltFromGravity(gravityFromOrientation(70, 0)).tiltDeg, 70, 1e-9);
});

test('wrap180 keeps angles in (−180, 180]', () => {
  assert.equal(wrap180(190), -170);
  assert.equal(wrap180(-190), 170);
  assert.equal(wrap180(-180), 180);
  assert.equal(wrap180(360), 0);
});

test('the low-pass follows its time constant and resets on a time going back', () => {
  const lp = new LowPass3(300);
  lp.push(0, [0, 0, 0]);
  const v = lp.push(300, [1, 1, 1]);
  close(v[0], 1 - Math.exp(-1), 1e-12);
  const w = lp.push(100, [5, 5, 5]);
  assert.deepEqual([...w], [5, 5, 5]);
});

test('steadiness: rotation rate over 300 ms, hand-held from the variance over 2 s', () => {
  const still = new SteadinessMeter();
  const hand = new SteadinessMeter();
  for (let t = 0; t <= 2000; t += 50) {
    still.push(t, 0.1, 0.1, 0);
    hand.push(t, 4 * Math.sin(t / 70), 3 * Math.cos(t / 90), 2 * Math.sin(t / 50));
  }
  assert.ok(still.rateDegS(2000) < 1);
  assert.equal(still.handHeld(), false);
  assert.equal(hand.handHeld(), true);
  close(rotationMagnitude(3, 4, 0), 5);
  close(rotationMagnitude(null, 4, null), 4);
  assert.ok(Number.isNaN(new SteadinessMeter().variance()));
});

test('the reading nearest a capture time, within the gap', () => {
  const rs = [10, 40, 75, 200].map((tMs) => ({ tMs }));
  assert.equal(nearestReading(rs, 50)?.tMs, 40);
  assert.equal(nearestReading(rs, 60)?.tMs, 75);
  assert.equal(nearestReading(rs, 0)?.tMs, 10);
  assert.equal(nearestReading(rs, 900, 500), null);
  assert.equal(nearestReading(rs, 650, 500)?.tMs, 200);
  assert.equal(nearestReading([], 10), null);
});
