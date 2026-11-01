// WP2: One Euro filter in degrees: step response, smoothing, reset after gaps.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ONE_EURO } from '../../src/core/constants.ts';
import { OneEuroFilter, OneEuroFilter2D } from '../../src/core/filters/oneEuro.ts';
import { gaussian, mulberry32 } from '../../src/core/maths/rng.ts';

const DT_MS = 1000 / 30;

/** α of an exponential smoother with cutoff fc (Hz) at sample interval dt (s), Casiez et al. */
function alpha(fc: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * fc);
  return 1 / (1 + tau / dt);
}

test('uses the Appendix A tuning in degrees', () => {
  assert.deepEqual(ONE_EURO, { minCutoffHz: 0.8, betaPerDegS: 0.3, dCutoffHz: 1.0, resetGapMs: 200 });
});

test('step response: the closed form on the first sample, then monotone convergence', () => {
  const f = new OneEuroFilter();
  let t = 0;
  for (let k = 0; k < 30; k++, t += DT_MS) assert.equal(f.filter(0, t), 0);
  const dt = DT_MS / 1000;
  // The derivative low-pass was resting at 0, so after the step dx̂ = α_d·(10/dt).
  const dxHat = alpha(ONE_EURO.dCutoffHz, dt) * (10 / dt);
  const expected = alpha(ONE_EURO.minCutoffHz + ONE_EURO.betaPerDegS * dxHat, dt) * 10;
  const first = f.filter(10, t);
  assert.ok(Math.abs(first - expected) < 1e-12, `${first} vs ${expected}`);
  assert.ok(first > 5 && first < 10, 'a fast move opens the filter');

  let prev = first;
  let at500 = 0;
  for (let k = 1; k <= 30; k++) {
    const y = f.filter(10, t + k * DT_MS);
    assert.ok(y >= prev && y <= 10, 'no overshoot, no reversal');
    prev = y;
    if (k === 15) at500 = y;
  }
  assert.ok(10 - at500 < 0.5, `within 0.5° after 500 ms (${at500})`);
  assert.ok(10 - prev < 0.05, `within 0.05° after 1 s (${prev})`);
});

test('smooths fixation jitter', () => {
  const normal = gaussian(mulberry32(4));
  const f = new OneEuroFilter();
  const raw: number[] = [];
  const out: number[] = [];
  for (let k = 0; k < 600; k++) {
    const x = 0.5 * normal();
    raw.push(x);
    out.push(f.filter(x, k * DT_MS));
  }
  const sd = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
  assert.ok(sd(out.slice(30)) < 0.5 * sd(raw.slice(30)), `${sd(out.slice(30))} vs ${sd(raw.slice(30))}`);
});

test('resets after a gap of more than 200 ms, or when the clock runs backwards', () => {
  const f = new OneEuroFilter();
  for (let k = 0; k < 10; k++) f.filter(0, k * DT_MS);
  const last = 9 * DT_MS;
  assert.equal(f.filter(7, last + 201), 7, 'gap > 200 ms: the sample passes through');

  const g = new OneEuroFilter();
  for (let k = 0; k < 10; k++) g.filter(0, k * DT_MS);
  const y = g.filter(7, last + 200);
  assert.ok(y > 0 && y < 7, 'a gap of exactly 200 ms keeps the state');

  const h = new OneEuroFilter();
  for (let k = 0; k < 10; k++) h.filter(0, k * DT_MS);
  assert.equal(h.filter(3, 5), 3);

  const r = new OneEuroFilter();
  r.filter(1, 0);
  r.filter(1, DT_MS);
  r.reset();
  assert.equal(r.filter(-4, 2 * DT_MS), -4);
});

test('a repeated timestamp is treated as one 30 Hz frame, as in gaze-lite', () => {
  const a = new OneEuroFilter();
  const b = new OneEuroFilter();
  a.filter(0, 100);
  b.filter(0, 100);
  assert.equal(a.filter(5, 100), b.filter(5, 100 + DT_MS));
});

test('two-dimensional filtering is independent per axis', () => {
  const f = new OneEuroFilter2D();
  const fx = new OneEuroFilter();
  for (let k = 0; k < 20; k++) {
    const t = k * DT_MS;
    const x = k < 10 ? 0 : 8;
    const [ox, oy] = f.filter(x, 3, t);
    assert.equal(ox, fx.filter(x, t));
    assert.equal(oy, 3);
  }
  f.reset();
  assert.deepEqual(f.filter(1, 2, 0), [1, 2]);
});

test('non-finite input throws and leaves the state untouched', () => {
  const f = new OneEuroFilter2D();
  const ref = new OneEuroFilter2D();
  for (let k = 0; k < 5; k++) {
    f.filter(k, -k, k * DT_MS);
    ref.filter(k, -k, k * DT_MS);
  }
  assert.throws(() => f.filter(Number.NaN, 0, 5 * DT_MS), RangeError);
  assert.throws(() => f.filter(0, Number.NaN, 5 * DT_MS), RangeError);
  assert.throws(() => f.filter(0, 0, Number.NaN), RangeError);
  assert.deepEqual(f.filter(6, -6, 5 * DT_MS), ref.filter(6, -6, 5 * DT_MS));
});
