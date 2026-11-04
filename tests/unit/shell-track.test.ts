// The level track's pure state (design §2.3, §2.11; spec §17.3.5).
import assert from 'node:assert/strict';
import test from 'node:test';
import { compactWidth, LEVEL_SETS, trackModel } from '../../src/app/shell/levelTrack.ts';

const states = (m: ReturnType<typeof trackModel>) => m.nodes.map((n) => n.state).join(' ');
const names = (m: ReturnType<typeof trackModel>) => m.nodes.map((n) => n.name).join(' · ');

test('the warm-up length decides the levels; the star node always ends the track', () => {
  assert.deepEqual(LEVEL_SETS.quick, ['pop', 'test']);
  assert.deepEqual(LEVEL_SETS.standard, ['pop', 'follow', 'turn', 'test']);
  assert.deepEqual(LEVEL_SETS.thorough, ['pop', 'follow', 'turn', 'lean', 'test']);
  assert.equal(names(trackModel('quick', { screen: 'ready' })), 'Pop · Test · Challenge');
  assert.equal(names(trackModel('standard', { screen: 'ready' })), 'Pop · Follow · Turn · Test · Challenge');
  assert.equal(names(trackModel('thorough', { screen: 'ready' })), 'Pop · Follow · Turn · Lean in · Test · Challenge');
  const star = trackModel('standard', { screen: 'ready' }).nodes.at(-1)!;
  assert.equal(star.kind, 'star');
  assert.equal(star.number, null);
  assert.deepEqual(trackModel('standard', { screen: 'ready' }).nodes.slice(0, 4).map((n) => n.number), [1, 2, 3, 4]);
});

test('Get ready: every level to come, the star locked, the phase label and the next level', () => {
  const m = trackModel('standard', { screen: 'ready' });
  assert.equal(m.visible, true);
  assert.equal(states(m), 'future future future future locked');
  assert.equal(m.phase, 'Get ready');
  assert.equal(m.hasCurrent, false);
  assert.equal(m.srText, 'Get ready. Next: level 1 of 4');
  assert.equal(m.nodes[0]!.srBefore, 'Level 1, next: ');
  assert.equal(m.nodes[1]!.srBefore, 'Level 2: ');
  assert.equal(m.nodes.at(-1)!.srAfter, ', locked');
  assert.equal(trackModel('quick', { screen: 'ready' }).srText, 'Get ready. Next: level 1 of 2');
});

test('level cards: the levels before are done, this level current, no phase label', () => {
  const m = trackModel('standard', { screen: 'level', level: 3 });
  assert.equal(states(m), 'done done current future locked');
  assert.equal(m.phase, null);
  assert.equal(m.hasCurrent, true);
  assert.equal(m.srText, 'Level 3 of 4');
  assert.equal(m.nodes[0]!.srAfter, ', done');
  // Level numbers follow the set: the Quick test round is "Level 2 of 2".
  assert.equal(trackModel('quick', { screen: 'level', level: 2 }).srText, 'Level 2 of 2');
  // Out-of-range levels are held to the set.
  assert.equal(states(trackModel('quick', { screen: 'level', level: 9 })), 'done current locked');
  assert.equal(states(trackModel('quick', { screen: 'level', level: 0 })), 'current future locked');
});

test('Warm-up complete: every level done; the star unlocked only with two zones or more', () => {
  const open = trackModel('standard', { screen: 'complete', unlocked: true });
  assert.equal(states(open), 'done done done done unlocked');
  assert.equal(open.phase, 'Warm-up complete');
  assert.equal(open.hasCurrent, false);
  assert.equal(open.srText, 'Warm-up complete. Challenge unlocked');
  assert.equal(open.nodes.at(-1)!.srAfter, ', unlocked');
  const shut = trackModel('standard', { screen: 'complete', unlocked: false });
  assert.equal(states(shut), 'done done done done locked');
  assert.equal(shut.srText, 'Warm-up complete. Challenge locked');
});

test('Free look and the challenge', () => {
  const look = trackModel('thorough', { screen: 'look' });
  assert.equal(states(look), 'done done done done done unlocked');
  assert.equal(look.phase, 'Free look');
  assert.equal(look.srText, 'Free look. Challenge unlocked');
  const challenge = trackModel('standard', { screen: 'challenge' });
  assert.equal(states(challenge), 'done done done done star-current');
  assert.equal(challenge.phase, 'Challenge');
  assert.equal(challenge.hasCurrent, true);
});

test('hidden on the Title and on stimulus screens', () => {
  assert.equal(trackModel('standard', { screen: 'title' }).visible, false);
  assert.equal(trackModel('standard', { screen: 'stimulus' }).visible, false);
  assert.equal(trackModel('standard', { screen: 'ready' }).visible, true);
});

test('the compact SVG is 134 px wide for five nodes and 162 px for six', () => {
  assert.equal(compactWidth(5), 134);
  assert.equal(compactWidth(6), 162);
  assert.equal(compactWidth(3), 78);
  assert.equal(compactWidth(0), 0);
});
