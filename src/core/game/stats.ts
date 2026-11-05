// What a round leaves (spec §17.9.3, §17.9.5; design §2.14, §5.5, §5.6): per-zone statistics
// (bubbles, pops, median time to pop, median offset of the gaze from the bubble), the zone marks
// of Round complete (✓ at 80 % popped, ~ from 50 %, ✗ below; heuristic), the stars, whether the
// round went well, and the hardest zone.
import { median } from '../maths/stats.ts';
import type { Vec2 } from '../types.ts';
import { MARKS, OUTCOME } from './params.ts';
import { roundStars } from './stars.ts';

export type ItemOutcome = 'popped' | 'missed' | 'bonked' | 'ignored';

/** One bubble or decoy of a round, as game.csv writes it. */
export interface ItemRecord {
  id: string;
  kind: 'bubble' | 'decoy';
  /** The bubble's number in the round, from 0 (a decoy shares its bubble's). */
  index: number;
  zone: number;
  col: number;
  row: number;
  /** Centre at onset, CSS px. */
  x: number;
  y: number;
  /** Capture-clock times (performance.now()) of onset and offset. */
  onsetMs: number;
  offsetMs: number;
  outcome: ItemOutcome;
  /** Round-clock ms from onset to the pop (pauses excluded); null unless popped. */
  timeToPopMs: number | null;
  scoreChange: number;
  /** Pops in a row after this item. */
  streak: number;
  /** Median filtered gaze over the last 400 ms before the pop, less the bubble's centre, CSS px. */
  offsetPx: Vec2 | null;
}

export type ZoneMark = 'good' | 'ok' | 'bad' | 'none';

export interface ZoneStat {
  zone: number;
  col: number;
  row: number;
  bubbles: number;
  popped: number;
  medianPopMs: number | null;
  offsetPx: Vec2 | null;
  mark: ZoneMark;
}

export interface RoundSummary {
  popped: number;
  total: number;
  hitRate: number;
  medianPopMs: number | null;
  stars: number;
  zones: ZoneStat[];
  /** Went well: 50 % popped or more and fewer than two zones marked ✗. */
  well: boolean;
  allGood: boolean;
  /** The zone with the lowest share popped (then the slowest), or null when every zone is ✓. */
  hardest: ZoneStat | null;
}

export function zoneMark(popped: number, bubbles: number): ZoneMark {
  if (!(bubbles > 0)) return 'none';
  const rate = popped / bubbles;
  return rate >= MARKS.good ? 'good' : rate >= MARKS.ok ? 'ok' : 'bad';
}

function finiteOrNull(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}

export function zoneStats(records: readonly ItemRecord[], cols: number, rows: number): ZoneStat[] {
  const bubbles = records.filter((r) => r.kind === 'bubble');
  const out: ZoneStat[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const zone = row * cols + col;
      const mine = bubbles.filter((b) => b.zone === zone);
      const pops = mine.filter((b) => b.outcome === 'popped');
      const times = pops.map((b) => b.timeToPopMs).filter((v): v is number => v !== null);
      const offsets = pops.map((b) => b.offsetPx).filter((v): v is Vec2 => v !== null);
      out.push({
        zone,
        col,
        row,
        bubbles: mine.length,
        popped: pops.length,
        medianPopMs: finiteOrNull(median(times)),
        offsetPx: offsets.length > 0 ? [median(offsets.map((o) => o[0])), median(offsets.map((o) => o[1]))] : null,
        mark: zoneMark(pops.length, mine.length),
      });
    }
  }
  return out;
}

export function summariseRound(records: readonly ItemRecord[], cols: number, rows: number): RoundSummary {
  const bubbles = records.filter((r) => r.kind === 'bubble');
  const pops = bubbles.filter((b) => b.outcome === 'popped');
  const total = bubbles.length;
  const hitRate = total > 0 ? pops.length / total : 0;
  const medianPopMs = finiteOrNull(median(pops.map((b) => b.timeToPopMs).filter((v): v is number => v !== null)));
  const zones = zoneStats(records, cols, rows);
  const crossed = zones.filter((z) => z.mark === 'bad').length;
  const counted = zones.filter((z) => z.mark !== 'none');
  const allGood = counted.length > 0 && counted.every((z) => z.mark === 'good');
  let hardest: ZoneStat | null = null;
  if (!allGood) {
    for (const z of counted) {
      const rate = z.popped / z.bubbles;
      const best = hardest ? hardest.popped / hardest.bubbles : Number.POSITIVE_INFINITY;
      const slower = hardest !== null && rate === best && (z.medianPopMs ?? Number.POSITIVE_INFINITY) > (hardest.medianPopMs ?? Number.POSITIVE_INFINITY);
      if (rate < best || slower) hardest = z;
    }
  }
  return {
    popped: pops.length,
    total,
    hitRate,
    medianPopMs,
    stars: roundStars(pops.length, total, medianPopMs),
    zones,
    well: hitRate >= OUTCOME.hitRateBelow && crossed < OUTCOME.crossedZones,
    allGood,
    hardest,
  };
}
