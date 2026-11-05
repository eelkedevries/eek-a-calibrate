// The leaky dwell (spec §17.9.1, design §5.2): fills at 1/dwell per second inside, drains at
// twice that outside, resets after 300 ms continuously outside, and holds on held frames.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DWELL_START, dwellFull, stepDwell, type DwellInput, type DwellState } from '../../src/core/game/dwell.ts';

function run(steps: [DwellInput, number][], dwellMs = 1000, from: DwellState = DWELL_START): DwellState {
  let s = from;
  for (const [input, ms] of steps) for (let t = 0; t < ms; t += 10) s = stepDwell(s, input, 10, dwellMs);
  return s;
}

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);

test('fills in the dwell time and is then full', () => {
  near(run([['in', 500]]).progress, 0.5);
  assert.ok(dwellFull(run([['in', 1000]])));
  assert.ok(dwellFull(run([['in', 800]], 800)));
  assert.equal(run([['in', 2000]]).progress, 1);
});

test('drains at twice the fill rate while briefly outside', () => {
  near(run([['in', 600], ['out', 100]]).progress, 0.4);
  near(run([['in', 600], ['out', 200], ['in', 100]]).progress, 0.3);
});

test('resets after 300 ms continuously outside, not after shorter spells', () => {
  assert.equal(run([['in', 900], ['out', 300]]).progress, 0);
  near(run([['in', 900], ['out', 140], ['in', 10], ['out', 140]]).progress, 0.9 - 0.28 + 0.01 - 0.28);
});

test('held frames pause the dwell, the drain and the reset timer', () => {
  const s = run([['in', 500], ['held', 2000]]);
  near(s.progress, 0.5);
  const t = run([['in', 900], ['out', 250], ['held', 1000], ['out', 40]]);
  near(t.progress, 0.9 - 0.5 - 0.08);
  assert.equal(t.outsideMs, 290);
  assert.throws(() => stepDwell(DWELL_START, 'in', 10, 0), RangeError);
  assert.equal(stepDwell(DWELL_START, 'in', Number.NaN, 1000), DWELL_START);
});
