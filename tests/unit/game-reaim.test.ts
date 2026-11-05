// Re-aim (spec §17.8.2, design §2.15): the in-round offer rule and how the drift check's outcome
// reads; the decision itself is drift.ts's, unchanged.
import assert from 'node:assert/strict';
import test from 'node:test';
import { driftDecision } from '../../src/core/calibration/drift.ts';
import { reaimOfferDue, reaimResult, timedReaimDue } from '../../src/core/game/reaim.ts';

test('offered below 50 % over the last six bubbles, once a round', () => {
  const p = 'popped' as const;
  const m = 'missed' as const;
  assert.equal(reaimOfferDue([m, m, m, m, m], false), false);
  assert.equal(reaimOfferDue([m, m, m, m, p, p], false), true);
  assert.equal(reaimOfferDue([m, m, m, p, p, p], false), false);
  assert.equal(reaimOfferDue([p, p, p, p, m, m, m, m, p, p], false), true);
  assert.equal(reaimOfferDue([m, m, m, m, m, m], true), false);
});

test('the timed offer is due DRIFT.everyMin minutes after the warm-up', () => {
  assert.equal(timedReaimDue(299_999, 0, 5), false);
  assert.equal(timedReaimDue(300_000, 0, 5), true);
  assert.equal(timedReaimDue(10e9, 0, 0), false);
});

test('within the limit the correction applies: "fine" below 0.5°, "fixed" otherwise; beyond it, "large"', () => {
  const small = driftDecision([0.3, 0.1], 2);
  assert.equal(small.action, 'apply');
  assert.equal(reaimResult(small.magnitudeDeg, small.action), 'fine');
  const mid = driftDecision([1.5, 0.5], 2);
  assert.equal(reaimResult(mid.magnitudeDeg, mid.action), 'fixed');
  const big = driftDecision([4, 0], 2);
  assert.equal(big.action, 'recalibrate');
  assert.equal(reaimResult(big.magnitudeDeg, big.action), 'large');
  assert.equal(reaimResult(null, null), 'no-data');
});
