// Stars and outcomes (spec §17.7.3, §17.7.6; design §2.12): from the verdict, with fewer than two
// zones giving none.
import assert from 'node:assert/strict';
import test from 'node:test';
import { challengeUnlocked, outcomeFor, starsFor } from '../../src/core/warmup/stars.ts';

test('stars from the verdict; not tracking or fewer than two zones give none', () => {
  assert.equal(starsFor('good', 3), 3);
  assert.equal(starsFor('acceptable', 2), 2);
  assert.equal(starsFor('poor', 6), 1);
  assert.equal(starsFor('not-tracking', 4), 0);
  assert.equal(starsFor('good', 1), 0);
  assert.equal(starsFor('good', 0), 0);
});

test('the outcome table: Great, Good, Rough, Didn\'t work', () => {
  assert.equal(outcomeFor('good', 3), 'great');
  assert.equal(outcomeFor('acceptable', 2), 'good');
  assert.equal(outcomeFor('poor', 2), 'rough');
  assert.equal(outcomeFor('not-tracking', 4), 'failed');
  assert.equal(outcomeFor('good', 1), 'failed');
  assert.equal(challengeUnlocked(2), true);
  assert.equal(challengeUnlocked(1), false);
});
