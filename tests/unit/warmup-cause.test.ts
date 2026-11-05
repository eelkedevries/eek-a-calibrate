// The cause line (spec §17.7.5): the first of face often lost, backlit, too dark, much head
// movement, glare, too far, from the frame log and the light readings.
import assert from 'node:assert/strict';
import test from 'node:test';
import { SETUP } from '../../src/core/constants.ts';
import { causeFor, causes } from '../../src/core/warmup/cause.ts';
import type { LevelFrame } from '../../src/core/warmup/steadiness.ts';
import type { RejectCode } from '../../src/core/types.ts';

const GOOD_LIGHT = { lumaMean: 120, backlight: 1, glare: 0 };

function log(accepted: number, rejects: Partial<Record<RejectCode, number>>): LevelFrame[] {
  const out: LevelFrame[] = Array.from({ length: accepted }, () => ({ accepted: true, reject: null }));
  for (const [code, n] of Object.entries(rejects)) for (let i = 0; i < (n as number); i++) out.push({ accepted: false, reject: code as RejectCode });
  return out;
}

test('no cause for a clean warm-up', () => {
  assert.equal(causeFor({ frames: log(100, { blink: 5, settle: 50 }), light: GOOD_LIGHT }), null);
});

test('each cause on its own', () => {
  assert.equal(causeFor({ frames: log(80, { 'no-face': 20 }), light: GOOD_LIGHT }), 'face-lost');
  assert.equal(causeFor({ frames: log(81, { 'no-face': 19 }), light: GOOD_LIGHT }), null);
  assert.equal(causeFor({ frames: log(100, {}), light: { ...GOOD_LIGHT, backlight: SETUP.backlightMin - 0.01 } }), 'backlit');
  assert.equal(causeFor({ frames: log(100, {}), light: { ...GOOD_LIGHT, lumaMean: SETUP.lumaMin - 1 } }), 'dark');
  assert.equal(causeFor({ frames: log(70, { motion: 20, pose: 10 }), light: GOOD_LIGHT }), 'motion');
  assert.equal(causeFor({ frames: log(100, {}), light: { ...GOOD_LIGHT, glare: SETUP.glareMax + 0.01 } }), 'glare');
  assert.equal(causeFor({ frames: log(70, { 'small-face': 30 }), light: GOOD_LIGHT }), 'far');
});

test('the order of design §2.12 when several apply; settle frames are left out of the shares', () => {
  const frames = log(40, { 'no-face': 20, motion: 20, 'small-face': 20, settle: 500 });
  const light = { lumaMean: 40, backlight: 0.5, glare: 0.1 };
  assert.deepEqual(causes({ frames, light }), ['face-lost', 'backlit', 'dark', 'motion', 'glare', 'far']);
  assert.equal(causeFor({ frames: log(60, { motion: 20, 'small-face': 20 }), light: { ...GOOD_LIGHT, glare: 0.1 } }), 'motion');
  // Unknown light readings say nothing.
  assert.equal(causeFor({ frames: log(100, {}), light: { lumaMean: Number.NaN, backlight: Number.NaN, glare: Number.NaN } }), null);
});
