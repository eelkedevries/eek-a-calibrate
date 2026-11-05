// The steadiness line (design §2.6), from a level's frame-acceptance log only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { steadiness, type LevelFrame } from '../../src/core/warmup/steadiness.ts';
import type { RejectCode } from '../../src/core/types.ts';

function frames(accepted: number, rejects: Partial<Record<RejectCode, number>>): LevelFrame[] {
  const out: LevelFrame[] = Array.from({ length: accepted }, () => ({ accepted: true, reject: null }));
  for (const [code, n] of Object.entries(rejects)) for (let i = 0; i < (n as number); i++) out.push({ accepted: false, reject: code as RejectCode });
  return out;
}

test('80 % accepted and no retry is Nice and steady; settle frames do not count', () => {
  assert.equal(steadiness(frames(80, { motion: 20 }), false), 'steady');
  assert.equal(steadiness(frames(80, { motion: 20, settle: 400 }), false), 'steady');
  assert.equal(steadiness(frames(79, { motion: 21 }), false), 'still');
  assert.equal(steadiness(frames(100, {}), true), 'nice', 'a retried bubble rules out "steady"');
});

test('most rejections from head motion or pose, or from a lost or small face', () => {
  assert.equal(steadiness(frames(10, { motion: 6, pose: 5, blink: 9 }), false), 'still');
  assert.equal(steadiness(frames(10, { 'no-face': 8, 'small-face': 4, blink: 8 }), false), 'view');
  assert.equal(steadiness(frames(10, { motion: 5, 'no-face': 5 }), false), 'nice', 'exactly half is not most');
  assert.equal(steadiness(frames(10, { blink: 30 }), false), 'nice');
  assert.equal(steadiness([], false), 'nice');
});
