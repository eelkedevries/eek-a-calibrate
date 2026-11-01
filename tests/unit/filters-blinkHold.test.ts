// WP2: blink hold: 0.6/0.4 hysteresis, 800 ms hold cap, hide after 600 ms without valid data.
import assert from 'node:assert/strict';
import test from 'node:test';
import { BLINK_HOLD } from '../../src/core/constants.ts';
import { BLINK_HOLD_INITIAL, blinkHold, type BlinkHoldDecision, type BlinkHoldState } from '../../src/core/filters/blinkHold.ts';

function run(frames: [number, number | null, number | null, boolean][], start: BlinkHoldState = BLINK_HOLD_INITIAL): BlinkHoldDecision[] {
  let state = start;
  return frames.map(([tMs, blinkL, blinkR, gazeValid]) => {
    const d = blinkHold(state, { tMs, blinkL, blinkR, gazeValid });
    state = d.state;
    return d;
  });
}

test('uses the Appendix A thresholds', () => {
  assert.deepEqual(BLINK_HOLD, { close: 0.6, open: 0.4, capMs: 800, hideMs: 600 });
});

test('hysteresis: both eyes above 0.6 close, both below 0.4 open', () => {
  const d = run([
    [0, 0.1, 0.1, true],
    [33, 0.7, 0.5, true], // one eye only: stays open
    [66, 0.65, 0.61, true], // both above 0.6: closes
    [100, 0.5, 0.45, true], // between the thresholds: stays closed
    [133, 0.35, 0.5, true], // one eye below 0.4: still closed
    [166, 0.39, 0.3, true], // both below 0.4: opens
    [200, 0.55, 0.55, true], // below 0.6 again: stays open
  ]);
  assert.deepEqual(
    d.map((x) => x.closed),
    [false, false, true, true, true, false, false],
  );
  assert.deepEqual(
    d.map((x) => x.display),
    ['update', 'update', 'hold', 'hold', 'hold', 'update', 'update'],
  );
});

test('holds for at most 800 ms, hides after 600 ms without a valid update', () => {
  const frames: [number, number | null, number | null, boolean][] = [[0, 0, 0, true]];
  for (let t = 100; t <= 1000; t += 100) frames.push([t, 0.9, 0.9, true]);
  const d = run(frames);
  // Closed at 100 ms; last valid update at 0 ms.
  const byTime = new Map(frames.map((f, k) => [f[0], d[k] as BlinkHoldDecision]));
  assert.equal(byTime.get(100)?.display, 'hold');
  assert.equal(byTime.get(600)?.display, 'hold', '600 ms since the last update: not yet more than 600');
  assert.equal(byTime.get(700)?.display, 'hide', 'more than 600 ms without a valid update');
  assert.equal(byTime.get(900)?.display, 'hide', 'exactly 800 ms after closing: still holding');
  assert.equal(byTime.get(1000)?.display, 'update', 'past the 800 ms cap, valid gaze moves the dot again');
  assert.ok(d.every((x, k) => k === 0 || x.closed), 'the gate itself stays closed');
});

test('no face: hold, then hide after 600 ms; the gate keeps its state', () => {
  const d = run([
    [0, 0.1, 0.1, true],
    [300, null, null, false],
    [600, null, null, false],
    [601, null, null, false],
    [700, 0.1, 0.1, true],
  ]);
  assert.deepEqual(
    d.map((x) => x.display),
    ['update', 'hold', 'hold', 'hide', 'update'],
  );
  const closed = run([
    [0, 0.9, 0.9, true],
    [50, null, null, false],
    [100, Number.NaN, 0.1, true],
  ]);
  assert.deepEqual(
    closed.map((x) => x.closed),
    [true, true, true],
    'missing or non-finite blendshapes do not change the gate',
  );
});

test('starts hidden until valid data arrives, and rejects non-finite time', () => {
  const d = run([
    [0, null, null, false],
    [33, 0.1, 0.1, true],
  ]);
  assert.deepEqual(
    d.map((x) => x.display),
    ['hide', 'update'],
  );
  assert.throws(() => blinkHold(BLINK_HOLD_INITIAL, { tMs: Number.NaN, blinkL: 0, blinkR: 0, gazeValid: true }), RangeError);
});
