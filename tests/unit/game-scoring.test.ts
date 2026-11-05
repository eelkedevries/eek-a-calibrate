// Scoring, streaks and stars (spec §17.9.1, §17.9.5; design §5.5).
import assert from 'node:assert/strict';
import test from 'node:test';
import { bonk, popPoints, speedBonus, streakActive } from '../../src/core/game/scoring.ts';
import { roundStars } from '../../src/core/game/stars.ts';

test('a pop is worth 100 plus 50 × (1 − time to pop / 4 s)', () => {
  assert.equal(popPoints(0, 0), 150);
  assert.equal(popPoints(2000, 0), 125);
  assert.equal(popPoints(4000, 0), 100);
  assert.equal(popPoints(9000, 0), 100);
  assert.equal(speedBonus(1000), 37.5);
  assert.equal(speedBonus(Number.NaN), 0);
});

test('× 1.5 on every pop after four in a row', () => {
  assert.equal(streakActive(3), false);
  assert.equal(streakActive(4), true);
  assert.equal(popPoints(2000, 3), 125);
  assert.equal(popPoints(2000, 4), 188);
  assert.equal(popPoints(0, 10), 225);
});

test('a bonk costs 50 and the score never goes below 0', () => {
  assert.deepEqual(bonk(180), { score: 130, change: -50 });
  assert.deepEqual(bonk(30), { score: 0, change: -30 });
  assert.deepEqual(bonk(0), { score: 0, change: 0 });
});

test('stars: 1 at 50 %, 2 at 75 %, 3 at 90 % with a median of 1.6 s or less', () => {
  assert.equal(roundStars(7, 16, 900), 0);
  assert.equal(roundStars(8, 16, 900), 1);
  assert.equal(roundStars(12, 16, 900), 2);
  assert.equal(roundStars(15, 16, 1600), 3);
  assert.equal(roundStars(15, 16, 1601), 2);
  assert.equal(roundStars(15, 16, null), 2);
  assert.equal(roundStars(14, 16, 900), 2);
  assert.equal(roundStars(0, 0, null), 0);
});
