// Re-aim, the game's face of the §4.13 drift check (spec §17.8.2, design §2.15): when to offer it
// and how its outcome reads. The check, its decision (apply within max(2°, 1.5 × accuracy), else
// the quick recalibration) and its correction are drift.ts's, unchanged.
import { nextDriftDueMs } from '../calibration/drift.ts';
import { REAIM, REAIM_OFFER } from './params.ts';

/** Offered between bubbles when fewer than half of the last six popped, at most once a round. */
export function reaimOfferDue(outcomes: readonly ('popped' | 'missed')[], offeredThisRound: boolean): boolean {
  if (offeredThisRound || outcomes.length < REAIM_OFFER.window) return false;
  const last = outcomes.slice(-REAIM_OFFER.window);
  return last.filter((o) => o === 'popped').length / last.length < REAIM_OFFER.hitRateBelow;
}

/** The timed offer: `everyMin` minutes (DRIFT.everyMin) after the warm-up or the last check. */
export function timedReaimDue(nowMs: number, sinceMs: number, everyMin: number): boolean {
  return nowMs >= nextDriftDueMs(sinceMs, everyMin);
}

export type ReaimResult = 'fine' | 'fixed' | 'large' | 'no-data';

/**
 * What the player is told: within the limit the correction is applied either way, and the chip
 * says "Your aim was fine" below 0.5° and "Aim fixed" otherwise; beyond it, "Your aim moved a lot".
 */
export function reaimResult(magnitudeDeg: number | null, action: 'apply' | 'recalibrate' | null): ReaimResult {
  if (magnitudeDeg === null || action === null || !Number.isFinite(magnitudeDeg)) return 'no-data';
  if (action === 'recalibrate') return 'large';
  return magnitudeDeg < REAIM.fineDeg ? 'fine' : 'fixed';
}
