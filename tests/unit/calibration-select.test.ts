// WP8 (spec §10.1): the choice within an engine (one-SE rule, §4.8.4) and Auto selection
// (§4.9: one-SE with a-priori rank, the Combined 5 % rule) on hand-made CV tables.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseCandidate } from '../../src/core/calibration/fitEngine.ts';
import { selectEstimator } from '../../src/core/calibration/select.ts';
import type { CvReport, EngineId } from '../../src/core/types.ts';

const cv = (meanDeg: number, seDeg = 0.1): CvReport => ({ meanDeg, seDeg, perGroupMedianDeg: {}, nRows: 100, nGroups: 13, coverage: 1 });
const fits = (table: Partial<Record<EngineId, [number, number]>>) =>
  Object.fromEntries(Object.entries(table).map(([e, [m, s]]) => [e, { cv: cv(m, s) }])) as Partial<Record<EngineId, { cv: CvReport }>>;

test('within an engine: the lowest error, unless a simpler candidate is within one SE', () => {
  // geo-linear (2) within one SE of geo-quadratic (4): the simpler one.
  assert.equal(chooseCandidate([{ complexity: 2, cv: cv(1.04) }, { complexity: 4, cv: cv(0.95) }]), 0);
  // Outside one SE: the better one.
  assert.equal(chooseCandidate([{ complexity: 2, cv: cv(1.06) }, { complexity: 4, cv: cv(0.95) }]), 1);
  // Several simpler ones within one SE: the simplest.
  assert.equal(chooseCandidate([{ complexity: 5, cv: cv(0.9, 0.2) }, { complexity: 3, cv: cv(1.0) }, { complexity: 1, cv: cv(1.05) }]), 2);
  // A more complex candidate within one SE is never preferred over the best.
  assert.equal(chooseCandidate([{ complexity: 1, cv: cv(0.9) }, { complexity: 5, cv: cv(0.92) }]), 0);
  // An undefined SE (one group) allows no switch; non-finite candidates are skipped; none finite gives −1.
  assert.equal(chooseCandidate([{ complexity: 1, cv: cv(1.0, Number.NaN) }, { complexity: 3, cv: cv(0.99, Number.NaN) }]), 1);
  assert.equal(chooseCandidate([{ complexity: 1, cv: cv(Number.NaN) }, { complexity: 3, cv: cv(2) }]), 1);
  assert.equal(chooseCandidate([{ complexity: 1, cv: cv(Number.NaN) }]), -1);
});

test('Auto: among singles within one SE of the best, the better a-priori rank', () => {
  const s = selectEstimator(fits({ blazegaze: [2.0, 0.3], geometric: [1.8, 0.3], eyepixel: [3.0, 0.4] }), null);
  assert.equal(s.estimator, 'blazegaze');
  assert.match(s.reason, /^BlazeGaze: .*within one standard error .*Geometric \(1\.80°\).*ranks higher a priori\. Combined could not be formed\.$/);
  assert.deepEqual(s.ranking.map((r) => r.estimator), ['geometric', 'blazegaze', 'eyepixel']);
  // Outside one SE the best single wins.
  const t = selectEstimator(fits({ blazegaze: [2.2, 0.3], geometric: [1.8, 0.3] }), null);
  assert.equal(t.estimator, 'geometric');
  assert.match(t.reason, /^Geometric: the lowest cross-validated error \(1\.80°\)/);
  // Under assumed geometry the degrees of the reason carry "≈" (§14.1.4).
  const approx = selectEstimator(fits({ blazegaze: [2.2, 0.3], geometric: [1.8, 0.3] }), { cv: cv(2.0) }, true);
  assert.match(approx.reason, /^Geometric: the lowest cross-validated error \(≈1\.80°\)\. Combined \(≈2\.00°\) is not/);
});

test('Auto: Combined iff its error is at most 95 % of the best single engine’s', () => {
  const table = fits({ blazegaze: [2.0, 0.3], peekr: [2.5, 0.3], geometric: [1.8, 0.3] });
  const yes = selectEstimator(table, { cv: cv(0.95 * 1.8) });
  assert.equal(yes.estimator, 'combined');
  assert.match(yes.reason, /^Combined: .*\(1\.71°\) is at least 5 % lower than that of the best single engine, Geometric \(1\.80°\)\.$/);
  assert.equal(yes.ranking[0]!.estimator, 'combined');
  const no = selectEstimator(table, { cv: cv(0.951 * 1.8) });
  assert.equal(no.estimator, 'blazegaze', 'the comparison is with the best single, not the rank-preferred one');
  assert.match(no.reason, /Combined \(1\.71°\) is not at least 5 % lower\.$/);
  assert.equal(selectEstimator(table, { cv: cv(Number.NaN) }).estimator, 'blazegaze');
});

test('Auto ignores engines without a finite error and fails when there is none', () => {
  const s = selectEstimator(fits({ blazegaze: [Number.NaN, Number.NaN], eyepixel: [4, 0.5] }), null);
  assert.equal(s.estimator, 'eyepixel');
  assert.deepEqual(s.ranking.map((r) => r.estimator), ['eyepixel', 'blazegaze']);
  assert.throws(() => selectEstimator(fits({ geometric: [Number.NaN, 0] }), null), RangeError);
  assert.throws(() => selectEstimator({}, null), RangeError);
});
