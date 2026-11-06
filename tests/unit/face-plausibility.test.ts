// Spec v0.4 §16.1: a corrupt face-landmarker result (as some mobile GPUs return on
// the GPU delegate, without an error) is recognised and discarded, and ?delegate=
// selects the delegate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { implausibleReason } from '../../src/core/face/plausibility.ts';
import { parseSettings } from '../../src/app/state.ts';
import { loadLandmarkFixture } from '../fixtures/landmarks/fixture.ts';

const fx = loadLandmarkFixture();

test('the real fixture face is plausible', () => {
  assert.equal(implausibleReason(fx.landmarks, fx.matrix), null);
  assert.equal(implausibleReason(fx.landmarks, null), null);
});

test('corrupt landmarks of the kind seen on a phone GPU are rejected', () => {
  const huge = Float32Array.from(fx.landmarks);
  huge[468 * 3] = 3.3e21; // an iris landmark far outside the frame
  assert.match(implausibleReason(huge, fx.matrix) ?? '', /far outside the frame/);
  const nan = Float32Array.from(fx.landmarks);
  nan[100] = Number.NaN;
  assert.match(implausibleReason(nan, fx.matrix) ?? '', /not finite/);
  const deep = Float32Array.from(fx.landmarks);
  deep[2] = 50;
  assert.match(implausibleReason(deep, fx.matrix) ?? '', /depth/);
  const collapsed = new Float32Array(fx.landmarks.length).fill(0.5);
  assert.match(implausibleReason(collapsed, fx.matrix) ?? '', /size/);
  assert.match(implausibleReason(fx.landmarks.subarray(0, 300), fx.matrix) ?? '', /landmark values/);
});

test('a corrupt transformation matrix is rejected', () => {
  const skew = Float32Array.from(fx.matrix);
  skew[4] = skew[0]; // column 1 made parallel to column 0
  skew[5] = skew[1];
  skew[6] = skew[2];
  assert.match(implausibleReason(fx.landmarks, skew) ?? '', /orthogonal/);
  const scaled = Float32Array.from(fx.matrix);
  for (const k of [0, 1, 2]) scaled[k] *= 40;
  assert.match(implausibleReason(fx.landmarks, scaled) ?? '', /scale/);
  const notAffine = Float32Array.from(fx.matrix);
  notAffine[3] = 1e18;
  assert.match(implausibleReason(fx.landmarks, notAffine) ?? '', /affine/);
  const inf = Float32Array.from(fx.matrix);
  inf[12] = Number.POSITIVE_INFINITY;
  assert.match(implausibleReason(fx.landmarks, inf) ?? '', /not finite/);
});

test('?delegate=cpu|gpu selects the face landmarker delegate', () => {
  const at = (search: string) => parseSettings({ search, hash: '#/' }, 0).delegate;
  assert.equal(at('?delegate=cpu'), 'CPU');
  assert.equal(at('?delegate=GPU'), 'GPU');
  assert.equal(at('?delegate=tpu'), null);
  assert.equal(at(''), null);
});
