// The challenge's parameters (spec §17.9, design §5.3, §5.5, §5.6, §2.13–§2.15). Every value here
// is heuristic: it is a starting point to be tuned on real phones and webcams (spec §17.12.4),
// not a measured result.

/** The board: the safe rectangle less 4 % of each axis on each side; 16 px between zones. */
export const BOARD = { marginFrac: 0.04, gutterPx: 16 } as const;

/** Bubble diameter: clamp(72 px, 40 % of the zone's short side, 20 % of the screen's short side). */
export const BUBBLE_SIZE = { minPx: 72, zoneFrac: 0.4, screenFrac: 0.2 } as const;

/** Sixteen bubbles a round, at the zone centre ± 10 %; every fifth in the centre zone when there is one. */
export const PLACEMENT = { bubbles: 16, jitterFrac: 0.1, centreEvery: 5 } as const;

/** The leaky dwell: drains at twice the fill rate outside, resets after 300 ms continuously outside. */
export const DWELL = { drainFactor: 2, resetOutsideMs: 300 } as const;

/**
 * A bubble lives 4 s; 500 ms pass between bubbles, during which the 200 ms pop burst or the
 * missed bubble's 400 ms rise of 24 px plays.
 */
export const TIMING = { lifetimeMs: 4000, gapMs: 500, popMs: 200, missMs: 400, missRisePx: 24 } as const;

export type RoundKey = 'pop' | 'spikes' | 'drifters';

export interface RoundDef {
  key: RoundKey;
  /** 1, 2 or 3. */
  number: number;
  dwellMs: number;
  /** Round 2: a spiky decoy in another zone for the bubble's lifetime. */
  decoy: boolean;
  /** Round 3: the bubble drifts within its zone at up to this many degrees a second. */
  driftDegS: number;
}

export const ROUNDS: readonly RoundDef[] = [
  { key: 'pop', number: 1, dwellMs: 1000, decoy: false, driftDegS: 0 },
  { key: 'spikes', number: 2, dwellMs: 800, decoy: true, driftDegS: 0 },
  { key: 'drifters', number: 3, dwellMs: 700, decoy: false, driftDegS: 3 },
];

/** Looking at the decoy for 600 ms bonks it: it shakes for 200 ms and costs 50 points. */
export const DECOY = { bonkMs: 600, shakeMs: 200, penalty: 50 } as const;

/** +100 a pop, plus 50 × (1 − time to pop / lifetime); × 1.5 on every pop after four in a row. */
export const SCORE = { pop: 100, speedBonus: 50, streakAfter: 4, streakFactor: 1.5 } as const;

/** Round stars: 1 at 50 % popped, 2 at 75 %, 3 at 90 % with a median time to pop of 1.6 s or less. */
export const STARS = { one: 0.5, two: 0.75, three: 0.9, threeMedianMs: 1600 } as const;

/** A zone on Round complete: ✓ at 80 % popped or more, ~ from 50 %, ✗ below. */
export const MARKS = { good: 0.8, ok: 0.5 } as const;

/** A round went badly below 50 % popped, or with two zones or more marked ✗. */
export const OUTCOME = { hitRateBelow: 0.5, crossedZones: 2 } as const;

/** Re-aim is offered between bubbles below 50 % over the last six, at most once a round. */
export const REAIM_OFFER = { window: 6, hitRateBelow: 0.5 } as const;

/**
 * The quality check (design §5.6): offsets in at least three zones whose directions agree
 * (resultant length ≥ 0.6) and whose mean exceeds a quarter of a zone give a correction; each
 * pop's offset is the median filtered gaze over its last 400 ms.
 */
export const OFFSET = { minZones: 3, minResultant: 0.6, minZoneFrac: 0.25, windowMs: 400 } as const;

/** A Re-aim offset below 0.5° reads "Your aim was fine"; at or above it, "Aim fixed". */
export const REAIM = { fineDeg: 0.5 } as const;

/** Free look's bar and dock fade after 3 s without input; 10 s in the overlay brings the Re-aim offer. */
export const LOOK = { fadeAfterMs: 3000, overlayOfferMs: 10000 } as const;

/** HUD chips fade within 96 px of a target; the −50 shows for 600 ms; the score counts up over 200 ms. */
export const HUD = { clearancePx: 96, bonkFlashMs: 600, countUpMs: 200 } as const;

/** The Replay of Round complete plays the smoothed gaze trail over the map in 6 s. */
export const REPLAY_MS = 6000;
