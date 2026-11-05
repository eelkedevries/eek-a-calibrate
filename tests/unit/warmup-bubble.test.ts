// The bubble's timeline (spec §17.6.3): the scale-in over the first 150 ms of the settle window,
// full size to its end, the linear shrink to the core over the sample window, the hold during an
// extension, the static reduced-motion form, the pop, and the speed divisor; and the full
// diameter's clamp.
import assert from 'node:assert/strict';
import test from 'node:test';
import { BUBBLE, bubbleDiameterPx, bubbleRadius, popMs, popProgress } from '../../src/core/warmup/bubble.ts';
import { pxPerDegAtCentre } from '../../src/core/geometry/angles.ts';

const ITEM = { settleMs: 600, sampleMs: 1000 };
const SIZES = { fullR: 40, coreR: 12 };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('scale-in from 0.6× to full over the first 150 ms of the settle window', () => {
  close(bubbleRadius(0, ITEM, SIZES, false), 24);
  close(bubbleRadius(-5, ITEM, SIZES, false), 24);
  close(bubbleRadius(75, ITEM, SIZES, false), 32);
  close(bubbleRadius(149.999, ITEM, SIZES, false), 40 - 0.4 * 40 * (0.001 / 150));
  close(bubbleRadius(150, ITEM, SIZES, false), 40);
});

test('static at full size to the end of the settle window, then a linear shrink to the core', () => {
  close(bubbleRadius(400, ITEM, SIZES, false), 40);
  close(bubbleRadius(599.999, ITEM, SIZES, false), 40);
  close(bubbleRadius(600, ITEM, SIZES, false), 40);
  close(bubbleRadius(850, ITEM, SIZES, false), 33);
  close(bubbleRadius(1100, ITEM, SIZES, false), 26);
  close(bubbleRadius(1599.999, ITEM, SIZES, false), 12 + 28 * (0.001 / 1000));
  close(bubbleRadius(1600, ITEM, SIZES, false), 12);
});

test('holds at the core during an extension of sampling', () => {
  close(bubbleRadius(2000, ITEM, SIZES, false), 12);
  close(bubbleRadius(600 + 2500, ITEM, SIZES, false), 12);
});

test('reduced motion: static at full size throughout', () => {
  for (const t of [0, 100, 600, 1200, 3000]) close(bubbleRadius(t, ITEM, SIZES, true), 40);
});

test('the speed divisor: the scale-in and the pop shrink with the item times', () => {
  const fast = { settleMs: 150, sampleMs: 250 };
  close(bubbleRadius(0, fast, SIZES, false, 4), 24);
  close(bubbleRadius(18.75, fast, SIZES, false, 4), 32);
  close(bubbleRadius(37.5, fast, SIZES, false, 4), 40);
  close(bubbleRadius(149, fast, SIZES, false, 4), 40);
  close(bubbleRadius(150 + 125, fast, SIZES, false, 4), 26);
  close(bubbleRadius(400, fast, SIZES, false, 4), 12);
  close(popMs(4), 37.5);
  assert.throws(() => bubbleRadius(0, ITEM, SIZES, false, 0.5), RangeError);
});

test('the pop runs 150 ms after the item, then is over', () => {
  assert.equal(popProgress(0), 0);
  close(popProgress(75) as number, 0.5);
  assert.equal(popProgress(150), null);
  assert.equal(popProgress(-1), null);
  close(popProgress(30, 4) as number, 0.8);
  assert.equal(popProgress(37.5, 4), null);
  assert.equal(popMs(), BUBBLE.popMs);
});

test('full diameter: 3° clamped to [64 px, 20 % of the short side]', () => {
  // The assumed scale of §4.7 (24 px per 0.6°): 3° is 120 px, kept on a desktop stage.
  close(bubbleDiameterPx(40, 900), 120);
  // Measured geometry at 600 mm and 96 px/in: 3° ≈ 118.7 px.
  const perDeg = pxPerDegAtCentre(96 / 25.4, 600);
  close(bubbleDiameterPx(perDeg, 900), 3 * perDeg);
  // A 390 px phone: 20 % of the short side, 78 px.
  close(bubbleDiameterPx(40, 390), 78);
  // Close up 3° is under 64 px (about 40 px at 200 mm); the minimum holds.
  close(bubbleDiameterPx(pxPerDegAtCentre(96 / 25.4, 200), 900), 64);
  // A stage too small for both: the upper bound wins.
  close(bubbleDiameterPx(40, 280), 56);
  close(bubbleDiameterPx(Number.NaN, 900), 64);
});
