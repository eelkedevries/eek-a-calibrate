// IndexedDB version 2 (spec §17.10.3): the upgrade keeps the v1 stores and adds `prefs` and
// `scores`; best scores are kept per zone set and replaced only by a higher score.
import assert from 'node:assert/strict';
import test from 'node:test';
import { beatsBest, DB_NAME, DB_VERSION, scoreKey, STORES, upgradePlan } from '../../src/platform/storage.ts';

test('the database is eek-a-calibrate, version 2, with five stores', () => {
  assert.equal(DB_NAME, 'eek-a-calibrate');
  assert.equal(DB_VERSION, 2);
  assert.deepEqual([...STORES], ['geometry', 'profiles', 'sessions', 'prefs', 'scores']);
});

test('upgrading version 1 in place adds only prefs and scores', () => {
  assert.deepEqual(upgradePlan(1, ['geometry', 'profiles', 'sessions']), ['prefs', 'scores']);
  // A new database gets every store; one already at version 2 gets none.
  assert.deepEqual(upgradePlan(0, []), ['geometry', 'profiles', 'sessions', 'prefs', 'scores']);
  assert.deepEqual(upgradePlan(2, ['geometry', 'profiles', 'sessions', 'prefs', 'scores']), []);
  // A store missing from an older database is created; nothing that exists is recreated.
  assert.deepEqual(upgradePlan(1, ['profiles', 'sessions']), ['geometry', 'prefs', 'scores']);
  // Before version 1 there are no stores, whatever a broken listing says.
  assert.deepEqual(upgradePlan(0, ['geometry']), ['geometry', 'profiles', 'sessions', 'prefs', 'scores']);
});

test('a best score is kept per zone set: 1 × 2 and 2 × 1 never share a key', () => {
  assert.equal(scoreKey(3, 2), 'zones|3x2');
  assert.equal(scoreKey(1, 2), 'zones|1x2');
  assert.notEqual(scoreKey(1, 2), scoreKey(2, 1));
  assert.equal(scoreKey(2, 2, 'round-1'), 'zones|2x2|round-1');
  assert.throws(() => scoreKey(0, 2), RangeError);
  assert.throws(() => scoreKey(1.5, 2), RangeError);
});

test('only a strictly higher, finite, non-negative score beats the best', () => {
  assert.equal(beatsBest(null, 0), true);
  assert.equal(beatsBest(null, 1820), true);
  assert.equal(beatsBest({ score: 1820 }, 1821), true);
  assert.equal(beatsBest({ score: 1820 }, 1820), false);
  assert.equal(beatsBest({ score: 1820 }, 900), false);
  assert.equal(beatsBest({ score: Number.NaN }, 10), true);
  assert.equal(beatsBest(null, Number.NaN), false);
  assert.equal(beatsBest(null, -5), false);
});
