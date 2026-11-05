// Seeded placement (spec §17.9.1, design §5.3): never the same zone twice in a row, balanced zones,
// every fifth bubble in the centre zone when both counts are odd, jitter within ±10 %, a decoy in
// another zone, a drift direction in round 3, and the same round from the same seed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ROUNDS } from '../../src/core/game/params.ts';
import { centreZone, planRound, roundSeed, zoneSequence } from '../../src/core/game/placement.ts';
import { mulberry32 } from '../../src/core/maths/rng.ts';

const GRIDS: [number, number][] = [
  [2, 1],
  [1, 2],
  [3, 1],
  [1, 3],
  [2, 2],
  [3, 2],
  [3, 3],
  [4, 3],
  [4, 4],
];

test('the centre zone exists only when both counts are odd', () => {
  assert.equal(centreZone(1, 3), 1);
  assert.equal(centreZone(3, 1), 1);
  assert.equal(centreZone(3, 3), 4);
  assert.equal(centreZone(2, 1), null);
  assert.equal(centreZone(3, 2), null);
  assert.equal(centreZone(1, 1), null);
});

test('never the same zone twice in a row, counts within one, every fifth in the centre', () => {
  for (const [cols, rows] of GRIDS) {
    for (const seed of [1, 7, 42, 9090, 123456]) {
      const seq = zoneSequence(mulberry32(seed), cols, rows, 16);
      assert.equal(seq.length, 16);
      for (let k = 1; k < seq.length; k++) assert.notEqual(seq[k], seq[k - 1], `${cols}×${rows} seed ${seed} at ${k}`);
      const centre = centreZone(cols, rows);
      if (centre !== null) for (const k of [4, 9, 14]) assert.equal(seq[k], centre, `${cols}×${rows} seed ${seed}: bubble ${k + 1}`);
      const counts = new Array(cols * rows).fill(0);
      for (const z of seq) counts[z]++;
      if (centre === null) assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${cols}×${rows} seed ${seed}: ${counts}`);
      else {
        const others = counts.filter((_, z) => z !== centre);
        assert.ok(Math.max(...others) - Math.min(...others) <= 1, `${cols}×${rows} seed ${seed}: ${counts}`);
      }
    }
  }
});

test('two zones alternate; one zone is refused', () => {
  const seq = zoneSequence(mulberry32(5), 2, 1, 16);
  for (let k = 1; k < 16; k++) assert.notEqual(seq[k], seq[k - 1]);
  assert.throws(() => zoneSequence(mulberry32(5), 1, 1, 16), RangeError);
});

test('a round is reproducible from its seed; decoys sit in another zone; drifters have a direction', () => {
  const seed = roundSeed(9090, 2);
  const a = planRound(seed, ROUNDS[1]!, 1, 3);
  const b = planRound(seed, ROUNDS[1]!, 1, 3);
  assert.deepEqual(a, b);
  assert.notDeepEqual(planRound(roundSeed(9090, 3), ROUNDS[1]!, 1, 3), a);
  for (const p of a) {
    assert.ok(p.decoy, 'round 2 has a decoy');
    assert.notEqual(p.decoy!.zone, p.zone);
    for (const j of [...p.jitter, ...p.decoy!.jitter]) assert.ok(Math.abs(j) <= 0.1);
    assert.equal(p.driftAngleRad, null);
  }
  for (const p of planRound(seed, ROUNDS[0]!, 2, 1)) assert.equal(p.decoy, null);
  for (const p of planRound(seed, ROUNDS[2]!, 2, 1)) assert.ok(p.driftAngleRad !== null && p.driftAngleRad >= 0 && p.driftAngleRad < 2 * Math.PI);
});

test('round seeds differ by round and are whole 32-bit numbers', () => {
  const seeds = [1, 2, 3, 4].map((n) => roundSeed(42, n));
  assert.equal(new Set(seeds).size, 4);
  for (const s of seeds) assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
  assert.throws(() => roundSeed(42, 0), RangeError);
});
