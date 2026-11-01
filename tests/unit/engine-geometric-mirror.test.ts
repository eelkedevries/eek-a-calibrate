// WP5 (spec §10.1): the mirror-pair table (Peekr's landmark mirroring, spec
// §4.3) against the symmetry of the MediaPipe canonical face model, and the
// canonical constants of geo-4 against the same model.
import assert from 'node:assert/strict';
import test from 'node:test';
import { EYE_L, EYE_R, PEEKR_MIRROR_PAIRS } from '../../src/core/face/landmarkSets.ts';
import { EYE_CENTRE_HEAD_CM, GAZE_GAIN } from '../../src/engines/geometric/features.ts';
import { CANONICAL_CORNER_MIDPOINT, canonicalVertex, EYE_MODEL } from '../sim/faceSim.ts';

const TOL = 0.01;

test('every mirror pair is symmetric in the canonical model (x → −x)', () => {
  assert.equal(PEEKR_MIRROR_PAIRS.length, 4);
  for (const [a, b] of PEEKR_MIRROR_PAIRS) {
    const [xa, ya, za] = canonicalVertex(a);
    const [xb, yb, zb] = canonicalVertex(b);
    assert.ok(Math.abs(xa + xb) < TOL, `${a}↔${b}: |x_a + x_b| = ${Math.abs(xa + xb)}`);
    assert.ok(Math.abs(ya - yb) < TOL, `${a}↔${b}: |y_a − y_b| = ${Math.abs(ya - yb)}`);
    assert.ok(Math.abs(za - zb) < TOL, `${a}↔${b}: |z_a − z_b| = ${Math.abs(za - zb)}`);
    // The first of each pair is the subject's right (x < 0 in the canonical frame), not a self-pair.
    assert.ok(xa < -TOL, `${a} should lie on the subject's right`);
  }
});

test('the geo-4 canonical constants match the canonical model', () => {
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(CANONICAL_CORNER_MIDPOINT[k] - EYE_CENTRE_HEAD_CM[k]) < TOL, `corner midpoint axis ${k}`);
  // The gain is the per-eye corner distance over the eyeball radius.
  for (const eye of [EYE_R, EYE_L]) {
    const [p, q] = [canonicalVertex(eye.outer), canonicalVertex(eye.inner)];
    const width = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    assert.ok(Math.abs(width / EYE_MODEL.eyeballRadiusCm - GAZE_GAIN) < TOL, `corner distance ${width}`);
  }
});
