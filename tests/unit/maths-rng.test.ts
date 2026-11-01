// WP2: mulberry32 golden sequence, Fisher–Yates and the Gaussian sketch source.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fisherYates, gaussian, mulberry32 } from '../../src/core/maths/rng.ts';

// uint32 outputs of the reference C implementation (Tommy Ettinger's mulberry32, uint32_t
// arithmetic), compiled and run independently of this code base; each value is divided by 2^32.
const GOLDEN: Record<number, number[]> = {
  0: [1144304738, 1416247, 958946056, 627933444, 2007157716, 2340967985],
  1: [2693262067, 11749833, 2265367787, 4213581821, 4159151403, 1207330352],
  42: [2581720956, 1925393290, 3661312704, 2876485805, 750819978, 2261697747],
  3735928559: [4043151706, 1147597007, 3315858022, 1538288752, 2042435954, 3600176436],
  4294967295: [3850105811, 813802916, 3073704848, 4054706436, 3630262831, 2315588663],
};

test('mulberry32 reproduces the reference sequence', () => {
  for (const [seed, ints] of Object.entries(GOLDEN)) {
    const rand = mulberry32(Number(seed));
    assert.deepEqual(
      ints.map(() => rand()),
      ints.map((v) => v / 4294967296),
      `seed ${seed}`,
    );
  }
  assert.equal(mulberry32(0)(), 0.26642920868471265);
});

test('mulberry32 reduces the seed modulo 2^32 and rejects non-integers', () => {
  const a = mulberry32(-1);
  const b = mulberry32(0xffffffff);
  const c = mulberry32(2 ** 32 + 42);
  const d = mulberry32(42);
  for (let i = 0; i < 20; i++) {
    assert.equal(a(), b());
    assert.equal(c(), d());
  }
  assert.throws(() => mulberry32(1.5), RangeError);
  assert.throws(() => mulberry32(Number.NaN), RangeError);
});

test('mulberry32 stays in [0, 1)', () => {
  const rand = mulberry32(7);
  for (let i = 0; i < 100000; i++) {
    const v = rand();
    assert.ok(v >= 0 && v < 1);
  }
});

test('Fisher–Yates gives the reference permutation and a valid shuffle', () => {
  // Computed independently (Python, uint32 mulberry32, Durstenfeld's loop from the end).
  assert.deepEqual(fisherYates([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], mulberry32(42)), [0, 7, 3, 5, 2, 1, 8, 9, 4, 6]);
  const thirteen = Array.from({ length: 13 }, (_, i) => i);
  assert.deepEqual(fisherYates(thirteen, mulberry32(20261101)), [0, 11, 3, 2, 7, 6, 5, 1, 9, 4, 12, 10, 8]);

  const items = ['a', 'b', 'c', 'd', 'e'];
  const out = fisherYates(items, mulberry32(3));
  assert.equal(out, items, 'shuffles in place');
  assert.deepEqual([...out].sort(), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(fisherYates([], mulberry32(1)), []);
  assert.deepEqual(fisherYates([9], mulberry32(1)), [9]);
});

test('Fisher–Yates is uniform over permutations', () => {
  const rand = mulberry32(123);
  const counts = new Map<string, number>();
  const trials = 60000;
  for (let t = 0; t < trials; t++) {
    const key = fisherYates([0, 1, 2], rand).join('');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 6);
  const expected = trials / 6;
  let chi2 = 0;
  for (const c of counts.values()) chi2 += (c - expected) ** 2 / expected;
  assert.ok(chi2 < 20.52, `χ² = ${chi2} (5 df, p = 0.001 critical value 20.52)`);
});

test('gaussian gives standard normal deviates, deterministically', () => {
  const normal = gaussian(mulberry32(99));
  const n = 200000;
  let s = 0;
  let ss = 0;
  let within1 = 0;
  for (let i = 0; i < n; i++) {
    const v = normal();
    assert.ok(Number.isFinite(v));
    s += v;
    ss += v * v;
    if (Math.abs(v) <= 1) within1++;
  }
  const m = s / n;
  assert.ok(Math.abs(m) < 0.01, `mean ${m}`);
  assert.ok(Math.abs(ss / n - m * m - 1) < 0.015, `variance ${ss / n - m * m}`);
  assert.ok(Math.abs(within1 / n - 0.682689) < 0.005);
  const a = gaussian(mulberry32(5));
  const b = gaussian(mulberry32(5));
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});
