// One round of the challenge (spec §17.9, design §5), driven with simulated gaze at a fixed seed:
// pops with points and streaks, misses after the 4 s lifetime, the 500 ms gap, held gaze and
// pauses freezing the dwell and the lifetime, the decoy's bonk, the drifters' bounds, the offset
// at each pop, and the per-zone statistics and stars.
import assert from 'node:assert/strict';
import test from 'node:test';
import { innerRect, makeBoard, zoneCentre } from '../../src/core/game/board.ts';
import { ROUNDS, TIMING } from '../../src/core/game/params.ts';
import { roundSeed } from '../../src/core/game/placement.ts';
import { popPoints } from '../../src/core/game/scoring.ts';
import { Round, type RoundEvent } from '../../src/core/game/round.ts';
import { summariseRound, zoneMark, type ItemRecord } from '../../src/core/game/stats.ts';
import type { Vec2 } from '../../src/core/types.ts';

const BOARD = makeBoard({ x: 16, y: 24, w: 358, h: 796 }, 1, 3);
const FRAME = 16;

function round(def = ROUNDS[0]!, seed = roundSeed(9090, 1)): Round {
  return new Round({ def, seed, board: BOARD, bubbleR: 39, pxPerDeg: 20, idPrefix: 'G1' });
}

/** Runs the round frame by frame; `look` gives the gaze for the bubble on screen (null = held). */
function play(r: Round, look: (r: Round) => Vec2 | null, untilMs = 120_000): RoundEvent[] {
  const events: RoundEvent[] = [];
  for (let t = 0; t <= untilMs && r.phase !== 'done'; t += FRAME) {
    const p = look(r);
    if (p) r.setGaze(p, t);
    else r.setGaze(null, t);
    events.push(...r.tick(t, false));
  }
  return events;
}

const atBubble = (r: Round): Vec2 | null => (r.bubble ? r.bubble.centre : zoneCentre(BOARD.zones[0]!));
const elsewhere = (r: Round): Vec2 => {
  const z = r.bubble ? BOARD.zones.find((x) => x.index !== r.bubble!.zone.index && (!r.decoy || x.index !== r.decoy.zone.index))! : BOARD.zones[0]!;
  return zoneCentre(z);
};

test('looking at every bubble pops all sixteen, with a streak and the speed bonus', () => {
  const r = round();
  const events = play(r, atBubble);
  assert.equal(r.phase, 'done');
  const pops = events.filter((e) => e.kind === 'pop');
  assert.equal(pops.length, 16);
  assert.ok(events.at(-1)?.kind === 'end');
  // Each popped after about one dwell (1000 ms), so each scores about 100 + 50 × (1 − 1/4), × 1.5 from the fifth.
  const first = pops[0] as Extract<RoundEvent, { kind: 'pop' }>;
  assert.ok(Math.abs(first.record.timeToPopMs! - 1000) <= FRAME);
  assert.equal(first.points, popPoints(first.record.timeToPopMs!, 0));
  assert.ok(first.points >= 137 && first.points <= 138);
  const fifth = pops[4] as Extract<RoundEvent, { kind: 'pop' }>;
  assert.equal(fifth.points, popPoints(fifth.record.timeToPopMs!, 4));
  assert.ok(fifth.points >= 205);
  assert.equal(r.streak, 16);
  assert.equal(r.score, pops.reduce((s, e) => s + (e as Extract<RoundEvent, { kind: 'pop' }>).points, 0));
  const s = r.summary();
  assert.equal(s.popped, 16);
  assert.equal(s.stars, 3);
  assert.equal(s.well, true);
  assert.equal(s.allGood, true);
  assert.equal(s.hardest, null);
  // Every pop leaves the median gaze offset, here zero (the gaze sat on the centre).
  for (const rec of r.records) assert.deepEqual(rec.offsetPx, [0, 0]);
});

test('looking away misses every bubble after its 4 s lifetime, with the 500 ms gaps between', () => {
  const r = round();
  const events = play(r, elsewhere);
  assert.equal(events.filter((e) => e.kind === 'miss').length, 16);
  assert.equal(r.score, 0);
  assert.equal(r.streak, 0);
  const onsets = r.records.map((x) => x.onsetMs);
  const offsets = r.records.map((x) => x.offsetMs);
  for (let k = 0; k < 16; k++) assert.ok(Math.abs(offsets[k]! - onsets[k]! - TIMING.lifetimeMs) <= FRAME);
  for (let k = 1; k < 16; k++) assert.ok(Math.abs(onsets[k]! - offsets[k - 1]! - TIMING.gapMs) <= 2 * FRAME);
  const s = r.summary();
  assert.equal(s.stars, 0);
  assert.equal(s.well, false);
  assert.ok(s.hardest);
});

test('held gaze and a pause freeze the dwell and the lifetime', () => {
  const r = round();
  let t = 0;
  while (r.phase !== 'bubble') r.tick((t += FRAME), false);
  const b = r.bubble!;
  for (let k = 0; k < 30; k++) {
    r.setGaze(b.centre, t);
    r.tick((t += FRAME), false);
  }
  const progress = r.bubble!.dwell.progress;
  assert.ok(progress > 0.4 && progress < 0.5);
  // Held (a blink): no change for 3 s.
  for (let k = 0; k < 190; k++) {
    r.setGaze(null, t);
    r.tick((t += FRAME), false);
  }
  assert.equal(r.bubble!.dwell.progress, progress);
  // Paused for 10 s: neither the lifetime nor the dwell moves; the bubble is still there afterwards.
  const clock = r.clockMs;
  for (let k = 0; k < 600; k++) r.tick((t += FRAME), true);
  assert.equal(r.clockMs, clock);
  assert.equal(r.bubble?.id, b.id);
});

test('round 2: looking at the spike for 600 ms bonks it (−50, never below 0) and ends the streak', () => {
  const r = round(ROUNDS[1]!, roundSeed(1, 2));
  const events = play(r, (x) => (x.decoy && x.decoy.bonkedClock === null ? x.decoy.centre : atBubble(x)));
  const bonks = events.filter((e) => e.kind === 'bonk');
  assert.equal(bonks.length, 16);
  for (const e of bonks) {
    const rec = (e as Extract<RoundEvent, { kind: 'bonk' }>).record;
    assert.equal(rec.kind, 'decoy');
    assert.equal(rec.streak, 0);
    assert.ok(rec.scoreChange <= 0 && rec.scoreChange >= -50);
  }
  // The first bonk came before any pop, at a score of 0: it costs nothing.
  assert.equal((bonks[0] as Extract<RoundEvent, { kind: 'bonk' }>).record.scoreChange, 0);
  assert.ok(r.score >= 0);
  assert.equal(r.records.filter((x) => x.kind === 'decoy').length, 16);
});

test('round 2: an unlooked-at spike is "ignored" when its bubble ends', () => {
  const r = round(ROUNDS[1]!, roundSeed(1, 2));
  play(r, atBubble);
  const decoys = r.records.filter((x) => x.kind === 'decoy');
  assert.equal(decoys.length, 16);
  assert.ok(decoys.every((d) => d.outcome === 'ignored' && d.scoreChange === 0));
  for (const d of decoys) assert.notEqual(d.zone, r.records.find((x) => x.kind === 'bubble' && x.index === d.index)!.zone);
});

test('round 3: drifters move, but never nearer than their radius to the zone edge', () => {
  const r = round(ROUNDS[2]!, roundSeed(5, 3));
  let moved = false;
  play(r, (x) => {
    if (x.bubble) {
      const inner = innerRect(x.bubble.zone, 39);
      const [cx, cy] = x.bubble.centre;
      assert.ok(cx >= inner.x - 1e-6 && cx <= inner.x + inner.w + 1e-6 && cy >= inner.y - 1e-6 && cy <= inner.y + inner.h + 1e-6);
      if (Math.hypot(cx - x.bubble.start[0], cy - x.bubble.start[1]) > 5) moved = true;
    }
    return elsewhere(x);
  });
  assert.ok(moved);
});

test('the pop records the offset of the median gaze over its last 400 ms', () => {
  const r = round();
  play(r, (x) => (x.bubble ? [x.bubble.centre[0] + 10, x.bubble.centre[1] - 20] : null));
  const pops = r.records.filter((x) => x.outcome === 'popped');
  assert.equal(pops.length, 16);
  for (const p of pops) assert.deepEqual(p.offsetPx, [10, -20]);
});

test('zone marks, the hardest zone and the outcome', () => {
  assert.equal(zoneMark(4, 5), 'good');
  assert.equal(zoneMark(3, 5), 'ok');
  assert.equal(zoneMark(2, 5), 'bad');
  assert.equal(zoneMark(0, 0), 'none');
  const rec = (zone: number, outcome: ItemRecord['outcome'], t: number | null = 900): ItemRecord => ({ id: 'x', kind: 'bubble', index: 0, zone, col: zone, row: 0, x: 0, y: 0, onsetMs: 0, offsetMs: 0, outcome, timeToPopMs: outcome === 'popped' ? t : null, scoreChange: 0, streak: 0, offsetPx: null });
  const records = [...Array(5)].map(() => rec(0, 'popped')).concat([...Array(6)].map(() => rec(1, 'popped')), [rec(2, 'popped'), rec(2, 'popped'), rec(2, 'popped'), rec(2, 'missed'), rec(2, 'missed')]);
  const s = summariseRound(records, 3, 1);
  assert.equal(s.popped, 14);
  assert.equal(s.total, 16);
  assert.equal(s.stars, 2);
  assert.equal(s.well, true);
  assert.equal(s.hardest!.zone, 2);
  assert.deepEqual(s.zones.map((z) => z.mark), ['good', 'good', 'ok']);
  const bad = summariseRound([rec(0, 'missed'), rec(0, 'missed'), rec(1, 'missed'), rec(1, 'popped'), rec(1, 'missed'), rec(2, 'popped')], 3, 1);
  assert.equal(bad.well, false);
});

test('the next bubble waits between bubbles while mayStart says no (the Re-aim offer), with the after-effect over', () => {
  const r = round();
  let t = 0;
  while (r.done < 1) {
    r.setGaze(elsewhere(r), t);
    r.tick(t, false);
    t += FRAME;
  }
  let asked = 0;
  for (let k = 0; k < 120; k++, t += FRAME) r.tick(t, false, () => (asked++, false));
  assert.ok(asked > 0);
  assert.equal(r.phase, 'gap');
  assert.equal(r.bubble, null);
  assert.equal(r.after, null);
  const events = r.tick(t, false, () => true);
  assert.equal(events[0]?.kind, 'onset');
  assert.equal(r.phase, 'bubble');
});
