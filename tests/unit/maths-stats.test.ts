// WP2: robust statistics (median, MAD, percentiles, weighted median).
import assert from 'node:assert/strict';
import test from 'node:test';
import { MAD_TO_SD, mad, mean, median, percentile, percentiles, sampleSd, weightedMedian } from '../../src/core/maths/stats.ts';

const X = [3.1, -2.0, 7.5, 0.25, 9.0, 4.4, -1.1, 5.5, 2.2, 8.8];

test('median, mean and sample SD', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([5]), 5);
  assert.equal(median(X), 3.75);
  assert.equal(mean([1, 2, 3, 6]), 3);
  assert.ok(Math.abs(sampleSd([2, 4, 4, 4, 5, 5, 7, 9]) - Math.sqrt(32 / 7)) < 1e-15);
  assert.ok(Number.isNaN(sampleSd([1])));
});

test('empty input and NaN give NaN', () => {
  for (const f of [median, mean, mad]) {
    assert.ok(Number.isNaN(f([])));
  }
  assert.ok(Number.isNaN(median([1, Number.NaN, 2])));
  assert.ok(Number.isNaN(mad([1, Number.NaN])));
  assert.ok(Number.isNaN(percentile([], 50)));
  assert.ok(Number.isNaN(percentile([1, Number.NaN], 50)));
  assert.equal(median([1, Infinity, 2]), 2);
});

test('percentiles match NumPy linear interpolation', () => {
  // numpy.percentile(X, q) with the default method, run separately.
  const expected: [number, number][] = [
    [0, -2.0],
    [2.5, -1.7975],
    [25, 0.7375],
    [50, 3.75],
    [90, 8.82],
    [95, 8.91],
    [97.5, 8.955],
    [100, 9.0],
  ];
  for (const [q, v] of expected) assert.ok(Math.abs(percentile(X, q) - v) < 1e-12, `p${q}: ${percentile(X, q)}`);
  assert.deepEqual(
    percentiles(X, expected.map(([q]) => q)),
    expected.map(([q]) => percentile(X, q)),
  );
  assert.throws(() => percentile(X, 101), RangeError);
  assert.throws(() => percentile(X, -1), RangeError);
  assert.throws(() => percentile([], Number.NaN), RangeError);
  assert.equal(X[0], 3.1, 'the input is not reordered');
});

test('MAD', () => {
  assert.equal(mad(X), 3.625);
  assert.equal(mad([1, 2, 3, 4, 100]), 1);
  assert.equal(mad([1, 2, 3], 0), 2);
  assert.equal(MAD_TO_SD, 1.4826);
});

test('weighted median', () => {
  assert.equal(weightedMedian([3, 1, 2], [1, 1, 1]), 2);
  assert.equal(weightedMedian([4, 1, 3, 2], [1, 1, 1, 1]), 2.5);
  assert.equal(weightedMedian([1, 2, 3, 4, 5, 6], [1 / 3, 1 / 3, 1 / 3, 1 / 3, 1 / 3, 1 / 3]), 3.5);
  assert.equal(weightedMedian([1, 2, 3], [1, 1, 5]), 3);
  assert.equal(weightedMedian([1, 2, 3], [3, 1, 1]), 1);
  assert.equal(weightedMedian([1, 2, 3, 4], [1, 1, 2, 0]), 2.5);
  assert.equal(weightedMedian([10, 1, 2, 3], [0, 1, 1, 1]), 2, 'zero weights are ignored');
  assert.ok(Number.isNaN(weightedMedian([1, 2], [0, 0])));
  assert.ok(Number.isNaN(weightedMedian([], [])));
  assert.ok(Number.isNaN(weightedMedian([1, Number.NaN], [1, 1])));
  assert.throws(() => weightedMedian([1, 2], [1, -1]), RangeError);
  assert.throws(() => weightedMedian([1, 2], [1, Number.NaN]), RangeError);
  assert.throws(() => weightedMedian([1, 2], [1]), RangeError);
});
