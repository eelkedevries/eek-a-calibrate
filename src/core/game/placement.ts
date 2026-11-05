// Where the challenge's bubbles appear (spec §17.9.1, design §5.3), from a seed, so that a round
// is reproducible: one zone per bubble, never the same zone twice in a row, the zones balanced over
// the round (their counts differ by at most one), and every fifth bubble in the centre zone when
// both counts are odd (a drift check); each bubble at its zone centre ± 10 %; in round 2 a decoy
// in another zone; in round 3 a drift direction.
import { mulberry32 } from '../maths/rng.ts';
import type { Vec2 } from '../types.ts';
import { PLACEMENT, type RoundDef } from './params.ts';

export interface Placement {
  zone: number;
  /** Offset from the zone centre as fractions of the zone's width and height, each in ±jitterFrac. */
  jitter: Vec2;
  decoy: { zone: number; jitter: Vec2 } | null;
  /** Round 3: the drift's direction, radians (0 to the right, y down). */
  driftAngleRad: number | null;
}

const GAME_SALT = 0x6a09e667;
const GOLDEN = 0x9e3779b9;

/** The seed of the n-th round played in a session (n from 1): a different stream for each. */
export function roundSeed(sessionSeed: number, n: number): number {
  if (!Number.isInteger(sessionSeed)) throw new RangeError(`roundSeed: the seed must be an integer, got ${sessionSeed}`);
  if (!(Number.isSafeInteger(n) && n >= 1)) throw new RangeError(`roundSeed: n must be a positive integer, got ${n}`);
  return ((sessionSeed ^ GAME_SALT) + Math.imul(n - 1, GOLDEN)) >>> 0;
}

/** The centre zone's index, which exists only when both counts are odd. */
export function centreZone(cols: number, rows: number): number | null {
  return cols % 2 === 1 && rows % 2 === 1 && cols * rows > 1 ? ((rows - 1) / 2) * cols + (cols - 1) / 2 : null;
}

function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))] as T;
}

/**
 * The zone of each of `n` bubbles. Each free slot takes, among the zones allowed there (not the
 * previous one, nor the centre when the next slot is the centre's), one of those shown least so
 * far, at random.
 */
export function zoneSequence(rand: () => number, cols: number, rows: number, n: number = PLACEMENT.bubbles): number[] {
  const zones = cols * rows;
  if (!(Number.isInteger(zones) && zones >= 2)) throw new RangeError(`zoneSequence: the challenge needs at least two zones, got ${cols} × ${rows}`);
  const centre = centreZone(cols, rows);
  const forced = (k: number) => centre !== null && (k + 1) % PLACEMENT.centreEvery === 0;
  const counts = new Array<number>(zones).fill(0);
  if (centre !== null) for (let k = 0; k < n; k++) if (forced(k)) counts[centre] = (counts[centre] ?? 0) + 1;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    if (forced(k)) {
      out.push(centre as number);
      continue;
    }
    const prev = out[k - 1];
    const allowed = [...Array(zones).keys()].filter((z) => z !== prev && !(forced(k + 1) && z === centre));
    const least = Math.min(...allowed.map((z) => counts[z] as number));
    const z = pick(allowed.filter((c) => counts[c] === least), rand);
    counts[z] = (counts[z] as number) + 1;
    out.push(z);
  }
  return out;
}

function jitter(rand: () => number): Vec2 {
  return [(2 * rand() - 1) * PLACEMENT.jitterFrac, (2 * rand() - 1) * PLACEMENT.jitterFrac];
}

/** Every bubble of a round, from its seed. */
export function planRound(seed: number, round: Pick<RoundDef, 'decoy' | 'driftDegS'>, cols: number, rows: number, n: number = PLACEMENT.bubbles): Placement[] {
  const rand = mulberry32(seed);
  const zones = zoneSequence(rand, cols, rows, n);
  return zones.map((zone) => {
    const j = jitter(rand);
    let decoy: Placement['decoy'] = null;
    if (round.decoy) {
      const others = [...Array(cols * rows).keys()].filter((z) => z !== zone);
      decoy = { zone: pick(others, rand), jitter: jitter(rand) };
    }
    const driftAngleRad = round.driftDegS > 0 ? 2 * Math.PI * rand() : null;
    return { zone, jitter: j, decoy, driftAngleRad };
  });
}
